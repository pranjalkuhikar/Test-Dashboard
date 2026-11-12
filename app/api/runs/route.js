import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { all, get } from "@/lib/db";
import { guard, fail, body } from "@/lib/guard";
import { enqueue } from "@/lib/runner";

export async function GET(req) {
  const g = guard(req); if (g) return g;
  const u = new URL(req.url), suite = u.searchParams.get("suite"), limit = Math.min(200, +u.searchParams.get("limit") || 40);
  const runs = all(`SELECT r.*, s.name AS suite_name, s.layer, p.name AS repo_name, e.name AS env_name FROM runs r JOIN suites s ON s.id=r.suite_id JOIN repos p ON p.id=s.repo_id LEFT JOIN envs e ON e.id=r.env_id
    ${suite ? "WHERE r.suite_id=?" : ""} ORDER BY r.id DESC LIMIT ${limit}`, ...(suite ? [suite] : []));
  return NextResponse.json({ runs });
}
// Start several suites at once (a "batch"), e.g. the whole pyramid or one layer.
export async function POST(req) {
  const g = guard(req); if (g) return g;
  const b = await body(req);
  let ids = (b.suite_ids || []).map(Number);
  if (b.layer) ids = all("SELECT id FROM suites WHERE layer=? AND enabled=1", b.layer).map((s) => s.id);
  if (Array.isArray(b.repo_ids)) ids = all(`SELECT id FROM suites WHERE enabled=1 AND repo_id IN (${b.repo_ids.map(() => "?").join(",") || "NULL"}) ORDER BY CASE layer WHEN 'unit' THEN 0 WHEN 'integration' THEN 1 WHEN 'contract' THEN 2 WHEN 'pact' THEN 3 ELSE 4 END`, ...b.repo_ids.map(Number)).map((s) => s.id);
  if (b.all) ids = all("SELECT id FROM suites WHERE enabled=1 ORDER BY CASE layer WHEN 'unit' THEN 0 WHEN 'integration' THEN 1 WHEN 'contract' THEN 2 WHEN 'pact' THEN 3 ELSE 4 END").map((s) => s.id);
  ids = ids.filter((id) => get("SELECT 1 x FROM suites WHERE id=?", id));
  if (!ids.length) return fail(400, "No suites to run");
  const batch = crypto.randomUUID().slice(0, 8);
  return NextResponse.json({ batch, run_ids: ids.map((id) => enqueue(id, { batchId: batch, envId: b.env_id || null })) });
}
