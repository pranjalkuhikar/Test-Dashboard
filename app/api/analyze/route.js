import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { get, insert, run, now } from "@/lib/db";
import { guard, fail, body } from "@/lib/guard";
import { syncRepo, REPOS_DIR } from "@/lib/git";
import { analyzeRepo } from "@/lib/analyze";
import { discoverSuites } from "@/lib/discover";

export const maxDuration = 300;

// "owner/repo", "https://github.com/owner/repo(.git)", ".../tree/<branch>/...", any https/ssh git URL, or a local folder
function parseInput(raw) {
  const s = String(raw || "").trim().replace(/\s+/g, "");
  if (!s) return { error: "Paste a GitHub link or a folder path" };
  let m = s.match(/^https?:\/\/(?:www\.)?github\.com\/([\w.-]+)\/([\w.-]+?)(?:\.git)?(?:\/tree\/([^/]+)(?:\/.*)?|\/.*)?$/i);
  if (m) return { source: "git", url: `https://github.com/${m[1]}/${m[2]}.git`, name: `${m[1]}-${m[2]}`, branch: m[3] || null };
  m = s.match(/^([\w.-]+)\/([\w.-]+)$/);
  if (m && !fs.existsSync(s) && !s.startsWith(".")) return { source: "git", url: `https://github.com/${m[1]}/${m[2]}.git`, name: `${m[1]}-${m[2]}`, branch: null };
  if (/^(https?:\/\/|ssh:\/\/|git@)/.test(s)) { const n = s.replace(/\.git$/, "").split(/[/:]/).slice(-2).join("-"); return { source: "git", url: s, name: n || "repo", branch: null }; }
  const p = path.resolve(s.replace(/^~(?=\/)/, process.env.HOME));
  if (!fs.existsSync(p) || !fs.statSync(p).isDirectory()) return { error: `I couldn't find a folder at ${p}, and that isn't a GitHub link` };
  return { source: "local", path: p, name: path.basename(p) };
}

export async function POST(req) {
  const g = guard(req); if (g) return g;
  const b = await body(req);
  const inp = parseInput(b.input);
  if (inp.error) return fail(400, inp.error);
  const name = inp.name.replace(/[^\w .-]/g, "-").slice(0, 60);

  let repo = get("SELECT * FROM repos WHERE name=?", name);
  if (repo && ((inp.source === "git" && repo.url !== inp.url) || (inp.source === "local" && repo.path !== inp.path))) return fail(409, `A different repo is already registered as "${name}". Remove it first.`);
  if (!repo) {
    const p = inp.source === "git" ? path.join(REPOS_DIR, name) : inp.path;
    const id = insert("INSERT INTO repos (name, kind, source, path, url, branch, trusted, created_at) VALUES (?,?,?,?,?,?,0,?)", name, "app", inp.source, p, inp.url || null, inp.branch, now());
    repo = get("SELECT * FROM repos WHERE id=?", id);
  }
  const sync = await syncRepo(repo); // clone/pull only: git does not run the repo's code
  if (sync.error) { if (!repo.last_sync_at) run("DELETE FROM repos WHERE id=?", repo.id); return fail(400, sync.error.includes("clone failed") ? `Could not fetch that repo (${sync.error.replace("git clone failed: ", "")}). Is it public?` : sync.error); }
  run("UPDATE repos SET last_sync_at=?, last_commit=?, last_error=NULL WHERE id=?", now(), sync.commit || null, repo.id);
  const analysis = analyzeRepo(repo.path);
  const suites = discoverSuites(repo.path);
  return NextResponse.json({ repo_id: repo.id, name, commit: sync.commit, analysis, suites });
}
