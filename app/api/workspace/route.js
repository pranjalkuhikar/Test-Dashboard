import { NextResponse } from "next/server";
import { all, get } from "@/lib/db";
import { guard } from "@/lib/guard";

// One call that feeds the whole workspace: every repo, its suites, and each suite's latest (and latest finished) run.
export async function GET(req) {
  const g = guard(req); if (g) return g;
  const cols = "r.id, r.status, r.passed, r.failed, r.skipped, r.total, r.duration_ms, r.queued_at, r.finished_at, r.commit_sha, r.error, r.trigger, e.name AS env_name";
  const repos = all("SELECT * FROM repos ORDER BY kind DESC, name").map((r) => ({
    ...r,
    suites: all("SELECT id, name, layer, enabled, schedule_min, env_id FROM suites WHERE repo_id=? ORDER BY layer, name", r.id).map((s) => ({
      ...s,
      last: get(`SELECT ${cols} FROM runs r LEFT JOIN envs e ON e.id=r.env_id WHERE r.suite_id=? ORDER BY r.id DESC LIMIT 1`, s.id) || null,
      done: get(`SELECT ${cols} FROM runs r LEFT JOIN envs e ON e.id=r.env_id WHERE r.suite_id=? AND r.status IN ('passed','failed','error','cancelled') ORDER BY r.id DESC LIMIT 1`, s.id) || null,
    })),
  }));
  return NextResponse.json({ repos, running: get("SELECT COUNT(*) n FROM runs WHERE status IN ('queued','running')").n });
}
