import { z } from "zod";

/** Explicit owner-supplied confirmations, not env discovery or invented defaults. */
export const configurationSchema = z.object({
  contractApproved: z.literal(true),
  identity: z.object({
    issuer: z.string().url().refine(v => v.startsWith("https://")),
    audience: z.string().min(1).max(200),
    algorithm: z.enum(["ES256", "RS256"]),
    keySourceReference: z.string().min(1).max(200),
    serviceSubject: z.string().min(1).max(200),
    delegationAndReplayPolicyApproved: z.literal(true),
  }).strict(),
  tlsTerminationApproved: z.literal(true),
  schemaAndEnginesApproved: z.literal(true),
  leastPrivilegeGrantsApproved: z.literal(true),
  passwordAndDisableSemanticsApproved: z.literal(true),
  planMappingApproved: z.literal(true),
  stableIdsAndNasSourceApproved: z.literal(true),
  durableIdempotencyAuditRecoveryApproved: z.literal(true),
}).strict();
export type Configuration = z.infer<typeof configurationSchema>;
export function parseConfiguration(value: unknown): Configuration | null {
  const parsed = configurationSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
// Cannot be enabled by configuration. A separately reviewed implementation is required.
export const OPERATIONS_IMPLEMENTED = false;