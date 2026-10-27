import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { QueryState } from "@/components/ui/query-state";
import { Copy, MoreHorizontal, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { useAuth, type StaffRole } from "@/lib/auth";
import {
  ROLE_LABELS, STATUS_LABELS, canModifyTarget, canRemoveSuperAdmin, filterUsers, generateTempPassword,
  roleLabel, validTempPassword, type HubUser,
} from "@/lib/user-rules";
import { useCreateHubUser, useHubUsers, useResetHubUserPassword, useSetHubUserStatus, useUpdateHubUser } from "@/lib/data/hooks";

const ALL_ROLES = Object.keys(ROLE_LABELS) as StaffRole[];

const statusVariant = (s: HubUser["status"]) =>
  s === "active" ? "default" : s === "deactivated" ? "destructive" : "secondary";

export default function Users() {
  const { session } = useAuth();
  const me = session?.user.id ?? "";
  const { data, isLoading, error } = useHubUsers();
  const create = useCreateHubUser();
  const update = useUpdateHubUser();
  const setStatus = useSetHubUserStatus();
  const resetPw = useResetHubUserPassword();

  const [query, setQuery] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<HubUser | null>(null);
  const [resetting, setResetting] = useState<HubUser | null>(null);
  const [toggling, setToggling] = useState<HubUser | null>(null);
  const [shownPassword, setShownPassword] = useState<{ email: string; password: string } | null>(null);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<StaffRole>("readonly");
  const [editName, setEditName] = useState("");
  const [editRole, setEditRole] = useState<StaffRole>("readonly");
  const [newPassword, setNewPassword] = useState("");

  const users = data ?? [];
  const filtered = filterUsers(users, query);
  const superAdminCount = users.filter((u) => u.roles.includes("admin") && u.status !== "deactivated").length;

  const openCreate = () => {
    setName(""); setEmail(""); setPassword(generateTempPassword()); setRole("readonly"); setCreateOpen(true);
  };

  const submitCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validTempPassword(password)) return toast.error("Temporary password must be at least 8 characters");
    create.mutate({ full_name: name, email, password, role }, {
      onSuccess: (r) => { setCreateOpen(false); setShownPassword({ email, password: r.temporary_password }); },
      onError: (err) => toast.error(err.message),
    });
  };

  const submitEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    update.mutate({ user_id: editing.id, full_name: editName, role: editRole }, {
      onSuccess: () => { setEditing(null); toast.success("User updated"); },
      onError: (err) => toast.error(err.message),
    });
  };

  const submitReset = (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetting) return;
    if (!validTempPassword(newPassword)) return toast.error("Temporary password must be at least 8 characters");
    resetPw.mutate({ user_id: resetting.id, password: newPassword }, {
      onSuccess: () => { setShownPassword({ email: resetting.email, password: newPassword }); setResetting(null); },
      onError: (err) => toast.error(err.message),
    });
  };

  const submitToggle = () => {
    if (!toggling) return;
    const next = toggling.status === "deactivated" ? "active" : "deactivated";
    setStatus.mutate({ user_id: toggling.id, status: next }, {
      onSuccess: () => { setToggling(null); toast.success(next === "active" ? "Account reactivated" : "Account deactivated"); },
      onError: (err) => toast.error(err.message),
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">Users</h1>
          <p className="text-muted-foreground">
            Hub staff accounts. New users must change their temporary password at first sign-in. Every change is audited.
          </p>
        </div>
        <Button onClick={openCreate}><UserPlus className="mr-2 h-4 w-4" />Create User</Button>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle>Staff accounts</CardTitle>
            <Input className="w-64" placeholder="Search name, email, role, status…" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <QueryState loading={isLoading} error={error} empty={filtered.length === 0} />
          {filtered.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead><TableHead>Email</TableHead><TableHead>Role</TableHead>
                  <TableHead>Status</TableHead><TableHead>Last sign-in</TableHead><TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((u) => {
                  const isSuperAdmin = u.roles.includes("admin");
                  const locked = !canModifyTarget(me, u.id) || !canRemoveSuperAdmin(superAdminCount, isSuperAdmin);
                  return (
                    <TableRow key={u.id}>
                      <TableCell className="font-medium">
                        {u.full_name || "—"}{u.id === me && <span className="ml-1 text-xs text-muted-foreground">(you)</span>}
                      </TableCell>
                      <TableCell>{u.email}</TableCell>
                      <TableCell className="space-x-1">
                        {u.roles.map((r) => <Badge key={r} variant="secondary">{roleLabel(r)}</Badge>)}
                      </TableCell>
                      <TableCell><Badge variant={statusVariant(u.status)}>{STATUS_LABELS[u.status]}</Badge></TableCell>
                      <TableCell className="text-muted-foreground">
                        {u.last_sign_in_at ? new Date(u.last_sign_in_at).toLocaleString() : "Never"}
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" aria-label={`Actions for ${u.full_name || u.email}`}>
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => { setEditing(u); setEditName(u.full_name); setEditRole(u.roles[0] ?? "readonly"); }}>
                              Edit name & role
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => { setResetting(u); setNewPassword(generateTempPassword()); }}>
                              Reset password
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              disabled={locked && u.status !== "deactivated"}
                              onClick={() => setToggling(u)}
                              className={u.status !== "deactivated" ? "text-destructive" : ""}
                            >
                              {u.status === "deactivated" ? "Reactivate" : "Deactivate"}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Create user */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Create user</DialogTitle></DialogHeader>
          <form onSubmit={submitCreate} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="cu-name">Full name</Label>
              <Input id="cu-name" value={name} onChange={(e) => setName(e.target.value)} required maxLength={120} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cu-email">Email</Label>
              <Input id="cu-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cu-password">Temporary password</Label>
              <div className="flex gap-2">
                <Input id="cu-password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
                <Button type="button" variant="outline" onClick={() => setPassword(generateTempPassword())}>Generate</Button>
              </div>
              <p className="text-xs text-muted-foreground">Shown once after creation. The user must change it at first sign-in.</p>
            </div>
            <div className="space-y-2">
              <Label>Role</Label>
              <Select value={role} onValueChange={(v) => setRole(v as StaffRole)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{ALL_ROLES.map((r) => <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <Button type="submit" className="w-full" disabled={create.isPending}>
              {create.isPending ? "Creating…" : "Create user"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit name & role */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit {editing?.email}</DialogTitle></DialogHeader>
          <form onSubmit={submitEdit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="eu-name">Full name</Label>
              <Input id="eu-name" value={editName} onChange={(e) => setEditName(e.target.value)} required maxLength={120} />
            </div>
            <div className="space-y-2">
              <Label>Role</Label>
              <Select value={editRole} onValueChange={(v) => setEditRole(v as StaffRole)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{ALL_ROLES.map((r) => <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>)}</SelectContent>
              </Select>
              {editing?.id === me && editRole !== "admin" && (
                <p className="text-xs text-destructive">You cannot remove your own Super Admin role.</p>
              )}
            </div>
            <Button type="submit" className="w-full" disabled={update.isPending || (editing?.id === me && editRole !== "admin")}>
              {update.isPending ? "Saving…" : "Save changes"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Reset password */}
      <Dialog open={!!resetting} onOpenChange={(o) => !o && setResetting(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Reset password for {resetting?.email}</DialogTitle></DialogHeader>
          <form onSubmit={submitReset} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="rp-password">New temporary password</Label>
              <div className="flex gap-2">
                <Input id="rp-password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required minLength={8} />
                <Button type="button" variant="outline" onClick={() => setNewPassword(generateTempPassword())}>Generate</Button>
              </div>
              <p className="text-xs text-muted-foreground">The user must change this at their next sign-in.</p>
            </div>
            <Button type="submit" className="w-full" disabled={resetPw.isPending}>
              {resetPw.isPending ? "Resetting…" : "Reset password"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Deactivate / reactivate confirmation */}
      <AlertDialog open={!!toggling} onOpenChange={(o) => !o && setToggling(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{toggling?.status === "deactivated" ? "Reactivate" : "Deactivate"} {toggling?.full_name || toggling?.email}?</AlertDialogTitle>
            <AlertDialogDescription>
              {toggling?.status === "deactivated"
                ? "They will be able to sign in again immediately."
                : "They will be signed out and unable to sign in until reactivated. Their records are kept."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={submitToggle} disabled={setStatus.isPending}>Confirm</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* One-time temporary password display */}
      <AlertDialog open={!!shownPassword} onOpenChange={(o) => !o && setShownPassword(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Temporary password for {shownPassword?.email}</AlertDialogTitle>
            <AlertDialogDescription>
              This is shown once and is not stored anywhere you can retrieve later. Share it with the user securely — they must change it at first sign-in.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex items-center gap-2 rounded-md border bg-muted p-3 font-mono text-sm">
            <span className="flex-1 break-all">{shownPassword?.password}</span>
            <Button type="button" variant="ghost" size="icon" aria-label="Copy password"
              onClick={() => { navigator.clipboard.writeText(shownPassword?.password ?? ""); toast.success("Copied"); }}>
              <Copy className="h-4 w-4" />
            </Button>
          </div>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setShownPassword(null)}>Done</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
