// SQLite (built into Node, no server to run). One file: data/testdashboard.db
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const g = globalThis;
export const DATA = path.join(process.cwd(), "data");

const SCHEMA = `
CREATE TABLE IF NOT EXISTS repos (
  id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE, kind TEXT NOT NULL DEFAULT 'app',
  source TEXT NOT NULL DEFAULT 'local', path TEXT NOT NULL, url TEXT, branch TEXT, trusted INTEGER NOT NULL DEFAULT 0,
  last_sync_at INTEGER, last_commit TEXT, last_error TEXT, created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS envs (
  id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE, vars TEXT NOT NULL DEFAULT '{}', created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS suites (
  id INTEGER PRIMARY KEY, name TEXT NOT NULL, repo_id INTEGER NOT NULL REFERENCES repos(id) ON DELETE CASCADE,
  layer TEXT NOT NULL DEFAULT 'unit', cwd TEXT NOT NULL DEFAULT '.', setup TEXT NOT NULL DEFAULT '', command TEXT NOT NULL,
  parser TEXT NOT NULL DEFAULT 'exit', results_file TEXT NOT NULL DEFAULT '', env_id INTEGER, extra_env TEXT NOT NULL DEFAULT '{}',
  timeout_s INTEGER NOT NULL DEFAULT 600, schedule_min INTEGER NOT NULL DEFAULT 0, enabled INTEGER NOT NULL DEFAULT 1,
  trace TEXT NOT NULL DEFAULT '', last_scheduled INTEGER, created_at INTEGER NOT NULL, UNIQUE (repo_id, name)
);
CREATE TABLE IF NOT EXISTS runs (
  id INTEGER PRIMARY KEY, suite_id INTEGER NOT NULL REFERENCES suites(id) ON DELETE CASCADE, env_id INTEGER,
  status TEXT NOT NULL, trigger TEXT NOT NULL DEFAULT 'manual', batch_id TEXT, queued_at INTEGER NOT NULL, started_at INTEGER, finished_at INTEGER,
  duration_ms INTEGER, exit_code INTEGER, commit_sha TEXT, passed INTEGER NOT NULL DEFAULT 0, failed INTEGER NOT NULL DEFAULT 0,
  skipped INTEGER NOT NULL DEFAULT 0, total INTEGER NOT NULL DEFAULT 0, error TEXT, command TEXT
);
CREATE INDEX IF NOT EXISTS runs_suite_idx ON runs (suite_id, id DESC);
CREATE TABLE IF NOT EXISTS results (
  id INTEGER PRIMARY KEY, run_id INTEGER NOT NULL REFERENCES runs(id) ON DELETE CASCADE, suite_id INTEGER NOT NULL,
  test_key TEXT NOT NULL, file TEXT, name TEXT NOT NULL, status TEXT NOT NULL, duration_ms INTEGER, retries INTEGER NOT NULL DEFAULT 0, error TEXT, trace_artifact INTEGER
);
CREATE INDEX IF NOT EXISTS results_run_idx ON results (run_id);
CREATE INDEX IF NOT EXISTS results_key_idx ON results (test_key, run_id DESC);
CREATE TABLE IF NOT EXISTS artifacts (
  id INTEGER PRIMARY KEY, run_id INTEGER NOT NULL REFERENCES runs(id) ON DELETE CASCADE, kind TEXT NOT NULL, name TEXT NOT NULL, path TEXT NOT NULL, size INTEGER
);
CREATE TABLE IF NOT EXISTS hooks (
  token TEXT PRIMARY KEY, name TEXT NOT NULL, suite_ids TEXT NOT NULL DEFAULT '[]', env_id INTEGER, created_at INTEGER NOT NULL
);
`;

export function db() {
  if (!g.__testdashDb) {
    fs.mkdirSync(DATA, { recursive: true });
    const d = new DatabaseSync(path.join(DATA, "testdashboard.db"));
    d.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
    d.exec(SCHEMA);
    g.__testdashDb = d;
  }
  return g.__testdashDb;
}
export const all = (sql, ...p) => db().prepare(sql).all(...p);
export const get = (sql, ...p) => db().prepare(sql).get(...p);
export const run = (sql, ...p) => db().prepare(sql).run(...p);
export const insert = (sql, ...p) => Number(db().prepare(sql).run(...p).lastInsertRowid);
export const now = () => Date.now();
export const json = (s, d = {}) => { try { return JSON.parse(s); } catch { return d; } };
