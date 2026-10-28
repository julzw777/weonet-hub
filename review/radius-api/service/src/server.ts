/** Process entrypoint: env config, MariaDB pool, periodic schema check, plain HTTP behind a TLS reverse proxy. */
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { Readable } from "node:stream";
import { createPool } from "mysql2/promise";
import { loadConfig } from "./config.js";
import { createHandler, type SafeLogEvent } from "./handler.js";
import { MySqlStore } from "./mysql-store.js";
import type { SchemaReport } from "./store.js";

const log = (e: SafeLogEvent | Record<string, unknown>) => process.stdout.write(JSON.stringify({ ts: new Date().toISOString(), ...e }) + "\n");
const loaded = loadConfig(process.env, p => readFileSync(p, "utf8"));
let store: MySqlStore | null = null;
let schema: SchemaReport | null = null;
if (!loaded.ok) log({ event: "config_invalid", variables: loaded.missing }); // names only, never values
else {
  const c = loaded.config;
  const pool = createPool({ host: c.db.host, port: c.db.port, user: c.db.user, password: c.db.password, connectionLimit: 8, timezone: c.db.timezone, connectTimeout: 5000, supportBigNumbers: true, bigNumberStrings: true, multipleStatements: false, namedPlaceholders: false });
  store = new MySqlStore(pool, c);
  const refresh = async () => {
    try { schema = await store!.checkSchema(); log({ event: "schema_check", reads: schema.reads, writes: schema.writes, problems: schema.problems }); }
    catch { schema = null; log({ event: "schema_check_failed" }); }
  };
  void refresh(); setInterval(refresh, 60_000).unref();
}
const handler = createHandler({
  identity: loaded.ok ? loaded.config.identity : null, store, writesEnabled: loaded.ok && loaded.config.writesEnabled, schema: () => schema, log,
});
const port = loaded.ok ? loaded.config.port : 8080;
const server = createServer(async (req, res) => {
  try {
    const url = `http://internal${req.url ?? "/"}`;
    const hasBody = req.method !== "GET" && req.method !== "HEAD";
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) if (typeof v === "string") headers.set(k, v);
    const request = new Request(url, { method: req.method, headers, body: hasBody ? (Readable.toWeb(req) as ReadableStream) : undefined, duplex: "half" } as RequestInit);
    const response = await handler(request);
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch { res.writeHead(500, { "Content-Type": "application/json" }); res.end('{"error":{"code":"INTERNAL","message":"Internal error","outcome":"unknown"}}'); }
});
server.requestTimeout = 15_000; server.headersTimeout = 10_000;
server.listen(port, "0.0.0.0", () => log({ event: "listening", port, writes_enabled: loaded.ok && loaded.config.writesEnabled }));
for (const sig of ["SIGTERM", "SIGINT"]) process.on(sig, () => server.close(() => process.exit(0)));
