/** PROPOSED / UNCONFIRMED. Pure rules; no network or deployment side effects. */
import { isWrite, resolveBase, toRequest, validateOp, type Op } from "./lib";

export interface DraftRequest { op: Op; idempotencyKey?: string; requestId: string }
export type AuditOutcome = "requested" | "succeeded" | "failed" | "unconfigured" | "unknown";
export interface AuditEvent { operation: string; target_ref: string | null; request_id: string; idempotency_key: string | null; outcome: AuditOutcome; upstream_status?: number }
export interface DraftDependencies {
  base?: string;
  confirmed: boolean;
  authorize: (request: DraftRequest) => Promise<string>;
  audit: (event: AuditEvent) => Promise<void>;
  send: (url: string, init: RequestInit) => Promise<Response>;
}
export interface DraftResult { status: number; body: Record<string, unknown> }
const ID = /^[A-Za-z0-9_-]{1,64}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function validateDraftRequest(body: unknown, requestId: string, key?: string): DraftRequest | null {
  const parsed = validateOp(body);
  if (!parsed.ok || !UUID.test(requestId) || (isWrite(parsed.value.op) && (!key || !UUID.test(key)))) return null;
  return { op: parsed.value, requestId, ...(key ? { idempotencyKey: key } : {}) };
}
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const text = (v: unknown, max = 120): v is string => typeof v === "string" && v.length > 0 && v.length <= max;
const id = (v: unknown): v is string => typeof v === "string" && ID.test(v);
const timestamp = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/.test(v) && Number.isFinite(Date.parse(v));
const count = (v: unknown) => Number.isSafeInteger(v) && Number(v) >= 0;
function subscriber(v: unknown) {
  if (!record(v) || !id(v.id) || typeof v.username !== "string" || !/^[a-z0-9._@-]{3,64}$/.test(v.username) || !text(v.full_name) || !id(v.plan_id) || !["active", "suspended"].includes(String(v.status)) || !timestamp(v.created_at) || !(v.expires_at === null || timestamp(v.expires_at))) throw new Error("Invalid subscriber response");
  return { id: v.id, username: v.username, full_name: v.full_name, plan_id: v.plan_id, status: v.status, created_at: v.created_at, expires_at: v.expires_at };
}
function plan(v: unknown) {
  if (!record(v) || !id(v.id) || !text(v.name) || !text(v.speed_profile, 64) || !count(v.session_limit) || Number(v.session_limit) < 1 || Number(v.session_limit) > 100 || !count(v.expiry_days) || Number(v.expiry_days) > 3650) throw new Error("Invalid plan response");
  return { id: v.id, name: v.name, speed_profile: v.speed_profile, session_limit: v.session_limit, expiry_days: v.expiry_days };
}
function session(v: unknown, accounting: boolean) {
  if (!record(v) || !id(v.id) || typeof v.username !== "string" || !/^[a-z0-9._@-]{3,64}$/.test(v.username) || !text(v.nas_name) || !timestamp(v.started_at) || !count(v.input_octets) || !count(v.output_octets)) throw new Error("Invalid traffic response");
  const base = { id: v.id, username: v.username, nas_name: v.nas_name, started_at: v.started_at, input_octets: v.input_octets, output_octets: v.output_octets };
  if (accounting) {
    if (!(v.stopped_at === null || timestamp(v.stopped_at)) || !count(v.duration_s) || !(v.terminate_cause === null || text(v.terminate_cause))) throw new Error("Invalid accounting response");
    return { ...base, stopped_at: v.stopped_at, duration_s: v.duration_s, terminate_cause: v.terminate_cause };
  }
  if (!(v.framed_ip === null || ip(v.framed_ip))) throw new Error("Invalid session IP");
  return { ...base, framed_ip: v.framed_ip };
}
function ip(v: unknown): v is string {
  if (typeof v !== "string" || v.length > 45) return false;
  if (v.includes(":")) return /^[0-9a-f:]+$/i.test(v) && v.split(":").length >= 3 && v.split(":").length <= 9;
  return /^(\d{1,3}\.){3}\d{1,3}$/.test(v) && v.split(".").every(n => Number(n) <= 255);
}
function nas(v: unknown) {
  if (!record(v) || !id(v.id) || !text(v.name) || !ip(v.source_ip) || !["online", "offline", "unknown"].includes(String(v.status))) throw new Error("Invalid NAS response");
  return { id: v.id, name: v.name, source_ip: v.source_ip, status: v.status };
}
/** Explicit field allowlists, including the ONLY permitted credential response. */
export function validateResponse(op: Op, body: unknown): Record<string, unknown> {
  if (!record(body) || !("data" in body)) throw new Error("Invalid response envelope");
  if (op.op === "reset_password") {
    if (!record(body.data) || typeof body.data.temporary_password !== "string" || body.data.temporary_password.length < 8 || body.data.temporary_password.length > 64 || /[\x00-\x1f\x7f]/.test(body.data.temporary_password)) throw new Error("Invalid credential response");
    return { data: { temporary_password: body.data.temporary_password } };
  }
  if (op.op === "create_subscriber" || op.op === "set_status") {
    const value = subscriber(body.data);
    if (op.op === "set_status" && (value.id !== op.id || value.status !== op.status)) throw new Error("Mismatched subscriber response");
    if (op.op === "create_subscriber" && (value.username !== op.username || value.plan_id !== op.plan_id)) throw new Error("Mismatched creation response");
    return { data: value };
  }
  if (!Array.isArray(body.data) || body.data.length > 100 || !record(body.page) || !(body.page.next_cursor === null || (typeof body.page.next_cursor === "string" && body.page.next_cursor.length <= 512)) || !count(body.page.limit) || Number(body.page.limit) < 1 || Number(body.page.limit) > 100) throw new Error("Invalid paginated response");
  const mapper: (v: unknown) => Record<string, unknown> = op.op === "list_subscribers" ? subscriber : op.op === "list_plans" ? plan : op.op === "list_nas" ? nas : (v: unknown) => session(v, op.op === "list_accounting");
  return { data: body.data.map(mapper), page: { next_cursor: body.page.next_cursor, limit: body.page.limit } };
}
export function requestHeaders(request: DraftRequest, authorization: string) {
  return { Authorization: authorization, "Content-Type": "application/json", Accept: "application/json", "X-Request-ID": request.requestId, ...(isWrite(request.op.op) ? { "Idempotency-Key": request.idempotencyKey ?? "" } : {}) };
}
const failure = (request: DraftRequest, status: number, code: string, message: string, outcome = "not_attempted"): DraftResult => ({ status, body: { error: { code, message, request_id: request.requestId, outcome }, mock: false } });

/** No retries after an uncertain write; no success (or credentials) before completion audit. */
export async function executeDraft(request: DraftRequest, deps: DraftDependencies): Promise<DraftResult> {
  const writing = isWrite(request.op.op);
  const event = (outcome: AuditOutcome, upstream_status?: number): AuditEvent => ({ operation: request.op.op, target_ref: "id" in request.op ? request.op.id : null, request_id: request.requestId, idempotency_key: request.idempotencyKey ?? null, outcome, ...(upstream_status === undefined ? {} : { upstream_status }) });
  const audit = async (outcome: AuditOutcome, status?: number) => { if (writing) await deps.audit(event(outcome, status)); };
  if (writing && (!request.idempotencyKey || !UUID.test(request.idempotencyKey))) return failure(request, 400, "INVALID_REQUEST", "A UUID Idempotency-Key is required");
  const base = resolveBase(deps.base);
  let authorization: string;
  try {
    if (!deps.confirmed || !base) throw new Error("Unconfigured");
    authorization = await deps.authorize(request);
    if (!/^Bearer [A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(authorization)) throw new Error("No signed service identity");
  } catch {
    try { await audit("unconfigured"); } catch { return failure(request, 503, "AUDIT_UNAVAILABLE", "Request was not sent; audit storage is unavailable"); }
    return failure(request, 503, "UNCONFIGURED", "RADIUS provisioning contract and signed service identity are not configured");
  }
  try { await audit("requested"); } catch { return failure(request, 503, "AUDIT_UNAVAILABLE", "Request was not sent; audit storage is unavailable"); }
  const upstream = toRequest(request.op);
  let res: Response;
  let raw: unknown;
  try {
    res = await deps.send(base + upstream.path, { method: upstream.method, headers: requestHeaders(request, authorization), redirect: "error", signal: AbortSignal.timeout(8000), body: upstream.body ? JSON.stringify(upstream.body) : undefined });
    // Bound streaming before JSON parsing; never forward upstream text/errors.
    const reader = res.body?.getReader();
    if (!reader) throw new Error("Empty response");
    const chunks: Uint8Array[] = []; let size = 0;
    try { while (true) { const part = await reader.read(); if (part.done) break; size += part.value.byteLength; if (size > 262144) throw new Error("Response too large"); chunks.push(part.value); } }
    finally { await reader.cancel(); }
    const bytes = new Uint8Array(size); let offset = 0;
    for (const part of chunks) { bytes.set(part, offset); offset += part.byteLength; }
    raw = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    try { await audit("unknown"); } catch { return failure(request, 503, "AUDIT_RECONCILIATION_REQUIRED", "Outcome may be unknown and audit completion failed; reconcile using the request ID", "unknown"); }
    return failure(request, 502, "UPSTREAM_OUTCOME_UNKNOWN", "No confirmed response; reconcile before retrying with the same key", "unknown");
  }
  if (!res.ok) {
    try { await audit("failed", res.status); } catch { return failure(request, 503, "AUDIT_RECONCILIATION_REQUIRED", "Audit completion failed; reconcile using the request ID", "unknown"); }
    return failure(request, [400, 401, 403, 404, 409, 422, 429, 503].includes(res.status) ? res.status : 502, "UPSTREAM_REJECTED", "Provisioning API rejected the request", "rejected");
  }
  let safe: Record<string, unknown>;
  try { safe = validateResponse(request.op, raw); } catch {
    try { await audit("unknown", res.status); } catch { return failure(request, 503, "AUDIT_RECONCILIATION_REQUIRED", "Upstream may have changed; response and audit need reconciliation", "unknown"); }
    return failure(request, 502, "INVALID_UPSTREAM_RESPONSE", "Upstream response did not match the draft contract; reconcile before retrying", "unknown");
  }
  try { await audit("succeeded", res.status); } catch {
    return failure(request, 503, "AUDIT_RECONCILIATION_REQUIRED", "Upstream reported success but Hub audit completion failed; do not repeat with a new key", "upstream_succeeded_hub_audit_failed");
  }
  return { status: res.status, body: { ...safe, mock: false, request_id: request.requestId } };
}