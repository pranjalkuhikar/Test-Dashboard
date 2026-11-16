"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "./ui";

// "Results": the big pale-blue card. Pick a period (1 day … 30 days, or your own dates) and the chart and the
// numbers follow it. Short periods are shown per hour, longer ones per day.
const PRESETS = [["1D", "Last 24 hours", 24], ["2D", "Last 48 hours", 48], ["7D", "Last 7 days", 7], ["14D", "Last 14 days", 14], ["30D", "Last 30 days", 30]];
const iso = (d) => { const z = (n) => String(n).padStart(2, "0"); return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`; };
const startOfDay = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d, 0, 0, 0, 0).getTime(); };
const endOfDay = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d, 23, 59, 59, 999).getTime(); };
function rangeOf(sel, now = Date.now()) {
  if (sel.preset === "custom") { if (!sel.from || !sel.to || sel.from > sel.to) return null; return { from: startOfDay(sel.from), to: Math.min(endOfDay(sel.to), now) }; }
  const p = PRESETS.find((x) => x[0] === sel.preset) || PRESETS[2];
  if (p[0] === "1D" || p[0] === "2D") return { from: now - p[2] * 3600e3, to: now }; // rolling hours
  const d = new Date(now); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - (p[2] - 1)); return { from: d.getTime(), to: now }; // whole calendar days, today included
}
function smooth(pts) {
  if (pts.length < 2) return "";
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) { const [x0, y0] = pts[i], [x1, y1] = pts[i + 1], mx = (x0 + x1) / 2; d += ` C${mx},${y0} ${mx},${y1} ${x1},${y1}`; }
  return d;
}
const fmt = (t, bucket) => new Date(t).toLocaleString("en-GB", bucket === "hour" ? { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" } : { day: "numeric", month: "short" });

export default function ResultsCard({ selected, tick }) {
  const [sel, setSel] = useState({ preset: "7D", from: "", to: "" });
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");
  const [hover, setHover] = useState(null);
  const box = useRef(null);
  const ids = useMemo(() => selected.map((r) => r.id).join(","), [selected]);

  useEffect(() => { try { const s = JSON.parse(localStorage.getItem("th.range") || "null"); if (s?.preset) setSel(s); } catch {} }, []);
  const choose = (next) => { setSel(next); setHover(null); try { localStorage.setItem("th.range", JSON.stringify(next)); } catch {} };

  const range = useMemo(() => rangeOf(sel), [sel, tick]);
  useEffect(() => {
    if (!range) { setErr(sel.from && sel.to && sel.from > sel.to ? "The start date is after the end date" : "Pick a start and an end date"); return; }
    let on = true; setErr("");
    api(`/trend?from=${range.from}&to=${range.to}&repos=${ids || 0}`).then((d) => on && setData(d)).catch((e) => on && setErr(e.message));
    return () => { on = false; };
  }, [range?.from, range?.to, ids, tick]); // eslint-disable-line react-hooks/exhaustive-deps

  const pts0 = data?.points || [], bucket = data?.bucket || "day", s = data?.summary;
  const W = 420, H = 110, pad = 6, max = Math.max(1, ...pts0.map((d) => d.passed + d.failed));
  const pts = pts0.map((d, i) => [pts0.length > 1 ? (i / (pts0.length - 1)) * W : W / 2, H - pad - ((d.passed + d.failed) / max) * (H - pad * 3)]);
  const line = smooth(pts), area = pts.length > 1 ? `${line} L${W},${H} L0,${H} Z` : "";
  const hi = hover ?? (pts.length ? pts.length - 1 : null);
  const onMove = (e) => { const r = box.current.getBoundingClientRect(); const x = ((e.clientX - r.left) / r.width) * W; let best = 0; pts.forEach((p, i) => { if (Math.abs(p[0] - x) < Math.abs(pts[best][0] - x)) best = i; }); setHover(best); };
  const label = sel.preset === "custom" ? (range ? `${fmt(range.from, "day")} to ${fmt(range.to, "day")}` : "custom dates") : (PRESETS.find((x) => x[0] === sel.preset) || PRESETS[2])[1].toLowerCase();
  const total = s ? s.passed + s.failed : 0;
  const today = iso(new Date());

  return (
    <div className="resultcard">
      <span className="more">⋮</span>
      <div className="big">{s ? (s.runs ? `${s.passed} / ${total}` : "No runs yet") : "…"}</div>
      <div className="lbl">{!s ? "Loading…" : s.runs ? `Tests passed · ${label} · ${s.runs} run${s.runs === 1 ? "" : "s"}${s.failed ? ` · ${s.failed} failed` : ""}` : `Nothing ran in ${label}`}</div>
      <div className="spark" ref={box} onMouseMove={pts.length > 1 ? onMove : undefined} onMouseLeave={() => setHover(null)}>
        {pts.length > 1 ? (
          <>
            <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
              <defs><linearGradient id="sg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#9cc9f4" stopOpacity=".55" /><stop offset="1" stopColor="#9cc9f4" stopOpacity="0" /></linearGradient></defs>
              <path d={area} fill="url(#sg)" /><path d={line} fill="none" stroke="#7fb7ee" strokeWidth="2" vectorEffect="non-scaling-stroke" />
              {hi != null && <line x1={pts[hi][0]} x2={pts[hi][0]} y1={pts[hi][1]} y2={H} stroke="#7fb7ee" strokeDasharray="3 4" vectorEffect="non-scaling-stroke" />}
            </svg>
            {hi != null && <><span style={{ position: "absolute", left: `${(pts[hi][0] / W) * 100}%`, top: `${(pts[hi][1] / H) * 100}%`, width: 12, height: 12, borderRadius: "50%", background: "#3d8fe3", border: "2.5px solid #fff", transform: "translate(-50%,-50%)", boxShadow: "0 2px 6px #0003" }} />
              <span className="sparktip" style={{ left: `${Math.min(70, Math.max(30, (pts[hi][0] / W) * 100))}%`, top: `${(pts[hi][1] / H) * 100}%` }}>{fmt(pts0[hi].t, bucket)} · {pts0[hi].passed + pts0[hi].failed ? `${pts0[hi].passed} passed${pts0[hi].failed ? `, ${pts0[hi].failed} failed` : ""}` : "no runs"}</span></>}
          </>
        ) : <div className="lbl" style={{ paddingTop: 30, textAlign: "center" }}>{err || "Not enough time in this range to draw a chart."}</div>}
      </div>
      {pts0.length > 1 && <div className="axis"><span>{fmt(pts0[0].t, bucket)}</span><span>{bucket === "hour" ? "per hour" : "per day"}</span><span>{fmt(pts0[pts0.length - 1].t, bucket)}</span></div>}
      <div className="tchips">
        {PRESETS.map(([k]) => <button key={k} className={sel.preset === k ? "on" : ""} onClick={() => choose({ ...sel, preset: k })}>{k}</button>)}
        <button className={sel.preset === "custom" ? "on" : ""} onClick={() => choose({ preset: "custom", from: sel.from || iso(new Date(Date.now() - 6 * 864e5)), to: sel.to || today })}>Custom</button>
      </div>
      {sel.preset === "custom" && (
        <div className="datepick">
          <label>From <input type="date" value={sel.from} max={today} onChange={(e) => choose({ ...sel, from: e.target.value })} /></label>
          <label>To <input type="date" value={sel.to} max={today} onChange={(e) => choose({ ...sel, to: e.target.value })} /></label>
          {err && <span className="small bad">{err}</span>}
        </div>
      )}
    </div>
  );
}
