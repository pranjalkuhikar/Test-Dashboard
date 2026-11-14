"use client";
import { useEffect, useState, useCallback } from "react";
import { api, ago, layerName, LAYER_INFO } from "./ui";

export default function Repos({ setErr, refresh }) {
  const [repos, setRepos] = useState([]);
  const [form, setForm] = useState(null);
  const [found, setFound] = useState(null); // { repoId, items, pick }
  const [msg, setMsg] = useState("");
  const load = useCallback(async () => { try { setRepos((await api("/repos")).repos); } catch (e) { setErr(e.message); } }, [setErr]);
  useEffect(() => { load(); }, [load]);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value });

  const add = async () => { try { const r = await api("/repos", { method: "POST", body: form }); setForm(null); if (r.error) setErr("Added, but sync failed: " + r.error); load(); refresh(); } catch (e) { setErr(e.message); } };
  const sync = async (r) => { setMsg(`Syncing ${r.name}…`); const x = await api(`/repos/${r.id}/sync`, { method: "POST" }); setMsg(x.error ? "" : `${r.name} is at ${x.commit}`); if (x.error) setErr(x.error); load(); };
  const trust = async (r) => {
    if (!r.trusted && !confirm(`Trust "${r.name}"?\n\nTest suites are shell commands. Trusting this repo lets Test Dashboard run whatever its suites say, with your user's permissions. Only trust code you wrote or have read.`)) return;
    await api("/repos/" + r.id, { method: "PATCH", body: { trusted: !r.trusted } }); load();
  };
  const del = async (r) => { if (confirm(`Remove "${r.name}" and all its suites and history from Test Dashboard? Your files are not touched.`)) { await api("/repos/" + r.id, { method: "DELETE" }); load(); refresh(); } };
  const find = async (r) => { try { const { found: items } = await api(`/repos/${r.id}/discover`); setFound({ repo: r, items, pick: Object.fromEntries(items.map((s, i) => [i, !s.exists])) }); } catch (e) { setErr(e.message); } };
  const doImport = async () => {
    const suites = found.items.filter((_, i) => found.pick[i]);
    const x = await api(`/repos/${found.repo.id}/import`, { method: "POST", body: { suites } });
    setMsg(`Added ${x.added} suite${x.added === 1 ? "" : "s"} from ${found.repo.name}.`); setFound(null); load(); refresh();
  };

  return (
    <>
      <div className="head"><div><h1>Repos</h1><p>Two kinds: <b>app repos</b> hold an app and its own unit tests; a <b>tests repo</b> holds cross-app suites such as integration, contract, Pact and E2E.</p></div>
        <div className="acts"><button className="btn go" onClick={() => setForm({ name: "", kind: "tests", source: "local", path: "", url: "", branch: "", trusted: false })}>+ Add repo</button></div></div>
      {msg && <div className="okbox" onClick={() => setMsg("")}>{msg}</div>}

      {form && (
        <div className="card">
          <h2>Add a repo</h2>
          <div className="form" style={{ marginTop: 12 }}>
            <div><label>Name</label><input value={form.name} onChange={set("name")} placeholder="central-tests" /></div>
            <div><label>Kind</label><select value={form.kind} onChange={set("kind")}><option value="tests">Tests repo (cross-app suites)</option><option value="app">App repo (its own unit tests)</option></select></div>
            <div><label>Where is it</label><select value={form.source} onChange={set("source")}><option value="local">A folder on this computer</option><option value="git">A Git URL (clone it)</option></select></div>
            {form.source === "local" ? <div className="wide"><label>Folder path</label><input value={form.path} onChange={set("path")} placeholder="/Users/you/projects/central-tests" /></div>
              : <><div className="wide"><label>Git URL</label><input value={form.url} onChange={set("url")} placeholder="https://github.com/you/central-tests.git" /></div><div><label>Branch (optional)</label><input value={form.branch} onChange={set("branch")} placeholder="main" /></div></>}
            <div className="wide warnbox"><label style={{ display: "flex", gap: 8, alignItems: "flex-start", color: "inherit", fontSize: 12.5 }}><input type="checkbox" checked={form.trusted} onChange={set("trusted")} style={{ marginTop: 3 }} /><span><b>I trust this code.</b> Suites are shell commands, and Test Dashboard runs them as you. A repo that isn&apos;t trusted can be added and browsed, but nothing in it will run.</span></label></div>
          </div>
          <div className="acts" style={{ marginTop: 14 }}><button className="btn go" onClick={add} disabled={!form.name || !(form.source === "git" ? form.url : form.path)}>Add</button><button className="btn" onClick={() => setForm(null)}>Cancel</button></div>
        </div>
      )}

      {found && (
        <div className="card">
          <h2>Suites found in {found.repo.name}</h2>
          <p className="muted small">Read from package.json scripts, Playwright configs and TestLab&apos;s tests-generated folder. Tick what to add; you can change the layer.</p>
          {!found.items.length ? <div className="empty">Nothing recognisable. Add a suite by hand on the Suites page.</div> : (
            <div className="scroll"><table className="tbl" style={{ marginTop: 10 }}>
              <thead><tr><th /><th>Name</th><th>Layer</th><th>Command</th></tr></thead>
              <tbody>{found.items.map((s, i) => (
                <tr key={i}>
                  <td><input type="checkbox" checked={!!found.pick[i]} disabled={s.exists} onChange={(e) => setFound({ ...found, pick: { ...found.pick, [i]: e.target.checked } })} /></td>
                  <td>{s.name}{s.exists && <span className="pill" style={{ marginLeft: 6 }}>already added</span>}<div className="small muted">{s.note}</div></td>
                  <td><select value={s.layer} onChange={(e) => { const items = found.items.slice(); items[i] = { ...s, layer: e.target.value }; setFound({ ...found, items }); }}>{Object.keys(LAYER_INFO).map((l) => <option key={l} value={l}>{layerName(l)}</option>)}</select></td>
                  <td className="mono muted" style={{ maxWidth: 420, overflowWrap: "anywhere" }}>{s.command}</td>
                </tr>))}</tbody>
            </table></div>)}
          <div className="acts" style={{ marginTop: 14 }}><button className="btn go" onClick={doImport} disabled={!Object.values(found.pick).some(Boolean)}>Add selected</button><button className="btn" onClick={() => setFound(null)}>Close</button></div>
        </div>
      )}

      {!repos.length && !form && <div className="card empty">No repos yet.</div>}
      {repos.map((r) => (
        <div className="card" key={r.id}>
          <div className="repo">
            <div>
              <h2>{r.name} <span className={`pill ${r.kind === "tests" ? "teal" : "blue"}`}>{r.kind === "tests" ? "tests repo" : "app repo"}</span> <span className={`pill ${r.trusted ? "good" : "amber"}`}>{r.trusted ? "trusted" : "not trusted"}</span></h2>
              <div className="meta">{r.source === "git" ? r.url : r.path}</div>
              <div className="meta">{r.suites} suite{r.suites === 1 ? "" : "s"} · {r.last_commit ? `commit ${r.last_commit}` : "no commit info"} · synced {ago(r.last_sync_at)}</div>
              {r.last_error && <div className="meta bad">{r.last_error}</div>}
            </div>
            <div className="acts">
              <button className="btn sm go" onClick={() => find(r)}>Find suites</button>
              <button className="btn sm" onClick={() => sync(r)}>{r.source === "git" ? "Pull latest" : "Re-read"}</button>
              <button className="btn sm" onClick={() => trust(r)}>{r.trusted ? "Stop trusting" : "Trust"}</button>
              <button className="btn sm danger" onClick={() => del(r)}>Remove</button>
            </div>
          </div>
        </div>
      ))}
    </>
  );
}
