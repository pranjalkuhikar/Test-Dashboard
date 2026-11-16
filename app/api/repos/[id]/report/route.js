import { guard, fail } from "@/lib/guard";
import { renderReport } from "@/lib/report";
export async function GET(req, { params }) {
  const g = guard(req); if (g) return g;
  const { id } = await params;
  const html = renderReport(id);
  if (!html) return fail(404, "Not found");
  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8", "x-content-type-options": "nosniff", "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; img-src data:" } });
}
