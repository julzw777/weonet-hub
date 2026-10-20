import { describe, expect, it } from "vitest";
import { canDeleteTickets, canEditTickets, canManageItems, canMoveTicket, canUseSupplies, stockChangeError, stockLevel, usageByItem } from "./ops-rules";

describe("ticket and stock rules", () => {
  it("closed tickets cannot be reopened", () => {
    expect(canMoveTicket("closed", "open")).toBe(false);
    expect(canMoveTicket("resolved", "open")).toBe(true);
  });
  it("only care/tech/noc/admin edit tickets", () => {
    expect(canEditTickets(["readonly"])).toBe(false);
    expect(canEditTickets(["finance"])).toBe(false);
    expect(canEditTickets(["care"])).toBe(true);
  });
  it("only admins can delete tickets", () => {
    expect(canDeleteTickets(["admin"])).toBe(true);
    expect(canDeleteTickets(["care"])).toBe(false);
    expect(canDeleteTickets(["noc", "tech"])).toBe(false);
  });
  it("only warehouse/admin manage items; tech can use supplies", () => {
    expect(canManageItems(["tech"])).toBe(false);
    expect(canManageItems(["warehouse"])).toBe(true);
    expect(canUseSupplies(["tech"])).toBe(true);
    expect(canUseSupplies(["care"])).toBe(false);
  });
  it("stock never goes below zero", () => {
    expect(stockChangeError("usage", 5, 3)).toMatch(/Not enough/);
    expect(stockChangeError("usage", 3, 3)).toBeNull();
    expect(stockChangeError("adjust", -2, 5, "")).toMatch(/reason/);
    expect(stockChangeError("adjust", -6, 5, "damaged")).toMatch(/Not enough/);
    expect(stockChangeError("receive", -1, 5)).toMatch(/positive/);
  });
  it("stock level uses reorder level", () => {
    expect(stockLevel(0, 5)).toBe("out_of_stock");
    expect(stockLevel(5, 5)).toBe("low_stock");
    expect(stockLevel(6, 5)).toBe("in_stock");
  });
  it("sums usage per item", () => {
    expect(usageByItem([{ item_id: "a", kind: "usage", quantity: -2 }, { item_id: "a", kind: "usage", quantity: -3 }, { item_id: "a", kind: "receive", quantity: 10 }])).toEqual({ a: 5 });
  });
});
