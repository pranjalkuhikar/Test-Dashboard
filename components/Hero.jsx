"use client";
import { useState } from "react";
import { api } from "./ui";

// The dark promo card (like "Earn free crypto" in the reference): paste a repo link or folder and analyze it.
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
    <aside className="promo">
      <span className="eyebrow">Test any repo in one step</span>
      <h3>Paste a repo and see every <em>test</em> it has, and what it needs.</h3>
      <p>Any public GitHub link, or a project folder on this computer. Nothing runs until you say so.</p>
      <form onSubmit={(e) => { e.preventDefault(); go(); }}>
        <input id="analyze-input" value={input} onChange={(e) => setInput(e.target.value)} placeholder="https://github.com/owner/repo or /path/to/project" disabled={!!busy} spellCheck={false} />
        <button className="btn sky big" disabled={!input.trim() || !!busy}>{busy ? <><span className="spin" />{busy}</> : "Analyze now"}</button>
      </form>
    </aside>
  );
}
