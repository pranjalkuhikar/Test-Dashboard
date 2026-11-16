// Every test tool writes results differently. These turn them into one shape: { file, name, status, duration, retries, error }
const unesc1 = (s) => s.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&").replace(/&#10;/g, "\n");
const unesc = (s) => unesc1(unesc1(s)); // node's JUnit reporter escapes twice
const ansi = (s) => String(s || "").replace(/\u001b\[[0-9;]*m/g, "");
const clip = (s, n = 1200) => ansi(s).slice(0, n);

export function parseJunit(xml) {
  const out = [];
  const re = /<testcase\b([^>]*?)(?:\/>|>([\s\S]*?)<\/testcase>)/g;
  let m;
  while ((m = re.exec(xml))) {
    const attr = (k) => (m[1].match(new RegExp(`\\b${k}="([^"]*)"`)) || [])[1];
    const inner = m[2] || "";
    const ftag = inner.match(/<(failure|error)\b([^>]*)>/);
    const fmsg = ftag && (ftag[2].match(/\bmessage="([^"]*)"/) || [])[1];
    const fbody = ftag ? (inner.slice(ftag.index + ftag[0].length).split(/<\/(?:failure|error)>/)[0] || "").trim() : "";
    const failure = ftag ? true : null;
    const skipped = /<skipped\b/.test(inner);
    out.push({
      file: attr("file") ? unesc(attr("file")) : attr("classname") ? unesc(attr("classname")) : "",
      name: unesc(attr("name") || ""),
      status: failure ? "failed" : skipped ? "skipped" : "passed",
      duration: Math.round(parseFloat(attr("time") || "0") * 1000), retries: 0,
      error: failure ? clip(unesc(fmsg || fbody || "failed")) : null,
    });
  }
  return out;
}

// Playwright's JSON reporter
export function parsePlaywright(json) {
  const out = [];
  (function walk(suite, file, prefix) {
    const f = suite.file || file;
    for (const spec of suite.specs || []) for (const t of spec.tests || []) {
      const rs = t.results || [];
      const last = rs[rs.length - 1] || {};
      const flakyPass = t.status === "flaky"; // failed first, passed on retry
      const status = t.status === "skipped" || last.status === "skipped" ? "skipped" : last.status === "passed" || flakyPass ? "passed" : "failed";
      const traceAtt = rs.flatMap((r) => r.attachments || []).find((a) => a.name === "trace");
      out.push({
        file: f, name: `${t.projectName ? `[${t.projectName}] ` : ""}${[prefix, spec.title].filter(Boolean).join(" › ")}`, status,
        duration: Math.round(rs.reduce((a, r) => a + (r.duration || 0), 0)), retries: Math.max(0, rs.length - 1) + (flakyPass ? 0 : 0),
        error: status === "failed" ? clip(last.error?.message || last.errors?.[0]?.message || "failed") : null, flaky: flakyPass, trace: traceAtt?.path || null,
      });
    }
    for (const s of suite.suites || []) walk(s, f, s.file ? "" : [prefix, s.title].filter(Boolean).join(" › "));
  })({ suites: json.suites || [] }, "", "");
  return out;
}

// Jest and Vitest share this JSON layout
export function parseJest(json) {
  const out = [];
  for (const tr of json.testResults || []) for (const a of tr.assertionResults || tr.tests || []) {
    out.push({ file: tr.name || tr.file || "", name: a.fullName || a.title || "", status: a.status === "passed" ? "passed" : a.status === "failed" ? "failed" : "skipped", duration: Math.round(a.duration || 0), retries: 0, error: a.status === "failed" ? clip((a.failureMessages || [a.failureMessage || "failed"]).join("\n")) : null });
  }
  return out;
}

// Mocha's JSON reporter: { stats, tests, pending, failures, passes }
export function parseMocha(j) {
  const failed = new Map((j.failures || []).map((t) => [t.fullTitle, t]));
  const pending = new Set((j.pending || []).map((t) => t.fullTitle));
  return (j.tests || []).map((t) => {
    const f = failed.get(t.fullTitle);
    const status = f ? "failed" : pending.has(t.fullTitle) ? "skipped" : "passed";
    return { file: t.file || "", name: t.fullTitle || t.title || "", status, duration: Math.round(t.duration || 0), retries: 0, error: f ? clip(f.err?.stack || f.err?.message || "failed") : null };
  });
}

export function parseResults(parser, text) {
  try {
    if (parser === "junit") return parseJunit(text);
    if (parser === "playwright") return parsePlaywright(JSON.parse(text.slice(text.indexOf("{"))));
    if (parser === "jest" || parser === "vitest") return parseJest(JSON.parse(text.slice(text.indexOf("{"))));
    if (parser === "mocha") return parseMocha(JSON.parse(text.slice(text.indexOf("{"))));
  } catch {}
  return [];
}
