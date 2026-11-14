import { recoverOrphans, tickSchedules } from "./runner.js";
export function boot() {
  if (globalThis.__testdashBooted) return; globalThis.__testdashBooted = true;
  recoverOrphans();
  globalThis.__testdashTimer = setInterval(() => { try { tickSchedules(); } catch (e) { console.error("[test-dashboard] scheduler", e.message); } }, 30000).unref?.();
}
