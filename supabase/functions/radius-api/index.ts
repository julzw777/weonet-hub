import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { auditDetails, canRead, canWrite, isWrite, mockResponse, resolveBase, stripSecrets, toRequest, validateOp } from "./lib.ts";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const token = req.headers.get("Authorization")?.replace(/^Bearer /, "");
  if (!token) return json({ error: "Sign in required" }, 401);
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const { data: u, error: authErr } = await admin.auth.getUser(token);
  if (authErr || !u.user) return json({ error: "Sign in required" }, 401);
  const { data: roleRows } = await admin.from("user_roles").select("role").eq("user_id", u.user.id);
  const roles = (roleRows ?? []).map((r) => r.role as string);

  let body: unknown;
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
  const parsed = validateOp(body);
  if (!parsed.ok) return json({ error: parsed.error }, 400);
  const op = parsed.value;
  if (!canRead(roles)) return json({ error: "Your role cannot view RADIUS data" }, 403);
  if (isWrite(op.op) && !canWrite(roles)) return json({ error: "Only NOC or Admin can change subscribers" }, 403);

  const base = resolveBase(Deno.env.get("RADIUS_API_BASE_URL"));
  const apiToken = Deno.env.get("RADIUS_API_TOKEN");
  const mock = !base || !apiToken;
  let status: number; let result: unknown;
  if (mock) {
    ({ status, body: result } = mockResponse(op, () => crypto.randomUUID().replace(/-/g, "")));
  } else {
    const r = toRequest(op);
    try {
      const res = await fetch(base + r.path, {
        method: r.method, signal: AbortSignal.timeout(8000),
        headers: { Authorization: `Bearer ${apiToken}`, "Content-Type": "application/json", Accept: "application/json" },
        body: r.body ? JSON.stringify(r.body) : undefined,
      });
      status = res.status;
      result = await res.json().catch(() => ({ error: `RADIUS API returned ${res.status}` }));
    } catch (e) {
      console.error("radius api unreachable", e instanceof Error ? e.name : "error");
      status = 502; result = { error: "RADIUS API is unreachable" };
    }
  }

  if (isWrite(op.op)) {
    const ok = status >= 200 && status < 300;
    const id = "id" in op ? op.id : ((result as { data?: { id?: string } })?.data?.id ?? null);
    await admin.from("audit_logs").insert({
      actor_id: u.user.id, entity: "radius_subscribers", entity_id: null,
      action: `radius.${op.op}${ok ? "" : ".failed"}`,
      details: { ...auditDetails(op), subscriber_ref: id, mock, upstream_status: status },
    });
  }
  // Temporary password is the only secret allowed back, once, to the operator who reset it.
  const safe = op.op === "reset_password" ? result : stripSecrets(result);
  return json({ ...(safe as object), mock }, status);
});
