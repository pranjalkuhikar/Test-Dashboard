// A self-contained HTML report for one repo: open it in a tab, print it to PDF, or save it and send it to someone.
import { all, get } from "./db.js";
import { analyzeRepo } from "./analyze.js";
import { flaky } from "./stats.js";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const ms = (n) => (n == null ? "-" : n < 1000 ? `${n} ms` : n < 60000 ? `${(n / 1000).toFixed(1)} s` : `${Math.floor(n / 60000)}m ${Math.round((n % 60000) / 1000)}s`);
const NAMES = { unit: "Unit", component: "Component", integration: "Integration", contract: "Contract", pact: "Pact", e2e: "End-to-end", smoke: "Smoke", a11y: "Accessibility", perf: "Performance", visual: "Visual", security: "Security" };
const COLOR = { unit: "#38bdf8", component: "#22d3ee", integration: "#a78bfa", contract: "#f472b6", pact: "#fb923c", e2e: "#34d399", smoke: "#facc15", a11y: "#60a5fa", perf: "#f87171", visual: "#c084fc", security: "#fb7185" };

function donut(pass, fail, skip) {
  const total = pass + fail + skip || 1, R = 70, C = 2 * Math.PI * R;
  let off = 0; const seg = (n, color) => { const len = (n / total) * C; const s = `<circle r="${R}" cx="90" cy="90" fill="none" stroke="${color}" stroke-width="20" stroke-dasharray="${len} ${C - len}" stroke-dashoffset="${-off}" transform="rotate(-90 90 90)"/>`; off += len; return n ? s : ""; };
  const pct = pass + fail ? Math.round((pass / (pass + fail)) * 100) : 0;
  return `<svg viewBox="0 0 180 180" class="donut"><circle r="${R}" cx="90" cy="90" fill="none" stroke="#1b2442" stroke-width="20"/>${seg(pass, "#34d399")}${seg(fail, "#f87171")}${seg(skip, "#64748b")}
    <text x="90" y="88" text-anchor="middle" class="dn">${pass + fail ? pct + "%" : "-"}</text><text x="90" y="110" text-anchor="middle" class="dl">passing</text></svg>`;
}
const ring = (v) => { const R = 34, C = 2 * Math.PI * R, len = (v / 100) * C, col = v >= 75 ? "#34d399" : v >= 40 ? "#facc15" : "#f87171"; return `<svg viewBox="0 0 80 80" class="ring"><circle r="${R}" cx="40" cy="40" fill="none" stroke="#1b2442" stroke-width="8"/><circle r="${R}" cx="40" cy="40" fill="none" stroke="${col}" stroke-width="8" stroke-linecap="round" stroke-dasharray="${len} ${C}" transform="rotate(-90 40 40)"/><text x="40" y="46" text-anchor="middle" class="rn">${v}</text></svg>`; };

export function renderReport(repoId) {
  const repo = get("SELECT * FROM repos WHERE id=?", repoId);
  if (!repo) return null;
  const suites = all("SELECT * FROM suites WHERE repo_id=? ORDER BY layer, name", repoId).map((s) => ({
    ...s, run: get("SELECT * FROM runs WHERE suite_id=? AND status IN ('passed','failed','error','cancelled') ORDER BY id DESC LIMIT 1", s.id),
  }));
  const runs = suites.filter((s) => s.run);
  const passed = runs.reduce((a, s) => a + s.run.passed, 0), failed = runs.reduce((a, s) => a + s.run.failed, 0), skipped = runs.reduce((a, s) => a + s.run.skipped, 0);
  const dur = runs.reduce((a, s) => a + (s.run.duration_ms || 0), 0);
  const results = runs.flatMap((s) => all("SELECT * FROM results WHERE run_id=?", s.run.id).map((r) => ({ ...r, suite: s.name, layer: s.layer })));
  const failures = results.filter((r) => r.status === "failed");
  const slow = [...results].sort((a, b) => b.duration_ms - a.duration_ms).slice(0, 8);
  const fl = flaky(50).filter((f) => String(f.repo_id) === String(repoId));
  let a = null; try { a = analyzeRepo(repo.path); } catch {}
  const byLayer = {}; for (const s of suites) { const L = (byLayer[s.layer] ||= { pass: 0, fail: 0, skip: 0, ms: 0, suites: 0, ran: 0 }); L.suites++; if (s.run) { L.ran++; L.pass += s.run.passed; L.fail += s.run.failed; L.skip += s.run.skipped; L.ms += s.run.duration_ms || 0; } }
  const verdict = !runs.length ? ["idle", "Not run yet"] : failed || runs.some((s) => s.run.status !== "passed") ? ["bad", "Failing"] : ["good", "All passing"];

  const layerRows = Object.entries(byLayer).map(([l, v]) => { const t = v.pass + v.fail || 1; return `<div class="lrow"><div class="lname"><i style="background:${COLOR[l] || "#94a3b8"}"></i>${esc(NAMES[l] || l)}</div>
    <div class="track"><b style="width:${(v.pass / t) * 100}%;background:#34d399"></b><b style="width:${(v.fail / t) * 100}%;background:#f87171"></b></div>
    <div class="lnum">${v.ran ? `<strong>${v.pass}</strong>/${v.pass + v.fail}` : "not run"}</div><div class="lms">${v.ran ? ms(v.ms) : ""}</div></div>`; }).join("");

  const cover = a ? a.layers.map((r) => { const pct = r.suggested ? Math.min(100, (r.found / r.suggested) * 100) : 100; return `<div class="lrow"><div class="lname"><i style="background:${COLOR[r.layer] || "#94a3b8"}"></i>${esc(NAMES[r.layer] || r.layer)}</div>
    <div class="track"><b style="width:${pct}%;background:${pct >= 100 ? "#34d399" : pct >= 40 ? "#facc15" : "#f87171"}"></b></div><div class="lnum"><strong>${r.found}</strong>${r.suggested ? ` / ${r.suggested} suggested` : ""}</div><div class="lms">${r.files} file${r.files === 1 ? "" : "s"}</div></div>`; }).join("") : "";

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(repo.name)} · Test report</title><style>
:root{--bg:#0a0f1f;--card:#111936;--line:#243055;--ink:#e8edfb;--mut:#8f9bc0;--ok:#34d399;--bad:#f87171;color-scheme:dark}
*{box-sizing:border-box}body{margin:0;background:radial-gradient(1100px 500px at 15% -10%,#1d2a63 0,transparent 60%),radial-gradient(900px 500px at 100% 0,#0e4a4a55 0,transparent 55%),var(--bg);color:var(--ink);font:15px/1.55 ui-sans-serif,-apple-system,"Segoe UI",Inter,system-ui,sans-serif}
.wrap{max-width:1000px;margin:0 auto;padding:36px 22px 70px}.top{display:flex;justify-content:space-between;align-items:center;color:var(--mut);font-size:13px}.brand{display:flex;gap:9px;align-items:center;color:var(--ink);font-weight:700}.logo{width:26px;height:26px;border-radius:8px;background:linear-gradient(135deg,#14b8a6,#6366f1);display:grid;place-items:center;font-size:14px}
h1{font-size:34px;margin:22px 0 4px;letter-spacing:-.5px}h2{font-size:13px;text-transform:uppercase;letter-spacing:.9px;color:var(--mut);margin:0 0 14px}.sub{color:var(--mut);word-break:break-all}
.badge{display:inline-block;padding:3px 12px;border-radius:99px;font-weight:700;font-size:13px;margin-left:10px;vertical-align:middle}.badge.good{background:#0d2f24;color:var(--ok);border:1px solid #166a4b}.badge.bad{background:#341319;color:var(--bad);border:1px solid #7f1d1d}.badge.idle{background:#1b2442;color:var(--mut)}
.hero{display:grid;grid-template-columns:200px 1fr;gap:30px;align-items:center;background:linear-gradient(180deg,#131c40,#0f1630);border:1px solid var(--line);border-radius:22px;padding:26px;margin:24px 0}.donut{width:180px;height:180px}.dn{font-size:34px;font-weight:800;fill:#fff}.dl{font-size:12px;fill:#8f9bc0}
.kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:14px}.kpi{background:#0c1330;border:1px solid var(--line);border-radius:14px;padding:14px 16px}.kpi b{display:block;font-size:28px;line-height:1.1}.kpi span{color:var(--mut);font-size:12.5px}.g{color:var(--ok)}.r{color:var(--bad)}
.card{background:linear-gradient(180deg,#111936,#0e1530);border:1px solid var(--line);border-radius:18px;padding:22px;margin-top:18px}
.lrow{display:grid;grid-template-columns:150px 1fr 130px 70px;gap:14px;align-items:center;padding:7px 0}.lname{display:flex;gap:9px;align-items:center;font-weight:600}.lname i{width:11px;height:11px;border-radius:4px}.track{height:10px;background:#1b2442;border-radius:9px;overflow:hidden;display:flex}.track b{display:block;height:100%}.lnum{text-align:right;color:var(--mut);font-size:13.5px}.lnum strong{color:var(--ink)}.lms{text-align:right;color:var(--mut);font-size:12.5px}
table{width:100%;border-collapse:collapse;font-size:13.5px}th{text-align:left;color:var(--mut);font-weight:500;padding:8px 10px;border-bottom:1px solid var(--line)}td{padding:10px;border-bottom:1px solid #1a2444;vertical-align:top}td.n{text-align:right;white-space:nowrap;color:var(--mut)}
pre{margin:6px 0 0;padding:10px 12px;background:#2a1117;border:1px solid #6b1d27;border-radius:10px;color:#fecaca;white-space:pre-wrap;word-break:break-word;font:12px/1.5 ui-monospace,Menlo,monospace;max-height:170px;overflow:hidden}
.pill{display:inline-block;padding:1px 9px;border-radius:99px;font-size:11.5px;font-weight:600;background:#1b2442;color:#aab6dc}.find{display:flex;gap:12px;padding:12px 0;border-bottom:1px solid #1a2444}.find:last-child{border:0}.dot{flex:none;width:10px;height:10px;border-radius:50%;margin-top:7px}.dot.good{background:var(--ok)}.dot.warn{background:#facc15}.dot.bad{background:var(--bad)}.dot.info{background:#60a5fa}.find b{display:block}.find span{color:var(--mut);font-size:13.5px}
.two{display:grid;grid-template-columns:1fr 1fr;gap:18px}.ring{width:84px;height:84px}.rn{font-size:22px;font-weight:800;fill:#fff}.score{display:flex;gap:16px;align-items:center;margin-bottom:14px}.chips{display:flex;flex-wrap:wrap;gap:7px;margin-top:8px}
.foot{margin-top:30px;text-align:center;color:var(--mut);font-size:12.5px}
@media(max-width:760px){.hero{grid-template-columns:1fr}.kpis{grid-template-columns:repeat(2,1fr)}.lrow{grid-template-columns:110px 1fr 90px}.lms{display:none}.two{grid-template-columns:1fr}}
@media print{body{background:#fff;color:#111}.hero,.card,.kpi{background:#fff;border-color:#ddd}.sub,.lnum,.lms,th,.kpi span,h2{color:#555}.dn,.rn{fill:#111}.track,.donut circle:first-child{background:#eee;stroke:#eee}pre{background:#fff1f1;color:#7f1d1d}}
</style></head><body><div class="wrap">
<div class="top"><div class="brand"><span class="logo">✓</span>Test Dashboard</div><div>Generated ${esc(new Date().toLocaleString("en-GB"))}</div></div>
<h1>${esc(repo.name)}<span class="badge ${verdict[0]}">${verdict[1]}</span></h1>
<div class="sub">${esc(repo.url || repo.path)}${repo.last_commit ? ` · commit ${esc(repo.last_commit)}` : ""}</div>

<div class="hero">${donut(passed, failed, skipped)}<div class="kpis">
<div class="kpi"><b class="g">${passed}</b><span>tests passed</span></div><div class="kpi"><b class="${failed ? "r" : ""}">${failed}</b><span>tests failed</span></div>
<div class="kpi"><b>${runs.length}/${suites.length}</b><span>suites run</span></div><div class="kpi"><b>${ms(dur)}</b><span>total run time</span></div>
${a ? `<div class="kpi"><b>${a.summary.tests}</b><span>tests found in repo</span></div><div class="kpi"><b>${a.summary.testFiles}</b><span>test files</span></div><div class="kpi"><b>${a.summary.routes}</b><span>API routes</span></div><div class="kpi"><b>${fl.length}</b><span>flaky tests</span></div>` : ""}
</div></div>

${suites.length ? `<div class="card"><h2>Results by layer</h2>${layerRows}</div>` : ""}
${failures.length ? `<div class="card"><h2>Failing tests (${failures.length})</h2><table><thead><tr><th>Test</th><th>Layer</th></tr></thead><tbody>${failures.slice(0, 25).map((f) => `<tr><td>${esc(f.name)}<div class="sub" style="font-size:12px">${esc(f.suite)}</div>${f.error ? `<pre>${esc(f.error)}</pre>` : ""}</td><td><span class="pill">${esc(NAMES[f.layer] || f.layer)}</span></td></tr>`).join("")}</tbody></table></div>` : ""}
${slow.length ? `<div class="card"><h2>Slowest tests</h2><table><tbody>${slow.map((t) => `<tr><td>${esc(t.name)}<div class="sub" style="font-size:12px">${esc(t.suite)}</div></td><td class="n">${ms(t.duration_ms)}</td></tr>`).join("")}</tbody></table></div>` : ""}
${fl.length ? `<div class="card"><h2>Flaky tests (${fl.length})</h2><table><tbody>${fl.slice(0, 10).map((f) => `<tr><td>${esc(f.name)}<div class="sub" style="font-size:12px">${esc(f.suite)}</div></td><td class="n">${f.stability}% stable · ${f.flips} flips</td></tr>`).join("")}</tbody></table></div>` : ""}

${a ? `<div class="card"><h2>What this repo has, and what it needs</h2>
<div class="score">${ring(a.summary.score)}<div><b style="font-size:17px">Test coverage of the pyramid: ${a.summary.score}/100</b><div class="sub">Found tests compared with a modest suggested minimum for each layer.</div>
<div class="chips">${[...a.languages.map((l) => l.name), ...a.frameworks, ...a.testTools].map((x) => `<span class="pill">${esc(x)}</span>`).join("")}</div></div></div>
${cover}
<div style="margin-top:14px">${a.findings.map((f) => `<div class="find"><i class="dot ${f.level}"></i><div><b>${esc(f.title)}</b><span>${esc(f.detail)}</span></div></div>`).join("")}</div></div>` : ""}

<div class="foot">Test Dashboard · static analysis never runs your code; test runs happen only for repos you marked as trusted.</div>
</div></body></html>`;
}
