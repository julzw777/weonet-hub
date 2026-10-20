import { describe, expect, it } from "vitest";
import { reminderNextStatuses, AUTOMATIC_REMINDERS_ENABLED } from "./billing-rules";
describe("invoice reminders", () => {
  it("logged reminders can be sent or failed", () => expect(reminderNextStatuses("logged")).toEqual(["sent", "failed"]));
  it("sent reminders can be delivered or failed", () => expect(reminderNextStatuses("sent")).toEqual(["delivered", "failed"]));
  it("delivered and failed are final", () => { expect(reminderNextStatuses("delivered")).toEqual([]); expect(reminderNextStatuses("failed")).toEqual([]); });
  it("automatic sending stays off", () => expect(AUTOMATIC_REMINDERS_ENABLED).toBe(false));
});
