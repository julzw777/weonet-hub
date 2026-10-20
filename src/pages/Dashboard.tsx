import { useQuery } from "@tanstack/react-query";
import { Users, Wallet, Clock, Router, Ticket } from "lucide-react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { KPICard } from "@/components/ui/kpi-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { QueryState } from "@/components/ui/query-state";
import { useAuth } from "@/lib/auth";
import { useBilling, useBillingSettings, billingMoney } from "@/lib/data/billing";
import { percent } from "@/lib/report-rules";

export default function Dashboard() {
  const { hasRole } = useAuth();
  const canBilling = hasRole("finance", "care", "readonly");
  const canNetwork = hasRole("noc", "tech", "readonly");
  const subs = useQuery({ queryKey: ["dash-subs"], queryFn: async () => { const { count, error } = await supabase.from("subscriptions").select("id", { count: "exact", head: true }).eq("status", "active"); if (error) throw new Error(error.message); return count ?? 0; } });
  const devices = useQuery({ queryKey: ["report-devices"], enabled: canNetwork, queryFn: async () => { const { data, error } = await supabase.from("network_devices").select("last_health_status"); if (error) throw new Error(error.message); return data; } });
  const billing = useBilling();
  const settings = useBillingSettings();
  const sym = settings.data?.currency_symbol ?? "";
  const month = new Date().toISOString().slice(0, 7);
  const collected = billing.data?.allocations.filter((a) => !a.reversed && a.created_at.startsWith(month)).reduce((t, a) => t + Number(a.amount), 0);
  const overdue = billing.data?.invoices.filter((i) => i.status === "overdue").reduce((t, i) => t + i.balance, 0);
  const healthy = devices.data ? percent(devices.data.filter((d) => d.last_health_status === "healthy").length, devices.data.length) : null;
  const money = (v: number | undefined) => (v === undefined ? "—" : billingMoney(v, sym));
  return <div className="space-y-6">
    <div><h1 className="text-3xl font-bold text-foreground">Dashboard</h1><p className="text-muted-foreground">Live figures from saved Weonet records.</p></div>
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
      <KPICard title="Active services" value={subs.isLoading ? "…" : subs.error ? "—" : subs.data!} description="Services with status active" icon={Users} />
      <KPICard title="Collected this month" value={canBilling ? money(collected) : "No access"} description="Payments allocated this month" icon={Wallet} />
      <KPICard title="Overdue balance" value={canBilling ? money(overdue) : "No access"} description="Issued invoices past due" icon={Clock} />
      <KPICard title="Routers healthy" value={!canNetwork ? "No access" : healthy === null ? (devices.data ? "No devices" : "…") : `${healthy}%`} description="At last health check" icon={Router} />
      <KPICard title="Open tickets" value="Not tracked yet" description="Saved tickets arrive in Stage 4" icon={Ticket} />
    </div>
    {canBilling && <Card><CardHeader><CardTitle>Recent invoices</CardTitle></CardHeader><CardContent className="space-y-2">
      <QueryState loading={billing.isLoading} error={billing.error} empty={!!billing.data && !billing.data.invoices.length} emptyText="No invoices yet." />
      {billing.data?.invoices.slice(0, 5).map((i) => <div key={i.id} className="flex justify-between border-b border-border py-2 text-sm"><span>{i.number} · {i.status}</span><span className="tabular-nums">{billingMoney(Number(i.total), i.currency_symbol)}</span></div>)}
      <Link to="/billing" className="text-sm text-primary">Open Billing Center</Link></CardContent></Card>}
  </div>;
}
