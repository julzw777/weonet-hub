// Server-side Hub user management. Only callers with the admin (Super Admin) role may use it.
// Passwords are hashed by Supabase Auth; temporary passwords are returned exactly once to the
// calling admin and never stored or logged. Every mutation is audited; if the audit insert
// fails the mutation is reported as failed.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const ROLES = ["admin", "noc", "finance", "care", "tech", "warehouse", "readonly"] as const;
type Role = (typeof ROLES)[number];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const BANNED = "876000h"; // ~100 years: deactivated until reactivated

type Admin = ReturnType<typeof createClient>;

const audit = async (admin: Admin, actorId: string, action: string, targetId: string, details: Record<string, unknown>) => {
  const { error } = await admin.from("audit_logs").insert({ actor_id: actorId, action, entity: "staff_user", entity_id: targetId, details });
  if (error) throw new Error("Audit log write failed; the change cannot be confirmed");
};

const adminCount = async (admin: Admin) => {
  const { count } = await admin.from("user_roles").select("id", { count: "exact", head: true }).eq("role", "admin");
  return count ?? 0;
};

const isAdmin = async (admin: Admin, userId: string) => {
  const { data } = await admin.from("user_roles").select("role").eq("user_id", userId).eq("role", "admin").maybeSingle();
  return !!data;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const token = req.headers.get("Authorization")?.replace(/^Bearer /, "");
  if (!token) return json({ error: "Sign in required" }, 401);
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const { data: userData, error: authErr } = await admin.auth.getUser(token);
  if (authErr || !userData.user) return json({ error: "Sign in required" }, 401);
  const actor = userData.user.id;
  if (!(await isAdmin(admin, actor))) return json({ error: "Only Super Admins can manage users" }, 403);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
  const action = typeof body.action === "string" ? body.action : "";

  try {
    if (action === "list") {
      const [{ data: users }, { data: profiles }, { data: roles }] = await Promise.all([
        admin.auth.admin.listUsers({ perPage: 1000 }),
        admin.from("staff_profiles").select("id, full_name, email, must_change_password"),
        admin.from("user_roles").select("user_id, role"),
      ]);
      const profileBy = new Map((profiles ?? []).map((p) => [p.id, p]));
      const rows = (users?.users ?? []).map((u) => {
        const p = profileBy.get(u.id);
        const banned = !!u.banned_until && new Date(u.banned_until).getTime() > Date.now();
        return {
          id: u.id,
          full_name: p?.full_name ?? (u.user_metadata?.full_name as string) ?? "",
          email: p?.email ?? u.email ?? "",
          roles: (roles ?? []).filter((r) => r.user_id === u.id).map((r) => r.role),
          status: banned ? "deactivated" : p?.must_change_password ? "pending_password_change" : "active",
          last_sign_in_at: u.last_sign_in_at ?? null,
        };
      });
      return json({ users: rows });
    }

    if (action === "create") {
      const fullName = typeof body.full_name === "string" ? body.full_name.trim() : "";
      const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
      const password = typeof body.password === "string" ? body.password : "";
      const role = body.role as Role;
      if (fullName.length < 1 || fullName.length > 120) return json({ error: "Full name is required (max 120 characters)" }, 400);
      if (!EMAIL_RE.test(email)) return json({ error: "A valid email is required" }, 400);
      if (password.length < 8 || password.length > 128) return json({ error: "Temporary password must be 8-128 characters" }, 400);
      if (!ROLES.includes(role)) return json({ error: "Invalid role" }, 400);

      const { data: created, error: createErr } = await admin.auth.admin.createUser({
        email, password, email_confirm: true, user_metadata: { full_name: fullName },
      });
      if (createErr || !created.user) return json({ error: createErr?.message ?? "Could not create user" }, 400);
      const uid = created.user.id;

      // handle_new_user trigger created the profile and a readonly role; set the chosen role and force a password change.
      await admin.from("staff_profiles").update({ full_name: fullName, must_change_password: true }).eq("id", uid);
      await admin.from("user_roles").delete().eq("user_id", uid);
      const { error: roleErr } = await admin.from("user_roles").insert({ user_id: uid, role });
      if (roleErr) return json({ error: "User created but role assignment failed" }, 500);
      await audit(admin, actor, "create_user", uid, { email, full_name: fullName, role });
      return json({ user: { id: uid, email }, temporary_password: password });
    }

    const targetId = typeof body.user_id === "string" ? body.user_id : "";
    if (!/^[0-9a-f-]{36}$/i.test(targetId)) return json({ error: "A target user is required" }, 400);

    if (action === "update") {
      const fullName = typeof body.full_name === "string" ? body.full_name.trim() : undefined;
      const role = body.role as Role | undefined;
      if (fullName !== undefined && (fullName.length < 1 || fullName.length > 120)) return json({ error: "Full name must be 1-120 characters" }, 400);
      if (role !== undefined && !ROLES.includes(role)) return json({ error: "Invalid role" }, 400);
      if (fullName === undefined && role === undefined) return json({ error: "Nothing to update" }, 400);

      if (role !== undefined) {
        const targetIsAdmin = await isAdmin(admin, targetId);
        if (targetId === actor && role !== "admin") return json({ error: "You cannot remove your own Super Admin role" }, 400);
        if (targetIsAdmin && role !== "admin" && (await adminCount(admin)) <= 1)
          return json({ error: "This is the final Super Admin account; promote another user first" }, 400);
        await admin.from("user_roles").delete().eq("user_id", targetId);
        const { error: roleErr } = await admin.from("user_roles").insert({ user_id: targetId, role });
        if (roleErr) return json({ error: "Role change failed" }, 500);
        await audit(admin, actor, "change_role", targetId, { role });
      }
      if (fullName !== undefined) {
        await admin.from("staff_profiles").update({ full_name: fullName }).eq("id", targetId);
        await admin.auth.admin.updateUserById(targetId, { user_metadata: { full_name: fullName } });
        await audit(admin, actor, "update_user", targetId, { full_name: fullName });
      }
      return json({ ok: true });
    }

    if (action === "set_status") {
      const status = body.status;
      if (status !== "active" && status !== "deactivated") return json({ error: "Invalid status" }, 400);
      if (status === "deactivated") {
        if (targetId === actor) return json({ error: "You cannot deactivate your own account" }, 400);
        if ((await isAdmin(admin, targetId)) && (await adminCount(admin)) <= 1)
          return json({ error: "This is the final Super Admin account; promote another user first" }, 400);
      }
      const { error } = await admin.auth.admin.updateUserById(targetId, {
        ban_duration: status === "deactivated" ? BANNED : "none",
      });
      if (error) return json({ error: error.message }, 500);
      await audit(admin, actor, status === "deactivated" ? "deactivate_user" : "reactivate_user", targetId, {});
      return json({ ok: true });
    }

    if (action === "reset_password") {
      const password = typeof body.password === "string" ? body.password : "";
      if (password.length < 8 || password.length > 128) return json({ error: "Temporary password must be 8-128 characters" }, 400);
      const { error } = await admin.auth.admin.updateUserById(targetId, { password });
      if (error) return json({ error: error.message }, 500);
      await admin.from("staff_profiles").update({ must_change_password: true }).eq("id", targetId);
      await audit(admin, actor, "reset_password", targetId, {});
      return json({ ok: true, temporary_password: password });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Unexpected error" }, 500);
  }
});
