// Demo only: simulates an unreliable test. When DEMO_FLAKY=1 it fails on every other run (state kept in a temp file),
// so after a few runs TestHub's "Flaky tests" page picks it up. Without the variable it always passes.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

test("demo: cache warms up before the first read", () => {
  if (process.env.DEMO_FLAKY !== "1") return;
  const f = path.join(os.tmpdir(), "central-tests-demo-flaky");
  const n = (fs.existsSync(f) ? +fs.readFileSync(f, "utf8") : 0) + 1;
  fs.writeFileSync(f, String(n));
  assert.equal(n % 2, 1, `cold cache on run ${n}`);
});
