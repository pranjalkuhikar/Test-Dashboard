"use client";
import { useEffect, useRef, useState } from "react";
import { api, ms, ago, bytes, Status, layerName } from "./ui";
import { isBrowserError, installAndRerun } from "./Workspace";

export function Runs({ go, stats }) {
  const [runs, setRuns] = useState([]);
  useEffect(() => { const f = () => api("/runs?limit=100").then((d) => setRuns(d.runs)).catch(() => {}); f(); const t = setInterval(f, 2000); return () => clearInterval(t); }, []);
  return (
    <>
      <div className="head"><div><h1>Runs</h1><p>Every execution, newest first. Click one for its log, per-test results and traces.</p></div></div>
      <div className="card scroll">
        {!runs.length ? <div className="empty">No runs yet. Start one from the Suites page.</div> : (
          <table className="tbl">
            <thead><tr><th>#</th><th>Suite</th><th>Layer</th><th>Status</th><th>Passed</th><th>Failed</th><th>Time</th><th>Trigger</th><th>When</th></tr></thead>
            <tbody>{runs.map((r) => (
              <tr key={r.id} className="click" onClick={() => go("run/" + r.id)}>
                <td className="muted">{r.id}</td><td>{r.suite_name}<div className="small muted">{r.repo_name}{r.commit_sha ? "@" + r.commit_sha : ""}{r.env_name ? " · " + r.env_name : ""}</div></td>
                <td><span className="pill">{layerName(r.layer)}</span></td><td><Status s={r.status} /></td>
                <td className="good">{r.passed || ""}</td><td className="bad">{r.failed || ""}</td><td>{ms(r.duration_ms)}</td><td className="muted small">{r.trigger}</td><td className="muted">{ago(r.queued_at)}</td>
              </tr>))}</tbody>
          </table>)}
      </div>
    </>
  );
}

export function RunDetail({ id, go, setErr, onClose }) {
  const [d, setD] = useState(null);
  const [tab, setTab] = useState("tests");
  const tabSet = useRef(false);
  const [log, setLog] = useState({ text: "", offset: 0 });
  const [open, setOpen] = useState({});
  const [tracing, setTracing] = useState(null);
  const logRef = useRef(null);
  const live = d && ["queued", "running"].includes(d.run.status);

  useEffect(() => { let stop = false; const f = async () => { try { const x = await api("/runs/" + id); if (!stop) setD(x); } catch (e) { setErr(e.message); } }; f(); const t = setInterval(f, 1500); return () => { stop = true; clearInterval(t); }; }, [id, setErr]);
  useEffect(() => { setLog({ text: "", offset: 0 }); }, [id]);
  useEffect(() => {
    let stop = false, off = log.offset;
    const f = async () => { try { const x = await api(`/runs/${id}/log?offset=${off}`); if (stop) return; if (x.text) { off = x.offset; setLog((l) => ({ text: l.text + x.text, offset: x.offset })); } } catch {} };
    f(); const t = setInterval(f, 1000); return () => { stop = true; clearInterval(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, live]);
  useEffect(() => { if (live && logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight; }, [log.text, live]);

  useEffect(() => { if (d && !tabSet.current) { tabSet.current = true; if (["queued", "running"].includes(d.run.status)) setTab("log"); } }, [d]);
  if (!d) return <div className="empty">Loading…</div>;
  const { run, results, artifacts, newlyFailing, previous } = d;
  const openTrace = async (artifactId) => {
    const w = window.open("", "_blank"); // open synchronously so the browser doesn't block the popup
    setTracing(artifactId);
    try { const { url } = await api(`/artifacts/${artifactId}/trace`, { method: "POST" }); if (w) w.location.href = url; else setErr("Allow pop-ups, or open " + url); }
    catch (e) { w?.close(); setErr(e.message); }
    setTracing(null);
  };
  const rerun = async () => { const x = await api(`/suites/${run.suite_id}/run`, { method: "POST", body: { env_id: run.env_id } }); go("run/" + x.run_id); };
  const traces = artifacts.filter((a) => a.kind === "trace"), shots = artifacts.filter((a) => a.kind === "screenshot"), vids = artifacts.filter((a) => a.kind === "video");

  return (
    <>
      <div className="head">
        <div>
          {onClose && <button className="btn sm" onClick={onClose}>✕ Close</button>}
          <h1>{run.suite_name} <Status s={run.status} /></h1>
          <p>{layerName(run.layer)} · {run.repo_name}{run.commit_sha ? "@" + run.commit_sha : ""}{run.env_name ? " · env " + run.env_name : ""} · {run.trigger} · {ago(run.queued_at)}</p>
        </div>
        <div className="acts">
          {live ? <button className="btn danger" onClick={() => api(`/runs/${id}/cancel`, { method: "POST" })}>Stop</button> : <button className="btn" onClick={rerun}>↻ Run again</button>}
        </div>
      </div>
      <div className="kpis">
        <div className="kpi"><div className="k">Passed</div><div className="v good">{run.passed}</div></div>
        <div className="kpi"><div className="k">Failed</div><div className={`v ${run.failed ? "bad" : ""}`}>{run.failed}</div>{newlyFailing.length > 0 && <div className="s amber">{newlyFailing.length} newly failing since run #{previous.id}</div>}</div>
        <div className="kpi"><div className="k">Skipped</div><div className="v">{run.skipped}</div></div>
        <div className="kpi"><div className="k">Duration</div><div className="v">{ms(run.duration_ms)}</div><div className="s">{live ? "running…" : `exit ${run.exit_code ?? "-"}`}</div></div>
      </div>
      {run.error && <div className="warnbox">{run.error}{isBrowserError(run.error) && <div style={{ marginTop: 8 }}><button className="btn sm go" onClick={async () => go("run/" + (await installAndRerun(run.suite_id, run.env_id)))}>Install browser &amp; run again</button></div>}</div>}
      <div className="tabs">
        {[["tests", `Tests (${results.length})`], ["log", "Log"], ["artifacts", `Artifacts (${artifacts.length})`]].map(([k, l]) => <button key={k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>{l}</button>)}
      </div>

      {tab === "tests" && (
        <div className="list">
          {!results.length && <div className="card empty">{live ? "Waiting for results…" : "No per-test results were reported. Check the Log tab."}</div>}
          {results.map((t) => (
            <div key={t.id} className={`test ${t.status}`}>
              <div className="th" onClick={() => t.error && setOpen((o) => ({ ...o, [t.id]: !o[t.id] }))}>
                <Status s={t.status} />
                <div className="nm">{t.name}{t.file && <div className="small muted">{t.file.split("/").slice(-2).join("/")}</div>}</div>
                {newlyFailing.includes(t.id) && <span className="pill amber">new failure</span>}
                {t.retries > 0 && <span className="pill amber">retried {t.retries}×</span>}
                <span className="small muted">{ms(t.duration_ms)}</span>
                {t.trace_artifact && <button className="btn sm go" disabled={tracing === t.trace_artifact} onClick={(e) => { e.stopPropagation(); openTrace(t.trace_artifact); }}>{tracing === t.trace_artifact ? "Opening…" : "Open trace"}</button>}
              </div>
              {t.error && (open[t.id] ?? t.status === "failed") && <pre>{t.error}</pre>}
            </div>
          ))}
        </div>
      )}
      {tab === "log" && <pre className="log" ref={logRef}>{log.text || "(no output yet)"}</pre>}
      {tab === "artifacts" && (
        <div className="card">
          {!artifacts.length && <div className="empty">This run produced no files.</div>}
          {traces.length > 0 && <><h4>Playwright traces</h4><div className="list" style={{ marginBottom: 16 }}>{traces.map((a) => (
            <div key={a.id} className="test"><div className="th"><span className="nm mono">{a.name}</span><span className="small muted">{bytes(a.size)}</span><a className="btn sm" href={`/api/artifacts/${a.id}/file`}>Download</a><button className="btn sm go" disabled={tracing === a.id} onClick={() => openTrace(a.id)}>{tracing === a.id ? "Opening…" : "Open in Trace Viewer"}</button></div></div>))}</div></>}
          {(shots.length > 0 || vids.length > 0) && <><h4>Screenshots &amp; videos</h4><div className="shots" style={{ marginBottom: 16 }}>{shots.map((a) => <a key={a.id} href={`/api/artifacts/${a.id}/file`} target="_blank"><img src={`/api/artifacts/${a.id}/file`} alt={a.name} /></a>)}{vids.map((a) => <video key={a.id} src={`/api/artifacts/${a.id}/file`} controls />)}</div></>}
          {artifacts.filter((a) => !["trace", "screenshot", "video"].includes(a.kind)).length > 0 && <><h4>Other files</h4><div className="list">{artifacts.filter((a) => !["trace", "screenshot", "video"].includes(a.kind)).map((a) => <div key={a.id} className="small"><a href={`/api/artifacts/${a.id}/file`} target="_blank">{a.name}</a> <span className="muted">{bytes(a.size)}</span></div>)}</div></>}
        </div>
      )}
      <p className="hint mono">$ {run.command || "…"}</p>
    </>
  );
}
