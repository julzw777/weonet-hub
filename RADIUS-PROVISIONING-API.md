# Weonet Hub → RADIUS Provisioning API

**PROPOSED / UNCONFIRMED — draft 0.1, 2026-10-26. Not deployed.**

No provisioning service implementation, owner-approved external documentation, hostname, authentication scheme, or live endpoint has been established by this repository. All routes below, including existing `/v1/...` assumptions, require the service owner's approval. No EC2 address was called/probed. This document is a review artifact, not permission to provision subscribers, open firewalls or expose a database.

## 1. Scope and current safety state

- Hub: existing React/Vite/TypeScript, Supabase Auth/Postgres/Edge Functions. Provisioning API: **separate service**, implementation/runtime/source repository unknown.
- Draft routes preserve the Hub's current names where reasonable; additional routes are documentation only. No Hub integration for plan changes or pagination is claimed complete.
- `review/radius-api/` stages the replacement Edge Function outside `supabase/functions/` because changing that directory automatically deploys on Lovable. It is **not active**. It contains fail-closed configuration, request/response allowlists, bounded responses, idempotency forwarding and checked audit writes.
- Hub client is locked and sends **no RADIUS requests**, including reads. Write controls are hidden. Existing deployed `radius-api` may still accept sample writes/direct callers: **server safety fix remains pending reviewed deployment**. Browser locking is not authorization or a server-side fix.
- Production sample mode is prohibited. Read fixtures stay solely in the review library/tests and are never imported into its server entrypoint. All sample writes return 503 without `data` or credentials.
- The staged entrypoint also remains locked: it cannot call the service until owner-approved signed service identity is implemented. `RADIUS_API_BASE_URL` and legacy `RADIUS_API_TOKEN` are server-only names, not evidence of a valid contract. Static bearer token forwarding is not the approved production design.

## 2. Network and identity boundaries

| Path | Proposed transport | Purpose |
|---|---|---|
| Hub Edge Function → provisioning API | HTTPS TCP **443**, valid trusted certificate | Provision/read records, authenticated service requests |
| MikroTik/NAS → FreeRADIUS | UDP **1812** authentication; UDP **1813** accounting | PPP access and accounting; separate firewall and NAS shared-secret trust |
| Provisioning API → local/private MariaDB | Owner-approved private DB transport, TLS where remote | Least-privilege data access; never public Hub access |

`160.20.112.245/32` is **only an unverified candidate NAS source IP**. Confirm actual public NAT/egress and packet origin before any allow-list entry; it is not a confirmed Hub egress IP. Do not broaden any rules. Supabase Edge Function egress stability is unconfirmed; source-IP allow-listing may only supplement identity when a stable egress arrangement is demonstrated. No public MariaDB, root credentials, Winbox or arbitrary RouterOS access is required.

**Proposed service authentication**

- TLS certificate/hostname validation mandatory; no insecure/self-signed bypass. Optional mTLS with independently rotated client cert, service identity binding and revocation procedures.
- Hub backend obtains/signs a short-lived asymmetric JWT (maximum proposed lifetime 300 seconds) from an approved issuer/token exchange. API validates pinned issuer, exact API audience, algorithm allowlist (proposed ES256 or RS256; owner chooses), key ID/JWKS, `iat`, `nbf`, `exp`, service `sub`, `jti`, scopes and replay protection. A Supabase user token alone is not the API's service credential. No indefinite `RADIUS_API_TOKEN` production shortcut.
- Proposed scopes: `radius:read` for Admin/NOC/Care; `radius:write` for Admin/NOC. API independently enforces scope/role intersection. Health/readiness permission decided by owner; readiness must not expose dependency details.
- **Verified staff actor**: Hub validates Supabase token using Auth, fetches current `user_roles` server-side, then binds verified staff UUID/current roles to an issuer-signed delegation assertion or the service JWT. Proposed claims: `actor.sub`, `actor.roles`, service `sub`, `aud`, `jti`, `request_id`, `idempotency_key`, `request_hash` (SHA-256 of canonical method/path/body). API trusts these only under the approved Hub signing identity, checks binding against the actual request and logs service + actor. Body `actor`, arbitrary `X-Actor-*`, browser roles, email and client-supplied UUIDs are never authoritative. API audit must use verified claims, not a JSON actor field.
- Signing private keys, client certificates, API tokens, NAS secrets and database credentials are server-only secrets; rotation/revocation and JWKS overlap need approval. Never put any into browser code, logs, URLs or generic responses. The one-time reset credential is the single explicitly approved response exception, scoped to a verified authorized operator; see section 5.

## 3. Common HTTP contract (proposed)

Base URL: **TBD by owner**, HTTPS origin on 443 with an optional confirmed path prefix. No production `servers` URL is invented. Version `/v1` is proposed; response `X-API-Version: 1` and incompatible-version rejection are owner acceptance items.

Headers: `Authorization: Bearer <short-lived signed service token>`, `Accept: application/json`, `Content-Type: application/json` on body requests; `X-Request-ID: <UUID>` required/echoed in response and errors. Hub generates correlation IDs; forwarded IDs are syntax-checked, never identity. `Idempotency-Key: <UUID>` required for **every mutation**; GET must not mutate. TLS/auth failure must never fall back to sample data.

- UTF-8 JSON, closed request schemas (`additionalProperties: false`), no unknown query fields, content type/size checks. Proposed maximum request 16 KiB, response 256 KiB, page limit 100. Malformed JSON/type/path/extra field ⇒ 400. No free SQL, table names, RADIUS attributes, RouterOS commands or free-form destinations.
- IDs: opaque stable strings matching `^[A-Za-z0-9_-]{1,64}$`; not usernames, not row numbers liable to reuse. API owns ID mapping and never recycles IDs. Hub service IDs and provisioning IDs are distinct; mapping design needs confirmation.
- Username: `^[a-z0-9._@-]{3,64}$`, unique; no silent case conversion by API. Full name: trimmed 1–120 characters. Plan ID must exist/active. Credential write input: 8–64 characters, no control characters; final policy/auth representation must be approved before writes.
- All timestamps RFC3339 **UTC `Z`**, milliseconds optional, e.g. `2026-10-26T17:47:00Z`. No local timezone strings. Display conversion belongs to Hub. Dates/ranges use UTC; ranges `[from,to)` (inclusive from/exclusive to). Integer byte counters/durations nonnegative, ≤ `9007199254740991` for Hub number safety; larger counters require an approved decimal-string revision rather than lossy coercion.
- List query: `limit` integer 1–100 (default 50), opaque `cursor` ≤512 chars, `search` ≤64 characters where supported. Stable keyset ordering `(created_at,id)` for subscribers, `(started_at,id)` for sessions/accounting, `(id)` for plans/NAS, ascending unless an endpoint below specifies descending. Cursor binds filters/order; no arbitrary SQL sort expression. A cursor is not a credential. Do not silently truncate to the first page in production Hub; its current UI pagination must be implemented before unlocking.
- List success: `{ "data": [<resource>], "page": { "limit": 50, "next_cursor": null } }`. Single success: `{ "data": <resource> }`. No unfiltered upstream passthrough. The Hub wrapper may add `mock:false` and `request_id`; those are not upstream business fields.
- Error: `{ "error": { "code": "PLAN_NOT_FOUND", "message": "Plan not found", "request_id": "<UUID>", "retryable": false, "outcome": "not_applied" } }`. Error messages allowlisted/redacted, no SQL, connection strings, stack traces, usernames/passwords, bearer tokens or raw upstream body. Optional field violations: `fields:[{field,code}]`, never values. Outcomes: `not_applied`, `applied`, `unknown`; callers must not infer rollback solely from a 5xx.
- Status codes: 200 reads/status/plan change/reset, 201 create, 400 syntax/validation, 401 identity invalid/expired, 403 insufficient scope/actor role, 404 resource absent, 409 duplicate username/idempotency body conflict/concurrency conflict, 422 nonexistent/inactive plan or unsupported auth representation, 429 throttled with `Retry-After`, 500 audited internal failure, 503 unconfigured/not ready/audit unavailable, 502/504 Hub upstream invalid/unreachable/timeout. Auth/readiness errors contain no dependency secrets. Use `Cache-Control: no-store` on credentials and Hub responses.

## 4. Proposed resources and routes

All fields below are required unless marked optional or nullable; outputs omit all other attributes. IDs/strings/timestamps obey section 3. Fields such as speed profile and online status remain semantic proposals pending owner definition; no tariff or network settings are invented.

### Subscriber

```json
{"id":"sub-001","username":"staging.user","full_name":"Staging Subscriber","plan_id":"plan-basic","status":"active","created_at":"2026-10-26T17:47:00Z","expires_at":null}
```

`status`: `active|suspended`; `expires_at`: UTC timestamp or null. Meaning of expiry, initial active state and whether suspension affects **new authentication only** must be confirmed. Suspension/reactivation **does not disconnect an existing session**, send CoA, change router state or alter billing; those are out of scope and require separately approved policy.

| Method / route (all unconfirmed) | Input/query | Response |
|---|---|---|
| GET `/health` | No body; proposed service auth | `data:{status:"ok",version:"1"}`; process liveness only |
| GET `/ready` | No body; proposed service auth | `data:{status:"ready",version:"1"}` or 503 error; checks required dependencies without names/addresses |
| GET `/v1/subscribers` | Common pagination; optional search (username/name), status, plan_id | Subscriber page |
| GET `/v1/subscribers/{id}` | Stable subscriber ID | Subscriber |
| POST `/v1/subscribers` | `{username,full_name,plan_id,password}` only | 201 Subscriber; never echo initial password |
| PATCH `/v1/subscribers/{id}/status` | `{status:"suspended"}` or `{status:"active"}` only | Subscriber reflecting requested status |
| PATCH `/v1/subscribers/{id}/plan` | `{plan_id:"<existing ID>"}` only | Subscriber reflecting plan assignment; does not change active-session settings |
| POST `/v1/subscribers/{id}/reset-password` | No body | Whitelisted credential response described below |
| GET `/v1/plans` | Pagination; optional search | Plan page (read-only in this draft) |
| GET `/v1/sessions` | Pagination; optional username, nas_id, from/to; newest started first | Active Session page; no kick/disconnect endpoint |
| GET `/v1/accounting` | Pagination; optional username, nas_id, from/to, `state:open|closed`; newest started first | Accounting page, read-only |
| GET `/v1/nas` | Pagination; optional search, `status:online|offline` | NAS page (read-only in this draft) |
| GET `/v1/nas/{id}` | Stable NAS ID | NAS; source IP/status registry inspection only |

Plan: `{id:string,name:string,speed_profile:string,session_limit:integer,expiry_days:integer}`. Name 1–120; speed profile 1–64, an owner-approved identifier/value, never a browser-supplied RADIUS attribute. Session limit proposed 1–100; expiry days 0–3650, with `0` meaning **TBD, not assumed unlimited**. Read-only here; approved plan/profile mapping required before assigning. No prices/taxes, cadence, grace or billing suspension rules.

Session: `{id,username,nas_name,framed_ip,started_at,input_octets,output_octets}`. IP must be valid IPv4/IPv6; counters are RADIUS input/output octets **direction relative to NAS per owner confirmation**, not presumed download/upload. “Active” may mean `radacct.AcctStopTime IS NULL`, which can be stale; define freshness/timeout before claiming real-time online state.

Accounting: `{id,username,nas_name,started_at,stopped_at:timestamp|null,duration_s:integer,input_octets:integer,output_octets:integer,terminate_cause:string|null}`. Duration/counters nonnegative safe integers, terminate cause ≤120 chars. Owner confirms stale/NULL and wraparound handling. No corrections or deletions exposed through Hub.

NAS: `{id,name,source_ip,status:"online"|"offline"}`. Name ≤120, valid IPv4/IPv6. Status must have a defined measured source/freshness; not assumed from presence in registry. Owner may need an `unknown`/`last_observed_at` revision; draft adapter must be changed accordingly before activation. **Never include shared secret**, password, token, connection URI or arbitrary NAS columns. Creating/updating NAS and shared-secret rotation are outside this read-only contract.

## 5. Credential reset contract

Proposed response only: `{ "data": { "temporary_password": "<8–64 chars, no control characters>" } }` with `Cache-Control: no-store`. This is the **only allowed credential disclosure**, returned only over TLS to authenticated Admin/NOC and shown transiently to that operator. No old password, hashes, NAS secrets, signing tokens, raw RADIUS rows, debug metadata or arbitrary `data` fields. All ordinary responses exclude credentials. If the owner rejects one-time password disclosure, revise to an out-of-band enrollment/reference response and change Hub before enabling; do not invent delivery rules.

API must audit reset without logging request/response credential. Generation must be cryptographically secure and compatible with confirmed PPP authentication/storage representation. No conversion to an assumed hash: CHAP/MSCHAP/PAP support imposes different requirements. Credential replay/idempotency needs secure encrypted short-lived result storage with approved TTL (TBD), or explicit `RESULT_EXPIRED` conflict after expiry, **never a second reset for the same key**. Hub must not auto-retry/reset or persist passwords in TanStack mutation caches longer than display lifecycle; UI cache clearing is a preactivation item.

## 6. API implementation and database boundary

Only the separate provisioning API owns MariaDB credentials. Use a dedicated principal with table/operation grants limited to the confirmed mapping of `radcheck`, `radreply`, `radusergroup`, `radgroupcheck`, `radgroupreply`; **`radacct` SELECT only**. Plan group tables should be SELECT-only unless owner explicitly approves a plan-management scope; no plan writes in this contract. Exact column-level/table grants and credential representation must be reviewed against actual schema. No root, GRANT OPTION, DDL, schema changes from Hub, direct browser/Hub MariaDB connection, arbitrary SQL or generic RADIUS attribute editors.

NAS metadata may require a separate `nas` registry/operational source; current allowed tables do not establish it. Owner confirms read-only source/grant, status measurement, ID mapping and no shared-secret projection. Subscriber display names/stable IDs/audit/idempotency need an approved service-owned metadata store or explicit mapping, not silently invented daloRADIUS columns. Any API-owned schema additions require the owner's reviewed migration outside the Hub and backup/rollback plan; Hub does not apply them.

Before writes confirm actual FreeRADIUS/daloRADIUS/MariaDB versions, storage engines, installed schema/columns/indexes/collations, PPP auth method (PAP/CHAP/MSCHAPv2/etc), accepted password attribute/operator/format, plan→group mapping and suspend/reactivate strategy. No writes until this is confirmed in staging. Avoid changing shared groups as a side effect of assigning one subscriber.

**Transaction, idempotency and audit requirements**

1. API validates service/actor, schema, key and target. Idempotency key is scoped to service identity + API version + operation/target; store canonical body digest. Same key/digest replays recorded result; different body or target yields 409. Concurrent identical calls execute once via unique-key/locking and in-progress state, never check-then-insert races. Owner confirms durable retention horizon (TBD); no writes enabled without it.
2. API locks target rows/mappings and atomically changes all required RADIUS rows + service outcome audit + idempotency result in the same transaction. Unique username conflicts rolled back. If stores/engines cannot participate atomically, require an approved durable outbox/recovery protocol, not a best-effort post-write log. Audit failure prevents commit and returns not-applied failure. Audit includes verified service/actor, request ID, key (or hash), safe target, operation, UTC time and outcome; no credential material. State/audit must not be deleted to retry.
3. Hub and external API are not a distributed transaction. Staged Hub records `requested` **before sending**. Hub audit failure at this point blocks the request. After upstream response it records `succeeded|failed|unknown`; every insert is checked. Unconfigured mutation attempts record `unconfigured` or return explicit audit-unavailable error.
4. If API reports success but Hub completion audit fails, return **503 `AUDIT_RECONCILIATION_REQUIRED`**, `outcome:upstream_succeeded_hub_audit_failed`, correlation ID, **no data/credentials and no success toast**. Do not falsely claim rollback. The prior request audit remains; operator reconciles with API's durable outcome/audit using the same key. Hub must not retry with a new key or trigger an automatic compensation/reset. Timeout, malformed success, broken response or network failure yields `unknown` outcome; inspect API idempotency/audit before retrying. Upstream non-2xx raw text never reaches Hub.
5. A recovery/outcome lookup capability (proposed GET `/v1/operations/{idempotency_key}` scoped to service/actor, returning operation/target/outcome/request ID **without credentials**) is required before production writes. This extra route is not implemented in Hub and remains subject to confirmation. Retried writes must use the original key; reset result expiry must not cause another reset.

## 7. Review code and exact verification

- Changed Hub client/page: all RADIUS network requests locked pending approval, no sample-write toasts reachable; no production endpoints or secrets changed.
- Staged replacement: `review/radius-api/index.ts`, `lib.ts`, `contract.ts`; local tests under `review/radius-api/contract.test.ts`. Legacy function under `supabase/functions/radius-api/` intentionally **unchanged**, avoiding automatic deployment. No DB migrations, new RLS, firewall changes, publication or external calls.
- Draft request validation retains existing implemented operations. Additional contract routes and query pagination/filter plumbing remain owner-approved follow-up work. Live server auth issuance, durable cross-service reconciliation and credential UI retention remain gated, not fabricated.
- Local validation is simulated/injected only. Exact test and available automatic verification results are recorded in `RADIUS-CONTRACT-VERIFICATION.md`; these are **not live API/NAS acceptance results**.

## 8. API service owner confirmation checklist

Fill **Confirmed value / evidence / owner / date** for every row; blank is unconfirmed. Do not paste private keys/passwords into the Hub repository or chat; supply secret **references** through approved secret storage.

| Field requiring confirmation | Draft / required evidence | Confirmed value / evidence / owner / date |
|---|---|---|
| Deployed API hostname/base prefix/TLS port | TBD; trusted HTTPS on 443, staging and production distinguished | Unconfirmed |
| API version and deployed revision | `/v1` proposal; build/revision and version-negotiation behavior | Unconfirmed |
| Source repository and runtime | Separate implementation location, language/runtime, service owner/on-call | Unconfirmed |
| Exact health/readiness routes | Method, auth, status codes, dependency checks and safe payloads | Unconfirmed |
| Subscriber routes and schemas | List/get/create/status/plan/reset paths, closed inputs/outputs, constraints | Unconfirmed |
| Plans/sessions/accounting/NAS routes | Pagination/filter/cursor, status freshness, direction of octets, source registry | Unconfirmed |
| IDs/timestamps/errors/limits | Stable ID mapping, UTC, error envelope, bounds and compatibility | Unconfirmed |
| Service auth/scopes/audience | Issuer/audience/TTL/algorithm, Hub staff assertion binding and verification | Unconfirmed |
| Signing keys and certificates | Public JWKS/key IDs, secret references, rotation/revocation, optional mTLS CA/client/server cert lifecycle | Unconfirmed |
| Hub egress IP stability | Measured stable NAT/egress evidence; only then narrow API allow-list | Unconfirmed |
| NAS source IPs | Actual public source per NAS/NAT; `160.20.112.245/32` candidate only; UDP 1812/1813 narrowly scoped | Unconfirmed |
| FreeRADIUS/daloRADIUS/MariaDB versions | Installed versions/builds and compatible schema export (no data/secrets) | Unconfirmed |
| Schema/engines/identity mappings | Actual columns/indexes/collations, transactional engines, service metadata/ID mapping | Unconfirmed |
| PPP auth method/password representation | PAP/CHAP/MSCHAPv2/etc; accepted attributes/operators/storage; secure reset and retention | Unconfirmed |
| Plan/suspension behavior | Group/profile mapping, expiry semantics, effect on new auth only; no implied live disconnect | Unconfirmed |
| Least-privilege grants | Reviewed rad* operations, radacct SELECT-only, NAS source access; no root/DDL/Hub SQL | Unconfirmed |
| Transaction/idempotency/audit | Durable unique keys/body conflicts, atomic audit/results, retention, outcome lookup and recovery | Unconfirmed |
| Backup/rollback/recovery | Pre-change backup evidence, restore drill, write rollback/outbox failure procedure | Unconfirmed |
| Staging NAS and subscriber | Owner-approved isolated NAS/service/account, no production changes or invented credentials | Unconfirmed |
| Acceptance test results | Signed service/actor denial, read scopes, duplicate/concurrent writes, invalid schemas, reset redaction, audit outage, timeout/recovery, TLS/firewall, RADIUS auth/accounting in staging | Not run; local tests only |
| Release authorization | Owner approves contract + server safety patch + secrets setup + deployment window; only then enable Hub | Not authorized |

**Drafted:** review contract, staged fail-closed adapter and local tests. **Owner must confirm:** every deployment/auth/schema/network/write behavior above. No endpoint is confirmed or live by this work.