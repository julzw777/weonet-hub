import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useCustomers, useSubscriptions } from "@/lib/data/hooks";
import { useBilling, useBillingAction, billingMoney, type BillingPayment } from "@/lib/data/billing";
import { allocationError } from "@/lib/billing-rules";

export const channels = { bank_transfer: "Bank transfer", orange_money: "Orange Money", afrimoney: "AfriMoney", vult: "Vult" };
function CustomerSelect({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const customers = useCustomers();
  return <div><Label>Customer</Label><Select value={value} onValueChange={onChange}><SelectTrigger aria-label="Customer"><SelectValue placeholder="Choose customer" /></SelectTrigger><SelectContent>{customers.data?.map((c) => <SelectItem key={c.id} value={c.id}>{c.full_name} · {c.account_number}</SelectItem>)}</SelectContent></Select>{customers.error && <p className="text-sm text-destructive">{customers.error.message}</p>}</div>;
}
export function InvoiceForm({ close }: { close: () => void }) {
  const create = useBillingAction("create_invoice");
  const [customer, setCustomer] = useState("");
  const [due, setDue] = useState("");
  const [notes, setNotes] = useState("");
  const [service, setService] = useState("none");
  const services = useSubscriptions(customer || undefined);
  const [lines, setLines] = useState([{ description: "", quantity: "1", unit_price: "" }]);
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    create.mutate({ _customer_id: customer, _due_date: due, _notes: notes, ...(service !== "none" ? { _subscription_id: service } : {}), _items: lines.map((l) => ({ description: l.description, quantity: Number(l.quantity), unit_price: Number(l.unit_price) })) }, { onSuccess: () => { toast.success("Invoice draft saved"); close(); }, onError: (e) => toast.error(e.message) });
  };
  return <Dialog open onOpenChange={(o) => !o && close()}><DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto"><DialogHeader><DialogTitle>New invoice</DialogTitle></DialogHeader><form onSubmit={submit} className="space-y-4"><CustomerSelect value={customer} onChange={(id) => { setCustomer(id); setService("none"); }} /><div><Label>Service (optional)</Label><Select value={service} onValueChange={setService} disabled={!customer}><SelectTrigger aria-label="Service"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">Not linked to a service</SelectItem>{services.data?.map((s) => <SelectItem key={s.id} value={s.id}>{s.pppoe_username || s.id.slice(0, 8)} · {s.status}</SelectItem>)}</SelectContent></Select></div><div><Label htmlFor="invoice-due">Due date</Label><Input id="invoice-due" type="date" required value={due} onChange={(e) => setDue(e.target.value)} /></div><div className="space-y-3">{lines.map((l, index) => <div key={index} className="grid grid-cols-[minmax(0,1fr)_70px_100px_36px] items-end gap-2">{(["description", "quantity", "unit_price"] as const).map((key) => <div key={key}><Label htmlFor={`${key}-${index}`}>{key === "description" ? "Description" : key === "quantity" ? "Qty" : "Unit price"}</Label><Input id={`${key}-${index}`} required type={key === "description" ? "text" : "number"} min={key === "quantity" ? "0.01" : "0"} step="0.01" maxLength={500} value={l[key]} onChange={(e) => setLines((prev) => prev.map((v, i) => i === index ? { ...v, [key]: e.target.value } : v))} /></div>)}<Button type="button" variant="ghost" size="icon" aria-label="Remove line" disabled={lines.length === 1} onClick={() => setLines((prev) => prev.filter((_, i) => i !== index))}><Trash2 className="h-4 w-4" /></Button></div>)}</div><Button type="button" variant="outline" size="sm" disabled={lines.length >= 100} onClick={() => setLines((p) => [...p, { description: "", quantity: "1", unit_price: "" }])}><Plus className="mr-2 h-4 w-4" />Add line</Button><div><Label htmlFor="invoice-notes">Notes</Label><Input id="invoice-notes" maxLength={2000} value={notes} onChange={(e) => setNotes(e.target.value)} /></div><DialogFooter><Button disabled={!customer || create.isPending} type="submit">{create.isPending ? "Saving…" : "Save draft"}</Button></DialogFooter></form></DialogContent></Dialog>;
}
export function PaymentForm({ close }: { close: () => void }) {
  const record = useBillingAction("record_payment");
  const [customer, setCustomer] = useState("");
  const [channel, setChannel] = useState("bank_transfer");
  const [reference, setReference] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  return <Dialog open onOpenChange={(o) => !o && close()}><DialogContent><DialogHeader><DialogTitle>Record received payment</DialogTitle></DialogHeader><form className="space-y-4" onSubmit={(e) => { e.preventDefault(); record.mutate({ _customer_id: customer, _channel: channel, _reference: reference, _amount: Number(amount), _received_date: date }, { onSuccess: () => { toast.success("Payment recorded"); close(); }, onError: (e) => toast.error(e.message) }); }}><CustomerSelect value={customer} onChange={setCustomer} /><div><Label>Channel</Label><Select value={channel} onValueChange={setChannel}><SelectTrigger aria-label="Channel"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(channels).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent></Select></div><div><Label htmlFor="payment-reference">Reference</Label><Input id="payment-reference" required maxLength={200} value={reference} onChange={(e) => setReference(e.target.value)} /></div><div className="grid grid-cols-2 gap-3"><div><Label htmlFor="payment-amount">Amount</Label><Input id="payment-amount" type="number" min="0.01" step="0.01" required value={amount} onChange={(e) => setAmount(e.target.value)} /></div><div><Label htmlFor="payment-date">Received date</Label><Input id="payment-date" type="date" max={new Date().toISOString().slice(0, 10)} required value={date} onChange={(e) => setDate(e.target.value)} /></div></div><DialogFooter><Button type="submit" disabled={!customer || record.isPending}>{record.isPending ? "Saving…" : "Record payment"}</Button></DialogFooter></form></DialogContent></Dialog>;
}
export function ReconcileForm({ payment, close }: { payment: BillingPayment; close: () => void }) {
  const billing = useBilling();
  const allocate = useBillingAction("allocate_payment");
  const [id, setId] = useState("");
  const [amount, setAmount] = useState("");
  const invoices = billing.data?.invoices.filter((i) => i.state === "issued" && i.balance > 0 && !payment.failed && i.currency_code === payment.currency_code && (!payment.customer_id || i.customer_id === payment.customer_id)) ?? [];
  const invoice = invoices.find((i) => i.id === id);
  return <Dialog open onOpenChange={(o) => !o && close()}><DialogContent><DialogHeader><DialogTitle>Allocate {payment.reference}</DialogTitle></DialogHeader><p className="text-sm text-muted-foreground">Unallocated: {billingMoney(payment.available, payment.currency_symbol)}</p><form className="space-y-4" onSubmit={(e) => { e.preventDefault(); if (!invoice) return; const error = allocationError(Number(amount), payment.available, invoice.balance); if (error) return toast.error(error); allocate.mutate({ _payment_id: payment.id, _invoice_id: id, _amount: Number(amount) }, { onSuccess: () => { toast.success("Payment allocated"); close(); }, onError: (e) => toast.error(e.message) }); }}><Label>Invoice</Label><Select value={id} onValueChange={(v) => { setId(v); const i = invoices.find((i) => i.id === v); if (i) setAmount(Math.min(i.balance, payment.available).toFixed(2)); }}><SelectTrigger aria-label="Invoice"><SelectValue placeholder={invoices.length ? "Choose invoice" : "No eligible issued invoices"} /></SelectTrigger><SelectContent>{invoices.map((i) => <SelectItem key={i.id} value={i.id}>{i.number} · {billingMoney(i.balance, i.currency_symbol)}</SelectItem>)}</SelectContent></Select><div><Label htmlFor="allocation-amount">Allocation amount</Label><Input id="allocation-amount" type="number" min="0.01" step="0.01" required value={amount} onChange={(e) => setAmount(e.target.value)} /></div><DialogFooter><Button type="submit" disabled={!invoice || allocate.isPending}>{allocate.isPending ? "Allocating…" : "Allocate"}</Button></DialogFooter></form></DialogContent></Dialog>;
}