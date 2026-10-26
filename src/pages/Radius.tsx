import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { QueryState } from "@/components/ui/query-state";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import {
  useCreateSubscriber, useRadiusAccounting, useRadiusNas, useRadiusPlans, useRadiusSessions,
  useRadiusSubscribers, useResetPassword, useSetSubscriberStatus,
} from "@/lib/radius/client";

const bytes = (n: number) => { const u = ["B", "KB", "MB", "GB", "TB"]; let i = 0; while (n >= 1024 && i < 4) { n /= 1024; i++; } return `${n.toFixed(1)} ${u[i]}`; };
const dt = (s: string | null) => (s ? new Date(s).toLocaleString() : "—");

function MockBanner({ mock }: { mock?: boolean }) {
  if (!mock) return null;
  return <Alert><AlertDescription>Sample responses — the RADIUS API isn't connected yet (RADIUS_API_BASE_URL / RADIUS_API_TOKEN not set). Changes here are not saved anywhere except the audit log.</AlertDescription></Alert>;
}

function CreateSubscriber() {
  const plans = useRadiusPlans(); const create = useCreateSubscriber(); const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ username: "", full_name: "", plan_id: "", password: "" });
  const submit = () => create.mutate(f, {
    onSuccess: (r) => { toast({ title: "Subscriber created", description: `${r.data.username}${r.mock ? " (sample response)" : ""}` }); setOpen(false); setF({ username: "", full_name: "", plan_id: "", password: "" }); },
  });
  return <Dialog open={open} onOpenChange={(o) => { setOpen(o); create.reset(); }}>
    <DialogTrigger asChild><Button>New subscriber</Button></DialogTrigger>
    <DialogContent><DialogHeader><DialogTitle>New RADIUS subscriber</DialogTitle></DialogHeader>
      <div className="space-y-3">
        <div><Label>Username</Label><Input value={f.username} onChange={(e) => setF({ ...f, username: e.target.value.toLowerCase() })} /></div>
        <div><Label>Full name</Label><Input value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} /></div>
        <div><Label>Plan</Label><Select value={f.plan_id} onValueChange={(v) => setF({ ...f, plan_id: v })}><SelectTrigger><SelectValue placeholder="Choose a plan" /></SelectTrigger>
          <SelectContent>{plans.data?.data.map((p) => <SelectItem key={p.id} value={p.id}>{p.name} ({p.speed_profile})</SelectItem>)}</SelectContent></Select></div>
        <div><Label>Initial password</Label><Input type="password" autoComplete="new-password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></div>
        {create.error && <p className="text-sm text-destructive">{create.error.message}</p>}
        <Button className="w-full" disabled={create.isPending} onClick={submit}>{create.isPending ? "Creating…" : "Create subscriber"}</Button>
      </div>
    </DialogContent>
  </Dialog>;
}

function Subscribers({ canWrite }: { canWrite: boolean }) {
  const [search, setSearch] = useState(""); const [q, setQ] = useState("");
  const subs = useRadiusSubscribers(q); const plans = useRadiusPlans();
  const setStatus = useSetSubscriberStatus(); const reset = useResetPassword(); const { toast } = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [tempPw, setTempPw] = useState<{ user: string; pw: string } | null>(null);
  const planName = (id: string) => plans.data?.data.find((p) => p.id === id)?.name ?? id;
  const fail = (e: Error) => toast({ title: "Request failed", description: e.message, variant: "destructive" });
  return <div className="space-y-3">
    <MockBanner mock={subs.data?.mock} />
    <div className="flex flex-wrap gap-2">
      <Input className="w-64" placeholder="Search username or name" value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === "Enter" && setQ(search.trim())} />
      <Button variant="outline" onClick={() => setQ(search.trim())}>Search</Button>
      {canWrite && <div className="ml-auto"><CreateSubscriber /></div>}
    </div>
    {tempPw && <Alert><AlertDescription>Temporary password for <b>{tempPw.user}</b>: <code className="font-mono">{tempPw.pw}</code> — shown once. <Button size="sm" variant="ghost" onClick={() => setTempPw(null)}>Hide</Button></AlertDescription></Alert>}
    <QueryState loading={subs.isLoading} error={subs.error} empty={!!subs.data && !subs.data.data.length} emptyText="No subscribers found." />
    {!!subs.data?.data.length && <Table><TableHeader><TableRow><TableHead>Username</TableHead><TableHead>Name</TableHead><TableHead>Plan</TableHead><TableHead>Status</TableHead><TableHead>Expires</TableHead>{canWrite && <TableHead />}</TableRow></TableHeader>
      <TableBody>{subs.data.data.map((s) => <TableRow key={s.id}>
        <TableCell className="font-mono">{s.username}</TableCell><TableCell>{s.full_name}</TableCell><TableCell>{planName(s.plan_id)}</TableCell>
        <TableCell><Badge variant={s.status === "active" ? "default" : "secondary"}>{s.status}</Badge></TableCell><TableCell>{dt(s.expires_at)}</TableCell>
        {canWrite && <TableCell className="space-x-2 text-right whitespace-nowrap">
          <Button size="sm" variant="outline" disabled={busy === s.id} onClick={() => {
            const next = s.status === "active" ? "suspended" : "active";
            if (!confirm(`${next === "suspended" ? "Suspend" : "Reactivate"} ${s.username}?`)) return;
            setBusy(s.id); setStatus.mutate({ id: s.id, status: next }, { onSuccess: (r) => toast({ title: next === "suspended" ? "Suspended" : "Reactivated", description: r.mock ? "Sample response — nothing changed on RADIUS" : s.username }), onError: fail, onSettled: () => setBusy(null) });
          }}>{busy === s.id && setStatus.isPending ? "Working…" : s.status === "active" ? "Suspend" : "Reactivate"}</Button>
          <Button size="sm" variant="outline" disabled={busy === s.id} onClick={() => {
            if (!confirm(`Reset password for ${s.username}?`)) return;
            setBusy(s.id); reset.mutate({ id: s.id }, { onSuccess: (r) => { setTempPw({ user: s.username, pw: r.data.temporary_password }); toast({ title: "Password reset" }); }, onError: fail, onSettled: () => setBusy(null) });
          }}>Reset password</Button>
        </TableCell>}
      </TableRow>)}</TableBody></Table>}
  </div>;
}

function Plans() {
  const p = useRadiusPlans();
  return <div className="space-y-3"><MockBanner mock={p.data?.mock} /><QueryState loading={p.isLoading} error={p.error} empty={!!p.data && !p.data.data.length} emptyText="No plans." />
    {!!p.data?.data.length && <Table><TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Speed profile</TableHead><TableHead>Session limit</TableHead><TableHead>Expiry</TableHead></TableRow></TableHeader>
      <TableBody>{p.data.data.map((x) => <TableRow key={x.id}><TableCell>{x.name}</TableCell><TableCell className="font-mono">{x.speed_profile}</TableCell><TableCell>{x.session_limit}</TableCell><TableCell>{x.expiry_days} days</TableCell></TableRow>)}</TableBody></Table>}</div>;
}

function Sessions() {
  const s = useRadiusSessions(); const a = useRadiusAccounting();
  return <div className="space-y-6"><MockBanner mock={s.data?.mock} />
    <div><h3 className="mb-2 font-semibold">Active sessions</h3><QueryState loading={s.isLoading} error={s.error} empty={!!s.data && !s.data.data.length} emptyText="No active sessions." />
      {!!s.data?.data.length && <Table><TableHeader><TableRow><TableHead>User</TableHead><TableHead>NAS</TableHead><TableHead>IP</TableHead><TableHead>Started</TableHead><TableHead>Down</TableHead><TableHead>Up</TableHead></TableRow></TableHeader>
        <TableBody>{s.data.data.map((x) => <TableRow key={x.id}><TableCell className="font-mono">{x.username}</TableCell><TableCell>{x.nas_name}</TableCell><TableCell className="font-mono">{x.framed_ip}</TableCell><TableCell>{dt(x.started_at)}</TableCell><TableCell>{bytes(x.input_octets)}</TableCell><TableCell>{bytes(x.output_octets)}</TableCell></TableRow>)}</TableBody></Table>}</div>
    <div><h3 className="mb-2 font-semibold">Accounting history</h3><QueryState loading={a.isLoading} error={a.error} empty={!!a.data && !a.data.data.length} emptyText="No accounting records." />
      {!!a.data?.data.length && <Table><TableHeader><TableRow><TableHead>User</TableHead><TableHead>NAS</TableHead><TableHead>Start</TableHead><TableHead>Stop</TableHead><TableHead>Duration</TableHead><TableHead>Down / Up</TableHead><TableHead>Cause</TableHead></TableRow></TableHeader>
        <TableBody>{a.data.data.map((x) => <TableRow key={x.id}><TableCell className="font-mono">{x.username}</TableCell><TableCell>{x.nas_name}</TableCell><TableCell>{dt(x.started_at)}</TableCell><TableCell>{dt(x.stopped_at)}</TableCell><TableCell>{Math.round(x.duration_s / 60)} min</TableCell><TableCell>{bytes(x.input_octets)} / {bytes(x.output_octets)}</TableCell><TableCell>{x.terminate_cause ?? "—"}</TableCell></TableRow>)}</TableBody></Table>}</div>
  </div>;
}

function Nas() {
  const n = useRadiusNas();
  return <div className="space-y-3"><MockBanner mock={n.data?.mock} /><QueryState loading={n.isLoading} error={n.error} empty={!!n.data && !n.data.data.length} emptyText="No NAS devices." />
    {!!n.data?.data.length && <Table><TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Source IP</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
      <TableBody>{n.data.data.map((x) => <TableRow key={x.id}><TableCell>{x.name}</TableCell><TableCell className="font-mono">{x.source_ip}</TableCell><TableCell><Badge variant={x.status === "online" ? "default" : "destructive"}>{x.status}</Badge></TableCell></TableRow>)}</TableBody></Table>}
    <p className="text-xs text-muted-foreground">Shared secrets are kept on the RADIUS server and never shown here.</p></div>;
}

export default function Radius() {
  const { hasRole } = useAuth();
  return <div className="space-y-6 p-6">
    <div><h1 className="text-2xl font-bold">RADIUS management</h1><p className="text-muted-foreground">Subscribers, plans, sessions and NAS devices from the RADIUS server.</p></div>
    <Card><CardHeader className="pb-2"><CardTitle className="sr-only">RADIUS</CardTitle></CardHeader><CardContent>
      <Tabs defaultValue="subs"><TabsList><TabsTrigger value="subs">Subscribers</TabsTrigger><TabsTrigger value="plans">Service plans</TabsTrigger><TabsTrigger value="sessions">Sessions & accounting</TabsTrigger><TabsTrigger value="nas">NAS devices</TabsTrigger></TabsList>
        <TabsContent value="subs"><Subscribers canWrite={hasRole("noc")} /></TabsContent>
        <TabsContent value="plans"><Plans /></TabsContent>
        <TabsContent value="sessions"><Sessions /></TabsContent>
        <TabsContent value="nas"><Nas /></TabsContent>
      </Tabs>
    </CardContent></Card>
  </div>;
}
