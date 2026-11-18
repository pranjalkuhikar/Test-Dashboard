// PostgreSQL. Connection: DATABASE_URL (default postgres://app:app@localhost:5432/testdashboard).
// The database and the tables are created automatically on first use.
//
// The rest of the app calls all/get/run/insert as plain synchronous functions. To keep that API while using Postgres
// (whose driver is async), the queries run in a worker thread (lib/pg-worker.mjs) and this thread waits for the
// answer with Atomics.wait. That is fine for a local, single-user tool: the old SQLite driver was synchronous too.
import path from "node:path";
import { Worker, MessageChannel, receiveMessageOnPort } from "node:worker_threads";

const g = globalThis;
export const DATA = path.join(process.cwd(), "data"); // run logs, artifacts and cloned repos still live on disk here
export const DATABASE_URL = process.env.DATABASE_URL || "postgres://app:app@localhost:5432/testdashboard";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS repos (
  id BIGSERIAL PRIMARY KEY, name TEXT NOT NULL UNIQUE, kind TEXT NOT NULL DEFAULT 'app',
  source TEXT NOT NULL DEFAULT 'local', path TEXT NOT NULL, url TEXT, branch TEXT, trusted INTEGER NOT NULL DEFAULT 0,
  last_sync_at BIGINT, last_commit TEXT, last_error TEXT, created_at BIGINT NOT NULL
);
CREATE TABLE IF NOT EXISTS envs (
  id BIGSERIAL PRIMARY KEY, name TEXT NOT NULL UNIQUE, vars TEXT NOT NULL DEFAULT '{}', created_at BIGINT NOT NULL
);
CREATE TABLE IF NOT EXISTS suites (
  id BIGSERIAL PRIMARY KEY, name TEXT NOT NULL, repo_id BIGINT NOT NULL REFERENCES repos(id) ON DELETE CASCADE,
  layer TEXT NOT NULL DEFAULT 'unit', cwd TEXT NOT NULL DEFAULT '.', setup TEXT NOT NULL DEFAULT '', command TEXT NOT NULL,
  parser TEXT NOT NULL DEFAULT 'exit', results_file TEXT NOT NULL DEFAULT '', env_id BIGINT, extra_env TEXT NOT NULL DEFAULT '{}',
  timeout_s INTEGER NOT NULL DEFAULT 600, schedule_min INTEGER NOT NULL DEFAULT 0, enabled INTEGER NOT NULL DEFAULT 1,
  trace TEXT NOT NULL DEFAULT '', last_scheduled BIGINT, created_at BIGINT NOT NULL, UNIQUE (repo_id, name)
);
CREATE TABLE IF NOT EXISTS runs (
  id BIGSERIAL PRIMARY KEY, suite_id BIGINT NOT NULL REFERENCES suites(id) ON DELETE CASCADE, env_id BIGINT,
  status TEXT NOT NULL, trigger TEXT NOT NULL DEFAULT 'manual', batch_id TEXT, queued_at BIGINT NOT NULL, started_at BIGINT, finished_at BIGINT,
  duration_ms BIGINT, exit_code INTEGER, commit_sha TEXT, passed INTEGER NOT NULL DEFAULT 0, failed INTEGER NOT NULL DEFAULT 0,
  skipped INTEGER NOT NULL DEFAULT 0, total INTEGER NOT NULL DEFAULT 0, error TEXT, command TEXT
);
CREATE INDEX IF NOT EXISTS runs_suite_idx ON runs (suite_id, id DESC);
CREATE TABLE IF NOT EXISTS results (
  id BIGSERIAL PRIMARY KEY, run_id BIGINT NOT NULL REFERENCES runs(id) ON DELETE CASCADE, suite_id BIGINT NOT NULL,
  test_key TEXT NOT NULL, file TEXT, name TEXT NOT NULL, status TEXT NOT NULL, duration_ms BIGINT, retries INTEGER NOT NULL DEFAULT 0, error TEXT, trace_artifact BIGINT, detail TEXT
);
CREATE INDEX IF NOT EXISTS results_run_idx ON results (run_id);
CREATE INDEX IF NOT EXISTS results_key_idx ON results (test_key, run_id DESC);
CREATE TABLE IF NOT EXISTS artifacts (
  id BIGSERIAL PRIMARY KEY, run_id BIGINT NOT NULL REFERENCES runs(id) ON DELETE CASCADE, kind TEXT NOT NULL, name TEXT NOT NULL, path TEXT NOT NULL, size BIGINT
);
CREATE TABLE IF NOT EXISTS hooks (
  token TEXT PRIMARY KEY, name TEXT NOT NULL, suite_ids TEXT NOT NULL DEFAULT '[]', env_id BIGINT, created_at BIGINT NOT NULL
);
`;

function worker() {
  if (!g.__testdashPg) {
    const w = new Worker(path.join(process.cwd(), "lib", "pg-worker.mjs"), { workerData: { url: DATABASE_URL, schema: SCHEMA }, execArgv: [] }); // execArgv: do not inherit the server's flags
    w.unref(); // never keep the server alive just for the DB thread
    w.on("error", (e) => { console.error("[db worker]", e); g.__testdashPg = null; });
    w.on("exit", () => { g.__testdashPg = null; });
    g.__testdashPg = w;
  }
  return g.__testdashPg;
}

// "?" placeholders (as the app writes them) -> $1, $2 ... (skipping anything inside '...' literals)
const toPg = (sql) => { let n = 0; return sql.replace(/'(?:[^']|'')*'|\?/g, (m) => (m === "?" ? "$" + ++n : m)); };

function exec(sql, params) {
  const flag = new SharedArrayBuffer(4), f = new Int32Array(flag);
  const { port1, port2 } = new MessageChannel();
  worker().postMessage({ flag, port: port2, sql: toPg(sql), params: params.map((p) => (p === undefined ? null : p)) }, [port2]);
  // the first call also waits for "create database + tables", so allow it a little longer
  const wait = Atomics.wait(f, 0, 0, g.__testdashPgWarm ? 30000 : 60000);
  if (wait === "timed-out") { port1.close(); throw new Error("PostgreSQL did not answer in time. Is it running? (brew services start postgresql@17)"); }
  const m = receiveMessageOnPort(port1)?.message;
  port1.close();
  if (!m) throw new Error("No answer from the database worker");
  if (!m.ok) { const e = new Error(m.error); e.code = m.code; throw e; }
  g.__testdashPgWarm = true;
  return m;
}

// An id that is not a valid number (/api/runs/abc) or too big for the column makes Postgres raise an error, while SQLite
// simply found nothing. Reads and updates keep the "found nothing" behaviour, so the routes answer 404, not 500.
// Inserts are not covered on purpose: bad data being written should fail loudly.
const NO_MATCH = new Set(["22P02", "22003"]); // invalid_text_representation, numeric_value_out_of_range
const quiet = (sql, p, empty) => { try { return exec(sql, p); } catch (e) { if (NO_MATCH.has(e.code)) return empty; throw e; } };
const NONE = { rows: [], rowCount: 0 };

export const all = (sql, ...p) => quiet(sql, p, NONE).rows;
export const get = (sql, ...p) => quiet(sql, p, NONE).rows[0];
export const run = (sql, ...p) => ({ changes: quiet(sql, p, NONE).rowCount });
export const insert = (sql, ...p) => Number(exec(`${sql.replace(/;\s*$/, "")} RETURNING id`, p).rows[0].id);
export const now = () => Date.now();
export const json = (s, d = {}) => { try { return JSON.parse(s); } catch { return d; } };
