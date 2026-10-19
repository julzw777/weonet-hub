# Weonet remaining work

- [x] Verify Stage 2 permission and lifecycle tests (7 passed).
- [x] Implement Stage 3 foundation: persisted invoices, line items, manual payments, atomic allocation and reversal, reconciliation queue, CSV export, customer invoice history (21 rule tests and rollback database checks passed; full signed-in UI checks blocked below).
- [ ] Authenticated end-to-end checks: external Supabase sessions cannot be supplied in this environment.

## Later stages (not part of this continuation slice)
- [x] Credit notes, failed payments, service-linked invoices.
- Stage 3 follow-up: adjustments policy, reminders, recurring billing and signed provider webhooks (provider credentials and billing rules required).
- Stage 4: persistent tickets, inventory, loans and customer supply usage.
- Stage 5: network, RADIUS and MikroTik (connection details required).
- Stage 6: reports and operational hardening.