# RADIUS contract review verification — 2026-10-26

**PROPOSED / UNCONFIRMED. Local checks only. No deployment, publication, external endpoint probing or production writes.**

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