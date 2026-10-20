# Architecture rules

- Keep the existing React/Vite/Supabase stack; hosted database functions own atomic financial operations so concurrent clients cannot overspend balances.
- Use typed TanStack Query hooks for persisted data and database role checks for authorization; UI visibility is not a security boundary.
- Financial records are immutable except through explicit, audited lifecycle functions; maintain invoice currency snapshots to preserve historical amounts.
- Run domain rule tests with `npm test`; keep billing calculation tests beside their shared rules.- Router access goes only through the `router-control` edge function with an allow-listed action set and device-reference secrets; browsers never hold router addresses or credentials.
- Stock quantities change only through audited database functions (adjust_stock, record_supply_usage, loan_equipment, return_equipment) so concurrent staff cannot drive stock negative.
