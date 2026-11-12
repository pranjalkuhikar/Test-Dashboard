import { defineConfig } from "@playwright/test";
// Set PLAYWRIGHT_EXECUTABLE to use an installed Chrome/Brave/Edge instead of Playwright's own download.
const executablePath = process.env.PLAYWRIGHT_EXECUTABLE || undefined;
export default defineConfig({
  testDir: "./e2e",
  timeout: 30000,
  retries: 1,
  reporter: [["list"], ["json"]],
  use: { baseURL: process.env.NEXT_URL || "http://localhost:3000", screenshot: "only-on-failure", launchOptions: executablePath ? { executablePath } : {} },
});
