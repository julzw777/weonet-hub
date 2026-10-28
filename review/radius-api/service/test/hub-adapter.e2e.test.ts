/** Hub staged adapter (contract.ts + signer.ts) talking to the real service handler in-process. No network. */
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { executeDraft, validateDraftRequest, type AuditEvent } from "../../contract";
import { isWrite, toRequest } from "../../lib";
import { signServiceToken } from "../../signer";
import { createHandler } from "../src/handler.js";
import type { Store } from "../src/store.js";
import { ACTOR, identity, privatePem } from "./helpers.js";

const sub = { id: randomUUID(), username: "alice", full_name: "Alice", plan_id: "basic", status: "suspended", created_at: "2026-10-01T00:00:00.000Z", expires_at: null };
const store = { checkSchema: async () => ({ reads: true, writes: true, problems: [] }), consumeJti: async () => true, auditOnly: async () => {}, mutate: async () => ({ kind: "applied", status: 200, body: { data: sub } }),
  listNas: async () => ({ data: [{ id: "1", name: "core", source_ip: "10.0.0.1", status: "unknown" }], next_cursor: null }) } as unknown as Store;
const api = createHandler({ identity, store, writesEnabled: true, schema: () => ({ reads: true, writes: true, problems: [] }) });

async function run(body: unknown, roles = ["noc"], key?: string, signingKey = privatePem) {
  const audits: AuditEvent[] = [];
  const draft = validateDraftRequest(body, randomUUID(), key)!;
  const result = await executeDraft(draft, {
    base: "https://radius-api.example.test", confirmed: true,
    authorize: async d => { const u = toRequest(d.op); return signServiceToken({ privateKeyPem: signingKey, issuer: identity.issuer, audience: identity.audience, subject: identity.serviceSubject, actorId: ACTOR, roles, write: isWrite(d.op.op), method: u.method, pathAndQuery: u.path, body: u.body ? JSON.stringify(u.body) : "", requestId: d.requestId, idempotencyKey: isWrite(d.op.op) ? d.idempotencyKey ?? null : null }); },
    audit: async e => { audits.push(e); },
    send: (url, init) => api(new Request(url.replace("https://radius-api.example.test", "http://internal"), init)),
  });
  return { result, audits };
}
describe("Hub adapter ↔ API", () => {
  it("signed write succeeds with requested+succeeded Hub audit", async () => {
    const { result, audits } = await run({ op: "set_status", id: sub.id, status: "suspended" }, ["noc"], randomUUID());
    expect(result.status).toBe(200);
    expect(audits.map(a => a.outcome)).toEqual(["requested", "succeeded"]);
  });
  it("read of NAS returns unknown status, no secret", async () => {
    const { result } = await run({ op: "list_nas" });
    expect(result.body.data).toEqual([{ id: "1", name: "core", source_ip: "10.0.0.1", status: "unknown" }]);
  });
  it("token signed with a foreign key is rejected and never reported as success", async () => {
    const { generateKeyPairSync } = await import("node:crypto");
    const other = generateKeyPairSync("ec", { namedCurve: "P-256" }).privateKey.export({ type: "pkcs8", format: "pem" }).toString();
    const { result, audits } = await run({ op: "set_status", id: sub.id, status: "suspended" }, ["noc"], randomUUID(), other);
    expect(result.status).toBe(401);
    expect(audits.map(a => a.outcome)).toEqual(["requested", "failed"]);
  });
});
