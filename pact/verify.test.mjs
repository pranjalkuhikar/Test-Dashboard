// Provider verification: replays each interaction recorded in the pact file against the real provider and checks status + body shape
// (type matching: values are compared by type, arrays by the type of their first element). This is the same idea as Pact's verifier, in ~30 lines.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { NODE_API } from "../lib.mjs";

const pact = JSON.parse(fs.readFileSync(new URL("./pacts/frontend-node-app.json", import.meta.url)));
const kind = (v) => (Array.isArray(v) ? "array" : v === null ? "null" : typeof v);
function matches(expected, actual, path = "$") {
  if (kind(expected) === "object") { for (const k of Object.keys(expected)) { assert.ok(actual && k in actual, `${path}.${k} is missing`); matches(expected[k], actual[k], `${path}.${k}`); } return; }
  if (kind(expected) === "array") { assert.ok(Array.isArray(actual), `${path} should be an array`); if (expected[0] && actual[0]) matches(expected[0], actual[0], `${path}[0]`); return; }
  assert.equal(kind(actual), kind(expected), `${path}: expected a ${kind(expected)}, got ${kind(actual)}`);
}
for (const it of pact.interactions) {
  test(`${pact.consumer.name} → ${pact.provider.name}: ${it.description}`, async () => {
    const res = await fetch(NODE_API + it.request.path, { method: it.request.method, headers: it.request.headers, body: it.request.body ? JSON.stringify(it.request.body) : undefined });
    assert.equal(res.status, it.response.status);
    if (it.response.body) matches(it.response.body, await res.json());
  });
}
