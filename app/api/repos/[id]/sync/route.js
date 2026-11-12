import { NextResponse } from "next/server";
import { get, run, now } from "@/lib/db";
import { guard, fail } from "@/lib/guard";
import { syncRepo } from "@/lib/git";
export async function POST(req, { params }) {
  const g = guard(req); if (g) return g;
  const { id } = await params, r = get("SELECT * FROM repos WHERE id=?", id);
  if (!r) return fail(404, "Not found");
  const s = await syncRepo(r);
  run("UPDATE repos SET last_sync_at=?, last_commit=?, last_error=? WHERE id=?", now(), s.commit || r.last_commit, s.error || null, id);
  return NextResponse.json(s);
}
