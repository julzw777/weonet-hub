import { describe, expect, it, vi } from "vitest";
import { executeDraft, requestHeaders, validateDraftRequest, validateResponse, type DraftDependencies, type DraftRequest } from "./contract";
import { mockResponse, resolveBase } from "./lib";

const key = "f526f954-6c55-46e7-a6a7-b94a924abf3c";
const requestId = "b3105b02-58f2-4f11-b753-6f3086f4771c";
const sub = { id: "sub-1", username: "staging.user", full_name: "Staging", plan_id: "plan-1", status: "active", created_at: "2026-10-26T17:47:00Z", expires_at: null };
const request: DraftRequest = { op: { op: "reset_password", id: "sub-1" }, requestId, idempotencyKey: key };
function dependencies(): DraftDependencies {
  return { base: "https://provisioning.invalid", confirmed: true, authorize: vi.fn().mockResolvedValue("Bearer header.payload.signature"), audit: vi.fn().mockResolvedValue(undefined), send: vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: { temporary_password: "temporary-123", token: "MUST-NOT-LEAK", nested: { shared_secret: "hidden" } }, debug: "hidden" }), { status: 200 })) };
}
describe("proposed RADIUS provisioning safety", () => {
  it.each([undefined, ""])("unconfigured base fails closed, without sending or credential data (%s)", async base => {
    const deps = { ...dependencies(), base }; const result = await executeDraft(request, deps);
    expect(result.status).toBe(503); expect(result.body).not.toHaveProperty("data"); expect(deps.send).not.toHaveBeenCalled();
    expect(deps.audit).toHaveBeenCalledWith(expect.objectContaining({ outcome: "unconfigured" }));
  });
  it("missing service credential fails closed", async () => {
    const deps = dependencies(); deps.authorize = vi.fn().mockRejectedValue(new Error("unconfigured"));
    expect((await executeDraft(request, deps)).status).toBe(503); expect(deps.send).not.toHaveBeenCalled();
  });
  it("unconfirmed contract never sends even with credentials", async () => {
    const deps = { ...dependencies(), confirmed: false }; expect((await executeDraft(request, deps)).status).toBe(503); expect(deps.send).not.toHaveBeenCalled();
  });
  it.each([
    { op: "create_subscriber", username: "staging.user", full_name: "Staging", plan_id: "plan-1", password: "password123" },
    { op: "set_status", id: "sub-1", status: "suspended" },
    { op: "reset_password", id: "sub-1" },
  ] as const)("fixtures never allow write $op", op => {
    const value = mockResponse(op, () => "unused"); expect(value.status).toBe(503); expect(value.body).not.toHaveProperty("data");
  });
  it("requires idempotency UUID and rejects actor injection / path injection", () => {
    expect(validateDraftRequest(request.op, requestId)).toBeNull();
    expect(validateDraftRequest({ ...request.op, actor: "admin" }, requestId, key)).toBeNull();
    expect(validateDraftRequest({ op: "reset_password", id: "../other" }, requestId, key)).toBeNull();
    expect(validateDraftRequest(request.op, requestId, key)?.idempotencyKey).toBe(key);
    expect(validateDraftRequest({ op: "toString" }, requestId, key)).toBeNull();
    expect(validateDraftRequest({ op: "create_subscriber", username: "staging.user", full_name: "Staging", plan_id: "plan-1", password: "bad\npassword" }, requestId, key)).toBeNull();
  });
  it("sends correlation and Idempotency-Key unchanged", async () => {
    const deps = dependencies(); await executeDraft(request, deps);
    expect(deps.send).toHaveBeenCalledWith("https://provisioning.invalid/v1/subscribers/sub-1/reset-password", expect.objectContaining({ headers: expect.objectContaining({ "Idempotency-Key": key, "X-Request-ID": requestId }), redirect: "error" }));
    expect(requestHeaders({ op: { op: "list_plans" }, requestId }, "Bearer x")).not.toHaveProperty("Idempotency-Key");
  });
  it("whitelists ONLY temporary_password and strips top-level and nested extras", async () => {
    const deps = dependencies(); const result = await executeDraft(request, deps);
    expect(result.status).toBe(200); expect(result.body.data).toEqual({ temporary_password: "temporary-123" });
    expect(JSON.stringify(result)).not.toContain("MUST-NOT-LEAK"); expect(JSON.stringify(vi.mocked(deps.audit).mock.calls)).not.toContain("temporary-123");
  });
  it("rejects missing, wrong-type or control-character credentials", () => {
    for (const data of [{}, { temporary_password: 123 }, { temporary_password: "bad\npassword" }]) expect(() => validateResponse(request.op, { data })).toThrow();
  });
  it("requires valid paginated subscriber fields and UTC timestamps", () => {
    const op = { op: "list_subscribers" } as const;
    expect(validateResponse(op, { data: [{ ...sub, shared_secret: "hidden" }], page: { next_cursor: null, limit: 50 } }).data).toEqual([sub]);
    expect(() => validateResponse(op, { data: [sub] })).toThrow();
    expect(() => validateResponse(op, { data: [{ ...sub, created_at: "2026-10-26 17:47" }], page: { next_cursor: null, limit: 50 } })).toThrow();
  });
  it("rejects mismatched mutation resource/status", () => {
    expect(() => validateResponse({ op: "set_status", id: "sub-1", status: "suspended" }, { data: sub })).toThrow();
  });
  it("blocks upstream mutation when intent audit fails", async () => {
    const deps = dependencies(); deps.audit = vi.fn().mockRejectedValue(new Error("DB unavailable"));
    const result = await executeDraft(request, deps); expect(result.status).toBe(503); expect(deps.send).not.toHaveBeenCalled(); expect(result.body).not.toHaveProperty("data");
  });
  it("surfaces partial upstream success on completion audit failure WITHOUT credentials", async () => {
    const deps = dependencies(); deps.audit = vi.fn().mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error("DB unavailable"));
    const result = await executeDraft(request, deps); expect(result.status).toBe(503); expect(result.body).not.toHaveProperty("data");
    expect(result.body.error).toMatchObject({ code: "AUDIT_RECONCILIATION_REQUIRED", outcome: "upstream_succeeded_hub_audit_failed", request_id: requestId });
    expect(deps.send).toHaveBeenCalledTimes(1);
  });
  it("timeout leaves unknown outcome and never automatically retries", async () => {
    const deps = dependencies(); deps.send = vi.fn().mockRejectedValue(new Error("password=DO-NOT-LEAK"));
    const result = await executeDraft(request, deps); expect(result.status).toBe(502); expect(deps.send).toHaveBeenCalledTimes(1); expect(JSON.stringify(result)).not.toContain("DO-NOT-LEAK");
    expect(deps.audit).toHaveBeenLastCalledWith(expect.objectContaining({ outcome: "unknown" }));
  });
  it("redacts upstream failures and surfaces failure-audit outages", async () => {
    const deps = dependencies(); deps.send = vi.fn().mockResolvedValue(new Response(JSON.stringify({ password: "DO-NOT-LEAK" }), { status: 409 }));
    const result = await executeDraft(request, deps); expect(result.status).toBe(409); expect(JSON.stringify(result)).not.toContain("DO-NOT-LEAK");
    deps.audit = vi.fn().mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error("failed"));
    expect((await executeDraft(request, deps)).status).toBe(503);
  });
  it("rejects oversized credential response with no success", async () => {
    const deps = dependencies(); deps.send = vi.fn().mockResolvedValue(new Response("x".repeat(262145)));
    const result = await executeDraft(request, deps); expect(result.status).toBe(502); expect(result.body).not.toHaveProperty("data");
  });
  it("refuses non-443, URL fragment and non-TLS bases", () => {
    expect(resolveBase("https://provisioning.invalid:8443")).toBeNull(); expect(resolveBase("https://provisioning.invalid/#x")).toBeNull(); expect(resolveBase("http://provisioning.invalid")).toBeNull();
  });
});