import fs from "node:fs";
import path from "node:path";
import { get } from "@/lib/db";
import { guard, fail } from "@/lib/guard";
import { DATA } from "@/lib/db";
const TYPES = { ".png": "image/png", ".jpg": "image/jpeg", ".webm": "video/webm", ".mp4": "video/mp4", ".html": "text/plain", ".json": "application/json", ".xml": "text/xml", ".txt": "text/plain", ".zip": "application/zip" };
export async function GET(req, { params }) {
  const g = guard(req); if (g) return g;
  const { id } = await params, a = get("SELECT * FROM artifacts WHERE id=?", id);
  if (!a || !path.resolve(a.path).startsWith(path.join(DATA, "runs") + path.sep) || !fs.existsSync(a.path)) return fail(404, "Not found");
  const ext = path.extname(a.path).toLowerCase();
  return new Response(fs.readFileSync(a.path), { headers: { "content-type": TYPES[ext] || "application/octet-stream", "content-disposition": `${ext === ".zip" ? "attachment" : "inline"}; filename="${path.basename(a.path)}"`, "x-content-type-options": "nosniff" } });
}
