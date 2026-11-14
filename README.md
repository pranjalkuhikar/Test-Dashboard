# Test Dashboard

One dashboard to run **every layer of your tests** (unit, integration, contract, Pact, end-to-end and more), watch results live, spot flaky tests, and open a **Playwright trace** with one click.

It is a Next.js full-stack app in plain JavaScript. Everything is stored in one local SQLite file. Nothing leaves your machine.

## How it fits together

```
 app repos (each owns its unit tests)         tests repo (everything cross-app)
 node-app/      → unit                        central-tests/ → integration, contract, pact, e2e
 auth-hub/      → unit
 load-tester/   → unit
              \                                   /
               └────────►  Test Dashboard  ◄─────────────┘
                 register repo → find suites → run → results, logs, traces, history
```

* A **repo** is a folder (or a Git URL Test Dashboard clones for you). It is either an *app repo* or a *tests repo*.
* A **suite** is one command in one repo that exercises one **layer**. Example: `node --test "contract/*.test.mjs"`.
* A **run** is one execution of a suite: log, per-test results, duration, commit, files (screenshots, traces).
* An **environment** is a named set of variables (like `NEXT_URL=http://localhost:3000`) passed to the suite.

## Start it

```bash
cd test-dashboard
npm install
npm run dev          # http://localhost:5200
```

Needs Node 22+ (it uses the built-in `node:sqlite`; Node prints an "experimental" notice, that is expected). Data lives in `test-dashboard/data/` (git-ignored).

## First use, in four steps

1. **Repos → Add repo.** Give a folder path or Git URL. Tick *I trust this code* (see Safety).
2. **Find suites.** Test Dashboard reads `package.json` test scripts, Playwright configs and TestLab's `tests-generated/` folder, and proposes suites with a layer and the right reporter flags. Tick the ones you want.
3. **Environments → New.** Add variables your tests need, e.g. `NEXT_URL`, `NODE_API_URL`. Pick it in the sidebar's *Run against* box.
4. **Suites → Run** (or **Run everything**). Open the run to follow the log and see each test.

## What you get

| Page | What it shows |
| --- | --- |
| Overview | The testing pyramid (colour = latest result), pass rate per layer, 14-day trend, recent runs |
| Suites | Suites grouped by layer; run one, a whole layer, or everything |
| Runs / a run | Live log, every test with its error, new-failure markers, retries, screenshots, videos, traces |
| Flaky tests | Tests whose result flips (3+ flips in the last 10 runs) or that only pass after a retry |
| Repos | Add / pull / trust / remove repos, find suites |
| Environments | Variables per environment (secret-looking values are hidden and redacted from logs) |
| Automation | Schedules (run every N minutes) and webhooks for CI or git hooks |

### Traces

For Playwright suites Test Dashboard adds `--output` and (if you choose a trace mode on the suite) `--trace`, collects `trace.zip` files and links each one to its test. **Open trace** starts `playwright show-trace <zip> --port N` on localhost and opens it in a new tab. Viewers close themselves after 30 idle minutes.

If you have no Playwright browser downloaded, set `PLAYWRIGHT_EXECUTABLE` in an environment to a Chrome, Brave or Edge binary and point your config's `launchOptions.executablePath` at it (the demo repo does this).

### Result formats

| Parser | Used for | Flags Test Dashboard expects in the command |
| --- | --- | --- |
| `junit` | `node --test`, most runners | `--test-reporter=junit --test-reporter-destination={{results}}` |
| `playwright` | Playwright | `--reporter=list,json` (the JSON path is set for you) |
| `jest` / `vitest` | Jest, Vitest | `--json --outputFile={{results}}` |
| `exit` | anything else | none; only pass/fail is known |

`{{results}}` and `{{artifacts}}` in a command are replaced with real paths for that run.

### Automation

* **Schedule:** edit a suite, set *Run on a schedule*. A suite is skipped if its previous run is still going. Test Dashboard has to be running.
* **Webhook:** Automation → New webhook → `curl -X POST http://localhost:5200/api/hook/<token>`. The token is the credential; it only runs the suites chosen when you created it.

## Safety

Running a test suite means running shell commands as you, so:

* The API only answers requests whose `Host` is `localhost`/`127.0.0.1`, and browser requests must come from the same origin. Nothing is reachable from other machines or other websites.
* **A repo must be marked trusted before anything in it runs.** Untrusted repos can be added and browsed only.
* A suite's folder cannot escape its repo. Git URLs must be `https://`, `ssh://` or `git@`.
* Each run is its own process group: *Stop* and timeouts kill the whole tree, not just the shell.
* Environment values that look like secrets are masked in the UI and replaced with `•••` in saved logs.
* Webhook tokens are random, 144 bits.

## Demo repo

`central-tests/` (a folder in this repo) is a working tests repo. Run `npm install` inside it once, then register it on the Repos page. The apps it tests must run with `AUTH_REQUIRED=false` (the tests call the APIs without logging in):

| Layer | What it does |
| --- | --- |
| integration | Full todo lifecycle against both node-app (:4000) and nextjs-app (:3000) |
| contract | Response shapes and error format of both apps |
| pact | A Pact v3 file (`frontend → node-app`) replayed against the real provider |
| e2e | Playwright against nextjs-app: UI flow plus API cross-check |

Two demo-only tests are off unless you ask for them: set `DEMO_BREAK=1` in an environment to make an E2E test fail (see the failing run, screenshot and trace), and `DEMO_FLAKY=1` to make an integration test fail every other run (see it appear on *Flaky tests*).

## HTTP API (all JSON, loopback only)

`GET /api/stats` · `GET/POST /api/repos` · `PATCH/DELETE /api/repos/:id` · `POST /api/repos/:id/sync` · `GET /api/repos/:id/discover` · `POST /api/repos/:id/import` · `GET/POST /api/suites` · `PATCH/DELETE /api/suites/:id` · `POST /api/suites/:id/run` · `GET/POST /api/envs` · `PATCH/DELETE /api/envs/:id` · `GET/POST /api/runs` (`{suite_ids}`, `{layer}` or `{all:true}`) · `GET /api/runs/:id` · `GET /api/runs/:id/log?offset=` · `POST /api/runs/:id/cancel` · `GET /api/artifacts/:id/file` · `POST /api/artifacts/:id/trace` · `GET/POST/DELETE /api/hooks` · `POST /api/hook/:token`

## Honest limits

* **Local and single-user.** No login, no teams. If you expose it beyond localhost, put AuthHub or another gate in front.
* **Suites run on this machine,** in your repos, with your tools installed. There is no remote runner or container isolation. That is why the trust gate exists.
* **Two runs at a time** (a fixed queue limit in `lib/runner.js`). Suites that share a database or port can still collide; run them one after another.
* **Per-test detail needs a supported reporter.** With `exit`, a suite is one pass/fail.
* **Flaky detection needs history:** a test must have at least 3 recorded runs. The rule is a heuristic, not proof.
* **`node:sqlite` is marked experimental** in Node. If it changes, `lib/db.js` is the only file to adjust.
* Parsers were verified against real `node:test`, Playwright and the generated TestLab suites. Jest and Vitest parsers follow their documented JSON layout but were not run against a real Jest/Vitest project.

## Layout

```
lib/db.js        SQLite schema and helpers          lib/runner.js   queue, spawn, logs, parse, artifacts, schedules
lib/parsers.js   JUnit / Playwright / Jest parsers  lib/discover.js suite discovery
lib/git.js       clone / pull                       lib/stats.js    pyramid, trend, flaky rule
lib/trace.js     Playwright trace viewer launcher   lib/guard.js    loopback + origin guard
app/api/**       route handlers                     components/**   dashboard
```

## Sources

* Playwright Trace Viewer, `show-trace` command: https://playwright.dev/docs/trace-viewer
* Allure TestOps flaky detection (the 3-flips-in-10 rule): https://docs.qameta.io/allure-testops/
* Node.js `node:sqlite`: https://nodejs.org/api/sqlite.html
