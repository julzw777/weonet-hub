# RADIUS contract review verification — 2026-10-26

**PROPOSED / UNCONFIRMED. Local checks only. No deployment, publication, external endpoint probing or production writes.**

## 2026-10-27 — standalone offline service increment

New package under `review/radius-api/service/`: `config.ts`, `schemas.ts`, `repositories.ts`, `handler.ts`, `handler.test.ts`, `vitest.config.ts`, `package.json`, `README.md`. Architecture/tracking updates: `AGENTS.md`, `roadmap.md`. No changes to the existing Hub client/page or any file under `supabase/functions`; no migrations or DB grants.

The injected Request/Response handler has generic `/health` liveness and permanently non-ready `/ready`; closed proposed route schemas, byte limits, role/scope tests and safe response projection. Repository **interfaces only** model verified safe table names and nullable/non-unique usernames; no `userbillinfo`, SQL, driver, writes or repository calls. There is no listener, environment discovery or production JWT verifier. Every protected operation is non-success even with synthetic configuration/identity. Durable idempotency/audit/recovery and operational semantics remain blockers, not implemented features.

### Exact new local commands and results

```sh
npm test -- --config vitest.config.ts --root review/radius-api/service
```

```text
Test Files  1 passed (1)
     Tests  60 passed (60)
SERVICE_TEST_EXIT=0
```

```sh
tsgo --ignoreConfig --noEmit --strict --target ES2022 --module ESNext --moduleResolution bundler --lib ES2022,DOM,DOM.Iterable --types node --skipLibCheck review/radius-api/service/config.ts review/radius-api/service/schemas.ts review/radius-api/service/repositories.ts review/radius-api/service/handler.ts review/radius-api/service/handler.test.ts review/radius-api/service/vitest.config.ts
```

No diagnostics, exit **0**. No tool/package downloads. Initial service test invocation supplied the config path twice relative to `--root` and exited 1 before collecting tests; the corrected command above passed. Initial scoped type check found the Zod refinement/min chaining and two optional mock accesses; fixed, then exit 0.

### Existing Hub boundary and staged-adapter regression checks (separate suite)

```sh
npm test -- src/lib/radius/client.test.ts review/radius-api/contract.test.ts
```

```text
Test Files  2 passed (2)
     Tests  21 passed (21)
HUB_REGRESSION_EXIT=0
```

These are 2 existing Hub-lock tests plus 19 existing staged-adapter tests, **not** part of the 60 new scaffold tests. The historical 104-test full-suite result below was not rerun or represented as a current full-suite run. Constructed requests and injected identities only; no live auth/API/DB/NAS traffic. No browser/API acceptance testing was performed because Hub calls must remain locked.

SHA-256 comparison against pre-edit hashes: `src/lib/radius/client.ts`, `src/pages/Radius.tsx`, `supabase/functions/radius-api/index.ts` all **OK**. No manual app build/type check was run since application files were unchanged; harness build log observed **build OK**, latest observed entry `2026-10-27T15:21:01Z`. This does not establish a deployed or running provisioning API.

**Nothing deployed, published, opened, migrated or tested against live API/NAS/DB.** User-supplied live facts are recorded without infrastructure identifiers in the service README and were not independently verified. Owner must still confirm password/auth and disable semantics, atomic multi-table operation with audit and idempotency behavior, plan mappings, issuer/algorithm/key source, grants, TLS termination, idempotency/audit/recovery schema/policy and staging acceptance. Existing deployed Hub-function direct-call risks remain unresolved; no security scan or new warning count is claimed.

**Documentation correction (2026-10-27):** user-supplied `SHOW TABLE STATUS` output reported every inspected table with `Engine=InnoDB`, so transactional engine support is available at the storage layer; the reported database server version is deliberately not recorded in this project. This is a storage-layer fact only: atomic multi-table operation, audit and idempotency behavior remain unverified implementation blockers, and every subscriber, plan, session, accounting and NAS write gate remains closed. No code, test, deployment, database or infrastructure change accompanied this correction.

## Historical Hub review checks — 2026-10-26

## Changed files/features

- `RADIUS-PROVISIONING-API.md`: proposed routes, field schemas, identity/network/database boundaries, idempotency/recovery and field-by-field owner checklist.
- `review/radius-api/{index.ts,lib.ts,contract.ts,contract.test.ts}`: locked staged server replacement, fixtures with no write success, validation/allowlists, idempotency header and audited error/unknown-outcome handling. This directory does not deploy automatically.
- `src/lib/radius/{client.ts,client.test.ts}`: block all Hub calls before invocation while unconfirmed; verify no sample data/writes reach server.
- `src/pages/Radius.tsx`: unconfirmed status and inaccessible write controls.
- `vitest.config.ts`: include review tests. `AGENTS.md`, `roadmap.md`, `NETWORK-ROUTER-CONTROL.md`: architecture, tracking and correction of earlier route assumptions.

## Exact verification commands and observed outputs

`npm test`:

```text
Test Files  13 passed (13)
     Tests  104 passed (104)
```

Includes 19 staged adapter tests and 2 Hub boundary tests, in addition to 83 existing tests. Requests are injected simulated responses only; no fetch of an external service occurs. Hub end-to-end call boundary is exercised with a real create operation and mocked invocation; it rejects before sending. Authenticated browser/API integration and staging NAS acceptance remain unverified and gated.

`tsgo -p tsconfig.app.json --noEmit`: no diagnostics, exit **0**.

`tsgo --ignoreConfig --noEmit --target ES2022 --module ESNext --moduleResolution bundler --allowImportingTsExtensions --lib ES2022,DOM --skipLibCheck review/radius-api/contract.ts review/radius-api/lib.ts review/radius-api/contract.test.ts`: no diagnostics, exit **0**.

The first draft-only command lacked `--ignoreConfig` and failed TS5112. The corrected command exposed a union callback type and a missing fixture fallback; both were fixed and the command passed. Staged Deno entrypoint runtime/import checking is **not performed**; no SDK downloads or live function tests were used.

Build: Lovable's automatic harness log `/tmp/observability/build-errors.log` reports **`build OK`** after app edits (observed entry `2026-10-26T17:52:48Z`). No manual `npm run build` was run: project instructions reserve builds to the harness. This is an automatic build result, not a deployment or API acceptance result.

## Security / release boundaries

- No migrations, table grants or RLS changes; shared audit schema retained. No secrets/endpoints or firewall rules changed. No live status claims.
- **Critical remaining server risk:** existing deployed `supabase/functions/radius-api` remains unchanged because edits automatically deploy. Direct callers may still reach its old sample-write and permissive reset/audit handling. Only a reviewed, authorized server deployment can remove that risk. Hub locking is not a server security boundary; do not treat the server fix as live.
- Staged server fails closed even if a base URL exists. JWT issuer/signing/key configuration and the owner-confirmed contract are not implemented/approved. Static legacy API token is insufficient. Additional draft routes, complete Hub pagination/filter handling, signed staff delegation, reconciliation lookup and reset credential UI cache lifecycle require follow-up before unlocking.
- Production writes require owner-verified FreeRADIUS schema/auth/password representation, least-privilege grants, durable transactions/idempotency/audit/recovery and staging acceptance.
- Existing project findings (leaked-password protection, rate limiting and other previously reported DB warnings) were not rescanned or resolved in this documentation/local-code slice. No new security scan result or warning count is claimed.