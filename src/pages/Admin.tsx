import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { QueryState } from "@/components/ui/query-state";
import { X } from "lucide-react";
import { toast } from "sonner";
import { useAuth, type StaffRole } from "@/lib/auth";
import { canRemoveRole } from "@/lib/rules";
import { useStaff, useAddRole, useRemoveRole } from "@/lib/data/hooks";

const ALL: StaffRole[] = ["admin", "noc", "finance", "care", "tech", "warehouse", "readonly"];

export default function Admin() {
  const { session } = useAuth();
  const me = session?.user.id ?? "";
  const { data, isLoading, error } = useStaff();
  const add = useAddRole();
  const remove = useRemoveRole();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Admin</h1>
        <p className="text-muted-foreground">Staff accounts and roles. New staff sign up on the login page and start as Read-only. Every change is audited.</p>
      </div>
      <Card>
        <CardHeader><CardTitle>Staff</CardTitle></CardHeader>
        <CardContent className="p-0">
          <QueryState loading={isLoading} error={error} empty={data?.length === 0} />
          {!!data?.length && (
            <Table>
              <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Email</TableHead><TableHead>Roles</TableHead><TableHead>Add role</TableHead></TableRow></TableHeader>
              <TableBody>
                {data.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell className="font-medium">{u.full_name || "—"}{u.id === me && <span className="ml-1 text-xs text-muted-foreground">(you)</span>}</TableCell>
                    <TableCell>{u.email}</TableCell>
                    <TableCell className="space-x-1">
                      {u.roles.map((r) => (
                        <Badge key={r} variant="secondary" className="gap-1 uppercase">
                          {r}
                          {canRemoveRole(me, u.id, r) && (
                            <button aria-label={`Remove ${r}`} disabled={remove.isPending}
                              onClick={() => remove.mutate({ user_id: u.id, role: r }, { onSuccess: () => toast.success("Role removed"), onError: (e) => toast.error(e.message) })}>
                              <X className="h-3 w-3" />
                            </button>
                          )}
                        </Badge>
                      ))}
                    </TableCell>
                    <TableCell>
                      <Select value="" onValueChange={(r) => add.mutate({ user_id: u.id, role: r as StaffRole }, { onSuccess: () => toast.success("Role added"), onError: (e) => toast.error(e.message) })}>
                        <SelectTrigger className="w-36"><SelectValue placeholder="Add…" /></SelectTrigger>
                        <SelectContent>{ALL.filter((r) => !u.roles.includes(r)).map((r) => <SelectItem key={r} value={r} className="uppercase">{r}</SelectItem>)}</SelectContent>
                      </Select>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
