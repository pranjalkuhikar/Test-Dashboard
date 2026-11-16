"use client";
import { useState } from "react";
import { api } from "./ui";

const EXAMPLES = ["jshttp/cookie", "tj/commander.js", "sindresorhus/p-limit"];

// The front door: paste any public GitHub repo (or a folder on this computer) and get a test analysis.
export default function Hero({ onDone, setErr }) {
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState("");
  async function go(v) {
    const value = (v ?? input).trim();
    if (!value || busy) return;
    setInput(value); setBusy("Fetching the repo…");
    const t = setTimeout(() => setBusy("Scanning for tests…"), 2500);
    try { const r = await api("/analyze", { method: "POST", body: { input: value } }); onDone(r); setInput(""); }
    catch (e) { setErr(e.message); }
    clearTimeout(t); setBusy("");
  }
  return (
    <section className="hero">
      <div className="glow" />
      <div className="hero-in">
        <span className="eyebrow">Test any repo in one step</span>
        <h1>Paste a repo. See every test it has,<br />what it needs, and run it.</h1>
        <p>Works with any public GitHub link or a project folder on this computer. Nothing runs until you say so.</p>
        <form className="heroform" onSubmit={(e) => { e.preventDefault(); go(); }}>
          <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="https://github.com/owner/repo   or   /Users/you/project" disabled={!!busy} spellCheck={false} />
          <button className="btn go big" disabled={!input.trim() || !!busy}>{busy ? <><span className="spin" />{busy}</> : "Analyze"}</button>
        </form>
        <div className="eg"><span>Try:</span>{EXAMPLES.map((x) => <button key={x} className="chipbtn" disabled={!!busy} onClick={() => go(x)}>{x}</button>)}</div>
      </div>
    </section>
  );
}
