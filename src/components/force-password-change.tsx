import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { MIN_PASSWORD_LENGTH } from "@/lib/user-rules";

/** Shown instead of the app when the account must set a new password (first sign-in or admin reset). */
export function ForcePasswordChange() {
  const { signOut } = useAuth();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < MIN_PASSWORD_LENGTH) return toast.error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
    if (password !== confirm) return toast.error("Passwords do not match");
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      toast.error(error.message);
    } else {
      const { error: rpcError } = await supabase.rpc("complete_password_change" as never);
      if (rpcError) toast.error(rpcError.message);
      else window.location.reload();
    }
    setBusy(false);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-xl">Set a new password</CardTitle>
          <p className="text-sm text-muted-foreground">
            Your account was created or reset by an administrator. Choose a new password to continue.
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="np-new">New password</Label>
              <Input id="np-new" type="password" minLength={MIN_PASSWORD_LENGTH} value={password} onChange={(e) => setPassword(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="np-confirm">Confirm password</Label>
              <Input id="np-confirm" type="password" minLength={MIN_PASSWORD_LENGTH} value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
            </div>
            <Button type="submit" className="w-full" disabled={busy}>{busy ? "Saving…" : "Set password"}</Button>
            <Button type="button" variant="ghost" className="w-full" onClick={() => signOut()}>Sign out</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
