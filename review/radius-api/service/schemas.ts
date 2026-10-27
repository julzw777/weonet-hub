/** Proposed schemas only; neither validation nor projection enables an operation. */
import { isIP } from "node:net";
import { z } from "zod";

export const MAX_REQUEST_BYTES = 16384;
export const MAX_RESPONSE_BYTES = 262144;
export const uuid = z.string().uuid();
const clean = (max: number) => z.string().min(1).max(max).refine(v => !/[\x00-\x1f\x7f]/.test(v));
const name = clean(120).refine(v => v === v.trim());
const id = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/);
const username = z.string().regex(/^[a-z0-9._@-]{3,64}$/);
const password = z.string().min(8).max(64).refine(v => !/[\x00-\x1f\x7f]/.test(v));
const timestamp = z.string().datetime({ precision: undefined }).refine(v => {
  // Reject calendar normalization (e.g. February 30), not merely parseable strings.
  const parsed = new Date(v);
  return Number.isFinite(parsed.valueOf()) && parsed.toISOString().slice(0, 19) === v.slice(0, 19)
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/.test(v);
});
const counter = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const ip = z.string().max(45).refine(v => isIP(v) !== 0);
const status = z.enum(["active", "suspended"]);
const pagination = { limit: z.string().regex(/^(?:[1-9]|[1-9][0-9]|100)$/).optional(), cursor: clean(512).optional() };
const range = { username: username.optional(), nas_id: id.optional(), from: timestamp.optional(), to: timestamp.optional() };
const orderedRange = (v: { from?: string; to?: string }) => !v.from || !v.to || Date.parse(v.from) < Date.parse(v.to);

export const operations = ["list_subscribers", "get_subscriber", "create_subscriber", "set_status", "set_plan", "reset_password", "list_plans", "list_sessions", "list_accounting", "list_nas", "get_nas"] as const;
export type Operation = typeof operations[number];
export const mutations = new Set<Operation>(["create_subscriber", "set_status", "set_plan", "reset_password"]);
const empty = z.object({}).strict();
const queries = {
  list_subscribers: z.object({ ...pagination, search: clean(64).optional(), status: status.optional(), plan_id: id.optional() }).strict(),
  list_plans: z.object({ ...pagination, search: clean(64).optional() }).strict(),
  list_sessions: z.object({ ...pagination, ...range }).strict().refine(orderedRange),
  list_accounting: z.object({ ...pagination, ...range, state: z.enum(["open", "closed"]).optional() }).strict().refine(orderedRange),
  list_nas: z.object({ ...pagination, search: clean(64).optional(), status: z.enum(["online", "offline"]).optional() }).strict(),
};
const bodies = {
  create_subscriber: z.object({ username, full_name: name, plan_id: id, password }).strict(),
  set_status: z.object({ status }).strict(),
  set_plan: z.object({ plan_id: id }).strict(),
};
export interface Route { operation: Operation; target?: string }
export function matchRoute(method: string, path: string): Route | null {
  const lists: Record<string, Operation> = { subscribers: "list_subscribers", plans: "list_plans", sessions: "list_sessions", accounting: "list_accounting", nas: "list_nas" };
  const list = /^\/v1\/(subscribers|plans|sessions|accounting|nas)$/.exec(path);
  if (list && method === "GET") return { operation: lists[list[1]] };
  if (path === "/v1/subscribers" && method === "POST") return { operation: "create_subscriber" };
  const single = /^\/v1\/(subscribers|nas)\/([A-Za-z0-9_-]{1,64})(?:\/(status|plan|reset-password))?$/.exec(path);
  if (!single || !id.safeParse(single[2]).success) return null;
  const [, resource, target, action] = single;
  if (!action && method === "GET") return { operation: resource === "nas" ? "get_nas" : "get_subscriber", target };
  if (resource !== "subscribers") return null;
  if (method === "PATCH" && action === "status") return { operation: "set_status", target };
  if (method === "PATCH" && action === "plan") return { operation: "set_plan", target };
  if (method === "POST" && action === "reset-password") return { operation: "reset_password", target };
  return null;
}
export function validateInput(route: Route, query: URLSearchParams, body: unknown) {
  const fields: Record<string, string> = {};
  for (const [key, value] of query) {
    if (Object.hasOwn(fields, key)) throw new Error("Invalid request");
    Object.defineProperty(fields, key, { value, enumerable: true });
  }
  const querySchema = route.operation in queries ? queries[route.operation as keyof typeof queries] : empty;
  querySchema.parse(fields);
  const bodySchema = route.operation in bodies ? bodies[route.operation as keyof typeof bodies] : z.undefined();
  bodySchema.parse(body);
}

const subscriber = z.object({ id, username, full_name: name, plan_id: id, status, created_at: timestamp, expires_at: timestamp.nullable() });
const plan = z.object({ id, name, speed_profile: clean(64), session_limit: z.number().int().min(1).max(100), expiry_days: z.number().int().min(0).max(3650) });
const traffic = { id, username, nas_name: name, started_at: timestamp, input_octets: counter, output_octets: counter };
const session = z.object({ ...traffic, framed_ip: ip });
const accounting = z.object({ ...traffic, stopped_at: timestamp.nullable(), duration_s: counter, terminate_cause: clean(120).nullable() });
const nas = z.object({ id, name, source_ip: ip, status: z.enum(["online", "offline"]) });
/** Strip extras at every envelope/resource layer; no raw repository object may escape. */
export function projectResponse(operation: Operation, input: unknown): unknown {
  const resource = operation.includes("subscriber") || operation === "set_status" || operation === "set_plan" ? subscriber
    : operation === "list_plans" ? plan : operation === "list_sessions" ? session : operation === "list_accounting" ? accounting : nas;
  const schema = operation === "reset_password" ? z.object({ data: z.object({ temporary_password: password }) })
    : operation.startsWith("list_") ? z.object({ data: z.array(resource).max(100), page: z.object({ limit: z.number().int().min(1).max(100), next_cursor: clean(512).nullable() }) }).refine(v => v.data.length <= v.page.limit)
    : z.object({ data: resource });
  const result = schema.parse(input);
  if (new TextEncoder().encode(JSON.stringify(result)).byteLength > MAX_RESPONSE_BYTES) throw new Error("Invalid response");
  return result;
}