// Static analysis of a repo: what tests exist, which layers they belong to, and what is missing.
// Nothing in the repo is executed here, so it is safe to run on code you have not read.
import fs from "node:fs";
import path from "node:path";

const SKIP = new Set(["node_modules", ".git", ".next", "dist", "build", "coverage", "out", ".turbo", ".cache", "vendor", "target", "__pycache__", ".venv", "venv", "env", ".idea", ".vscode", ".gradle", "bower_components", ".nuxt", ".svelte-kit", "storybook-static"]);
const MAX_FILES = 8000, MAX_BYTES = 400_000;
const JS = /\.(js|jsx|ts|tsx|mjs|cjs|vue|svelte)$/;

function walk(root) {
  const files = [];
  (function rec(dir, depth) {
    if (files.length >= MAX_FILES || depth > 9) return;
    let ents; try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of ents) {
      if (e.name.startsWith(".") && e.name !== ".github") { if (e.isDirectory()) continue; }
      const p = path.join(dir, e.name);
      if (e.isDirectory()) { if (!SKIP.has(e.name)) rec(p, depth + 1); }
      else if (e.isFile()) files.push({ abs: p, rel: path.relative(root, p).split(path.sep).join("/") });
    }
  })(root, 0);
  return files;
}
const read = (f) => { try { const s = fs.statSync(f.abs); return s.size > MAX_BYTES ? null : fs.readFileSync(f.abs, "utf8"); } catch { return null; } };
const stripJs = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

// ---- how many test cases does one file hold? ----
const COUNT = {
  js: (s) => (stripJs(s).match(/(^|[^\w.$])(it|test)(\.(only|skip|todo|concurrent|fails))?\s*\(/gm) || []).length + (stripJs(s).match(/(^|[^\w.$])(it|test)\.each\s*[(`]/g) || []).length,
  py: (s) => (s.match(/^\s*(async\s+)?def\s+test_\w+/gm) || []).length,
  go: (s) => (s.match(/^func\s+(Test|Benchmark)\w+\s*\(/gm) || []).length,
  java: (s) => (s.match(/@(Test|ParameterizedTest)\b/g) || []).length,
  rb: (s) => (s.match(/^\s*(it|specify|scenario)\s+['"]/gm) || []).length,
};
function testKind(rel) {
  const b = rel.split("/").pop();
  if (/\.(test|spec)\.(js|jsx|ts|tsx|mjs|cjs)$/.test(b) || /(^|\/)(__tests__|tests?|e2e|cypress|spec)\//i.test(rel) && JS.test(b)) return "js";
  if (/(^|\/)test_[^/]+\.py$|_test\.py$|(^|\/)tests?\/.+\.py$/.test(rel)) return "py";
  if (/_test\.go$/.test(rel)) return "go";
  if (/(^|\/)src\/test\/.+\.(java|kt)$/.test(rel) || /Test\.(java|kt)$/.test(b)) return "java";
  if (/_spec\.rb$/.test(rel)) return "rb";
  return null;
}
function layerOf(rel, src) {
  const p = rel.toLowerCase(), s = src || "";
  if (/pact/.test(p) || /@pact-foundation|pact-python|from pact/.test(s)) return "pact";
  if (/contract|schemathesis|openapi/.test(p) || /schemathesis|dredd/.test(s)) return "contract";
  if (/(^|\/)(e2e|end-to-end|cypress|playwright|selenium|webdriver)(\/|\.|-|_)/.test(p) || /@playwright\/test|from ['"]cypress|puppeteer|selenium|webdriverio|page\.goto\(|cy\.visit\(/.test(s)) return "e2e";
  if (/toHaveScreenshot|percy|chromatic|backstop/.test(s)) return "visual";
  if (/axe-core|jest-axe|cypress-axe|pa11y/.test(s)) return "a11y";
  if (/k6|artillery|lighthouse|autocannon|locust/.test(s + p)) return "perf";
  if (/(^|\/)(integration|int|api|routes?|controllers?|handlers?|endpoints?)(\/|\.|-|_)/.test(p) || /supertest|testcontainers|requests\.(get|post)|httpx|TestClient\(|webtestclient|MockMvc|net\/http\/httptest/i.test(s)) return "integration";
  if (/@testing-library|enzyme|react-test-renderer|@vue\/test-utils|mount\(|render\(\s*</.test(s)) return "component";
  return "unit";
}

// ---- project facts ----
const DEP_INFO = {
  frameworks: { next: "Next.js", react: "React", vue: "Vue", "@angular/core": "Angular", svelte: "Svelte", express: "Express", fastify: "Fastify", koa: "Koa", "@nestjs/core": "NestJS", hono: "Hono", "react-native": "React Native", nuxt: "Nuxt", remix: "Remix", "@remix-run/node": "Remix", gatsby: "Gatsby", electron: "Electron" },
  testTools: { jest: "Jest", vitest: "Vitest", mocha: "Mocha", ava: "AVA", jasmine: "Jasmine", tap: "tap", "@playwright/test": "Playwright", playwright: "Playwright", cypress: "Cypress", puppeteer: "Puppeteer", supertest: "Supertest", "@pact-foundation/pact": "Pact", "@testing-library/react": "Testing Library", "@testing-library/vue": "Testing Library", "@testing-library/dom": "Testing Library", "@testing-library/jest-dom": "Testing Library", webdriverio: "WebdriverIO", nightwatch: "Nightwatch", testcafe: "TestCafe", "jest-axe": "jest-axe", msw: "MSW", nock: "nock", sinon: "Sinon", chai: "Chai" },
};
function pkgFacts(root, files) {
  const out = { frameworks: new Set(), testTools: new Set(), scripts: [], pkgs: 0, deps: new Set() };
  for (const f of files.filter((f) => /(^|\/)package\.json$/.test(f.rel) && f.rel.split("/").length <= 4)) {
    let j; try { j = JSON.parse(fs.readFileSync(f.abs, "utf8")); } catch { continue; }
    out.pkgs++;
    const deps = { ...j.dependencies, ...j.devDependencies, ...j.peerDependencies };
    for (const d of Object.keys(deps)) { out.deps.add(d); if (DEP_INFO.frameworks[d]) out.frameworks.add(DEP_INFO.frameworks[d]); if (DEP_INFO.testTools[d]) out.testTools.add(DEP_INFO.testTools[d]); }
    for (const [k, v] of Object.entries(j.scripts || {})) if (/^test|^e2e|^cypress|^playwright/.test(k)) out.scripts.push({ pkg: path.dirname(f.rel), name: k, cmd: String(v).slice(0, 160) });
    if (j.scripts && Object.values(j.scripts).some((v) => /node\s+(--[\w=.-]+\s+)*--test/.test(v))) out.testTools.add("node:test");
  }
  return out;
}
function countRoutes(files, srcOf) {
  let n = 0;
  for (const f of files) {
    if (/(^|\/)app\/.*route\.(js|ts|mjs)$/.test(f.rel) && !/node_modules/.test(f.rel)) { const s = srcOf(f) || ""; n += Math.max(1, (s.match(/export\s+(async\s+)?(function|const)\s+(GET|POST|PUT|PATCH|DELETE)\b/g) || []).length); continue; }
    if (/(^|\/)pages\/api\/.+\.(js|ts)$/.test(f.rel)) { n++; continue; }
    if (!JS.test(f.rel) && !/\.py$/.test(f.rel) && !/\.go$/.test(f.rel)) continue;
    if (testKind(f.rel)) continue;
    const s = srcOf(f); if (!s) continue;
    if (JS.test(f.rel)) n += (s.match(/\b(app|router|server|fastify|api|routes?)\.(get|post|put|patch|delete|all)\s*\(\s*['"`]/g) || []).length;
    else if (/\.py$/.test(f.rel)) n += (s.match(/@\w+\.(route|get|post|put|patch|delete)\s*\(/g) || []).length;
    else n += (s.match(/\.(HandleFunc|Handle|GET|POST|PUT|DELETE)\s*\(\s*"/g) || []).length;
  }
  return n;
}

export function analyzeRepo(root) {
  const files = walk(root);
  const cache = new Map();
  const srcOf = (f) => (cache.has(f.rel) ? cache.get(f.rel) : (cache.set(f.rel, read(f)), cache.get(f.rel)));

  // existing tests
  const layers = {}; const testFiles = []; let emptyTestFiles = 0;
  for (const f of files) {
    const kind = testKind(f.rel); if (!kind) continue;
    const src = srcOf(f); if (src == null) continue;
    const n = COUNT[kind](src);
    if (!n) { emptyTestFiles++; continue; }
    const layer = layerOf(f.rel, src);
    (layers[layer] ||= { layer, files: 0, tests: 0 }); layers[layer].files++; layers[layer].tests += n;
    testFiles.push({ file: f.rel, layer, tests: n, lang: kind });
  }
  const testSet = new Set(testFiles.map((t) => t.file));

  // source facts
  const src = files.filter((f) => !testKind(f.rel) && !testSet.has(f.rel));
  const langCount = {};
  for (const f of src) { const e = path.extname(f.rel).slice(1); const L = { js: "JavaScript", jsx: "JavaScript", mjs: "JavaScript", cjs: "JavaScript", ts: "TypeScript", tsx: "TypeScript", py: "Python", go: "Go", java: "Java", kt: "Kotlin", rb: "Ruby", rs: "Rust", php: "PHP", vue: "Vue", svelte: "Svelte" }[e]; if (L) langCount[L] = (langCount[L] || 0) + 1; }
  const languages = Object.entries(langCount).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([name, files]) => ({ name, files }));
  const pk = pkgFacts(root, files);
  const routes = countRoutes(src, srcOf);
  const uiFiles = src.filter((f) => /\.(jsx|tsx|vue|svelte)$/.test(f.rel) || /(^|\/)(pages|templates|views)\/.+\.(html|ejs|hbs|pug)$/.test(f.rel)).length;
  const hasUI = uiFiles > 0 || ["React", "Vue", "Angular", "Svelte", "Next.js", "Nuxt", "Remix", "Gatsby"].some((x) => pk.frameworks.has(x));
  const openapi = files.some((f) => /(^|\/)(openapi|swagger)[^/]*\.(json|ya?ml)$/i.test(f.rel));
  const compose = files.find((f) => /(^|\/)docker-compose[^/]*\.ya?ml$/.test(f.rel));
  let composeServices = 0; if (compose) { const s = srcOf(compose) || ""; const i = s.indexOf("services:"); if (i >= 0) composeServices = (s.slice(i + 9).split(/\n(?=\S)/)[0].match(/^ {2}[\w.-]+:\s*$/gm) || []).length; }
  const multiService = composeServices >= 3 || pk.pkgs >= 3;
  let units = 0;
  for (const f of src) {
    if (!/\.(js|jsx|ts|tsx|mjs|cjs)$/.test(f.rel) || /\.(config|d)\.(js|ts|mjs)$|(^|\/)(config|public|scripts|migrations?)\//.test(f.rel)) continue;
    const s = srcOf(f); if (!s) continue;
    units += (s.match(/^\s*(export\s+(default\s+)?)?(async\s+)?function\s+[a-z_$]\w*|^\s*export\s+const\s+[a-z_$]\w*\s*=\s*(async\s*)?(\([^)]*\)|\w+)\s*=>|^\s*(module\.)?exports\.\w+\s*=/gim) || []).length;
  }
  const pyUnits = src.filter((f) => f.rel.endsWith(".py")).reduce((a, f) => a + ((srcOf(f) || "").match(/^\s*def\s+[a-z]\w*/gm) || []).length, 0);
  units += pyUnits;

  // a repo that is mostly tests (like a shared "central tests" repo) has no source to measure tests against
  const codeSrc = src.filter((f) => /\.(js|jsx|ts|tsx|mjs|cjs|py|go|java|kt|rb)$/.test(f.rel)).length;
  const testsOnly = testFiles.length > 0 && routes === 0 && !hasUI && testFiles.length >= codeSrc;

  // what we would suggest (deliberately modest: a floor to aim for, not a quota)
  const suggest = testsOnly ? {} : {
    unit: units ? Math.min(Math.max(Math.round(units * 1.5), 5), 400) : 0,
    integration: routes ? Math.min(routes * 2, 200) : 0,
    contract: openapi || multiService ? Math.max(3, Math.min(routes, 30)) : 0,
    pact: multiService && routes > 0 ? 3 : 0,
    e2e: hasUI ? 5 : 0,
    component: hasUI && uiFiles >= 3 ? Math.min(uiFiles, 20) : 0,
  };
  const order = ["unit", "component", "integration", "contract", "pact", "e2e", "visual", "a11y", "perf"];
  const layerRows = order.map((l) => ({ layer: l, files: layers[l]?.files || 0, found: layers[l]?.tests || 0, suggested: suggest[l] || 0 }))
    .filter((r) => r.found || r.suggested);
  for (const l of Object.keys(layers)) if (!order.includes(l)) layerRows.push({ layer: l, files: layers[l].files, found: layers[l].tests, suggested: 0 });

  const totalTests = testFiles.reduce((a, t) => a + t.tests, 0);
  const needed = layerRows.filter((r) => r.suggested > 0);
  const score = needed.length ? Math.round((needed.reduce((a, r) => a + Math.min(r.found / r.suggested, 1), 0) / needed.length) * 100) : (totalTests ? 100 : 0);

  // plain-language findings
  const findings = [];
  const add = (level, title, detail) => findings.push({ level, title, detail });
  const row = (l) => layerRows.find((r) => r.layer === l);
  if (!totalTests) add("bad", "No automated tests found", "No test files with test cases were detected. A good first step is a handful of unit tests for the core logic.");
  else add("good", `${totalTests} test${totalTests === 1 ? "" : "s"} across ${testFiles.length} file${testFiles.length === 1 ? "" : "s"}`, `Detected: ${[...new Set(testFiles.map((t) => t.lang))].map((x) => ({ js: "JavaScript/TypeScript", py: "Python", go: "Go", java: "Java/Kotlin", rb: "Ruby" }[x])).join(", ")}.`);
  if (suggest.unit && (row("unit")?.found || 0) < suggest.unit * 0.5) add("warn", "Unit tests are thin", `About ${units} functions found, ${row("unit")?.found || 0} unit tests. Aim for roughly ${suggest.unit}: happy path plus an edge case per function.`);
  if (routes && (row("integration")?.found || 0) < routes) add("warn", "API routes lack integration tests", `${routes} route${routes === 1 ? "" : "s"} found but ${row("integration")?.found || 0} integration test${(row("integration")?.found || 0) === 1 ? "" : "s"}. Test each route for success and for bad input.`);
  if (hasUI && !(row("e2e")?.found)) add("bad", "No end-to-end tests", `This looks like a web app${uiFiles ? ` (${uiFiles} UI files)` : ""}, but nothing drives a real browser. Cover 3 to 5 key journeys such as sign in, create, edit.`);
  if ((openapi || multiService) && !(row("contract")?.found)) add("warn", "No contract tests", openapi ? "An OpenAPI spec exists, so responses can be checked against it automatically." : "Several services or packages were found; contract tests catch breaking changes between them.");
  if (multiService && routes && !(row("pact")?.found)) add("info", "Consider Pact (consumer-driven contracts)", "With several services, Pact lets each consumer state what it needs from a provider.");
  if (emptyTestFiles) add("info", `${emptyTestFiles} test file${emptyTestFiles === 1 ? "" : "s"} without test cases`, "These files look like helpers, fixtures or empty suites. They are not counted.");
  if (totalTests && !pk.scripts.length && !files.some((f) => /pytest\.ini|pyproject\.toml|go\.mod|pom\.xml|build\.gradle/.test(f.rel))) add("warn", "No test command found", "There is no `test` script in package.json, so the dashboard can't know how to run these tests. Add one.");
  if (testsOnly) add("info", "This looks like a tests-only repo", "It is mostly test files with little application code, so there is nothing to measure the tests against. Point the tests at the app they cover.");
  if (!findings.some((f) => f.level === "bad" || f.level === "warn") && totalTests && !testsOnly) add("good", "Coverage of the pyramid looks healthy", "Every layer this project needs has tests.");

  return {
    summary: { files: files.length, testFiles: testFiles.length, tests: totalTests, routes, units, uiFiles, score, openapi, multiService, composeServices },
    languages, frameworks: [...pk.frameworks], testTools: [...pk.testTools], scripts: pk.scripts.slice(0, 12),
    layers: layerRows, findings, topFiles: testFiles.sort((a, b) => b.tests - a.tests).slice(0, 12),
  };
}
