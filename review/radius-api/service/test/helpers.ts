import { generateKeyPairSync, randomUUID } from "node:crypto";
import { signServiceToken } from "../../signer";
import type { IdentityConfig } from "../src/jwt.js";

export const keys = generateKeyPairSync("ec", { namedCurve: "P-256" });
export const privatePem = keys.privateKey.export({ type: "pkcs8", format: "pem" }).toString();
export const publicPem = keys.publicKey.export({ type: "spki", format: "pem" }).toString();
export const identity: IdentityConfig = { issuer: "https://hub.test/radius", audience: "weonet-radius-api-test", algorithm: "ES256", publicKey: keys.publicKey, serviceSubject: "weonet-hub" };
export const ACTOR = "11111111-1111-4111-8111-111111111111";
export const NOW = 1_800_000_000;

export interface Call { method?: string; path: string; body?: unknown; roles?: string[]; write?: boolean; key?: string | null; tamper?: (t: string) => string; signPath?: string; signBody?: string; nowS?: number; jti?: string; privatePem?: string; subject?: string }
export async function signedRequest(c: Call) {
  const method = c.method ?? "GET";
  const body = c.body === undefined ? "" : JSON.stringify(c.body);
  const requestId = randomUUID();
  const key = c.key === undefined ? (method === "GET" ? null : randomUUID()) : c.key;
  let auth = await signServiceToken({
    privateKeyPem: c.privatePem ?? privatePem, issuer: identity.issuer, audience: identity.audience, subject: c.subject ?? identity.serviceSubject,
    actorId: ACTOR, roles: c.roles ?? ["admin"], write: c.write ?? method !== "GET", method, pathAndQuery: c.signPath ?? c.path,
    body: c.signBody ?? body, requestId, idempotencyKey: key, nowS: c.nowS ?? NOW, jti: c.jti,
  });
  if (c.tamper) auth = c.tamper(auth);
  const headers: Record<string, string> = { Authorization: auth, "X-Request-ID": requestId };
  if (key) headers["Idempotency-Key"] = key;
  if (body) headers["Content-Type"] = "application/json";
  return new Request(`http://internal${c.path}`, { method, headers, body: body || undefined });
}
