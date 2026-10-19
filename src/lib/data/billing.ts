import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database, Tables } from "@/integrations/supabase/types";
import { invoiceBalance, invoiceStatus, paymentStatus, type InvoiceState } from "@/lib/billing-rules";

async function allRows<T>(load: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>) {
  const rows: T[] = [];
  for (let start = 0; ; start += 1000) {
    const { data, error } = await load(start, start + 999);
    if (error) throw new Error(error.message);
    rows.push(...(data ?? []));
    if (!data || data.length < 1000) return rows;
  }
}
export function useBilling() {
  return useQuery({ queryKey: ["billing"], queryFn: async () => {
    const [invoices, payments, allocations, items, credits] = await Promise.all([
      allRows<Tables<"invoices">>((from, to) => supabase.from("invoices").select("*").order("id").range(from, to)),
      allRows<Tables<"payments">>((from, to) => supabase.from("payments").select("*").order("id").range(from, to)),
      allRows<Tables<"payment_allocations">>((from, to) => supabase.from("payment_allocations").select("*").order("id").range(from, to)),
      allRows<Tables<"invoice_items">>((from, to) => supabase.from("invoice_items").select("*").order("id").range(from, to)),
      allRows<Tables<"credit_notes">>((from, to) => supabase.from("credit_notes").select("*").order("id").range(from, to)),
    ]);
    const today = new Date().toISOString().slice(0, 10);
    return {
      invoices: invoices.map((i) => {
        const paid = allocations.filter((a) => a.invoice_id === i.id && !a.reversed).reduce((s, a) => s + Number(a.amount), 0);
        const notes = credits.filter((c) => c.invoice_id === i.id);
        const credited = notes.reduce((s, c) => s + Number(c.amount), 0);
        return { ...i, paid, credited, credits: notes, balance: invoiceBalance(Number(i.total), paid, credited), status: invoiceStatus(i.state as InvoiceState, Number(i.total), paid + credited, i.due_date, today), items: items.filter((l) => l.invoice_id === i.id) };
      }).sort((a, b) => b.created_at.localeCompare(a.created_at)),
      payments: payments.map((p) => {
        const allocated = allocations.filter((a) => a.payment_id === p.id && !a.reversed).reduce((s, a) => s + Number(a.amount), 0);
        return { ...p, allocated, available: Number(p.amount) - allocated, status: paymentStatus(p.reversed, Number(p.amount), allocated, p.failed) };
      }).sort((a, b) => b.created_at.localeCompare(a.created_at)), allocations,
    };
  }});
}
export type BillingInvoice = NonNullable<ReturnType<typeof useBilling>["data"]>["invoices"][number];
export type BillingPayment = NonNullable<ReturnType<typeof useBilling>["data"]>["payments"][number];
type BillingRpc = "create_invoice" | "record_payment" | "allocate_payment" | "reverse_payment" | "set_invoice_state" | "issue_credit_note" | "mark_payment_failed";
export function useBillingAction<N extends BillingRpc>(name: N) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: async (args: Database["public"]["Functions"][N]["Args"]) => {
    const { data, error } = await supabase.rpc(name, args);
    if (error) throw new Error(error.message);
    return data;
  }, onSuccess: () => qc.invalidateQueries({ queryKey: ["billing"] }) });
}
export function useBillingSettings() {
  return useQuery({ queryKey: ["settings"], queryFn: async () => {
    const { data, error } = await supabase.from("app_settings").select("*").eq("id", 1).single();
    if (error) throw new Error(error.message);
    return data;
  }});
}
export const billingMoney = (amount: number, symbol: string) => `${symbol} ${amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;