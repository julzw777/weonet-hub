import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { createHandler, type Dependencies } from "../src/handler.js";
import { AuditUnavailableError, OutcomeUnknownError, type Store } from "../src/store.js";
import { identity, NOW, signedRequest, ACTOR } from "./helpers.js";

const sub = { id: randomUUID(), username: "alice", full_name: "Alice", plan_id: "basic", status: "active", created_at: "2026-10-01T00:00:00.000Z", expires_at: null };
function fakeStore(over: Partial<Store> = {}): Store & { calls: string[] } {
  const seen = new Set<string>(); const calls: string[] = [];
  return {
    calls,
    checkSchema: async () => ({ reads: true, writes: true, problems: [] }),
    consumeJti: async j => { calls.push("jti"); if (seen.has(j)) return false; seen.add(j); return true; },
    auditOnly: async (_m, outcome, code) => { calls.push(`audit:${outcome}:${code}`); },
    mutate: async (m, i) => { calls.push(`mutate:${i.op}:${m.actorId}`); return i.op === "reset_password" ? { kind: "applied", status: 200, body: { data: { temporary_password: "abcdefghjk23", leaked: "x" } } } : { kind: "applied", status: i.op === "create_subscriber" ? 201 : 200, body: { data: { ...sub, password_hash: "SECRET" } } }; },
    getSubscriber: async () => ({ ...sub, extra: 1 }),
    listSubscribers: async () => ({ data: [{ ...sub, radcheck_value: "SECRET" }], next_cursor: null }),
    listPlans: async () => ({ data: [], next_cursor: null }),
    listSessions: async () => ({ data: [], next_cursor: null }),
    listAccounting: async () => ({ data: [], next_cursor: null }),
    listNas: async () => ({ data: [{ id: "1", name: "core", source_ip: "10.0.0.1", status: "unknown", secret: "SHARED" }], next_cursor: null }),
    getNas: async () => null,
    ...over,
  };
}
const deps = (over: Partial<Dependencies> = {}): Dependencies => ({ identity, store: fakeStore(), writesEnabled: true, schema: () => ({ reads: true, writes: true, problems: [] }), now: () => NOW, ...over });
const call = async (d: Dependencies, r: Request) => { const res = await createHandler(d)(r); return { status: res.status, body: await res.json() }; };

describe("liveness / readiness", () => {
  it("health is generic", async () => expect((await call(deps({ identity: null, store: null }), new Request("http://x/health"))).status).toBe(200));
  it("not ready without config, ready with reads/writes flags", async () => {
    expect((await call(deps({ identity: null }), new Request("http://x/ready"))).status).toBe(503);
    const r = await call(deps({ writesEnabled: false }), new Request("http://x/ready"));
    expect(r.body.data).toEqual({ status: "ready", version: "1", reads: true, writes: false });
  });
  it("unconfigured protected route never touches the store", async () => {
    const store = fakeStore();
    expect((await call(deps({ identity: null, store }), await signedRequest({ path: "/v1/subscribers" }))).status).toBe(503);
    expect(store.calls).toEqual([]);
  });
  it("write-enabled readiness fails closed when the write schema is unavailable", async () => {
    const d = deps({ schema: () => ({ reads: true, writes: false, problems: ["private-detail"] }) });
    const result = await call(d, new Request("http://x/ready"));
    expect(result.status).toBe(503);
    expect(result.body.error.code).toBe("NOT_READY");
    expect(JSON.stringify(result.body)).not.toContain("private-detail");
  });
  it("read-only readiness remains available with a read-safe schema", async () => {
    const result = await call(deps({ writesEnabled: false, schema: () => ({ reads: true, writes: false, problems: [] }) }), new Request("http://x/ready"));
    expect(result.status).toBe(200);
    expect(result.body.data.writes).toBe(false);
  });
  it("readiness fails when schema checks have not completed", async () => {
    expect((await call(deps({ schema: () => null }), new Request("http://x/ready"))).status).toBe(503);
  });
});

describe("service authentication", () => {
  it("accepts a valid signed token and strips non-allowlisted fields", async () => {
    const r = await call(deps(), await signedRequest({ path: "/v1/subscribers" }));
    expect(r.status).toBe(200);
    expect(JSON.stringify(r.body)).not.toContain("SECRET");
  });
  it.each([
    ["static bearer", { tamper: () => "Bearer static-token" }],
    ["bad signature", { tamper: (t: string) => t.slice(0, -4) + "AAAA" }],
    ["alg none", { tamper: (t: string) => { const [, p] = t.slice(7).split("."); return `Bearer ${Buffer.from('{"alg":"none"}').toString("base64url")}.${p}.`; } }],
    ["expired", { nowS: NOW - 1000 }],
    ["wrong subject", { subject: "someone-else" }],
    ["path not bound", { signPath: "/v1/plans" }],
    ["body not bound", { method: "PATCH", path: `/v1/subscribers/${sub.id}/status`, body: { status: "suspended" }, signBody: '{"status":"active"}' }],
  ])("rejects %s", async (_n, c) => {
    const store = fakeStore();
    const r = await call(deps({ store }), await signedRequest({ path: "/v1/subscribers", ...c } as never));
    expect(r.status).toBe(401);
    expect(store.calls.filter(x => x.startsWith("mutate"))).toEqual([]);
  });
  it("rejects jti replay", async () => {
    const d = deps(); const jti = randomUUID();
    expect((await call(d, await signedRequest({ path: "/v1/plans", jti }))).status).toBe(200);
    expect((await call(d, await signedRequest({ path: "/v1/plans", jti }))).body.error.code).toBe("TOKEN_REPLAYED");
  });
});

describe("authorization", () => {
  it("care may read but not write; denied write is audited", async () => {
    const store = fakeStore();
    expect((await call(deps({ store }), await signedRequest({ path: "/v1/sessions", roles: ["care"] }))).status).toBe(200);
    const w = await call(deps({ store }), await signedRequest({ method: "POST", path: `/v1/subscribers/${sub.id}/reset-password`, roles: ["care"] }));
    expect(w.status).toBe(403);
    expect(store.calls).toContain("audit:denied:FORBIDDEN");
    expect(store.calls.some(c => c.startsWith("mutate"))).toBe(false);
  });
  it("finance/readonly roles have no RADIUS access", async () =>
    expect((await call(deps(), await signedRequest({ path: "/v1/nas", roles: ["finance"] }))).status).toBe(403));
  it("read-scoped token cannot write", async () =>
    expect((await call(deps(), await signedRequest({ method: "POST", path: `/v1/subscribers/${sub.id}/reset-password`, write: false }))).status).toBe(403));
  it("writes disabled by config returns 503 not_applied", async () => {
    const r = await call(deps({ writesEnabled: false }), await signedRequest({ method: "PATCH", path: `/v1/subscribers/${sub.id}/status`, body: { status: "suspended" } }));
    expect(r.status).toBe(503); expect(r.body.error).toMatchObject({ code: "WRITES_DISABLED", outcome: "not_applied" });
  });
  it.each(["admin", "noc", "care"])("%s with read scope may read", async role => {
    expect((await call(deps(), await signedRequest({ path: "/v1/plans", roles: [role], write: false }))).status).toBe(200);
  });
  it.each(["finance", "tech", "warehouse", "readonly"])("%s cannot mutate", async role => {
    const store = fakeStore();
    const result = await call(deps({ store }), await signedRequest({ method: "POST", path: `/v1/subscribers/${sub.id}/reset-password`, roles: [role] }));
    expect(result.status).toBe(403);
    expect(store.calls).toContain("audit:denied:FORBIDDEN");
    expect(store.calls.some(c => c.startsWith("mutate"))).toBe(false);
  });
  it("denial audit failure reports unavailable, never an ordinary denial or credential", async () => {
    const result = await call(deps({ store: fakeStore({ auditOnly: async () => { throw new AuditUnavailableError(); } }) }), await signedRequest({ method: "POST", path: `/v1/subscribers/${sub.id}/reset-password`, roles: ["care"] }));
    expect(result.status).toBe(503);
    expect(result.body.error).toMatchObject({ code: "AUDIT_UNAVAILABLE", outcome: "not_applied" });
    expect(result.body.data).toBeUndefined();
  });
});

describe("validation and mutations", () => {
  it("requires idempotency key on writes", async () =>
    expect((await call(deps(), await signedRequest({ method: "POST", path: `/v1/subscribers/${sub.id}/reset-password`, key: null }))).status).toBe(400));
  it.each([
    { username: "Bad User", full_name: "x", plan_id: "basic", password: "longenough" },
    { username: "bob", full_name: "Bob", plan_id: "basic", password: "longenough", attribute: "Auth-Type" },
    { username: "bob", full_name: "Bob", plan_id: "basic; DROP TABLE radcheck", password: "longenough" },
  ])("rejects invalid create body %#", async body =>
    expect((await call(deps(), await signedRequest({ method: "POST", path: "/v1/subscribers", body }))).status).toBe(400));
  it("rejects unknown query keys", async () =>
    expect((await call(deps(), await signedRequest({ path: "/v1/subscribers?table=radcheck" }))).status).toBe(400));
  it("passes verified actor to the store and returns 201", async () => {
    const store = fakeStore();
    const r = await call(deps({ store }), await signedRequest({ method: "POST", path: "/v1/subscribers", body: { username: "bob", full_name: "Bob", plan_id: "basic", password: "longenough" } }));
    expect(r.status).toBe(201); expect(store.calls).toContain(`mutate:create_subscriber:${ACTOR}`);
    expect(JSON.stringify(r.body)).not.toContain("SECRET");
  });
  it("reset response only contains the temporary password", async () => {
    const r = await call(deps(), await signedRequest({ method: "POST", path: `/v1/subscribers/${sub.id}/reset-password` }));
    expect(r.body).toEqual({ data: { temporary_password: "abcdefghjk23" } });
  });
  it("audit unavailable is 503 not_applied; commit uncertainty is 500 unknown", async () => {
    const a = await call(deps({ store: fakeStore({ mutate: async () => { throw new AuditUnavailableError(); } }) }), await signedRequest({ method: "POST", path: `/v1/subscribers/${sub.id}/reset-password` }));
    expect(a.status).toBe(503); expect(a.body.error.outcome).toBe("not_applied");
    const u = await call(deps({ store: fakeStore({ mutate: async () => { throw new OutcomeUnknownError(); } }) }), await signedRequest({ method: "POST", path: `/v1/subscribers/${sub.id}/reset-password` }));
    expect(u.status).toBe(500); expect(u.body.error.outcome).toBe("unknown");
  });
  it("logs never contain tokens, bodies or credentials", async () => {
    const log = vi.fn();
    await call(deps({ log, store: fakeStore({ mutate: async () => ({ kind: "rejected", status: 409, code: "USERNAME_TAKEN" }) }) }), await signedRequest({ method: "POST", path: "/v1/subscribers", body: { username: "bob", full_name: "Bob", plan_id: "basic", password: "supersecretpw" } }));
    const text = JSON.stringify(log.mock.calls);
    expect(text).toContain("USERNAME_TAKEN");
    expect(text).not.toMatch(/supersecretpw|Bearer|eyJ/);
  });
});
