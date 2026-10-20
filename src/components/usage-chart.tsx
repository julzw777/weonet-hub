import { useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { QueryState } from "@/components/ui/query-state";
import { useSubscriptions } from "@/lib/data/hooks";
import { useUsageSeries } from "@/lib/data/usage";
import { GRANULARITIES, bucketLabel, defaultRange, formatBytes, usageTotals, type Granularity } from "@/lib/usage-rules";

const axis = { stroke: "hsl(var(--muted-foreground))", fontSize: 12 };
const tip = { contentStyle: { background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", color: "hsl(var(--foreground))" } };

export function CustomerUsage({ customerId }: { customerId: string }) {
  const subs = useSubscriptions(customerId);
  const [subId, setSubId] = useState<string | null>(null);
  const [granularity, setGranularity] = useState<Granularity>("day");

  const services = subs.data ?? [];
  const activeId = subId ?? services[0]?.id ?? null;
  const range = useMemo(() => defaultRange(granularity), [granularity]);
  const series = useUsageSeries(activeId, granularity, range.from, range.to);

  const points = useMemo(
    () => (series.data ?? []).map((p) => ({ ...p, label: bucketLabel(p.bucket, granularity) })),
    [series.data, granularity],
  );
  const totals = useMemo(() => usageTotals(series.data ?? []), [series.data]);

  if (subs.isLoading || subs.error) return <QueryState loading={subs.isLoading} error={subs.error as Error | null} />;
  if (!services.length) return <QueryState empty emptyText="No services yet — add a service to track its bandwidth." />;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Select value={activeId ?? ""} onValueChange={setSubId}>
          <SelectTrigger className="w-72"><SelectValue placeholder="Choose a service" /></SelectTrigger>
          <SelectContent>
            {services.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.service_plans?.name ?? "Plan"}{s.pppoe_username ? ` · ${s.pppoe_username}` : ""} · {s.status}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={granularity} onValueChange={(v) => setGranularity(v as Granularity)}>
          <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
          <SelectContent>
            {GRANULARITIES.map((g) => <SelectItem key={g.value} value={g.value}>{g.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <QueryState loading={series.isLoading} error={series.error} />
      {series.data && points.length === 0 && (
        <QueryState empty emptyText="No usage recorded for this period. Usage is collected from router counters once the collection job is configured (see NETWORK-ROUTER-CONTROL.md) — charts appear here automatically." />
      )}

      {points.length > 0 && (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Total download</CardTitle></CardHeader>
              <CardContent><p className="text-2xl font-bold">{formatBytes(totals.rx)}</p></CardContent></Card>
            <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Total upload</CardTitle></CardHeader>
              <CardContent><p className="text-2xl font-bold">{formatBytes(totals.tx)}</p></CardContent></Card>
            <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Peak bucket (combined)</CardTitle></CardHeader>
              <CardContent><p className="text-2xl font-bold">{formatBytes(totals.peak)}</p></CardContent></Card>
          </div>
          <Card>
            <CardHeader><CardTitle>Bandwidth usage</CardTitle></CardHeader>
            <CardContent>
              <div className="h-80">
                <ResponsiveContainer>
                  <AreaChart data={points}>
                    <CartesianGrid stroke="hsl(var(--border))" vertical={false} />
                    <XAxis dataKey="label" {...axis} />
                    <YAxis {...axis} tickFormatter={(v: number) => formatBytes(v)} width={80} />
                    <Tooltip {...tip} formatter={(v: number) => formatBytes(v)} />
                    <Legend />
                    <Area type="monotone" dataKey="rx" name="Download" stroke="hsl(var(--primary))" fill="hsl(var(--primary) / 0.25)" strokeWidth={2} />
                    <Area type="monotone" dataKey="tx" name="Upload" stroke="hsl(var(--success))" fill="hsl(var(--success) / 0.2)" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
