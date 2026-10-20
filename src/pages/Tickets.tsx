import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Clock, User } from "lucide-react";
import { QueryState } from "@/components/ui/query-state";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { useCustomers } from "@/lib/data/hooks";
import { useSaveTicket, useTickets, type Ticket } from "@/lib/data/ops";
import { canEditTickets, canMoveTicket, TICKET_CATEGORIES, TICKET_PRIORITIES, TICKET_STATUSES, type TicketStatus } from "@/lib/ops-rules";

const label = (s: string) => s.replace("_", " ").replace(/^\w/, (c) => c.toUpperCase());
const prioVariant = (p: string) => (p === "urgent" || p === "high" ? "destructive" : p === "medium" ? "default" : "secondary");

export default function Tickets() {
  const { roles } = useAuth();
  const editable = canEditTickets(roles);
  const { data = [], isLoading, error } = useTickets();
  const save = useSaveTicket();
  const { toast } = useToast();
  const [open, setOpen] = useState<Partial<Ticket> | null>(null);

  const move = (t: Ticket, status: TicketStatus) =>
    save.mutate({ id: t.id, status }, { onError: (e) => toast({ title: "Not updated", description: e.message, variant: "destructive" }) });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Support Tickets</h1>
          <p className="text-muted-foreground">Customer issues, installations and outages</p>
        </div>
        {editable && <Button onClick={() => setOpen({ priority: "medium", category: "support" })}><Plus className="mr-2 h-4 w-4" />New ticket</Button>}
      </div>
      <QueryState loading={isLoading} error={error as Error | null} empty={!isLoading && !error && data.length === 0} emptyText="No tickets yet." />
      {data.length > 0 && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3 xl:grid-cols-5">
          {TICKET_STATUSES.map((s) => {
            const list = data.filter((t) => t.status === s);
            return (
              <Card key={s}>
                <CardHeader className="pb-3"><CardTitle className="flex justify-between text-sm">{label(s)}<Badge variant="secondary">{list.length}</Badge></CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  {list.map((t) => (
                    <div key={t.id} className="space-y-2 rounded-md border bg-muted/30 p-3 text-sm">
                      <button className="text-left font-medium hover:underline" onClick={() => setOpen(t)}>{t.subject}</button>
                      <div className="flex flex-wrap gap-1"><Badge variant={prioVariant(t.priority)}>{t.priority}</Badge><Badge variant="outline">{t.category}</Badge></div>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground"><User className="h-3 w-3" />{t.customers?.full_name ?? "No customer"}</div>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground"><Clock className="h-3 w-3" />{t.number} · {new Date(t.created_at).toLocaleDateString()}</div>
                      {editable && t.status !== "closed" && (
                        <Select value="" onValueChange={(v) => move(t, v as TicketStatus)}>
                          <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="Move to…" /></SelectTrigger>
                          <SelectContent>{TICKET_STATUSES.filter((x) => canMoveTicket(s, x)).map((x) => <SelectItem key={x} value={x}>{label(x)}</SelectItem>)}</SelectContent>
                        </Select>
                      )}
                    </div>
                  ))}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
      {open && <TicketDialog ticket={open} editable={editable} onClose={() => setOpen(null)} />}
    </div>
  );
}

function TicketDialog({ ticket, editable, onClose }: { ticket: Partial<Ticket>; editable: boolean; onClose: () => void }) {
  const [v, setV] = useState(ticket);
  const { data: customers = [] } = useCustomers();
  const save = useSaveTicket();
  const { toast } = useToast();
  const ro = !editable || ticket.status === "closed";
  const submit = () => save.mutate(
    { id: v.id, subject: v.subject, description: v.description, priority: v.priority, category: v.category, customer_id: v.customer_id ?? null },
    { onSuccess: () => { toast({ title: v.id ? "Ticket updated" : "Ticket created" }); onClose(); },
      onError: (e) => toast({ title: "Not saved", description: e.message, variant: "destructive" }) });
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader><DialogTitle>{v.id ? v.number : "New ticket"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Subject</Label><Input disabled={ro} maxLength={200} value={v.subject ?? ""} onChange={(e) => setV({ ...v, subject: e.target.value })} /></div>
          <div><Label>Customer</Label>
            <Select disabled={ro} value={v.customer_id ?? "none"} onValueChange={(x) => setV({ ...v, customer_id: x === "none" ? null : x })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="none">No customer</SelectItem>{customers.map((c) => <SelectItem key={c.id} value={c.id}>{c.full_name} ({c.account_number})</SelectItem>)}</SelectContent>
            </Select></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Priority</Label><Select disabled={ro} value={v.priority} onValueChange={(x) => setV({ ...v, priority: x })}><SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{TICKET_PRIORITIES.map((p) => <SelectItem key={p} value={p}>{label(p)}</SelectItem>)}</SelectContent></Select></div>
            <div><Label>Category</Label><Select disabled={ro} value={v.category} onValueChange={(x) => setV({ ...v, category: x })}><SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{TICKET_CATEGORIES.map((p) => <SelectItem key={p} value={p}>{label(p)}</SelectItem>)}</SelectContent></Select></div>
          </div>
          <div><Label>Description</Label><Textarea disabled={ro} rows={4} value={v.description ?? ""} onChange={(e) => setV({ ...v, description: e.target.value })} /></div>
          {!ro && <Button className="w-full" disabled={save.isPending || !v.subject?.trim()} onClick={submit}>{save.isPending ? "Saving…" : "Save"}</Button>}
        </div>
      </DialogContent>
    </Dialog>
  );
}
