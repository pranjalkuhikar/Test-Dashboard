import { NextResponse } from "next/server";
import { all, get, insert, now, json } from "@/lib/db";
import { guard, fail, body } from "@/lib/guard";
const SECRET = /token|secret|password|key|auth|cookie/i; // route files may only export handlers
const mask = (vars) => Object.fromEntries(Object.entries(vars).map(([k, v]) => [k, SECRET.test(k) ? "•••" : v]));
export async function GET(req) {
  const g = guard(req); if (g) return g;
  return NextResponse.json({ envs: all("SELECT * FROM envs ORDER BY name").map((e) => ({ ...e, vars: mask(json(e.vars)) })) });
}
export async function POST(req) {
  const g = guard(req); if (g) return g;
  const b = await body(req), name = String(b.name || "").trim();
  if (!name) return fail(400, "Give the environment a name");
  if (get("SELECT 1 x FROM envs WHERE name=?", name)) return fail(409, "That environment already exists");
  return NextResponse.json({ id: insert("INSERT INTO envs (name, vars, created_at) VALUES (?,?,?)", name, JSON.stringify(b.vars || {}), now()) }, { status: 201 });
}
