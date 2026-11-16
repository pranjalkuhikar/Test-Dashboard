// An interactive, self-contained HTML report for one repo: filters, search, per-test details (errors, attempts,
// screenshots, traces), charts, history, what changed since the last run, and the pyramid analysis.
// Open it in a tab, print it to PDF, or save it (add ?embed=1 to inline screenshots so the file works anywhere).
import fs from "node:fs";
import path from "node:path";
import { all, get, json } from "./db.js";
import { analyzeRepo } from "./analyze.js";
import { flaky } from "./stats.js";
import { logPath } from "./runner.js";

const ASSET = (f) => fs.readFileSync(path.join(process.cwd(), "lib", f), "utf8");
const ansi = (s) => String(s).replace(/\u001b\[[0-9;]*m/g, "");
const keyOf = (n) => String(n).toLowerCase().split(" › ").pop().replace(/^\[[^\]]+\]\s*/, "").trim();
const safeJson = (o) => JSON.stringify(o).replace(/</g, "\\u003c").split(String.fromCharCode(0x2028)).join("\\u2028").split(String.fromCharCode(0x2029)).join("\\u2029"); // safe to put inside a <script> tag
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function logTail(runId, lines = 220) {
  try { return ansi(fs.readFileSync(logPath(runId), "utf8")).split("\n").slice(-lines).join("\n").slice(-30000); } catch { return ""; }
}
function imageUrl(a, embed, budget) {
  const url = `/api/artifacts/${a.id}/file`;
  if (!embed || a.kind !== "screenshot" || a.size > 600_000 || budget.left < a.size) return url;
  try { const buf = fs.readFileSync(a.path); budget.left -= buf.length; return `data:image/${/\.jpe?g$/i.test(a.path) ? "jpeg" : "png"};base64,${buf.toString("base64")}`; } catch { return url; }
}

export function buildReportData(repoId, { embed = false } = {}) {
  const repo = get("SELECT * FROM repos WHERE id=?", repoId);
  if (!repo) return null;
  const budget = { left: 8_000_000 };
  const suites = all("SELECT s.*, e.name AS env_name FROM suites s LEFT JOIN envs e ON e.id=s.env_id WHERE s.repo_id=? ORDER BY s.layer, s.name", repoId).map((s) => ({
    ...s, run: get("SELECT r.*, en.name AS env_name FROM runs r LEFT JOIN envs en ON en.id=r.env_id WHERE r.suite_id=? AND r.status IN ('passed','failed','error','cancelled') ORDER BY r.id DESC LIMIT 1", s.id),
  }));
  const tests = []; let order = 0;
  const suiteRows = suites.map((s) => {
    const r = s.run;
    if (r) {
      const arts = all("SELECT id, kind, name, path, size FROM artifacts WHERE run_id=?", r.id), byId = new Map(arts.map((a) => [a.id, a]));
      for (const x of all("SELECT * FROM results WHERE run_id=? ORDER BY id", r.id)) {
        const d = json(x.detail, null);
        const atts = (d?.attempts || []).flatMap((a) => a.attachments || []).filter((a) => a.artifact && byId.has(a.artifact));
        const shots = atts.filter((a) => a.kind === "screenshot").map((a) => ({ name: a.name, url: imageUrl(byId.get(a.artifact), embed, budget) }));
        const videos = atts.filter((a) => a.kind === "video").map((a) => ({ name: a.name, url: `/api/artifacts/${a.artifact}/file` }));
        if (d) for (const at of d.attempts || []) delete at.attachments; // already turned into shots/videos/trace
        tests.push({ id: x.id, suite: s.name, group: s.name, layer: s.layer, file: x.file || "", name: x.name, status: x.status, ms: x.duration_ms, retries: x.retries, err: x.error, detail: d, trace: x.trace_artifact || null, shots, videos, order: order++ });
      }
    }
    return { id: s.id, name: s.name, layer: s.layer, command: r?.command || s.command, status: r?.status || null, passed: r?.passed || 0, failed: r?.failed || 0, skipped: r?.skipped || 0, total: r?.total || 0, ms: r?.duration_ms || 0, finished: r?.finished_at || r?.queued_at || null, env: r?.env_name || s.env_name || null, trigger: r?.trigger || null, error: r?.error || null, logTail: r ? logTail(r.id) : "" };
  });

  // what the code contains that no run has reported yet
  let analysis = null;
  const ran = new Set(tests.map((t) => keyOf(t.name))), ranList = [...ran], anyRun = suites.some((s) => s.run);
  const wasRun = (n) => { const k = keyOf(n); return ran.has(k) || (anyRun && (/\$\{|%[sdifjoO#]/.test(n) || ranList.some((r) => r.endsWith(k) || k.endsWith(r)))); };
  try {
    const a = analyzeRepo(repo.path);
    for (const f of a.inventory) {
      const miss = f.names.filter((n) => !wasRun(n));
      for (const n of miss) tests.push({ id: 900000000 + order, suite: f.file, group: `Not run yet · ${f.file}`, layer: f.layer, file: f.file, name: n, status: "notrun", ms: null, retries: 0, err: null, detail: null, trace: null, shots: [], videos: [], order: order++ });
    }
    const { inventory, topFiles, ...rest } = a; analysis = rest;
  } catch {}

  // history of this repo's runs, and what changed since the previous run of each suite
  const trend = all(`SELECT r.id, r.queued_at t, r.status, r.passed, r.failed, s.name suite FROM runs r JOIN suites s ON s.id=r.suite_id WHERE s.repo_id=? AND r.status IN ('passed','failed','error') ORDER BY r.id DESC LIMIT 40`, repoId).reverse();
  const changes = { compared: false, newFail: [], fixed: [], added: [], removed: [] };
  for (const s of suites) {
    if (!s.run) continue;
    const prev = get("SELECT id FROM runs WHERE suite_id=? AND id<? AND status IN ('passed','failed','error') ORDER BY id DESC LIMIT 1", s.id, s.run.id);
    if (!prev) continue;
    changes.compared = true;
    const before = new Map(all("SELECT test_key, name, status FROM results WHERE run_id=?", prev.id).map((x) => [x.test_key, x]));
    const now = new Map(all("SELECT id, test_key, name, status FROM results WHERE run_id=?", s.run.id).map((x) => [x.test_key, x]));
    for (const [k, x] of now) { const p = before.get(k); if (!p) changes.added.push({ id: x.id, name: x.name }); else if (x.status === "failed" && p.status === "passed") changes.newFail.push({ id: x.id, name: x.name }); else if (x.status === "passed" && p.status === "failed") changes.fixed.push({ id: x.id, name: x.name }); }
    for (const [k, p] of before) if (!now.has(k)) changes.removed.push({ name: p.name });
  }

  const ranSuites = suiteRows.filter((s) => s.status);
  const failed = tests.filter((t) => t.status === "failed").length;
  const verdict = !ranSuites.length ? ["idle", "Not run yet"] : failed || ranSuites.some((s) => s.status !== "passed") ? ["bad", "Failing"] : ["good", "All passing"];
  return {
    repo: { name: repo.name, url: repo.url, path: repo.path, commit: repo.last_commit }, generated: Date.now(), verdict,
    totals: { ran: ranSuites.length, ms: ranSuites.reduce((a, s) => a + s.ms, 0) }, suites: suiteRows, tests, trend, changes, analysis,
    flaky: flaky(60).filter((f) => String(f.repo_id) === String(repoId)).map((f) => ({ name: f.name, stability: f.stability, flips: f.flips })),
  };
}

export function renderReport(repoId, nonce = "", opts = {}) {
  const data = buildReportData(repoId, opts);
  if (!data) return null;
  const n = nonce ? ` nonce="${nonce}"` : "";
  return `<!doctype html><html lang="en" data-theme="dark"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(data.repo.name)} · Test report</title><link rel="icon" href="data:,">
<script${n}>try{var t=localStorage.getItem("rep.theme");if(t)document.documentElement.setAttribute("data-theme",t)}catch(e){}</script>
<style>${ASSET("report.css")}</style></head><body>
<div class="hdr" id="top"></div><div class="tools" id="tools"></div>
<div class="wrap"><div id="hero"></div><div id="charts"></div><div id="changes"></div><div id="explorerHost"></div><div id="analysis"></div>
<div class="foot">Test Dashboard · static analysis never runs your code; test runs happen only for repos you marked as trusted.</div></div>
<div class="lb" id="lb"><img id="lbimg" alt=""></div><div class="toast" id="toast"></div>
<noscript><div class="wrap"><p>This report needs JavaScript to display.</p></div></noscript>
<script type="application/json" id="data">${safeJson(data)}</script>
<script${n}>${ASSET("report-client.js")}</script></body></html>`;
}
