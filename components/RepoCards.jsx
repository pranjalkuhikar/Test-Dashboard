"use client";
import { useEffect, useState } from "react";
import { repoHealth } from "./Hub";

// "Your repos": a row of pastel cards, like the assets in the reference. Click a card to select it; ⋮ for more.
const glyph = (n) => (n.match(/[A-Za-z0-9]/)?.[0] || "?").toUpperCase();
export default function RepoCards({ repos, sel, toggle, only, removeRepo, setAll, onAdd }) {
  const [menu, setMenu] = useState(null);
  useEffect(() => { const c = (e) => { if (!e.target.closest?.(".dotsbtn, .rmenu")) setMenu(null); }; document.addEventListener("click", c); return () => document.removeEventListener("click", c); }, []);
  return (
    <div className="repocards">
      {repos.map((r, i) => {
        const h = repoHealth(r), on = sel ? sel.has(r.id) : true;
        const tests = r.uniq?.total || 0, passed = r.uniq?.passed || 0;
        const pct = tests ? Math.round((passed / tests) * 100) : null;
        return (
          <div key={r.id} className={`rcard c${i % 6} ${on ? "on" : ""}`} onClick={() => toggle(r.id)} title={`${r.name}\n${r.path}`}>
            {on && <span className="tick">✓</span>}
            <div className="rtop"><b><span className={`health ${h === "passed" ? "good" : h === "failed" ? "bad" : h === "running" ? "run" : ""}`} />{r.name}</b>
              <button className="dotsbtn" aria-label="More" onClick={(e) => { e.stopPropagation(); setMenu(menu === r.id ? null : r.id); }}>⋮</button></div>
            {menu === r.id && (
              <div className="rmenu" onClick={(e) => e.stopPropagation()}>
                <button onClick={() => { only(r.id); setMenu(null); }}>Show only this</button>
                <button className="rm" onClick={() => { setMenu(null); removeRepo(r); }}>Remove…</button>
              </div>
            )}
            <div className="rval">{tests ? `${passed}/${tests} tests` : h === "failed" ? "Last run failed" : h === "running" ? "Running…" : "No results yet"}</div>
            <div className="rsub">{r.suites.length} suite{r.suites.length === 1 ? "" : "s"} · {r.kind === "tests" ? "tests repo" : "app"}</div>
            <div className="rbot"><span className="tile">{glyph(r.name)}</span><span className={`chg ${h === "failed" ? "bad" : pct != null ? "good" : "idle"}`}>{pct != null ? `${h === "failed" ? "" : "+"}${pct}%` : h === "failed" ? "Failed" : "–"}</span></div>
          </div>
        );
      })}
      <div className="rcard add" onClick={onAdd}><span className="tile" style={{ background: "#fff" }}>+</span><b>Add repo</b><span className="small">folder or GitHub link</span></div>
    </div>
  );
}
