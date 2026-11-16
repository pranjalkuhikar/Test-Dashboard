import { NextResponse } from "next/server";
import { get, insert, now } from "@/lib/db";
import { guard, fail, body } from "@/lib/guard";
export async function POST(req, { params }) {
  const g = guard(req); if (g) return g;
  const { id } = await params, b = await body(req);
  if (!get("SELECT 1 x FROM repos WHERE id=?", id)) return fail(404, "Not found");
  let added = 0;
  for (const s of b.suites || []) {
    if (get("SELECT 1 x FROM suites WHERE repo_id=? AND name=?", id, s.name)) continue;
    insert("INSERT INTO suites (name, repo_id, layer, cwd, setup, command, parser, trace, enabled, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)", s.name, id, s.layer || "unit", s.cwd || ".", s.setup || "", s.command, s.parser || "exit", s.trace || "", s.optional ? 0 : 1, now());
    added++;
  }
  return NextResponse.json({ added });
}
