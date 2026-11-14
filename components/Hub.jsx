"use client";
import { useEffect, useState, useCallback, useMemo } from "react";
import { api, ago, layerName } from "./ui";
import Workspace from "./Workspace";
import Manage from "./Manage";
import { RunDetail } from "./Runs";

export const repoHealth = (r) => {
  const s = r.suites;
  if (s.some((x) => x.last && ["queued", "running"].includes(x.last.status))) return "running";
  if (!s.length || s.every((x) => !x.done)) return "idle";
  if (s.some((x) => x.done && x.done.status !== "passed")) return "failed";
  return "passed";
};
const DOT = { running: "run", idle: "idle", failed: "bad", passed: "good" };

export default function Hub() {
  const [ws, setWs] = useState(null);
  const [stats, setStats] = useState(null);
  const [envs, setEnvs] = useState([]);
  const [sel, setSel] = useState(null); // Set of repo ids the user chose
  const [env, setEnv] = useState("");
  const [manage, setManage] = useState(null); // tab name or null
  const [drawer, setDrawer] = useState(null); // run id
  const [toast, setToast] = useState("");
  const [busy, setBusy] = useState(false);

  const setErr = useCallback((m) => { setToast(m); }, []);
  const refresh = useCallback(async () => {
    try { const [w, s, e] = await Promise.all([api("/workspace"), api("/stats"), api("/envs")]); setWs(w); setStats(s); setEnvs(e.envs); } catch (e) { setToast(e.message); }
  }, []);
  useEffect(() => { refresh(); const t = setInterval(refresh, ws?.running ? 1500 : 6000); return () => clearInterval(t); }, [refresh, ws?.running]);
  useEffect(() => { if (toast) { const t = setTimeout(() => setToast(""), 6000); return () => clearTimeout(t); } }, [toast]);

  // remembered choices
  useEffect(() => { try { const s = JSON.parse(localStorage.getItem("th.sel") || "null"); setSel(s ? new Set(s) : null); setEnv(localStorage.getItem("th.env") || ""); } catch {} }, []);
  const repos = ws?.repos || [];
  const selected = useMemo(() => (sel ? repos.filter((r) => sel.has(r.id)) : repos), [sel, repos]); // nothing chosen yet = show all
  const toggle = (id) => { const n = new Set((sel || new Set(repos.map((r) => r.id)))); n.has(id) ? n.delete(id) : n.add(id); setSel(n); try { localStorage.setItem("th.sel", JSON.stringify([...n])); } catch {} };
  const only = (id) => { const n = new Set([id]); setSel(n); try { localStorage.setItem("th.sel", JSON.stringify([...n])); } catch {} };
  const all = (on) => { const n = on ? new Set(repos.map((r) => r.id)) : new Set(); setSel(n); try { localStorage.setItem("th.sel", JSON.stringify([...n])); } catch {} };
  const pickEnv = (v) => { setEnv(v); try { localStorage.setItem("th.env", v); } catch {} };
  const envId = env && envs.some((e) => String(e.id) === env) ? env : "";

  const runRepos = async (ids) => {
    setBusy(true);
    try { await api("/runs", { method: "POST", body: { repo_ids: ids, env_id: envId || null } }); await refresh(); } catch (e) { setToast(e.message); }
    setBusy(false);
  };
  const runSuite = async (id) => { try { const x = await api(`/suites/${id}/run`, { method: "POST", body: { env_id: envId || null } }); refresh(); return x.run_id; } catch (e) { setToast(e.message); } };
  const runnable = selected.filter((r) => r.trusted && r.suites.some((s) => s.enabled));
  const nTests = selected.reduce((a, r) => a + r.suites.reduce((b, s) => b + (s.done?.total || 0), 0), 0);
  const ctx = { ws, repos, selected, stats, envs, envId, setErr, refresh, runSuite, runRepos, busy, openRun: setDrawer, manage: setManage, toggle, only };

  return (
    <div className="app">
      <header className="top">
        <div className="brand"><div className="logo">✓</div><div><b>Test Dashboard</b><small>run and review every layer of your tests</small></div></div>
        <div className="topmid">
          <span className="muted small">Run against</span>
          <select value={envId} onChange={(e) => pickEnv(e.target.value)} className="envsel">
            <option value="">each suite&apos;s default</option>
            {envs.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
        </div>
        <div className="topact">
          <button className="btn" onClick={() => setManage("repos")}>+ Add repo</button>
          <button className="btn" onClick={() => setManage("suites")}>⚙ Manage</button>
          <button className="btn go" disabled={busy || !runnable.length} onClick={() => runRepos(runnable.map((r) => r.id))} title={runnable.length ? "" : "Select a trusted repo with suites"}>
            ▶ Run {selected.length === repos.length ? "all" : `selected (${runnable.length})`}
          </button>
        </div>
      </header>
      <div className="body">
        <aside className="rail">
          <div className="railhead"><h4>Repositories</h4><span className="small muted"><a onClick={() => all(true)}>all</a> · <a onClick={() => all(false)}>none</a></span></div>
          <p className="hint" style={{ margin: "0 0 10px" }}>Tick the repos you want to see and run.</p>
          {!ws && <div className="muted small">Loading…</div>}
          {ws && !repos.length && <div className="empty small">No repos yet.<br /><button className="btn sm go" style={{ marginTop: 8 }} onClick={() => setManage("repos")}>Add your first repo</button></div>}
          {repos.map((r) => {
            const h = repoHealth(r), on = sel ? sel.has(r.id) : true;
            const tests = r.suites.reduce((a, s) => a + (s.done?.total || 0), 0), passed = r.suites.reduce((a, s) => a + (s.done?.passed || 0), 0);
            return (
              <label key={r.id} className={`rrow ${on ? "on" : ""}`}>
                <input type="checkbox" checked={on} onChange={() => toggle(r.id)} />
                <div className="rmain">
                  <div className="rname"><span className={`hd ${DOT[h]}`} />{r.name}</div>
                  <div className="rmeta">{r.kind === "tests" ? "tests repo" : "app"} · {r.suites.length} suite{r.suites.length === 1 ? "" : "s"}{tests ? ` · ${passed}/${tests} passing` : ""}</div>
                  <div className="chips">{[...new Set(r.suites.map((s) => s.layer))].map((l) => <span key={l} className="pill">{layerName(l)}</span>)}</div>
                </div>
                <button className="only" title="Show only this repo" onClick={(e) => { e.preventDefault(); only(r.id); }}>only</button>
              </label>
            );
          })}
        </aside>
        <main className="main"><Workspace {...ctx} nTests={nTests} /></main>
      </div>
      {drawer && <div className="scrim" onClick={() => setDrawer(null)}><aside className="drawer" onClick={(e) => e.stopPropagation()}><RunDetail id={drawer} go={(p) => setDrawer(p.split("/")[1])} setErr={setErr} onClose={() => setDrawer(null)} /></aside></div>}
      {manage && <Manage tab={manage} setTab={setManage} onClose={() => { setManage(null); refresh(); }} {...ctx} />}
      {toast && <div className="toast" onClick={() => setToast("")}>{toast}</div>}
    </div>
  );
}
