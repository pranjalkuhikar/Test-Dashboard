import { NextResponse } from "next/server";
import { guard } from "@/lib/guard";
import { cancel } from "@/lib/runner";
export async function POST(req, { params }) {
  const g = guard(req); if (g) return g;
  const { id } = await params;
  return NextResponse.json({ cancelled: cancel(+id) });
}
