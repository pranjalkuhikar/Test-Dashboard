// Run queue: executes suites as child processes (own process group), streams logs to disk, parses results, collects artifacts.
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { all, get, run, insert, now, json, DATA } from "./db.js";
import { parseResults } from "./parsers.js";
import { syncRepo, headCommit } from "./git.js";

const CONCURRENCY = 2;
const S = (globalThis.__testdashRunner ||= { live: new Map(), pumping: false });
export const runDir = (id) => path.join(DATA, "runs", String(id));
export const logPath = (id) => path.join(runDir(id), "log.txt");

const RESULT_EXT = { junit: "xml", playwright: "json", jest: "json", vitest: "json", exit: "txt" };
const redactor = (vars) => {
  const secrets = Object.entries(vars).filter(([k, v]) => /token|secret|password|key|auth/i.test(k) && String(v).length >= 6).map(([, v]) => String(v));
  return (s) => secrets.reduce((a, v) => a.split(v).join("•••"), s);
};
const kindOf = (f) => (/(^|\/)trace\.zip$/.test(f) ? "trace" : /\.(png|jpe?g)$/.test(f) ? "screenshot" : /\.(webm|mp4)$/.test(f) ? "video" : /\.(html)$/.test(f) ? "report" : "file");

function walk(dir, base = dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, base, out); else out.push(path.relative(base, p));
  }
  return out;
}

export function enqueue(suiteId, { trigger = "manual", batchId = null, envId = null } = {}) {
  const suite = get("SELECT * FROM suites WHERE id=?", suiteId);
  if (!suite) throw new Error("Suite not found");
  const id = insert("INSERT INTO runs (suite_id, env_id, status, trigger, batch_id, queued_at) VALUES (?,?,?,?,?,?)", suiteId, envId ?? suite.env_id ?? null, "queued", trigger, batchId, now());
  setImmediate(pump);
  return id;
}

function pump() {
  if (S.pumping) return; S.pumping = true;
  try {
    while (S.live.size < CONCURRENCY) {
      const next = get("SELECT id FROM runs WHERE status='queued' ORDER BY id LIMIT 1");
      if (!next) break;
      run("UPDATE runs SET status='running', started_at=? WHERE id=?", now(), next.id);
      const entry = { child: null, cancelled: false, timedOut: false };
      S.live.set(next.id, entry);
      execute(next.id, entry).catch((e) => finish(next.id, entry, { status: "error", error: String(e.message || e) })).finally(() => { S.live.delete(next.id); setImmediate(pump); });
    }
  } finally { S.pumping = false; }
}

function finish(runId, entry, patch) {
  const r = get("SELECT started_at FROM runs WHERE id=?", runId);
  const f = { passed: 0, failed: 0, skipped: 0, total: 0, exit_code: null, error: null, ...patch };
  run("UPDATE runs SET status=?, finished_at=?, duration_ms=?, exit_code=?, passed=?, failed=?, skipped=?, total=?, error=? WHERE id=?",
    f.status, now(), now() - (r?.started_at || now()), f.exit_code, f.passed, f.failed, f.skipped, f.total, f.error, runId);
}

async function execute(runId, entry) {
  const r = get("SELECT * FROM runs WHERE id=?", runId);
  const suite = get("SELECT * FROM suites WHERE id=?", r.suite_id);
  const repo = get("SELECT * FROM repos WHERE id=?", suite.repo_id);
  const dir = runDir(runId), arts = path.join(dir, "artifacts");
  fs.mkdirSync(arts, { recursive: true });
  const log = fs.createWriteStream(logPath(runId), { flags: "a" });
  const w = (s) => log.write(s);
  const env = r.env_id ? get("SELECT * FROM envs WHERE id=?", r.env_id) : null;
  const vars = { ...json(env?.vars), ...json(suite.extra_env) };
  const hide = redactor(vars);

  if (!repo.trusted) { w("✖ This repo is not marked trusted. Test suites run arbitrary commands on this machine, so a repo must be trusted first.\n"); log.end(); return finish(runId, entry, { status: "error", error: "Repo is not trusted" }); }

  if (repo.source === "git") {
    w(`$ git sync ${repo.url}\n`);
    const s = await syncRepo(repo);
    if (s.error) { w("✖ " + s.error + "\n"); log.end(); return finish(runId, entry, { status: "error", error: s.error }); }
  }
  const sha = await headCommit(repo.path);
  run("UPDATE runs SET commit_sha=? WHERE id=?", sha, runId);

  const resultsFile = path.join(dir, `results.${RESULT_EXT[suite.parser] || "txt"}`);
  let command = suite.command.split("{{results}}").join(resultsFile).split("{{artifacts}}").join(arts);
  if (suite.parser === "playwright") {
    if (!/--output\b/.test(command)) command += ` --output="${arts}"`;
    if (suite.trace && !/--trace\b/.test(command)) command += ` --trace=${suite.trace}`;
  }
  run("UPDATE runs SET command=? WHERE id=?", command, runId);

  const cwd = path.resolve(repo.path, suite.cwd || ".");
  if (!cwd.startsWith(path.resolve(repo.path))) { log.end(); return finish(runId, entry, { status: "error", error: "Suite folder escapes the repo" }); }
  if (!fs.existsSync(cwd)) { w(`✖ Folder not found: ${cwd}\n`); log.end(); return finish(runId, entry, { status: "error", error: "Suite folder not found" }); }

  const full = [suite.setup, command].filter(Boolean).join(" && ");
  w(`# ${suite.name} · ${suite.layer} · ${repo.name}@${sha || "?"}${env ? " · env " + env.name : ""}\n# cwd ${cwd}\n$ ${hide(full)}\n\n`);

  const child = spawn("/bin/sh", ["-c", full], {
    cwd, detached: true, stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, ...vars, CI: "1", NO_COLOR: "1", PLAYWRIGHT_JSON_OUTPUT_NAME: resultsFile, TEST_DASHBOARD_RUN_ID: String(runId), TEST_DASHBOARD_ARTIFACTS: arts },
  });
  entry.child = child;
  const pipe = (d) => w(hide(d.toString()));
  child.stdout.on("data", pipe); child.stderr.on("data", pipe);
  const kill = () => { try { process.kill(-child.pid, "SIGTERM"); } catch {} setTimeout(() => { try { process.kill(-child.pid, "SIGKILL"); } catch {} }, 3000).unref(); };
  entry.kill = kill;
  const timer = setTimeout(() => { entry.timedOut = true; w(`\n✖ Timed out after ${suite.timeout_s}s, stopping.\n`); kill(); }, suite.timeout_s * 1000);

  const code = await new Promise((resolve) => { child.on("close", (c) => resolve(c)); child.on("error", (e) => { w("✖ " + e.message + "\n"); resolve(127); }); });
  clearTimeout(timer);
  w(`\n# exit ${code}\n`); log.end();

  // artifacts first so results can point at their traces
  const files = walk(arts), artIds = new Map();
  for (const f of files) {
    const p = path.join(arts, f);
    artIds.set(f, insert("INSERT INTO artifacts (run_id, kind, name, path, size) VALUES (?,?,?,?,?)", runId, kindOf(f), f, p, fs.statSync(p).size));
  }
  if (fs.existsSync(resultsFile)) { const k = RESULT_EXT[suite.parser]; if (k !== "txt") insert("INSERT INTO artifacts (run_id, kind, name, path, size) VALUES (?,?,?,?,?)", runId, "results", path.basename(resultsFile), resultsFile, fs.statSync(resultsFile).size); }

  let parsed = [], parseNote = null;
  if (suite.parser === "exit") parsed = [{ file: "", name: suite.name, status: code === 0 ? "passed" : "failed", duration: 0, retries: 0, error: code === 0 ? null : `exit code ${code}` }];
  else if (fs.existsSync(resultsFile)) {
    try { parsed = parseResults(suite.parser, fs.readFileSync(resultsFile, "utf8")); } catch (e) { parseNote = "Could not read results: " + e.message; }
  } else parseNote = `The command finished but wrote no ${suite.parser} results file. Check the command includes the reporter flags.`;

  const tracePaths = [...artIds.keys()].filter((f) => kindOf(f) === "trace");
  for (const t of parsed) {
    let tid = null;
    if (t.trace) { // match by the folder name Playwright put the trace in
      const hit = tracePaths.find((f) => t.trace.endsWith(f) || t.trace.includes(path.dirname(f)));
      if (hit) tid = artIds.get(hit);
    }
    insert("INSERT INTO results (run_id, suite_id, test_key, file, name, status, duration_ms, retries, error, trace_artifact) VALUES (?,?,?,?,?,?,?,?,?,?)",
      runId, suite.id, `${suite.name}::${t.file || ""}::${t.name}`, t.file || "", t.name, t.status, t.duration || 0, t.retries || 0, t.error, tid);
  }
  const c = (s) => parsed.filter((t) => t.status === s).length;
  const counts = { passed: c("passed"), failed: c("failed"), skipped: c("skipped"), total: parsed.length, exit_code: code };
  let status = entry.cancelled ? "cancelled" : entry.timedOut ? "error" : code === 0 && counts.failed === 0 ? "passed" : "failed";
  let error = entry.cancelled ? "Cancelled" : entry.timedOut ? `Timed out after ${suite.timeout_s}s` : parseNote;
  if (status === "failed" && !counts.failed && code !== 0 && !error) error = `Exited with code ${code} before reporting any failing test`;
  finish(runId, entry, { ...counts, status, error });
}

export function cancel(runId) {
  const e = S.live.get(runId);
  if (e) { e.cancelled = true; e.kill?.(); return true; }
  const r = get("SELECT status FROM runs WHERE id=?", runId);
  if (r?.status === "queued") { run("UPDATE runs SET status='cancelled', finished_at=?, error='Cancelled' WHERE id=?", now(), runId); return true; }
  return false;
}

export function recoverOrphans() {
  run("UPDATE runs SET status='error', finished_at=?, error='Server restarted while this run was in progress' WHERE status IN ('running')", now());
  setImmediate(pump);
}

// Scheduler: suites with schedule_min > 0 run on that interval.
export function tickSchedules() {
  for (const s of all("SELECT s.id, s.schedule_min, s.last_scheduled, r.trusted FROM suites s JOIN repos r ON r.id=s.repo_id WHERE s.enabled=1 AND s.schedule_min>0")) {
    if (!s.trusted) continue;
    if (!s.last_scheduled || now() - s.last_scheduled >= s.schedule_min * 60000) {
      const busy = get("SELECT 1 x FROM runs WHERE suite_id=? AND status IN ('queued','running')", s.id);
      run("UPDATE suites SET last_scheduled=? WHERE id=?", now(), s.id);
      if (!busy) enqueue(s.id, { trigger: "schedule" });
    }
  }
}
