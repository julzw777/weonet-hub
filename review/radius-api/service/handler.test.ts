import { describe, expect, it, vi } from "vitest";
import { createService, type Dependencies, type VerifiedIdentity } from "./handler";
import { configurationSchema } from "./config";
import { matchRoute, operations, projectResponse, validateInput, type Operation } from "./schemas";

const requestId = "b3105b02-58f2-4f11-b753-6f3086f4771c";
const key = "f526f954-6c55-46e7-a6a7-b94a924abf3c";
// Deliberately synthetic, never discovered from environment or live infrastructure.
const config = { contractApproved: true, identity: { issuer: "https://issuer.invalid", audience: "review-only", algorithm: "ES256", keySourceReference: "test-only", serviceSubject: "review-hub", delegationAndReplayPolicyApproved: true }, tlsTerminationApproved: true, schemaAndEnginesApproved: true, leastPrivilegeGrantsApproved: true, passwordAndDisableSemanticsApproved: true, planMappingApproved: true, stableIdsAndNasSourceApproved: true, durableIdempotencyAuditRecoveryApproved: true };
const identity: VerifiedIdentity = { serviceSubject: "review-hub", actorId: requestId, roles: ["admin"], scopes: ["radius:read", "radius:write"] };
function deps(): Dependencies {
  return { configuration: config, verifySignedIdentity: vi.fn().mockResolvedValue(identity), repositories: { countRows: vi.fn(), inspectUsernames: vi.fn() }, log: vi.fn() };
}
function req(path = "/v1/subscribers", method = "GET", body?: unknown, extra: Record<string, string> = {}) {
  return new Request("https://local-review.invalid" + path, { method, headers: { Authorization: "Bearer header.payload.signature", "X-Request-ID": requestId, "Idempotency-Key": key, ...(body === undefined ? {} : { "Content-Type": "application/json" }), ...extra }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}
const subscriber = { id: "sub-1", username: "review.user", full_name: "Review User", plan_id: "plan-1", status: "active", created_at: "2026-10-27T00:00:00Z", expires_at: null };
const nas = { id: "nas-1", name: "Review NAS", source_ip: "192.0.2.1", status: "online" };
const traffic = { id: "session-1", username: "review.user", nas_name: "Review NAS", started_at: "2026-10-27T00:00:00Z", input_octets: 1, output_octets: 2 };
const samples: Record<Operation, unknown> = {
  list_subscribers: subscriber, get_subscriber: subscriber, create_subscriber: subscriber, set_status: subscriber, set_plan: subscriber,
  reset_password: { temporary_password: "review-only-password" },
  list_plans: { id: "plan-1", name: "Review", speed_profile: "owner-pending", session_limit: 1, expiry_days: 30 },
  list_sessions: { ...traffic, framed_ip: "2001:db8::1" },
  list_accounting: { ...traffic, stopped_at: null, duration_s: 1, terminate_cause: null }, list_nas: nas, get_nas: nas,
};
describe("offline review service gates", () => {
  it.each([undefined, {}, { ...config, identity: undefined }, { ...config, passwordAndDisableSemanticsApproved: false }, { ...config, RADIUS_API_TOKEN: "secret" }])("absent/incomplete/extra configuration fails closed (%j)", async configuration => {
    const d = { ...deps(), configuration };
    const response = await createService(d)(req());
    expect(response.status).toBe(503); expect((await response.json()).error.code).toBe("UNCONFIGURED");
    expect(d.verifySignedIdentity).not.toHaveBeenCalled(); expect(d.repositories?.countRows).not.toHaveBeenCalled(); expect(d.repositories?.inspectUsernames).not.toHaveBeenCalled();
  });
  it("every explicit confirmation is required", () => {
    for (const field of Object.keys(config)) {
      const missing = { ...config } as Record<string, unknown>; delete missing[field];
      expect(configurationSchema.safeParse(missing).success).toBe(false);
    }
    for (const field of Object.keys(config.identity)) {
      const missing = { ...config.identity } as Record<string, unknown>; delete missing[field];
      expect(configurationSchema.safeParse({ ...config, identity: missing }).success).toBe(false);
    }
  });
  it("configuration without a verifier cannot authorize or become ready", async () => {
    const service = createService({ configuration: config });
    expect((await service(req())).status).toBe(503);
    expect((await service(req("/ready"))).status).toBe(503);
  });
  it.each(["", "Bearer static-token", "Basic credentials"])("rejects missing/static credentials (%s)", async authorization => {
    const d = deps(); expect((await createService(d)(req(undefined, "GET", undefined, { Authorization: authorization }))).status).toBe(401);
    expect(d.verifySignedIdentity).not.toHaveBeenCalled(); expect(d.repositories?.countRows).not.toHaveBeenCalled();
  });
  it("verification failures and exception contents never escape", async () => {
    const d = deps(); d.verifySignedIdentity = vi.fn().mockRejectedValue(new Error("mysql://password=DO_NOT_LEAK"));
    const response = await createService(d)(req()); expect(response.status).toBe(401);
    expect(await response.text()).not.toContain("DO_NOT_LEAK"); expect(JSON.stringify(vi.mocked(d.log ?? vi.fn()).mock.calls)).not.toContain("DO_NOT_LEAK");
  });
  it.each([
    { ...identity, roles: ["care"] }, { ...identity, scopes: ["radius:read"] },
  ])("role/scope intersection independently denies writes", async result => {
    const d = deps(); d.verifySignedIdentity = vi.fn().mockResolvedValue(result);
    expect((await createService(d)(req("/v1/subscribers/sub-1/status", "PATCH", { status: "suspended" }))).status).toBe(403);
    expect(d.repositories?.countRows).not.toHaveBeenCalled();
  });
  it.each([{ ...identity, serviceSubject: "other-service" }, { ...identity, actorId: "forged" }, { ...identity, roles: ["finance"] }])("rejects wrong service or malformed signed delegation", async result => {
    const d = deps(); d.verifySignedIdentity = vi.fn().mockResolvedValue(result);
    expect((await createService(d)(req())).status).toBe(401);
  });
  const routes: [string, string, unknown?][] = [
    ["/v1/subscribers", "GET"], ["/v1/subscribers/sub-1", "GET"],
    ["/v1/subscribers", "POST", { username: "review.user", full_name: "Review User", plan_id: "plan-1", password: "review-only-password" }],
    ["/v1/subscribers/sub-1/status", "PATCH", { status: "active" }], ["/v1/subscribers/sub-1/plan", "PATCH", { plan_id: "plan-1" }],
    ["/v1/subscribers/sub-1/reset-password", "POST"], ["/v1/plans", "GET"], ["/v1/sessions", "GET"], ["/v1/accounting", "GET"], ["/v1/nas", "GET"], ["/v1/nas/nas-1", "GET"],
  ];
  it.each(routes)("never enables %s %s, even with test identity/config", async (path, method, body) => {
    const d = deps(); const service = createService(d);
    for (let attempt = 0; attempt < 2; attempt++) {
      const response = await service(req(path, method, body)); expect(response.status).toBe(503);
      const value = await response.json(); expect(value.error).toMatchObject({ code: "OPERATION_DISABLED", outcome: "not_applied", retryable: false }); expect(value).not.toHaveProperty("data");
    }
    expect(d.repositories?.countRows).not.toHaveBeenCalled(); expect(d.repositories?.inspectUsernames).not.toHaveBeenCalled();
    const logs = JSON.stringify(vi.mocked(d.log ?? vi.fn()).mock.calls);
    expect(logs).not.toMatch(/review-only-password|header.payload.signature|review.user|actorId|mysql/);
  });
  it("passes actual request binding only to the injected verifier", async () => {
    const d = deps(); await createService(d)(req("/v1/subscribers/sub-1/status", "PATCH", { status: "active" }));
    expect(d.verifySignedIdentity).toHaveBeenCalledWith(expect.objectContaining({ method: "PATCH", pathAndQuery: "/v1/subscribers/sub-1/status", requestId, idempotencyKey: key, bodyBytes: new TextEncoder().encode('{"status":"active"}') }), config.identity);
  });
  it("process liveness works without dependencies while readiness stays false with all config", async () => {
    const d = deps();
    for (const service of [createService(), createService(d)]) {
      const health = await service(req("/health")); expect(health.status).toBe(200); expect(await health.json()).toEqual({ data: { status: "ok", version: "1" } });
      const ready = await service(req("/ready")); expect(ready.status).toBe(503); expect((await ready.json()).error.code).toBe("NOT_READY");
      expect(ready.headers.get("Cache-Control")).toBe("no-store");
    }
    expect(d.verifySignedIdentity).not.toHaveBeenCalled(); expect(d.repositories?.countRows).not.toHaveBeenCalled();
  });
});
describe("strict schemas and bounded input", () => {
  it.each([
    ["/v1/subscribers?limit=101", "GET"], ["/v1/subscribers?limit=1&limit=2", "GET"], ["/v1/subscribers?table=radcheck", "GET"],
    ["/v1/subscribers/%2Fother", "GET"], ["/v1/nas/nas-1/status", "PATCH", { status: "online" }],
    ["/v1/subscribers", "POST", { username: "review.user", full_name: "Review", plan_id: "plan-1", password: "12345678", actor: "admin" }],
    ["/v1/subscribers/sub-1/status", "PATCH", { status: "active", attribute: "Auth-Type" }],
    ["/v1/subscribers", "POST", { username: "review.user", full_name: "Review", plan_id: "plan-1", password: "bad\npassword" }],
    ["/v1/sessions?from=2026-10-28T00:00:00Z&to=2026-10-27T00:00:00Z", "GET"],
    ["/v1/accounting?from=2026-02-30T00:00:00Z", "GET"],
  ] as [string, string, unknown?][])("rejects invalid %s without verifier/database", async (path, method, body) => {
    const d = deps(); expect((await createService(d)(req(path, method, body))).status).toBe(400);
    expect(d.verifySignedIdentity).not.toHaveBeenCalled(); expect(d.repositories?.countRows).not.toHaveBeenCalled();
  });
  it("requires mutation UUID idempotency keys", async () => {
    expect((await createService(deps())(req("/v1/subscribers/sub-1/reset-password", "POST", undefined, { "Idempotency-Key": "" }))).status).toBe(400);
  });
  it("bounds request bytes, rejects malformed JSON/content type and reset bodies", async () => {
    const service = createService(deps());
    expect((await service(req("/v1/subscribers", "POST", { text: "x".repeat(16384) }))).status).toBe(400);
    expect((await service(req("/v1/subscribers/sub-1/reset-password", "POST", {}))).status).toBe(400);
    expect((await service(req("/v1/subscribers/sub-1/status", "PATCH", { status: "active" }, { "Content-Type": "text/plain" }))).status).toBe(400);
    const malformed = req("/v1/subscribers/sub-1/status", "PATCH");
    expect((await service(new Request(malformed, { body: "{" }))).status).toBe(400);
  });
  it("accepts bounded pagination and safe range schemas locally only", () => {
    const route = matchRoute("GET", "/v1/accounting"); if (!route) throw new Error("Missing proposed route");
    expect(() => validateInput(route, new URLSearchParams("limit=100&state=closed&from=2026-10-01T00:00:00Z&to=2026-11-01T00:00:00Z"), undefined)).not.toThrow();
  });
});
describe("response allowlists (validation only; no service success)", () => {
  it.each(operations)("projects only proposed fields for %s", op => {
    const data = { ...(samples[op] as object), password: "HIDDEN", shared_secret: "HIDDEN", creditcard: { token: "HIDDEN" } };
    const input = { data: op.startsWith("list_") ? [data] : data, page: { limit: 50, next_cursor: null, secret: "HIDDEN" }, debug: "HIDDEN" };
    expect(JSON.stringify(projectResponse(op, input))).not.toContain("HIDDEN");
  });
  it.each([
    ["list_plans", { ...samples.list_plans as object, session_limit: 101 }],
    ["list_plans", { ...samples.list_plans as object, expiry_days: 3651 }],
    ["list_sessions", { ...samples.list_sessions as object, framed_ip: "::::" }],
    ["list_sessions", { ...samples.list_sessions as object, input_octets: Number.MAX_SAFE_INTEGER + 1 }],
    ["list_accounting", { ...samples.list_accounting as object, started_at: "2026-02-30T00:00:00Z" }],
    ["list_nas", { ...nas, status: "unknown" }],
  ] as [Operation, unknown][])("rejects unsafe proposed %s output", (op, data) => {
    expect(() => projectResponse(op, { data: [data], page: { limit: 50, next_cursor: null } })).toThrow();
  });
  it("rejects oversized pages, cursor and wrong reset credential types", () => {
    expect(() => projectResponse("list_nas", { data: Array(101).fill(nas), page: { limit: 100, next_cursor: null } })).toThrow();
    expect(() => projectResponse("list_nas", { data: [nas, nas], page: { limit: 1, next_cursor: null } })).toThrow();
    expect(() => projectResponse("list_nas", { data: [], page: { limit: 50, next_cursor: "x".repeat(513) } })).toThrow();
    expect(() => projectResponse("reset_password", { data: { temporary_password: 123 } })).toThrow();
  });
});