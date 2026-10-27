/** Interfaces only. No driver, SQL, credentials, connection, or executable adapter. */
export type VerifiedInspectableTable = "radcheck" | "userinfo" | "billing_plans" | "billing_plans_profiles" | "radusergroup" | "radacct";
export interface VerifiedSchemaRepositories {
  // Owner verification/maintenance seam only; not an API route or subscriber mapper.
  // Table is a closed union; API inputs must never be passed through here.
  countRows(table: VerifiedInspectableTable): Promise<number>;
  // Only the verified username column is modeled. NULL/duplicates are preserved;
  // this index is NOT a unique subscriber identity or a stable API ID.
  inspectUsernames(limit: number): Promise<ReadonlyArray<{ username: string | null }>>;
}
// Intentionally no userbillinfo interface, writes, raw radcheck values, inferred
// plan/group columns, NAS repository, or AcctStopTime interpretation.