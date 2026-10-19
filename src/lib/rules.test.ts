import { describe, it, expect } from "vitest";
import { canEditCustomers, canEditPlans, canEditSubscriptions, canManageRoles, canTransition, canRemoveRole } from "./rules";

describe("role permissions", () => {
  it("care and admin edit customers; finance and readonly cannot", () => {
    expect(canEditCustomers(["care"])).toBe(true);
    expect(canEditCustomers(["admin"])).toBe(true);
    expect(canEditCustomers(["finance"])).toBe(false);
    expect(canEditCustomers(["readonly"])).toBe(false);
  });
  it("only finance and admin edit plans", () => {
    expect(canEditPlans(["finance"])).toBe(true);
    expect(canEditPlans(["care"])).toBe(false);
  });
  it("care, noc, admin edit subscriptions; tech cannot", () => {
    expect(canEditSubscriptions(["noc"])).toBe(true);
    expect(canEditSubscriptions(["tech"])).toBe(false);
  });
  it("only admin manages roles", () => {
    expect(canManageRoles(["admin"])).toBe(true);
    expect(canManageRoles(["finance", "care"])).toBe(false);
  });
  it("admin cannot remove own admin role", () => {
    expect(canRemoveRole("u1", "u1", "admin")).toBe(false);
    expect(canRemoveRole("u1", "u2", "admin")).toBe(true);
    expect(canRemoveRole("u1", "u1", "care")).toBe(true);
  });
});

describe("subscription lifecycle", () => {
  it("allows valid transitions", () => {
    expect(canTransition("pending", "active")).toBe(true);
    expect(canTransition("active", "suspended")).toBe(true);
    expect(canTransition("suspended", "active")).toBe(true);
  });
  it("blocks invalid transitions", () => {
    expect(canTransition("cancelled", "active")).toBe(false);
    expect(canTransition("pending", "suspended")).toBe(false);
  });
});
