/** Strict request/response schemas. Nothing outside these shapes reaches SQL or leaves the service. */
import { isIP } from "node:net";
import { z } from "zod";

export const MAX_REQUEST_BYTES = 16384;
export const MAX_RESPONSE_BYTES = 262144;
export const uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
const clean = (max: number) => z.string().min(1).max(max).refine(v => !/[\x00-\x1f\x7f]/.test(v));
const name = clean(120).refine(v => v === v.trim());
export const resourceId = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/);
export const username = z.string().regex(/^[a-z0-9._@-]{3,64}$/);
export const password = z.string().min(8).max(64).refine(v => !/[\x00-\x1f\x7f]/.test(v));
const timestamp = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/).refine(v => {
  const d = new Date(v);
  return Number.isFinite(d.valueOf()) && d.toISOString().slice(0, 19) === v.slice(0, 19);
});
const counter = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const ip = z.string().max(45).refine(v => isIP(v) !== 0);
export const subscriberStatus = z.enum(["active", "suspended"]);
const limit = z.string().regex(/^(?:[1-9]|[1-9][0-9]|100)$/).optional();
const cursor = z.string().regex(/^[0-9]{1,19}$/).optional();
const range = { username: username.optional(), from: timestamp.optional(), to: timestamp.optional() };
const ordered = (v: { from?: string; to?: string }) => !v.from || !v.to || Date.parse(v.from) < Date.parse(v.to);

export const operations = ["list_subscribers", "get_subscriber", "create_subscriber", "set_status", "set_plan", "reset_password", "list_plans", "list_sessions", "list_accounting", "list_nas", "get_nas"] as const;
export type Operation = typeof operations[number];
export const mutations = new Set<Operation>(["create_subscriber", "set_status", "set_plan", "reset_password"]);

export const querySchemas = {
  list_subscribers: z.object({ limit, cursor, search: clean(64).optional(), status: subscriberStatus.optional(), plan_id: resourceId.optional() }).strict(),
  list_plans: z.object({ limit, cursor }).strict(),
  list_sessions: z.object({ limit, cursor, ...range }).strict().refine(ordered),
  list_accounting: z.object({ limit, cursor, ...range, state: z.enum(["open", "closed"]).optional() }).strict().refine(ordered),
  list_nas: z.object({ limit, cursor }).strict(),
};
export const bodySchemas = {
  create_subscriber: z.object({ username, full_name: name, plan_id: resourceId, password }).strict(),
  set_status: z.object({ status: subscriberStatus }).strict(),
  set_plan: z.object({ plan_id: resourceId }).strict(),
};
export type ListQuery<O extends keyof typeof querySchemas> = z.infer<(typeof querySchemas)[O]>;
export type CreateBody = z.infer<typeof bodySchemas.create_subscriber>;

export interface Route { operation: Operation; target?: string }
export function matchRoute(method: string, path: string): Route | null {
  const lists: Record<string, Operation> = { subscribers: "list_subscribers", plans: "list_plans", sessions: "list_sessions", accounting: "list_accounting", nas: "list_nas" };
  const list = /^\/v1\/(subscribers|plans|sessions|accounting|nas)$/.exec(path);
  if (list && method === "GET") return { operation: lists[list[1]] };
  if (path === "/v1/subscribers" && method === "POST") return { operation: "create_subscriber" };
  const single = /^\/v1\/(subscribers|nas)\/([A-Za-z0-9_-]{1,64})(?:\/(status|plan|reset-password))?$/.exec(path);
  if (!single) return null;
  const [, resource, target, action] = single;
  if (!action && method === "GET") return { operation: resource === "nas" ? "get_nas" : "get_subscriber", target };
  if (resource !== "subscribers") return null;
  if (method === "PATCH" && action === "status") return { operation: "set_status", target };
  if (method === "PATCH" && action === "plan") return { operation: "set_plan", target };
  if (method === "POST" && action === "reset-password") return { operation: "reset_password", target };
  return null;
}
/** Rejects duplicate query keys, unknown keys and any body on non-body routes. */
export function validateInput(route: Route, query: URLSearchParams, body: unknown): { query: Record<string, string>; body: unknown } {
  const fields: Record<string, string> = Object.create(null);
  for (const [key, value] of query) {
    if (key in fields) throw new Error("duplicate");
    fields[key] = value;
  }
  const qs = route.operation in querySchemas ? querySchemas[route.operation as keyof typeof querySchemas] : z.object({}).strict();
  const bs = route.operation in bodySchemas ? bodySchemas[route.operation as keyof typeof bodySchemas] : z.undefined();
  return { query: qs.parse({ ...fields }) as Record<string, string>, body: bs.parse(body) };
}

export const subscriberOut = z.object({ id: resourceId, username, full_name: name, plan_id: resourceId, status: subscriberStatus, created_at: timestamp, expires_at: timestamp.nullable() });
const planOut = z.object({ id: resourceId, name, speed_profile: clean(64), session_limit: z.number().int().min(1).max(100), expiry_days: z.number().int().min(0).max(3650) });
const traffic = { id: resourceId, username, nas_name: name, started_at: timestamp, input_octets: counter, output_octets: counter };
const sessionOut = z.object({ ...traffic, framed_ip: ip.nullable() });
const accountingOut = z.object({ ...traffic, stopped_at: timestamp.nullable(), duration_s: counter, terminate_cause: clean(120).nullable() });
// Online/offline is not derivable from the NAS table; never invent a health claim.
const nasOut = z.object({ id: resourceId, name, source_ip: ip, status: z.literal("unknown") });

/** Strip extras at every layer; no raw repository row may escape. */
export function projectResponse(operation: Operation, input: unknown): unknown {
  const resource = ["get_subscriber", "list_subscribers", "create_subscriber", "set_status", "set_plan"].includes(operation) ? subscriberOut
    : operation === "list_plans" ? planOut : operation === "list_sessions" ? sessionOut : operation === "list_accounting" ? accountingOut : nasOut;
  const schema = operation === "reset_password" ? z.object({ data: z.object({ temporary_password: password }) })
    : operation.startsWith("list_") ? z.object({ data: z.array(resource).max(100), page: z.object({ limit: z.number().int().min(1).max(100), next_cursor: z.string().regex(/^[0-9]{1,19}$/).nullable() }) }).refine(v => v.data.length <= v.page.limit)
    : z.object({ data: resource });
  const result = schema.parse(input);
  if (Buffer.byteLength(JSON.stringify(result)) > MAX_RESPONSE_BYTES) throw new Error("response too large");
  return result;
}
