"use client";
import { useEffect, useState } from "react";
import { api, ms, ago, Status, layerName, LAYER_INFO } from "./ui";
import { repoHealth } from "./Hub";
import AnalysisCard from "./AnalysisCard";


const PW_INSTALL = "npx playwright install chromium";
export const isBrowserError = (e) => /Playwright's browser isn't installed/.test(e || "");
export async function installAndRerun(suiteId, envId) {
  const { api } = await import("./ui");
  await api(`/suites/${suiteId}`, { method: "PATCH", body: { setup: PW_INSTALL, timeout_s: 900 } });
  return (await api(`/suites/${suiteId}/run`, { method: "POST", body: { env_id: envId || null } })).run_id;
}
const ORDER = Object.keys(LAYER_INFO);
const active = (s) => s.last && ["queued", "running"].includes(s.last.status);

function Tests({ runId, openTrace, tracing, openRun }) {
  const [d, setD] = useState(null);
  const [all, setAll] = useState(false);
  useEffect(() => { let on = true; api("/runs/" + runId).then((x) => on && setD(x)).catch(() => {}); return () => { on = false; }; }, [runId]);
  if (!d) return <div className="muted small" style={{ padding: 12 }}>Loading tests…</div>;
  if (!d.results.length) return <div className="muted small" style={{ padding: 12 }}>This run reported no individual tests{d.run.error ? `: ${d.run.error}` : "."}</div>;
  const bad = d.results.filter((t) => t.status === "failed"), rest = d.results.filter((t) => t.status !== "failed");
  const show = all ? d.results : [...bad, ...rest.slice(0, Math.max(0, 8 - bad.length))];
  return (
    <div className="tests">
      {d.run.error && <div className="warnbox" style={{ marginBottom: 8 }}>{d.run.error}{isBrowserError(d.run.error) && <div style={{ marginTop: 8 }}><button className="btn sm go" onClick={async () => openRun(await installAndRerun(d.run.suite_id, d.run.env_id))}>Install browser &amp; run again</button></div>}</div>}
      {show.map((t) => (
        <div key={t.id} className={`trow ${t.status}`}>
          <div className="thead">
            <span className={`hd ${t.status === "passed" ? "good" : t.status === "failed" ? "bad" : "idle"}`} />
            <div className="tname">{t.name}{t.file && <span className="tfile">{t.file.split("/").slice(-1)[0]}</span>}</div>
            {d.newlyFailing.includes(t.id) && <span className="pill amber">new failure</span>}
            {t.retries > 0 && <span className="pill amber">retried {t.retries}×</span>}
            <span className="muted small">{ms(t.duration_ms)}</span>
            {t.trace_artifact && <button className="btn sm go" disabled={tracing === t.trace_artifact} onClick={() => openTrace(t.trace_artifact)}>{tracing === t.trace_artifact ? "Opening…" : "Open trace"}</button>}
          </div>
          {t.error && <pre className="terr">{t.error}</pre>}
        </div>
      ))}
      {d.results.length > show.length && <button className="btn sm" onClick={() => setAll(true)}>Show all {d.results.length} tests</button>}
      {all && d.results.length > 8 && <button className="btn sm" style={{ marginLeft: 6 }} onClick={() => setAll(false)}>Show less</button>}
    </div>
  );
}

function Suite({ s, repo, runSuite, openRun, openTrace, tracing }) {
  const r = s.done, live = active(s);
  const [open, setOpen] = useState(null);
  const isOpen = open ?? (r && r.status !== "passed");
  return (
    <div className={`suite ${r?.status || "idle"}`}>
      <div className="shead" onClick={() => r && setOpen(!isOpen)} style={{ cursor: r ? "pointer" : "default" }}>
        <span className="caret">{r ? (isOpen ? "▾" : "▸") : ""}</span>
        <div className="sname"><b>{s.name}</b>{!s.enabled && <span className="pill" style={{ marginLeft: 8 }}>disabled</span>}
          <div className="small muted">{r ? `${ago(r.finished_at || r.queued_at)}${r.commit_sha ? ` · ${r.commit_sha}` : ""}${r.env_name ? ` · ${r.env_name}` : ""}` : "never run"}</div></div>
        {live ? <span className="pill run">● {s.last.status}</span> : r ? <Status s={r.status} /> : <span className="pill">not run</span>}
        <div className="sres">{r?.total ? <><b className={r.failed ? "bad" : "good"}>{r.passed}</b><span className="muted">/{r.total}</span></> : <span className="muted">-</span>}</div>
        <div className="sms muted">{r ? ms(r.duration_ms) : ""}</div>
        <div className="sacts" onClick={(e) => e.stopPropagation()}>
          {live ? <button className="btn sm" onClick={() => openRun(s.last.id)}>Watch live</button>
            : <><button className="btn sm go" disabled={!repo.trusted || !s.enabled} onClick={async () => { const id = await runSuite(s.id); if (id) openRun(id); }}>▶ Run</button>
              {r && <button className="btn sm" onClick={() => openRun(r.id)}>Details</button>}</>}
        </div>
      </div>
      {isOpen && r && <Tests runId={r.id} openTrace={openTrace} tracing={tracing} openRun={openRun} />}
    </div>
  );
}

function RepoPanel({ repo, runRepos, runSuite, openRun, busy, manage, openTrace, tracing, flakyN, focus, refresh, setErr }) {
  const h = repoHealth(repo);
  const done = repo.suites.filter((s) => s.done);
  const tests = done.reduce((a, s) => a + s.done.total, 0), passed = done.reduce((a, s) => a + s.done.passed, 0), failed = done.reduce((a, s) => a + s.done.failed, 0);
  const last = Math.max(0, ...done.map((s) => s.done.finished_at || 0));
  const layers = [...new Set(repo.suites.map((s) => s.layer))].sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b));
  const pct = tests ? Math.round((passed / tests) * 100) : null;
  return (
    <section className="rpanel" id={`repo-${repo.id}`}>
      <div className="rhead">
        <div>
          <h2>{repo.name} <span className={`pill ${repo.kind === "tests" ? "teal" : "blue"}`}>{repo.kind === "tests" ? "tests repo" : "app repo"}</span>
            {h === "running" && <span className="pill run">● running</span>}
            {h === "failed" && <span className="pill bad">failing</span>}{h === "passed" && <span className="pill good">all passing</span>}
            {!repo.trusted && <span className="pill amber">not trusted</span>}</h2>
          <div className="small muted" style={{ marginTop: 3 }}>{repo.path}{repo.last_commit ? ` · ${repo.last_commit}` : ""}</div>
        </div>
        <div className="acts"><a className="btn" href={`/api/repos/${repo.id}/report`} target="_blank" rel="noreferrer">📄 Report</a><button className="btn go" disabled={busy || !repo.trusted || !repo.suites.length || h === "running"} onClick={() => runRepos([repo.id])}>▶ Run this repo</button></div>
      </div>
      <AnalysisCard repo={repo} refresh={refresh} openRun={openRun} setErr={setErr} autoOpen={focus === repo.id ? true : undefined} runCount={repo.suites.filter((s) => s.done).length} />
      {!repo.trusted && <div className="warnbox" style={{ margin: "12px 0 0" }}>This repo isn&apos;t trusted, so nothing in it will run. <a onClick={() => manage("repos")}>Open Repos to trust it</a>.</div>}
      {!repo.suites.length ? (
        <div className="empty">No suites yet. <button className="btn sm go" onClick={() => manage("repos")}>Find suites</button></div>
      ) : (
        <>
          <div className="summary">
            <div><div className="big">{pct == null ? "-" : pct + "%"}</div><div className="small muted">passing</div></div>
            <div><div className="big good">{passed}</div><div className="small muted">tests passed</div></div>
            <div><div className={`big ${failed ? "bad" : ""}`}>{failed}</div><div className="small muted">failed</div></div>
            <div><div className="big">{done.length}/{repo.suites.length}</div><div className="small muted">suites run</div></div>
            <div><div className="big sm">{last ? ago(last) : "never"}</div><div className="small muted">last run</div></div>
            {flakyN > 0 && <div><div className="big amber">{flakyN}</div><div className="small muted">flaky</div></div>}
            {tests > 0 && <div className="bar"><i className="g" style={{ width: (passed / tests) * 100 + "%" }} /><i className="r" style={{ width: (failed / tests) * 100 + "%" }} /></div>}
          </div>
          {layers.map((l) => (
            <div key={l} className="layer">
              <div className="lhead"><span className="lname">{layerName(l)}</span><span className="small muted">{LAYER_INFO[l]?.[1]}</span></div>
              {repo.suites.filter((s) => s.layer === l).map((s) => <Suite key={s.id} s={s} repo={repo} runSuite={runSuite} openRun={openRun} openTrace={openTrace} tracing={tracing} />)}
            </div>
          ))}
        </>
      )}
    </section>
  );
}

export default function Workspace(p) {
  const { ws, repos, selected, stats, nTests, manage } = p;
  const [tracing, setTracing] = useState(null);
  const openTrace = async (id) => {
    const w = window.open("", "_blank"); setTracing(id);
    try { const { url } = await api(`/artifacts/${id}/trace`, { method: "POST" }); if (w) w.location.href = url; else p.setErr("Allow pop-ups, or open " + url); } catch (e) { w?.close(); p.setErr(e.message); }
    setTracing(null);
  };
  if (!ws) return <div className="empty">Loading…</div>;
  if (!repos.length) return (
    <div className="welcome">
      <h1>Run every layer of your tests from one place</h1>
      <p className="muted">Unit tests stay in each app&apos;s repo. Integration, contract, Pact and E2E live in a separate tests repo. Add them here and Test Dashboard runs them, keeps the history and opens traces for you.</p>
      <div className="steps"><div><b>1 · Add a repo</b><span>A local folder or a Git URL.</span></div><div><b>2 · Find suites</b><span>Test Dashboard reads package.json and Playwright configs.</span></div><div><b>3 · Pick and run</b><span>Tick the repos you want, press Run, read results right here.</span></div></div>
      <button className="btn go" style={{ marginTop: 18 }} onClick={() => manage("repos")}>Add your first repo</button>
    </div>
  );
  if (!selected.length) return <div className="empty">No repo selected. Tick one on the left to see its results.</div>;
  const flaky = (stats?.flaky || []).filter((f) => selected.some((r) => r.id === f.repo_id));
  return (
    <div className="ws">
      {selected.map((r) => <RepoPanel key={r.id} repo={r} {...p} openTrace={openTrace} tracing={tracing} flakyN={flaky.filter((f) => f.repo_id === r.id).length} />)}
      {flaky.length > 0 && (
        <section className="rpanel">
          <h2>Flaky tests <span className="pill amber">{flaky.length}</span></h2>
          <p className="small muted">Result flips 3+ times in the last 10 runs, or only passes after a retry.</p>
          {flaky.map((f) => (
            <div className="trow" key={f.key}><div className="thead"><div className="tname">{f.name}<span className="tfile">{f.suite}</span></div>
              <span className="dots">{f.history.map((h, i) => <i key={i} className={h === "f" ? "f" : ""} />)}</span><span className={`small ${f.stability < 70 ? "bad" : "amber"}`}>{f.stability}% stable</span></div></div>
          ))}
        </section>
      )}
    </div>
  );
}
