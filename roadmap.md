# Weonet remaining work

## RADIUS contract review (no deployment)
- [x] Continue local deployment-readiness hardening: checked audit failures, readiness gates, port validation, secret-safe Docker context and Compose wiring; 54 service tests + 117 Hub tests passed (6 optional DB tests skipped); Hub locks unchanged.
- [x] Real Provisioning API service + signed Hub adapter (staged); 37 service tests incl. throwaway MariaDB integration passed.
- [ ] BLOCKED (owner): deploy API container + TLS proxy, run SQL as DB admin, add Hub signing secrets, verify with staging NAS/radtest, then unlock Hub client.
- [x] Build and locally verify the standalone fail-closed service scaffold; 60 service tests, 21 Hub/staged-adapter regression tests and scoped type check passed; Hub locks unchanged.
- [x] Draft the unconfirmed provisioning contract and owner confirmation checklist.
- [x] Stage fail-closed adapter, strict response validation, idempotency and audit handling outside auto-deployed functions; block Hub writes.
- [x] Run local tests and review harness verification; document deployment and infrastructure blockers.
- [ ] BLOCKED: owner confirms API/auth/schema and authorizes deployment of staged server fix; legacy deployed function remains unchanged, so direct-call sample writes are not fixed live.

- [x] Verify Stage 2 permission and lifecycle tests (7 passed).
- [x] Implement Stage 3 foundation: persisted invoices, line items, manual payments, atomic allocation and reversal, reconciliation queue, CSV export, customer invoice history (21 rule tests and rollback database checks passed; full signed-in UI checks blocked below).
- [ ] Authenticated end-to-end checks: external Supabase sessions cannot be supplied in this environment.

## Later stages (not part of this continuation slice)
- [x] Credit notes, failed payments, service-linked invoices.
- [x] Stage 3 follow-up: reminder log, recurring preview + gated draft generation, AR aging / credit exports.
- Billing decisions pending from Weonet: currency confirmation, cadence, due days, taxes, proration, fees, reminders, suspension; signed provider webhooks.
- [x] Stage 4: persistent tickets, stock, movements, loans and customer supply usage (supabase/tests/inventory.sql passed).
- [x] Stage 5a: router registry, server-side MikroTik health check, action log (live checks need Weonet router secrets).
- [ ] BLOCKED Stage 5b: RADIUS/PPPoE mapping, then disconnect/apply-profile with dry-run (Weonet mapping + policy required).
- [x] Stage 6: live Dashboard, Reports charts, audit log viewer, error boundary, sample-data labels, OPERATIONS.md.
- Remaining hardening: leaked-password protection (dashboard setting), function rate limits, signed-in e2e tests.