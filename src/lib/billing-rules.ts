import type { StaffRole } from "./auth";

export const canManageBilling = (roles: StaffRole[]) => roles.includes("admin") || roles.includes("finance");
export type InvoiceState = "draft" | "issued" | "void";
export function invoiceStatus(state: InvoiceState, total: number, paid: number, due: string, today: string) {
  if (state !== "issued") return state;
  if (paid >= total) return "paid";
  if (due < today) return "overdue";
  return paid > 0 ? "partial" : "unpaid";
}
export function paymentStatus(reversed: boolean, amount: number, allocated: number) {
  if (reversed) return "reversed";
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
export function csvCell(value: unknown) {
  const text = String(value ?? "");
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return `"${safe.replaceAll('"', '""')}"`;
}