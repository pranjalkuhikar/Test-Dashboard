"use client";
import { useEffect, useState, useCallback } from "react";
import { api, ms, ago, Status, layerName, LAYER_INFO } from "./ui";

const BLANK = { name: "", repo_id: "", layer: "integration", cwd: ".", setup: "", command: "", parser: "junit", timeout_s: 600, schedule_min: 0, trace: "", env_id: "" };
const PARSERS = [["junit", "JUnit XML (node:test, Cypress, pytest, PHPUnit …)"], ["jest", "Jest JSON"], ["vitest", "Vitest JSON"], ["mocha", "Mocha JSON"], ["playwright", "Playwright JSON"], ["go", "go test -json"], ["trx", ".NET trx"], ["rspec", "RSpec JSON"], ["exit", "Exit code only (reads any report the command writes)"]];

export default function Suites({ env, envs, go, setErr, refresh, stats }) {
  const [suites, setSuites] = useState([]), [repos, setRepos] = useState([]);
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(null);
  const [presets, setPresets] = useState([]);
  useEffect(() => { api("/presets").then((d) => setPresets(d.presets)).catch(() => {}); }, []);
  const applyPreset = (id) => { const p = presets.find((x) => x.id === id); if (p) setForm((f) => ({ ...f, name: f.name || p.label, layer: p.layer, command: p.command, parser: p.parser, setup: p.setup || f.setup, trace: p.trace || "", note: p.note })); };
  const load = useCallback(async () => { try { setSuites((await api("/suites")).suites); setRepos((await api("/repos")).repos); } catch (e) { setErr(e.message); } }, [setErr]);
  useEffect(() => { load(); const t = setInterval(load, 3000); return () => clearInterval(t); }, [load]);

  const start = async (body, key) => { setBusy(key); try { const x = await api(body.suite_ids?.length === 1 ? `/suites/${body.suite_ids[0]}/run` : "/runs", { method: "POST", body: { ...body, env_id: env || null } }); refresh(); if (x.run_id) go("run/" + x.run_id); else go("runs"); } catch (e) { setErr(e.message); } setBusy(null); };
  const save = async () => {
    try {
      const body = { ...form, repo_id: +form.repo_id, env_id: form.env_id || null };
      if (form.id) await api("/suites/" + form.id, { method: "PATCH", body }); else await api("/suites", { method: "POST", body });
      setForm(null); load();
    } catch (e) { setErr(e.message); }
  };
  const del = async (s) => { if (confirm(`Delete suite "${s.name}" and its run history?`)) { await api("/suites/" + s.id, { method: "DELETE" }); load(); } };
  const layers = [...new Set(suites.map((s) => s.layer))];
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  return (
    <>
      <div className="head">
        <div><h1>Suites</h1><p>A suite is one command in one repo that runs tests for one layer. Add them by finding them in a repo, or write one by hand.</p></div>
        <div className="acts"><button className="btn" onClick={() => setForm({ ...BLANK, repo_id: repos[0]?.id || "" })} disabled={!repos.length}>+ New suite</button><button className="btn go" disabled={!suites.length || busy === "all"} onClick={() => start({ all: true }, "all")}>▶ Run everything</button></div>
      </div>

      {form && (
        <div className="card">
          <h2>{form.id ? "Edit suite" : "New suite"}</h2>
          <div className="form" style={{ marginTop: 12 }}>
            {!form.id && (
              <div className="wide"><label>Start from a ready-made command (optional)</label>
                <select defaultValue="" onChange={(e) => applyPreset(e.target.value)}>
                  <option value="">Choose one: Jest, Vitest, Playwright, Cypress, pytest, Go, Maven, dotnet, RSpec …</option>
                  {[...new Set(presets.map((p) => p.group))].map((g) => <optgroup key={g} label={g}>{presets.filter((p) => p.group === g).map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}</optgroup>)}
                </select>
                {form.note && <div className="hint">{form.note}</div>}
              </div>
            )}
            <div><label>Name</label><input value={form.name} onChange={set("name")} placeholder="Checkout API" /></div>
            <div><label>Repo</label><select value={form.repo_id} onChange={set("repo_id")} disabled={!!form.id}>{repos.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select></div>
            <div><label>Layer</label><select value={form.layer} onChange={set("layer")}>{Object.keys(LAYER_INFO).map((l) => <option key={l} value={l}>{layerName(l)}</option>)}</select></div>
            <div><label>Results format</label><select value={form.parser} onChange={set("parser")}>{PARSERS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
            <div className="wide"><label>Command</label><textarea rows={2} value={form.command} onChange={set("command")} placeholder='node --test --test-reporter=junit --test-reporter-destination={{results}} "tests/*.test.mjs"' />
              <div className="hint">Use <code>{"{{results}}"}</code> where the runner should write its results file, and <code>{"{{artifacts}}"}</code> for screenshots and traces. Playwright gets <code>--output</code> and <code>--trace</code> added automatically.</div></div>
            <div><label>Folder inside the repo</label><input value={form.cwd} onChange={set("cwd")} /></div>
            <div><label>Setup command (optional)</label><input value={form.setup} onChange={set("setup")} placeholder="npm ci" /></div>
            <div><label>Default environment</label><select value={form.env_id || ""} onChange={set("env_id")}><option value="">none</option>{envs.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</select></div>
            <div><label>Timeout (seconds)</label><input type="number" value={form.timeout_s} onChange={set("timeout_s")} /></div>
            <div><label>Run on a schedule (minutes, 0 = never)</label><input type="number" value={form.schedule_min} onChange={set("schedule_min")} /></div>
            {form.parser === "playwright" && <div><label>Playwright trace</label><select value={form.trace} onChange={set("trace")}><option value="">use the repo&apos;s config</option><option value="on">always record</option><option value="retain-on-failure">keep on failure</option><option value="on-first-retry">on first retry</option></select></div>}
          </div>
          <div className="acts" style={{ marginTop: 14 }}><button className="btn go" onClick={save} disabled={!form.name || !form.command || !form.repo_id}>Save</button><button className="btn" onClick={() => setForm(null)}>Cancel</button></div>
        </div>
      )}

      {!suites.length && !form && <div className="card empty">No suites yet. Add a repo, then use <b>Find suites</b> on the Repos page.</div>}
      {layers.sort((a, b) => Object.keys(LAYER_INFO).indexOf(a) - Object.keys(LAYER_INFO).indexOf(b)).map((layer) => (
        <div className="card" key={layer}>
          <div className="head" style={{ alignItems: "center" }}>
            <div><h2>{layerName(layer)}</h2><p className="small" style={{ margin: 0 }}>{LAYER_INFO[layer]?.[1]}</p></div>
            <button className="btn sm" disabled={busy === layer} onClick={() => start({ layer }, layer)}>▶ Run all {layerName(layer)}</button>
          </div>
          <div className="scroll"><table className="tbl" style={{ marginTop: 8 }}>
            <thead><tr><th>Suite</th><th>Last result</th><th>Tests</th><th>Time</th><th>Schedule</th><th /></tr></thead>
            <tbody>{suites.filter((s) => s.layer === layer).map((s) => (
              <tr key={s.id}>
                <td>{s.name}<div className="small muted">{s.repo_name}{!s.trusted && <span className="pill amber" style={{ marginLeft: 6 }}>repo not trusted</span>}{!s.enabled && <span className="pill" style={{ marginLeft: 6 }}>disabled</span>}</div></td>
                <td>{s.last_run_id ? <a href={`#/run/${s.last_run_id}`}><Status s={s.last_status} /></a> : <Status />}</td>
                <td>{s.last_counts || "-"}</td><td>{ms(s.last_ms)}</td>
                <td className="muted">{s.schedule_min ? `every ${s.schedule_min >= 60 ? s.schedule_min / 60 + " h" : s.schedule_min + " min"}` : "-"}</td>
                <td className="r"><div className="acts" style={{ justifyContent: "flex-end" }}>
                  <button className="btn sm go" disabled={!s.trusted || busy === s.id} onClick={() => start({ suite_ids: [s.id] }, s.id)}>▶ Run</button>
                  <button className="btn sm" onClick={() => setForm({ ...s, env_id: s.env_id || "" })}>Edit</button>
                  <button className="btn sm danger" onClick={() => del(s)}>Delete</button>
                </div></td>
              </tr>))}</tbody>
          </table></div>
        </div>
      ))}
    </>
  );
}
