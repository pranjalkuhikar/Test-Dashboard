import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { all, run, now } from "@/lib/db";
import { guard, fail, body } from "@/lib/guard";
export async function GET(req) { const g = guard(req); if (g) return g; return NextResponse.json({ hooks: all("SELECT * FROM hooks ORDER BY created_at DESC") }); }
export async function POST(req) {
  const g = guard(req); if (g) return g;
  const b = await body(req); if (!b.name) return fail(400, "Name the webhook");
  const token = crypto.randomBytes(18).toString("base64url");
  run("INSERT INTO hooks (token, name, suite_ids, env_id, created_at) VALUES (?,?,?,?,?)", token, String(b.name).slice(0, 60), JSON.stringify((b.suite_ids || []).map(Number)), b.env_id || null, now());
  return NextResponse.json({ token }, { status: 201 });
}
export async function DELETE(req) { const g = guard(req); if (g) return g; run("DELETE FROM hooks WHERE token=?", new URL(req.url).searchParams.get("token")); return NextResponse.json({ ok: true }); }
