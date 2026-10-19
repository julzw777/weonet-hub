# Weonet Admin – staged build plan

Already done: staff sign-in, roles (Admin, NOC, Finance, Care, Tech, Warehouse, ReadOnly), role-guarded pages, core tables (customers, locations, plans, subscriptions, staff profiles, audit log, settings with SLE / Le) with row-level security.

The full spec is too big to ship safely at once, so I'll do it in reviewable stages. Each stage ends with tests and a build check.

## Stage 2 – Subscribers and Admin (next)
- Customers page reads and saves real records (create, edit, status change), with loading, empty and error states.
- Customer 360 tabs pull real subscriptions; invoices and tickets tabs show "available in Stage 3/4" until those exist.
- Plans page: manage plans and prices (Finance/Admin only), shown in Le.
- Subscriptions: create, activate, suspend, cancel, with dates; every change written to the audit log by the database, not the browser.
- Admin page: staff list and role assignment; admins can't remove their own admin role; changes audited.
- Remove mock data imports from these screens.
- Tests: role rules (who can edit customers, plans, roles), subscription status transitions.

## Stage 3 – Billing and payments
- Invoices, line items, credit notes, adjustments, balances, reminder history.
- Provider-neutral payments (Orange Money, AfriMoney, Vult, bank transfer): manual bank entry, duplicate detection by channel + reference, allocation to invoices, unmatched/partial/excess/reversed states, reconciliation queue, CSV exports.
- Webhook receiver per provider that rejects unsigned calls until Weonet supplies credentials.
- No automatic suspension until Weonet confirms the policy.

## Stage 4 – Tickets, inventory, equipment
- Persist tickets, stock items, serialized equipment, loans and consumables used per customer/install, linked to customers.

## Stage 5 – Network, RADIUS, MikroTik
- Devices table and health checks; PPPoE credentials stored hashed/encrypted server-side only.
- Server-side MikroTik and RADIUS adapters with allow-listed commands, dry-run preview, timeouts, retries, idempotency and audit. Disabled until Weonet adds router/RADIUS secrets.

## Stage 6 – Reports, docs, hardening
- Reports charts, Hotspot scope message, security review, backup/restore and deployment docs.

## What Weonet must provide (later)
- Payment provider API docs and credentials; invoicing and suspension rules; RADIUS server details and shared secret; router addresses and API accounts.

## Technical notes
- Data access via typed TanStack Query hooks in `src/lib/data/`.
- Audit rows created by database triggers so they can't be skipped.
- Vitest set up for rule tests.
