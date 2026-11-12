import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { all, get, insert, now } from "@/lib/db";
import { guard, fail, body } from "@/lib/guard";
import { syncRepo, REPOS_DIR } from "@/lib/git";

export async function GET(req) {
  const g = guard(req); if (g) return g;
  const repos = all("SELECT * FROM repos ORDER BY kind DESC, name").map((r) => ({ ...r, suites: get("SELECT COUNT(*) n FROM suites WHERE repo_id=?", r.id).n }));
  return NextResponse.json({ repos });
}
export async function POST(req) {
  const g = guard(req); if (g) return g;
  const b = await body(req);
  const name = String(b.name || "").trim();
  if (!/^[\w .-]{1,60}$/.test(name)) return fail(400, "Give the repo a short name (letters, numbers, space, dot, dash)");
  if (get("SELECT 1 x FROM repos WHERE name=?", name)) return fail(409, "A repo with that name already exists");
  const kind = b.kind === "app" ? "app" : "tests", source = b.source === "git" ? "git" : "local";
  let p, url = null;
  if (source === "git") { url = String(b.url || "").trim(); p = path.join(REPOS_DIR, name.replace(/[^\w.-]/g, "_")); }
  else { p = path.resolve(String(b.path || "").replace(/^~(?=\/)/, process.env.HOME)); }
  if (source === "local" && (!fs.existsSync(p) || !fs.statSync(p).isDirectory())) return fail(400, "Folder not found: " + p);
  const id = insert("INSERT INTO repos (name, kind, source, path, url, branch, trusted, created_at) VALUES (?,?,?,?,?,?,?,?)", name, kind, source, p, url, b.branch || null, b.trusted ? 1 : 0, now());
  const sync = await syncRepo(get("SELECT * FROM repos WHERE id=?", id));
  const { run } = await import("@/lib/db");
  run("UPDATE repos SET last_sync_at=?, last_commit=?, last_error=? WHERE id=?", now(), sync.commit || null, sync.error || null, id);
  return NextResponse.json({ id, error: sync.error || null }, { status: 201 });
}
