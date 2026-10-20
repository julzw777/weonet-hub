import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { ACTIONS, canControlRouters, healthCheck, redact, resolveEndpoint, secretNames, validateRequest } from "./lib.ts";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const url = Deno.env.get("SUPABASE_URL")!;
  const token = req.headers.get("Authorization")?.replace(/^Bearer /, "");
  if (!token) return json({ error: "Sign in required" }, 401);
  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const { data: userData, error: authErr } = await admin.auth.getUser(token);
  if (authErr || !userData.user) return json({ error: "Sign in required" }, 401);
  const uid = userData.user.id;
  const { data: roleRows } = await admin.from("user_roles").select("role").eq("user_id", uid);
  if (!canControlRouters((roleRows ?? []).map((r) => r.role))) return json({ error: "Only NOC or Admin can run router actions" }, 403);

  let body: unknown;
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
  const parsed = validateRequest(body);
  if (!parsed.ok) return json({ error: parsed.error }, 400);
  const { action, device_id, idempotency_key, dry_run } = parsed.value;

  const { data: existing } = await admin.from("router_actions").select("*").eq("requested_by", uid).eq("idempotency_key", idempotency_key).maybeSingle();
  if (existing) return json({ action: existing, replayed: true });

  const { data: device } = await admin.from("network_devices").select("*").eq("id", device_id).maybeSingle();
  if (!device) return json({ error: "Device is not registered" }, 404);

  const record = async (status: string, detail: string, extra: Record<string, unknown> = {}) => {
    const { data, error } = await admin.from("router_actions").insert({ device_id, action, dry_run, status, detail, idempotency_key, requested_by: uid, ...extra }).select().single();
    if (error) {
      if (error.code === "23505") { const { data: again } = await admin.from("router_actions").select("*").eq("requested_by", uid).eq("idempotency_key", idempotency_key).single(); return again; }
      throw new Error("Could not record action");
    }
    return data;
  };

  if (!device.enabled) return json({ action: await record("rejected", "Device is disabled in the registry") });
  const spec = ACTIONS[action];
  if (!spec.enabled) return json({ action: await record("unavailable", spec.reason!) });

  const resolved = resolveEndpoint(device.endpoint_ref, (k) => Deno.env.get(k));
  const now = new Date().toISOString();
  if (!resolved.configured) {
    await admin.from("network_devices").update({ last_health_status: "unconfigured", last_health_at: now, last_health_detail: resolved.error }).eq("id", device_id);
    return json({ action: await record("unconfigured", resolved.error) });
  }
  const n = secretNames(device.endpoint_ref);
  const secrets = [resolved.endpoint.password, resolved.endpoint.username, Deno.env.get(n.url) ?? ""];
  const started = Date.now();
  try {
    const r = await healthCheck(resolved.endpoint, fetch as never);
    await admin.from("network_devices").update({ last_health_status: "healthy", last_health_at: now, last_health_detail: r.detail, routeros_version: r.version }).eq("id", device_id);
    return json({ action: await record("succeeded", r.detail, { attempts: r.attempts, duration_ms: Date.now() - started }) });
  } catch (e) {
    const msg = redact(e instanceof Error ? e.message : String(e), secrets);
    console.error("router health failed", device_id, msg);
    await admin.from("network_devices").update({ last_health_status: "error", last_health_at: now, last_health_detail: msg }).eq("id", device_id);
    return json({ action: await record("failed", msg, { attempts: (e as { attempts?: number }).attempts ?? 1, duration_ms: Date.now() - started }) });
  }
});
