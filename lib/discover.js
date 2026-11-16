// Looks inside a repo and proposes suites (one per test command): package.json scripts of every kind, test-runner config files,
// and the usual commands for Python, Go, Java, .NET, Ruby, PHP, Rust and more. Nothing is executed here.
import fs from "node:fs";
import path from "node:path";
import { NODE_TEST_FLAGS, NPM_SETUP, PW_SETUP, CYPRESS_SETUP } from "./presets.js";

const readJson = (p) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } };
const readText = (p) => { try { return fs.readFileSync(p, "utf8"); } catch { return ""; } };
const exists = (...p) => fs.existsSync(path.join(...p));

// ---- which layer is this? (script name first, then the command / config file name) ----
const LAYER_RULES = [
  ["component", /(^|[^a-z])(component|comp|ui-test|storybook)([^a-z]|$)/], ["pact", /pact/], ["contract", /contract|schema|openapi|swagger/], ["a11y", /a11y|axe|accessib/],
  ["perf", /(^|[^a-z])(perf|performance|load|stress|bench|k6|artillery|lighthouse)([^a-z]|$)/], ["visual", /visual|screenshot|percy|chromatic|backstop/], ["security", /security|(^|[^a-z])(sec|zap|snyk)([^a-z]|$)/],
  ["smoke", /smoke|sanity|health/], ["e2e", /e2e|end-?to-?end|playwright|cypress|wdio|webdriver|selenium|puppeteer|browser|acceptance|journey/],
  ["integration", /integration|(^|[^a-z])(int|integ|it|api|db|service|functional|contract-less)([^a-z]|$)/], ["unit", /unit/],
];
const layerOf = (key, rest = "") => {
  const k = key.toLowerCase();
  for (const [l, re] of LAYER_RULES) if (re.test(k)) return l;
  const r = rest.toLowerCase();
  for (const [l, re] of LAYER_RULES) if (re.test(r)) return l;
  return "unit";
};

// ---- understanding a package.json script ----
const WATCH = /(^|\s)(--watch(All|-all)?|-w|--watchAll=true|--watch=true|--runTestsByPath=false)(?=\s|$)/g;
const SKIP_SCRIPT = /(--inspect|--debug\b|:debug\b|--ui\b|:ui\b|--headed|:headed|--update(Snapshot)?|\s-u\s|:update|clear|clean|--init|:codegen|:report|show-report|snapshot:update)/i;

// "npm test -- -c x.js" or "npm run test:unit" → the real command, with the extra arguments added at the end
function expand(cmd, scripts, depth = 0) {
  cmd = cmd.trim();
  const m = cmd.match(/^(?:npm|pnpm|yarn)(?:\s+run)?\s+([\w:.@/-]+)(?:\s+(?:--\s+)?(.*))?$/);
  if (m && depth < 5) {
    const name = m[1] === "t" ? "test" : m[1];
    if (scripts[name] != null) return `${expand(lastSegment(scripts[name]), scripts, depth + 1)} ${m[2] || ""}`.trim();
  }
  return cmd;
}
// "a & b" was written for Windows (run in order). On a Mac/Linux shell a single & puts `a` in the background, so keep only the last part.
const lastSegment = (cmd) => cmd.split(/(?<!&)&(?!&)/).map((s) => s.trim()).filter(Boolean).pop() || cmd;
// "a && b && jest": the test runner is the last step
const afterChain = (cmd) => cmd.split("&&").map((s) => s.trim()).filter(Boolean);

// Turn the (expanded) script into a command the dashboard can read results from.
function toSuiteCommand(cmd, key) {
  let c = lastSegment(cmd).replace(WATCH, " ").replace(/\s+/g, " ").trim();
  const steps = afterChain(c); c = steps[steps.length - 1];
  const prefix = (c.match(/^((?:[A-Z_][A-Z0-9_]*=\S*\s+)|(?:cross-env\s+)|(?:dotenv(?:\s+-e\s+\S+)?\s+--\s+))*/) || [""])[0];
  const body = c.slice(prefix.length).trim();
  const pre = steps.slice(0, -1).join(" && ");
  const wrap = (s) => (pre ? `${pre} && ${prefix}${s}` : `${prefix}${s}`);
  const bin = (name, args) => `npx ${name}${args ? " " + args : ""}`;
  let m;
  if ((m = body.match(/^(?:npx\s+)?jest(?:\s+(.*))?$/))) return { command: wrap(bin("jest", `${m[1] || ""} --json --outputFile={{results}}`.trim())), parser: "jest" };
  if ((m = body.match(/^(?:npx\s+)?vitest(?:\s+(.*))?$/))) { const a = m[1] || ""; const run = /^(run|bench|related|--run)\b/.test(a) || /\s--run\b/.test(" " + a) ? a : `run ${a}`; return { command: wrap(bin("vitest", `${run.trim()} --reporter=json --outputFile={{results}}`)), parser: "vitest" }; }
  if ((m = body.match(/^(?:npx\s+)?mocha(?:\s+(.*))?$/))) return { command: wrap(bin("mocha", `${m[1] || ""} --reporter json --reporter-option output={{results}}`.trim())), parser: "mocha" };
  if ((m = body.match(/^(?:npx\s+)?playwright\s+test(?:\s+(.*))?$/))) return { command: wrap(bin("playwright", `test ${(m[1] || "").replace(/--reporter[= ]\S+/g, "")} --reporter=list,json`.replace(/\s+/g, " "))), parser: "playwright", playwright: true };
  if ((m = body.match(/^(?:npx\s+)?cypress\s+run(?:\s+(.*))?$/))) return { command: wrap(bin("cypress", `run ${m[1] || ""} --reporter junit --reporter-options "mochaFile={{results}}"`.replace(/\s+/g, " "))), parser: "junit", cypress: true };
  if ((m = body.match(/^node\s+((?:--[\w-]+(?:=\S+)?\s+)*)--test(?=\s|$)\s*(.*)$/))) return { command: wrap(`node ${m[1]}--test ${NODE_TEST_FLAGS} ${m[2]}`.replace(/\s+/g, " ").trim()), parser: "junit" };
  if ((m = body.match(/^(?:npx\s+)?newman\s+run\s+(\S+)/))) return { command: wrap(`npx newman run ${m[1]} --reporters cli,junit --reporter-junit-export "{{results}}"`), parser: "junit" };
  if (/^(?:npx\s+)?(ava|tap|jasmine|wdio|test-storybook)\b/.test(body)) return { command: `npm run ${key}`, parser: "exit", npmRun: true };
  return null; // not a runner we know: run the script as it is (pass/fail, plus any report it writes)
}

const configsOf = (dir) => {
  const files = fs.readdirSync(dir).filter((f) => fs.statSync(path.join(dir, f)).isFile());
  const sub = (d) => (exists(dir, d) ? fs.readdirSync(path.join(dir, d)).filter((f) => fs.statSync(path.join(dir, d, f)).isFile()).map((f) => `${d}/${f}`) : []);
  return [...files, ...sub("test"), ...sub("tests"), ...sub("config"), ...sub("configs")];
};

export function discoverSuites(root) {
  const out = [];
  const add = (s) => { if (!out.some((x) => x.command === s.command && x.cwd === (s.cwd || "."))) out.push({ cwd: ".", setup: "", trace: "", ...s }); };

  // folders to look in: the repo itself, its sub-folders, and monorepo packages (packages/*, apps/*, services/*)
  const skip = /^(node_modules|\.|dist|build|data|coverage|vendor|target|__pycache__)/;
  const kids = (d) => { try { return fs.readdirSync(path.join(root, d), { withFileTypes: true }).filter((x) => x.isDirectory() && !skip.test(x.name)).map((x) => path.join(d, x.name)); } catch { return []; } };
  const dirs = [".", ...kids(".")];
  for (const g of ["packages", "apps", "services", "libs"]) if (exists(root, g)) dirs.push(...kids(g));
  const seenDir = new Set();

  for (const d of dirs) {
    if (seenDir.has(d)) continue; seenDir.add(d);
    const abs = path.join(root, d), where = d === "." ? "" : ` (${d})`, files = configsOf(abs);
    const pkg = readJson(path.join(abs, "package.json"));
    if (d !== "." && !pkg && !files.some((f) => /^(playwright[\w.-]*\.config\.|cypress\.config\.|wdio|pytest|k6)/.test(f) || /\.(postman_collection\.json|k6\.js)$/.test(f))) continue; // plain sub-folders (tests/, src/ …) are covered from their parent
    const deps = { ...pkg?.dependencies, ...pkg?.devDependencies };
    const install = pkg && !exists(abs, "node_modules") ? NPM_SETUP : "";
    const withSetup = (s, ...extra) => [install, ...extra].filter(Boolean).join(" && ");
    const usedConfigs = new Set();

    // ---- every test-looking script, in any naming style ----
    if (pkg?.scripts) {
      const scripts = pkg.scripts, keys = Object.keys(scripts);
      const testy = (k) => /(^|[:_.-])(test|tests|spec|specs|e2e|it|int|integ|integration|unit|contract|pact|smoke|a11y|visual|perf|load|security|sec|api|component|cypress|playwright|jest|vitest|mocha|ava)([:_.-]|$)/i.test(k);
      for (const [key, raw] of Object.entries(scripts)) {
        const expanded = expand(lastSegment(raw), scripts);
        const runnerInside = /(^|\s|&)(npx\s+)?(jest|vitest|mocha|playwright test|cypress run|node (--[\w-]+(=\S+)?\s+)*--test|ava|tap|jasmine|wdio|newman|test-storybook)\b/.test(expanded);
        if (!(testy(key) || (runnerInside && /test|spec|e2e/i.test(key)))) continue;
        if (/watch/i.test(key)) continue; // watch mode duplicates the main script and never finishes
        if (/^(pre|post)/.test(key) || /(^|:)(cov|coverage)$/i.test(key) && false) continue;
        if (SKIP_SCRIPT.test(` ${key} ${expanded} `)) continue;
        if (!runnerInside && !/test|spec/i.test(`${key} ${expanded}`)) continue;
        // an umbrella script that only calls the other test scripts would run everything twice
        const calls = keys.filter((k) => k !== key && testy(k) && new RegExp("(^|[\\s&;|])(npm|yarn|pnpm)(\\s+run)?\\s+" + k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "(\\s|$)").test(raw));
        if (calls.length >= 1 && !runnerInside) continue;
        if (/^(npm-run-all|run-s|run-p|concurrently)\b/.test(raw.trim())) continue;
        // plain `test` that just runs everything doubles up when layered scripts exist
        const layered = keys.some((k) => k !== "test" && /^test[:_-](unit|int|integ|integration|component|e2e|contract|pact|api|smoke)/.test(k));
        if (key === "test" && layered) continue;
        const built = toSuiteCommand(expanded, key);
        const isCov = /(^|[:_-])(cov|coverage)([:_-]|$)/i.test(key);
        const cfg = (expanded.match(/(?:-c|--config)[ =]+(\S+)/) || [])[1];
        if (cfg) usedConfigs.add(path.basename(cfg));
        const layer = layerOf(key, `${cfg || ""} ${expanded}`);
        const parser = built?.parser || "exit";
        add({ name: `${key}${where}`, layer, cwd: d, command: built?.command || `npm run ${key}`, parser,
          trace: built?.playwright ? "retain-on-failure" : "", setup: withSetup(null, built?.playwright ? PW_SETUP : "", built?.cypress ? CYPRESS_SETUP : ""),
          optional: isCov || undefined,
          note: parser === "exit" ? "Only pass/fail is known (plus any report file the command writes)" : `Per-test results via ${parser}${isCov ? ". Coverage run: not part of Run all" : ""}` });
      }
    }

    // ---- runner config files that no script uses yet: one suite per config ----
    const jestCfgs = files.filter((f) => /(^|\/)jest[.-][\w.-]*\.(js|cjs|mjs|ts|json)$/.test(f) || /(^|\/)jest-?[\w-]*config[\w.-]*\.(js|cjs|mjs|ts|json)$/.test(f)).filter((f) => !usedConfigs.has(path.basename(f)));
    if (deps.jest || deps["ts-jest"] || jestCfgs.length) {
      const named = jestCfgs.filter((f) => !/(^|\/)jest\.config\.[\w]+$/.test(f));
      for (const f of named) {
        const label = path.basename(f).replace(/^jest[.-]?/, "").replace(/[.-]?(config)?\.(js|cjs|mjs|ts|json)$/, "").replace(/config$/, "") || "default";
        add({ name: `jest ${label}${where}`, layer: layerOf(label, f), cwd: d, command: `npx jest --config ${f} --runInBand --json --outputFile={{results}}`, parser: "jest", setup: install, note: `Jest with ${f}` });
      }
      if (!out.some((s) => s.cwd === d && s.parser === "jest") && (jestCfgs.length || deps.jest)) add({ name: `jest${where}`, layer: "unit", cwd: d, command: "npx jest --json --outputFile={{results}}", parser: "jest", setup: install, note: "Jest with the project's default config" });
    }
    if ((deps.vitest || files.some((f) => /^vitest\.(config|workspace)\./.test(f))) && !out.some((s) => s.cwd === d && s.parser === "vitest")) add({ name: `vitest${where}`, layer: "unit", cwd: d, command: "npx vitest run --reporter=json --outputFile={{results}}", parser: "vitest", setup: install });
    if ((deps.mocha || files.some((f) => /^\.mocharc\./.test(f))) && !out.some((s) => s.cwd === d && s.parser === "mocha")) add({ name: `mocha${where}`, layer: "unit", cwd: d, command: "npx mocha --reporter json --reporter-option output={{results}}", parser: "mocha", setup: install });
    for (const f of files.filter((f) => /^playwright[\w.-]*\.config\.(js|mjs|cjs|ts)$/.test(f))) {
      if (out.some((s) => s.cwd === d && s.parser === "playwright" && (f === "playwright.config.ts" || f === "playwright.config.js" || s.command.includes(f)))) continue;
      add({ name: `playwright${f.replace(/^playwright|\.config\.\w+$/g, "") || ""}${where}`, layer: "e2e", cwd: d, command: `npx playwright test${/^playwright\.config\./.test(f) ? "" : ` --config ${f}`} --reporter=list,json`, parser: "playwright", trace: "retain-on-failure", setup: withSetup(null, PW_SETUP), note: "Needs BASE_URL if the config uses it" });
    }
    if (files.some((f) => /^cypress\.config\./.test(f)) && !out.some((s) => s.cwd === d && /cypress/.test(s.command))) add({ name: `cypress${where}`, layer: "e2e", cwd: d, command: 'npx cypress run --reporter junit --reporter-options "mochaFile={{results}}"', parser: "junit", setup: withSetup(null, CYPRESS_SETUP), note: "Downloads the Cypress app the first time" });
    for (const f of files.filter((f) => /^wdio[\w.-]*\.conf\.(js|ts|mjs|cjs)$/.test(f))) add({ name: `wdio${where}`, layer: "e2e", cwd: d, command: `npx wdio run ${f}`, parser: "exit", setup: install });
    for (const f of files.filter((f) => /\.postman_collection\.json$/.test(f))) add({ name: `postman ${path.basename(f, ".postman_collection.json")}${where}`, layer: "integration", cwd: d, command: `npx newman run ${f} --reporters cli,junit --reporter-junit-export "{{results}}"`, parser: "junit", note: "Postman collection, run with Newman" });
    for (const f of files.filter((f) => /\.k6\.js$/.test(f) || /^k6\//.test(f) && /\.js$/.test(f))) add({ name: `k6 ${path.basename(f)}${where}`, layer: "perf", cwd: d, command: `k6 run ${f}`, parser: "exit", note: "Needs k6 installed", optional: true });
  }

  // ---- other ecosystems: the repo root AND its sub-folders (monorepos such as services/api, packages/*) ----
  const skipEco = /^(tests?|spec|specs|__tests__|e2e|src|docs?|scripts|examples?)$/;
  for (const d of new Set(dirs)) {
    if (d !== "." && skipEco.test(path.basename(d))) continue;
    const abs = path.join(root, d), where = d === "." ? "" : ` (${d})`;
    const addE = (x) => add({ ...x, name: x.name + where, cwd: d });
    const has = (...f) => f.some((x) => exists(abs, x)), txt = (f) => readText(path.join(abs, f));
    const topFiles = fs.readdirSync(abs);
  if (has("pytest.ini", "tox.ini", "conftest.py", "setup.cfg") || /pytest/.test(txt("pyproject.toml") + txt("requirements.txt") + txt("requirements-dev.txt") + txt("setup.cfg")) || (exists(abs, "tests") && topFiles.some((f) => /^(requirements|pyproject|setup)/.test(f))))
    addE({ name: "pytest", layer: "unit", command: "python3 -m pytest -q --junitxml={{results}}", parser: "junit", note: "Python project. Install its dependencies first (for example pip install -r requirements.txt pytest)" });
  if (has("manage.py")) addE({ name: "django tests", layer: "unit", command: "python3 manage.py test", parser: "exit", note: "Django" });
  if (has("tox.ini")) addE({ name: "tox", layer: "unit", command: "tox", parser: "exit", optional: true });
  if (exists(abs, "features") && /behave/.test(txt("requirements.txt") + txt("pyproject.toml"))) addE({ name: "behave", layer: "e2e", command: "behave --junit --junit-directory reports/behave", parser: "exit", note: "BDD. Results are read from reports/behave" });
  if (topFiles.some((f) => /\.robot$/.test(f)) || exists(abs, "robot") || exists(abs, "tests") && fs.readdirSync(path.join(abs, "tests")).some((f) => /\.robot$/.test(f))) addE({ name: "robot framework", layer: "e2e", command: "robot --xunit {{results}} .", parser: "junit" });
  if (has("go.mod")) addE({ name: "go test", layer: "unit", command: "go test ./... -json > {{results}} || { tail -n 40 {{results}}; exit 1; }", parser: "go", note: "Go" });
  if (has("pom.xml")) addE({ name: "maven test", layer: "unit", command: "mvn -B -q test", parser: "exit", note: "Maven. Per-test results are read from target/surefire-reports" });
  if (has("build.gradle", "build.gradle.kts")) addE({ name: "gradle test", layer: "unit", command: "[ -x ./gradlew ] && ./gradlew test || gradle test", parser: "exit", note: "Gradle. Per-test results are read from build/test-results" });
  if (topFiles.some((f) => /\.(sln|csproj)$/.test(f)) || kidsHave(abs, /\.csproj$/)) addE({ name: "dotnet test", layer: "unit", command: 'dotnet test --results-directory "$(dirname {{results}})" --logger "trx;LogFileName=$(basename {{results}})"', parser: "trx", note: ".NET" });
  if (has("Gemfile") && (/rspec/.test(txt("Gemfile")) || exists(abs, "spec"))) addE({ name: "rspec", layer: "unit", command: "bundle exec rspec --format json --out {{results}}", parser: "rspec", note: "Ruby" });
  if (has("phpunit.xml", "phpunit.xml.dist") || /phpunit/.test(txt("composer.json"))) addE({ name: "phpunit", layer: "unit", command: "vendor/bin/phpunit --log-junit {{results}}", parser: "junit", note: "PHP" });
  if (has("Cargo.toml")) addE({ name: "cargo test", layer: "unit", command: "cargo test", parser: "exit", note: "Rust" });
  if (has("mix.exs")) addE({ name: "mix test", layer: "unit", command: "mix test", parser: "exit", note: "Elixir" });
  if (has("deno.json", "deno.jsonc")) addE({ name: "deno test", layer: "unit", command: "deno test --junit-path={{results}}", parser: "junit", note: "Deno" });
  if (has("bunfig.toml", "bun.lockb", "bun.lock") && !out.some((s) => s.cwd === d && /bun test/.test(s.command))) addE({ name: "bun test", layer: "unit", command: "bun test --reporter=junit --reporter-outfile={{results}}", parser: "junit", note: "Bun" });
  if (has("Makefile") && /^test\s*:/m.test(txt("Makefile")) && !out.some((s) => s.cwd === d)) addE({ name: "make test", layer: "unit", command: "make test", parser: "exit", note: "From the Makefile" });
  }

  // ---- TestLab output: tests-generated/ ----
  const tg = path.join(root, "tests-generated");
  if (fs.existsSync(tg)) {
    const hasTests = (p) => fs.existsSync(path.join(tg, p)) && fs.readdirSync(path.join(tg, p)).some((f) => /\.test\.mjs$|\.spec\.mjs$/.test(f));
    if (hasTests("unit")) add({ name: "generated unit tests", layer: "unit", command: `node --test ${NODE_TEST_FLAGS} "tests-generated/unit/*.test.mjs"`, parser: "junit", note: "From TestLab" });
    if (hasTests("integration")) add({ name: "generated API tests", layer: "integration", command: `node --test ${NODE_TEST_FLAGS} "tests-generated/integration/*.test.mjs"`, parser: "junit", note: "From TestLab. Needs BASE_URL; these send real requests" });
    if (hasTests("contract")) add({ name: "generated contract tests", layer: "contract", command: `node --test ${NODE_TEST_FLAGS} "tests-generated/contract/*.test.mjs"`, parser: "junit", note: "From TestLab. Needs BASE_URL" });
    if (fs.existsSync(path.join(tg, "e2e", "playwright.config.mjs"))) add({ name: "generated E2E tests", layer: "e2e", command: "npx playwright test --config tests-generated/e2e/playwright.config.mjs --reporter=list,json", parser: "playwright", trace: "retain-on-failure", setup: PW_SETUP, note: "From TestLab. Needs BASE_URL" });
  }
  return out;
}
function kidsHave(root, re) { try { return fs.readdirSync(root, { withFileTypes: true }).some((d) => d.isDirectory() && !/^(node_modules|\.)/.test(d.name) && fs.readdirSync(path.join(root, d.name)).some((f) => re.test(f))); } catch { return false; } }
