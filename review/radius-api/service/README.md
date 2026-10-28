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

## Local verification
```sh
cd review/radius-api/service && npm ci
npx tsc -p tsconfig.json --noEmit
npx vitest run --config vitest.config.ts            # unit + Hub adapter e2e
# Optional: throwaway MariaDB integration (never a live server)
RADIUS_IT_SOCKET=/path/to/throwaway.sock npx vitest run --config vitest.config.ts
```

## Deployment (owner actions, in order)
1. Back up the RADIUS database. Confirm FreeRADIUS `sql` module reads groups from `radusergroup` and the PPP auth method (CHAP/MS-CHAP → Cleartext-Password).
2. As DB admin: run `sql/001_state_schema.sql`; then `sql/002_grants.template.sql` with the API container's subnet pattern and an interactively chosen password. Insert plan rows mapping to existing groups; ensure the disabled group has `Auth-Type := Reject`.
3. Generate an ES256 key pair off-host: `openssl ecparam -name prime256v1 -genkey -noout | openssl pkcs8 -topk8 -nocrypt -out hub.key && openssl ec -in hub.key -pubout -out radius_api_hub_public_key.pem`. Public key → `secrets/` on the host; private key → Hub secret `RADIUS_API_SIGNING_KEY` only. Delete local copies.
4. Copy this folder to `./radius-api` beside the existing compose file, plus `deploy/docker-compose.radius-api.yml` and `deploy/Caddyfile.radius-api`; set `.env.radius-api` values and the external DB network name. Existing services are not modified.
5. TLS: point the API hostname at the host; Caddy obtains a certificate via ACME (needs TCP 80/443 opened by the owner — consider restricting 443 to the Hub's egress if stable). Alternatively mount an existing certificate with `tls /path/cert /path/key`.
6. `docker compose -f docker-compose.yml -f docker-compose.radius-api.yml up -d --build radius-api caddy`; check logs for `schema_check` reads/writes true. Keep `RADIUS_WRITES_ENABLED=false` until a staging subscriber passes create/suspend/reset with `radtest` and a real NAS.
7. Hub: set secrets `RADIUS_API_BASE_URL`, `RADIUS_API_SIGNING_KEY`, `RADIUS_API_ISSUER`, `RADIUS_API_AUDIENCE`, `RADIUS_API_SERVICE_SUBJECT`, `RADIUS_API_ENABLED=true`; then copy `review/radius-api/*` into `supabase/functions/radius-api` and unlock `src/lib/radius/client.ts`.

## User-verified facts (not probed here)
Tables reported InnoDB, zero rows; `userinfo.username` nullable/non-unique; `userbillinfo` has legacy card fields (never accessed). No infrastructure identifiers are recorded.
