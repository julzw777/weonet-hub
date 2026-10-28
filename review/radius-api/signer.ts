/** REVIEW ONLY. Hub-side short-lived, request-bound ES256 service token (WebCrypto; runs in Deno and Node).
 * The private key lives only in a server-side secret; actor comes only from verified Supabase Auth. */
export interface SignInput {
  privateKeyPem: string; issuer: string; audience: string; subject: string;
  actorId: string; roles: string[]; write: boolean;
  method: string; pathAndQuery: string; body: string; requestId: string; idempotencyKey: string | null;
  nowS?: number; jti?: string; lifetimeS?: number;
}
const enc = new TextEncoder();
const b64url = (bytes: Uint8Array) => {
  let s = ""; for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
const pemBytes = (pem: string) => {
  const m = /-----BEGIN PRIVATE KEY-----([\s\S]+?)-----END PRIVATE KEY-----/.exec(pem);
  if (!m) throw new Error("Signing key must be PKCS#8 PEM");
  return Uint8Array.from(atob(m[1].replace(/\s+/g, "")), c => c.charCodeAt(0));
};

export async function signServiceToken(i: SignInput): Promise<string> {
  const lifetime = Math.min(i.lifetimeS ?? 120, 300);
  const now = i.nowS ?? Math.floor(Date.now() / 1000);
  const key = await crypto.subtle.importKey("pkcs8", pemBytes(i.privateKeyPem), { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const bdh = b64url(new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(i.body))));
  const header = { alg: "ES256", typ: "JWT" };
  const claims = {
    iss: i.issuer, aud: i.audience, sub: i.subject, iat: now, exp: now + lifetime, jti: i.jti ?? crypto.randomUUID(),
    act: { sub: i.actorId }, roles: i.roles, scope: i.write ? "radius:read radius:write" : "radius:read",
    htm: i.method, htu: i.pathAndQuery, bdh, rid: i.requestId, idk: i.idempotencyKey,
  };
  const input = `${b64url(enc.encode(JSON.stringify(header)))}.${b64url(enc.encode(JSON.stringify(claims)))}`;
  const sig = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, enc.encode(input)));
  return `Bearer ${input}.${b64url(sig)}`;
}
