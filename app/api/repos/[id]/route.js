import { NextResponse } from "next/server";
import fs from "node:fs";
import { get, run } from "@/lib/db";
import { guard, fail, body } from "@/lib/guard";
import { REPOS_DIR } from "@/lib/git";

export async function PATCH(req, { params }) {
  const g = guard(req); if (g) return g;
  const { id } = await params, b = await body(req);
  if (!get("SELECT 1 x FROM repos WHERE id=?", id)) return fail(404, "Not found");
  if (b.trusted !== undefined) run("UPDATE repos SET trusted=? WHERE id=?", b.trusted ? 1 : 0, id);
  if (b.kind) run("UPDATE repos SET kind=? WHERE id=?", b.kind === "app" ? "app" : "tests", id);
  return NextResponse.json({ ok: true });
}
export async function DELETE(req, { params }) {
  const g = guard(req); if (g) return g;
  const { id } = await params, r = get("SELECT * FROM repos WHERE id=?", id);
  if (!r) return fail(404, "Not found");
  run("DELETE FROM repos WHERE id=?", id);
  if (r.source === "git" && r.path.startsWith(REPOS_DIR)) fs.rmSync(r.path, { recursive: true, force: true }); // only our own clones, never a user's folder
  return NextResponse.json({ ok: true });
}
