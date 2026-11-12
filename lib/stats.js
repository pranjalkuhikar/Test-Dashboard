import { all, get, now } from "./db.js";

export const LAYERS = ["unit", "integration", "contract", "pact", "e2e", "smoke", "a11y", "perf", "visual", "security"];
const DAY = 86400000;

// Latest finished run per suite, rolled up per layer (the "testing pyramid").
export function pyramid() {
  const rows = all(`SELECT s.id, s.name, s.layer, s.enabled,
    (SELECT id FROM runs WHERE suite_id=s.id AND status IN ('passed','failed','error') ORDER BY id DESC LIMIT 1) AS run_id FROM suites s`);
  const layers = {};
  for (const l of LAYERS) layers[l] = { layer: l, suites: 0, tests: 0, passed: 0, failed: 0, skipped: 0, neverRun: 0, failingSuites: 0, avgMs: 0, passRate: null };
  for (const s of rows) {
    const L = (layers[s.layer] ||= { layer: s.layer, suites: 0, tests: 0, passed: 0, failed: 0, skipped: 0, neverRun: 0, failingSuites: 0, avgMs: 0, passRate: null });
    L.suites++;
    if (!s.run_id) { L.neverRun++; continue; }
    const r = get("SELECT * FROM runs WHERE id=?", s.run_id);
    L.tests += r.total; L.passed += r.passed; L.failed += r.failed; L.skipped += r.skipped; L.avgMs += r.duration_ms || 0;
    if (r.status !== "passed") L.failingSuites++;
  }
  for (const L of Object.values(layers)) {
    const ran = L.suites - L.neverRun;
    L.avgMs = ran ? Math.round(L.avgMs / ran) : 0;
    L.passRate = L.passed + L.failed ? Math.round((L.passed / (L.passed + L.failed)) * 1000) / 10 : null;
  }
  return Object.values(layers).filter((l) => l.suites > 0 || LAYERS.slice(0, 5).includes(l.layer));
}

export function trend(days = 14) {
  const from = now() - days * DAY;
  const rows = all("SELECT queued_at, status, passed, failed, skipped FROM runs WHERE queued_at>=? AND status IN ('passed','failed','error')", from);
  const out = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now() - i * DAY); d.setHours(0, 0, 0, 0);
    const a = d.getTime(), b = a + DAY, day = rows.filter((r) => r.queued_at >= a && r.queued_at < b);
    out.push({ date: a, runs: day.length, green: day.filter((r) => r.status === "passed").length, red: day.filter((r) => r.status !== "passed").length, passed: day.reduce((x, r) => x + r.passed, 0), failed: day.reduce((x, r) => x + r.failed, 0) });
  }
  return out;
}

// Allure TestOps style: a test is flaky when its status flips 3+ times within its last 10 executions.
// Also reported: stability % (passes / executions) and whether it ever passed only after a retry.
export function flaky(limit = 25) {
  const keys = all("SELECT test_key, MAX(suite_id) suite_id, COUNT(*) n FROM results GROUP BY test_key HAVING n>=3");
  const out = [];
  for (const k of keys) {
    const h = all("SELECT run_id, status, retries, error, name FROM results WHERE test_key=? AND status!='skipped' ORDER BY run_id DESC LIMIT 10", k.test_key).reverse();
    if (h.length < 3) continue;
    let flips = 0; for (let i = 1; i < h.length; i++) if (h[i].status !== h[i - 1].status) flips++;
    const retryPasses = h.filter((x) => x.status === "passed" && x.retries > 0).length;
    const passes = h.filter((x) => x.status === "passed").length;
    if (flips >= 3 || retryPasses > 0) {
      const sName = get("SELECT name, layer, repo_id FROM suites WHERE id=?", k.suite_id);
      out.push({ key: k.test_key, name: h[h.length - 1].name, suite: sName?.name, layer: sName?.layer, repo_id: sName?.repo_id, flips, retryPasses, stability: Math.round((passes / h.length) * 100), history: h.map((x) => x.status === "passed" ? "p" : "f"), lastError: [...h].reverse().find((x) => x.error)?.error || null });
    }
  }
  return out.sort((a, b) => b.flips - a.flips || a.stability - b.stability).slice(0, limit);
}

export function summary() {
  const week = now() - 7 * DAY;
  const r = get("SELECT COUNT(*) runs, SUM(status='passed') green, SUM(status IN ('failed','error')) red, AVG(duration_ms) avgMs FROM runs WHERE queued_at>=? AND status IN ('passed','failed','error')", week);
  return {
    repos: get("SELECT COUNT(*) n FROM repos").n, suites: get("SELECT COUNT(*) n FROM suites").n,
    running: get("SELECT COUNT(*) n FROM runs WHERE status IN ('queued','running')").n,
    weekRuns: r.runs || 0, weekGreen: r.green || 0, weekRed: r.red || 0, avgMs: Math.round(r.avgMs || 0),
    greenRate: r.runs ? Math.round(((r.green || 0) / r.runs) * 100) : null,
  };
}
