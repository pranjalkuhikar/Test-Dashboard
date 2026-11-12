import fs from "node:fs";
import { NextResponse } from "next/server";
import { get } from "@/lib/db";
import { guard } from "@/lib/guard";
import { logPath } from "@/lib/runner";
export async function GET(req, { params }) {
  const g = guard(req); if (g) return g;
  const { id } = await params, off = Math.max(0, +new URL(req.url).searchParams.get("offset") || 0);
  const p = logPath(id);
  let text = "", size = 0;
  if (fs.existsSync(p)) { size = fs.statSync(p).size; const fd = fs.openSync(p, "r"); const len = Math.min(size - off, 400000); if (len > 0) { const buf = Buffer.alloc(len); fs.readSync(fd, buf, 0, len, off); text = buf.toString("utf8"); } fs.closeSync(fd); }
  const r = get("SELECT status FROM runs WHERE id=?", id);
  return NextResponse.json({ text, offset: off + Buffer.byteLength(text), done: !r || !["queued", "running"].includes(r.status) });
}
