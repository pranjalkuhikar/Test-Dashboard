// Browser-side code of the report page. It is NOT imported by the app: lib/report.js reads this file and inlines it in the HTML.
(function () {
  var D = JSON.parse(document.getElementById("data").textContent);
  var NAMES = { unit: "Unit", component: "Component", integration: "Integration", contract: "Contract", pact: "Pact", e2e: "End-to-end", smoke: "Smoke", a11y: "Accessibility", perf: "Performance", visual: "Visual", security: "Security" };
  var COLOR = { unit: "#38bdf8", component: "#22d3ee", integration: "#a78bfa", contract: "#f472b6", pact: "#fb923c", e2e: "#34d399", smoke: "#facc15", a11y: "#60a5fa", perf: "#f87171", visual: "#c084fc", security: "#fb7185" };
  var LABEL = { passed: "Passed", failed: "Failed", skipped: "Skipped", notrun: "Not run", flaky: "Flaky" };
  var S = { filter: "all", q: "", group: "suite", sort: "order", open: {}, collapsed: {}, logs: {} };
  var $ = function (s, el) { return (el || document).querySelector(s); };
  function h(tag, a) {
    var el = document.createElement(tag); a = a || {};
    for (var k in a) { var v = a[k]; if (v == null || v === false) continue; if (k === "class") el.className = v; else if (k === "text") el.textContent = v; else if (k.slice(0, 2) === "on") el.addEventListener(k.slice(2), v); else if (k === "style") el.setAttribute("style", v); else el.setAttribute(k, v === true ? "" : v); }
    (function add(list) { for (var i = 0; i < list.length; i++) { var c = list[i]; if (c == null || c === false) continue; if (Array.isArray(c)) add(c); else el.appendChild(typeof c === "string" || typeof c === "number" ? document.createTextNode(String(c)) : c); } })([].slice.call(arguments, 2));
    return el;
  }
  function svg(tag, a) { var el = document.createElementNS("http://www.w3.org/2000/svg", tag); for (var k in a) el.setAttribute(k, a[k]); for (var i = 2; i < arguments.length; i++) el.appendChild(arguments[i]); return el; }
  var ms = function (n) { return n == null ? "-" : n < 1000 ? n + " ms" : n < 60000 ? (n / 1000).toFixed(1) + " s" : Math.floor(n / 60000) + "m " + Math.round((n % 60000) / 1000) + "s"; };
  var when = function (t) { return t ? new Date(t).toLocaleString("en-GB") : "-"; };
  var lname = function (l) { return NAMES[l] || l; };
  function toast(t) { var el = $("#toast"); el.textContent = t; el.classList.add("on"); clearTimeout(toast.t); toast.t = setTimeout(function () { el.classList.remove("on"); }, 1800); }
  function copy(text, msg) { (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject()).then(function () { toast(msg || "Copied"); }, function () { toast("Copy is blocked here"); }); }
  async function openTrace(id) {
    var w = window.open("", "_blank");
    try { var r = await fetch("/api/artifacts/" + id + "/trace", { method: "POST" }); var j = await r.json(); if (!r.ok) throw new Error(j.error || "failed"); if (w) w.location.href = j.url; else toast("Allow pop-ups to open the trace"); }
    catch (e) { if (w) w.close(); toast("Trace viewer: " + e.message + " (open this report from the dashboard)"); }
  }

  var T = D.tests;
  T.forEach(function (t) { t.flaky = !!(D.flaky || []).some(function (f) { return f.name === t.name; }); });
  var counts = function (list) { var c = { all: list.length, passed: 0, failed: 0, skipped: 0, notrun: 0, flaky: 0 }; list.forEach(function (t) { c[t.status]++; if (t.flaky) c.flaky++; }); return c; };
  var C = counts(T);

  // ---------- header + toolbar ----------
  function renderTop() {
    var theme = document.documentElement.getAttribute("data-theme");
    var search = h("div", { class: "search" }, h("i", { text: "⌕" }), h("input", { id: "q", placeholder: "Search tests, files, errors…", autocomplete: "off", oninput: function (e) { S.q = e.target.value.toLowerCase().trim(); renderExplorer(); } }), h("kbd", { text: "/" }));
    $("#top").replaceChildren(h("div", { class: "in" },
      h("div", { class: "brand" }, h("span", { class: "logo", text: "✓" }), "Test Dashboard"),
      h("span", { class: "title", text: D.repo.name, title: D.repo.name }), h("span", { class: "badge " + D.verdict[0], text: D.verdict[1] }),
      h("span", { class: "sp" }), search,
      h("button", { class: "btn", title: "Copy a one-line summary", onclick: function () { copy(D.repo.name + ": " + C.passed + " passed, " + C.failed + " failed, " + C.skipped + " skipped" + (C.notrun ? ", " + C.notrun + " not run" : "") + " (" + ms(D.totals.ms) + ")", "Summary copied"); }, text: "Copy summary" }),
      h("button", { class: "btn", onclick: function () { window.print(); }, text: "Print / PDF" }),
      h("button", { class: "btn", title: "Switch light / dark", onclick: function () { var n = document.documentElement.getAttribute("data-theme") === "light" ? "dark" : "light"; document.documentElement.setAttribute("data-theme", n); try { localStorage.setItem("rep.theme", n); } catch (e) {} renderTop(); }, text: theme === "light" ? "☾ Dark" : "☀ Light" })));
    var chips = ["all", "failed", "passed", "skipped", "notrun", "flaky"].filter(function (k) { return k === "all" || C[k]; }).map(function (k) { return h("button", { class: "chip " + (k === "failed" ? "f " : k === "passed" ? "p " : "") + (S.filter === k ? "on" : ""), onclick: function () { S.filter = k; renderTop(); renderExplorer(); }, "data-k": k }, k === "all" ? "All" : LABEL[k], h("em", { text: C[k] })); });
    function sel(label, key, opts) { return h("label", { class: "sub", style: "display:flex;gap:6px;align-items:center;font-size:13px" }, label, h("select", { onchange: function (e) { S[key] = e.target.value; renderExplorer(); } }, opts.map(function (o) { return h("option", { value: o[0], selected: S[key] === o[0] }, o[1]); }))); }
    $("#tools").replaceChildren(h("div", { class: "in" }, chips, h("span", { class: "sp" }),
      sel("Group", "group", [["suite", "Suite"], ["layer", "Layer"], ["file", "File"], ["status", "Status"]]), sel("Sort", "sort", [["order", "Failed first"], ["slow", "Slowest"], ["name", "Name"]]),
      h("button", { class: "btn sm", onclick: function () { T.forEach(function (t) { if (t.status === "failed") S.open[t.id] = true; }); S.collapsed = {}; renderExplorer(); }, text: "Open failed" }),
      h("button", { class: "btn sm", onclick: function () { S.open = {}; renderExplorer(); }, text: "Collapse all" })));
    var q = $("#q"); if (q) q.value = S.q;
  }

  // ---------- hero ----------
  function donut() {
    var tot = C.passed + C.failed + C.skipped || 1, R = 72, Cc = 2 * Math.PI * R, off = 0, pct = C.passed + C.failed ? Math.round(C.passed / (C.passed + C.failed) * 100) : null;
    var s = svg("svg", { viewBox: "0 0 190 190", class: "donut" }, svg("circle", { r: R, cx: 95, cy: 95, fill: "none", stroke: "var(--line)", "stroke-width": 20 }));
    [[C.passed, "var(--ok)"], [C.failed, "var(--bad)"], [C.skipped, "var(--warn)"]].forEach(function (p) { if (!p[0]) return; var len = p[0] / tot * Cc; s.appendChild(svg("circle", { r: R, cx: 95, cy: 95, fill: "none", stroke: p[1], "stroke-width": 20, "stroke-dasharray": len + " " + (Cc - len), "stroke-dashoffset": -off, transform: "rotate(-90 95 95)", "stroke-linecap": "butt" })); off += len; });
    var a = svg("text", { x: 95, y: 94, "text-anchor": "middle", class: "dn" }); a.textContent = pct == null ? "-" : pct + "%"; var b = svg("text", { x: 95, y: 116, "text-anchor": "middle", class: "dl" }); b.textContent = "passing"; s.appendChild(a); s.appendChild(b); return s;
  }
  function kpi(v, l, cls, filter) { return h("div", { class: "kpi" + (filter ? " click" : ""), onclick: filter ? function () { S.filter = filter; renderTop(); renderExplorer(); $("#explorer").scrollIntoView(); } : null }, h("b", { class: cls || "", text: v }), h("span", { text: l })); }
  function renderHero() {
    var last = D.suites.reduce(function (m, s) { return Math.max(m, s.finished || 0); }, 0);
    var envs = D.suites.map(function (s) { return s.env; }).filter(function (x, i, a) { return x && a.indexOf(x) === i; });
    $("#hero").replaceChildren(h("h1", { text: D.repo.name }), h("div", { class: "sub", text: D.repo.url || D.repo.path }),
      h("div", { class: "card hero" }, donut(), h("div", {},
        h("div", { class: "kpis" }, kpi(C.passed, "tests passed", "g", "passed"), kpi(C.failed, "tests failed", C.failed ? "r" : "", C.failed ? "failed" : null), kpi(C.skipped, "skipped", C.skipped ? "y" : "", C.skipped ? "skipped" : null), kpi(C.notrun, "found, not run", "", C.notrun ? "notrun" : null),
          kpi(D.totals.ran + "/" + D.suites.length, "suites run"), kpi(ms(D.totals.ms), "total run time"), kpi(C.flaky, "flaky", C.flaky ? "y" : "", C.flaky ? "flaky" : null), kpi(D.analysis ? D.analysis.summary.score + "/100" : "-", "pyramid score")),
        h("div", { class: "meta" }, D.repo.commit ? h("span", {}, "commit ", h("b", { class: "mono", text: D.repo.commit })) : null, last ? h("span", {}, "last run ", h("b", { text: when(last) })) : null, envs.length ? h("span", {}, "environment ", h("b", { text: envs.join(", ") })) : null, h("span", {}, "generated ", h("b", { text: when(D.generated) }))))));
  }

  // ---------- charts ----------
  function jump(id) { var t = T.filter(function (x) { return x.id === id; })[0]; if (!t) return; S.filter = "all"; S.q = ""; S.open[id] = true; S.collapsed = {}; renderTop(); renderExplorer(); var el = document.getElementById("t-" + id); if (el) { el.scrollIntoView({ block: "center" }); el.classList.add("hl"); } }
  function renderCharts() {
    var strip = h("div", { class: "strip" }, T.slice(0, 1500).map(function (t) { return h("i", { class: t.status, title: t.name + " · " + LABEL[t.status] + (t.ms != null ? " · " + ms(t.ms) : ""), onclick: function () { jump(t.id); } }); }));
    var slow = T.filter(function (t) { return t.ms; }).sort(function (a, b) { return b.ms - a.ms; }).slice(0, 8), max = slow.length ? slow[0].ms : 1;
    var layers = {}; D.suites.forEach(function (s) { var l = layers[s.layer] || (layers[s.layer] = { p: 0, f: 0, ms: 0, ran: 0 }); if (s.status) { l.p += s.passed; l.f += s.failed; l.ms += s.ms || 0; l.ran++; } });
    var lrows = Object.keys(layers).map(function (k) { var l = layers[k], tt = l.p + l.f || 1; return h("div", { class: "lrow" }, h("div", { class: "lname" }, h("i", { style: "background:" + (COLOR[k] || "#94a3b8") }), lname(k)), h("div", { class: "track" }, h("b", { style: "width:" + l.p / tt * 100 + "%;background:var(--ok)" }), h("b", { style: "width:" + l.f / tt * 100 + "%;background:var(--bad)" })), h("div", { class: "lnum" }, l.ran ? [h("strong", { text: l.p }), "/" + (l.p + l.f)] : "not run"), h("div", { class: "lnum lms", text: l.ran ? ms(l.ms) : "" })); });
    var hmax = Math.max.apply(null, D.trend.map(function (r) { return r.passed + r.failed; }).concat([1]));
    var hist = h("div", { class: "hist" }, D.trend.map(function (r) { var tot = r.passed + r.failed; return h("div", { class: "col", style: "height:" + Math.max(6, tot / hmax * 100) + "%", title: "Run #" + r.id + " · " + r.suite + " · " + r.passed + " passed, " + r.failed + " failed · " + when(r.t) }, h("b", { class: "f", style: "height:" + (tot ? r.failed / tot * 100 : 100) + "%" }), h("b", { class: "p", style: "height:" + (tot ? r.passed / tot * 100 : 0) + "%" })); }));
    $("#charts").replaceChildren(
      h("div", { class: "grid2" },
        h("div", { class: "card" }, h("h2", {}, "Every test at a glance", h("span", { class: "n", text: T.length })), strip, h("div", { class: "sub", style: "margin-top:10px;font-size:12.5px" }, "Green passed · red failed · yellow skipped · hollow not run yet. Click a square to jump to it.")),
        h("div", { class: "card" }, h("h2", {}, "Slowest tests"), slow.length ? slow.map(function (t) { return h("div", { class: "slow", onclick: function () { jump(t.id); } }, h("div", {}, h("div", { class: "sn", text: t.name, title: t.name }), h("div", { class: "sb", style: "width:" + Math.max(3, t.ms / max * 100) + "%" })), h("div", { class: "td", text: ms(t.ms) })); }) : h("div", { class: "sub", text: "Nothing has run yet." }))),
      h("div", { class: "grid2" },
        h("div", { class: "card" }, h("h2", {}, "Results by layer"), lrows.length ? lrows : h("div", { class: "sub", text: "No suites yet." })),
        h("div", { class: "card" }, h("h2", {}, "History", h("span", { class: "n", text: D.trend.length + " runs" })), D.trend.length ? hist : h("div", { class: "sub", text: "No runs yet." }), D.trend.length ? h("div", { class: "sub", style: "margin-top:8px;font-size:12.5px", text: "Each bar is one run: green passed, red failed. Hover for details." }) : null)));
  }
  function renderChanges() {
    var c = D.changes; if (!c || !c.compared) { $("#changes").replaceChildren(); return; }
    function box(title, cls, list) { return h("div", { class: "chg" }, h("b", { class: cls, text: list.length }), title, list.length ? h("ul", {}, list.slice(0, 6).map(function (x) { return h("li", { text: x.name, title: x.name, onclick: x.id ? function () { jump(x.id); } : null }); })) : null); }
    $("#changes").replaceChildren(h("div", { class: "card" }, h("h2", {}, "Since the previous run"), h("div", { class: "changes" }, box("New failures", c.newFail.length ? "r" : "", c.newFail), box("Fixed", c.fixed.length ? "g" : "", c.fixed), box("New tests", "", c.added), box("Removed tests", "", c.removed))));
  }

  // ---------- explorer ----------
  function visible(t) {
    if (S.filter !== "all" && (S.filter === "flaky" ? !t.flaky : t.status !== S.filter)) return false;
    if (S.q) { var hay = (t.name + " " + t.file + " " + (t.err || "") + " " + t.suite).toLowerCase(); if (hay.indexOf(S.q) < 0) return false; }
    return true;
  }
  function sortTests(list) {
    var a = list.slice(); var rank = { failed: 0, skipped: 2, notrun: 3, passed: 1 };
    if (S.sort === "slow") a.sort(function (x, y) { return (y.ms || 0) - (x.ms || 0); });
    else if (S.sort === "name") a.sort(function (x, y) { return x.name.localeCompare(y.name); });
    else a.sort(function (x, y) { return rank[x.status] - rank[y.status] || x.order - y.order; });
    return a;
  }
  function groupKey(t) { return S.group === "suite" ? t.group : S.group === "layer" ? lname(t.layer) : S.group === "file" ? (t.file || "(no file)") : LABEL[t.status]; }
  function sec(title, body, extra) { return h("div", { class: "sec" }, h("h3", {}, title, extra), body); }
  function detail(t) {
    var d = t.detail || {}, box = h("div", { class: "detail" });
    if (t.err) box.appendChild(sec("Error", h("pre", { class: "err", text: t.err }), h("button", { class: "btn sm", onclick: function () { copy(t.err, "Error copied"); }, text: "Copy" })));
    if (d.attempts && (d.attempts.length > 1 || (d.attempts[0] && d.attempts[0].error))) box.appendChild(sec("Attempts", h("div", {}, d.attempts.map(function (a, i) { return h("span", { class: "attempt", title: a.error ? a.error.message : "" }, h("i", { class: "st " + (a.status === "passed" ? "passed" : a.status === "skipped" ? "skipped" : "failed") }), "Attempt " + (i + 1) + " · " + a.status + " · " + ms(a.duration)); }))));
    var last = d.attempts && d.attempts.length ? d.attempts[d.attempts.length - 1] : null;
    if (last && last.error && last.error.snippet) box.appendChild(sec("Where it failed", h("pre", { class: "log", text: last.error.snippet }), last.error.location ? h("span", { class: "pill mono", text: (last.error.location.file || "").split("/").slice(-2).join("/") + ":" + last.error.location.line }) : null));
    var shots = (t.shots || []), vids = (t.videos || []);
    if (shots.length || vids.length || t.trace) {
      var a = h("div", { class: "shots" }, shots.map(function (s) { return h("img", { src: s.url, alt: s.name, onclick: function () { $("#lbimg").src = s.url; $("#lb").classList.add("on"); } }); }), vids.map(function (v) { return h("video", { src: v.url, controls: true, preload: "none" }); }));
      box.appendChild(sec("Screenshots & video", a, t.trace ? h("span", { class: "att" }, h("button", { class: "btn sm go", onclick: function () { openTrace(t.trace); }, text: "Open trace" }), h("a", { class: "btn sm", href: "/api/artifacts/" + t.trace + "/file", text: "Download" })) : null));
    }
    if (last && (last.stdout || last.stderr)) box.appendChild(sec("Output", h("pre", { class: "log", text: (last.stdout || "") + (last.stderr ? "\n[stderr]\n" + last.stderr : "") })));
    var kv = h("dl", { class: "kvs" });
    function row(k, v) { if (v == null || v === "" || (Array.isArray(v) && !v.length)) return; kv.appendChild(h("dt", { text: k })); kv.appendChild(h("dd", {}, typeof v === "string" || typeof v === "number" ? v : v)); }
    row("Status", LABEL[t.status] + (t.retries ? " after " + t.retries + " retr" + (t.retries === 1 ? "y" : "ies") : "")); row("Duration", t.ms != null ? ms(t.ms) : null); row("Layer", lname(t.layer)); row("Suite", t.suite);
    row("File", t.file ? t.file + (d.line ? ":" + d.line : "") : null); row("Browser / project", d.project); row("Tags", (d.tags || []).join(", ")); row("Annotations", (d.annotations || []).map(function (a) { return a.type + (a.description ? ": " + a.description : ""); }).join("; "));
    row("Timeout", d.timeout ? ms(d.timeout) : null); row("Test path", (d.titlePath || []).join(" › "));
    box.appendChild(sec("Details", kv));
    box.appendChild(h("div", { style: "margin-top:12px;display:flex;gap:8px" }, h("button", { class: "btn sm", onclick: function () { copy(location.href.split("#")[0] + "#t-" + t.id, "Link copied"); }, text: "Copy link to this test" }), h("button", { class: "btn sm", onclick: function () { copy(t.name, "Name copied"); }, text: "Copy name" })));
    return box;
  }
  function renderRow(t, maxMs) {
    var path = (t.detail && t.detail.titlePath) || [], title = path.length > 1 ? path[path.length - 1] : t.name, pre = path.length > 1 ? path.slice(0, -1).join(" › ") + " › " : "";
    var open = !!S.open[t.id], row = h("div", { class: "row" + (open ? " open" : ""), id: "t-" + t.id });
    row.appendChild(h("div", { class: "rh", onclick: function () { S.open[t.id] = !S.open[t.id]; var o = S.open[t.id]; row.classList.toggle("open", o); if (o && !row.querySelector(".detail")) row.appendChild(detail(t)); try { history.replaceState(null, "", o ? "#t-" + t.id : location.pathname + location.search); } catch (e) {} } },
      h("i", { class: "st " + t.status }), h("div", { class: "tn" }, pre ? h("span", { class: "pre", text: pre }) : null, title),
      t.retries ? h("span", { class: "pill", style: "color:var(--warn)", text: "retried " + t.retries + "×" }) : null, t.flaky ? h("span", { class: "pill", style: "color:var(--warn)", text: "flaky" }) : null, t.detail && t.detail.project ? h("span", { class: "pill", text: t.detail.project }) : null, t.trace ? h("span", { class: "pill", text: "trace" }) : null, (t.shots || []).length ? h("span", { class: "pill", text: "📷 " + t.shots.length }) : null,
      t.file ? h("span", { class: "tf mono", text: t.file.split("/").slice(-1)[0] + (t.detail && t.detail.line ? ":" + t.detail.line : "") }) : null,
      h("div", { class: "td" }, t.ms != null ? ms(t.ms) : LABEL[t.status])));
    if (open) row.appendChild(detail(t));
    return row;
  }
  function renderExplorer() {
    var list = T.filter(visible), groups = {}, order = [];
    list.forEach(function (t) { var k = groupKey(t); if (!groups[k]) { groups[k] = []; order.push(k); } groups[k].push(t); });
    var root = h("div", { class: "card", id: "explorer" }, h("h2", {}, "Tests", h("span", { class: "n", text: list.length + (list.length !== T.length ? " of " + T.length : "") })));
    if (!list.length) root.appendChild(h("div", { class: "empty", text: T.length ? "No tests match these filters." : "No tests found." }));
    order.sort(function (a, b) { var fa = groups[a].some(function (t) { return t.status === "failed"; }) ? 0 : 1, fb = groups[b].some(function (t) { return t.status === "failed"; }) ? 0 : 1; return fa - fb; });
    order.forEach(function (k) {
      var g = groups[k], c = counts(g), suite = D.suites.filter(function (s) { return s.name === g[0].suite && S.group === "suite"; })[0], maxMs = Math.max.apply(null, g.map(function (t) { return t.ms || 0; }).concat([1]));
      var coll = S.collapsed[k] === true || (S.collapsed[k] === undefined && c.failed === 0 && g.length > 40);
      var head = h("div", { class: "gh", onclick: function () { S.collapsed[k] = !coll; renderExplorer(); } }, h("span", { class: "car", text: coll ? "▸" : "▾" }), h("span", { class: "gt", text: k }), S.group === "suite" ? h("span", { class: "pill", style: "color:" + (COLOR[g[0].layer] || "var(--mut)"), text: lname(g[0].layer) }) : null,
        h("span", { class: "gn" }, c.failed ? h("span", { class: "r", text: c.failed + " failed" }) : null, h("span", { text: g.length + " test" + (g.length === 1 ? "" : "s") }), h("span", { class: "mini" }, h("b", { style: "width:" + c.passed / g.length * 100 + "%;background:var(--ok)" }), h("b", { style: "width:" + c.failed / g.length * 100 + "%;background:var(--bad)" }), h("b", { style: "width:" + c.skipped / g.length * 100 + "%;background:var(--warn)" }))));
      var box = h("div", { class: "grp" }, head);
      if (!coll) {
        if (suite && (suite.command || suite.logTail)) {
          var cmd = "cd " + D.repo.path + " && " + suite.command;
          box.appendChild(h("div", { class: "logbox" }, suite.error ? h("div", { class: "sub", style: "margin:8px 0;color:var(--warn)", text: "⚠ " + suite.error }) : null,
            h("div", { class: "cmd" }, h("code", { text: "$ " + suite.command }), h("button", { class: "btn sm", onclick: function (e) { e.stopPropagation(); copy(cmd, "Command copied"); }, text: "Copy" }), suite.logTail ? h("button", { class: "btn sm", onclick: function (e) { e.stopPropagation(); S.logs[suite.id] = !S.logs[suite.id]; renderExplorer(); }, text: S.logs[suite.id] ? "Hide log" : "Show log" }) : null),
            S.logs[suite.id] ? h("pre", { class: "log", style: "margin-top:8px", text: suite.logTail }) : null));
        }
        sortTests(g).forEach(function (t) { box.appendChild(renderRow(t, maxMs)); });
      }
      root.appendChild(box);
    });
    var old = $("#explorer"); if (old) old.replaceWith(root); else $("#explorerHost").appendChild(root);
  }

  // ---------- analysis ----------
  function renderAnalysis() {
    var a = D.analysis; if (!a) { $("#analysis").replaceChildren(); return; }
    var R = 34, Cc = 2 * Math.PI * R, v = a.summary.score, col = v >= 75 ? "var(--ok)" : v >= 40 ? "var(--warn)" : "var(--bad)";
    var ring = svg("svg", { viewBox: "0 0 80 80", class: "ring" }, svg("circle", { r: R, cx: 40, cy: 40, fill: "none", stroke: "var(--line)", "stroke-width": 8 }), svg("circle", { r: R, cx: 40, cy: 40, fill: "none", stroke: col, "stroke-width": 8, "stroke-linecap": "round", "stroke-dasharray": v / 100 * Cc + " " + Cc, transform: "rotate(-90 40 40)" }));
    var tx = svg("text", { x: 40, y: 47, "text-anchor": "middle", class: "rn" }); tx.textContent = v; ring.appendChild(tx);
    var cover = a.layers.map(function (r) { var pct = r.suggested ? Math.min(100, r.found / r.suggested * 100) : 100, c2 = pct >= 100 ? "var(--ok)" : pct >= 40 ? "var(--warn)" : "var(--bad)"; return h("div", { class: "lrow" }, h("div", { class: "lname" }, h("i", { style: "background:" + (COLOR[r.layer] || "#94a3b8") }), lname(r.layer)), h("div", { class: "track" }, h("b", { style: "width:" + pct + "%;background:" + c2 })), h("div", { class: "lnum" }, h("strong", { text: r.found }), r.suggested ? " / " + r.suggested + " suggested" : ""), h("div", { class: "lnum lms", text: r.files + " file" + (r.files === 1 ? "" : "s") })); });
    var chips = [].concat(a.languages.map(function (l) { return l.name; }), a.frameworks, a.testTools);
    $("#analysis").replaceChildren(h("div", { class: "card" }, h("h2", {}, "What this repo has, and what it needs"),
      h("div", { class: "score" }, ring, h("div", {}, h("b", { style: "font-size:17px", text: "Test coverage of the pyramid: " + v + "/100" }), h("div", { class: "sub", text: a.summary.tests + " tests in " + a.summary.testFiles + " files · " + a.summary.routes + " API routes · " + a.summary.units + " functions" }), h("div", { class: "chips" }, chips.map(function (x) { return h("span", { class: "pill", text: x }); })))),
      cover, h("div", { style: "margin-top:14px" }, a.findings.map(function (f) { return h("div", { class: "find" }, h("i", { class: "dot " + f.level }), h("div", {}, h("b", { text: f.title }), h("span", { text: f.detail }))); }))));
  }

  // ---------- boot ----------
  document.addEventListener("keydown", function (e) {
    if (e.key === "/" && document.activeElement.tagName !== "INPUT") { e.preventDefault(); $("#q").focus(); }
    else if (e.key === "Escape") { $("#lb").classList.remove("on"); if (document.activeElement.tagName === "INPUT") { S.q = ""; $("#q").value = ""; $("#q").blur(); renderExplorer(); } }
  });
  $("#lb").addEventListener("click", function () { $("#lb").classList.remove("on"); });
  var id = (location.hash.match(/^#t-(\d+)/) || [])[1]; if (id) { S.open[+id] = true; }
  renderTop(); renderHero(); renderCharts(); renderChanges(); renderExplorer(); renderAnalysis();
  if (id) setTimeout(function () { var el = document.getElementById("t-" + id); if (el) { el.scrollIntoView({ block: "center" }); el.classList.add("hl"); } }, 60);
  else if (C.failed) { T.forEach(function (t) { if (t.status === "failed") S.open[t.id] = false; }); }
})();
