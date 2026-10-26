// Pure rules for the RADIUS integration layer. No Deno APIs here so it can be unit tested.
export type SubscriberStatus = "active" | "suspended";
export interface RadiusSubscriber { id: string; username: string; full_name: string; plan_id: string; status: SubscriberStatus; created_at: string; expires_at: string | null }
export interface RadiusPlan { id: string; name: string; speed_profile: string; session_limit: number; expiry_days: number }
export interface RadiusSession { id: string; username: string; nas_name: string; framed_ip: string; started_at: string; input_octets: number; output_octets: number }
export interface RadiusAccounting { id: string; username: string; nas_name: string; started_at: string; stopped_at: string | null; duration_s: number; input_octets: number; output_octets: number; terminate_cause: string | null }
export interface RadiusNas { id: string; name: string; source_ip: string; status: "online" | "offline" }

export const READ_ROLES = ["admin", "noc", "care"];
export const WRITE_ROLES = ["admin", "noc"];

export type Op =
  | { op: "list_subscribers"; search?: string }
  | { op: "create_subscriber"; username: string; full_name: string; plan_id: string; password: string }
  | { op: "set_status"; id: string; status: SubscriberStatus }
  | { op: "reset_password"; id: string }
  | { op: "list_plans" } | { op: "list_sessions" } | { op: "list_accounting" } | { op: "list_nas" };

const ALLOWED: Record<string, string[]> = {
  list_subscribers: ["search"], create_subscriber: ["username", "full_name", "plan_id", "password"],
  set_status: ["id", "status"], reset_password: ["id"], list_plans: [], list_sessions: [], list_accounting: [], list_nas: [],
};
export const isWrite = (op: string) => ["create_subscriber", "set_status", "reset_password"].includes(op);
export const canRead = (roles: string[]) => roles.some((r) => READ_ROLES.includes(r));
export const canWrite = (roles: string[]) => roles.some((r) => WRITE_ROLES.includes(r));

const ID = /^[A-Za-z0-9_-]{1,64}$/;
const USER = /^[a-z0-9._@-]{3,64}$/;

export function validateOp(body: unknown): { ok: true; value: Op } | { ok: false; error: string } {
  if (!body || typeof body !== "object") return { ok: false, error: "Invalid request" };
  const b = body as Record<string, unknown>;
  const fields = ALLOWED[b.op as string];
  if (!fields) return { ok: false, error: "Unknown operation" };
  const extra = Object.keys(b).filter((k) => k !== "op" && !fields.includes(k));
  if (extra.length) return { ok: false, error: `Unexpected field: ${extra[0]}` };
  switch (b.op) {
    case "list_subscribers":
      if (b.search !== undefined && (typeof b.search !== "string" || b.search.length > 64)) return { ok: false, error: "Invalid search" };
      break;
    case "create_subscriber":
      if (typeof b.username !== "string" || !USER.test(b.username)) return { ok: false, error: "Username must be 3–64 lowercase letters, digits or . _ @ -" };
      if (typeof b.full_name !== "string" || !b.full_name.trim() || b.full_name.length > 120) return { ok: false, error: "Full name is required" };
      if (typeof b.plan_id !== "string" || !ID.test(b.plan_id)) return { ok: false, error: "Choose a plan" };
      if (typeof b.password !== "string" || b.password.length < 8 || b.password.length > 64) return { ok: false, error: "Password must be 8–64 characters" };
      break;
    case "set_status":
      if (typeof b.id !== "string" || !ID.test(b.id)) return { ok: false, error: "Invalid subscriber" };
      if (b.status !== "active" && b.status !== "suspended") return { ok: false, error: "Invalid status" };
      break;
    case "reset_password":
      if (typeof b.id !== "string" || !ID.test(b.id)) return { ok: false, error: "Invalid subscriber" };
      break;
  }
  return { ok: true, value: b as unknown as Op };
}

/** Maps an operation to the fixed upstream REST call. Paths are never built from free text except validated IDs. */
export function toRequest(op: Op): { method: "GET" | "POST" | "PATCH"; path: string; body?: unknown } {
  switch (op.op) {
    case "list_subscribers": return { method: "GET", path: `/v1/subscribers${op.search ? `?search=${encodeURIComponent(op.search)}` : ""}` };
    case "create_subscriber": return { method: "POST", path: "/v1/subscribers", body: { username: op.username, full_name: op.full_name, plan_id: op.plan_id, password: op.password } };
    case "set_status": return { method: "PATCH", path: `/v1/subscribers/${op.id}/status`, body: { status: op.status } };
    case "reset_password": return { method: "POST", path: `/v1/subscribers/${op.id}/reset-password` };
    case "list_plans": return { method: "GET", path: "/v1/plans" };
    case "list_sessions": return { method: "GET", path: "/v1/sessions" };
    case "list_accounting": return { method: "GET", path: "/v1/accounting" };
    case "list_nas": return { method: "GET", path: "/v1/nas" };
  }
}

/** Removes any shared secret / password fields before data leaves the server. */
export function stripSecrets<T>(v: T): T {
  if (Array.isArray(v)) return v.map(stripSecrets) as T;
  if (v && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v)) if (!/secret|password|token/i.test(k)) out[k] = stripSecrets(val);
    return out as T;
  }
  return v;
}

/** Audit details never include passwords. */
export function auditDetails(op: Op): Record<string, unknown> {
  if (op.op === "create_subscriber") return { username: op.username, full_name: op.full_name, plan_id: op.plan_id };
  if (op.op === "set_status") return { status: op.status };
  return {};
}

export function resolveBase(raw: string | undefined): string | null {
  if (!raw) return null;
  try { const u = new URL(raw); if (u.protocol !== "https:" || u.username || u.password || u.search) return null; return u.origin + u.pathname.replace(/\/$/, ""); } catch { return null; }
}

// ---- Mock responses (used only when RADIUS_API_BASE_URL / RADIUS_API_TOKEN are not set) ----
const plans: RadiusPlan[] = [
  { id: "plan-basic", name: "Home Basic", speed_profile: "10M/5M", session_limit: 1, expiry_days: 30 },
  { id: "plan-plus", name: "Home Plus", speed_profile: "25M/10M", session_limit: 2, expiry_days: 30 },
  { id: "plan-biz", name: "Business", speed_profile: "50M/50M", session_limit: 4, expiry_days: 30 },
];
const subs: RadiusSubscriber[] = [
  { id: "sub-001", username: "demo.user1", full_name: "Demo Subscriber One", plan_id: "plan-basic", status: "active", created_at: "2026-09-01T09:00:00Z", expires_at: "2026-11-01T00:00:00Z" },
  { id: "sub-002", username: "demo.user2", full_name: "Demo Subscriber Two", plan_id: "plan-plus", status: "suspended", created_at: "2026-09-12T09:00:00Z", expires_at: "2026-10-12T00:00:00Z" },
];
const nas: RadiusNas[] = [
  { id: "nas-1", name: "Demo NAS A", source_ip: "192.0.2.10", status: "online" },
  { id: "nas-2", name: "Demo NAS B", source_ip: "192.0.2.11", status: "offline" },
];
const sessions: RadiusSession[] = [
  { id: "ses-1", username: "demo.user1", nas_name: "Demo NAS A", framed_ip: "198.51.100.20", started_at: "2026-10-26T08:00:00Z", input_octets: 1_250_000_000, output_octets: 210_000_000 },
];
const accounting: RadiusAccounting[] = [
  { id: "acc-1", username: "demo.user1", nas_name: "Demo NAS A", started_at: "2026-10-25T07:00:00Z", stopped_at: "2026-10-25T19:30:00Z", duration_s: 45000, input_octets: 3_400_000_000, output_octets: 400_000_000, terminate_cause: "User-Request" },
  { id: "acc-2", username: "demo.user2", nas_name: "Demo NAS B", started_at: "2026-10-10T07:00:00Z", stopped_at: "2026-10-10T08:00:00Z", duration_s: 3600, input_octets: 90_000_000, output_octets: 8_000_000, terminate_cause: "Admin-Reset" },
];

export function mockResponse(op: Op, random: () => string): { status: number; body: unknown } {
  switch (op.op) {
    case "list_subscribers": {
      const q = op.search?.toLowerCase();
      return { status: 200, body: { data: q ? subs.filter((s) => s.username.includes(q) || s.full_name.toLowerCase().includes(q)) : subs } };
    }
    case "create_subscriber":
      if (subs.some((s) => s.username === op.username)) return { status: 409, body: { error: "Username already exists" } };
      if (!plans.some((p) => p.id === op.plan_id)) return { status: 422, body: { error: "Unknown plan" } };
      return { status: 201, body: { data: { id: `sub-${random().slice(0, 6)}`, username: op.username, full_name: op.full_name, plan_id: op.plan_id, status: "active", created_at: new Date().toISOString(), expires_at: null } } };
    case "set_status": {
      const s = subs.find((x) => x.id === op.id);
      if (!s) return { status: 404, body: { error: "Subscriber not found" } };
      return { status: 200, body: { data: { ...s, status: op.status } } };
    }
    case "reset_password": {
      if (!subs.some((x) => x.id === op.id)) return { status: 404, body: { error: "Subscriber not found" } };
      return { status: 200, body: { data: { temporary_password: random().slice(0, 12) } } };
    }
    case "list_plans": return { status: 200, body: { data: plans } };
    case "list_sessions": return { status: 200, body: { data: sessions } };
    case "list_accounting": return { status: 200, body: { data: accounting } };
    case "list_nas": return { status: 200, body: { data: nas.map((n) => ({ ...n, shared_secret: "never-sent" })) } };
  }
}
