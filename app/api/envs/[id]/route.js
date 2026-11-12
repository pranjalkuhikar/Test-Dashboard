import { NextResponse } from "next/server";
import { get, run, json } from "@/lib/db";
import { guard, fail, body } from "@/lib/guard";
export async function PATCH(req, { params }) {
  const g = guard(req); if (g) return g;
  const { id } = await params, b = await body(req), e = get("SELECT * FROM envs WHERE id=?", id);
  if (!e) return fail(404, "Not found");
  const old = json(e.vars), next = {};
  for (const [k, v] of Object.entries(b.vars || {})) if (k.trim()) next[k.trim()] = v === "•••" ? old[k] ?? "" : String(v); // masked values stay as stored
  run("UPDATE envs SET vars=? WHERE id=?", JSON.stringify(next), id);
  return NextResponse.json({ ok: true });
}
export async function DELETE(req, { params }) {
  const g = guard(req); if (g) return g;
  const { id } = await params; run("DELETE FROM envs WHERE id=?", id);
  return NextResponse.json({ ok: true });
}
