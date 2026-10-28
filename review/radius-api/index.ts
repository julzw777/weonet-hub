// REVIEW ONLY / NOT DEPLOYED. Copy only after contract and service identity approval.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { canRead, canWrite, isWrite, toRequest } from "./lib.ts";
import { signServiceToken } from "./signer.ts";
import { executeDraft, validateDraftRequest } from "./contract.ts";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" } });
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return json({ error: "Hub server is unconfigured" }, 503);
  const admin = createClient(url, key, { auth: { persistSession: false } });
  const token = req.headers.get("Authorization")?.replace(/^Bearer /, "");
  if (!token) return json({ error: "Sign in required" }, 401);
  const { data: user, error: authError } = await admin.auth.getUser(token);
  if (authError || !user.user) return json({ error: "Sign in required" }, 401);
  const { data: rows, error: roleError } = await admin.from("user_roles").select("role").eq("user_id", user.user.id);
  if (roleError) return json({ error: "Authorization unavailable" }, 503);
  const roles = (rows ?? []).map(r => r.role as string);
  let body: unknown;
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
  const requestId = req.headers.get("X-Request-ID") ?? crypto.randomUUID();
  const request = validateDraftRequest(body, requestId, req.headers.get("Idempotency-Key") ?? undefined);
  if (!request) return json({ error: "Invalid request or missing UUID Idempotency-Key" }, 400);
  if (!canRead(roles) || (isWrite(request.op.op) && !canWrite(roles))) return json({ error: "Role not permitted" }, 403);
  const actorId = user.user.id; // ONLY from verified Supabase identity, never body/header actor.
  const result = await executeDraft(request, {
    base: Deno.env.get("RADIUS_API_BASE_URL"),
    // Enabled only when every server-side secret is present AND the operator sets RADIUS_API_ENABLED=true.
    confirmed: Deno.env.get("RADIUS_API_ENABLED") === "true",
    authorize: async (draft) => {
      const privateKeyPem = Deno.env.get("RADIUS_API_SIGNING_KEY");
      const issuer = Deno.env.get("RADIUS_API_ISSUER"), audience = Deno.env.get("RADIUS_API_AUDIENCE"), subject = Deno.env.get("RADIUS_API_SERVICE_SUBJECT");
      if (!privateKeyPem || !issuer || !audience || !subject) throw new Error("Signed service identity is not configured");
      const upstream = toRequest(draft.op);
      // Short-lived (120s), single-use, bound to method/path/body/request ID/key; actor from verified Supabase Auth only.
      return signServiceToken({ privateKeyPem, issuer, audience, subject, actorId, roles, write: isWrite(draft.op.op),
        method: upstream.method, pathAndQuery: upstream.path, body: upstream.body ? JSON.stringify(upstream.body) : "",
        requestId: draft.requestId, idempotencyKey: isWrite(draft.op.op) ? draft.idempotencyKey ?? null : null });
    },
    audit: async (event) => {
      const { error } = await admin.from("audit_logs").insert({
        actor_id: actorId, entity: "radius_subscribers", entity_id: null,
        action: `radius.${event.operation}.${event.outcome}`, details: { ...event, mock: false },
      });
      if (error) throw new Error("Audit storage unavailable");
    },
    send: (destination, init) => fetch(destination, init),
  });
  return json(result.body, result.status);
});
