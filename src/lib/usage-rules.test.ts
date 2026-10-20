import { describe, expect, it } from "vitest";
import { defaultRange, formatBytes, usageTotals } from "./usage-rules";

describe("usage rules", () => {
  it("defaultRange: hourly covers 24 hours", () => {
    const now = new Date("2026-10-20T10:00:00Z");
    const { from, to } = defaultRange("hour", now);
    expect(to).toBe(now);
    expect(now.getTime() - from.getTime()).toBe(24 * 3600 * 1000);
  });

  it("defaultRange: daily covers 30 days, yearly 5 years", () => {
    const now = new Date("2026-10-20T10:00:00Z");
    expect(now.getTime() - defaultRange("day", now).from.getTime()).toBe(30 * 24 * 3600 * 1000);
    expect(defaultRange("year", now).from.getFullYear()).toBe(2021);
  });

  it("formatBytes scales units", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(2048)).toBe("2.0 KB");
    expect(formatBytes(5 * 1024 ** 3)).toBe("5.0 GB");
    expect(formatBytes(3 * 1024 ** 4)).toBe("3.0 TB");
    expect(formatBytes(-1)).toBe("—");
  });

  it("usageTotals sums and finds peak combined bucket", () => {
    const t = usageTotals([
      { bucket: "a", rx: 100, tx: 50 },
      { bucket: "b", rx: 300, tx: 400 },
    ]);
    expect(t.rx).toBe(400);
    expect(t.tx).toBe(450);
    expect(t.peak).toBe(700);
    expect(usageTotals([])).toEqual({ rx: 0, tx: 0, peak: 0 });
  });
});
