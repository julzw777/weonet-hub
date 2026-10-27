/** Offline review scaffold. No listener, environment access, fetch or DB adapter. */
import { z } from "zod";
import { OPERATIONS_IMPLEMENTED, parseConfiguration, type Configuration } from "./config";
import { MAX_REQUEST_BYTES, matchRoute, mutations, uuid, validateInput, type Route } from "./schemas";
import type { VerifiedSchemaRepositories } from "./repositories";

export interface VerificationInput {
  authorization: string;
  method: string;
  pathAndQuery: string;
  bodyBytes: Uint8Array;
  requestId: string;
  idempotencyKey?: string;
}
/** The owner-approved implementation must cryptographically verify the signature,
 * issuer/audience/algorithm/key, time window <=300s, jti replay defense and signed
 * staff delegation bound to this exact method/path/body/request ID/key.
 * No production verifier exists in this scaffold. Injected fakes are local tests only. */
export interface VerifiedIdentity {
  serviceSubject: string;
  actorId: string;
  roles: ("admin" | "noc" | "care")[];
  scopes: ("radius:read" | "radius:write")[];
}
const identitySchema = z.object({ serviceSubject: z.string().min(1).max(200), actorId: uuid, roles: z.array(z.enum(["admin", "noc", "care"])).max(3), scopes: z.array(z.enum(["radius:read", "radius:write"])).max(2) }).strict();
export interface SafeLogEvent { event: "request_rejected"; status: number; code: string }
export interface Dependencies {
  configuration?: unknown;
  verifySignedIdentity?: (input: VerificationInput, policy: Configuration["identity"]) => Promise<VerifiedIdentity>;
  repositories?: VerifiedSchemaRepositories;
  log?: (event: SafeLogEvent) => void;
}
const headers = { "Content-Type": "application/json", "Cache-Control": "no-store", "X-API-Version": "1" };
function json(body: unknown, status: number) { return new Response(JSON.stringify(body), { status, headers }); }
async function readBounded(request: Request): Promise<Uint8Array> {
  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > MAX_REQUEST_BYTES) throw new Error("Invalid request");
      chunks.push(part.value);
    }
  } finally { await reader.cancel(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return bytes;
}
export function createService(dependencies: Dependencies = {}) {
  const configuration = parseConfiguration(dependencies.configuration);
  const reject = (status: number, code: string, requestId?: string) => {
    // Never log bodies, URL/query, authorization, identity, exceptions or config.
    try { dependencies.log?.({ event: "request_rejected", status, code }); } catch { /* no operation can proceed */ }
    return json({ error: { code, message: status === 400 ? "Invalid request" : status === 401 ? "Service identity required" : status === 403 ? "Not permitted" : "Service unavailable", ...(requestId ? { request_id: requestId } : {}), retryable: false, outcome: "not_applied" } }, status);
  };
  return async (request: Request): Promise<Response> => {
    const url = new URL(request.url);
    // Generic local process probes only. Owner must approve transport/access.
    if (request.method === "GET" && ["/health", "/ready"].includes(url.pathname)) {
      if (url.search || request.body) return reject(400, "INVALID_REQUEST");
      if (url.pathname === "/health") return json({ data: { status: "ok", version: "1" } }, 200);
      const ready = Boolean(configuration && dependencies.verifySignedIdentity && OPERATIONS_IMPLEMENTED);
      return ready ? json({ data: { status: "ready", version: "1" } }, 200) : reject(503, "NOT_READY");
    }
    // Reject absent configuration BEFORE parsing or accessing any dependency.
    if (!configuration || !dependencies.verifySignedIdentity) return reject(503, "UNCONFIGURED");
    const authorization = request.headers.get("Authorization") ?? "";
    if (authorization.length > 8192 || !/^Bearer [A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(authorization)) return reject(401, "IDENTITY_REQUIRED");
    const requestId = request.headers.get("X-Request-ID") ?? "";
    const idempotencyKey = request.headers.get("Idempotency-Key") ?? undefined;
    let route: Route;
    let bytes: Uint8Array;
    try {
      uuid.parse(requestId);
      const matched = matchRoute(request.method, url.pathname);
      if (!matched) return reject(400, "INVALID_REQUEST", requestId);
      route = matched;
      if (mutations.has(route.operation)) uuid.parse(idempotencyKey);
      else if (idempotencyKey !== undefined) uuid.parse(idempotencyKey);
      bytes = await readBounded(request);
      const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      if (text && !/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(request.headers.get("Content-Type") ?? "")) throw new Error("Invalid request");
      validateInput(route, url.searchParams, text ? JSON.parse(text) : undefined);
    } catch { return reject(400, "INVALID_REQUEST", uuid.safeParse(requestId).success ? requestId : undefined); }
    let identity: VerifiedIdentity;
    try {
      identity = identitySchema.parse(await dependencies.verifySignedIdentity({ authorization, method: request.method, pathAndQuery: url.pathname + url.search, bodyBytes: bytes, requestId, idempotencyKey }, configuration.identity));
      if (identity.serviceSubject !== configuration.identity.serviceSubject) return reject(401, "IDENTITY_REQUIRED", requestId);
    } catch { return reject(401, "IDENTITY_REQUIRED", requestId); }
    const writing = mutations.has(route.operation);
    if (!identity.scopes.includes(writing ? "radius:write" : "radius:read") || !identity.roles.some(role => writing ? role === "admin" || role === "noc" : ["admin", "noc", "care"].includes(role))) return reject(403, "FORBIDDEN", requestId);
    // Intentionally unconditional: no config/identity can activate reads or writes.
    // No audit/idempotency/DB claim is made; the request is definitely not applied.
    return reject(503, "OPERATION_DISABLED", requestId);
  };
}