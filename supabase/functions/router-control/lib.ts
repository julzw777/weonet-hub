// Pure, runtime-neutral router-control rules. Imported by the edge function and by vitest.
export type RouterAction = "health_check" | "disconnect_subscriber" | "apply_profile";
export const CONTROL_ROLES = ["admin", "noc"] as const;
export const canControlRouters = (roles: string[]) => roles.some((r) => (CONTROL_ROLES as readonly string[]).includes(r));

/** Allow-list. Impactful commands stay disabled until Weonet supplies the needed network identifiers and approval. */
export const ACTIONS: Record<RouterAction, { impactful: boolean; enabled: boolean; reason?: string }> = {
  health_check: { impactful: false, enabled: true },
  disconnect_subscriber: { impactful: true, enabled: false, reason: "Disabled: subscriber PPPoE sessions are not yet mapped to router secrets/profiles, and Weonet has not approved disconnect rules. Requires RADIUS/PPPoE mapping (Stage 5) and an approved policy." },
  apply_profile: { impactful: true, enabled: false, reason: "Disabled: service plans are not yet mapped to RouterOS PPP profiles or queue names. Weonet must supply the profile naming per plan and approve live changes." },
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export type ValidRequest = { action: RouterAction; device_id: string; idempotency_key: string; dry_run: boolean };
export function validateRequest(body: unknown): { ok: true; value: ValidRequest } | { ok: false; error: string } {
  if (!body || typeof body !== "object") return { ok: false, error: "Body must be an object" };
  const b = body as Record<string, unknown>;
  const extra = Object.keys(b).filter((k) => !["action", "device_id", "idempotency_key", "dry_run"].includes(k));
  if (extra.length) return { ok: false, error: `Unknown fields: ${extra.join(", ")}` };
  if (typeof b.action !== "string" || !Object.prototype.hasOwnProperty.call(ACTIONS, b.action)) return { ok: false, error: "Action is not allowed" };
  if (typeof b.device_id !== "string" || !UUID.test(b.device_id)) return { ok: false, error: "device_id must be a registered device id" };
  if (typeof b.idempotency_key !== "string" || !/^[A-Za-z0-9-]{8,100}$/.test(b.idempotency_key)) return { ok: false, error: "idempotency_key must be 8-100 letters, digits or dashes" };
  if (b.dry_run !== undefined && typeof b.dry_run !== "boolean") return { ok: false, error: "dry_run must be boolean" };
  return { ok: true, value: { action: b.action as RouterAction, device_id: b.device_id, idempotency_key: b.idempotency_key, dry_run: b.dry_run !== false } };
}

export const secretNames = (ref: string) => ({ url: `ROUTER_${ref}_URL`, username: `ROUTER_${ref}_USERNAME`, password: `ROUTER_${ref}_PASSWORD` });
export type Endpoint = { url: string; username: string; password: string };
/** Destinations come only from server-side secrets keyed by a registered device's reference — never from the request. */
export function resolveEndpoint(ref: string, getEnv: (k: string) => string | undefined): { configured: true; endpoint: Endpoint } | { configured: false; error: string } {
  if (!/^[A-Z][A-Z0-9_]{1,39}$/.test(ref)) return { configured: false, error: "Invalid connection reference" };
  const n = secretNames(ref);
  const missing = Object.values(n).filter((k) => !getEnv(k));
  if (missing.length) return { configured: false, error: `Not configured: missing server secrets ${missing.join(", ")}` };
  let u: URL;
  try { u = new URL(getEnv(n.url)!); } catch { return { configured: false, error: `${n.url} is not a valid URL` }; }
  if (u.protocol !== "https:") return { configured: false, error: `${n.url} must use https` };
  if (u.username || u.password || u.search || u.hash || (u.pathname !== "/" && u.pathname !== "")) return { configured: false, error: `${n.url} must be scheme://host[:port] only` };
  return { configured: true, endpoint: { url: u.origin, username: getEnv(n.username)!, password: getEnv(n.password)! } };
}

export function redact(text: string, secrets: string[]) {
  let out = text;
  for (const s of secrets) if (s && s.length >= 3) out = out.split(s).join("[REDACTED]");
  return out.replace(/Basic\s+[A-Za-z0-9+/=]+/g, "Basic [REDACTED]").slice(0, 500);
}

export class HttpError extends Error { constructor(public status: number) { super(`Router returned HTTP ${status}`); } }
type Fetch = (url: string, init: { method: string; headers: Record<string, string>; signal: AbortSignal }) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;

/** Bounded retries for read-only calls; auth/client errors (4xx) are not retried. */
export async function withRetry<T>(fn: (signal: AbortSignal) => Promise<T>, { attempts = 3, timeoutMs = 5000, backoffMs = 300 } = {}) {
  let last: unknown;
  for (let i = 1; i <= attempts; i++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try { return { value: await fn(ctrl.signal), attempts: i }; }
    catch (e) {
      last = ctrl.signal.aborted ? new Error(`Timed out after ${timeoutMs} ms`) : e;
      if (e instanceof HttpError && e.status < 500) break;
      if (i < attempts) await new Promise((r) => setTimeout(r, backoffMs * i));
    } finally { clearTimeout(timer); }
  }
  throw Object.assign(last instanceof Error ? last : new Error(String(last)), { attempts });
}

/** Read-only RouterOS v7 REST call: GET /rest/system/resource. */
export async function healthCheck(ep: Endpoint, fetchImpl: Fetch, opts?: { attempts?: number; timeoutMs?: number; backoffMs?: number }) {
  const auth = "Basic " + btoa(`${ep.username}:${ep.password}`);
  const { value, attempts } = await withRetry(async (signal) => {
    const res = await fetchImpl(`${ep.url}/rest/system/resource`, { method: "GET", headers: { Authorization: auth, Accept: "application/json" }, signal });
    if (!res.ok) throw new HttpError(res.status);
    return (await res.json()) as Record<string, unknown>;
  }, opts);
  const version = typeof value.version === "string" ? value.version.slice(0, 60) : null;
  return { attempts, version, detail: `uptime ${String(value.uptime ?? "?").slice(0, 40)}, cpu ${String(value["cpu-load"] ?? "?").slice(0, 10)}%` };
}
