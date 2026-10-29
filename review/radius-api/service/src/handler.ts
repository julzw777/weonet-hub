/** WHATWG Request -> Response handler. All I/O is injected (store, verifier, clock, log). */
import { createHash } from "node:crypto";
import { AuthError, verifyServiceToken, type IdentityConfig, type VerifiedIdentity } from "./jwt.js";
import { MAX_REQUEST_BYTES, matchRoute, mutations, projectResponse, uuid, validateInput, type CreateBody, type Route } from "./schemas.js";
import { AuditUnavailableError, OutcomeUnknownError, type MutationInput, type MutationMeta, type SchemaReport, type Store } from "./store.js";

export interface SafeLogEvent { event: string; status: number; code: string; operation?: string; request_id?: string }
export interface Dependencies {
  identity: IdentityConfig | null;
  store: Store | null;
  writesEnabled: boolean;
  /** Cached schema report; refreshed by the runtime. null = not yet checked. */
  schema: () => SchemaReport | null;
  now?: () => number;
  log?: (e: SafeLogEvent) => void;
}
const headers = { "Content-Type": "application/json", "Cache-Control": "no-store", "X-API-Version": "1", "X-Content-Type-Options": "nosniff" };
const json = (body: unknown, status: number) => new Response(JSON.stringify(body), { status, headers });
const MESSAGES: Record<number, string> = { 400: "Invalid request", 401: "Service identity required", 403: "Not permitted", 404: "Not found", 409: "Conflict", 413: "Request too large", 422: "Unprocessable request", 500: "Internal error", 503: "Service unavailable" };

async function readBounded(request: Request): Promise<Uint8Array> {
  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > MAX_REQUEST_BYTES) throw new RangeError("too large");
      chunks.push(part.value);
    }
  } finally { await reader.cancel().catch(() => undefined); }
  return Buffer.concat(chunks);
}

export function createHandler(deps: Dependencies) {
  const now = deps.now ?? (() => Math.floor(Date.now() / 1000));
  const fail = (status: number, code: string, requestId?: string, outcome: "not_applied" | "unknown" = "not_applied", operation?: string) => {
    // Fixed fields only: never bodies, query values, tokens, credentials, identities or exception text.
    try { deps.log?.({ event: "request_failed", status, code, ...(operation ? { operation } : {}), ...(requestId ? { request_id: requestId } : {}) }); } catch { /* ignore */ }
    return json({ error: { code, message: MESSAGES[status] ?? "Error", ...(requestId ? { request_id: requestId } : {}), retryable: status === 503 || outcome === "unknown", outcome } }, status);
  };

  return async (request: Request): Promise<Response> => {
    const url = new URL(request.url);
    if (request.method === "GET" && (url.pathname === "/health" || url.pathname === "/ready")) {
      if (url.search) return fail(400, "INVALID_REQUEST");
      if (url.pathname === "/health") return json({ data: { status: "ok", version: "1" } }, 200);
      const s = deps.schema();
      const reads = Boolean(deps.identity && deps.store && s?.reads);
      const writes = reads && deps.writesEnabled && Boolean(s?.writes);
      if (deps.writesEnabled && !writes) return fail(503, "NOT_READY");
      return reads ? json({ data: { status: "ready", version: "1", reads, writes } }, 200) : fail(503, "NOT_READY");
    }
    if (!deps.identity || !deps.store || !deps.schema()?.reads) return fail(503, "UNCONFIGURED");
    const store = deps.store;
    const requestId = request.headers.get("X-Request-ID") ?? "";
    if (!uuid.safeParse(requestId).success) return fail(400, "INVALID_REQUEST");
    const rid = requestId.toLowerCase();
    const route = matchRoute(request.method, url.pathname);
    if (!route) return fail(404, "NOT_FOUND", rid);
    const writing = mutations.has(route.operation);
    const keyHeader = request.headers.get("Idempotency-Key");
    let parsed: { query: Record<string, string>; body: unknown };
    let bytes: Uint8Array;
    try {
      if (writing ? !uuid.safeParse(keyHeader).success : keyHeader !== null) throw new Error("key");
      bytes = await readBounded(request);
      const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      if (text && !/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(request.headers.get("Content-Type") ?? "")) throw new Error("type");
      parsed = validateInput(route, url.searchParams, text ? JSON.parse(text) : undefined);
    } catch (e) { return fail(e instanceof RangeError ? 413 : 400, "INVALID_REQUEST", rid); }
    const idempotencyKey = keyHeader ? keyHeader.toLowerCase() : null;

    let identity: VerifiedIdentity;
    try {
      identity = verifyServiceToken(request.headers.get("Authorization") ?? "", deps.identity, { method: request.method, pathAndQuery: url.pathname + url.search, body: bytes, requestId, idempotencyKey: keyHeader }, now());
    } catch (e) { return fail(401, e instanceof AuthError ? "IDENTITY_REQUIRED" : "IDENTITY_REQUIRED", rid); }
    try {
      if (!(await store.consumeJti(identity.jti, identity.expiresAt))) return fail(401, "TOKEN_REPLAYED", rid);
    } catch { return fail(503, "UNAVAILABLE", rid); }

    const allowedRole = identity.roles.some(r => writing ? r === "admin" || r === "noc" : true);
    const allowedScope = identity.scopes.includes(writing ? "radius:write" : "radius:read");
    if (!writing) {
      if (!allowedRole || !allowedScope) return fail(403, "FORBIDDEN", rid);
      return read(route, parsed.query, store, rid, fail);
    }

    if (!idempotencyKey) return fail(400, "INVALID_REQUEST", rid);
    const target = route.target;
    if (route.operation !== "create_subscriber" && !target) return fail(400, "INVALID_REQUEST", rid);
    const meta: MutationMeta = {
      operation: route.operation, target: route.target ?? null, actorId: identity.actorId, actorRoles: identity.roles, serviceSubject: identity.serviceSubject,
      requestId: rid, idempotencyKey, requestHash: createHash("sha256").update(`${request.method}\n${url.pathname}\n`).update(bytes).digest("hex"),
    };
    const gate = !allowedRole || !allowedScope ? [403, "FORBIDDEN"] as const : !deps.writesEnabled || !deps.schema()?.writes ? [503, "WRITES_DISABLED"] as const : null;
    if (gate) {
      try { await store.auditOnly(meta, "denied", gate[1]); } catch { return fail(503, "AUDIT_UNAVAILABLE", rid, "not_applied", route.operation); }
      return fail(gate[0], gate[1], rid, "not_applied", route.operation);
    }
    const input: MutationInput = route.operation === "create_subscriber" ? { op: "create_subscriber", body: parsed.body as CreateBody }
      : route.operation === "set_status" && target ? { op: "set_status", id: target, status: (parsed.body as { status: "active" | "suspended" }).status }
      : route.operation === "set_plan" && target ? { op: "set_plan", id: target, planId: (parsed.body as { plan_id: string }).plan_id }
      : { op: "reset_password", id: target ?? "" };
    try {
      const result = await store.mutate(meta, input);
      if (result.kind === "rejected") return fail(result.status, result.code, rid, "not_applied", route.operation);
      const body = projectResponse(route.operation, result.body);
      return json(result.kind === "replay" ? { ...(body as object), idempotent_replay: true } : body, result.status);
    } catch (e) {
      if (e instanceof AuditUnavailableError) return fail(503, "AUDIT_UNAVAILABLE", rid, "not_applied", route.operation);
      return fail(500, "OUTCOME_UNKNOWN", rid, e instanceof OutcomeUnknownError ? "unknown" : "unknown", route.operation);
    }
  };
}

async function read(route: Route, q: Record<string, string>, store: Store, rid: string, fail: (s: number, c: string, r?: string) => Response) {
  const limit = q.limit ? Number(q.limit) : 50;
  try {
    let out: unknown;
    switch (route.operation) {
      case "get_subscriber": case "get_nas": {
        if (!route.target) return fail(400, "INVALID_REQUEST", rid);
        const row = route.operation === "get_subscriber" ? await store.getSubscriber(route.target) : await store.getNas(route.target);
        if (!row) return fail(404, "NOT_FOUND", rid);
        out = { data: row };
        break;
      }
      default: {
        const fn = { list_subscribers: store.listSubscribers, list_plans: store.listPlans, list_sessions: store.listSessions, list_accounting: store.listAccounting, list_nas: store.listNas }[route.operation as "list_plans"];
        const page = await fn.call(store, q as never, limit);
        out = { data: page.data, page: { limit, next_cursor: page.next_cursor } };
      }
    }
    return new Response(JSON.stringify(projectResponse(route.operation, out)), { status: 200, headers });
  } catch { return fail(503, "UNAVAILABLE", rid); }
}
