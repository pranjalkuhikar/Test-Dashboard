"use client";
import { useEffect, useState, useCallback } from "react";
import { api, ago } from "./ui";

export default function Automation({ setErr, envs }) {
  const [hooks, setHooks] = useState([]), [suites, setSuites] = useState([]);
  const [form, setForm] = useState(null);
  const [copied, setCopied] = useState("");
  const load = useCallback(async () => { try { setHooks((await api("/hooks")).hooks); setSuites((await api("/suites")).suites); } catch (e) { setErr(e.message); } }, [setErr]);
  useEffect(() => { load(); }, [load]);
  const create = async () => { try { await api("/hooks", { method: "POST", body: form }); setForm(null); load(); } catch (e) { setErr(e.message); } };
  const snippet = (t) => `curl -X POST ${location.origin}/api/hook/${t}`;
  const scheduled = suites.filter((s) => s.schedule_min > 0);
  return (
    <>
      <div className="head"><div><h1>Automation</h1><p>Run suites without clicking: on a timer, or when a CI job or git hook calls a webhook.</p></div></div>
      <div className="card">
        <h2>Schedules</h2>
        {!scheduled.length ? <p className="muted small">None. Set &quot;Run on a schedule&quot; when editing a suite. Test Dashboard must be running for schedules to fire; a suite is skipped if its previous run is still going.</p> :
          <table className="tbl" style={{ marginTop: 8 }}><thead><tr><th>Suite</th><th>Every</th><th>Last triggered</th></tr></thead><tbody>{scheduled.map((s) => <tr key={s.id}><td>{s.name}<div className="small muted">{s.repo_name}</div></td><td>{s.schedule_min} min</td><td className="muted">{ago(s.last_scheduled)}</td></tr>)}</tbody></table>}
      </div>
      <div className="card">
        <div className="head" style={{ alignItems: "center" }}><div><h2>Webhooks</h2><p className="small" style={{ margin: 0 }}>Each webhook has a secret URL and runs a fixed set of suites.</p></div><button className="btn go" onClick={() => setForm({ name: "", suite_ids: [], env_id: "" })} disabled={!suites.length}>+ New webhook</button></div>
        {form && (
          <div style={{ marginTop: 14 }}>
            <div className="form">
              <div><label>Name</label><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="after-deploy" /></div>
              <div><label>Environment</label><select value={form.env_id} onChange={(e) => setForm({ ...form, env_id: e.target.value })}><option value="">suite default</option>{envs.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</select></div>
              <div className="wide"><label>Suites to run</label>{suites.map((s) => <label key={s.id} style={{ display: "flex", gap: 8, color: "var(--text)", fontSize: 13 }}><input type="checkbox" checked={form.suite_ids.includes(s.id)} onChange={(e) => setForm({ ...form, suite_ids: e.target.checked ? [...form.suite_ids, s.id] : form.suite_ids.filter((x) => x !== s.id) })} />{s.name} <span className="muted">· {s.layer}</span></label>)}</div>
            </div>
            <div className="acts" style={{ marginTop: 12 }}><button className="btn go" onClick={create} disabled={!form.name || !form.suite_ids.length}>Create</button><button className="btn" onClick={() => setForm(null)}>Cancel</button></div>
          </div>)}
        <div className="list" style={{ marginTop: 14 }}>{hooks.map((h) => (
          <div className="test" key={h.token}><div className="th" style={{ flexWrap: "wrap" }}>
            <div className="nm"><b>{h.name}</b> <span className="muted small">· {JSON.parse(h.suite_ids).length} suites</span><div className="mono muted" style={{ wordBreak: "break-all" }}>{snippet(h.token)}</div></div>
            <button className="btn sm" onClick={() => { navigator.clipboard?.writeText(snippet(h.token)); setCopied(h.token); setTimeout(() => setCopied(""), 1500); }}>{copied === h.token ? "Copied" : "Copy"}</button>
            <button className="btn sm danger" onClick={async () => { await api("/hooks?token=" + h.token, { method: "DELETE" }); load(); }}>Delete</button>
          </div></div>))}</div>
        <p className="hint" style={{ marginTop: 10 }}>Anyone who can reach this URL can start those suites, so keep it private. Test Dashboard listens only on this computer unless you expose it.</p>
      </div>
    </>
  );
}
