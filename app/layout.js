import "./globals.css";
export const metadata = { title: "Test Dashboard: run every layer of your tests in one place", description: "Register test repos, run unit, integration, contract, Pact and E2E suites, watch results, flaky tests and open Playwright traces." };
export default function RootLayout({ children }) {
  return (<html lang="en"><body suppressHydrationWarning>{children}</body></html>);
}
