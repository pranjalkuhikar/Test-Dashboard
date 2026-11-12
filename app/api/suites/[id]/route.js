import { NextResponse } from "next/server";
import { get, run } from "@/lib/db";
import { guard, fail, body } from "@/lib/guard";
const COLS = { name: String, layer: String, cwd: String, setup: String, command: String, parser: String, env_id: (v) => v || null, timeout_s: (v) => Math.min(3600, Math.max(5, +v || 600)), schedule_min: (v) => Math.max(0, +v || 0), enabled: (v) => (v ? 1 : 0), trace: String, results_file: String, extra_env: (v) => JSON.stringify(v || {}) };
export async function PATCH(req, { params }) {
  const g = guard(req); if (g) return g;
  const { id } = await params, b = await body(req);
  if (!get("SELECT 1 x FROM suites WHERE id=?", id)) return fail(404, "Not found");
  for (const [k, f] of Object.entries(COLS)) if (b[k] !== undefined) run(`UPDATE suites SET ${k}=? WHERE id=?`, f(b[k]), id);
  return NextResponse.json({ ok: true });
}
export async function DELETE(req, { params }) {
  const g = guard(req); if (g) return g;
  const { id } = await params; run("DELETE FROM suites WHERE id=?", id);
  return NextResponse.json({ ok: true });
}
