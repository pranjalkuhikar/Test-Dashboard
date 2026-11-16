// Runs inside a worker thread (started by lib/db.js). It owns the Postgres connection pool,
// creates the database + tables on first use, and answers one query at a time.
// A plain .mjs file on purpose: it is loaded by path at runtime, not bundled by Next.js.
import { parentPort, workerData } from "node:worker_threads";
import pg from "pg";

// Postgres returns BIGINT / NUMERIC as strings; this app stores timestamps (ms) in BIGINT, so give back numbers.
pg.types.setTypeParser(20, (v) => Number(v));
pg.types.setTypeParser(1700, (v) => Number(v));

const { url, schema } = workerData;

const hint = (e) => {
  const where = url.replace(/:\/\/([^:@/]+):[^@/]*@/, "://$1:***@");
  if (["ECONNREFUSED", "ENOTFOUND", "ETIMEDOUT"].includes(e.code)) return `Cannot reach PostgreSQL at ${where}. Is it running? (macOS/Homebrew: brew services start postgresql@17)`;
  if (e.code === "28P01" || e.code === "28000") return `PostgreSQL refused the login for ${where}: ${e.message}`;
  return e.message || String(e);
};

let pool;
const ready = (async () => {
  const u = new URL(url);
  const dbName = decodeURIComponent(u.pathname.slice(1)) || "testdashboard";
  if (!/^[\w-]+$/.test(dbName)) throw new Error(`Unsafe database name in DATABASE_URL: ${dbName}`);
  // create the database if it does not exist yet (connect to the maintenance database first)
  const admin = new URL(url); admin.pathname = "/postgres";
  const c = new pg.Client({ connectionString: admin.toString() });
  await c.connect();
  try {
    const r = await c.query("SELECT 1 FROM pg_database WHERE datname = $1", [dbName]);
    if (!r.rowCount) await c.query(`CREATE DATABASE "${dbName}"`);
  } finally { await c.end(); }
  pool = new pg.Pool({ connectionString: url, max: 3 });
  pool.on("error", () => {}); // an idle connection dropped by the server must not crash the worker
  await pool.query(schema);
})().catch((e) => { throw new Error(hint(e)); });
ready.catch(() => {}); // reported per request below

parentPort.on("message", async ({ flag, port, sql, params }) => {
  const f = new Int32Array(flag);
  try {
    await ready;
    const r = await pool.query(sql, params);
    port.postMessage({ ok: true, rows: r.rows, rowCount: r.rowCount ?? 0 });
  } catch (e) {
    port.postMessage({ ok: false, error: e.message && /^Cannot reach|^PostgreSQL refused|^Unsafe/.test(e.message) ? e.message : hint(e), code: e.code });
  }
  Atomics.store(f, 0, 1);
  Atomics.notify(f, 0);
});
