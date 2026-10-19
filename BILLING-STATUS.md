# Billing foundation — 19 October 2026

## Implemented
- Persisted invoices with line items, currency snapshots from app settings, draft/issue/void lifecycle and derived paid/partial/overdue balances.
- Manual received-payment entry for bank transfer, Orange Money, AfriMoney and Vult. Entries are staff records, not provider confirmations.
- Unique channel + normalized reference prevents duplicates.
- Atomic allocation locks payment and invoice rows, rejects currency/customer mismatches and excessive amounts, and leaves excess funds unallocated.
- Audited payment reversal restores invoice balances; allocated invoices cannot be voided until payments are reversed.
- Reconciliation queue, invoice detail/payment history, CSV exports, and customer invoice history replace Billing mock data.
- Finance/Admin write through role-checked database functions only. Finance/Admin/Care/ReadOnly can read; Billing navigation remains Finance/Admin/ReadOnly.

## Database/configuration
Migrations were applied through Supabase: four financial tables, indexes, grants, RLS, audit/update triggers and five billing operations, followed by explicit removal of inherited anonymous grants. No extra secrets are needed for manual entry.

## Verification
- `npm test -- --reporter=verbose`: 21 passed (7 previous-stage + 14 billing).
- `supabase/tests/billing.sql`: rollback-only checks passed against connected Supabase for authorization, invoice total, draft allocation denial, duplicate reference, over-allocation, paid-invoice void denial, excess payment, reversal and audit.
- These SQL checks exercise database operations as controlled fixtures, not a real browser session. They do not establish full RLS isolation or concurrent-race test coverage.
- Authenticated browser checks are unavailable for this externally managed Supabase connection. The full create/issue/pay/allocate/reverse UI flow remains unverified.
- Security review: new tables deny anonymous access and direct authenticated writes. Signed-in table discovery and the five intentionally callable role-checked definer operations produce expected advisor warnings. Existing warnings include disabled leaked-password protection; no auth settings were changed.

## Prioritized remaining work
1. Validate real signed-in Finance/Admin and ReadOnly workflows and concurrent allocation, RLS denial and cross-customer/currency paths.
2. Add service-linked/recurring invoicing, credit notes/adjustments, reminder records and balance aging; Weonet must supply tax, invoice cadence, due-date, credit and reminder rules.
3. Official provider verification/webhooks and settlement/failed payment states; Weonet must supply Orange Money, AfriMoney and Vult documentation and credentials. Automatic suspension remains disabled pending policy.
4. Persistent tickets, inventory, loans and supplies consumed per customer.
5. RADIUS/MikroTik operations, reports and operational hardening.

Limits: invoice drafts cannot yet be edited, downloads are CSV rather than PDF, payment entry currently requires selecting an existing customer, and the data layer loads financial history in pages rather than server-filtered reporting. Other screens still retain mock data until their stage.