"use client";
export async function api(path, opts = {}) {
  const res = await fetch("/api" + path, { ...opts, headers: { "content-type": "application/json", ...(opts.headers || {}) }, body: opts.body ? JSON.stringify(opts.body) : undefined });
  let data = null; try { data = await res.json(); } catch {}
  if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`);
  return data;
}
export const ms = (n) => (n == null ? "-" : n < 1000 ? `${n} ms` : n < 60000 ? `${(n / 1000).toFixed(1)} s` : `${Math.floor(n / 60000)}m ${Math.round((n % 60000) / 1000)}s`);
export const ago = (t) => { if (!t) return "never"; const s = Math.round((Date.now() - t) / 1000); return s < 5 ? "just now" : s < 60 ? `${s}s ago` : s < 3600 ? `${Math.floor(s / 60)}m ago` : s < 86400 ? `${Math.floor(s / 3600)}h ago` : `${Math.floor(s / 86400)}d ago`; };
export const bytes = (n) => (n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(0)} KB` : `${(n / 1048576).toFixed(1)} MB`);
const TONE = { passed: "good", failed: "bad", error: "amber", running: "run", queued: "blue", cancelled: "" , skipped: "" };
export function Status({ s }) { return <span className={`pill ${TONE[s] ?? ""}`}>{s === "running" ? "● running" : s || "never run"}</span>; }
export const LAYER_INFO = {
  unit: ["Unit", "One function or module, no network. Fast, lots of them."],
  integration: ["Integration", "Several parts together, e.g. an API with its database."],
  contract: ["Contract", "The shape of what one service promises another."],
  pact: ["Pact", "Consumer-driven contracts checked against the real provider."],
  e2e: ["E2E", "A real browser clicking through the real app."],
  smoke: ["Smoke", "A few checks that the app is alive after a deploy."], a11y: ["Accessibility", "Automated accessibility checks."], perf: ["Performance", "Speed and load checks."], visual: ["Visual", "Screenshot comparisons."], security: ["Security", "Security scans."],
};
export const layerName = (l) => LAYER_INFO[l]?.[0] || l;
