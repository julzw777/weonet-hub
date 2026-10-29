/** Injected storage fault tests: no sockets, DB servers or live calls. */
import { randomUUID } from "node:crypto";
import type { Pool } from "mysql2/promise";
import { describe, expect, it, vi } from "vitest";
import type { ServiceConfig } from "../src/config.js";
import { MySqlStore } from "../src/mysql-store.js";
import { AuditUnavailableError, OutcomeUnknownError, type MutationMeta } from "../src/store.js";
import { identity } from "./helpers.js";

const cfg: ServiceConfig = { port: 8080, identity, writesEnabled: true, db: { host: "unused", port: 3306, user: "api", password: "fixture-only", radiusDb: "radius", stateDb: "weonet_api", timezone: "+00:00" }, semantics: { passwordAttribute: "Cleartext-Password", disabledGroup: "disabled" } };
const meta: MutationMeta = { operation: "reset_password", target: randomUUID(), actorId: randomUUID(), actorRoles: ["admin"], serviceSubject: "hub", requestId: randomUUID(), idempotencyKey: randomUUID(), requestHash: "a".repeat(64) };
const input = { op: "reset_password" as const, id: meta.target ?? "" };

function fixture(mode: "replay" | "reused" | "credential" | "duplicate" | "db_error" | "commit_unknown" | "intent_failure") {
  let audits = 0;
  const execute = vi.fn(async (sql: string) => {
    if (sql.includes("FROM `weonet_api`.idempotency")) {
      if (mode === "duplicate") throw Object.assign(new Error("private DB detail"), { code: "ER_DUP_ENTRY" });
      if (mode === "db_error") throw new Error("private DB detail");
      if (mode === "commit_unknown") return [[], []];
      return [[{ actor_id: mode === "reused" ? randomUUID() : meta.actorId, operation: meta.operation, request_hash: meta.requestHash, response_status: 200, response_body: '{"data":{"safe":true}}', credential_issued: mode === "credential" ? 1 : 0 }], []];
    }
    if (sql.includes("FROM `weonet_api`.subscriber")) return [[{ id: input.id, username: "alice" }], []];
    if (sql.startsWith("UPDATE `radius`.radcheck")) return [{ affectedRows: 1 }, []];
    return [[], []];
  });
  const conn = { execute, beginTransaction: vi.fn(async () => undefined), rollback: vi.fn(async () => undefined), commit: vi.fn(async () => { throw new Error("uncertain commit"); }), release: vi.fn() };
  const pool = {
    execute: vi.fn(async () => { audits += 1; if (audits > 1 || mode === "intent_failure") throw new Error("private audit secret"); return [[], []]; }),
    getConnection: vi.fn(async () => conn),
  };
  return { store: new MySqlStore(pool as unknown as Pool, cfg), pool, conn };
}

describe("checked mutation completion audit", () => {
  it.each(["replay", "reused", "credential", "duplicate", "db_error"] as const)("%s cannot return an ordinary result when audit fails", async mode => {
    const { store, conn } = fixture(mode);
    await expect(store.mutate(meta, input)).rejects.toBeInstanceOf(AuditUnavailableError);
    expect(conn.release).toHaveBeenCalledOnce();
    expect(conn.commit).not.toHaveBeenCalled();
  });
  it("preserves unknown commit outcome even when recovery audit also fails", async () => {
    const { store, conn } = fixture("commit_unknown");
    await expect(store.mutate(meta, input)).rejects.toBeInstanceOf(OutcomeUnknownError);
    expect(conn.commit).toHaveBeenCalledOnce();
    expect(conn.release).toHaveBeenCalledOnce();
  });
  it("failed intent audit prevents acquiring a business connection", async () => {
    const { store, pool } = fixture("intent_failure");
    await expect(store.mutate(meta, input)).rejects.toBeInstanceOf(AuditUnavailableError);
    expect(pool.getConnection).not.toHaveBeenCalled();
  });
});