# Weonet Admin — operations guide

## Architecture
- React + Vite single-page app; Supabase project `chfdyxqkwecedyxejbon` for staff sign-in, database, row-level security and server functions.
- Money changes go only through role-checked database functions (see `BILLING-STATUS.md`). Router access goes only through the `router-control` server function (see `NETWORK-ROUTER-CONTROL.md`).
- Every sensitive table writes to `audit_logs` via triggers. Admins can browse it at **Admin → Audit log**.

## Roles
| Role | Can |
|---|---|
| Admin | Everything, incl. roles, settings, currency confirmation |
| Finance | Invoices, payments, credit notes, reminders, exchange rates, recurring drafts |
| Care | Customers/services; read billing |
| NOC | Services, router registry and health checks |
| Tech | Locations; read network |
| Warehouse | Inventory (persistent version in Stage 4) |
| ReadOnly | Read customers, billing, network |
The first account to sign up becomes Admin; later sign-ups are ReadOnly until an Admin grants roles. No users or passwords are seeded.

## Environment
- Browser config (public, safe to commit): `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_PROJECT_ID`.
- Server secrets (Supabase → Settings → Edge Functions): `SUPABASE_SERVICE_ROLE_KEY` (managed), `ROUTER_<REF>_URL|USERNAME|PASSWORD` per router. Never place secrets in the repository. If one is ever committed, rotate it in Supabase immediately.

## Migrations
- All schema changes live in `supabase/migrations/` and are applied in order. Don't edit an applied migration; add a new one.
- Rollback-only checks: `supabase/tests/billing.sql`, `recurring.sql`, `network.sql`. Run them in the SQL editor; they leave no data behind.

## Backups and restore
- Enable daily backups (and Point-in-Time Recovery for financial data) in Supabase → Database → Backups. The plan tier determines retention.
- Before risky changes, take a manual `pg_dump` with the database connection string: `pg_dump --no-owner -Fc "$DB_URL" > weonet-YYYYMMDD.dump`.
- Restore into a **new** project first (`pg_restore --no-owner -d "$NEW_DB_URL" weonet-YYYYMMDD.dump`), verify totals against the latest finance CSV exports, then switch.
- Test a restore at least quarterly.

## Deployment
1. Run `npm test` (unit rules) and the SQL rollback checks.
2. Publish the app from Lovable; server functions deploy automatically.
3. After publishing: sign in as Finance and ReadOnly test accounts and check Billing, Reports and Network.

## Demo vs production data
- Tickets and Inventory pages still show **sample data** (labelled on-screen) until Stage 4.
- Don't create test customers in production. Use a separate Supabase project for demos.

## Security review (2026-10-20)
- RLS is enabled on every public table. Anonymous access is revoked. Financial and router-log tables reject direct writes.
- Advisor warnings remaining: "signed-in users can see table names" and "signed-in users can call role-checked functions". These are expected, since each function checks the caller's role. **Leaked-password protection is disabled**; turn it on in Supabase → Authentication → Policies.
- Not yet done: per-user rate limiting on server functions, verified signed-in end-to-end tests, and a Stage 4 RLS review of tickets and inventory.
