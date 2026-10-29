/** MariaDB/MySQL Store. Parameterized queries only; identifiers come solely from validated config. */
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { isIP } from "node:net";
import type { Pool, PoolConnection, RowDataPacket, ResultSetHeader } from "mysql2/promise";
import type { ServiceConfig } from "./config.js";
import type { ListQuery } from "./schemas.js";
import { AuditUnavailableError, OutcomeUnknownError, type MutationInput, type MutationMeta, type MutationResult, type Page, type SchemaReport, type Store } from "./store.js";

type Rows = RowDataPacket[];
const iso = (d: Date | null) => (d ? d.toISOString() : null);
const like = (s: string) => `%${s.replace(/[\\%_]/g, c => "\\" + c)}%`;
class Rejected extends Error { constructor(readonly status: 404 | 409 | 422, readonly code: string) { super(code); } }

const REQUIRED_READ: Record<string, string[]> = {
  radacct: ["radacctid", "username", "nasipaddress", "acctstarttime", "acctstoptime", "acctsessiontime", "acctinputoctets", "acctoutputoctets", "acctterminatecause", "framedipaddress"],
  nas: ["id", "nasname", "shortname"],
};
const REQUIRED_WRITE: Record<string, string[]> = {
  radcheck: ["id", "username", "attribute", "op", "value"],
  radusergroup: ["username", "groupname", "priority"],
  radgroupcheck: ["groupname", "attribute", "op", "value"],
  radgroupreply: ["groupname", "attribute", "op", "value"],
};
const STATE_TABLES = ["subscriber", "plan", "idempotency", "audit_log", "token_jti"];

/** FreeRADIUS SSHA2-512-Password: base64(SHA-512(password || salt) || salt). */
export function ssha512(password: string, salt = randomBytes(16)) {
  return Buffer.concat([createHash("sha512").update(password).update(salt).digest(), salt]).toString("base64");
}
/** 20 chars from an unambiguous alphabet, rejection-sampled (no modulo bias). */
export function generatePassword() {
  const alphabet = "abcdefghjkmnpqrstuvwxyzACDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  while (out.length < 20) for (const b of randomBytes(32)) if (b < 216 && out.length < 20) out += alphabet[b % 54];
  return out;
}

export class MySqlStore implements Store {
  private r: string; private s: string;
  constructor(private pool: Pool, private cfg: ServiceConfig) {
    this.r = `\`${cfg.db.radiusDb}\``; this.s = `\`${cfg.db.stateDb}\``;
  }

  async checkSchema(): Promise<SchemaReport> {
    const problems: string[] = [];
    const [cols] = await this.pool.query<Rows>("SELECT TABLE_SCHEMA t_schema, TABLE_NAME t, COLUMN_NAME c FROM information_schema.COLUMNS WHERE TABLE_SCHEMA IN (?, ?)", [this.cfg.db.radiusDb, this.cfg.db.stateDb]);
    const has = (schema: string, t: string, c?: string) => cols.some(x => x.t_schema === schema && x.t === t && (!c || x.c === c));
    const need = (spec: Record<string, string[]>) => Object.entries(spec).every(([t, cs]) => cs.every(c => has(this.cfg.db.radiusDb, t, c) || (problems.push(`missing:${t}.${c}`), false)));
    if (has(this.cfg.db.radiusDb, "nas", "secret")) problems.push("nas.secret_readable");
    const readsOk = need(REQUIRED_READ) && STATE_TABLES.every(t => has(this.cfg.db.stateDb, t) || (problems.push(`missing:state.${t}`), false));
    let writesOk = need(REQUIRED_WRITE);
    const [engines] = await this.pool.query<Rows>("SELECT TABLE_SCHEMA t_schema, TABLE_NAME t, ENGINE e FROM information_schema.TABLES WHERE TABLE_SCHEMA IN (?, ?)", [this.cfg.db.radiusDb, this.cfg.db.stateDb]);
    for (const e of engines) if (["radcheck", "radusergroup", ...STATE_TABLES].includes(e.t) && e.e !== "InnoDB") { writesOk = false; problems.push(`engine:${e.t}`); }
    const [grants] = await this.pool.query<Rows>("SHOW GRANTS FOR CURRENT_USER()");
    for (const g of grants) {
      const line = String(Object.values(g)[0]).toUpperCase();
      if (/ALL PRIVILEGES|SUPER|WITH GRANT OPTION|\bFILE\b|CREATE USER/.test(line) || (/ ON \*\.\* /.test(line) && !/^GRANT USAGE ON \*\.\*/.test(line))) { writesOk = false; problems.push("grants:excessive"); }
    }
    if (writesOk) {
      const [rej] = await this.pool.query<Rows>(`SELECT 1 FROM ${this.r}.radgroupcheck WHERE groupname = ? AND attribute = 'Auth-Type' AND op = ':=' AND value = 'Reject' LIMIT 1`, [this.cfg.semantics.disabledGroup]);
      if (!rej.length) { writesOk = false; problems.push("disabled_group:no_reject_rule"); }
      const [plans] = await this.pool.query<Rows>(`SELECT p.id FROM ${this.s}.plan p WHERE p.enabled = 1 AND (p.groupname = ? OR NOT EXISTS (SELECT 1 FROM ${this.r}.radgroupcheck c WHERE c.groupname = p.groupname) AND NOT EXISTS (SELECT 1 FROM ${this.r}.radgroupreply y WHERE y.groupname = p.groupname))`, [this.cfg.semantics.disabledGroup]);
      if (plans.length) { writesOk = false; problems.push(`plans_unmapped:${plans.length}`); }
    }
    return { reads: readsOk, writes: readsOk && writesOk, problems };
  }

  async consumeJti(jti: string, expiresAt: Date) {
    await this.pool.query(`DELETE FROM ${this.s}.token_jti WHERE expires_at < UTC_TIMESTAMP(3) - INTERVAL 1 HOUR LIMIT 500`).catch(() => undefined);
    try { await this.pool.execute(`INSERT INTO ${this.s}.token_jti (jti, expires_at) VALUES (?, ?)`, [jti, expiresAt]); return true; }
    catch (e) { if ((e as { code?: string }).code === "ER_DUP_ENTRY") return false; throw e; }
  }

  private async audit(conn: Pool | PoolConnection, m: MutationMeta, outcome: string, code: string, detail: string | null = null) {
    await conn.execute(`INSERT INTO ${this.s}.audit_log (at, service_subject, actor_id, actor_roles, operation, target, request_id, idempotency_key, outcome, code, detail) VALUES (UTC_TIMESTAMP(3), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [m.serviceSubject, m.actorId, m.actorRoles.join(",").slice(0, 64), m.operation, m.target, m.requestId, m.idempotencyKey, outcome, code, detail]);
  }
  async auditOnly(m: MutationMeta, outcome: string, code: string) {
    try { await this.audit(this.pool, m, outcome, code); } catch { throw new AuditUnavailableError(); }
  }

  async mutate(m: MutationMeta, input: MutationInput): Promise<MutationResult> {
    try { await this.audit(this.pool, m, "started", "INTENT"); } catch { throw new AuditUnavailableError(); }
    const conn = await this.pool.getConnection();
    let committed = false;
    try {
      await conn.beginTransaction();
      const [prior] = await conn.execute<Rows>(`SELECT actor_id, operation, request_hash, response_status, response_body, credential_issued FROM ${this.s}.idempotency WHERE idem_key = ? FOR UPDATE`, [m.idempotencyKey]);
      if (prior.length) {
        await conn.rollback();
        const p = prior[0];
        const code = p.actor_id !== m.actorId || p.operation !== m.operation || p.request_hash !== m.requestHash ? "IDEMPOTENCY_KEY_REUSED" : p.credential_issued ? "CREDENTIAL_NOT_REPLAYED" : null;
        await this.auditOnly(m, code ? "rejected" : "applied", code ?? "IDEMPOTENT_REPLAY");
        return code ? { kind: "rejected", status: 409, code } : { kind: "replay", status: p.response_status, body: JSON.parse(p.response_body) };
      }
      const { status, body, credential } = await this.apply(conn, input);
      await conn.execute(`INSERT INTO ${this.s}.idempotency (idem_key, actor_id, operation, request_hash, response_status, response_body, credential_issued, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP(3))`,
        [m.idempotencyKey, m.actorId, m.operation, m.requestHash, status, credential ? null : JSON.stringify(body), credential ? 1 : 0]);
      await this.audit(conn, m, "applied", "OK");
      try { await conn.commit(); committed = true; } catch { throw new OutcomeUnknownError(); }
      return { kind: "applied", status, body };
    } catch (e) {
      if (!committed && !(e instanceof OutcomeUnknownError)) await conn.rollback().catch(() => undefined);
      if (e instanceof AuditUnavailableError) throw e;
      if (e instanceof Rejected) {
        try { await this.audit(this.pool, m, "rejected", e.code); } catch { throw new AuditUnavailableError(); }
        return { kind: "rejected", status: e.status, code: e.code };
      }
      // Duplicate idempotency key inserted concurrently: the other request won; report conflict, not success.
      if ((e as { code?: string }).code === "ER_DUP_ENTRY") {
        await this.auditOnly(m, "rejected", "CONCURRENT_REQUEST");
        return { kind: "rejected", status: 409, code: "CONCURRENT_REQUEST" };
      }
      try {
        await this.auditOnly(m, e instanceof OutcomeUnknownError ? "unknown" : "failed", e instanceof OutcomeUnknownError ? "COMMIT_UNCONFIRMED" : "DB_ERROR");
      } catch {
        // A failed completion audit must not hide an uncertain commit outcome.
        if (e instanceof OutcomeUnknownError) throw e;
        throw new AuditUnavailableError();
      }
      if (e instanceof OutcomeUnknownError) throw e;
      throw new Error("mutation failed");
    } finally { conn.release(); }
  }

  private async lockSubscriber(conn: PoolConnection, id: string) {
    const [rows] = await conn.execute<Rows>(`SELECT id, username, full_name, plan_id, status, created_at, expires_at FROM ${this.s}.subscriber WHERE id = ? FOR UPDATE`, [id]);
    if (!rows.length) throw new Rejected(404, "SUBSCRIBER_NOT_FOUND");
    return rows[0];
  }
  private async plan(conn: PoolConnection, planId: string) {
    const [rows] = await conn.execute<Rows>(`SELECT id, groupname, expiry_days FROM ${this.s}.plan WHERE id = ? AND enabled = 1 LOCK IN SHARE MODE`, [planId]);
    if (!rows.length) throw new Rejected(422, "PLAN_NOT_FOUND");
    // Expiry enforcement (FreeRADIUS Expiration attribute / timezone) is not implemented; refuse rather than mislead.
    if (rows[0].expiry_days > 0) throw new Rejected(422, "PLAN_EXPIRY_UNSUPPORTED");
    return rows[0] as { id: string; groupname: string };
  }
  private passwordValue(pw: string) { return this.cfg.semantics.passwordAttribute === "Cleartext-Password" ? pw : ssha512(pw); }
  private out(row: RowDataPacket) {
    return { id: row.id, username: row.username, full_name: row.full_name, plan_id: row.plan_id, status: row.status, created_at: iso(row.created_at), expires_at: iso(row.expires_at) };
  }

  private async apply(conn: PoolConnection, input: MutationInput): Promise<{ status: number; body: unknown; credential?: boolean }> {
    const attr = this.cfg.semantics.passwordAttribute;
    switch (input.op) {
      case "create_subscriber": {
        const b = input.body;
        const plan = await this.plan(conn, b.plan_id);
        for (const table of [`${this.s}.subscriber`, `${this.r}.radcheck`, `${this.r}.radusergroup`]) {
          const [taken] = await conn.execute<Rows>(`SELECT 1 FROM ${table} WHERE username = ? LIMIT 1 FOR UPDATE`, [b.username]);
          if (taken.length) throw new Rejected(409, "USERNAME_TAKEN");
        }
        const id = randomUUID();
        await conn.execute(`INSERT INTO ${this.s}.subscriber (id, username, full_name, plan_id, status, created_at, updated_at, expires_at) VALUES (?, ?, ?, ?, 'active', UTC_TIMESTAMP(3), UTC_TIMESTAMP(3), NULL)`, [id, b.username, b.full_name, plan.id]);
        await conn.execute(`INSERT INTO ${this.r}.radcheck (username, attribute, op, value) VALUES (?, ?, ':=', ?)`, [b.username, attr, this.passwordValue(b.password)]);
        await conn.execute(`INSERT INTO ${this.r}.radusergroup (username, groupname, priority) VALUES (?, ?, 1)`, [b.username, plan.groupname]);
        return { status: 201, body: { data: this.out(await this.lockSubscriber(conn, id)) } };
      }
      case "set_status": {
        const sub = await this.lockSubscriber(conn, input.id);
        if (sub.status !== input.status) {
          if (input.status === "suspended") await conn.execute(`INSERT INTO ${this.r}.radusergroup (username, groupname, priority) VALUES (?, ?, 0)`, [sub.username, this.cfg.semantics.disabledGroup]);
          else await conn.execute(`DELETE FROM ${this.r}.radusergroup WHERE username = ? AND groupname = ?`, [sub.username, this.cfg.semantics.disabledGroup]);
          await conn.execute(`UPDATE ${this.s}.subscriber SET status = ?, updated_at = UTC_TIMESTAMP(3) WHERE id = ?`, [input.status, sub.id]);
        }
        return { status: 200, body: { data: this.out(await this.lockSubscriber(conn, sub.id)) } };
      }
      case "set_plan": {
        const sub = await this.lockSubscriber(conn, input.id);
        const next = await this.plan(conn, input.planId);
        if (sub.plan_id !== next.id) {
          const [cur] = await conn.execute<Rows>(`SELECT groupname FROM ${this.s}.plan WHERE id = ?`, [sub.plan_id]);
          if (!cur.length) throw new Rejected(409, "CURRENT_PLAN_UNMAPPED");
          const [del] = await conn.execute<ResultSetHeader>(`DELETE FROM ${this.r}.radusergroup WHERE username = ? AND groupname = ?`, [sub.username, cur[0].groupname]);
          if (del.affectedRows !== 1) throw new Rejected(409, "GROUP_MEMBERSHIP_INCONSISTENT");
          await conn.execute(`INSERT INTO ${this.r}.radusergroup (username, groupname, priority) VALUES (?, ?, 1)`, [sub.username, next.groupname]);
          await conn.execute(`UPDATE ${this.s}.subscriber SET plan_id = ?, updated_at = UTC_TIMESTAMP(3) WHERE id = ?`, [next.id, sub.id]);
        }
        return { status: 200, body: { data: this.out(await this.lockSubscriber(conn, sub.id)) } };
      }
      case "reset_password": {
        const sub = await this.lockSubscriber(conn, input.id);
        const pw = generatePassword();
        const [res] = await conn.execute<ResultSetHeader>(`UPDATE ${this.r}.radcheck SET value = ? WHERE username = ? AND attribute = ? AND op = ':='`, [this.passwordValue(pw), sub.username, attr]);
        if (res.affectedRows !== 1) throw new Rejected(409, "CREDENTIAL_ROW_INCONSISTENT");
        return { status: 200, body: { data: { temporary_password: pw } }, credential: true };
      }
    }
  }

  async getSubscriber(id: string) {
    const [rows] = await this.pool.execute<Rows>(`SELECT id, username, full_name, plan_id, status, created_at, expires_at FROM ${this.s}.subscriber WHERE id = ?`, [id]);
    return rows.length ? this.out(rows[0]) : null;
  }
  async listSubscribers(q: ListQuery<"list_subscribers">, limit: number): Promise<Page<unknown>> {
    const where = ["seq > ?"]; const args: unknown[] = [q.cursor ?? "0"];
    if (q.search) { where.push("(username LIKE ? OR full_name LIKE ?)"); args.push(like(q.search), like(q.search)); }
    if (q.status) { where.push("status = ?"); args.push(q.status); }
    if (q.plan_id) { where.push("plan_id = ?"); args.push(q.plan_id); }
    const [rows] = await this.pool.query<Rows>(`SELECT seq, id, username, full_name, plan_id, status, created_at, expires_at FROM ${this.s}.subscriber WHERE ${where.join(" AND ")} ORDER BY seq LIMIT ?`, [...args, limit + 1]);
    return this.page(rows, limit, r => String(r.seq), r => this.out(r));
  }
  async listPlans(q: ListQuery<"list_plans">, limit: number) {
    const [rows] = await this.pool.query<Rows>(`SELECT seq, id, name, speed_profile, session_limit, expiry_days FROM ${this.s}.plan WHERE enabled = 1 AND seq > ? ORDER BY seq LIMIT ?`, [q.cursor ?? "0", limit + 1]);
    return this.page(rows, limit, r => String(r.seq), r => ({ id: r.id, name: r.name, speed_profile: r.speed_profile, session_limit: r.session_limit, expiry_days: r.expiry_days }));
  }
  private async acct(q: ListQuery<"list_accounting">, limit: number, openOnly: boolean) {
    const where = ["a.acctstarttime IS NOT NULL", "a.username REGEXP '^[a-z0-9._@-]{3,64}$'"]; const args: unknown[] = [];
    if (q.cursor) { where.push("a.radacctid < ?"); args.push(q.cursor); }
    if (openOnly || q.state === "open") where.push("a.acctstoptime IS NULL");
    if (q.state === "closed") where.push("a.acctstoptime IS NOT NULL");
    if (q.username) { where.push("a.username = ?"); args.push(q.username); }
    if (q.from) { where.push("a.acctstarttime >= ?"); args.push(new Date(q.from)); }
    if (q.to) { where.push("a.acctstarttime < ?"); args.push(new Date(q.to)); }
    const [rows] = await this.pool.query<Rows>(`SELECT a.radacctid, a.username, a.nasipaddress, n.shortname, a.acctstarttime, a.acctstoptime, a.acctsessiontime, a.acctinputoctets, a.acctoutputoctets, a.acctterminatecause, a.framedipaddress FROM ${this.r}.radacct a LEFT JOIN ${this.r}.nas n ON n.nasname = a.nasipaddress WHERE ${where.join(" AND ")} ORDER BY a.radacctid DESC LIMIT ?`, [...args, limit + 1]);
    return rows;
  }
  private traffic(r: RowDataPacket) {
    return { id: String(r.radacctid), username: r.username, nas_name: (r.shortname || r.nasipaddress || "unknown").slice(0, 120), started_at: iso(r.acctstarttime), input_octets: Number(r.acctinputoctets ?? 0), output_octets: Number(r.acctoutputoctets ?? 0) };
  }
  async listSessions(q: ListQuery<"list_sessions">, limit: number) {
    return this.page(await this.acct(q, limit, true), limit, r => String(r.radacctid), r => ({ ...this.traffic(r), framed_ip: isIP(r.framedipaddress) ? r.framedipaddress : null }));
  }
  async listAccounting(q: ListQuery<"list_accounting">, limit: number) {
    return this.page(await this.acct(q, limit, false), limit, r => String(r.radacctid), r => ({ ...this.traffic(r), stopped_at: iso(r.acctstoptime), duration_s: Number(r.acctsessiontime ?? 0), terminate_cause: r.acctterminatecause ? String(r.acctterminatecause).slice(0, 120) : null }));
  }
  private nasOut(r: RowDataPacket) { return { id: String(r.id), name: String(r.shortname || r.nasname).slice(0, 120), source_ip: r.nasname, status: "unknown" as const }; }
  async listNas(q: ListQuery<"list_nas">, limit: number) {
    // Never select nas.secret (also blocked by the column-level grant).
    const [rows] = await this.pool.query<Rows>(`SELECT id, nasname, shortname FROM ${this.r}.nas WHERE id > ? ORDER BY id LIMIT ?`, [q.cursor ?? "0", limit + 1]);
    const page = this.page(rows, limit, r => String(r.id), r => this.nasOut(r));
    return { data: (page.data as { source_ip: string }[]).filter(n => isIP(n.source_ip) !== 0), next_cursor: page.next_cursor };
  }
  async getNas(id: string) {
    if (!/^\d{1,10}$/.test(id)) return null;
    const [rows] = await this.pool.execute<Rows>(`SELECT id, nasname, shortname FROM ${this.r}.nas WHERE id = ?`, [id]);
    return rows.length && isIP(rows[0].nasname) ? this.nasOut(rows[0]) : null;
  }
  private page(rows: Rows, limit: number, key: (r: RowDataPacket) => string, map: (r: RowDataPacket) => unknown): Page<unknown> {
    const more = rows.length > limit; const slice = rows.slice(0, limit);
    return { data: slice.map(map), next_cursor: more ? key(slice[slice.length - 1]) : null };
  }
}
