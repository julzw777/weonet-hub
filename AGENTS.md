# Architecture rules

- Keep the existing React/Vite/Supabase stack; hosted database functions own atomic financial operations so concurrent clients cannot overspend balances.
- Use typed TanStack Query hooks for persisted data and database role checks for authorization; UI visibility is not a security boundary.
- Financial records are immutable except through explicit, audited lifecycle functions; maintain invoice currency snapshots to preserve historical amounts.
- Run domain rule tests with `npm test`; keep billing calculation tests beside their shared rules.