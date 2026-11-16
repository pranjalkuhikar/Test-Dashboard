// Demo only: fails when DEMO_BREAK=1 so you can see a failing run, its screenshot and its trace in Test Dashboard.
// Create an environment with DEMO_BREAK=1 and run the E2E suite against it. Without the variable this test passes.
import { test, expect } from "@playwright/test";
test("demo: page shows the expected heading", async ({ page }) => {
  await page.goto("/");
  const expected = process.env.DEMO_BREAK === "1" ? "A heading that does not exist" : "Your todos";
  await expect(page.getByRole("heading", { level: 1 })).toContainText(expected, { timeout: 3000 });
});
