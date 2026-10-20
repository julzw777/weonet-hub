import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Download } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { QueryState } from "@/components/ui/query-state";
import { useAuth } from "@/lib/auth";
import { agingBucket, canManageBilling, firstOfMonth, recurringBlockers } from "@/lib/billing-rules";
import { billingMoney, useBilling, useBillingSettings } from "@/lib/data/billing";

export function CurrencyNotice() {
  const s = useBillingSettings();
  if (!s.data || s.data.currency_confirmed) return null;
  return <div className="flex items-start gap-2 rounded-lg border border-border bg-card p-3 text-sm"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" /><span>Currency <b>{s.data.currency_code} ({s.data.currency_symbol})</b> is a placeholder, not yet confirmed by Weonet. Amounts are recorded in it but it is not an approved production setting.</span></div>;
}

export function BillingSetup({ exportRows, customerName }: { exportRows: (n: string, r: unknown[][]) => void; customerName: (id: string | null) => string }) {
  const { roles, hasRole } = useAuth();
  const writer = canManageBilling(roles);
  const qc = useQueryClient();
  const settings = useBillingSettings();
  const billing = useBilling();
  const next = new Date(); next.setUTCDate(1); next.setUTCMonth(next.getUTCMonth() + 1);
  const [period, setPeriod] = useState(next.toISOString().slice(0, 10));
  const [form, setForm] = useState<{ currency_confirmed: boolean; recurring_cadence: string; recurring_due_days: string } | null>(null);
  const preview = useQuery({ queryKey: ["recurring-preview", period], enabled: writer && firstOfMonth(period), queryFn: async () => {
    const { data, error } = await supabase.rpc("preview_recurring_invoices", { _period_start: period });
    if (error) throw new Error(error.message); return data;
  }});
  const generate = useMutation({ mutationFn: async () => { const { data, error } = await supabase.rpc("generate_recurring_invoices", { _period_start: period }); if (error) throw new Error(error.message); return data; },
    onSuccess: (n) => { toast.success(`${n} draft invoice(s) created for review`); qc.invalidateQueries({ queryKey: ["billing"] }); qc.invalidateQueries({ queryKey: ["recurring-preview"] }); }, onError: (e) => toast.error(e.message) });
  const save = useMutation({ mutationFn: async () => {
    if (!form) return;
    const { error } = await supabase.from("app_settings").update({ currency_confirmed: form.currency_confirmed, recurring_cadence: form.recurring_cadence || null, recurring_due_days: form.recurring_due_days === "" ? null : Number(form.recurring_due_days) }).eq("id", 1);
    if (error) throw new Error(error.message);
  }, onSuccess: () => { toast.success("Billing settings saved"); setForm(null); qc.invalidateQueries({ queryKey: ["settings"] }); }, onError: (e) => toast.error(e.message) });

  const s = settings.data;
  const blockers = s ? recurringBlockers(s) : [];
  const today = new Date().toISOString().slice(0, 10);
  const open = (billing.data?.invoices ?? []).filter((i) => i.state === "issued" && i.balance > 0);
  const exportAging = () => exportRows("weonet-ar-aging", [["Invoice", "Customer", "Due", "Days bucket", "Currency", "Total", "Paid", "Credited", "Balance"], ...open.map((i) => [i.number, customerName(i.customer_id), i.due_date, agingBucket(i.due_date, today), i.currency_code, i.total, i.paid, i.credited, i.balance])]);
  const exportCredits = () => exportRows("weonet-credit-notes", [["Invoice", "Customer", "Date", "Currency", "Amount", "Reason"], ...(billing.data?.invoices ?? []).flatMap((i) => i.credits.map((c) => [i.number, customerName(i.customer_id), c.created_at.slice(0, 10), i.currency_code, c.amount, c.reason]))]);
  const buckets = ["current", "1-30", "31-60", "61-90", "90+"].map((b) => [b, open.filter((i) => agingBucket(i.due_date, today) === b).reduce((t, i) => t + i.balance, 0)] as const);

  return <div className="space-y-6">
    <section className="space-y-3 rounded-lg border border-border p-4"><h2 className="font-semibold">Billing settings</h2>
      <QueryState loading={settings.isLoading} error={settings.error} />
      {s && !form && <><p className="text-sm">Currency {s.currency_code} ({s.currency_symbol}) · {s.currency_confirmed ? `confirmed ${s.confirmed_at?.slice(0, 10) ?? ""}` : "not confirmed"} · Cadence {s.recurring_cadence ?? "not set"} · Due after {s.recurring_due_days ?? "not set"} day(s)</p>
        <p className="text-xs text-muted-foreground">Taxes, proration, late fees, grace periods and suspension are not applied. These need Weonet's decisions.</p>
        {hasRole("admin") && <Button size="sm" variant="outline" onClick={() => setForm({ currency_confirmed: s.currency_confirmed, recurring_cadence: s.recurring_cadence ?? "", recurring_due_days: s.recurring_due_days?.toString() ?? "" })}>Edit settings</Button>}</>}
      {form && <form className="grid max-w-md gap-3" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
        <div className="flex items-center gap-2"><Switch id="cur-ok" checked={form.currency_confirmed} onCheckedChange={(v) => setForm({ ...form, currency_confirmed: v })} /><Label htmlFor="cur-ok">Weonet has confirmed this currency</Label></div>
        <div><Label htmlFor="cad">Cadence</Label><select id="cad" className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={form.recurring_cadence} onChange={(e) => setForm({ ...form, recurring_cadence: e.target.value })}><option value="">Not set</option><option value="monthly">Monthly</option></select></div>
        <div><Label htmlFor="due">Days until due (0–90)</Label><Input id="due" type="number" min="0" max="90" value={form.recurring_due_days} onChange={(e) => setForm({ ...form, recurring_due_days: e.target.value })} /></div>
        <div className="flex gap-2"><Button size="sm" type="submit" disabled={save.isPending}>Save</Button><Button size="sm" type="button" variant="ghost" onClick={() => setForm(null)}>Cancel</Button></div></form>}
    </section>
    {writer && <section className="space-y-3 rounded-lg border border-border p-4"><h2 className="font-semibold">Recurring invoices (preview)</h2>
      <div className="flex flex-wrap items-end gap-3"><div><Label htmlFor="period">Period starting</Label><Input id="period" type="date" value={period} onChange={(e) => setPeriod(e.target.value)} /></div>
        <Button disabled={blockers.length > 0 || generate.isPending || !preview.data?.some((r) => !r.already_invoiced)} onClick={() => { if (confirm(`Create draft invoices for ${preview.data?.filter((r) => !r.already_invoiced).length} service(s)? They stay drafts until issued.`)) generate.mutate(); }}>{generate.isPending ? "Creating…" : "Create drafts"}</Button></div>
      {!firstOfMonth(period) && <p className="text-sm text-destructive">Choose the first day of a month.</p>}
      {blockers.length > 0 && <p className="text-sm text-muted-foreground">Creating drafts is locked: {blockers.join("; ")}. The preview below changes nothing.</p>}
      <QueryState loading={preview.isLoading && firstOfMonth(period)} error={preview.error} empty={!!preview.data && !preview.data.length} emptyText="No active services with a priced plan." />
      {preview.data?.map((r) => <div key={r.subscription_id} className="flex flex-wrap justify-between gap-2 border-b border-border py-2 text-sm"><span>{r.customer_name} · {r.plan_name} · {r.period_start} to {r.period_end}</span><span className="tabular-nums">{billingMoney(Number(r.amount), s?.currency_symbol ?? "")}{r.already_invoiced && " · already invoiced"}</span></div>)}
    </section>}
    <section className="space-y-3 rounded-lg border border-border p-4"><div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-semibold">Finance reports</h2><div className="flex gap-2"><Button size="sm" variant="outline" disabled={!billing.data} onClick={exportAging}><Download className="mr-2 h-4 w-4" />AR aging CSV</Button><Button size="sm" variant="outline" disabled={!billing.data} onClick={exportCredits}><Download className="mr-2 h-4 w-4" />Credit notes CSV</Button></div></div>
      <QueryState loading={billing.isLoading} error={billing.error} />
      {billing.data && <div className="grid gap-3 sm:grid-cols-5">{buckets.map(([b, v]) => <div key={b} className="rounded border border-border p-3"><p className="text-xs text-muted-foreground">{b === "current" ? "Not yet due" : `${b} days`}</p><p className="font-semibold tabular-nums">{billingMoney(v, s?.currency_symbol ?? "")}</p></div>)}</div>}
      <p className="text-xs text-muted-foreground">Aging uses the current currency and assumes one currency is in use.</p>
    </section>
  </div>;
}
