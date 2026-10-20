import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, Legend, Pie, PieChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { QueryState } from "@/components/ui/query-state";
import { useBilling, useBillingSettings, billingMoney } from "@/lib/data/billing";
import { agingBucket } from "@/lib/billing-rules";
import { countBy, monthlySeries } from "@/lib/report-rules";
import { useAuth } from "@/lib/auth";

const colors = ["hsl(var(--primary))", "hsl(var(--success))", "hsl(var(--warning))", "hsl(var(--destructive))", "hsl(var(--muted-foreground))"];
const axis = { stroke: "hsl(var(--muted-foreground))", fontSize: 12 };
const tip = { contentStyle: { background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", color: "hsl(var(--foreground))" } };

export default function Reports() {
  const { hasRole } = useAuth();
  const billingAllowed = hasRole("finance", "care", "readonly");
  const billing = useBilling();
  const settings = useBillingSettings();
  const subs = useQuery({ queryKey: ["report-subs"], queryFn: async () => { const { data, error } = await supabase.from("subscriptions").select("status"); if (error) throw new Error(error.message); return data; } });
  const devices = useQuery({ queryKey: ["report-devices"], enabled: hasRole("noc", "tech", "readonly"), queryFn: async () => { const { data, error } = await supabase.from("network_devices").select("last_health_status"); if (error) throw new Error(error.message); return data; } });
  const today = new Date().toISOString().slice(0, 10);
  const sym = settings.data?.currency_symbol ?? "";
  const series = billing.data ? monthlySeries(billing.data.invoices, billing.data.allocations, today) : [];
  const aging = billing.data ? ["current", "1-30", "31-60", "61-90", "90+"].map((b) => ({ name: b === "current" ? "Not due" : b, value: billing.data!.invoices.filter((i) => i.state === "issued" && i.balance > 0 && agingBucket(i.due_date, today) === b).reduce((t, i) => t + i.balance, 0) })) : [];
  return <div className="space-y-6">
    <div><h1 className="text-3xl font-bold">Reports</h1><p className="text-muted-foreground">Built from saved records only. Ticket and uptime reports arrive once tickets and router monitoring hold real history.</p></div>
    {billingAllowed && <div className="grid gap-6 lg:grid-cols-2">
      <Card><CardHeader><CardTitle>Invoiced vs collected (last 6 months)</CardTitle></CardHeader><CardContent><QueryState loading={billing.isLoading} error={billing.error} empty={!!billing.data && series.every((r) => !r.invoiced && !r.collected)} emptyText="No issued invoices or payments in this period." />
        {series.some((r) => r.invoiced || r.collected) && <div className="h-72"><ResponsiveContainer><BarChart data={series}><CartesianGrid stroke="hsl(var(--border))" vertical={false} /><XAxis dataKey="month" {...axis} /><YAxis {...axis} /><Tooltip {...tip} formatter={(v: number) => billingMoney(v, sym)} /><Legend /><Bar dataKey="invoiced" name="Invoiced" fill={colors[0]} radius={4} /><Bar dataKey="collected" name="Collected" fill={colors[1]} radius={4} /></BarChart></ResponsiveContainer></div>}</CardContent></Card>
      <Card><CardHeader><CardTitle>Outstanding balance by age</CardTitle></CardHeader><CardContent><QueryState loading={billing.isLoading} error={billing.error} empty={!!billing.data && aging.every((a) => !a.value)} emptyText="Nothing outstanding." />
        {aging.some((a) => a.value) && <div className="h-72"><ResponsiveContainer><BarChart data={aging}><CartesianGrid stroke="hsl(var(--border))" vertical={false} /><XAxis dataKey="name" {...axis} /><YAxis {...axis} /><Tooltip {...tip} formatter={(v: number) => billingMoney(v, sym)} /><Bar dataKey="value" name="Balance" fill={colors[2]} radius={4} /></BarChart></ResponsiveContainer></div>}</CardContent></Card>
    </div>}
    <div className="grid gap-6 lg:grid-cols-2">
      <Card><CardHeader><CardTitle>Services by status</CardTitle></CardHeader><CardContent><QueryState loading={subs.isLoading} error={subs.error} empty={!!subs.data && !subs.data.length} emptyText="No services yet." />
        {!!subs.data?.length && <div className="h-64"><ResponsiveContainer><PieChart><Pie data={countBy(subs.data, (s) => s.status)} dataKey="value" nameKey="name" innerRadius={50} outerRadius={90} label>{countBy(subs.data, (s) => s.status).map((_, i) => <Cell key={i} fill={colors[i % colors.length]} />)}</Pie><Tooltip {...tip} /><Legend /></PieChart></ResponsiveContainer></div>}</CardContent></Card>
      {devices.data !== undefined || devices.isLoading ? <Card><CardHeader><CardTitle>Router health (last check)</CardTitle></CardHeader><CardContent><QueryState loading={devices.isLoading} error={devices.error} empty={!!devices.data && !devices.data.length} emptyText="No devices registered." />
        {!!devices.data?.length && <div className="h-64"><ResponsiveContainer><BarChart data={countBy(devices.data, (d) => d.last_health_status)}><XAxis dataKey="name" {...axis} /><YAxis allowDecimals={false} {...axis} /><Tooltip {...tip} /><Bar dataKey="value" name="Devices" fill={colors[0]} radius={4} /></BarChart></ResponsiveContainer></div>}</CardContent></Card> : null}
    </div>
  </div>;
}
