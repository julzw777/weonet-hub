import { describe, expect, it } from "vitest";
import { auditDetails, canRead, canWrite, mockResponse, resolveBase, stripSecrets, toRequest, validateOp } from "./lib";

describe("radius-api rules", () => {
  it("only NOC/Admin may change subscribers; Care may read", () => {
    expect(canWrite(["care"])).toBe(false);
    expect(canWrite(["noc"])).toBe(true);
    expect(canRead(["care"])).toBe(true);
    expect(canRead(["readonly"])).toBe(false);
  });
  it("rejects unknown operations and extra fields", () => {
    expect(validateOp({ op: "drop_db" }).ok).toBe(false);
    expect(validateOp({ op: "list_nas", url: "http://x" }).ok).toBe(false);
  });
  it("rejects path-injection ids", () => {
    expect(validateOp({ op: "reset_password", id: "../admin" }).ok).toBe(false);
  });
  it("maps status changes to PATCH /v1/subscribers/:id/status", () => {
    expect(toRequest({ op: "set_status", id: "sub-1", status: "suspended" })).toEqual({ method: "PATCH", path: "/v1/subscribers/sub-1/status", body: { status: "suspended" } });
  });
  it("never returns NAS shared secrets", () => {
    const r = mockResponse({ op: "list_nas" }, () => "x") as { body: { data: object[] } };
    expect(JSON.stringify(stripSecrets(r.body))).not.toContain("shared_secret");
  });
  it("audit details exclude the password", () => {
    expect(auditDetails({ op: "create_subscriber", username: "a.b", full_name: "A", plan_id: "p", password: "secret123" })).not.toHaveProperty("password");
  });
  it("requires an https base URL without credentials", () => {
    expect(resolveBase("http://radius.local")).toBeNull();
    expect(resolveBase("https://u:p@radius.example")).toBeNull();
    expect(resolveBase("https://radius.example/api/")).toBe("https://radius.example/api");
  });
});
