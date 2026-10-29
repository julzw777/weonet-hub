/** Explicit deployment configuration. Security-relevant values have NO defaults; missing values fail closed. */
import { createPublicKey } from "node:crypto";
import { z } from "zod";
import type { IdentityConfig } from "./jwt.js";

const ident = z.string().regex(/^[A-Za-z0-9_]{1,64}$/);
const port = z.string().regex(/^\d{1,5}$/).refine(v => Number(v) >= 1 && Number(v) <= 65535);
const envSchema = z.object({
  RADIUS_API_PORT: port.default("8080"),
  RADIUS_API_ISSUER: z.string().url().refine(v => v.startsWith("https://")),
  RADIUS_API_AUDIENCE: z.string().min(8).max(200),
  RADIUS_API_ALGORITHM: z.enum(["ES256", "RS256"]),
  RADIUS_API_PUBLIC_KEY_FILE: z.string().min(1),
  RADIUS_API_SERVICE_SUBJECT: z.string().min(1).max(200),
  RADIUS_DB_HOST: z.string().regex(/^[A-Za-z0-9.-]{1,253}$/),
  RADIUS_DB_PORT: port.default("3306"),
  RADIUS_DB_USER: z.string().regex(/^[A-Za-z0-9_]{1,32}$/).refine(v => v.toLowerCase() !== "root", "root is forbidden"),
  RADIUS_DB_PASSWORD_FILE: z.string().min(1),
  RADIUS_DB_NAME: ident,
  RADIUS_STATE_DB_NAME: ident,
  // Offset in which FreeRADIUS writes radacct DATETIME values, e.g. +00:00. Must be confirmed per deployment.
  RADIUS_DB_TIMEZONE: z.string().regex(/^[+-](0\d|1[0-4]):[0-5]\d$/),
  RADIUS_PASSWORD_ATTRIBUTE: z.enum(["Cleartext-Password", "SSHA2-512-Password"]),
  RADIUS_DISABLED_GROUP: z.string().regex(/^[A-Za-z0-9._-]{1,64}$/),
  // Exactly "true" enables writes; anything else (including absent) keeps the API read-only.
  RADIUS_WRITES_ENABLED: z.string().optional(),
});

export interface ServiceConfig {
  port: number;
  identity: IdentityConfig;
  db: { host: string; port: number; user: string; password: string; radiusDb: string; stateDb: string; timezone: string };
  semantics: { passwordAttribute: "Cleartext-Password" | "SSHA2-512-Password"; disabledGroup: string };
  writesEnabled: boolean;
}
export type ConfigResult = { ok: true; config: ServiceConfig } | { ok: false; missing: string[] };

/** Returns only the NAMES of invalid variables; never values. */
export function loadConfig(env: Record<string, string | undefined>, readFile: (path: string) => string): ConfigResult {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) return { ok: false, missing: [...new Set(parsed.error.issues.map(i => String(i.path[0])))].sort() };
  const e = parsed.data;
  let publicKey, password;
  try {
    publicKey = createPublicKey(readFile(e.RADIUS_API_PUBLIC_KEY_FILE));
    const t = publicKey.asymmetricKeyType;
    if ((e.RADIUS_API_ALGORITHM === "ES256" && (t !== "ec" || publicKey.asymmetricKeyDetails?.namedCurve !== "prime256v1"))
      || (e.RADIUS_API_ALGORITHM === "RS256" && (t !== "rsa" || (publicKey.asymmetricKeyDetails?.modulusLength ?? 0) < 2048))) throw new Error();
  } catch { return { ok: false, missing: ["RADIUS_API_PUBLIC_KEY_FILE"] }; }
  try { password = readFile(e.RADIUS_DB_PASSWORD_FILE).replace(/\r?\n$/, ""); if (!password) throw new Error(); }
  catch { return { ok: false, missing: ["RADIUS_DB_PASSWORD_FILE"] }; }
  if (e.RADIUS_DB_NAME === e.RADIUS_STATE_DB_NAME) return { ok: false, missing: ["RADIUS_STATE_DB_NAME"] };
  return { ok: true, config: {
    port: Number(e.RADIUS_API_PORT),
    identity: { issuer: e.RADIUS_API_ISSUER, audience: e.RADIUS_API_AUDIENCE, algorithm: e.RADIUS_API_ALGORITHM, publicKey, serviceSubject: e.RADIUS_API_SERVICE_SUBJECT },
    db: { host: e.RADIUS_DB_HOST, port: Number(e.RADIUS_DB_PORT), user: e.RADIUS_DB_USER, password, radiusDb: e.RADIUS_DB_NAME, stateDb: e.RADIUS_STATE_DB_NAME, timezone: e.RADIUS_DB_TIMEZONE },
    semantics: { passwordAttribute: e.RADIUS_PASSWORD_ATTRIBUTE, disabledGroup: e.RADIUS_DISABLED_GROUP },
    writesEnabled: e.RADIUS_WRITES_ENABLED === "true",
  } };
}
