import { NextResponse } from "next/server";
import { guard } from "@/lib/guard";
import { pyramid, trend, flaky, summary } from "@/lib/stats";
export async function GET(req) {
  const g = guard(req); if (g) return g;
  return NextResponse.json({ summary: summary(), pyramid: pyramid(), trend: trend(14), flaky: flaky() });
}
