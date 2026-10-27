import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { Navigate, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { ForcePasswordChange } from "@/components/force-password-change";

export type StaffRole = "admin" | "noc" | "finance" | "care" | "tech" | "warehouse" | "readonly";

interface AuthState {
  session: Session | null;
  roles: StaffRole[];
  loading: boolean;
  mustChangePassword: boolean;
  hasRole: (...r: StaffRole[]) => boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [roles, setRoles] = useState<StaffRole[]>([]);
  const [mustChangePassword, setMustChangePassword] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async (s: Session | null) => {
      setSession(s);
      if (s) {
        const [{ data: roleRows }, { data: profile }] = await Promise.all([
          supabase.from("user_roles" as never).select("role").eq("user_id", s.user.id),
          supabase.from("staff_profiles").select("must_change_password").eq("id", s.user.id).maybeSingle(),
        ]);
        setRoles(((roleRows as { role: StaffRole }[] | null) ?? []).map((r) => r.role));
        setMustChangePassword(!!profile?.must_change_password);
      } else {
        setRoles([]);
        setMustChangePassword(false);
      }
      setLoading(false);
    };
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setTimeout(() => load(s), 0);
    });
    supabase.auth.getSession().then(({ data }) => load(data.session));
    return () => sub.subscription.unsubscribe();
  }, []);

  const hasRole = (...r: StaffRole[]) => roles.includes("admin") || r.some((x) => roles.includes(x));
  const signOut = async () => { await supabase.auth.signOut(); };

  return <AuthContext.Provider value={{ session, roles, loading, mustChangePassword, hasRole, signOut }}>{children}</AuthContext.Provider>;
}

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
};

export function RequireAuth({ children, roles }: { children: ReactNode; roles?: StaffRole[] }) {
  const { session, loading, hasRole } = useAuth();
  const loc = useLocation();
  if (loading) return <div className="flex min-h-screen items-center justify-center text-muted-foreground">Loading…</div>;
  if (!session) return <Navigate to="/login" state={{ from: loc.pathname }} replace />;
  if (roles && !hasRole(...roles))
    return <div className="p-6"><h1 className="text-xl font-semibold">Access denied</h1><p className="text-muted-foreground">Your role doesn't allow this page.</p></div>;
  return <>{children}</>;
}

export const CURRENCY = { code: "SLE", symbol: "Le" };
export const formatMoney = (n: number) =>
  `${CURRENCY.symbol} ${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
