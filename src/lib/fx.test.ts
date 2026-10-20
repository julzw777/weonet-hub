import { describe, expect, it } from "vitest";
import { canManageBilling, convertForDisplay, rateError } from "./billing-rules";
describe("display exchange rate", () => {
  it("converts Le to $ at the set rate", () => expect(convertForDisplay(22500, 22.5)).toBe(1000));
  it("rounds to cents", () => expect(convertForDisplay(100, 3)).toBe(33.33));
  it("refuses a missing or zero rate", () => { expect(convertForDisplay(100, 0)).toBeNull(); expect(convertForDisplay(100, NaN)).toBeNull(); });
  it("validates rate input", () => { expect(rateError("0")).not.toBeNull(); expect(rateError("-1")).not.toBeNull(); expect(rateError("22.1234567")).not.toBeNull(); expect(rateError("22.5")).toBeNull(); });
  it("only Admin and Finance can set rates", () => { expect(canManageBilling(["finance"])).toBe(true); expect(canManageBilling(["care"])).toBe(false); expect(canManageBilling(["readonly"])).toBe(false); });
});
