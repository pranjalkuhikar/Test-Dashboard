import { NextResponse } from "next/server";
import { get } from "@/lib/db";
import { guard, fail } from "@/lib/guard";
import { openTrace } from "@/lib/trace";
export async function POST(req, { params }) {
  const g = guard(req); if (g) return g;
  const { id } = await params, a = get("SELECT * FROM artifacts WHERE id=? AND kind='trace'", id);
  if (!a) return fail(404, "Trace not found");
  try { return NextResponse.json({ url: await openTrace(+id, a.path) }); } catch (e) { return fail(500, e.message); }
}
