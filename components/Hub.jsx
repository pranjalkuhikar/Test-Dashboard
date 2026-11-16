"use client";
import { useEffect, useState, useCallback, useMemo } from "react";
import { api, ago, layerName } from "./ui";
import Workspace from "./Workspace";
import Manage from "./Manage";
import { RunDetail } from "./Runs";
import Hero from "./Hero";
import Icon from "./icons";
import Logo from "./Logo";
import ResultsCard from "./ResultsCard";
import RepoCards from "./RepoCards";

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
  const [manage, setManage] = useState(null); // tab name or null
  const [drawer, setDrawer] = useState(null); // run id
  const [toast, setToast] = useState("");
  const [busy, setBusy] = useState(false);
  const [theme, setTheme] = useState("light");
  const [focus, setFocus] = useState(null); // repo just analysed: scroll to it and open its analysis

  const setErr = useCallback((m) => { setToast(m); }, []);
  const refresh = useCallback(async () => {
    try { const [w, s, e] = await Promise.all([api("/workspace"), api("/stats"), api("/envs")]); setWs(w); setStats(s); setEnvs(e.envs); } catch (e) { setToast(e.message); }
  }, []);
  useEffect(() => { refresh(); const t = setInterval(refresh, ws?.running ? 1500 : 6000); return () => clearInterval(t); }, [refresh, ws?.running]);
  useEffect(() => { if (toast) { const t = setTimeout(() => setToast(""), 6000); return () => clearTimeout(t); } }, [toast]);

  // remembered choices
  useEffect(() => { try { const s = JSON.parse(localStorage.getItem("th.sel") || "null"); setSel(s ? new Set(s) : null); localStorage.removeItem("th.env"); } catch {} }, []);
  const repos = ws?.repos || [];
  const selected = useMemo(() => (sel ? repos.filter((r) => sel.has(r.id)) : repos), [sel, repos]); // nothing chosen yet = show all
  const toggle = (id) => { const n = new Set((sel || new Set(repos.map((r) => r.id)))); n.has(id) ? n.delete(id) : n.add(id); setSel(n); try { localStorage.setItem("th.sel", JSON.stringify([...n])); } catch {} };
  const only = (id) => { const n = new Set([id]); setSel(n); try { localStorage.setItem("th.sel", JSON.stringify([...n])); } catch {} };
  const all = (on) => { const n = on ? new Set(repos.map((r) => r.id)) : new Set(); setSel(n); try { localStorage.setItem("th.sel", JSON.stringify([...n])); } catch {} };
  const removeRepo = async (r) => {
    const msg = r.source === "git"
      ? `Remove "${r.name}" from the dashboard?\n\nThis deletes its run history, results and reports, and the downloaded copy of the repo on this computer. The repo on GitHub is not touched.`
      : `Remove "${r.name}" from the dashboard?\n\nThis deletes its run history, results and reports. The folder on your computer (${r.path}) is not touched.`;
    if (!confirm(msg)) return;
    try {
      const x = await api("/repos/" + r.id, { method: "DELETE" });
      const n = new Set(sel || repos.map((q) => q.id)); n.delete(r.id); setSel(n);
      try { localStorage.setItem("th.sel", JSON.stringify([...n])); } catch {}
      setToast(`Removed ${r.name} (${x.runs_removed} run${x.runs_removed === 1 ? "" : "s"} deleted)`);
      await refresh();
    } catch (e) { setToast(e.message); }
  };
  useEffect(() => { setTheme(document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light"); }, []);
  const toggleTheme = () => {
    const n = theme === "dark" ? "light" : "dark"; setTheme(n);
    document.documentElement.setAttribute("data-theme", n);
    try { localStorage.setItem("th.theme", n); localStorage.setItem("rep.theme", n); } catch {} // the report page opens in the same mode
  };
  const envId = ""; // every suite runs with its own default environment (set per suite under Manage → Suites)

  const runRepos = async (ids) => {
    setBusy(true);
    try { await api("/runs", { method: "POST", body: { repo_ids: ids, env_id: envId || null } }); await refresh(); } catch (e) { setToast(e.message); }
    setBusy(false);
  };
  const runSuite = async (id) => { try { const x = await api(`/suites/${id}/run`, { method: "POST", body: { env_id: envId || null } }); refresh(); return x.run_id; } catch (e) { setToast(e.message); } };
  const runnable = selected.filter((r) => r.trusted && r.suites.some((s) => s.enabled));
  const nTests = selected.reduce((a, r) => a + r.suites.reduce((b, s) => b + (s.done?.total || 0), 0), 0);
  const analysed = async (r) => { await refresh(); only(r.repo_id); setFocus(r.repo_id); setTimeout(() => document.getElementById("repo-" + r.repo_id)?.scrollIntoView({ behavior: "smooth", block: "start" }), 250); };
  const ctx = { focus, ws, repos, selected, stats, envs, envId, setErr, refresh, runSuite, runRepos, busy, openRun: setDrawer, manage: setManage, toggle, only };

  const NAV = [["overview", "Overview", "grid", () => document.querySelector(".pbody")?.scrollTo({ top: 0, behavior: "smooth" })], ["repos", "Repos", "folder", () => setManage("repos")], ["suites", "Suites", "cube", () => setManage("suites")], ["history", "Run history", "chart", () => setManage("history")], ["envs", "Environments", "user", () => setManage("envs")], ["auto", "Automation", "clock", () => setManage("auto")]];
  const focusAnalyze = () => { const el = document.getElementById("analyze-input"); el?.scrollIntoView({ behavior: "smooth", block: "center" }); setTimeout(() => el?.focus(), 350); };

  return (
    <div className="stage"><div className="device">
      <aside className="dock">
        <div className="logotile" title="Test Dashboard"><Logo size={50} /></div>
        {NAV.map(([k, label, icon, fn], i) => (
          <button key={k} className={`dk ${i === 0 ? "on" : ""}`} title={label} aria-label={label} onClick={fn}>
            <Icon name={icon} />{k === "history" && (ws?.running || 0) > 0 && <span className="badge" />}
          </button>
        ))}
        <div className="grow" />
        <button className="dk" title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"} aria-label="Switch light or dark mode" onClick={toggleTheme}><Icon name={theme === "dark" ? "sun" : "moon"} /></button>
      </aside>
      <section className="panel">
        <header className="phead">
          <h1>Overview</h1>
          <button className="roundbtn" title="Analyze a repo" aria-label="Analyze a repo" onClick={focusAnalyze}><Icon name="search" size={20} /></button>
          <button className="roundbtn" title={ws?.running ? `${ws.running} run${ws.running === 1 ? "" : "s"} in progress` : "Run history"} aria-label="Run history" onClick={() => setManage("history")}><Icon name="bell" size={20} />{(ws?.running || 0) > 0 && <span className="badge" />}</button>
          <button className="btn" onClick={() => setManage("repos")}><Icon name="plus" size={16} stroke={2} />Add repo</button>
          <button className="btn go" disabled={busy || !runnable.length} onClick={() => runRepos(runnable.map((r) => r.id))} title={runnable.length ? "" : "Select a trusted repo with suites"}>
            <Icon name="play" size={13} />Run {selected.length === repos.length ? "all" : `selected (${runnable.length})`}
          </button>
        </header>
        <div className="pbody">
          {!ws ? <div className="empty">Loading…</div> : !repos.length ? (
            <div className="maingrid"><Workspace {...ctx} nTests={nTests} /><Hero onDone={analysed} setErr={setErr} /></div>
          ) : (
            <>
              <div className="toprow">
                <div><div className="sechead"><h2>Results</h2></div><ResultsCard selected={selected} tick={`${ws?.running || 0}-${stats?.summary?.weekRuns || 0}`} /></div>
                <div>
                  <div className="sechead"><h2>Your repos</h2><div className="acts"><button className="btn sm" onClick={() => all(true)}>All</button><button className="btn sm" onClick={() => all(false)}>None</button></div></div>
                  <RepoCards repos={repos} sel={sel} toggle={toggle} only={only} removeRepo={removeRepo} onAdd={() => setManage("repos")} />
                </div>
              </div>
              <div className="maingrid"><Workspace {...ctx} nTests={nTests} /><Hero onDone={analysed} setErr={setErr} /></div>
            </>
          )}
        </div>
      </section>
      {drawer && <div className="scrim" onClick={() => setDrawer(null)}><aside className="drawer" onClick={(e) => e.stopPropagation()}><RunDetail id={drawer} go={(p) => setDrawer(p.split("/")[1])} setErr={setErr} onClose={() => setDrawer(null)} /></aside></div>}
      {manage && <Manage tab={manage} setTab={setManage} onClose={() => { setManage(null); refresh(); }} {...ctx} />}
      {toast && <div className="toast" onClick={() => setToast("")}>{toast}</div>}
    </div></div>
  );
}
