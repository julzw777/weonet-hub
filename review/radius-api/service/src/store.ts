/** Storage boundary used by the handler. The MySQL implementation lives in mysql-store.ts. */
import type { CreateBody, ListQuery, Operation } from "./schemas.js";

export interface SchemaReport { reads: boolean; writes: boolean; problems: string[] }
export interface MutationMeta {
  operation: Operation; target: string | null; actorId: string; actorRoles: string[]; serviceSubject: string;
  requestId: string; idempotencyKey: string; requestHash: string;
}
export type MutationInput =
  | { op: "create_subscriber"; body: CreateBody }
  | { op: "set_status"; id: string; status: "active" | "suspended" }
  | { op: "set_plan"; id: string; planId: string }
  | { op: "reset_password"; id: string };
/** applied: committed with audit. rejected: rolled back business rule (not applied). replay: stored idempotent response. */
export type MutationResult =
  | { kind: "applied" | "replay"; status: number; body: unknown }
  | { kind: "rejected"; status: 404 | 409 | 422; code: string };
export class AuditUnavailableError extends Error {}
/** Commit outcome could not be confirmed; caller must report outcome "unknown". */
export class OutcomeUnknownError extends Error {}
export interface Page<T> { data: T[]; next_cursor: string | null }

export interface Store {
  checkSchema(): Promise<SchemaReport>;
  /** Durable single-use jti; false when already seen. */
  consumeJti(jti: string, expiresAt: Date): Promise<boolean>;
  /** Records an audit row outside any business transaction (e.g. denied/disabled mutations). Throws AuditUnavailableError. */
  auditOnly(meta: MutationMeta, outcome: string, code: string): Promise<void>;
  mutate(meta: MutationMeta, input: MutationInput): Promise<MutationResult>;
  getSubscriber(id: string): Promise<unknown | null>;
  listSubscribers(q: ListQuery<"list_subscribers">, limit: number): Promise<Page<unknown>>;
  listPlans(q: ListQuery<"list_plans">, limit: number): Promise<Page<unknown>>;
  listSessions(q: ListQuery<"list_sessions">, limit: number): Promise<Page<unknown>>;
  listAccounting(q: ListQuery<"list_accounting">, limit: number): Promise<Page<unknown>>;
  listNas(q: ListQuery<"list_nas">, limit: number): Promise<Page<unknown>>;
  getNas(id: string): Promise<unknown | null>;
}
