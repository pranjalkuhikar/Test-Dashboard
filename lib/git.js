// Repo sync: local folders are used in place; git URLs are cloned/pulled into data/repos/<name>.
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { DATA } from "./db.js";

export const REPOS_DIR = path.join(DATA, "repos");
const sh = (args, cwd, ms = 120000) => new Promise((resolve) => {
  const c = spawn("git", args, { cwd, stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, GIT_TERMINAL_PROMPT: "0" } });
  let out = "", err = ""; const t = setTimeout(() => c.kill("SIGKILL"), ms);
  c.stdout.on("data", (d) => (out += d)); c.stderr.on("data", (d) => (err += d));
  c.on("close", (code) => { clearTimeout(t); resolve({ code, out: out.trim(), err: err.trim() }); });
  c.on("error", (e) => { clearTimeout(t); resolve({ code: 127, out: "", err: e.message }); });
});

export async function headCommit(dir) { const r = await sh(["rev-parse", "--short", "HEAD"], dir, 8000); return r.code === 0 ? r.out : null; }

export async function syncRepo(repo) {
  if (repo.source === "git") {
    if (!/^(https?:\/\/|git@|ssh:\/\/)/.test(repo.url || "")) return { error: "Git URL must start with https://, ssh:// or git@" };
    fs.mkdirSync(REPOS_DIR, { recursive: true });
    const dir = repo.path;
    if (!fs.existsSync(path.join(dir, ".git"))) {
      const r = await sh(["clone", "--depth", "1", ...(repo.branch ? ["-b", repo.branch] : []), repo.url, dir], REPOS_DIR, 300000);
      if (r.code !== 0) return { error: "git clone failed: " + (r.err.split("\n").pop() || "unknown error").slice(0, 200) };
    } else {
      const f = await sh(["fetch", "--depth", "1", "origin", ...(repo.branch ? [repo.branch] : [])], dir);
      if (f.code !== 0) return { error: "git fetch failed: " + (f.err.split("\n").pop() || "").slice(0, 200) };
      const r = await sh(["reset", "--hard", "FETCH_HEAD"], dir);
      if (r.code !== 0) return { error: "git reset failed: " + r.err.slice(0, 200) };
    }
  } else {
    try { if (!fs.statSync(repo.path).isDirectory()) return { error: "That path is not a folder" }; } catch { return { error: "Folder not found: " + repo.path }; }
  }
  return { commit: await headCommit(repo.path) };
}
