/** Monthly invoiced vs collected for issued invoices, keyed YYYY-MM, last `months` months ending at `today`. */
export function monthlySeries(invoices: { state: string; issued_at: string | null; total: number | string }[], allocations: { amount: number | string; reversed: boolean; created_at: string }[], today: string, months = 6) {
  const keys: string[] = [];
  const [y, m] = today.slice(0, 7).split("-").map(Number);
  for (let i = months - 1; i >= 0; i--) { const d = new Date(Date.UTC(y, m - 1 - i, 1)); keys.push(d.toISOString().slice(0, 7)); }
  const cents = new Map(keys.map((k) => [k, { invoiced: 0, collected: 0 }]));
  for (const i of invoices) if (i.state === "issued" && i.issued_at) { const r = cents.get(i.issued_at.slice(0, 7)); if (r) r.invoiced += Math.round(Number(i.total) * 100); }
  for (const a of allocations) if (!a.reversed) { const r = cents.get(a.created_at.slice(0, 7)); if (r) r.collected += Math.round(Number(a.amount) * 100); }
  return keys.map((k) => ({ month: k, invoiced: cents.get(k)!.invoiced / 100, collected: cents.get(k)!.collected / 100 }));
}
export const countBy = <T,>(rows: T[], key: (r: T) => string) => Object.entries(rows.reduce<Record<string, number>>((acc, r) => { const k = key(r); acc[k] = (acc[k] ?? 0) + 1; return acc; }, {})).map(([name, value]) => ({ name, value }));
export const percent = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 1000) / 10 : null);
