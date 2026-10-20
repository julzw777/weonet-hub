import { describe, expect, it, vi } from "vitest";
import { ACTIONS, canControlRouters, healthCheck, redact, resolveEndpoint, validateRequest, withRetry } from "./lib";

const id = "0b6e7c1a-1111-4222-8333-444455556666";
const env = (m: Record<string, string>) => (k: string) => m[k];
const full = { ROUTER_CORE_URL: "https://10.0.0.1:8443", ROUTER_CORE_USERNAME: "api-ro", ROUTER_CORE_PASSWORD: "s3cretPass" };

describe("roles", () => {
  it("allows only NOC and Admin", () => {
    expect(canControlRouters(["noc"])).toBe(true);
    expect(canControlRouters(["admin"])).toBe(true);
    for (const r of ["tech", "finance", "care", "warehouse", "readonly"]) expect(canControlRouters([r])).toBe(false);
  });
});
describe("request allow-list", () => {
  it("accepts health check and defaults to dry run", () => expect(validateRequest({ action: "health_check", device_id: id, idempotency_key: "abcdefgh-1" })).toEqual({ ok: true, value: { action: "health_check", device_id: id, idempotency_key: "abcdefgh-1", dry_run: true } }));
  it("rejects unknown commands", () => expect(validateRequest({ action: "/system/reboot", device_id: id, idempotency_key: "abcdefgh" }).ok).toBe(false));
  it("rejects caller-supplied hosts", () => expect(validateRequest({ action: "health_check", device_id: id, idempotency_key: "abcdefgh", host: "http://169.254.169.254" }).ok).toBe(false));
  it("rejects non-uuid devices", () => expect(validateRequest({ action: "health_check", device_id: "1; drop", idempotency_key: "abcdefgh" }).ok).toBe(false));
  it("keeps impactful commands disabled", () => { expect(ACTIONS.disconnect_subscriber.enabled).toBe(false); expect(ACTIONS.apply_profile.enabled).toBe(false); });
});
describe("endpoint resolution", () => {
  it("reports missing secrets as unconfigured", () => { const r = resolveEndpoint("CORE", env({})); expect(r.configured).toBe(false); });
  it("requires https", () => expect(resolveEndpoint("CORE", env({ ...full, ROUTER_CORE_URL: "http://10.0.0.1" })).configured).toBe(false));
  it("rejects paths or embedded credentials", () => { expect(resolveEndpoint("CORE", env({ ...full, ROUTER_CORE_URL: "https://h/rest/x" })).configured).toBe(false); expect(resolveEndpoint("CORE", env({ ...full, ROUTER_CORE_URL: "https://u:p@h" })).configured).toBe(false); });
  it("rejects malformed references", () => expect(resolveEndpoint("../X", env(full)).configured).toBe(false));
  it("resolves a fully configured device", () => expect(resolveEndpoint("CORE", env(full))).toEqual({ configured: true, endpoint: { url: "https://10.0.0.1:8443", username: "api-ro", password: "s3cretPass" } }));
});
describe("redaction", () => {
  it("removes passwords and auth headers", () => { const t = redact("fail s3cretPass Basic YWJjOmRlZg==", ["s3cretPass"]); expect(t).not.toContain("s3cretPass"); expect(t).not.toContain("YWJj"); });
});
describe("timeouts and retries", () => {
  it("times out and stops after the attempt limit", async () => {
    const fn = vi.fn((signal: AbortSignal) => new Promise((_, rej) => signal.addEventListener("abort", () => rej(new Error("aborted")))));
    await expect(withRetry(fn, { attempts: 2, timeoutMs: 20, backoffMs: 1 })).rejects.toThrow("Timed out after 20 ms");
    expect(fn).toHaveBeenCalledTimes(2);
  });
  it("does not retry auth failures", async () => {
    const f = vi.fn(async () => ({ ok: false, status: 401, json: async () => ({}) }));
    await expect(healthCheck({ url: "https://h", username: "u", password: "p" }, f, { attempts: 3, timeoutMs: 100, backoffMs: 1 })).rejects.toThrow("HTTP 401");
    expect(f).toHaveBeenCalledTimes(1);
  });
  it("only reads the system resource path", async () => {
    const f = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ version: "7.15.3", uptime: "1d", "cpu-load": 4 }) }));
    const r = await healthCheck({ url: "https://h", username: "u", password: "p" }, f);
    expect(f.mock.calls[0][0]).toBe("https://h/rest/system/resource");
    expect(f.mock.calls[0][1].method).toBe("GET");
    expect(r.version).toBe("7.15.3");
  });
});
