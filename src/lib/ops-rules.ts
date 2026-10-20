// UI mirror of the ticket/stock rules. The database (RLS + functions) is the real enforcement.
import type { StaffRole } from "./auth";

const has = (roles: StaffRole[], allowed: StaffRole[]) => roles.includes("admin") || allowed.some((r) => roles.includes(r));

export type TicketStatus = "open" | "in_progress" | "pending" | "resolved" | "closed";
export const TICKET_STATUSES: TicketStatus[] = ["open", "in_progress", "pending", "resolved", "closed"];
export const TICKET_PRIORITIES = ["low", "medium", "high", "urgent"] as const;
export const TICKET_CATEGORIES = ["support", "installation", "billing", "outage", "other"] as const;
export const ITEM_CATEGORIES = ["cable", "router", "ont", "onu", "connector", "consumable", "other"] as const;

export const canEditTickets = (r: StaffRole[]) => has(r, ["care", "tech", "noc"]);
export const canManageItems = (r: StaffRole[]) => has(r, ["warehouse"]);
export const canUseSupplies = (r: StaffRole[]) => has(r, ["warehouse", "tech"]);

/** Closed tickets can't be reopened; any other move is allowed. */
export const canMoveTicket = (from: TicketStatus, to: TicketStatus) => from !== to && from !== "closed";

export type StockLevel = "in_stock" | "low_stock" | "out_of_stock";
export const stockLevel = (qty: number, reorder: number): StockLevel =>
  qty <= 0 ? "out_of_stock" : qty <= reorder ? "low_stock" : "in_stock";

/** Returns an error message or null for a stock change the server would accept. */
export function stockChangeError(kind: "receive" | "adjust" | "usage", qty: number, onHand: number, note = ""): string | null {
  if (!Number.isFinite(qty) || qty === 0) return "Enter a quantity";
  if (kind !== "adjust" && qty < 0) return "Quantity must be positive";
  if (kind === "adjust" && note.trim().length < 3) return "A reason is required for adjustments";
  const delta = kind === "usage" ? -qty : qty;
  if (onHand + delta < 0) return `Not enough stock (on hand: ${onHand})`;
  return null;
}

/** Sum supply usage per item for one customer (usage quantities are stored negative). */
export function usageByItem(moves: { item_id: string; kind: string; quantity: number }[]) {
  const out: Record<string, number> = {};
  for (const m of moves) if (m.kind === "usage") out[m.item_id] = (out[m.item_id] ?? 0) - Number(m.quantity);
  return out;
}
