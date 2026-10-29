# Architecture rules

- Keep the existing React/Vite/Supabase stack; hosted database functions own atomic financial operations so concurrent clients cannot overspend balances.
- Use typed TanStack Query hooks for persisted data and database role checks for authorization; UI visibility is not a security boundary.
- Financial records are immutable except through explicit, audited lifecycle functions; maintain invoice currency snapshots to preserve historical amounts.
- Run domain rule tests with `npm test`; keep billing calculation tests beside their shared rules.- Router access goes only through the `router-control` edge function with an allow-listed action set and device-reference secrets; browsers never hold router addresses or credentials.
- Stock quantities change only through audited database functions (adjust_stock, record_supply_usage, loan_equipment, return_equipment) so concurrent staff cannot drive stock negative.
- Keep unapproved RADIUS server changes in review/radius-api, outside auto-deployed functions, and lock Hub calls until owner-approved contract and audited server deployment; browser gating is not server authorization.
- RADIUS mutations require verified service/staff identity, durable API idempotency, explicit response allowlists and checked intent/completion audit; uncertain or partially audited upstream results must never become Hub success.
- The RADIUS Provisioning API (review/radius-api/service) is a separately deployed Node container on the RADIUS host's private DB network: ES256 request-bound short-lived tokens only, least-privilege DB account, API-owned subscriber identity/idempotency/audit in its own schema, writes off unless explicitly enabled and the startup schema check passes.
- Run the standalone RADIUS service suite separately from root Hub tests, because it owns its own dependencies and optional throwaway-database checks; Docker contexts exclude secrets and test artifacts.
- Hub staff account management (create/edit/deactivate/reset password) goes only through the `admin-users` edge function with the service role; browsers never call Supabase Admin APIs, and every mutation must write an audit_logs row or report failure.
