import "./globals.css";
export const metadata = { title: "Test Dashboard: run every layer of your tests in one place", description: "Register test repos, run unit, integration, contract, Pact and E2E suites, watch results, flaky tests and open Playwright traces." };
export default function RootLayout({ children }) {
  // apply the saved light / dark choice before the first paint, so the page never flashes the wrong colours
  const init = `try{var t=localStorage.getItem("th.theme");if(t)document.documentElement.setAttribute("data-theme",t)}catch(e){}`;
  return (<html lang="en" suppressHydrationWarning><head><script dangerouslySetInnerHTML={{ __html: init }} /></head><body suppressHydrationWarning>{children}</body></html>);
}
