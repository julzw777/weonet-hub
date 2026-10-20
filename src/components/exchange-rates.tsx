import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { QueryState } from "@/components/ui/query-state";
import { rateError } from "@/lib/billing-rules";

export const useExchangeRates = () => useQuery({ queryKey: ["exchange_rates"], queryFn: async () => {
  const { data, error } = await supabase.from("exchange_rates").select("*").order("created_at", { ascending: false }).limit(50);
  if (error) throw new Error(error.message);
  return data as Tables<"exchange_rates">[];
}});

export function ExchangeRates({ canSet, baseSymbol }: { canSet: boolean; baseSymbol: string }) {
  const qc = useQueryClient();
  const rates = useExchangeRates();
  const [rate, setRate] = useState("");
  const [note, setNote] = useState("");
  const save = useMutation({ mutationFn: async () => { const { error } = await supabase.rpc("set_exchange_rate", { _base_per_quote: Number(rate), _note: note }); if (error) throw new Error(error.message); },
    onSuccess: () => { toast.success("Exchange rate saved"); setRate(""); setNote(""); qc.invalidateQueries({ queryKey: ["exchange_rates"] }); }, onError: (e) => toast.error(e.message) });
  const err = rate ? rateError(rate) : null;
  return <section className="space-y-3 rounded-lg border border-border p-4"><h2 className="font-semibold">Exchange rate ($)</h2>
    <p className="text-xs text-muted-foreground">Used only to show amounts in $. Invoices and payments stay saved in {baseSymbol}.</p>
    <QueryState loading={rates.isLoading} error={rates.error} empty={!!rates.data && !rates.data.length} emptyText="No exchange rate set yet." />
    {rates.data?.[0] && <p className="text-sm">Current: <b>$1 = {baseSymbol} {Number(rates.data[0].base_per_quote).toLocaleString("en-US", { maximumFractionDigits: 6 })}</b> · set {new Date(rates.data[0].created_at).toLocaleString()}</p>}
    {canSet && <form className="flex flex-wrap items-end gap-3" onSubmit={(e) => { e.preventDefault(); if (!err) save.mutate(); }}>
      <div><Label htmlFor="fx-rate">{baseSymbol} per $1</Label><Input id="fx-rate" inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} /></div>
      <div className="min-w-48 flex-1"><Label htmlFor="fx-note">Source / note</Label><Input id="fx-note" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} /></div>
      <Button size="sm" type="submit" disabled={!rate || !!err || save.isPending}>Save rate</Button>
      {err && <p className="w-full text-sm text-destructive">{err}</p>}</form>}
    {rates.data && rates.data.length > 1 && <details className="text-xs text-muted-foreground"><summary className="cursor-pointer">Rate history ({rates.data.length})</summary>{rates.data.map((r) => <p key={r.id} className="py-1">{new Date(r.created_at).toLocaleString()} · $1 = {baseSymbol} {Number(r.base_per_quote)}{r.note && ` · ${r.note}`}</p>)}</details>}
  </section>;
}
