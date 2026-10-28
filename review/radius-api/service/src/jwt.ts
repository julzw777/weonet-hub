/** Short-lived, request-bound service token verification (node:crypto only, no `none`, no header-supplied keys). */
import { createHash, verify, type KeyObject } from "node:crypto";
import { z } from "zod";
import { uuid } from "./schemas.js";

export const MAX_TOKEN_LIFETIME_S = 300;
export const CLOCK_SKEW_S = 30;
export type HubRole = "admin" | "noc" | "care";
export type Scope = "radius:read" | "radius:write";
export interface IdentityConfig { issuer: string; audience: string; algorithm: "ES256" | "RS256"; publicKey: KeyObject; serviceSubject: string }
export interface RequestBinding { method: string; pathAndQuery: string; body: Uint8Array; requestId: string; idempotencyKey: string | null }
export interface VerifiedIdentity { serviceSubject: string; actorId: string; roles: HubRole[]; scopes: Scope[]; jti: string; expiresAt: Date }

const b64url = /^[A-Za-z0-9_-]+$/;
export const bodyDigest = (body: Uint8Array) => createHash("sha256").update(body).digest("base64url");
const header = z.object({ alg: z.enum(["ES256", "RS256"]), typ: z.literal("JWT").optional(), kid: z.string().max(128).optional() }).strict();
const claims = z.object({
  iss: z.string(), aud: z.union([z.string(), z.array(z.string()).max(4)]), sub: z.string().max(200),
  iat: z.number().int(), nbf: z.number().int().optional(), exp: z.number().int(), jti: uuid,
  act: z.object({ sub: uuid }).strict(),
  roles: z.array(z.enum(["admin", "noc", "care", "finance", "tech", "warehouse", "readonly"])).max(7),
  scope: z.string().max(64),
  htm: z.string(), htu: z.string().max(2048), bdh: z.string().regex(b64url).length(43), rid: uuid, idk: uuid.nullable(),
}).strict();

export class AuthError extends Error {}
const decode = (part: string) => JSON.parse(Buffer.from(part, "base64url").toString("utf8"));

export function verifyServiceToken(authorization: string, cfg: IdentityConfig, bind: RequestBinding, nowS = Math.floor(Date.now() / 1000)): VerifiedIdentity {
  const m = /^Bearer ([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)$/.exec(authorization);
  if (!m || authorization.length > 8192) throw new AuthError("format");
  let h, c;
  try { h = header.parse(decode(m[1])); c = claims.parse(decode(m[2])); } catch { throw new AuthError("decode"); }
  if (h.alg !== cfg.algorithm) throw new AuthError("alg");
  const data = Buffer.from(`${m[1]}.${m[2]}`);
  const sig = Buffer.from(m[3], "base64url");
  const ok = cfg.algorithm === "ES256"
    ? sig.length === 64 && verify("sha256", data, { key: cfg.publicKey, dsaEncoding: "ieee-p1363" }, sig)
    : verify("sha256", data, cfg.publicKey, sig);
  if (!ok) throw new AuthError("signature");
  const aud = Array.isArray(c.aud) ? c.aud : [c.aud];
  if (c.iss !== cfg.issuer || !aud.includes(cfg.audience) || c.sub !== cfg.serviceSubject) throw new AuthError("claims");
  if (c.exp - c.iat > MAX_TOKEN_LIFETIME_S || c.exp <= c.iat) throw new AuthError("lifetime");
  if (nowS + CLOCK_SKEW_S < c.iat || nowS + CLOCK_SKEW_S < (c.nbf ?? c.iat) || nowS - CLOCK_SKEW_S >= c.exp) throw new AuthError("time");
  if (c.htm !== bind.method || c.htu !== bind.pathAndQuery || c.bdh !== bodyDigest(bind.body) || c.rid !== bind.requestId || c.idk !== bind.idempotencyKey) throw new AuthError("binding");
  const scopes = c.scope.split(" ").filter(s => s === "radius:read" || s === "radius:write") as Scope[];
  const roles = c.roles.filter((r): r is HubRole => r === "admin" || r === "noc" || r === "care");
  return { serviceSubject: c.sub, actorId: c.act.sub.toLowerCase(), roles, scopes, jti: c.jti.toLowerCase(), expiresAt: new Date((c.exp + CLOCK_SKEW_S) * 1000) };
}
