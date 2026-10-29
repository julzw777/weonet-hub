import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";
import { publicPem } from "./helpers.js";

const env = {
  RADIUS_API_ISSUER: "https://hub.test/radius", RADIUS_API_AUDIENCE: "weonet-radius-api", RADIUS_API_ALGORITHM: "ES256",
  RADIUS_API_PUBLIC_KEY_FILE: "/k", RADIUS_API_SERVICE_SUBJECT: "weonet-hub", RADIUS_DB_HOST: "radius-mysql", RADIUS_DB_USER: "weonet_api",
  RADIUS_DB_PASSWORD_FILE: "/p", RADIUS_DB_NAME: "radius", RADIUS_STATE_DB_NAME: "weonet_api", RADIUS_DB_TIMEZONE: "+00:00",
  RADIUS_PASSWORD_ATTRIBUTE: "Cleartext-Password", RADIUS_DISABLED_GROUP: "daloRADIUS-Disabled-Users",
};
const files = (p: string) => (p === "/k" ? publicPem : "db-pass\n");
describe("config", () => {
  it("loads complete config; writes off unless exactly true", () => {
    const r = loadConfig(env, files);
    expect(r.ok && r.config.writesEnabled).toBe(false);
    const w = loadConfig({ ...env, RADIUS_WRITES_ENABLED: "true" }, files);
    expect(w.ok && w.config.writesEnabled && w.config.db.password).toBe("db-pass");
  });
  it("rejects root, http issuer and missing semantics, reporting names only", () => {
    const r = loadConfig({ ...env, RADIUS_DB_USER: "root", RADIUS_API_ISSUER: "http://x", RADIUS_PASSWORD_ATTRIBUTE: undefined }, files);
    expect(r).toEqual({ ok: false, missing: ["RADIUS_API_ISSUER", "RADIUS_DB_USER", "RADIUS_PASSWORD_ATTRIBUTE"] });
  });
  it("rejects a key that does not match the algorithm", () =>
    expect(loadConfig({ ...env, RADIUS_API_ALGORITHM: "RS256" }, files)).toEqual({ ok: false, missing: ["RADIUS_API_PUBLIC_KEY_FILE"] }));
  it.each(["0", "65536", "99999", "-1", "abc"])("rejects invalid TCP port %s", value => {
    expect(loadConfig({ ...env, RADIUS_API_PORT: value }, files)).toEqual({ ok: false, missing: ["RADIUS_API_PORT"] });
    expect(loadConfig({ ...env, RADIUS_DB_PORT: value }, files)).toEqual({ ok: false, missing: ["RADIUS_DB_PORT"] });
  });
});
