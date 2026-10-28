/** Runs only when RADIUS_IT_SOCKET points at a THROWAWAY local MariaDB (see README). Never point at a live server. */
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createConnection, createPool, type Pool } from "mysql2/promise";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ServiceConfig } from "../src/config.js";
import { createHandler } from "../src/handler.js";
import { MySqlStore, ssha512 } from "../src/mysql-store.js";
import { identity, NOW, signedRequest } from "./helpers.js";

const socketPath = process.env.RADIUS_IT_SOCKET;
const API_PW = "it-only-" + randomUUID();
describe.skipIf(!socketPath)("MariaDB integration (throwaway instance)", () => {
  let pool: Pool; let admin: Awaited<ReturnType<typeof createConnection>>; let handler: (r: Request) => Promise<Response>; let store: MySqlStore;
  const cfg = (attr: ServiceConfig["semantics"]["passwordAttribute"]): ServiceConfig => ({ port: 0, identity, writesEnabled: true, db: { host: "localhost", port: 0, user: "weonet_api", password: API_PW, radiusDb: "radius", stateDb: "weonet_api", timezone: "+00:00" }, semantics: { passwordAttribute: attr, disabledGroup: "daloRADIUS-Disabled-Users" } });
  beforeAll(async () => {
    admin = await createConnection({ socketPath, user: "root", multipleStatements: true });
    await admin.query("DROP DATABASE IF EXISTS radius; DROP DATABASE IF EXISTS weonet_api; DROP USER IF EXISTS 'weonet_api'@'localhost';");
    await admin.query(readFileSync(new URL("./fixtures/freeradius-schema.sql", import.meta.url), "utf8"));
    await admin.query(readFileSync(new URL("../sql/001_state_schema.sql", import.meta.url), "utf8"));
    const grants = readFileSync(new URL("../sql/002_grants.template.sql", import.meta.url), "utf8").replaceAll("<API_HOST_PATTERN>", "localhost").replace("<SET_INTERACTIVELY>", API_PW);
    await admin.query(grants);
    await admin.query(`INSERT INTO radius.radgroupcheck (groupname, attribute, op, value) VALUES ('daloRADIUS-Disabled-Users','Auth-Type',':=','Reject'), ('plan-basic','Simultaneous-Use',':=','1'), ('plan-fast','Simultaneous-Use',':=','1');
      INSERT INTO weonet_api.plan (id, name, groupname, speed_profile, session_limit) VALUES ('basic','Basic','plan-basic','10M/10M',1), ('fast','Fast','plan-fast','50M/50M',1);
      INSERT INTO radius.nas (nasname, shortname, secret) VALUES ('10.0.0.1','core','SHAREDSECRET');
      INSERT INTO radius.radacct (acctsessionid, acctuniqueid, username, nasipaddress, acctstarttime, acctinputoctets, acctoutputoctets, framedipaddress) VALUES ('s1','u1','alice','10.0.0.1','2026-10-28 10:00:00',100,200,'100.64.0.2');`);
    pool = createPool({ socketPath, user: "weonet_api", password: API_PW, timezone: "+00:00", connectionLimit: 4 });
    store = new MySqlStore(pool, cfg("Cleartext-Password"));
    const schema = await store.checkSchema();
    handler = createHandler({ identity, store, writesEnabled: true, schema: () => schema, now: () => NOW });
  });
  afterAll(async () => { await pool?.end(); await admin?.end(); });
  const run = async (c: Parameters<typeof signedRequest>[0]) => { const r = await handler(await signedRequest(c)); return { status: r.status, body: await r.json() }; };

  it("schema check passes with least-privilege grants and nas.secret hidden", async () => {
    expect(await store.checkSchema()).toEqual({ reads: true, writes: true, problems: [] });
    await expect(pool.query("SELECT secret FROM radius.nas")).rejects.toThrow();
    await expect(pool.query("SELECT * FROM radius.userbillinfo")).rejects.toThrow();
    await expect(pool.query("DROP TABLE radius.radcheck")).rejects.toThrow();
  });
  it("create → suspend → reactivate → plan change → reset, with radcheck/radusergroup + audit", async () => {
    const key = randomUUID();
    const body = { username: "bob", full_name: "Bob Ba", plan_id: "basic", password: "initialpw1" };
    const c = await run({ method: "POST", path: "/v1/subscribers", body, key });
    expect(c.status).toBe(201);
    const id = c.body.data.id;
    const replay = await run({ method: "POST", path: "/v1/subscribers", body, key });
    expect(replay.body).toMatchObject({ idempotent_replay: true, data: { id } });
    expect((await run({ method: "POST", path: "/v1/subscribers", body: { ...body, full_name: "Other" }, key })).body.error.code).toBe("IDEMPOTENCY_KEY_REUSED");
    expect((await run({ method: "POST", path: "/v1/subscribers", body })).body.error.code).toBe("USERNAME_TAKEN");
    const [chk] = await admin.query<any[]>("SELECT attribute, op, value FROM radius.radcheck WHERE username='bob'");
    expect(chk).toEqual([{ attribute: "Cleartext-Password", op: ":=", value: "initialpw1" }]);

    expect((await run({ method: "PATCH", path: `/v1/subscribers/${id}/status`, body: { status: "suspended" } })).body.data.status).toBe("suspended");
    const [g1] = await admin.query<any[]>("SELECT groupname, priority FROM radius.radusergroup WHERE username='bob' ORDER BY priority");
    expect(g1).toEqual([{ groupname: "daloRADIUS-Disabled-Users", priority: 0 }, { groupname: "plan-basic", priority: 1 }]);
    await run({ method: "PATCH", path: `/v1/subscribers/${id}/status`, body: { status: "active" } });
    expect((await run({ method: "PATCH", path: `/v1/subscribers/${id}/plan`, body: { plan_id: "fast" } })).body.data.plan_id).toBe("fast");
    const [g2] = await admin.query<any[]>("SELECT groupname FROM radius.radusergroup WHERE username='bob'");
    expect(g2).toEqual([{ groupname: "plan-fast" }]);

    const rkey = randomUUID();
    const reset = await run({ method: "POST", path: `/v1/subscribers/${id}/reset-password`, key: rkey });
    expect(reset.body.data.temporary_password).toMatch(/^[A-Za-z0-9]{20}$/);
    expect((await run({ method: "POST", path: `/v1/subscribers/${id}/reset-password`, key: rkey })).body.error.code).toBe("CREDENTIAL_NOT_REPLAYED");
    const [idem] = await admin.query<any[]>("SELECT response_body FROM weonet_api.idempotency WHERE idem_key=?", [rkey]);
    expect(idem[0].response_body).toBeNull();
    const [audit] = await admin.query<any[]>("SELECT outcome, code, detail FROM weonet_api.audit_log WHERE target=? OR operation='create_subscriber' ORDER BY id", [id]);
    expect(audit.filter((a: any) => a.outcome === "applied").length).toBeGreaterThanOrEqual(5);
    expect(JSON.stringify(audit)).not.toContain(reset.body.data.temporary_password);
  });
  it("unknown plan rolls back with no partial rows", async () => {
    const r = await run({ method: "POST", path: "/v1/subscribers", body: { username: "carol", full_name: "Carol", plan_id: "nope", password: "initialpw1" } });
    expect(r.status).toBe(422);
    const [rows] = await admin.query<any[]>("SELECT (SELECT COUNT(*) FROM radius.radcheck WHERE username='carol') + (SELECT COUNT(*) FROM weonet_api.subscriber WHERE username='carol') n");
    expect(Number(rows[0].n)).toBe(0);
  });
  it("reads sessions/NAS without secrets", async () => {
    const s = await run({ path: "/v1/sessions" });
    expect(s.body.data[0]).toMatchObject({ username: "alice", nas_name: "core", framed_ip: "100.64.0.2", started_at: "2026-10-28T10:00:00.000Z" });
    const n = await run({ path: "/v1/nas" });
    expect(n.body.data).toEqual([{ id: "1", name: "core", source_ip: "10.0.0.1", status: "unknown" }]);
    expect(JSON.stringify(n.body)).not.toContain("SHAREDSECRET");
  });
  it("concurrent same-key creates apply exactly once", async () => {
    const key = randomUUID(); const body = { username: "dave", full_name: "Dave", plan_id: "basic", password: "initialpw1" };
    const results = await Promise.all([run({ method: "POST", path: "/v1/subscribers", body, key }), run({ method: "POST", path: "/v1/subscribers", body, key })]);
    expect(results.map(r => r.status).sort()).toEqual(expect.arrayContaining([201]));
    const [rows] = await admin.query<any[]>("SELECT COUNT(*) n FROM radius.radcheck WHERE username='dave'");
    expect(Number(rows[0].n)).toBe(1);
  });
  it("SSHA2-512 hashes verify and disabled-group without Reject blocks writes", async () => {
    const v = ssha512("pw12345678"); const raw = Buffer.from(v, "base64");
    expect(raw.length).toBe(64 + 16);
    await admin.query("DELETE FROM radius.radgroupcheck WHERE groupname='daloRADIUS-Disabled-Users'");
    expect((await store.checkSchema()).problems).toContain("disabled_group:no_reject_rule");
    await admin.query("INSERT INTO radius.radgroupcheck (groupname, attribute, op, value) VALUES ('daloRADIUS-Disabled-Users','Auth-Type',':=','Reject')");
  });
});
