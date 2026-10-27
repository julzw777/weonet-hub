# Weonet RADIUS service — offline review scaffold

**Review only, 2026-10-27. Nothing deployed or tested against a live API, database or NAS.**

This standalone TypeScript package exports `createService` from `handler.ts`, an injected WHATWG Request/Response handler. It has **no listener/start command**, environment discovery, Docker configuration, database driver, SQL, fetch or production identity verifier. It imports none of the Hub or Supabase functions. A future owner-approved runtime wrapper is a separate review, not a missing setup step to perform now.

## Local checks

From the existing project root, using already installed dependencies (no install or network access):

```sh
npm test -- --config vitest.config.ts --root review/radius-api/service
tsgo --ignoreConfig --noEmit --strict --target ES2022 --module ESNext --moduleResolution bundler --lib ES2022,DOM,DOM.Iterable --types node --skipLibCheck review/radius-api/service/config.ts review/radius-api/service/schemas.ts review/radius-api/service/repositories.ts review/radius-api/service/handler.ts review/radius-api/service/handler.test.ts review/radius-api/service/vitest.config.ts
```

The package manifest permits local `npm test` when review dependencies are already available. Do not install/start this on the RADIUS host as part of this stage. Tests inject synthetic configuration/identity and constructed requests; test resource objects are never imported into the handler or returned by service routes. Exact observed results are in `RADIUS-CONTRACT-VERIFICATION.md` at the project root.

## Behavior and constraints

- `GET /health`: generic process liveness only, 200 `data:{status:"ok",version:"1"}`; never implies database/network health.
- `GET /ready`: generic 503 `NOT_READY`. Explicit required confirmations, verifier and implemented operations are prerequisites; the implementation gate is fixed false, so even fully populated test configuration cannot make this scaffold ready. No dependency addresses or reasons are exposed. Probe transport/auth/access are still owner decisions; no public listener is created.
- Protected proposed `/v1` routes fail 503 when configuration/verifier is absent. Static bearer tokens are rejected; there is no `RADIUS_API_TOKEN` fallback. An injected verifier interface is **not** implemented JWT authentication: signature/key/issuer/algorithm/time/replay/delegation/request-binding verification still needs owner approval and implementation.
- With synthetic verified identity, strict method/path/query/body/header validation and role/scope intersection are tested, but every subscriber, plan, session, accounting and NAS operation still returns non-success 503 `OPERATION_DISABLED`, `outcome:not_applied`, no `data`. Same-key repeat requests cannot mutate. No durable idempotency, audit or recovery implementation is claimed.
- Closed inputs: 16 KiB body, UUID correlation/idempotency, fixed operations, bounded pagination/ranges/strings, no arbitrary table/SQL/RADIUS attributes/RouterOS commands. Output projection strips extra fields, validates real IP/UTC calendar values and safe integer counters. Reset credential projection is a proposed schema only, never reachable service success.
- Logs contain only fixed event/status/code. Never log raw request/response, query, token, credential, config, identity or exceptions. This diagnostic callback is **not a durable audit store**.
- `repositories.ts` contains interfaces only for the verified safe table names and nullable/non-unique `userinfo.username`. No inferred columns, subscriber identity mapping, NAS status interpretation or plan joins. No repository calls are made, and there is **no userbillinfo interface or access** and no RADIUS write interface.

## User-verified live facts (not independently probed here)

- API DNS resolves to the RADIUS instance; this alone does not establish an API service, TLS or reachability.
- Current Docker Compose contains only `radius-mysql`, `radius`, `radius-web`; no provisioning API container was reported.
- All inspected tables have zero rows: `radcheck`, `userinfo`, `userbillinfo`, `billing_plans`, `billing_plans_profiles`, `radusergroup`, `radacct`.
- Every inspected table was reported with `Engine=InnoDB` in `SHOW TABLE STATUS`, so transactional engine support is available at the storage layer. The reported database server version is deliberately not recorded here.
- `userinfo.username` has a nullable, non-unique index. It cannot be treated as a guaranteed unique subscriber identity.
- `userbillinfo` has legacy credit-card fields: **never select, log or expose any of this table**.
- Security group allows TCP 22 from all IPv4 sources and UDP 1812/1813 from a candidate single-source /32 only; TCP 80/443/3306 are not allowed. Candidate source identity is unconfirmed. No addresses, group IDs or other sensitive infrastructure identifiers are recorded here, and no rules were changed.

## Exact blockers before another enabling stage

Owner confirmation and evidence are required for RADIUS authentication/password representation and disable semantics; atomic multi-table operation with audit and idempotency guarantees (inspected tables are reported as InnoDB, so the storage layer supports transactions, but cross-table atomicity plus durable audit/idempotency behavior is unverified); plan-to-group mappings; API identity issuer, allowed algorithm and key source; least-privilege DB grants; TLS termination; durable idempotency/audit schema and recovery policy. Stable API IDs, subscriber uniqueness/NULL handling, NAS registry/status/freshness, accounting freshness/counter semantics, actual route/version contract and staging acceptance also remain unconfirmed under the parent contract.

No schema migrations, production users/grants, ports, DNS/security-group changes or live calls are included. The existing Hub RADIUS client/page remain locked and unchanged. The legacy deployed Hub function's previously documented direct-call safety gaps remain unresolved; this scaffold does not remediate a deployed service.