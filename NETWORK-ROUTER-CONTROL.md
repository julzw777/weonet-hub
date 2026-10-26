# Router controls (MikroTik) — operator guide

## What exists
- **Registry** (`network_devices`): name, vendor (MikroTik only), model, type, connection reference, site, enabled flag, last health status/time/detail, RouterOS version. No address, username, password or token is stored in the database or sent to the browser.
- **Server-only adapter** (`supabase/functions/router-control`): the only path to routers. The browser never connects to a router.
- **Action log** (`router_actions`): every request records who asked, which device, dry-run/live, result state (`succeeded`, `failed`, `unconfigured`, `unavailable`, `rejected`), attempts, duration and a redacted detail. The audit log also records these entries and every registry change.

## Permissions
- View devices: Admin, NOC, Tech, ReadOnly (database policy).
- Register/edit devices, run checks, view action log: Admin and NOC. The database policies and the server function both check this.
- Health fields can only be written by the server function. A database trigger discards any value staff try to set themselves.

## Supported actions
| Action | State |
|---|---|
| `health_check` | Enabled. Read-only `GET /rest/system/resource`. 5 s timeout per attempt, up to 3 attempts with backoff; 4xx (e.g. bad login) is not retried. |
| `disconnect_subscriber` | Disabled. Needs PPPoE session ↔ subscription mapping (RADIUS stage) and an approved disconnect policy. |
| `apply_profile` | Disabled. Needs a mapping from each plan to a RouterOS PPP profile/queue, and approval for live changes. |

When enabled later, impactful actions must default to `dry_run: true` (already the request default), show a preview, and need explicit confirmation before a live run.

## Safety controls
- **Fixed destinations:** requests name a registered device ID, never a host. The address comes only from the server secret for that device's reference. It must be `https://host[:port]` with no path, query or embedded credentials.
- **Fixed commands:** only actions in the allow-list are accepted, and unknown fields are rejected. No free-form RouterOS paths or commands.
- **Repeat protection:** each request carries an idempotency key that is unique per user. A repeat returns the original result.
- **Redaction:** passwords, usernames, URLs and `Basic` auth headers are removed from stored details and logs.

## Provisioning a device (Weonet must supply)
1. In RouterOS **v7.1+**, enable `www-ssl` (REST API) with a valid certificate, then create a **read-only** API user (group `read`) for health checks.
2. Register the device in the app with a reference, e.g. `CORE_FREETOWN`.
3. Add these Supabase Edge Function secrets (dashboard → Settings → Functions):
   - `ROUTER_CORE_FREETOWN_URL` — e.g. `https://<router-management-address>:<port>`
   - `ROUTER_CORE_FREETOWN_USERNAME`
   - `ROUTER_CORE_FREETOWN_PASSWORD`
4. **Reachability:** Supabase Edge Functions run in the cloud, so the router's HTTPS management port must be reachable from the internet. Lock it down with a RouterOS firewall rule that only allows the needed sources. You can also use a VPN or tunnel endpoint. Routers on private addresses (10.x, 192.168.x) are not reachable without such a tunnel. Never expose Winbox/SSH/API port 8728 publicly.
5. Run "Health check". Until the secrets exist, the device shows **unconfigured** and lists the missing secret names.

## Bandwidth usage collection
- Customer bandwidth charts (Customers → Usage tab) read from the `usage_samples` table: one row per service per hour with download/upload byte counters. Staff can only read it; only the server's collection job can write, so figures cannot be typed in by hand.
- The collection job itself is **not built yet**. It will be a server-side scheduled task that reads interface counters from each registered router (using the same `ROUTER_<REF>_*` secrets and the router-control adapter, never the browser) and writes hourly rows.
- Weonet must supply: which router interface or PPPoE username maps to each service, and approval of the polling interval (hourly recommended). Until then the Usage tab shows an honest "no usage recorded" state — no simulated data.

## Known limitations
- No live router has been contacted during development; all router behaviour is covered by unit tests with simulated responses.
- Self-signed router certificates will fail TLS verification; use a trusted certificate.
- Rate limiting is per idempotency key only; there is no per-user request throttle yet.
- Signed-in end-to-end UI checks were not possible from the build environment.

## Tests
- `npm test` — includes `supabase/functions/router-control/lib.test.ts` (roles, allow-list, destination validation, timeouts/retries, redaction).
- `supabase/tests/network.sql` — rollback-only database checks (forged health rejected, bad references rejected, audit written, duplicate idempotency key rejected).

## RADIUS management (RADIUS menu)
**Contract correction (2026-10-26): PROPOSED / UNCONFIRMED.** The routes and legacy token/sample behavior below describe earlier assumptions, not verified endpoints. See `RADIUS-PROVISIONING-API.md` for the draft contract and owner checklist. Hub calls are now locked; the fail-closed server replacement is staged in `review/radius-api/` to avoid automatic deployment. The existing deployed function is unchanged and may still allow legacy sample writes via direct callers; no live server fix is claimed. Never use that sample mode in production. Signed service identity and durable auditing/idempotency are prerequisites to enabling provisioning.
- All calls go through the `radius-api` server function to a fixed set of upstream endpoints: `GET /v1/subscribers`, `POST /v1/subscribers`, `PATCH /v1/subscribers/:id/status`, `POST /v1/subscribers/:id/reset-password`, `GET /v1/plans`, `GET /v1/sessions`, `GET /v1/accounting`, `GET /v1/nas`. No direct MariaDB/daloRADIUS/FreeRADIUS access.
- Secrets (server only): `RADIUS_API_BASE_URL` (https, no credentials) and `RADIUS_API_TOKEN` (sent as Bearer). Until both are set the function returns clearly labelled sample responses.
- View: Admin, NOC, Care. Create/suspend/reactivate/reset password: Admin, NOC. Every subscriber change (including failures) writes an `audit_logs` entry under `radius_subscribers`; passwords are never logged. NAS shared secrets and any secret/password/token fields are stripped before reaching the browser.
