# Weonet RADIUS Provisioning API

Separately deployable Node 22 service. **Not deployed. Never run against the live database from this repo.**
Contract: `openapi.yaml`. Hub adapter (staged, not auto-deployed): `../index.ts`, `../signer.ts`.

## What it does
- Routes: `GET /health`, `GET /ready`, `GET /v1/subscribers[/:id]`, `POST /v1/subscribers`, `PATCH /v1/subscribers/:id/status`, `PATCH /v1/subscribers/:id/plan`, `POST /v1/subscribers/:id/reset-password`, `GET /v1/plans`, `/v1/sessions`, `/v1/accounting`, `/v1/nas[/:id]`.
- Auth: ES256/RS256 JWT verified with node:crypto against a configured public key, issuer, audience, subject; lifetime ≤300s; single-use `jti` stored durably; bound to method, path+query, SHA-256 of body, `X-Request-ID`, `Idempotency-Key`; actor = `act.sub` from the Hub (Supabase-verified user). Static bearer tokens are rejected. Writes need `radius:write` + admin/noc; reads need admin/noc/care.
- Identity: API-owned `weonet_api.subscriber` (UUID). daloRADIUS `userinfo` is not used; `userbillinfo` is never touched (no grant).
- Semantics (configured, checked at startup):
  - Password: `RADIUS_PASSWORD_ATTRIBUTE` = `Cleartext-Password` (needed for PPPoE CHAP/MS-CHAP) or `SSHA2-512-Password` (PAP only). Written to `radcheck` with `:=`.
  - Suspend: add `radusergroup(username, RADIUS_DISABLED_GROUP, priority 0)`; reactivate removes it. Writes are refused unless `radgroupcheck` has `Auth-Type := Reject` for that group (daloRADIUS default group name: `daloRADIUS-Disabled-Users`).
  - Plan: `weonet_api.plan.groupname` → `radusergroup` priority 1; every enabled plan must map to an existing group. Plans with `expiry_days > 0` are refused (expiry enforcement not implemented).
  - NAS status is always `unknown` (not derivable); NAS secret is blocked by a column grant.
- Each mutation: intent audit row → one InnoDB transaction (idempotency row + RADIUS rows + applied audit) → commit. Same key + same request replays the stored response; different request → 409. Reset-password responses are never stored or replayed. Commit uncertainty → 500 `outcome: unknown`.
- Writes stay off unless `RADIUS_WRITES_ENABLED=true` **and** the schema/grant check passes (rejects ALL PRIVILEGES, SUPER, GRANT OPTION, global grants).
- `/ready` is ready for configured read-only use while writes are off; when writes are explicitly enabled it returns 503 unless the write schema also passes. Schema details are not returned. Failed replay/rejection/completion audits are surfaced, never silently accepted; commit uncertainty remains `outcome: unknown` even if the recovery audit fails.

## Local verification
```sh
cd review/radius-api/service && npm ci
npm test                                         # unit + Hub adapter e2e; MariaDB tests skip without socket
npm run typecheck                                # standalone service only; not a Hub build
# Optional: throwaway MariaDB integration (never a live server)
RADIUS_IT_SOCKET=/path/to/throwaway.sock npx vitest run --config vitest.config.ts
```

## Deployment (owner actions, in order)
1. Back up the RADIUS database. Confirm FreeRADIUS `sql` module reads groups from `radusergroup` and the PPP auth method (CHAP/MS-CHAP → Cleartext-Password).
2. As DB admin: run `sql/001_state_schema.sql`; then `sql/002_grants.template.sql` with the API container's subnet pattern and an interactively chosen password. Insert plan rows mapping to existing groups; ensure the disabled group has `Auth-Type := Reject`.
3. Generate an ES256 key pair off-host: `openssl ecparam -name prime256v1 -genkey -noout | openssl pkcs8 -topk8 -nocrypt -out hub.key && openssl ec -in hub.key -pubout -out radius_api_hub_public_key.pem`. Public key → `secrets/` on the host; private key → Hub secret `RADIUS_API_SIGNING_KEY` only. Delete local copies.
4. Copy this folder to `./radius-api` beside the existing compose file, plus `deploy/docker-compose.radius-api.yml` and `deploy/Caddyfile.radius-api`; set `.env.radius-api` values including `RADIUS_API_HOSTNAME` (confirmed DNS name, no URL prefix) and `RADIUS_DB_NETWORK` (existing private network name). Other required names are in the overlay and `src/config.ts`. Secret values go in the mounted secret files, not environment examples. Existing services are not modified. The Docker context excludes secrets, keys, local dependencies and tests.
5. TLS: point the API hostname at the host; Caddy obtains a certificate via ACME (needs TCP 80/443 opened by the owner — consider restricting 443 to the Hub's egress if stable). Alternatively mount an existing certificate with `tls /path/cert /path/key`.
6. First validate privately with `docker compose --env-file .env.radius-api -f docker-compose.yml -f docker-compose.radius-api.yml config --quiet` (do not print resolved configuration). Then, only with owner deployment approval, `docker compose --env-file .env.radius-api -f docker-compose.yml -f docker-compose.radius-api.yml up -d --build radius-api caddy`. Check generic readiness and safe schema-check logs. Keep production writes off. Create/suspend/reset acceptance needs a separately authorized staging configuration with writes enabled, a staging subscriber and NAS; read-only configuration cannot perform that test.
7. Only after reviewed staging acceptance and explicit deployment approval: provision the Hub signing/configuration secrets and deploy the staged adapter files individually (`index.ts`, `lib.ts`, `contract.ts`, `signer.ts`), not a wildcard directory copy. Verify its server-side role/audit behavior before separately unlocking `src/lib/radius/client.ts`. No existing deployed function is fixed by this review-only package.

## User-verified facts (not probed here)
Inspected tables were reported as InnoDB, so transactional engine support is available at the storage layer; the previously inspected tables were reported empty. `userinfo.username` is nullable/non-unique; `userbillinfo` has legacy card fields (never accessed). No infrastructure identifiers or exact database version are recorded. Local fixture checks do not confirm deployed schema/grants, FreeRADIUS group evaluation/auth method, plan enforcement, or real atomic audit/idempotency/recovery behavior. Those remain production blockers.
