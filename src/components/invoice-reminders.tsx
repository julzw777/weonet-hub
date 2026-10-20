import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusBadge } from "@/components/ui/status-badge";
import { reminderNextStatuses, type ReminderStatus } from "@/lib/billing-rules";

const reminderChannels = { email: "Email", sms: "SMS", phone: "Phone call", whatsapp: "WhatsApp", in_person: "In person", letter: "Letter" };
const fmt = (t: string | null) => (t ? new Date(t).toLocaleString() : null);

export function InvoiceReminders({ invoiceId, canLog, issued }: { invoiceId: string; canLog: boolean; issued: boolean }) {
  const qc = useQueryClient();
  const key = ["reminders", invoiceId];
  const list = useQuery({ queryKey: key, queryFn: async () => {
    const { data, error } = await supabase.from("invoice_reminders").select("*").eq("invoice_id", invoiceId).order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data;
  }});
  const done = () => qc.invalidateQueries({ queryKey: key });
  const log = useMutation({ mutationFn: async (a: { _invoice_id: string; _channel: string; _recipient?: string; _note?: string }) => { const { error } = await supabase.rpc("log_invoice_reminder", a); if (error) throw new Error(error.message); }, onSuccess: done });
  const setStatus = useMutation({ mutationFn: async (a: { _id: string; _status: string; _reason?: string }) => { const { error } = await supabase.rpc("set_reminder_status", a); if (error) throw new Error(error.message); }, onSuccess: done });
  const [channel, setChannel] = useState("sms");
  const [recipient, setRecipient] = useState("");
  const [note, setNote] = useState("");
  const update = (id: string, status: ReminderStatus) => {
    let reason: string | undefined;
    if (status === "failed") { reason = prompt("Why did delivery fail?")?.trim(); if (!reason) return; }
    setStatus.mutate({ _id: id, _status: status, _reason: reason }, { onSuccess: () => toast.success(`Reminder marked ${status}`), onError: (e) => toast.error(e.message) });
  };
  return <div className="space-y-2">
    <h3 className="text-sm font-medium">Reminder history</h3>
    <p className="text-xs text-muted-foreground">Reminders are not sent by the system. Record reminders staff sent by hand; automatic sending stays off until Weonet confirms timing and delivery rules.</p>
    {list.isLoading && <p className="text-xs text-muted-foreground">Loading…</p>}
    {list.error && <p className="text-xs text-destructive">{list.error.message}</p>}
    {list.data?.length === 0 && <p className="text-xs text-muted-foreground">No reminders recorded.</p>}
    {list.data?.map((r) => <div key={r.id} className="space-y-1 rounded border border-border p-2 text-xs">
      <div className="flex flex-wrap items-center gap-2"><StatusBadge status={r.status} /><span>{reminderChannels[r.channel as keyof typeof reminderChannels] ?? r.channel}</span>{r.recipient && <span className="break-all text-muted-foreground">to {r.recipient}</span>}</div>
      <p className="text-muted-foreground">Logged {fmt(r.created_at)}{r.sent_at && ` · Sent ${fmt(r.sent_at)}`}{r.delivered_at && ` · Delivered ${fmt(r.delivered_at)}`}{r.failed_at && ` · Failed ${fmt(r.failed_at)}`}</p>
      {r.failure_reason && <p className="break-words text-destructive">{r.failure_reason}</p>}
      {r.note && <p className="break-words text-muted-foreground">{r.note}</p>}
      {canLog && reminderNextStatuses(r.status as ReminderStatus).length > 0 && <div className="flex gap-2">{reminderNextStatuses(r.status as ReminderStatus).map((s) => <Button key={s} size="sm" variant="outline" disabled={setStatus.isPending} onClick={() => update(r.id, s)}>Mark {s}</Button>)}</div>}
    </div>)}
    {canLog && issued && <form className="grid gap-2 rounded border border-border p-2" onSubmit={(e) => { e.preventDefault(); log.mutate({ _invoice_id: invoiceId, _channel: channel, _recipient: recipient, _note: note }, { onSuccess: () => { toast.success("Reminder recorded"); setRecipient(""); setNote(""); }, onError: (e) => toast.error(e.message) }); }}>
      <Label>Record a reminder</Label>
      <Select value={channel} onValueChange={setChannel}><SelectTrigger aria-label="Reminder channel"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(reminderChannels).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent></Select>
      <Input aria-label="Recipient" placeholder="Recipient (phone or email)" maxLength={200} value={recipient} onChange={(e) => setRecipient(e.target.value)} />
      <Input aria-label="Reminder note" placeholder="Note" maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} />
      <Button size="sm" type="submit" disabled={log.isPending}>{log.isPending ? "Saving…" : "Record reminder"}</Button>
    </form>}
  </div>;
}
