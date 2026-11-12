"use client";
import { useEffect, useState, useCallback } from "react";
import { api } from "./ui";
import Overview from "./Overview";
import Suites from "./Suites";
import { Runs, RunDetail } from "./Runs";
import Repos from "./Repos";
import Envs from "./Envs";
import Flaky from "./Flaky";
import Automation from "./Automation";

const NAV = [["overview", "Overview", "◧"], ["suites", "Suites", "☰"], ["runs", "Runs", "▶"], ["flaky", "Flaky tests", "≈"], ["repos", "Repos", "⎇"], ["envs", "Environments", "⚙"], ["auto", "Automation", "⏱"]];

export default function Hub() {
  const [route, setRoute] = useState({ page: "overview" });
  const [stats, setStats] = useState(null);
  const [envs, setEnvs] = useState([]);
  const [env, setEnv] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => {
    const read = () => { const h = location.hash.replace(/^#\/?/, "").split("/"); setRoute({ page: h[0] || "overview", id: h[1] }); };
    read(); addEventListener("hashchange", read); return () => removeEventListener("hashchange", read);
  }, []);
  useEffect(() => { try { setEnv(localStorage.getItem("th.env") || ""); } catch {} }, []);
  const refresh = useCallback(async () => { try { setStats(await api("/stats")); setEnvs((await api("/envs")).envs); } catch (e) { setErr(e.message); } }, []);
  useEffect(() => { refresh(); const t = setInterval(refresh, stats?.summary.running ? 2000 : 8000); return () => clearInterval(t); }, [refresh, stats?.summary.running]);
  const pickEnv = (v) => { setEnv(v); try { localStorage.setItem("th.env", v); } catch {} };
  const go = (p) => { location.hash = "/" + p; };
  const ctx = { stats, refresh, envs, env: env && envs.some((e) => String(e.id) === env) ? env : "", go, setErr };
  const running = stats?.summary.running || 0;

  return (
    <div className="app">
      <aside className="side">
        <div className="brand"><div className="logo">✓</div><div><b>TestHub</b><small>every layer, one place</small></div></div>
        {NAV.map(([k, label, icon]) => (
          <button key={k} className={`nav ${route.page === k || (k === "runs" && route.page === "run") ? "on" : ""}`} onClick={() => go(k)}>
            <span>{icon}</span>{label}
            {k === "runs" && running > 0 && <span className="n live">{running} live</span>}
            {k === "suites" && stats && <span className="n">{stats.summary.suites}</span>}
            {k === "flaky" && stats?.flaky.length > 0 && <span className="n">{stats.flaky.length}</span>}
          </button>
        ))}
        <div className="grow" />
        <div className="envpick">
          <label>Run against</label>
          <select value={ctx.env} onChange={(e) => pickEnv(e.target.value)}>
            <option value="">suite default</option>
            {envs.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
          <p className="hint">Sets URLs and keys for runs started from the buttons.</p>
        </div>
      </aside>
      <main className="main">
        <div className="page">
          {err && <div className="alert" onClick={() => setErr("")}>{err} <span className="small">(click to dismiss)</span></div>}
          {route.page === "overview" && <Overview {...ctx} />}
          {route.page === "suites" && <Suites {...ctx} />}
          {route.page === "runs" && <Runs {...ctx} />}
          {route.page === "run" && <RunDetail {...ctx} id={route.id} />}
          {route.page === "flaky" && <Flaky {...ctx} />}
          {route.page === "repos" && <Repos {...ctx} />}
          {route.page === "envs" && <Envs {...ctx} />}
          {route.page === "auto" && <Automation {...ctx} />}
        </div>
      </main>
    </div>
  );
}
