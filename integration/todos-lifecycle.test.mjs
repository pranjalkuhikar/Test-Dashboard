import { test } from "node:test";
import assert from "node:assert/strict";
import { api, NODE_API, NEXT_URL } from "../lib.mjs";

for (const [label, base] of [["node-app", NODE_API], ["nextjs-app", NEXT_URL]]) {
  test(`${label}: health reports the database is up`, async () => {
    const r = await api(base, "/api/health");
    assert.equal(r.status, 200);
    assert.equal(r.json.db, "up");
  });

  test(`${label}: a todo can be created, read, updated and deleted`, async () => {
    const created = await api(base, "/api/todos", { method: "POST", body: { title: "central-tests lifecycle" } });
    assert.equal(created.status, 201);
    const id = created.json.id ?? created.json.data?.id;
    assert.ok(id, "response has an id");
    try {
      const got = await api(base, `/api/todos/${id}`);
      assert.equal(got.status, 200);
      const upd = await api(base, `/api/todos/${id}`, { method: "PATCH", body: { done: true } });
      assert.ok([200, 204].includes(upd.status), `PATCH status ${upd.status}`);
      const after = await api(base, `/api/todos/${id}`);
      assert.equal((after.json.data ?? after.json).done, true);
    } finally {
      const del = await api(base, `/api/todos/${id}`, { method: "DELETE" });
      assert.ok([200, 204].includes(del.status));
    }
    assert.equal((await api(base, `/api/todos/${id}`)).status, 404);
  });

  test(`${label}: rejects a todo without a title`, async () => {
    const r = await api(base, "/api/todos", { method: "POST", body: {} });
    assert.equal(r.status, 400);
  });
}
