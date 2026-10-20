import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { QueryState } from "@/components/ui/query-state";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Pencil } from "lucide-react";
import { useAuth, formatMoney, CURRENCY } from "@/lib/auth";
import { canEditPlans } from "@/lib/rules";
import { usePlans, useSavePlan, type Plan } from "@/lib/data/hooks";

export default function Plans() {
  const { roles } = useAuth();
  const editable = canEditPlans(roles);
  const { data, isLoading, error } = usePlans();
  const save = useSavePlan();
  const [f, setF] = useState({ name: "", technology: "fiber", down: "", up: "", price: "" });
  const [editing, setEditing] = useState<Plan | null>(null);

  const add = () => {
    const down = Number(f.down), up = Number(f.up), price = Number(f.price);
    if (!f.name.trim() || !(down > 0) || !(up > 0) || !(price >= 0) || f.price === "") return toast.error("Fill in name, speeds and price");
    save.mutate({ name: f.name.trim().slice(0, 100), technology: f.technology, download_mbps: Math.round(down), upload_mbps: Math.round(up), monthly_price: price },
      { onSuccess: () => { toast.success("Plan added"); setF({ name: "", technology: "fiber", down: "", up: "", price: "" }); }, onError: (e) => toast.error(e.message) });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Plans</h1>
        <p className="text-muted-foreground">Service plans and monthly prices in {CURRENCY.code} ({CURRENCY.symbol})</p>
      </div>
      {editable ? (
        <Card>
          <CardHeader><CardTitle>Add plan</CardTitle></CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-6 md:items-end">
            <div className="md:col-span-2"><Label>Name</Label><Input value={f.name} maxLength={100} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
            <div><Label>Technology</Label>
              <Select value={f.technology} onValueChange={(v) => setF({ ...f, technology: v })}><SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="fiber">Fiber</SelectItem><SelectItem value="wireless">Wireless</SelectItem><SelectItem value="hotspot">Hotspot</SelectItem></SelectContent></Select></div>
            <div><Label>Down / Up (Mbps)</Label><div className="flex gap-1"><Input type="number" min={1} value={f.down} onChange={(e) => setF({ ...f, down: e.target.value })} /><Input type="number" min={1} value={f.up} onChange={(e) => setF({ ...f, up: e.target.value })} /></div></div>
            <div><Label>Monthly price ({CURRENCY.symbol})</Label><Input type="number" min={0} step="0.01" value={f.price} onChange={(e) => setF({ ...f, price: e.target.value })} /></div>
            <Button onClick={add} disabled={save.isPending}>Add plan</Button>
          </CardContent>
        </Card>
      ) : <p className="text-sm text-muted-foreground">Only Finance or Admin can change plans.</p>}
      <Card>
        <CardContent className="p-0">
          <QueryState loading={isLoading} error={error} empty={data?.length === 0} emptyText="No plans yet." />
          {!!data?.length && (
            <Table>
              <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Technology</TableHead><TableHead>Speed</TableHead><TableHead>Price</TableHead><TableHead>Active</TableHead>{editable && <TableHead />}</TableRow></TableHeader>
              <TableBody>
                {data.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{p.name}</TableCell>
                    <TableCell className="capitalize">{p.technology}</TableCell>
                    <TableCell>{p.download_mbps}/{p.upload_mbps} Mbps</TableCell>
                    <TableCell>{formatMoney(Number(p.monthly_price))}</TableCell>
                    <TableCell><Switch checked={p.active} disabled={!editable || save.isPending}
                      onCheckedChange={(v) => save.mutate({ id: p.id, name: p.name, download_mbps: p.download_mbps, upload_mbps: p.upload_mbps, monthly_price: p.monthly_price, active: v }, { onError: (e) => toast.error(e.message) })} /></TableCell>
                    {editable && <TableCell className="text-right"><Button size="sm" variant="ghost" aria-label={`Edit ${p.name}`} onClick={() => setEditing(p)}><Pencil className="h-4 w-4" /></Button></TableCell>}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
      {editing && <PlanDialog plan={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function PlanDialog({ plan, onClose }: { plan: Plan; onClose: () => void }) {
  const save = useSavePlan();
  const [f, setF] = useState({ name: plan.name, technology: plan.technology, down: String(plan.download_mbps), up: String(plan.upload_mbps), price: String(plan.monthly_price), active: plan.active });
  const submit = () => {
    const down = Number(f.down), up = Number(f.up), price = Number(f.price);
    if (!f.name.trim() || !(down > 0) || !(up > 0) || !(price >= 0) || f.price === "") return toast.error("Fill in name, speeds and price");
    save.mutate({ id: plan.id, name: f.name.trim().slice(0, 100), technology: f.technology, download_mbps: Math.round(down), upload_mbps: Math.round(up), monthly_price: price, active: f.active },
      { onSuccess: () => { toast.success("Plan updated"); onClose(); }, onError: (e) => toast.error(e.message) });
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Edit plan</DialogTitle></DialogHeader>
        <div className="grid gap-3">
          <div><Label>Name</Label><Input value={f.name} maxLength={100} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
          <div><Label>Technology</Label>
            <Select value={f.technology} onValueChange={(v) => setF({ ...f, technology: v })}><SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="fiber">Fiber</SelectItem><SelectItem value="wireless">Wireless</SelectItem><SelectItem value="hotspot">Hotspot</SelectItem></SelectContent></Select></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Down (Mbps)</Label><Input type="number" min={1} value={f.down} onChange={(e) => setF({ ...f, down: e.target.value })} /></div>
            <div><Label>Up (Mbps)</Label><Input type="number" min={1} value={f.up} onChange={(e) => setF({ ...f, up: e.target.value })} /></div>
          </div>
          <div><Label>Monthly price ({CURRENCY.symbol})</Label><Input type="number" min={0} step="0.01" value={f.price} onChange={(e) => setF({ ...f, price: e.target.value })} /></div>
          <div className="flex items-center gap-2"><Switch checked={f.active} onCheckedChange={(v) => setF({ ...f, active: v })} /><Label>Active (offered to customers)</Label></div>
          <p className="text-xs text-muted-foreground">Changing the price does not change invoices already issued. Plans can't be deleted while services use them — switch Active off instead.</p>
        </div>
        <DialogFooter><Button onClick={submit} disabled={save.isPending}>{save.isPending ? "Saving…" : "Save"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
