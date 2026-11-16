"use client";
import { useEffect, useState, useCallback } from "react";
import { api, layerName } from "./ui";

const LC = { unit: "#38bdf8", component: "#22d3ee", integration: "#a78bfa", contract: "#f472b6", pact: "#fb923c", e2e: "#34d399", visual: "#c084fc", a11y: "#60a5fa", perf: "#f87171" };
const scoreColor = (v) => (v >= 75 ? "#34d399" : v >= 40 ? "#facc15" : "#f87171");

function Ring({ v, size = 76 }) {
  const R = 34, C = 2 * Math.PI * R;
  return (
    <svg viewBox="0 0 80 80" width={size} height={size} className="ringsvg">
      <circle r={R} cx="40" cy="40" fill="none" stroke="rgba(255,255,255,.08)" strokeWidth="8" />
      <circle r={R} cx="40" cy="40" fill="none" stroke={scoreColor(v)} strokeWidth="8" strokeLinecap="round" strokeDasharray={`${(v / 100) * C} ${C}`} transform="rotate(-90 40 40)" style={{ transition: "stroke-dasharray .8s ease" }} />
      <text x="40" y="47" textAnchor="middle" fontSize="22" fontWeight="800" fill="currentColor">{v}</text>
    </svg>
  );
}

export default function AnalysisCard({ repo, refresh, openRun, setErr, autoOpen, runCount }) {
  const [d, setD] = useState(null);
  const [open, setOpen] = useState(autoOpen ?? runCount === 0);
  const [pick, setPick] = useState({});
  const [trust, setTrust] = useState(!!repo.trusted);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => { try { const x = await api(`/repos/${repo.id}/analysis`); setD(x); setPick((p) => Object.fromEntries(x.suites.map((s, i) => [i, p[i] ?? true]))); } catch (e) { setErr(e.message); } }, [repo.id, setErr]);
  useEffect(() => { load(); }, [load, repo.last_commit]);
  useEffect(() => { if (autoOpen) setOpen(true); }, [autoOpen]);
  useEffect(() => setTrust(!!repo.trusted), [repo.trusted]);

  if (!d) return <div className="acard"><div className="muted small">Scanning…</div></div>;
  const a = d.analysis, s = a.summary;
  const chosen = d.suites.filter((x, i) => pick[i]);

  async function runIt() {
    setBusy(true);
    try {
      if (!repo.trusted) await api(`/repos/${repo.id}`, { method: "PATCH", body: { trusted: true } });
      await api(`/repos/${repo.id}/import`, { method: "POST", body: { suites: chosen.filter((x) => !x.exists) } });
      await api("/runs", { method: "POST", body: { repo_ids: [repo.id] } });
      await refresh(); await load();
    } catch (e) { setErr(e.message); }
    setBusy(false);
  }

  return (
    <div className="acard">
      <div className="ahead" onClick={() => setOpen(!open)}>
        <Ring v={s.score} />
        <div className="atitle">
          <h3>Test analysis <span className="pill">{s.tests} tests found</span></h3>
          <div className="muted small">{s.tests ? `${s.tests} tests in ${s.testFiles} files · ${s.routes} API routes · ${s.units} functions` : "No tests detected yet"} · score {s.score}/100</div>
          <div className="chips">{[...a.languages.map((l) => l.name), ...a.frameworks, ...a.testTools].slice(0, 9).map((x) => <span key={x} className="pill">{x}</span>)}</div>
        </div>
        <span className="caret2">{open ? "▾" : "▸"}</span>
      </div>
      {open && (
        <div className="abody">
          <div className="cover">
            <h4>Coverage of the pyramid: found vs suggested</h4>
            {a.layers.length === 0 && <div className="muted small">Nothing to measure yet.</div>}
            {a.layers.map((r) => {
              const pct = r.suggested ? Math.min(100, (r.found / r.suggested) * 100) : 100;
              return (
                <div className="crow" key={r.layer}>
                  <div className="cname"><i style={{ background: LC[r.layer] || "#94a3b8" }} />{layerName(r.layer)}</div>
                  <div className="ctrack"><b style={{ width: pct + "%", background: pct >= 100 ? "#34d399" : pct >= 40 ? "#facc15" : "#f87171" }} /></div>
                  <div className="cnum"><b>{r.found}</b>{r.suggested ? <span> / {r.suggested}</span> : <span> found</span>}</div>
                </div>
              );
            })}
            <p className="hint">&quot;Suggested&quot; is a modest floor, based on the functions, API routes and screens found. It is a guide, not a rule.</p>
          </div>
          <div className="finds">
            <h4>What I found</h4>
            {a.findings.map((f, i) => (
              <div className="find" key={i}><i className={`fd ${f.level}`} /><div><b>{f.title}</b><span>{f.detail}</span></div></div>
            ))}
            {a.findings.some((f) => f.level === "bad" || f.level === "warn") && <p className="hint">Need these tests written? <a href="http://localhost:5100" target="_blank" rel="noreferrer">Test Lab</a> scans a project and generates unit, integration, contract and E2E tests.</p>}
          </div>
          {a.inventory.length > 0 && (
            <details className="tfiles">
              <summary>Browse the {s.tests} tests found ({a.inventory.length} file{a.inventory.length === 1 ? "" : "s"})</summary>
              {a.inventory.slice(0, 40).map((f) => (
                <div className="tf" key={f.file}>
                  <div className="tfh"><span className="pill" style={{ color: LC[f.layer], borderColor: LC[f.layer] }}>{layerName(f.layer)}</span><b>{f.file}</b><span className="muted small">{f.tests} test{f.tests === 1 ? "" : "s"}</span></div>
                  <ul>{f.names.slice(0, 12).map((n, i) => <li key={i}>{n}</li>)}{f.names.length > 12 && <li className="muted">… and {f.tests - 12} more (see the report)</li>}</ul>
                </div>
              ))}
            </details>
          )}
          <div className="runbox">
            <h4>Run its tests</h4>
            {!d.suites.length ? <div className="muted small">No runnable test command was found (looked for package.json test scripts, Playwright configs and pytest). {s.tests ? "Add a test script so the dashboard can run them." : ""}</div> : (
              <>
                <div className="slist">
                  {d.suites.map((x, i) => (
                    <label className="sitem" key={i}>
                      <input type="checkbox" checked={!!pick[i]} disabled={x.exists} onChange={(e) => setPick({ ...pick, [i]: e.target.checked })} />
                      <span className="pill" style={{ borderColor: LC[x.layer], color: LC[x.layer] }}>{layerName(x.layer)}</span>
                      <b>{x.name}</b>{x.exists && <span className="pill">added</span>}
                      <code className="cmd">{x.command.replace(/--test-reporter\S+/g, "").replace(/\s+/g, " ").slice(0, 70)}</code>
                    </label>
                  ))}
                </div>
                {!repo.trusted && (
                  <label className="trust"><input type="checkbox" checked={trust} onChange={(e) => setTrust(e.target.checked)} />
                    <span><b>I trust this code.</b> Running tests executes the repo&apos;s code (and installs its dependencies) on this computer. Only tick this for code you wrote or have read.</span></label>
                )}
                <div className="acts">
                  <button className="btn go" disabled={busy || (!repo.trusted && !trust) || !chosen.length} onClick={runIt}>{busy ? <><span className="spin" />Starting…</> : "▶ Add & run these tests"}</button>
                  <a className="btn" href={`/api/repos/${repo.id}/report`} target="_blank" rel="noreferrer">📄 Open report</a>
                  <button className="btn" onClick={load}>↻ Re-scan</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
