import { NextResponse } from "next/server";
import { all, get } from "@/lib/db";

// Distinct tests from every suite's latest finished run. A test that two suites both run (test:all and test:unit) is counted once.
function uniqueCounts(suites) {
  const ids = suites.map((s) => s.done?.id).filter(Boolean);
  if (!ids.length) return { passed: 0, failed: 0, skipped: 0, total: 0 };
  const rank = { failed: 3, skipped: 1, passed: 2 }; const seen = new Map();
  for (const x of all(`SELECT file, name, status FROM results WHERE run_id IN (${ids.map(() => "?").join(",")})`, ...ids)) {
    const k = x.file + "::" + x.name, p = seen.get(k);
    if (!p || rank[x.status] > rank[p]) seen.set(k, x.status);
  }
  const c = { passed: 0, failed: 0, skipped: 0, total: seen.size };
  for (const s of seen.values()) c[s]++;
  return c;
}
import { guard } from "@/lib/guard";

// One call that feeds the whole workspace: every repo, its suites, and each suite's latest (and latest finished) run.
export async function GET(req) {
  const g = guard(req); if (g) return g;
  const cols = "r.id, r.status, r.passed, r.failed, r.skipped, r.total, r.duration_ms, r.queued_at, r.finished_at, r.commit_sha, r.error, r.trigger, e.name AS env_name";
  const repos = all("SELECT * FROM repos ORDER BY created_at DESC, id DESC").map((r) => ({
    ...r,
    suites: all("SELECT id, name, layer, enabled, schedule_min, env_id FROM suites WHERE repo_id=? ORDER BY layer, name", r.id).map((s) => ({
      ...s,
      last: get(`SELECT ${cols} FROM runs r LEFT JOIN envs e ON e.id=r.env_id WHERE r.suite_id=? ORDER BY r.id DESC LIMIT 1`, s.id) || null,
      done: get(`SELECT ${cols} FROM runs r LEFT JOIN envs e ON e.id=r.env_id WHERE r.suite_id=? AND r.status IN ('passed','failed','error','cancelled') ORDER BY r.id DESC LIMIT 1`, s.id) || null,
    })),
  }));
  for (const r of repos) r.uniq = uniqueCounts(r.suites);
  return NextResponse.json({ repos, running: get("SELECT COUNT(*) n FROM runs WHERE status IN ('queued','running')").n });
}
