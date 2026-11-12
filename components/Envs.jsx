"use client";
import { useEffect, useState, useCallback } from "react";
import { api } from "./ui";

export default function Envs({ setErr, refresh }) {
  const [envs, setEnvs] = useState([]);
  const [edit, setEdit] = useState(null); // { id?, name, rows:[[k,v]] }
  const load = useCallback(async () => { try { setEnvs((await api("/envs")).envs); } catch (e) { setErr(e.message); } }, [setErr]);
  useEffect(() => { load(); }, [load]);
  const open = (e) => setEdit(e ? { id: e.id, name: e.name, rows: Object.entries(e.vars) } : { name: "", rows: [["BASE_URL", ""]] });
  const save = async () => {
    const vars = Object.fromEntries(edit.rows.filter(([k]) => k.trim()));
    try { if (edit.id) await api("/envs/" + edit.id, { method: "PATCH", body: { vars } }); else await api("/envs", { method: "POST", body: { name: edit.name, vars } }); setEdit(null); load(); refresh(); } catch (e) { setErr(e.message); }
  };
  const del = async (e) => { if (confirm(`Delete environment "${e.name}"?`)) { await api("/envs/" + e.id, { method: "DELETE" }); load(); refresh(); } };
  const setRow = (i, j, v) => setEdit({ ...edit, rows: edit.rows.map((r, x) => (x === i ? (j ? [r[0], v] : [v, r[1]]) : r)) });

  return (
    <>
      <div className="head"><div><h1>Environments</h1><p>Named sets of variables passed to a suite when it runs, for example the URL of the app under test. Pick one in the sidebar to run everything against it. Values whose name contains token, secret, password, key or auth are hidden here and redacted from logs.</p></div><div className="acts"><button className="btn go" onClick={() => open(null)}>+ New environment</button></div></div>
      {edit && (
        <div className="card">
          <h2>{edit.id ? `Edit ${edit.name}` : "New environment"}</h2>
          {!edit.id && <div style={{ margin: "10px 0", maxWidth: 320 }}><div className="hint" style={{ marginBottom: 4 }}>Name</div><input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} placeholder="staging" /></div>}
          <div style={{ marginTop: 10 }}>
            {edit.rows.map(([k, v], i) => (
              <div className="kv" key={i}>
                <input value={k} onChange={(e) => setRow(i, 0, e.target.value)} placeholder="NAME" />
                <input value={v} onChange={(e) => setRow(i, 1, e.target.value)} placeholder="value" />
                <button className="btn sm danger" onClick={() => setEdit({ ...edit, rows: edit.rows.filter((_, x) => x !== i) })}>✕</button>
              </div>))}
            <button className="btn sm" onClick={() => setEdit({ ...edit, rows: [...edit.rows, ["", ""]] })}>+ Add variable</button>
          </div>
          <div className="acts" style={{ marginTop: 14 }}><button className="btn go" onClick={save} disabled={!edit.name}>Save</button><button className="btn" onClick={() => setEdit(null)}>Cancel</button></div>
        </div>
      )}
      {!envs.length && !edit && <div className="card empty">No environments. Suites then run with only your shell&apos;s own variables.</div>}
      {envs.map((e) => (
        <div className="card" key={e.id}>
          <div className="repo"><div><h2>{e.name}</h2><div className="meta mono">{Object.entries(e.vars).map(([k, v]) => <div key={k}>{k}={v}</div>)}</div></div><div className="acts"><button className="btn sm" onClick={() => open(e)}>Edit</button><button className="btn sm danger" onClick={() => del(e)}>Delete</button></div></div>
        </div>))}
    </>
  );
}
