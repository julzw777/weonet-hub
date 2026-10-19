import { describe, expect, it } from "vitest";
import { allocationError, canManageBilling, csvCell, invoiceStatus, paymentStatus } from "./billing-rules";

describe("billing permissions", () => {
  it("allows Finance and Admin writes", () => {
    expect(canManageBilling(["finance"])).toBe(true);
    expect(canManageBilling(["admin"])).toBe(true);
    for (const role of ["care", "noc", "tech", "warehouse", "readonly"] as const) expect(canManageBilling([role])).toBe(false);
  });
});
describe("reconciliation", () => {
  it("rejects allocations above the remaining payment", () => expect(allocationError(101, 100, 200)).toBe("Amount exceeds the unallocated payment"));
  it("rejects allocations above the invoice balance", () => expect(allocationError(51, 100, 50)).toBe("Amount exceeds the invoice balance"));
  it("rejects zero and negative allocations", () => { expect(allocationError(0, 100, 100)).not.toBeNull(); expect(allocationError(-1, 100, 100)).not.toBeNull(); });
  it("allows exact payment and invoice balances", () => expect(allocationError(100, 100, 100)).toBeNull());
  it("keeps excess payment unallocated", () => expect(paymentStatus(false, 150, 100)).toBe("partial"));
  it("identifies unmatched payments", () => expect(paymentStatus(false, 100, 0)).toBe("unmatched"));
  it("marks reversed payments regardless of allocations", () => expect(paymentStatus(true, 100, 100)).toBe("reversed"));
});
describe("invoice lifecycle", () => {
  it("overdue means unpaid after the due date", () => expect(invoiceStatus("issued", 100, 0, "2026-10-18", "2026-10-19")).toBe("overdue"));
  it("does not mark an invoice overdue on its due date", () => expect(invoiceStatus("issued", 100, 0, "2026-10-19", "2026-10-19")).toBe("unpaid"));
  it("paid invoices are not overdue", () => expect(invoiceStatus("issued", 100, 100, "2026-10-18", "2026-10-19")).toBe("paid"));
  it("drafts and voids never become overdue", () => { expect(invoiceStatus("draft", 100, 0, "2026-10-18", "2026-10-19")).toBe("draft"); expect(invoiceStatus("void", 100, 0, "2026-10-18", "2026-10-19")).toBe("void"); });
  it("shows partial payments", () => expect(invoiceStatus("issued", 100, 50, "2026-10-20", "2026-10-19")).toBe("partial"));
});
it("escapes CSV formulas and quotes", () => { expect(csvCell("=1+1")).toBe('"\'=1+1"'); expect(csvCell('a"b')).toBe('"a""b"'); });