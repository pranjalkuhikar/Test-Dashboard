// When a suite's command wraps the real test runner (a custom script, `make test`, …), the dashboard can't tell which flags to
// use. But most runners already write a report file somewhere (JUnit XML, or JSON). This finds the report(s) written DURING
// the run and reads every test from them, so a wrapped suite shows its real tests instead of one pass/fail line.
import fs from "node:fs";
import path from "node:path";
import { parseResults } from "./parsers.js";

const SKIP = new Set(["node_modules", ".git", ".next", "dist", "build", "coverage", ".cache", ".venv", "venv", "__pycache__", "vendor", "target", "playwright-report", "storybook-static"]);
const MAX_BYTES = 40_000_000;

// A common "standard report" shape: { tests: [{ name, file, status: PASSED|FAILED|ERROR|SKIPPED, durationMs, errorMessage, stackTrace }] }
function parseStandard(j) {
  return (j.tests || []).map((t) => {
    const s = String(t.status || "").toUpperCase();
    return { file: t.file || "", name: t.name || t.title || "", status: s === "PASSED" || s === "PASS" ? "passed" : s === "SKIPPED" || s === "PENDING" || s === "TODO" ? "skipped" : "failed",
      duration: Math.round(t.durationMs ?? t.duration ?? 0), retries: 0, error: s === "PASSED" || s === "PASS" || s === "SKIPPED" ? null : String(t.errorMessage || t.error || t.stackTrace || "failed").slice(0, 1200) };
  });
}
function tryParse(file, text) {
  try {
    if (/\.xml$/i.test(file)) return /<testsuites?\b/.test(text.slice(0, 4000)) ? parseResults("junit", text) : [];
    const j = JSON.parse(text);
    if (j && Array.isArray(j.tests) && j.tests.length && typeof j.tests[0] === "object" && /^[A-Za-z]+$/.test(String(j.tests[0].status || "")) && (j.tests[0].durationMs !== undefined || /^[A-Z]+$/.test(j.tests[0].status))) return parseStandard(j);
    if (j && Array.isArray(j.testResults)) return parseResults("jest", text);
    if (j && Array.isArray(j.suites) && (j.config || j.stats)) return parseResults("playwright", text);
    if (j && j.stats && Array.isArray(j.tests)) return parseResults("mocha", text);
  } catch {}
  return [];
}

export function autoParse(cwd, since) {
  const found = [];
  (function walk(dir, depth) {
    if (depth > 5) return;
    let ents; try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of ents) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) { if (!SKIP.has(e.name)) walk(p, depth + 1); continue; }
      if (!/\.(xml|json)$/i.test(e.name) || /package(-lock)?\.json$|tsconfig|\.eslintrc|composer\.json|manifest/i.test(e.name)) continue;
      let st; try { st = fs.statSync(p); } catch { continue; }
      if (st.size > MAX_BYTES || st.mtimeMs < since) continue; // only files written by THIS run: the run started at `since`, so older files belong to another suite
      let text; try { text = fs.readFileSync(p, "utf8"); } catch { continue; }
      const tests = tryParse(e.name, text);
      if (tests.length) found.push({ dir, file: path.relative(cwd, p), tests });
    }
  })(cwd, 0);
  // several files in one folder are usually the same tests in two formats (results.json + junit.xml): keep the fullest one per folder.
  // different folders (reports/unit, reports/e2e …) are different tests: add them up.
  const byDir = new Map();
  for (const f of found) { const best = byDir.get(f.dir); if (!best || f.tests.length > best.tests.length) byDir.set(f.dir, f); }
  const used = [...byDir.values()];
  return { tests: used.flatMap((f) => f.tests), files: used.map((f) => f.file) };
}
