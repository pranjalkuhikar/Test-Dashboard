import { test, expect } from "@playwright/test";

test("home page loads and shows the todo app", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Your todos");
});

test("a todo added in the UI appears in the list and via the API", async ({ page, request }) => {
  const title = "e2e " + Date.now();
  await page.goto("/");
  await page.getByRole("textbox").first().fill(title);
  await page.getByRole("button", { name: /add/i }).click();
  await expect(page.getByText(title)).toBeVisible();
  const list = await (await request.get("/api/todos")).json();
  const all = Array.isArray(list) ? list : list.data;
  const mine = all.find((t) => t.title === title);
  expect(mine).toBeTruthy();
  await request.delete(`/api/todos/${mine.id}`);
});

test("health endpoint is green", async ({ request }) => {
  const r = await request.get("/api/health");
  expect(r.ok()).toBeTruthy();
});
