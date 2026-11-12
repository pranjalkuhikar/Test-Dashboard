import { NextResponse } from "next/server";
import { all, get } from "@/lib/db";
import { guard, fail } from "@/lib/guard";
export async function GET(req, { params }) {
  const g = guard(req); if (g) return g;
  const { id } = await params;
  const run = get(`SELECT r.*, s.name AS suite_name, s.layer, s.parser, p.name AS repo_name, e.name AS env_name FROM runs r JOIN suites s ON s.id=r.suite_id JOIN repos p ON p.id=s.repo_id LEFT JOIN envs e ON e.id=r.env_id WHERE r.id=?`, id);
  if (!run) return fail(404, "Run not found");
  const results = all("SELECT * FROM results WHERE run_id=? ORDER BY CASE status WHEN 'failed' THEN 0 WHEN 'skipped' THEN 2 ELSE 1 END, id", id);
  const artifacts = all("SELECT id, kind, name, size FROM artifacts WHERE run_id=? ORDER BY kind, name", id);
  const prev = get("SELECT id, passed, failed, status FROM runs WHERE suite_id=? AND id<? AND status IN ('passed','failed') ORDER BY id DESC LIMIT 1", run.suite_id, id);
  // a failing test is "new" if it passed in the previous run
  let newlyFailing = [];
  if (prev) { const was = new Map(all("SELECT test_key, status FROM results WHERE run_id=?", prev.id).map((r) => [r.test_key, r.status])); newlyFailing = results.filter((r) => r.status === "failed" && was.get(r.test_key) === "passed").map((r) => r.id); }
  return NextResponse.json({ run, results, artifacts, previous: prev, newlyFailing });
}
