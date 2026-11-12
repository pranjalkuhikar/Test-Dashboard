import { NextResponse } from "next/server";
import { all, get, insert, now } from "@/lib/db";
import { guard, fail, body } from "@/lib/guard";
import { LAYERS } from "@/lib/stats";

export async function GET(req) {
  const g = guard(req); if (g) return g;
  const suites = all(`SELECT s.*, r.name AS repo_name, r.trusted,
    (SELECT status FROM runs WHERE suite_id=s.id ORDER BY id DESC LIMIT 1) AS last_status,
    (SELECT id FROM runs WHERE suite_id=s.id ORDER BY id DESC LIMIT 1) AS last_run_id,
    (SELECT passed||'/'||total FROM runs WHERE suite_id=s.id AND status IN ('passed','failed') ORDER BY id DESC LIMIT 1) AS last_counts,
    (SELECT duration_ms FROM runs WHERE suite_id=s.id AND status IN ('passed','failed') ORDER BY id DESC LIMIT 1) AS last_ms
    FROM suites s JOIN repos r ON r.id=s.repo_id ORDER BY s.layer, s.name`);
  return NextResponse.json({ suites, layers: LAYERS });
}
export async function POST(req) {
  const g = guard(req); if (g) return g;
  const b = await body(req);
  if (!b.name || !b.command || !get("SELECT 1 x FROM repos WHERE id=?", b.repo_id)) return fail(400, "A suite needs a repo, a name and a command");
  if (get("SELECT 1 x FROM suites WHERE repo_id=? AND name=?", b.repo_id, b.name)) return fail(409, "That repo already has a suite with this name");
  const id = insert("INSERT INTO suites (name, repo_id, layer, cwd, setup, command, parser, env_id, extra_env, timeout_s, schedule_min, trace, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
    b.name, b.repo_id, b.layer || "unit", b.cwd || ".", b.setup || "", b.command, b.parser || "exit", b.env_id || null, JSON.stringify(b.extra_env || {}), Math.min(3600, Math.max(5, +b.timeout_s || 600)), Math.max(0, +b.schedule_min || 0), b.trace || "", now());
  return NextResponse.json({ id }, { status: 201 });
}
