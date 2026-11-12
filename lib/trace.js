// Opens a Playwright trace zip in the real Trace Viewer: `playwright show-trace <zip> --port N`.
import net from "node:net";
import path from "node:path";
import fs from "node:fs";
import { spawn } from "node:child_process";

const T = (globalThis.__testhubTraces ||= new Map()); // artifactId -> { port, child, timer }
const free = (from) => new Promise((resolve) => {
  const try1 = (p) => { const s = net.createServer(); s.once("error", () => try1(p + 1)); s.listen(p, "127.0.0.1", () => s.close(() => resolve(p))); };
  try1(from);
});
const probe = (port, host) => new Promise((res) => { const s = net.connect(port, host); s.once("connect", () => { s.destroy(); res(true); }); s.once("error", () => res(false)); });
// the viewer binds "localhost", which can be IPv6-only, so try both
const up = async (port) => (await probe(port, "127.0.0.1")) || (await probe(port, "::1"));

export async function openTrace(artifactId, zip) {
  const have = T.get(artifactId);
  if (have && (await up(have.port))) { have.timer.refresh(); return `http://localhost:${have.port}`; }
  const bin = path.join(process.cwd(), "node_modules", ".bin", "playwright");
  if (!fs.existsSync(bin)) throw new Error("Playwright is not installed in TestHub (run npm install)");
  const port = await free(5301);
  const child = spawn(bin, ["show-trace", zip, "--port", String(port), "--host", "localhost"], { stdio: "ignore", detached: true });
  child.unref();
  const timer = setTimeout(() => { try { process.kill(-child.pid, "SIGTERM"); } catch {} T.delete(artifactId); }, 30 * 60 * 1000); // close idle viewers after 30 min
  timer.unref();
  T.set(artifactId, { port, child, timer });
  for (let i = 0; i < 60; i++) { if (await up(port)) return `http://localhost:${port}`; await new Promise((r) => setTimeout(r, 250)); }
  try { process.kill(-child.pid, "SIGTERM"); } catch {}
  T.delete(artifactId);
  throw new Error("The trace viewer did not start");
}
