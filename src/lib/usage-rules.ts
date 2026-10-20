// Bandwidth usage display rules — pure functions, unit-tested.
export type Granularity = "hour" | "day" | "month" | "year";

export const GRANULARITIES: { value: Granularity; label: string }[] = [
  { value: "hour", label: "Hourly (last 24 h)" },
  { value: "day", label: "Daily (last 30 days)" },
  { value: "month", label: "Monthly (last 12 months)" },
  { value: "year", label: "Yearly (last 5 years)" },
];

export function defaultRange(g: Granularity, now: Date = new Date()): { from: Date; to: Date } {
  const to = now;
  const from = new Date(now);
  if (g === "hour") from.setHours(from.getHours() - 24);
  else if (g === "day") from.setDate(from.getDate() - 30);
  else if (g === "month") from.setMonth(from.getMonth() - 12);
  else from.setFullYear(from.getFullYear() - 5);
  return { from, to };
}

export function bucketLabel(iso: string, g: Granularity): string {
  const d = new Date(iso);
  if (g === "hour") return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  if (g === "day") return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  if (g === "month") return d.toLocaleDateString(undefined, { year: "numeric", month: "short" });
  return d.getFullYear().toString();
}

export function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n < 0) return "—";
  const units = ["B", "KB", "MB", "GB", "TB", "PB"];
  let v = n, i = 0;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v >= 100 || i === 0 ? Math.round(v) : v.toFixed(1)} ${units[i]}`;
}

export interface UsagePoint { bucket: string; rx: number; tx: number }

export function usageTotals(points: UsagePoint[]): { rx: number; tx: number; peak: number } {
  let rx = 0, tx = 0, peak = 0;
  for (const p of points) {
    rx += p.rx; tx += p.tx;
    if (p.rx + p.tx > peak) peak = p.rx + p.tx;
  }
  return { rx, tx, peak };
}
