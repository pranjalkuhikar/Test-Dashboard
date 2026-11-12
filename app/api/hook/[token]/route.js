// Webhook trigger for CI / git hooks:  curl -X POST http://localhost:5200/api/hook/<token>
// The token is the credential, so this route is not subject to the browser Origin check, but it only ever runs suites that were chosen when the hook was created.
import { NextResponse } from "next/server";
import { get } from "@/lib/db";
import { json } from "@/lib/db";
import { enqueue } from "@/lib/runner";
export async function POST(req, { params }) {
  const { token } = await params, h = get("SELECT * FROM hooks WHERE token=?", token);
  if (!h) return new NextResponse("Not found", { status: 404 });
  const batch = "hook-" + h.name.replace(/\W/g, "").slice(0, 12);
  const ids = json(h.suite_ids, []).filter((id) => get("SELECT 1 x FROM suites WHERE id=?", id));
  return NextResponse.json({ run_ids: ids.map((id) => enqueue(id, { trigger: "webhook:" + h.name, batchId: batch, envId: h.env_id })) });
}
