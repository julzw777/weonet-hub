import { describe, expect, it } from "vitest";
import { collectionsSummary } from "./billing-rules";
const inv = (status: string, issued: string | null, total: number, paid: number, credited = 0, state = "issued") => ({ state, status, issued_at: issued, total, paid, credited, balance: Math.max(0, total - paid - credited) });
const rows = [inv("paid", "2026-10-01T10:00:00Z", 100, 100), inv("partial", "2026-10-15T10:00:00Z", 200, 50), inv("overdue", "2026-10-31T23:00:00Z", 80, 0), inv("unpaid", "2026-11-01T00:00:00Z", 999, 0), inv("draft", null, 500, 0, 0, "draft"), inv("paid", "2026-10-10T00:00:00Z", 60, 30, 30)];
describe("collections report", () => {
  const s = collectionsSummary(rows, "2026-10-01", "2026-10-31");
  it("includes only issued invoices inside the dates (inclusive)", () => expect(s.all.count).toBe(4));
  it("totals paid invoices", () => expect(s.paid).toMatchObject({ count: 2, total: 160, paid: 130, credited: 30, balance: 0 }));
  it("totals partial invoices", () => expect(s.partial).toMatchObject({ count: 1, total: 200, paid: 50, balance: 150 }));
  it("outstanding balance covers partial, unpaid and overdue", () => expect(s.outstanding).toMatchObject({ count: 2, balance: 230 }));
  it("avoids float drift", () => expect(collectionsSummary([inv("partial", "2026-10-02", 0.3, 0.1), inv("partial", "2026-10-02", 0.3, 0.2)], "2026-10-01", "2026-10-31").partial.paid).toBe(0.3));
});
