import { recoverOrphans, tickSchedules } from "./runner.js";
export function boot() {
  if (globalThis.__testhubBooted) return; globalThis.__testhubBooted = true;
  recoverOrphans();
  globalThis.__testhubTimer = setInterval(() => { try { tickSchedules(); } catch (e) { console.error("[testhub] scheduler", e.message); } }, 30000).unref?.();
}
