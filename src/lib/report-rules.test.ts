import { describe, expect, it } from "vitest";
import { countBy, monthlySeries, percent } from "./report-rules";
describe("reports", () => {
  const s = monthlySeries(
    [{ state: "issued", issued_at: "2026-10-03T00:00:00Z", total: 100 }, { state: "draft", issued_at: null, total: 999 }, { state: "issued", issued_at: "2026-09-30T00:00:00Z", total: 50.1 }, { state: "issued", issued_at: "2025-01-01T00:00:00Z", total: 7 }, { state: "void", issued_at: "2026-10-05T00:00:00Z", total: 40 }],
    [{ amount: 60, reversed: false, created_at: "2026-10-10T00:00:00Z" }, { amount: 30, reversed: true, created_at: "2026-10-10T00:00:00Z" }], "2026-10-20", 3);
  it("returns the last N months in order", () => expect(s.map((r) => r.month)).toEqual(["2026-08", "2026-09", "2026-10"]));
  it("counts only issued invoices and active allocations", () => { expect(s[2]).toEqual({ month: "2026-10", invoiced: 100, collected: 60 }); expect(s[1].invoiced).toBe(50.1); });
  it("crosses year boundaries", () => expect(monthlySeries([], [], "2026-01-15", 2).map((r) => r.month)).toEqual(["2025-12", "2026-01"]));
  it("counts by key", () => expect(countBy([{ s: "a" }, { s: "a" }, { s: "b" }], (r) => r.s)).toEqual([{ name: "a", value: 2 }, { name: "b", value: 1 }]));
  it("percent handles empty totals", () => { expect(percent(1, 3)).toBe(33.3); expect(percent(0, 0)).toBeNull(); });
});
