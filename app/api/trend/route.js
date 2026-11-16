import { NextResponse } from "next/server";
import { all } from "@/lib/db";
import { guard, fail } from "@/lib/guard";

// Test results over a time range, for the chart on the dashboard.
//   GET /api/trend?from=<ms>&to=<ms>&repos=1,2
// Ranges up to ~2 days are returned per hour; longer ones per day (in the computer's own time zone).
const HOUR = 3600e3, DAY = 86400e3;
export async function GET(req) {
  const g = guard(req); if (g) return g;
  const q = new URL(req.url).searchParams;
  const from = Number(q.get("from")), to = Number(q.get("to"));
  if (!Number.isFinite(from) || !Number.isFinite(to) || from >= to) return fail(400, "Pick a start that is before the end");
  if (to - from > 400 * DAY) return fail(400, "That range is too long (the limit is about 13 months)");
  const repos = (q.get("repos") || "").split(",").map(Number).filter((n) => Number.isInteger(n) && n > 0);
  const hourly = to - from <= 49 * HOUR;

  const rows = repos.length ? all(
    `SELECT r.finished_at t, r.passed, r.failed, r.skipped, r.status FROM runs r JOIN suites s ON s.id = r.suite_id
      WHERE r.finished_at BETWEEN ? AND ? AND r.status IN ('passed','failed','error') AND s.repo_id IN (${repos.map(() => "?").join(",")})`, from, to, ...repos) : [];

  const floor = (t) => { const d = new Date(t); if (hourly) d.setMinutes(0, 0, 0); else d.setHours(0, 0, 0, 0); return d.getTime(); };
  const next = (t) => { const d = new Date(t); if (hourly) d.setHours(d.getHours() + 1); else d.setDate(d.getDate() + 1); return d.getTime(); }; // calendar-safe across daylight saving
  const points = []; const idx = new Map();
  for (let t = floor(from); t <= to; t = next(t)) { idx.set(t, points.length); points.push({ t, passed: 0, failed: 0, skipped: 0, runs: 0 }); }
  const sum = { passed: 0, failed: 0, skipped: 0, runs: 0, failedRuns: 0 };
  for (const r of rows) {
    const p = points[idx.get(floor(r.t))]; if (!p) continue;
    p.passed += r.passed; p.failed += r.failed; p.skipped += r.skipped; p.runs++;
    sum.passed += r.passed; sum.failed += r.failed; sum.skipped += r.skipped; sum.runs++; if (r.status !== "passed") sum.failedRuns++;
  }
  return NextResponse.json({ bucket: hourly ? "hour" : "day", points, summary: sum });
}
