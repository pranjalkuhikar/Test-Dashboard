import { NextResponse } from "next/server";
import { get, all } from "@/lib/db";
import { guard, fail } from "@/lib/guard";
import { discoverSuites } from "@/lib/discover";
export async function GET(req, { params }) {
  const g = guard(req); if (g) return g;
  const { id } = await params, r = get("SELECT * FROM repos WHERE id=?", id);
  if (!r) return fail(404, "Not found");
  const have = new Set(all("SELECT name FROM suites WHERE repo_id=?", id).map((s) => s.name));
  return NextResponse.json({ found: discoverSuites(r.path).map((s) => ({ ...s, exists: have.has(s.name) })) });
}
