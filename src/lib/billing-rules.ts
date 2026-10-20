import type { StaffRole } from "./auth";

export const canManageBilling = (roles: StaffRole[]) => roles.includes("admin") || roles.includes("finance");
export type InvoiceState = "draft" | "issued" | "void";
export function invoiceStatus(state: InvoiceState, total: number, paid: number, due: string, today: string) {
  if (state !== "issued") return state;
  if (paid >= total) return "paid";
  if (due < today) return "overdue";
  return paid > 0 ? "partial" : "unpaid";
}
export function paymentStatus(reversed: boolean, amount: number, allocated: number, failed = false) {
  if (reversed) return "reversed";
  if (failed) return "failed";
  if (allocated === 0) return "unmatched";
  return allocated < amount ? "partial" : "matched";
}
export const minorUnits = (value: number) => Math.round(value * 100);
export function allocationError(amount: number, available: number, balance: number) {
  if (!Number.isFinite(amount) || minorUnits(amount) <= 0) return "Enter a positive amount";
  if (minorUnits(amount) > minorUnits(available)) return "Amount exceeds the unallocated payment";
  if (minorUnits(amount) > minorUnits(balance)) return "Amount exceeds the invoice balance";
  return null;
}
/** Credit notes reduce the open balance; payments and credits together settle an invoice. */
export const invoiceBalance = (total: number, paid: number, credited: number) => Math.max(0, (minorUnits(total) - minorUnits(paid) - minorUnits(credited)) / 100);
export function csvCell(value: unknown) {
  const text = String(value ?? "");
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
}/** Reminders are logged by staff only; no automatic sending until Weonet confirms timing and delivery rules. */
export type ReminderStatus = "logged" | "sent" | "delivered" | "failed";
export const reminderNextStatuses = (s: ReminderStatus): ReminderStatus[] => s === "logged" ? ["sent", "failed"] : s === "sent" ? ["delivered", "failed"] : [];
export const AUTOMATIC_REMINDERS_ENABLED = false;
/** Lists what Weonet must still confirm before recurring invoices can be generated. Empty = ready. */
export function recurringBlockers(s: { currency_confirmed: boolean; recurring_cadence: string | null; recurring_due_days: number | null }) {
  const out: string[] = [];
  if (!s.currency_confirmed) out.push("Currency not confirmed by Weonet");
  if (!s.recurring_cadence) out.push("Invoice cadence not set");
  if (s.recurring_due_days == null) out.push("Days until due not set");
  return out;
}
export type AgingBucket = "current" | "1-30" | "31-60" | "61-90" | "90+";
export function agingBucket(due: string, today: string): AgingBucket {
  const days = Math.floor((Date.parse(today) - Date.parse(due)) / 86400000);
  if (days <= 0) return "current";
  return days <= 30 ? "1-30" : days <= 60 ? "31-60" : days <= 90 ? "61-90" : "90+";
}
export const firstOfMonth = (d: string) => /^\d{4}-\d{2}-01$/.test(d);
/** Collections summary for issued invoices whose issue date falls within [from, to] (inclusive, YYYY-MM-DD). */
export type CollectionInvoice = { state: string; status: string; issued_at: string | null; total: number; paid: number; credited: number; balance: number };
export function collectionsSummary(rows: CollectionInvoice[], from: string, to: string) {
  const inRange = rows.filter((i) => i.state === "issued" && i.issued_at && i.issued_at.slice(0, 10) >= from && i.issued_at.slice(0, 10) <= to);
  const group = (pred: (i: CollectionInvoice) => boolean) => {
    const g = inRange.filter(pred);
    const sum = (k: "total" | "paid" | "credited" | "balance") => g.reduce((t, i) => t + minorUnits(Number(i[k])), 0) / 100;
    return { count: g.length, total: sum("total"), paid: sum("paid"), credited: sum("credited"), balance: sum("balance") };
  };
  return { invoices: inRange, paid: group((i) => i.status === "paid"), partial: group((i) => i.status === "partial"), outstanding: group((i) => i.status === "unpaid" || i.status === "overdue" || i.status === "partial"), all: group(() => true) };
}
/** Display-only conversion; saved amounts are never changed. Rate = base units (Le) per 1 quote unit ($). */
export const convertForDisplay = (amount: number, basePerQuote: number) => basePerQuote > 0 && Number.isFinite(basePerQuote) ? Math.round((amount / basePerQuote) * 100) / 100 : null;
export function rateError(value: string) {
  const n = Number(value);
  if (!value.trim() || !Number.isFinite(n) || n <= 0) return "Enter a positive rate";
  if (!/^\d+(\.\d{1,6})?$/.test(value.trim())) return "Use up to 6 decimals";
  return null;
}
