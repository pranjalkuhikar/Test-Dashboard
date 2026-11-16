// Ready-made test commands. Discovery uses them to propose suites, and the "New suite" form offers them as starting points.
// {{results}} is replaced by the file the dashboard reads results from; {{artifacts}} by a folder for screenshots and traces.
export const NODE_TEST_FLAGS = "--test-reporter=spec --test-reporter-destination=stdout --test-reporter=junit --test-reporter-destination={{results}}";
export const NPM_SETUP = "[ -d node_modules ] || ( [ -f package-lock.json ] && npm ci --no-audit --no-fund || npm install --no-audit --no-fund )";
export const PW_SETUP = "npx playwright install chromium";
export const CYPRESS_SETUP = "npx cypress install";

// id, label, group, layer, command, parser, setup, note
export const PRESETS = [
  // JavaScript / TypeScript
  { id: "jest", group: "JavaScript / TypeScript", label: "Jest", layer: "unit", command: "npx jest --json --outputFile={{results}}", parser: "jest", note: "Add -c <config> to use one config file; add --runInBand if tests share a database or port" },
  { id: "jest-i", group: "JavaScript / TypeScript", label: "Jest, one test at a time (--runInBand)", layer: "integration", command: "npx jest --runInBand --json --outputFile={{results}}", parser: "jest", note: "For integration tests that share a database" },
  { id: "jest-cov", group: "JavaScript / TypeScript", label: "Jest with coverage", layer: "unit", command: "npx jest --coverage --json --outputFile={{results}}", parser: "jest" },
  { id: "vitest", group: "JavaScript / TypeScript", label: "Vitest", layer: "unit", command: "npx vitest run --reporter=json --outputFile={{results}}", parser: "vitest" },
  { id: "mocha", group: "JavaScript / TypeScript", label: "Mocha", layer: "unit", command: "npx mocha --reporter json --reporter-option output={{results}}", parser: "mocha" },
  { id: "node-test", group: "JavaScript / TypeScript", label: "Node's built-in test runner", layer: "unit", command: `node --test ${NODE_TEST_FLAGS} "test/**/*.test.js"`, parser: "junit", note: "Change the glob to match your test files" },
  { id: "playwright", group: "JavaScript / TypeScript", label: "Playwright (browser tests)", layer: "e2e", command: "npx playwright test --reporter=list,json", parser: "playwright", setup: PW_SETUP, trace: "retain-on-failure", note: "Needs BASE_URL if the config uses it" },
  { id: "cypress", group: "JavaScript / TypeScript", label: "Cypress (browser tests)", layer: "e2e", command: 'npx cypress run --reporter junit --reporter-options "mochaFile={{results}}"', parser: "junit", setup: CYPRESS_SETUP, note: "Downloads the Cypress app the first time" },
  { id: "cypress-component", group: "JavaScript / TypeScript", label: "Cypress component tests", layer: "component", command: 'npx cypress run --component --reporter junit --reporter-options "mochaFile={{results}}"', parser: "junit", setup: CYPRESS_SETUP },
  { id: "wdio", group: "JavaScript / TypeScript", label: "WebdriverIO", layer: "e2e", command: "npx wdio run wdio.conf.js", parser: "exit", note: "Per-test results are read from any JUnit report the config writes" },
  { id: "ava", group: "JavaScript / TypeScript", label: "AVA", layer: "unit", command: "npx ava", parser: "exit" },
  { id: "jasmine", group: "JavaScript / TypeScript", label: "Jasmine", layer: "unit", command: "npx jasmine", parser: "exit" },
  { id: "newman", group: "API", label: "Postman collection (Newman)", layer: "integration", command: 'npx newman run collection.postman_collection.json --reporters cli,junit --reporter-junit-export "{{results}}"', parser: "junit", note: "Change the collection file name" },
  { id: "k6", group: "Performance", label: "k6 load test", layer: "perf", command: "k6 run load-test.js", parser: "exit", note: "Needs k6 installed" },
  { id: "artillery", group: "Performance", label: "Artillery load test", layer: "perf", command: "npx artillery run load-test.yml", parser: "exit" },
  { id: "storybook", group: "JavaScript / TypeScript", label: "Storybook test runner", layer: "component", command: "npx test-storybook", parser: "exit" },
  { id: "deno", group: "Other runtimes", label: "Deno", layer: "unit", command: "deno test --junit-path={{results}}", parser: "junit" },
  { id: "bun", group: "Other runtimes", label: "Bun", layer: "unit", command: "bun test --reporter=junit --reporter-outfile={{results}}", parser: "junit" },
  // Python
  { id: "pytest", group: "Python", label: "pytest", layer: "unit", command: "python3 -m pytest -q --junitxml={{results}}", parser: "junit", note: "Install the project's dependencies first (pip install -r requirements.txt)" },
  { id: "pytest-i", group: "Python", label: "pytest, integration folder", layer: "integration", command: "python3 -m pytest tests/integration -q --junitxml={{results}}", parser: "junit" },
  { id: "unittest", group: "Python", label: "unittest", layer: "unit", command: "python3 -m unittest discover -v", parser: "exit" },
  { id: "tox", group: "Python", label: "tox", layer: "unit", command: "tox", parser: "exit" },
  { id: "behave", group: "Python", label: "behave (BDD)", layer: "e2e", command: "behave --junit --junit-directory reports/behave", parser: "exit", note: "Results are read from reports/behave" },
  { id: "robot", group: "Python", label: "Robot Framework", layer: "e2e", command: "robot --xunit {{results}} tests", parser: "junit" },
  { id: "django", group: "Python", label: "Django", layer: "unit", command: "python3 manage.py test", parser: "exit" },
  // Go, Java, .NET, Ruby, PHP, Rust, others
  { id: "go", group: "Go", label: "go test", layer: "unit", command: "go test ./... -json > {{results}} || { tail -n 40 {{results}}; exit 1; }", parser: "go" },
  { id: "maven", group: "Java", label: "Maven", layer: "unit", command: "mvn -B -q test", parser: "exit", note: "Per-test results are read from target/surefire-reports" },
  { id: "maven-i", group: "Java", label: "Maven, integration tests (verify)", layer: "integration", command: "mvn -B -q verify", parser: "exit", note: "Reads target/failsafe-reports too" },
  { id: "gradle", group: "Java", label: "Gradle", layer: "unit", command: "[ -x ./gradlew ] && ./gradlew test || gradle test", parser: "exit", note: "Per-test results are read from build/test-results" },
  { id: "dotnet", group: ".NET", label: "dotnet test", layer: "unit", command: 'dotnet test --results-directory "$(dirname {{results}})" --logger "trx;LogFileName=$(basename {{results}})"', parser: "trx" },
  { id: "rspec", group: "Ruby", label: "RSpec", layer: "unit", command: "bundle exec rspec --format json --out {{results}}", parser: "rspec" },
  { id: "phpunit", group: "PHP", label: "PHPUnit", layer: "unit", command: "vendor/bin/phpunit --log-junit {{results}}", parser: "junit" },
  { id: "cargo", group: "Rust", label: "cargo test", layer: "unit", command: "cargo test", parser: "exit" },
  { id: "mix", group: "Elixir", label: "mix test", layer: "unit", command: "mix test", parser: "exit" },
  { id: "make", group: "Other", label: "make test", layer: "unit", command: "make test", parser: "exit" },
  { id: "custom", group: "Other", label: "My own command", layer: "unit", command: "", parser: "exit", note: "Any command. If it writes a JUnit XML or JSON report, the tests are read from it automatically" },
];
export const presetById = (id) => PRESETS.find((p) => p.id === id);
