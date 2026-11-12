"use client";
import { useEffect, useState } from "react";
import { api, ms, ago, Status, layerName, LAYER_INFO } from "./ui";

const CORE = ["e2e", "pact", "contract", "integration", "unit"]; // top of the pyramid first
const WIDTH = { e2e: 34, pact: 50, contract: 66, integration: 82, unit: 100 };

export default function Overview({ stats, env, go, setErr, refresh }) {
  const [runs, setRuns] = useState([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => { api("/runs?limit=8").then((d) => setRuns(d.runs)).catch(() => {}); }, [stats?.summary.running, stats?.summary.weekRuns]);
  if (!stats) return <div className="empty">Loading…</div>;
  const { summary: s, pyramid, trend, flaky } = stats;
  const by = Object.fromEntries(pyramid.map((l) => [l.layer, l]));
  const extra = pyramid.filter((l) => !CORE.includes(l.layer) && l.suites > 0);
  const maxTests = Math.max(1, ...trend.map((d) => d.passed + d.failed));
  const runAll = async () => { setBusy(true); try { await api("/runs", { method: "POST", body: { all: true, env_id: env || null } }); go("runs"); refresh(); } catch (e) { setErr(e.message); } setBusy(false); };

  if (!s.suites) return (
    <>
      <div className="head"><div><h1>Welcome to TestHub</h1><p>Unit tests live in each app&apos;s own repo. Everything else (integration, contract, Pact, E2E) lives in a separate tests repo. TestHub runs them all from here and keeps the history.</p></div></div>
      <div className="steps">
        <div><b>1 · Add a repo</b><span>Point at a local folder or a Git URL. Mark it trusted so TestHub may run its commands.</span></div>
        <div><b>2 · Find suites</b><span>TestHub reads package.json and Playwright configs and proposes suites per layer.</span></div>
        <div><b>3 · Run &amp; watch</b><span>Live logs, per-test results, flaky detection, and one click to open a Playwright trace.</span></div>
      </div>
      <button className="btn go" style={{ width: "fit-content" }} onClick={() => go("repos")}>Add your first repo</button>
    </>
  );

  return (
    <>
      <div className="head">
        <div><h1>Testing overview</h1><p>The latest result of every suite, grouped by layer. A healthy pyramid is wide at the bottom: many fast unit tests, fewer slow end-to-end ones.</p></div>
        <div className="acts"><button className="btn go" disabled={busy} onClick={runAll}>▶ Run everything</button></div>
      </div>
      <div className="kpis">
        <div className="kpi"><div className="k">Suites</div><div className="v">{s.suites}</div><div className="s">in {s.repos} repo{s.repos === 1 ? "" : "s"}</div></div>
        <div className="kpi"><div className="k">Runs this week</div><div className="v">{s.weekRuns}</div><div className="s">{s.weekGreen} green · {s.weekRed} red</div></div>
        <div className="kpi"><div className="k">Green rate</div><div className={`v ${s.greenRate != null && s.greenRate < 80 ? "bad" : "good"}`}>{s.greenRate == null ? "-" : s.greenRate + "%"}</div><div className="s">runs that fully passed</div></div>
        <div className="kpi"><div className="k">Avg run time</div><div className="v">{ms(s.avgMs)}</div><div className="s">per suite</div></div>
        <div className="kpi"><div className="k">Flaky tests</div><div className={`v ${flaky.length ? "amber" : ""}`}>{flaky.length}</div><div className="s">{flaky.length ? "see Flaky tests" : "none detected"}</div></div>
      </div>

      <div className="card">
        <h2>Testing pyramid</h2>
        <p className="muted small" style={{ marginBottom: 16 }}>Colour is the latest result: green all passing, red something failing, grey not run yet.</p>
        <div className="pyr">
          <div>
            {CORE.map((l) => {
              const d = by[l]; const none = !d || d.suites === 0;
              const cls = none ? "none" : d.neverRun === d.suites ? "idle" : d.failingSuites ? "red" : "green";
              return (
                <div key={l} className={`tier ${cls}`} style={{ width: WIDTH[l] + "%", cursor: "pointer" }} onClick={() => go("suites")} title={LAYER_INFO[l]?.[1]}>
                  {layerName(l)}
                  <small>{none ? "no suites yet" : d.neverRun === d.suites ? "not run yet" : `${d.passed}/${d.passed + d.failed} tests passing`}</small>
                </div>
              );
            })}
          </div>
          <div className="legend">
            {CORE.slice().reverse().map((l) => {
              const d = by[l];
              return (
                <div className="row" key={l}>
                  <b>{layerName(l)}</b>
                  <div className={`rate ${d?.failed ? "bad" : ""}`}><i style={{ width: (d?.passRate ?? 0) + "%" }} /></div>
                  <span className="small muted">{d && d.suites ? `${d.suites} suite${d.suites > 1 ? "s" : ""} · ${d.tests} tests · ${ms(d.avgMs)}` : "-"}</span>
                </div>
              );
            })}
            {extra.map((d) => (
              <div className="row" key={d.layer}><b>{layerName(d.layer)}</b><div className={`rate ${d.failed ? "bad" : ""}`}><i style={{ width: (d.passRate ?? 0) + "%" }} /></div><span className="small muted">{d.suites} suite{d.suites > 1 ? "s" : ""} · {d.tests} tests</span></div>
            ))}
          </div>
        </div>
      </div>

      <div className="card">
        <h2>Last 14 days</h2>
        <p className="muted small">Tests passed (green) and failed (red) per day.</p>
        <div className="trend">
          {trend.map((d) => {
            const h = ((d.passed + d.failed) / maxTests) * 100;
            return (
              <div className="col" key={d.date} title={`${new Date(d.date).toLocaleDateString()}: ${d.passed} passed, ${d.failed} failed in ${d.runs} runs`}>
                <div className="seg r" style={{ height: `${(d.failed / maxTests) * 100}%` }} />
                <div className="seg g" style={{ height: `${(d.passed / maxTests) * 100 - 0}%`, minHeight: d.passed ? 2 : 0 }} />
              </div>
            );
          })}
        </div>
        <div className="trendwrap">{trend.map((d) => <div key={d.date} className="lbl" style={{ flex: 1, textAlign: "center", fontSize: 10, color: "var(--muted)", marginTop: 4 }}>{new Date(d.date).getDate()}</div>)}</div>
      </div>

      <div className="card">
        <h2>Recent runs</h2>
        <div className="scroll"><table className="tbl">
          <thead><tr><th>Suite</th><th>Layer</th><th>Status</th><th>Tests</th><th>Time</th><th>When</th></tr></thead>
          <tbody>{runs.map((r) => (
            <tr key={r.id} className="click" onClick={() => go("run/" + r.id)}>
              <td>{r.suite_name}<div className="small muted">{r.repo_name}{r.commit_sha ? "@" + r.commit_sha : ""}</div></td>
              <td><span className="pill">{layerName(r.layer)}</span></td><td><Status s={r.status} /></td>
              <td>{r.total ? `${r.passed}/${r.total}` : "-"}</td><td>{ms(r.duration_ms)}</td><td className="muted">{ago(r.queued_at)}</td>
            </tr>))}</tbody>
        </table></div>
      </div>
    </>
  );
}
