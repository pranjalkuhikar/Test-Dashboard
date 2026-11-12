// Consumer-side expectations of the todo resource. If either app changes the shape, this fails before the frontend breaks.
import { test } from "node:test";
import assert from "node:assert/strict";
import { api, NODE_API, NEXT_URL } from "../lib.mjs";

const TODO = { id: "number", title: "string", done: "boolean", created_at: "string" };
const check = (obj, shape) => { for (const [k, t] of Object.entries(shape)) assert.equal(typeof obj[k], t, `todo.${k} should be ${t}, got ${typeof obj[k]}`); };

for (const [label, base] of [["node-app", NODE_API], ["nextjs-app", NEXT_URL]]) {
  test(`${label}: GET /api/todos returns a list of well-formed todos`, async () => {
    const r = await api(base, "/api/todos");
    assert.equal(r.status, 200);
    const list = Array.isArray(r.json) ? r.json : r.json.data;
    assert.ok(Array.isArray(list), "list is an array");
    if (list[0]) check(list[0], TODO);
  });
  test(`${label}: errors use a JSON body with an "error" field`, async () => {
    const r = await api(base, "/api/todos", { method: "POST", body: {} });
    assert.equal(typeof r.json?.error, "string");
  });
  test(`${label}: unknown todo is a JSON 404`, async () => {
    const r = await api(base, "/api/todos/999999999");
    assert.equal(r.status, 404);
  });
}
