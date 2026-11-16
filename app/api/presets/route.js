import { NextResponse } from "next/server";
import { guard } from "@/lib/guard";
import { PRESETS } from "@/lib/presets";
export async function GET(req) { const g = guard(req); if (g) return g; return NextResponse.json({ presets: PRESETS }); }
