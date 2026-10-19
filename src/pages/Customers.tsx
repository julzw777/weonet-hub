import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Plus, Phone, Mail, Pencil } from "lucide-react";
import { StatusBadge } from "@/components/ui/status-badge";
import { QueryState } from "@/components/ui/query-state";
import { toast } from "sonner";
import { useAuth, formatMoney } from "@/lib/auth";
import { canEditCustomers, canEditSubscriptions, nextStatuses, type SubStatus } from "@/lib/rules";
import { useCustomers, useSaveCustomer, useSubscriptions, usePlans, useCreateSubscription, useSetSubscriptionStatus, type Customer } from "@/lib/data/hooks";
import { CustomerInvoices } from "./Billing";

const empty = { full_name: "", email: "", phone: "", customer_type: "residential", status: "active", notes: "" };

function CustomerDialog({ open, onClose, initial }: { open: boolean; onClose: () => void; initial?: Customer }) {
  const [f, setF] = useState(empty);
  const save = useSaveCustomer();
  useEffect(() => {
    if (open) setF(initial ? { full_name: initial.full_name, email: initial.email ?? "", phone: initial.phone ?? "", customer_type: initial.customer_type, status: initial.status, notes: initial.notes ?? "" } : empty);
  }, [open, initial]);
  const submit = () => {
    if (!f.full_name.trim()) return toast.error("Name is required");
    if (f.email && !/^\S+@\S+\.\S+$/.test(f.email)) return toast.error("Email looks invalid");
    save.mutate(
      { id: initial?.id, full_name: f.full_name.trim().slice(0, 200), email: f.email || null, phone: f.phone || null, customer_type: f.customer_type, status: f.status, notes: f.notes || null },
      { onSuccess: () => { toast.success("Customer saved"); onClose(); }, onError: (e) => toast.error(e.message) },
    );
  };
  const set = (k: keyof typeof empty) => (v: string) => setF((p) => ({ ...p, [k]: v }));
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>{initial ? "Edit customer" : "Add customer"}</DialogTitle></DialogHeader>
        <div className="grid gap-3">
          <div><Label>Full name</Label><Input value={f.full_name} maxLength={200} onChange={(e) => set("full_name")(e.target.value)} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Email</Label><Input value={f.email} maxLength={255} onChange={(e) => set("email")(e.target.value)} /></div>
            <div><Label>Phone</Label><Input value={f.phone} maxLength={30} onChange={(e) => set("phone")(e.target.value)} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Type</Label>
              <Select value={f.customer_type} onValueChange={set("customer_type")}><SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="residential">Residential</SelectItem><SelectItem value="business">Business</SelectItem></SelectContent></Select></div>
            <div><Label>Status</Label>
              <Select value={f.status} onValueChange={set("status")}><SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="active">Active</SelectItem><SelectItem value="inactive">Inactive</SelectItem><SelectItem value="suspended">Suspended</SelectItem></SelectContent></Select></div>
          </div>
          <div><Label>Notes</Label><Textarea value={f.notes} maxLength={2000} onChange={(e) => set("notes")(e.target.value)} /></div>
        </div>
        <DialogFooter><Button onClick={submit} disabled={save.isPending}>{save.isPending ? "Saving…" : "Save"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Services({ customerId, editable }: { customerId: string; editable: boolean }) {
  const subs = useSubscriptions(customerId);
  const plans = usePlans();
  const create = useCreateSubscription();
  const setStatus = useSetSubscriptionStatus();
  const [planId, setPlanId] = useState("");
  const activePlans = (plans.data ?? []).filter((p) => p.active);
  return (
    <div className="space-y-4">
      {editable && (
        <div className="flex gap-2">
          <Select value={planId} onValueChange={setPlanId}>
            <SelectTrigger className="w-72"><SelectValue placeholder={activePlans.length ? "Choose a plan" : "No active plans – add one on Plans"} /></SelectTrigger>
            <SelectContent>{activePlans.map((p) => <SelectItem key={p.id} value={p.id}>{p.name} · {formatMoney(Number(p.monthly_price))}</SelectItem>)}</SelectContent>
          </Select>
          <Button disabled={!planId || create.isPending} onClick={() => create.mutate({ customer_id: customerId, plan_id: planId }, { onSuccess: () => { toast.success("Service added as pending"); setPlanId(""); }, onError: (e) => toast.error(e.message) })}>
            <Plus className="mr-1 h-4 w-4" />Add service
          </Button>
        </div>
      )}
      <QueryState loading={subs.isLoading} error={subs.error} empty={subs.data?.length === 0} emptyText="No services yet." />
      {subs.data?.map((s) => (
        <div key={s.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-4">
          <div>
            <h4 className="font-medium">{s.service_plans?.name ?? "Plan"}</h4>
            <p className="text-sm text-muted-foreground">
              {s.service_plans ? formatMoney(Number(s.service_plans.monthly_price)) + "/month" : ""} · Started {s.start_date ?? "—"}{s.end_date ? ` · Ended ${s.end_date}` : ""}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <StatusBadge status={s.status} />
            {editable && nextStatuses(s.status as SubStatus).map((n) => (
              <Button key={n} size="sm" variant={n === "cancelled" ? "destructive" : "outline"} disabled={setStatus.isPending}
                onClick={() => (n !== "cancelled" || confirm("Cancel this service? This cannot be undone.")) &&
                  setStatus.mutate({ id: s.id, status: n }, { onSuccess: () => toast.success(`Service ${n}`), onError: (e) => toast.error(e.message) })}>
                {n === "active" ? "Activate" : n === "suspended" ? "Suspend" : "Cancel"}
              </Button>
            ))}
          </div>
        </div>
      ))}
      <p className="text-xs text-muted-foreground">Status changes here are recorded only. Network access changes (RADIUS / router) arrive in a later stage.</p>
    </div>
  );
}

export default function Customers() {
  const { roles } = useAuth();
  const { data, isLoading, error } = useCustomers();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [dialog, setDialog] = useState<{ open: boolean; edit?: Customer }>({ open: false });
  const editable = canEditCustomers(roles);

  const list = (data ?? []).filter((c) => [c.full_name, c.email, c.account_number, c.phone].some((v) => v?.toLowerCase().includes(search.toLowerCase())));
  const selected = data?.find((c) => c.id === selectedId) ?? list[0];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Customers</h1>
          <p className="text-muted-foreground">Manage customer accounts and view 360° profiles</p>
        </div>
        <Button disabled={!editable} title={editable ? undefined : "Only Care or Admin can add customers"} onClick={() => setDialog({ open: true })}>
          <Plus className="mr-2 h-4 w-4" />Add Customer
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-4">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>Customer List</CardTitle>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Search customers..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <QueryState loading={isLoading} error={error} empty={!isLoading && list.length === 0} emptyText={data?.length ? "No matches." : "No customers yet."} />
            {list.map((c) => (
              <div key={c.id} onClick={() => setSelectedId(c.id)}
                className={`cursor-pointer border-b border-border p-3 last:border-b-0 hover:bg-accent ${selected?.id === c.id ? "bg-accent" : ""}`}>
                <div className="flex items-start justify-between">
                  <div><h4 className="text-sm font-medium">{c.full_name}</h4><p className="text-xs text-muted-foreground">{c.account_number}</p></div>
                  <StatusBadge status={c.status} />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="lg:col-span-3">
          {!selected ? <QueryState empty emptyText="Select or add a customer." /> : (
            <>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-2xl">{selected.full_name}</CardTitle>
                    <p className="text-muted-foreground">{selected.account_number} · <span className="capitalize">{selected.customer_type}</span></p>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={selected.status} />
                    {editable && <Button size="sm" variant="outline" onClick={() => setDialog({ open: true, edit: selected })}><Pencil className="mr-1 h-4 w-4" />Edit</Button>}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <Tabs defaultValue="profile">
                  <TabsList className="grid w-full grid-cols-4">
                    <TabsTrigger value="profile">Profile</TabsTrigger>
                    <TabsTrigger value="services">Services</TabsTrigger>
                    <TabsTrigger value="invoices">Invoices</TabsTrigger>
                    <TabsTrigger value="tickets">Tickets</TabsTrigger>
                  </TabsList>
                  <TabsContent value="profile" className="space-y-3 pt-4 text-sm">
                    <div className="flex items-center gap-2"><Mail className="h-4 w-4 text-muted-foreground" />{selected.email || "—"}</div>
                    <div className="flex items-center gap-2"><Phone className="h-4 w-4 text-muted-foreground" />{selected.phone || "—"}</div>
                    <div><span className="text-muted-foreground">Customer since: </span>{new Date(selected.created_at).toLocaleDateString()}</div>
                    {selected.notes && <p className="rounded-md bg-muted p-3">{selected.notes}</p>}
                  </TabsContent>
                  <TabsContent value="services" className="pt-4"><Services customerId={selected.id} editable={canEditSubscriptions(roles)} /></TabsContent>
                  <TabsContent value="invoices" className="pt-4">{roles.some((r) => ["admin", "finance", "care", "readonly"].includes(r)) ? <CustomerInvoices customerId={selected.id} /> : <QueryState empty emptyText="Your role cannot view billing records." />}</TabsContent>
                  <TabsContent value="tickets" className="pt-4"><QueryState empty emptyText="Customer-linked tickets are coming in the tickets stage." /></TabsContent>
                </Tabs>
              </CardContent>
            </>
          )}
        </Card>
      </div>
      <CustomerDialog open={dialog.open} initial={dialog.edit} onClose={() => setDialog({ open: false })} />
    </div>
  );
}
