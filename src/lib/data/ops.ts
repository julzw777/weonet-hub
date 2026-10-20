import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/* eslint-disable @typescript-eslint/no-explicit-any */
const db = supabase as any;
const unwrap = <T,>({ data, error }: { data: T | null; error: { message: string } | null }) => {
  if (error) throw new Error(error.message);
  return (data ?? []) as T;
};

export interface Ticket {
  id: string; number: string; customer_id: string | null; subject: string; description: string | null;
  category: string; priority: string; status: string; assigned_to: string | null; created_at: string; resolved_at: string | null;
  customers: { full_name: string; account_number: string } | null;
}
export interface Item { id: string; sku: string; name: string; category: string; unit: string; loanable: boolean; reorder_level: number; stock_qty: number }
export interface Loan { id: string; item_id: string; customer_id: string; serial: string; status: string; condition: string | null; loaned_at: string; returned_at: string | null;
  inventory_items: { name: string } | null; customers: { full_name: string; account_number: string } | null }
export interface Movement { id: string; item_id: string; kind: string; quantity: number; customer_id: string | null; ticket_id: string | null; note: string | null; created_at: string;
  inventory_items: { name: string; unit: string } | null; customers: { full_name: string } | null }

export const useTickets = () => useQuery({ queryKey: ["tickets"], queryFn: async () =>
  unwrap<Ticket[]>(await db.from("tickets").select("*, customers(full_name, account_number)").order("created_at", { ascending: false })) });
export const useItems = () => useQuery({ queryKey: ["items"], queryFn: async () => unwrap<Item[]>(await db.from("inventory_items").select("*").order("name")) });
export const useLoans = () => useQuery({ queryKey: ["loans"], queryFn: async () =>
  unwrap<Loan[]>(await db.from("equipment_loans").select("*, inventory_items(name), customers(full_name, account_number)").order("loaned_at", { ascending: false })) });
export const useMovements = (customerId?: string) => useQuery({ queryKey: ["movements", customerId ?? "all"], queryFn: async () => {
  let q = db.from("stock_movements").select("*, inventory_items(name, unit), customers(full_name)").order("created_at", { ascending: false }).limit(500);
  if (customerId) q = q.eq("customer_id", customerId);
  return unwrap<Movement[]>(await q);
} });

function useOp<T>(fn: (v: T) => PromiseLike<{ error: { message: string } | null }>, keys: string[]) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: T) => { const { error } = await fn(v); if (error) throw new Error(error.message); },
    onSuccess: () => keys.forEach((k) => qc.invalidateQueries({ queryKey: [k] })),
  });
}
export const useSaveTicket = () => useOp<Partial<Ticket> & { id?: string }>(({ id, customers: _c, ...v }) =>
  id ? db.from("tickets").update(v).eq("id", id) : db.from("tickets").insert(v), ["tickets"]);
export const useSaveItem = () => useOp<Partial<Item> & { id?: string }>(({ id, stock_qty: _s, ...v }) =>
  id ? db.from("inventory_items").update(v).eq("id", id) : db.from("inventory_items").insert(v), ["items"]);
export const useDeleteTicket = () => useOp<{ id: string }>((v) => db.from("tickets").delete().eq("id", v.id), ["tickets"]);
export const useDeleteItem = () => useOp<{ id: string }>((v) => db.from("inventory_items").delete().eq("id", v.id), ["items"]);
const STOCK = ["items", "movements", "loans"];
export const useAdjustStock = () => useOp<{ item: string; qty: number; kind: "receive" | "adjust"; note: string }>((v) =>
  db.rpc("adjust_stock", { _item_id: v.item, _quantity: v.qty, _kind: v.kind, _note: v.note }), STOCK);
export const useRecordUsage = () => useOp<{ item: string; customer: string; qty: number; ticket: string | null; note: string }>((v) =>
  db.rpc("record_supply_usage", { _item_id: v.item, _customer_id: v.customer, _quantity: v.qty, _ticket_id: v.ticket, _note: v.note }), STOCK);
export const useLoanEquipment = () => useOp<{ item: string; customer: string; serial: string }>((v) =>
  db.rpc("loan_equipment", { _item_id: v.item, _customer_id: v.customer, _serial: v.serial }), STOCK);
export const useReturnEquipment = () => useOp<{ loan: string; outcome: "returned" | "lost"; condition: string }>((v) =>
  db.rpc("return_equipment", { _loan_id: v.loan, _outcome: v.outcome, _condition: v.condition }), STOCK);
