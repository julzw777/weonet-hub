import { describe, expect, it } from "vitest";
import { agingBucket, firstOfMonth, invoiceBalance, recurringBlockers } from "./billing-rules";
describe("recurring billing gate", () => {
  it("blocks everything while unconfirmed", () => expect(recurringBlockers({ currency_confirmed: false, recurring_cadence: null, recurring_due_days: null })).toHaveLength(3));
  it("allows 0 due days once set", () => expect(recurringBlockers({ currency_confirmed: true, recurring_cadence: "monthly", recurring_due_days: 0 })).toEqual([]));
  it("requires month-start periods", () => { expect(firstOfMonth("2026-11-01")).toBe(true); expect(firstOfMonth("2026-11-15")).toBe(false); });
});
describe("aging", () => {
  it("buckets by days past due", () => {
    expect(agingBucket("2026-10-20", "2026-10-20")).toBe("current");
    expect(agingBucket("2026-10-19", "2026-10-20")).toBe("1-30");
    expect(agingBucket("2026-09-19", "2026-10-20")).toBe("31-60");
    expect(agingBucket("2026-07-21", "2026-10-20")).toBe("90+");
  });
  it("credits and payments together reduce balance without going negative", () => { expect(invoiceBalance(100, 60, 40)).toBe(0); expect(invoiceBalance(100.1, 0.05, 0.05)).toBe(100); });
});
