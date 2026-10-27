import { describe, expect, it } from "vitest";
import {
  canModifyTarget,
  canRemoveSuperAdmin,
  deriveStatus,
  filterUsers,
  generateTempPassword,
  roleLabel,
  validTempPassword,
  type HubUser,
} from "./user-rules";

describe("deriveStatus", () => {
  it("marks banned accounts as deactivated", () => {
    expect(deriveStatus(true, false)).toBe("deactivated");
    expect(deriveStatus(true, true)).toBe("deactivated");
  });
  it("marks unbanned accounts with the flag as pending password change", () => {
    expect(deriveStatus(false, true)).toBe("pending_password_change");
  });
  it("marks the rest active", () => {
    expect(deriveStatus(false, false)).toBe("active");
  });
});

describe("super admin protection", () => {
  it("blocks acting on your own account", () => {
    expect(canModifyTarget("a", "a")).toBe(false);
    expect(canModifyTarget("a", "b")).toBe(true);
  });
  it("blocks removing the final super admin", () => {
    expect(canRemoveSuperAdmin(1, true)).toBe(false);
  });
  it("allows removing a super admin when another remains", () => {
    expect(canRemoveSuperAdmin(2, true)).toBe(true);
  });
  it("never blocks non-super-admin targets", () => {
    expect(canRemoveSuperAdmin(1, false)).toBe(true);
  });
});

describe("validTempPassword", () => {
  it("requires at least 8 characters", () => {
    expect(validTempPassword("short")).toBe(false);
    expect(validTempPassword("long-enough1")).toBe(true);
  });
});

describe("generateTempPassword", () => {
  it("produces valid unique passwords", () => {
    const a = generateTempPassword();
    const b = generateTempPassword();
    expect(validTempPassword(a)).toBe(true);
    expect(a).not.toBe(b);
  });
});

describe("role labels", () => {
  it("maps internal roles to the requested labels", () => {
    expect(roleLabel("admin")).toBe("Super Admin");
    expect(roleLabel("care")).toBe("Support");
    expect(roleLabel("readonly")).toBe("Read Only");
  });
});

describe("filterUsers", () => {
  const users: HubUser[] = [
    { id: "1", full_name: "Amina Koroma", email: "amina@weonetsl.com", roles: ["admin"], status: "active", last_sign_in_at: null },
    { id: "2", full_name: "Bob Sesay", email: "bob@weonetsl.com", roles: ["care"], status: "pending_password_change", last_sign_in_at: null },
    { id: "3", full_name: "Cyril Bangura", email: "cyril@weonetsl.com", roles: ["readonly"], status: "deactivated", last_sign_in_at: null },
  ];
  it("returns all users for an empty query", () => {
    expect(filterUsers(users, "  ")).toHaveLength(3);
  });
  it("matches by name and email", () => {
    expect(filterUsers(users, "amina")).toHaveLength(1);
    expect(filterUsers(users, "bob@")).toHaveLength(1);
  });
  it("matches by role label and status", () => {
    expect(filterUsers(users, "super admin")).toHaveLength(1);
    expect(filterUsers(users, "deactivated")).toHaveLength(1);
    expect(filterUsers(users, "pending")).toHaveLength(1);
  });
});
