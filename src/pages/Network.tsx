import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Activity, Plus, Pencil, Lock } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { StatusBadge } from "@/components/ui/status-badge";
import { QueryState } from "@/components/ui/query-state";
import { ACTIONS, secretNames } from "../../supabase/functions/router-control/lib";

type Device = Tables<"network_devices">;
const unwrap = <T,>({ data, error }: { data: T | null; error: { message: string } | null }) => { if (error) throw new Error(error.message); return data as T; };

function DeviceDialog({ device, close }: { device: Device | "new"; close: () => void }) {
  const qc = useQueryClient();
  const d = device === "new" ? null : device;
  const [f, setF] = useState({ name: d?.name ?? "", model: d?.model ?? "", kind: d?.kind ?? "router", endpoint_ref: d?.endpoint_ref ?? "", location_id: d?.location_id ?? "none", enabled: d?.enabled ?? true, notes: d?.notes ?? "" });
  const locations = useQuery({ queryKey: ["locations"], queryFn: async () => unwrap<Tables<"locations">[]>(await supabase.from("locations").select("*").order("name")) });
  const save = useMutation({ mutationFn: async () => {
    const row = { ...f, model: f.model || null, notes: f.notes || null, location_id: f.location_id === "none" ? null : f.location_id, endpoint_ref: f.endpoint_ref.trim().toUpperCase() };
    unwrap(d ? await supabase.from("network_devices").update(row).eq("id", d.id).select() : await supabase.from("network_devices").insert(row).select());
  }, onSuccess: () => { qc.invalidateQueries({ queryKey: ["network_devices"] }); toast.success("Device saved"); close(); }, onError: (e) => toast.error(e.message) });
  const ref = f.endpoint_ref.trim().toUpperCase();
  const names = /^[A-Z][A-Z0-9_]{1,39}$/.test(ref) ? secretNames(ref) : null;
  return <Dialog open onOpenChange={(o) => !o && close()}><DialogContent className="max-h-[90vh] overflow-y-auto"><DialogHeader><DialogTitle>{d ? "Edit device" : "Register device"}</DialogTitle></DialogHeader>
    <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
      <div><Label htmlFor="dev-name">Name</Label><Input id="dev-name" required maxLength={120} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
      <div className="grid grid-cols-2 gap-3"><div><Label htmlFor="dev-model">Model</Label><Input id="dev-model" maxLength={120} value={f.model} onChange={(e) => setF({ ...f, model: e.target.value })} /></div>
        <div><Label>Type</Label><Select value={f.kind} onValueChange={(v) => setF({ ...f, kind: v })}><SelectTrigger aria-label="Type"><SelectValue /></SelectTrigger><SelectContent>{["router", "switch", "olt", "ap"].map((k) => <SelectItem key={k} value={k}>{k.toUpperCase()}</SelectItem>)}</SelectContent></Select></div></div>
      <div><Label htmlFor="dev-ref">Connection reference</Label><Input id="dev-ref" required maxLength={40} placeholder="e.g. CORE_FREETOWN" value={f.endpoint_ref} onChange={(e) => setF({ ...f, endpoint_ref: e.target.value })} />
        <p className="mt-1 text-xs text-muted-foreground">{names ? <>The address and login are never entered here. An administrator adds server secrets <code>{names.url}</code>, <code>{names.username}</code> and <code>{names.password}</code>.</> : "Uppercase letters, digits and underscores (2–40)."}</p></div>
      <div><Label>Site</Label><Select value={f.location_id} onValueChange={(v) => setF({ ...f, location_id: v })}><SelectTrigger aria-label="Site"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">No site</SelectItem>{locations.data?.map((l) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}</SelectContent></Select></div>
      <div><Label htmlFor="dev-notes">Notes</Label><Input id="dev-notes" maxLength={1000} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></div>
      <div className="flex items-center gap-2"><Switch id="dev-enabled" checked={f.enabled} onCheckedChange={(v) => setF({ ...f, enabled: v })} /><Label htmlFor="dev-enabled">Enabled for checks</Label></div>
      <DialogFooter><Button type="submit" disabled={save.isPending}>{save.isPending ? "Saving…" : "Save"}</Button></DialogFooter>
    </form></DialogContent></Dialog>;
}

export default function Network() {
  const { hasRole } = useAuth();
  const canControl = hasRole("noc");
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Device | "new" | null>(null);
  const devices = useQuery({ queryKey: ["network_devices"], queryFn: async () => unwrap<(Device & { locations: { name: string } | null })[]>(await supabase.from("network_devices").select("*, locations(name)").order("name")) });
  const actions = useQuery({ queryKey: ["router_actions"], enabled: canControl, queryFn: async () => unwrap<Tables<"router_actions">[]>(await supabase.from("router_actions").select("*").order("created_at", { ascending: false }).limit(50)) });
  const check = useMutation({ mutationFn: async (device_id: string) => {
    const { data, error } = await supabase.functions.invoke("router-control", { body: { action: "health_check", device_id, idempotency_key: crypto.randomUUID(), dry_run: false } });
    if (error) throw new Error((await (error as { context?: Response }).context?.json?.().catch(() => null))?.error ?? error.message);
    return data.action as Tables<"router_actions">;
  }, onSuccess: (a) => { qc.invalidateQueries({ queryKey: ["network_devices"] }); qc.invalidateQueries({ queryKey: ["router_actions"] }); (a.status === "succeeded" ? toast.success : toast.error)(`Health check ${a.status}: ${a.detail ?? ""}`); }, onError: (e) => toast.error(e.message) });
  const list = devices.data ?? [];
  const count = (s: string) => list.filter((d) => d.last_health_status === s).length;
  const name = (id: string) => list.find((d) => d.id === id)?.name ?? id.slice(0, 8);

  return <div className="space-y-6">
    <div className="flex flex-wrap items-center justify-between gap-4"><div><h1 className="text-3xl font-bold">Network Operations</h1><p className="text-muted-foreground">Registered MikroTik devices. Checks run on the server; this page never connects to routers.</p></div>
      {canControl && <Button onClick={() => setEditing("new")}><Plus className="mr-2 h-4 w-4" />Register device</Button>}</div>
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{[["Registered", list.length], ["Healthy", count("healthy")], ["Errors", count("error")], ["Not configured / unchecked", count("unconfigured") + count("never_checked")]].map(([l, v]) => <Card key={l}><CardContent className="pt-5"><p className="text-sm text-muted-foreground">{l}</p><p className="text-3xl font-bold tabular-nums">{v}</p></CardContent></Card>)}</div>
    <Card><CardHeader><CardTitle>Devices</CardTitle></CardHeader><CardContent className="space-y-3">
      <QueryState loading={devices.isLoading} error={devices.error} empty={!devices.isLoading && list.length === 0} emptyText="No devices registered yet." />
      {list.map((d) => <div key={d.id} className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-border p-4">
        <div className="min-w-0 space-y-1"><div className="flex flex-wrap items-center gap-2"><p className="font-medium">{d.name}</p><StatusBadge status={d.last_health_status} />{!d.enabled && <StatusBadge status="inactive" />}</div>
          <p className="text-xs text-muted-foreground">{d.kind.toUpperCase()} · {d.model || "Model not set"} · {d.locations?.name ?? "No site"} · ref <code>{d.endpoint_ref}</code>{d.routeros_version && ` · RouterOS ${d.routeros_version}`}</p>
          <p className="break-words text-xs text-muted-foreground">{d.last_health_at ? `Last check ${new Date(d.last_health_at).toLocaleString()}: ${d.last_health_detail ?? ""}` : "Never checked"}</p></div>
        {canControl && <div className="flex gap-2"><Button size="sm" variant="outline" disabled={!d.enabled || check.isPending} onClick={() => check.mutate(d.id)}><Activity className="mr-2 h-4 w-4" />Health check</Button><Button size="sm" variant="ghost" aria-label="Edit device" onClick={() => setEditing(d)}><Pencil className="h-4 w-4" /></Button></div>}
      </div>)}
    </CardContent></Card>
    <Card><CardHeader><CardTitle>Router commands</CardTitle></CardHeader><CardContent className="space-y-3">{(["disconnect_subscriber", "apply_profile"] as const).map((a) => <div key={a} className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-border p-4"><div className="min-w-0"><p className="font-medium">{a === "disconnect_subscriber" ? "Disconnect subscriber" : "Apply service profile"}</p><p className="text-xs text-muted-foreground">{ACTIONS[a].reason}</p></div><Button size="sm" variant="outline" disabled><Lock className="mr-2 h-4 w-4" />Unavailable</Button></div>)}</CardContent></Card>
    {canControl && <Card><CardHeader><CardTitle>Action log</CardTitle></CardHeader><CardContent className="space-y-2">
      <QueryState loading={actions.isLoading} error={actions.error} empty={!actions.isLoading && !actions.data?.length} emptyText="No router actions yet." />
      {actions.data?.map((a) => <div key={a.id} className="flex flex-wrap items-center gap-2 border-b border-border py-2 text-xs"><StatusBadge status={a.status} /><span>{a.action.replace("_", " ")}</span><span className="text-muted-foreground">{name(a.device_id)} · {new Date(a.created_at).toLocaleString()} · {a.attempts} attempt(s){a.duration_ms != null && ` · ${a.duration_ms} ms`}</span><span className="w-full break-words text-muted-foreground">{a.detail}</span></div>)}
    </CardContent></Card>}
    {editing && <DeviceDialog device={editing} close={() => setEditing(null)} />}
  </div>;
}
