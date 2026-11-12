import { NextResponse } from "next/server";
import { get } from "@/lib/db";
import { guard, fail, body } from "@/lib/guard";
import { enqueue } from "@/lib/runner";
export async function POST(req, { params }) {
  const g = guard(req); if (g) return g;
  const { id } = await params, b = await body(req);
  if (!get("SELECT 1 x FROM suites WHERE id=?", id)) return fail(404, "Not found");
  return NextResponse.json({ run_id: enqueue(+id, { envId: b.env_id || null }) });
}
