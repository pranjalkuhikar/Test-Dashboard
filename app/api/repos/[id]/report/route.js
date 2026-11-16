import { guard, fail } from "@/lib/guard";
import crypto from "node:crypto";
import { renderReport } from "@/lib/report";
export async function GET(req, { params }) {
  const g = guard(req); if (g) return g;
  const { id } = await params;
  const nonce = crypto.randomBytes(16).toString("base64");
  const html = renderReport(id, nonce, { embed: new URL(req.url).searchParams.get("embed") === "1" });
  if (!html) return fail(404, "Not found");
  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8", "x-content-type-options": "nosniff", "content-security-policy": `default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}'; img-src 'self' data:; media-src 'self'; connect-src 'self'; font-src 'self'` } });
}
