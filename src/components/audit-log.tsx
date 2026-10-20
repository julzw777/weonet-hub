import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { QueryState } from "@/components/ui/query-state";
import { useStaff } from "@/lib/data/hooks";

export function AuditLog() {
  const [entity, setEntity] = useState("");
  const [page, setPage] = useState(0);
  const staff = useStaff();
  const log = useQuery({ queryKey: ["audit", entity, page], queryFn: async () => {
    let q = supabase.from("audit_logs").select("id, actor_id, action, entity, entity_id, created_at").order("created_at", { ascending: false }).range(page * 50, page * 50 + 49);
    if (entity.trim()) q = q.eq("entity", entity.trim());
    const { data, error } = await q; if (error) throw new Error(error.message);
    return data as Pick<Tables<"audit_logs">, "id" | "actor_id" | "action" | "entity" | "entity_id" | "created_at">[];
  }});
  const who = (id: string | null) => (staff.data as { id: string; full_name: string; email: string | null }[] | undefined)?.find((s) => s.id === id)?.email ?? (id ? id.slice(0, 8) : "system");
  return <Card><CardHeader><CardTitle>Audit log</CardTitle></CardHeader><CardContent className="space-y-3">
    <div className="flex flex-wrap gap-2"><Input className="w-64" placeholder="Filter by record type, e.g. payments" value={entity} onChange={(e) => { setEntity(e.target.value); setPage(0); }} /></div>
    <QueryState loading={log.isLoading} error={log.error} empty={!!log.data && !log.data.length} emptyText="No audit entries." />
    {log.data?.map((r) => <div key={r.id} className="flex flex-wrap gap-2 border-b border-border py-2 text-xs"><span className="text-muted-foreground">{new Date(r.created_at).toLocaleString()}</span><span className="font-medium">{r.action}</span><span>{r.entity}</span><span className="text-muted-foreground">{r.entity_id?.slice(0, 8)}</span><span className="ml-auto text-muted-foreground">{who(r.actor_id)}</span></div>)}
    <div className="flex gap-2"><Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage(page - 1)}>Newer</Button><Button size="sm" variant="outline" disabled={(log.data?.length ?? 0) < 50} onClick={() => setPage(page + 1)}>Older</Button></div>
    <p className="text-xs text-muted-foreground">Change details (before/after values) are kept in the database; this list shows who did what and when.</p>
  </CardContent></Card>;
}
