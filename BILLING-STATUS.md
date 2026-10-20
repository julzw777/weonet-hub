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
- Browser check: `/billing` redirects to `/login`, with no runtime errors. Automatic preview build checks report `build OK`.
- Security review: new tables deny anonymous access and direct authenticated writes. Signed-in table discovery and the five intentionally callable role-checked definer operations produce expected advisor warnings. Existing warnings include disabled leaked-password protection; no auth settings were changed.

## Prioritized remaining work
1. Validate real signed-in Finance/Admin and ReadOnly workflows and concurrent allocation, RLS denial and cross-customer/currency paths.
2. Add service-linked/recurring invoicing, credit notes/adjustments, reminder records and balance aging; Weonet must supply tax, invoice cadence, due-date, credit and reminder rules.
3. Official provider verification/webhooks and settlement/failed payment states; Weonet must supply Orange Money, AfriMoney and Vult documentation and credentials. Automatic suspension remains disabled pending policy.
4. Persistent tickets, inventory, loans and supplies consumed per customer.
5. RADIUS/MikroTik operations, reports and operational hardening.

Limits: invoice drafts cannot yet be edited, downloads are CSV rather than PDF, payment entry currently requires selecting an existing customer, and the data layer loads financial history in pages rather than server-filtered reporting. Other screens still retain mock data until their stage.
## Increment 2026-10-19 (credit notes, failed payments, service links)
- Invoices: optional `subscription_id` (must belong to the invoice's customer, checked server-side) and `issued_at` set when issued.
- `credit_notes` table + `issue_credit_note()` (Finance/Admin, issued invoices only, cannot exceed open balance, audited). Balance = total − active allocations − credits.
- `mark_payment_failed()` (Finance/Admin, only when nothing is allocated; failed payments can never be allocated).
- Payment states: unmatched, partial (excess left unallocated), matched, reversed, failed.

## Provider boundary (not active)
Orange Money, AfriMoney and Vult are recorded manually only. No webhook or API is enabled. To activate a provider Weonet must supply: official API docs, merchant/account IDs, API keys, webhook signing secret and verification method, sandbox access, and settlement report format. Each will be a server-side function storing secrets in Supabase secrets and posting through `record_payment` (unique channel+reference gives idempotency). A browser response or screenshot is never proof of payment.

## Business decisions still required
- Currency: SLE / Le is a configured placeholder chosen during setup, not a confirmed business rule.
- Invoice cadence (monthly/prepaid), proration, taxes/VAT, late fees, adjustments policy, reminder schedule and channels.
- Suspension/disconnection policy — no automation exists.

## Increment 2026-10-20 (reminder history)
- `invoice_reminders` table: channel, recipient, status (logged → sent → delivered, or failed with reason), sent/delivered/failed timestamps, recorded_by. Read: Admin/Finance/Care/ReadOnly; write only via `log_invoice_reminder()` / `set_reminder_status()` (Finance/Admin, issued invoices only, audited).
- Nothing is sent automatically; staff record reminders they sent by hand. Automatic sending requires Weonet to confirm schedule, channels, wording and a delivery provider.

## Increment 2026-10-20 (section 5 close-out)
**Live:** invoices with line items, service link, issue/void, balances (total − payments − credit notes), customer invoice history, allocation/reversal, credit notes (the only adjustment type), reminder history (manual log only), CSV exports for invoices, payments, AR aging and credit notes, with an aging summary in the "Recurring & reports" tab.
**Preview-only / gated:**
- Currency SLE/Le is shown as a *placeholder* until an Admin records Weonet's confirmation. The currency can't change once invoices or payments exist.
- Recurring invoices: `preview_recurring_invoices(period)` lists active priced services (read-only). `generate_recurring_invoices(period)` creates **drafts only**, one per service per month (unique index plus a lock). It refuses to run until currency is confirmed and cadence/due days are set. Only monthly cadence is offered, at full plan price.
- Not implemented on purpose (Weonet decisions): taxes/VAT, proration, late fees, grace periods, debit adjustments, discounts, reminder schedule/channels/provider, suspension.
**Tests:** `npm test` (50 passed); `supabase/tests/recurring.sql` rollback checks passed.
- Collections report: issued invoices filtered by issue date, grouped paid / partial / outstanding, CSV export (Recurring & reports tab).
