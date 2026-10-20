import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StatusBadge } from "@/components/ui/status-badge";
import { QueryState } from "@/components/ui/query-state";
import { Package, Users, AlertTriangle, Plus, Download, Search } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { useCustomers } from "@/lib/data/hooks";
import { useAdjustStock, useItems, useLoanEquipment, useLoans, useMovements, useRecordUsage, useReturnEquipment, useSaveItem, useTickets, type Item } from "@/lib/data/ops";
import { canManageItems, canUseSupplies, ITEM_CATEGORIES, stockChangeError, stockLevel } from "@/lib/ops-rules";

type Dlg = { type: "item"; item: Partial<Item> } | { type: "stock"; item: Item } | { type: "usage"; item?: Item } | { type: "loan"; item?: Item } | null;

const csv = (rows: (string | number)[][]) => {
  const blob = new Blob([rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n")], { type: "text/csv" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `inventory-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
};

export default function Inventory() {
  const { roles } = useAuth();
  const manage = canManageItems(roles), use = canUseSupplies(roles);
  const items = useItems(), loans = useLoans(), moves = useMovements();
  const ret = useReturnEquipment();
  const { toast } = useToast();
  const [q, setQ] = useState("");
  const [dlg, setDlg] = useState<Dlg>(null);
  const list = (items.data ?? []).filter((i) => (i.name + i.sku).toLowerCase().includes(q.toLowerCase()));
  const low = (items.data ?? []).filter((i) => stockLevel(Number(i.stock_qty), Number(i.reorder_level)) !== "in_stock").length;
  const active = (loans.data ?? []).filter((l) => l.status === "on_loan");
  const doReturn = (id: string, outcome: "returned" | "lost") => {
    const condition = outcome === "returned" ? (window.prompt("Condition (good / damaged)", "good") ?? "") : "";
    ret.mutate({ loan: id, outcome, condition }, { onSuccess: () => toast({ title: outcome === "lost" ? "Marked lost" : "Returned" }),
      onError: (e) => toast({ title: "Not saved", description: e.message, variant: "destructive" }) });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div><h1 className="text-3xl font-bold tracking-tight">Inventory Management</h1><p className="text-muted-foreground">Stock, customer equipment loans and supplies used</p></div>
        <div className="flex gap-2">
          {use && <Button variant="outline" onClick={() => setDlg({ type: "usage" })}>Record supplies used</Button>}
          {use && <Button variant="outline" onClick={() => setDlg({ type: "loan" })}>Loan equipment</Button>}
          {manage && <Button onClick={() => setDlg({ type: "item", item: { unit: "pcs", category: "consumable", reorder_level: 0, loanable: false } })}><Plus className="mr-2 h-4 w-4" />Add item</Button>}
          <Button variant="outline" disabled={!list.length} onClick={() => csv([["SKU", "Name", "Category", "On hand", "Unit", "Reorder level"], ...list.map((i) => [i.sku, i.name, i.category, i.stock_qty, i.unit, i.reorder_level])])}><Download className="mr-2 h-4 w-4" />Export</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Kpi title="Items" value={items.data?.length ?? 0} icon={Package} />
        <Kpi title="Low or out of stock" value={low} icon={AlertTriangle} />
        <Kpi title="Units on loan" value={active.length} icon={Users} />
      </div>

      <Tabs defaultValue="stock">
        <TabsList><TabsTrigger value="stock">Stock</TabsTrigger><TabsTrigger value="loans">Equipment loans</TabsTrigger><TabsTrigger value="moves">Supplies & movements</TabsTrigger></TabsList>
        <TabsContent value="stock">
          <Card><CardContent className="pt-6">
            <div className="relative mb-4 max-w-sm"><Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" /><Input className="pl-8" placeholder="Search name or SKU" value={q} onChange={(e) => setQ(e.target.value)} /></div>
            <QueryState loading={items.isLoading} error={items.error as Error | null} empty={!items.isLoading && !list.length} emptyText="No items yet." />
            {list.length > 0 && <Table><TableHeader><TableRow><TableHead>SKU</TableHead><TableHead>Name</TableHead><TableHead>Category</TableHead><TableHead>On hand</TableHead><TableHead>Status</TableHead><TableHead /></TableRow></TableHeader>
              <TableBody>{list.map((i) => (
                <TableRow key={i.id}>
                  <TableCell className="font-mono text-xs">{i.sku}</TableCell><TableCell>{i.name}{i.loanable && <span className="ml-2 text-xs text-muted-foreground">(loanable)</span>}</TableCell>
                  <TableCell>{i.category}</TableCell><TableCell>{Number(i.stock_qty)} {i.unit}</TableCell>
                  <TableCell><StatusBadge status={stockLevel(Number(i.stock_qty), Number(i.reorder_level)).replace("_", "-")} /></TableCell>
                  <TableCell className="space-x-1 text-right">
                    {manage && <Button size="sm" variant="ghost" onClick={() => setDlg({ type: "stock", item: i })}>Stock</Button>}
                    {manage && <Button size="sm" variant="ghost" onClick={() => setDlg({ type: "item", item: i })}>Edit</Button>}
                  </TableCell>
                </TableRow>))}</TableBody></Table>}
          </CardContent></Card>
        </TabsContent>
        <TabsContent value="loans">
          <Card><CardContent className="pt-6">
            <QueryState loading={loans.isLoading} error={loans.error as Error | null} empty={!loans.isLoading && !loans.data?.length} emptyText="No equipment loaned yet." />
            {!!loans.data?.length && <Table><TableHeader><TableRow><TableHead>Item</TableHead><TableHead>Serial</TableHead><TableHead>Customer</TableHead><TableHead>Loaned</TableHead><TableHead>Status</TableHead><TableHead /></TableRow></TableHeader>
              <TableBody>{loans.data.map((l) => (
                <TableRow key={l.id}>
                  <TableCell>{l.inventory_items?.name}</TableCell><TableCell className="font-mono text-xs">{l.serial}</TableCell>
                  <TableCell>{l.customers?.full_name}</TableCell><TableCell>{new Date(l.loaned_at).toLocaleDateString()}</TableCell>
                  <TableCell><StatusBadge status={l.status.replace("_", "-")} />{l.condition && <span className="ml-2 text-xs text-muted-foreground">{l.condition}</span>}</TableCell>
                  <TableCell className="space-x-1 text-right">{use && l.status === "on_loan" && <>
                    <Button size="sm" variant="ghost" onClick={() => doReturn(l.id, "returned")}>Return</Button>
                    <Button size="sm" variant="ghost" onClick={() => doReturn(l.id, "lost")}>Lost</Button></>}</TableCell>
                </TableRow>))}</TableBody></Table>}
          </CardContent></Card>
        </TabsContent>
        <TabsContent value="moves">
          <Card><CardContent className="pt-6">
            <QueryState loading={moves.isLoading} error={moves.error as Error | null} empty={!moves.isLoading && !moves.data?.length} emptyText="No stock movements yet." />
            {!!moves.data?.length && <Table><TableHeader><TableRow><TableHead>When</TableHead><TableHead>Item</TableHead><TableHead>Type</TableHead><TableHead>Qty</TableHead><TableHead>Customer</TableHead><TableHead>Note</TableHead></TableRow></TableHeader>
              <TableBody>{moves.data.map((m) => (
                <TableRow key={m.id}><TableCell>{new Date(m.created_at).toLocaleString()}</TableCell><TableCell>{m.inventory_items?.name}</TableCell>
                  <TableCell>{m.kind.replace("_", " ")}</TableCell><TableCell>{Number(m.quantity) > 0 ? "+" : ""}{Number(m.quantity)} {m.inventory_items?.unit}</TableCell>
                  <TableCell>{m.customers?.full_name ?? "—"}</TableCell><TableCell className="text-muted-foreground">{m.note}</TableCell></TableRow>))}</TableBody></Table>}
          </CardContent></Card>
        </TabsContent>
      </Tabs>
      {dlg && <OpDialog dlg={dlg} items={items.data ?? []} onClose={() => setDlg(null)} />}
    </div>
  );
}

function Kpi({ title, value, icon: Icon }: { title: string; value: number; icon: typeof Package }) {
  return <Card><CardHeader className="flex flex-row items-center justify-between pb-2"><CardTitle className="text-sm font-medium">{title}</CardTitle><Icon className="h-4 w-4 text-muted-foreground" /></CardHeader><CardContent><div className="text-2xl font-bold">{value}</div></CardContent></Card>;
}

function OpDialog({ dlg, items, onClose }: { dlg: NonNullable<Dlg>; items: Item[]; onClose: () => void }) {
  const { toast } = useToast();
  const { data: customers = [] } = useCustomers();
  const { data: tickets = [] } = useTickets();
  const saveItem = useSaveItem(), adjust = useAdjustStock(), usage = useRecordUsage(), loan = useLoanEquipment();
  const [it, setIt] = useState<Partial<Item>>(dlg.type === "item" ? dlg.item : {});
  const [itemId, setItemId] = useState(dlg.type !== "item" ? dlg.item?.id ?? "" : "");
  const [customer, setCustomer] = useState(""), [ticket, setTicket] = useState("none");
  const [qty, setQty] = useState(""), [note, setNote] = useState(""), [kind, setKind] = useState<"receive" | "adjust">("receive"), [serial, setSerial] = useState("");
  const item = items.find((i) => i.id === itemId);
  const done = (t: string) => ({ onSuccess: () => { toast({ title: t }); onClose(); }, onError: (e: Error) => toast({ title: "Not saved", description: e.message, variant: "destructive" }) });
  const err = item && (dlg.type === "stock" || dlg.type === "usage") ? stockChangeError(dlg.type === "usage" ? "usage" : kind, Number(qty), Number(item.stock_qty), note) : null;
  const pickItem = (filter: (i: Item) => boolean) => (
    <div><Label>Item</Label><Select value={itemId} onValueChange={setItemId}><SelectTrigger><SelectValue placeholder="Choose item" /></SelectTrigger>
      <SelectContent>{items.filter(filter).map((i) => <SelectItem key={i.id} value={i.id}>{i.name} ({Number(i.stock_qty)} {i.unit})</SelectItem>)}</SelectContent></Select></div>);
  const pickCustomer = (
    <div><Label>Customer</Label><Select value={customer} onValueChange={setCustomer}><SelectTrigger><SelectValue placeholder="Choose customer" /></SelectTrigger>
      <SelectContent>{customers.map((c) => <SelectItem key={c.id} value={c.id}>{c.full_name} ({c.account_number})</SelectItem>)}</SelectContent></Select></div>);

  return (
    <Dialog open onOpenChange={onClose}><DialogContent>
      {dlg.type === "item" && <>
        <DialogHeader><DialogTitle>{it.id ? "Edit item" : "Add item"}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>SKU</Label><Input value={it.sku ?? ""} onChange={(e) => setIt({ ...it, sku: e.target.value })} /></div>
          <div><Label>Name</Label><Input value={it.name ?? ""} onChange={(e) => setIt({ ...it, name: e.target.value })} /></div>
          <div><Label>Category</Label><Select value={it.category} onValueChange={(v) => setIt({ ...it, category: v })}><SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{ITEM_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select></div>
          <div><Label>Unit</Label><Input value={it.unit ?? ""} onChange={(e) => setIt({ ...it, unit: e.target.value })} placeholder="pcs, m, roll" /></div>
          <div><Label>Reorder level</Label><Input type="number" min={0} value={it.reorder_level ?? 0} onChange={(e) => setIt({ ...it, reorder_level: Number(e.target.value) })} /></div>
          <div className="flex items-end gap-2 pb-2"><Switch checked={!!it.loanable} onCheckedChange={(v) => setIt({ ...it, loanable: v })} /><Label>Loaned to customers</Label></div>
        </div>
        <p className="text-xs text-muted-foreground">Stock starts at 0 — use "Stock" to receive units.</p>
        <Button disabled={!it.sku?.trim() || !it.name?.trim() || saveItem.isPending} onClick={() => saveItem.mutate({ id: it.id, sku: it.sku, name: it.name, category: it.category, unit: it.unit, reorder_level: it.reorder_level, loanable: it.loanable }, done("Item saved"))}>Save</Button>
      </>}
      {dlg.type === "stock" && <>
        <DialogHeader><DialogTitle>Stock: {dlg.item.name}</DialogTitle></DialogHeader>
        <Select value={kind} onValueChange={(v) => setKind(v as "receive" | "adjust")}><SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="receive">Receive units</SelectItem><SelectItem value="adjust">Adjust (count correction, + or −)</SelectItem></SelectContent></Select>
        <div><Label>Quantity ({dlg.item.unit})</Label><Input type="number" value={qty} onChange={(e) => setQty(e.target.value)} /></div>
        <div><Label>Note{kind === "adjust" && " (required)"}</Label><Input value={note} onChange={(e) => setNote(e.target.value)} /></div>
        {qty && err && <p className="text-sm text-destructive">{err}</p>}
        <Button disabled={!qty || !!err || adjust.isPending} onClick={() => adjust.mutate({ item: dlg.item.id, qty: Number(qty), kind, note }, done("Stock updated"))}>Save</Button>
      </>}
      {dlg.type === "usage" && <>
        <DialogHeader><DialogTitle>Record supplies used</DialogTitle></DialogHeader>
        {pickItem(() => true)}{pickCustomer}
        <div><Label>Ticket (optional)</Label><Select value={ticket} onValueChange={setTicket}><SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="none">None</SelectItem>{tickets.filter((t) => !customer || t.customer_id === customer).map((t) => <SelectItem key={t.id} value={t.id}>{t.number} · {t.subject}</SelectItem>)}</SelectContent></Select></div>
        <div><Label>Quantity{item && ` (${item.unit})`}</Label><Input type="number" min={0} value={qty} onChange={(e) => setQty(e.target.value)} /></div>
        <div><Label>Note</Label><Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. installation, drop repair" /></div>
        {qty && err && <p className="text-sm text-destructive">{err}</p>}
        <Button disabled={!item || !customer || !qty || !!err || usage.isPending} onClick={() => usage.mutate({ item: itemId, customer, qty: Number(qty), ticket: ticket === "none" ? null : ticket, note }, done("Supplies recorded"))}>Save</Button>
      </>}
      {dlg.type === "loan" && <>
        <DialogHeader><DialogTitle>Loan equipment to a customer</DialogTitle></DialogHeader>
        {pickItem((i) => i.loanable)}{pickCustomer}
        <div><Label>Serial number</Label><Input value={serial} onChange={(e) => setSerial(e.target.value)} /></div>
        {item && Number(item.stock_qty) < 1 && <p className="text-sm text-destructive">None in stock.</p>}
        <Button disabled={!item || !customer || !serial.trim() || Number(item?.stock_qty) < 1 || loan.isPending} onClick={() => loan.mutate({ item: itemId, customer, serial }, done("Equipment loaned"))}>Save</Button>
      </>}
    </DialogContent></Dialog>
  );
}
