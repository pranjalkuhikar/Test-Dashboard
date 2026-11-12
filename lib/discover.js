// Looks inside a repo and proposes suites: package.json test scripts, Playwright configs, and TestLab's tests-generated/ folders.
import fs from "node:fs";
import path from "node:path";

const layerOf = (key, cmd) => {
  const s = `${key} ${cmd}`.toLowerCase();
  if (/pact/.test(s)) return "pact"; if (/contract/.test(s)) return "contract"; if (/a11y|axe/.test(s)) return "a11y"; if (/perf|lighthouse|k6/.test(s)) return "perf";
  if (/visual|screenshot/.test(s)) return "visual"; if (/security|zap/.test(s)) return "security"; if (/smoke/.test(s)) return "smoke";
  if (/e2e|playwright|cypress|end-to-end/.test(s)) return "e2e"; if (/integration|api/.test(s)) return "integration"; return "unit";
};
const readJson = (p) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } };
const NODE_TEST = "--test-reporter=spec --test-reporter-destination=stdout --test-reporter=junit --test-reporter-destination={{results}}";

export function discoverSuites(root) {
  const out = [];
  const add = (s) => { if (!out.some((x) => x.command === s.command && x.cwd === s.cwd)) out.push({ cwd: ".", setup: "", trace: "", ...s }); };
  const dirs = [".", ...fs.readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory() && !/^(node_modules|\.|dist|build|data)/.test(d.name)).map((d) => d.name)];
  for (const d of dirs) {
    const pkg = readJson(path.join(root, d, "package.json"));
    const where = d === "." ? "" : ` (${d})`;
    if (pkg?.scripts) for (const [key, cmd] of Object.entries(pkg.scripts)) {
      if (!/^test/.test(key) || /watch|--update|:ui|:debug/.test(key + cmd)) continue;
      const layer = layerOf(key, cmd), base = `npm run ${key} --`;
      let command, parser = "exit", extra = {};
      const node = cmd.match(/node\s+(?:--[\w-]+(?:=\S+)?\s+)*--test\s*(.*)$/);
      if (/playwright test/.test(cmd)) { command = `${base} --reporter=list,json`; parser = "playwright"; extra.trace = "retain-on-failure"; }
      else if (/\bvitest\b/.test(cmd)) { command = `${base} --reporter=json --outputFile={{results}}`; parser = "vitest"; }
      else if (/\bjest\b/.test(cmd)) { command = `${base} --json --outputFile={{results}}`; parser = "jest"; }
      else if (node) { command = `node --test ${NODE_TEST} ${node[1]}`.trim(); parser = "junit"; }
      else { command = `npm run ${key}`; }
      add({ name: `${key}${where}`, layer, cwd: d, command, parser, ...extra, note: parser === "exit" ? "Only pass/fail is known for this command (no per-test results)" : `Per-test results via ${parser}` });
    }
    if (["playwright.config.js", "playwright.config.mjs", "playwright.config.ts"].some((f) => fs.existsSync(path.join(root, d, f))) && !out.some((s) => s.parser === "playwright" && s.cwd === d)) add({ name: `playwright${where}`, layer: "e2e", cwd: d, command: "npx playwright test --reporter=list,json", parser: "playwright", trace: "retain-on-failure", note: "Needs BASE_URL (set it in an environment)" });
  }
  // TestLab output: tests-generated/ (unit, integration, contract, e2e) and site-tests/
  const tg = path.join(root, "tests-generated");
  if (fs.existsSync(tg)) {
    const has = (p) => fs.existsSync(path.join(tg, p)) && fs.readdirSync(path.join(tg, p)).some((f) => /\.test\.mjs$|\.spec\.mjs$/.test(f));
    if (has("unit")) add({ name: "generated unit tests", layer: "unit", command: `node --test ${NODE_TEST} "tests-generated/unit/*.test.mjs"`, parser: "junit", note: "From TestLab" });
    if (has("integration")) add({ name: "generated API tests", layer: "integration", command: `node --test ${NODE_TEST} "tests-generated/integration/*.test.mjs"`, parser: "junit", note: "From TestLab. Needs BASE_URL; these send real requests" });
    if (has("contract")) add({ name: "generated contract tests", layer: "contract", command: `node --test ${NODE_TEST} "tests-generated/contract/*.test.mjs"`, parser: "junit", note: "From TestLab. Needs BASE_URL" });
    if (fs.existsSync(path.join(tg, "e2e", "playwright.config.mjs"))) add({ name: "generated E2E tests", layer: "e2e", command: "npx playwright test --config tests-generated/e2e/playwright.config.mjs --reporter=list,json", parser: "playwright", trace: "retain-on-failure", note: "From TestLab. Needs BASE_URL" });
  }
  return out;
}
