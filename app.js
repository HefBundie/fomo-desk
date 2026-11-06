/* Grok Bot · FOMO desk app (STEP 8). Plain JS, no build.
   Plan A: opened once as {URL}#t={APP_TOKEN} -> reads {origin}/api/* with the token (kept in localStorage).
   Plan B: opened once as {URL}#d={DATA_PATH} -> reads the JSON files on the data branch (polling, no SSE, no web push).
   Every FOMO URL shown here comes from the data (links.py on the desk). No token or DATA_PATH is in this file. */
(function () {
"use strict";
var RAW = "https://raw.githubusercontent.com/HefBundie/fomo-desk/data/d/";
var POLL = 15, AGENTS = ["scanner", "auditor", "analyst", "executor", "risk"];
var RM = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
var C = {green:"#00d35a",red:"#ff453a",orange:"#ff9f0a",cyan:"#64d2ff",blue:"#0a84ff",yellow:"#ffd60a",pink:"#ff6b9a",sec:"rgba(235,235,245,0.6)",ter:"rgba(235,235,245,0.3)",sep:"rgba(84,84,88,0.55)",c2:"#2c2c2e"};
var ACOL = {scanner:C.cyan,auditor:C.cyan,analyst:C.yellow,executor:C.green,risk:C.pink};

// ---- config from the one-time fragment ----
var h = location.hash.slice(1), q = new URLSearchParams(h.indexOf("=") > 0 && h[0] !== "/" ? h : "");
if (q.get("t")) { localStorage.t = q.get("t"); delete localStorage.d; }
if (q.get("d")) { localStorage.d = q.get("d"); delete localStorage.t; }
var localBase = q.get("base") && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//.test(q.get("base")) ? q.get("base") : null; // dev only
if (localBase) sessionStorage.base = localBase;
if (q.get("t") || q.get("d")) history.replaceState(null, "", location.pathname + location.search + "#" + (q.get("go") || "/home"));
var PLAN = localStorage.t ? "A" : localStorage.d ? "B" : null;
var BASE = sessionStorage.base || RAW;

function get(path) {           // path in API form: "state", "chart?range=1H", "coin/MINT" ...
  var url, opt = {cache: "no-store"};
  if (PLAN === "A") { url = location.origin + "/api/" + path; opt.headers = {Authorization: "Bearer " + localStorage.t}; }
  else {
    var m = path.match(/^chart\?range=(\w+)/), f = m ? "chart/" + m[1] : path.replace(/\?.*$/, "");
    url = BASE + localStorage.d + "/" + f + ".json?ts=" + Date.now();
  }
  return fetch(url, opt).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); });
}
function post(path, body) {
  if (PLAN !== "A") return Promise.reject(new Error("read-only on plan B · change it on Telegram"));
  return fetch(location.origin + "/api/" + path, {method: "POST", headers: {Authorization: "Bearer " + localStorage.t, "Content-Type": "application/json"}, body: JSON.stringify(body || {})})
    .then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(typeof j.detail === "string" ? j.detail : Object.values(j.detail || {}).join(" · ")); return j; }); });
}

// ---- helpers ----
var ERR; var $ = function (s, el) { return (el || document).querySelector(s); };
function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return {"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]; }); }
function money(v, sign) { if (v == null) return "n/a"; var s = Math.abs(v).toLocaleString("en-US", {minimumFractionDigits: 2, maximumFractionDigits: 2}); return (sign ? (v < 0 ? "-" : "+") : (v < 0 ? "-" : "")) + "$" + s; }
function compact(v) { if (v == null) return "n/a"; return "$" + (v >= 1e6 ? (v / 1e6).toFixed(2) + "M" : v >= 1e3 ? (v / 1e3).toFixed(1) + "K" : v.toFixed(0)); }
function price(v) { if (v == null) return "n/a"; return "$" + (v >= 1 ? v.toFixed(4) : v.toPrecision(4)); }
function hm(ts) { if (!ts) return ""; return new Date(ts).toLocaleTimeString("nl-NL", {hour: "2-digit", minute: "2-digit", timeZone: "Europe/Amsterdam"}); }
function age(min) { if (min == null) return ""; return min >= 60 ? Math.floor(min / 60) + "h old" : Math.round(min) + "m old"; }
function cap(s) { return s ? s[0].toUpperCase() + s.slice(1) : s; }
function toast(t) { var e = $("#toast"); e.textContent = t; e.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(function () { e.hidden = true; }, 2200); }
function canvas(el) {
  var r = el.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
  el.width = Math.round(r.width * dpr); el.height = Math.round(r.height * dpr);
  var x = el.getContext("2d"); x.setTransform(dpr, 0, 0, dpr, 0, 0); return {x: x, w: r.width, h: r.height};
}

// ---- state + errors (keep last good numbers, never blank) ----
var S = {range: localStorage.range || "LIVE", lastOk: null, failAt: 0, retry: POLL, data: {}, prevBal: null, seen: +(localStorage.seen || 0)};
function ok() { S.lastOk = new Date(); ERR.hidden = true; S.retry = POLL; }
function fail() {
  var e = ERR; e.hidden = false;
  e.textContent = "Desk offline · retrying in " + S.retry + "s · last update " + (S.lastOk ? hm(S.lastOk) : "never");
}
setInterval(function () { if (!ERR.hidden) { S.retry = Math.max(0, S.retry - 1); fail(); } }, 1000);

// ---- odometer ----
function odometer(el, text) {
  var old = el.dataset.v || "";
  if (RM || old.length !== text.length) {
    el.innerHTML = text.split("").map(function (ch) {
      return /\d/.test(ch) ? '<span class="od"><span style="transform:translateY(-' + ch + 'em)">' + "0123456789".split("").map(function (d) { return "<b>" + d + "</b>"; }).join("") + "</span></span>" : "<span>" + esc(ch) + "</span>";
    }).join(""); el.dataset.v = text; return;
  }
  var cols = el.children, n = text.length, k = 0;
  for (var i = n - 1; i >= 0; i--) {
    if (text[i] !== old[i] && /\d/.test(text[i])) {
      var s = cols[i].firstChild; s.style.transitionDelay = (k++ * 30) + "ms"; s.style.transform = "translateY(-" + text[i] + "em)";
    } else if (!/\d/.test(text[i])) cols[i].textContent = text[i];
  }
  el.dataset.v = text;
}

// ---- charts ----
function lineChart(el, ch, prev) {
  var g = canvas(el), x = g.x, w = g.w, H = g.h, pts = ch.points || [], top = 52, bot = H - 8;
  x.clearRect(0, 0, w, H);
  var sv = ch.start_value;
  var vals = pts.map(function (p) { return p[1]; }); if (sv != null) vals.push(sv);
  var lo = Math.min.apply(null, vals), hi = Math.max.apply(null, vals); if (hi - lo < 1e-9) { lo -= 1; hi += 1; }
  var Y = function (v) { return bot - (v - lo) / (hi - lo) * (bot - top); };
  var t0 = pts.length ? Date.parse(pts[0][0]) : 0, t1 = pts.length ? Date.parse(pts[pts.length - 1][0]) : 1;
  var X = function (t) { return t1 === t0 ? w / 2 : (Date.parse(t) - t0) / (t1 - t0) * w; };
  if (sv != null || !pts.length) { x.setLineDash([4, 4]); x.strokeStyle = C.ter; x.lineWidth = 1; var ys = pts.length ? Y(sv) : (top + bot) / 2; x.beginPath(); x.moveTo(0, ys); x.lineTo(w, ys); x.stroke(); x.setLineDash([]); }
  if (!pts.length) return;
  function draw(frac) {
    x.save(); x.beginPath(); x.rect(0, 0, w * frac + (frac < 1 ? 0 : 1), H); x.clip();
    var gr = x.createLinearGradient(0, top, 0, bot); gr.addColorStop(0, "rgba(0,211,90,0.28)"); gr.addColorStop(1, "rgba(0,211,90,0)");
    x.beginPath(); pts.forEach(function (p, i) { i ? x.lineTo(X(p[0]), Y(p[1])) : x.moveTo(X(p[0]), Y(p[1])); });
    x.lineTo(X(pts[pts.length - 1][0]), bot); x.lineTo(X(pts[0][0]), bot); x.closePath(); x.fillStyle = gr; x.fill();
    x.beginPath(); pts.forEach(function (p, i) { i ? x.lineTo(X(p[0]), Y(p[1])) : x.moveTo(X(p[0]), Y(p[1])); });
    x.strokeStyle = C.green; x.lineWidth = 2; x.lineJoin = "round"; x.stroke(); x.restore();
  }
  var grew = prev && prev.points && prev.points.length && pts.length > prev.points.length;
  if (grew && !RM) { var s = performance.now(), from = X(prev.points[prev.points.length - 1][0]) / w;
    (function f(n) { var k = Math.min(1, (n - s) / 250); x.clearRect(0, top - 1, w, H); draw(from + (1 - from) * k); if (k < 1) requestAnimationFrame(f); else marks(); })(s);
  } else { draw(1); marks(); }
  function marks() {   // above the line; never overlap: a later mark moves up a row
    var rows = [], col = {blue: C.blue, green: C.green, red: C.red}; x.font = "600 12px -apple-system, sans-serif";
    (ch.marks || []).forEach(function (m) {
      var mx = X(m.ts), tw = x.measureText(m.label).width + 12, l = Math.max(0, Math.min(w - tw, mx - tw / 2)), r = 0;
      while (rows[r] && rows[r] > l - 4) r++; rows[r] = l + tw;
      var y = Math.max(2, Math.min(top - 22, top - 22 - r * 24 + 0)) - (r ? 0 : 0);
      y = top - 22 - r * 24; if (y < 0) y = 0;
      x.globalAlpha = RM ? 1 : 0;
      var a0 = performance.now();
      (function fade(n) {
        var k = RM ? 1 : Math.min(1, (n - a0) / 200); x.globalAlpha = k;
        x.fillStyle = col[m.color] || C.sec; roundRect(x, l, y, tw, 20, 10); x.fill();
        x.fillStyle = m.color === "blue" || m.color === "red" ? "#fff" : "#000"; x.fillText(m.label, l + 6, y + 14);
        x.beginPath(); x.moveTo(mx, y + 20); x.lineTo(mx, top); x.strokeStyle = col[m.color]; x.globalAlpha = k * 0.5; x.stroke(); x.globalAlpha = 1;
        if (k < 1) requestAnimationFrame(fade);
      })(a0);
    });
  }
}
function roundRect(x, l, t, w, h, r) { x.beginPath(); x.moveTo(l + r, t); x.arcTo(l + w, t, l + w, t + h, r); x.arcTo(l + w, t + h, l, t + h, r); x.arcTo(l, t + h, l, t, r); x.arcTo(l, t, l + w, t, r); x.closePath(); }
function candleChart(el, co) {
  var g = canvas(el), x = g.x, w = g.w, H = g.h, cs = co.candles || [], vh = 40, top = 10, bot = H - vh - 10;
  x.clearRect(0, 0, w, H);
  if (!cs.length) { x.fillStyle = C.sec; x.font = "15px -apple-system"; x.textAlign = "center"; x.fillText("No prices yet", w / 2, H / 2); return; }
  var el2 = co.exit_lines, vals = []; cs.forEach(function (c) { vals.push(c.h, c.l); }); if (el2 && el2.current_exit) vals.push(el2.current_exit);
  var lo = Math.min.apply(null, vals), hi = Math.max.apply(null, vals); if (hi - lo <= 0) { hi *= 1.01; lo *= 0.99; }
  var Y = function (v) { return bot - (v - lo) / (hi - lo) * (bot - top); }, n = Math.max(cs.length, 20), bw = w / n, vmax = Math.max.apply(null, cs.map(function (c) { return c.v || 0; })) || 1;
  cs.forEach(function (c, i) {
    var cx = (i + n - cs.length) * bw + bw / 2, up = c.c >= c.o, col = up ? C.green : C.red;
    x.strokeStyle = col; x.fillStyle = col; x.beginPath(); x.moveTo(cx, Y(c.h)); x.lineTo(cx, Y(c.l)); x.stroke();
    var y1 = Y(Math.max(c.o, c.c)), y2 = Y(Math.min(c.o, c.c)); x.fillRect(cx - bw * 0.35, y1, bw * 0.7, Math.max(1, y2 - y1));
    x.globalAlpha = 0.5; var vhh = (c.v || 0) / vmax * vh; x.fillRect(cx - bw * 0.35, H - vhh, bw * 0.7, vhh); x.globalAlpha = 1;
  });
  if (el2 && el2.current_exit) {
    var ye = Y(el2.current_exit); x.setLineDash([6, 4]); x.strokeStyle = C.orange; x.lineWidth = 1.5; x.beginPath(); x.moveTo(0, ye); x.lineTo(w, ye); x.stroke(); x.setLineDash([]);
    x.fillStyle = C.orange; x.font = "600 12px -apple-system"; x.fillText("Risk trailing stop", 4, ye - 5);
  }
}
function ring(el, score) {
  var g = canvas(el), x = g.x, r = Math.min(g.w, g.h) / 2 - 8, cx = g.w / 2, cy = g.h / 2;
  x.lineWidth = 10; x.lineCap = "round"; x.strokeStyle = C.c2; x.beginPath(); x.arc(cx, cy, r, 0, Math.PI * 2); x.stroke();
  if (score != null) { x.strokeStyle = score >= 70 ? C.green : C.red; x.beginPath(); x.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * score / 100); x.stroke(); }
  x.fillStyle = "#fff"; x.font = "700 34px -apple-system"; x.textAlign = "center"; x.textBaseline = "middle"; x.fillText(score == null ? "–" : score, cx, cy);
}

// ---- pieces ----
function navbar(st) {
  return '<div class="nav"><a class="av" href="#/account">K</a><a class="bot" href="#/agents">Grok Bot <i>›</i></a>' +
    '<button class="icon" id="sbtn" aria-label="Search"><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/></svg></button>' +
    '<button class="icon" id="bell" aria-label="Notifications"><svg viewBox="0 0 24 24"><path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4zM10 20a2 2 0 0 0 4 0"/></svg>' + (unread() ? '<i class="dot"></i>' : "") + "</button></div>" +
    '<div class="search" id="search"><input id="sq" placeholder="Name, symbol or mint" autocomplete="off"></div>';
}
function unread() { var a = (S.data.activity || {}).rows || []; return a.some(function (r) { return r.kind !== "rejected" && Date.parse(r.ts) > S.seen; }); }
function actRow(r) {
  var col = {bought: C.blue, sold: C.green, stopped: C.red, rejected: "#636366"}[r.kind], href = r.kind === "rejected" ? "#/audit/" + r.mint : "#/coin/" + r.mint;
  var sub = r.subtitle || ""; if (r.kind === "bought") sub = "Executor · " + hm(r.ts);
  var vcls = /^\+/.test(r.value || "") ? "up" : /^-/.test(r.value || "") ? "dn" : "";
  return '<a class="row" href="' + href + '"><span class="ic" style="background:' + col + '">' + esc((r.title || "?").split(" ").pop()[0] || "?") + '</span><div class="mid"><div class="t">' + esc(r.title) + '</div><div class="s">' + esc(sub) + '</div></div><div class="v ' + vcls + '">' + esc(r.value || "") + "</div></a>";
}
function agentCard(a, st) {
  var d = S.data, set = d.settings, last = a.last, body = "", sub = "", ft = "";
  var pct = function (k, g) { return set && set[g] && set[g][k] ? set[g][k].value : null; };
  if (a.name === "scanner") {
    var dec = (d.dec && d.dec.scanner) || [];
    sub = a.today + " pools";
    body = dec.length ? '<div class="feed">' + dec.slice(0, 5).map(function (x) { var k = x.verdict === "kill"; return "<div><span class=" + (k ? "k" : "p") + ">" + esc(x.coin) + "</span><span>" + (k ? esc(x.reason) : "→ auditor") + "</span></div>"; }).join("") + "</div>"
      : '<div class="empty" style="padding:0">Listening for graduations</div>';
  } else if (a.name === "auditor") {
    var ad = d.lastAudit; sub = a.today + " taken apart";
    var rej = ((d.dec && d.dec.auditor) || []).filter(function (x) { return x.verdict === "reject"; }).length;
    if (!ad || !ad.layers || !ad.layers.length) body = '<div class="empty" style="padding:0">No coin taken apart yet</div>';
    else {
      body = '<div class="ct">' + esc(ad.name) + '</div><div class="strips">' + ad.layers.map(function (l) { return "<i class=" + (l.pass === true ? "ok" : l.pass === false ? "no" : "") + "></i>"; }).join("") + "</div>" +
        '<div style="font-size:17px">' + (ad.verdict.result === "cleared" ? '<span class="up">8/8 → Executor</span>' : ad.verdict.result === "rejected" ? '<span class="dn">' + esc(ad.verdict.title.replace("Rejected · ", "")) + "</span>" : "taking apart...") + "</div>";
    }
    ft = "<span>" + rej + " rejected</span>";
  } else if (a.name === "analyst") {
    sub = "Scoring"; var sc = last && last.score != null ? last.score : null;
    body = '<canvas class="ring" data-score="' + (sc == null ? "" : sc) + '"></canvas>' + (last ? '<div class="ct" style="text-align:center">' + esc(last.coin) + " · " + esc(last.verdict) + "</div>" : '<div class="ct" style="text-align:center">Nothing scored yet</div>');
  } else if (a.name === "executor") {
    sub = a.today + " trades";
    if (last) { var filled = last.verdict === "bought", np = Math.min(99, Math.round((Date.now() - Date.parse(last.ts)) / 3000));
      body = '<div style="font:600 28px var(--disp)">' + esc(last.reason) + '</div><div class="ct">' + esc(last.coin) + '</div><div class="bar"><i style="width:' + (filled ? 100 : np) + '%"></i></div><div class="' + (filled ? "up" : "ct") + '">' + (filled ? "✓ Filled" : last.verdict === "sent" ? "Executing... " + np + "%" : esc(cap(last.verdict))) + "</div>";
    } else body = '<div class="empty" style="padding:0">No trades yet tonight</div>';
  } else if (a.name === "risk") {
    sub = st.open_positions ? "Guarding" : last ? (last.verdict === "trail" ? "Trailed out" : last.verdict === "stop" ? "Stopped" : "Guarding") : "Guarding";
    body = '<div style="font:600 28px var(--disp)">' + (st.open_positions ? st.open_positions + " open" : "No open position") + "</div>" + (last ? '<div class="ct">' + esc(last.coin) + " · " + esc(last.reason) + "</div>" : "");
    ft = '<span><span class="pill mono red">stop -' + pct("stop_pct", "risk") + '%</span> <span class="pill mono green">trail ' + pct("trail_pct", "risk") + "%</span></span>";
  }
  return '<div class="card"><div class="hd"><span class="nm" style="color:' + ACOL[a.name] + '">' + cap(a.name) + '</span><span class="ct">' + esc(sub) + '</span></div><div class="body">' + body + '</div><div class="ft">' + ft + "</div></div>";
}
function skHome() { return navbar() + '<div style="padding:8px 16px"><div class="sk" style="height:76px;width:70%"></div><div class="sk" style="height:20px;width:40%;margin-top:10px"></div></div><div class="sk" style="height:240px;margin:16px"></div><div class="sk" style="height:44px;margin:0 16px"></div><div class="sk" style="height:300px;margin:20px 16px;border-radius:28px"></div>'; }

// ---- screens ----
var R = {};
R.home = function (v) {
  var st = S.data.state; if (!st) { v.innerHTML = skHome(); return; }
  if (!$("#bal", v)) {
    v.innerHTML = navbar() + '<div class="bal"><div class="big" id="bal"></div>' + (st.mode === "PAPER" ? '<span class="pill paper">PAPER</span>' : "") + '</div>' +
      '<div class="sub" id="today"></div><div class="chartbox"><canvas id="lc"></canvas><div class="emptychart" id="ce" hidden>Waiting for the first trade</div></div>' +
      '<div class="ranges">' + ["LIVE", "1H", "4H", "1D", "1W", "ALL"].map(function (r) { return '<button data-r="' + r + '"' + (r === S.range ? ' class="on"' : "") + ">" + r + "</button>"; }).join("") + "</div>" +
      '<h2 id="agh"></h2><div class="car" id="car"></div><h2>Activity <a href="#/activity">See all</a></h2><div id="act"></div>';
    v.querySelectorAll(".ranges button").forEach(function (b) { b.onclick = function () { S.range = localStorage.range = b.dataset.r; v.querySelectorAll(".ranges button").forEach(function (x) { x.classList.toggle("on", x === b); }); S.data.chart = null; refresh(); }; });
    wireSearch(v);
  }
  odometer($("#bal", v), money(st.balance));
  $("#today", v).innerHTML = '<span class="' + (st.today_pct >= 0 ? "up" : "dn") + '">' + (st.today_pct >= 0 ? "+" : "") + st.today_pct.toFixed(2) + "%</span> today" + (st.multiplier != null ? ' <span class="pill mult">' + st.multiplier.toFixed(2) + "×</span>" : "");
  var ch = S.data.chart; if (ch) { var empty = !((S.data.activity || {}).rows || []).some(function (r) { return r.kind !== "rejected"; }); $("#ce", v).hidden = !empty; lineChart($("#lc", v), ch, S.prevChart); S.prevChart = ch; }
  var run = st.agents.filter(function (a) { return a.status === "running"; }).length;
  $("#agh", v).innerHTML = "Agents <small>" + run + " running</small>";
  var sl = $("#car", v).scrollLeft; $("#car", v).innerHTML = st.agents.map(function (a) { return agentCard(a, st); }).join(""); $("#car", v).scrollLeft = sl;
  v.querySelectorAll("canvas.ring").forEach(function (c) { ring(c, c.dataset.score === "" ? null : +c.dataset.score); });
  var rows = ((S.data.activity || {}).rows || []).slice(0, 5);
  $("#act", v).innerHTML = rows.length ? '<div class="list">' + rows.map(actRow).join("") + "</div>" : '<div class="empty">Nothing yet tonight</div>';
};
function wireSearch(v) {
  $("#sbtn", v).onclick = function () { $("#search", v).classList.toggle("on"); $("#sq", v).focus(); };
  $("#bell", v).onclick = function () { S.seen = Date.now(); localStorage.seen = S.seen; location.hash = "#/activity"; };
  $("#sq", v).onkeydown = function (e) {
    if (e.key !== "Enter") return; var t = this.value.trim().toLowerCase(); if (!t) return;
    var pool = []; AGENTS.forEach(function (a) { ((S.data.dec || {})[a] || []).forEach(function (x) { pool.push(x); }); });
    ((S.data.activity || {}).rows || []).forEach(function (x) { pool.push({mint: x.mint, coin: x.title}); });
    var hit = pool.find(function (x) { return x.mint && (x.mint.toLowerCase() === t || (x.coin || "").toLowerCase().indexOf(t) >= 0); });
    location.hash = hit ? "#/coin/" + hit.mint : (t.length > 30 ? "#/coin/" + this.value.trim() : location.hash); if (!hit && t.length <= 30) toast("No coin found tonight");
  };
}
R.agents = function (v) {
  var st = S.data.state; if (!st) { v.innerHTML = '<div class="nav"><b>Agents</b></div>' + [1, 2, 3].map(function () { return '<div class="sk" style="height:220px;margin:0 16px 12px"></div>'; }).join(""); return; }
  v.innerHTML = '<div class="nav"><span class="bot" style="font:700 34px var(--disp)">Agents</span></div>' + st.agents.map(function (a) {
    var dec = ((S.data.dec || {})[a.name] || []).slice(0, 20), on = a.status === "running";
    return '<div class="agent"><div class="hd"><i class="sd ' + a.status + '"></i><span class="nm" style="color:' + ACOL[a.name] + '">' + cap(a.name) + '</span><span class="ct" style="color:var(--sec)">' + a.today + ' today</span><button class="sw' + (on ? " on" : "") + (a.locked ? " lock" : "") + '" data-a="' + a.name + '" aria-label="pause or resume"></button></div>' +
      (a.locked ? '<div class="ro" style="padding:4px 0">Locked while a position is open</div>' : "") +
      (dec.length ? dec.map(function (x) { return '<div class="dec"><span class="ct" style="color:var(--sec)">' + hm(x.ts) + '</span><a href="' + esc(x.coin_url) + '" target="_blank" rel="noopener">' + esc(x.coin) + "</a><span>" + esc(x.verdict) + '</span><span class="r">' + esc(x.reason || "") + "</span></div>"; }).join("")
        : '<div class="empty" style="padding:16px 0">' + ({scanner: "Listening for graduations", auditor: "No coin taken apart yet"}[a.name] || "Nothing yet tonight") + "</div>") +
      '<a class="lnk" href="#/account?g=' + a.name + '">Settings</a></div>';
  }).join("");
  v.querySelectorAll(".sw").forEach(function (b) { b.onclick = function () {
    if (b.classList.contains("lock")) return toast("Risk can't be paused while a position is open");
    var act = b.classList.contains("on") ? "pause" : "resume";
    post("agents/" + b.dataset.a + "/" + act).then(function () { refresh(); }).catch(function (e) { toast(e.message); });
  }; });
};
R.activity = function (v) {
  var a = S.data.activity; if (!a) { v.innerHTML = '<div class="sk" style="height:500px;margin:60px 16px"></div>'; return; }
  v.innerHTML = '<div class="nav"><span class="bot" style="font:700 34px var(--disp)">Activity</span></div>' + (a.rows.length ? '<div class="list">' + a.rows.map(actRow).join("") + "</div>" : '<div class="empty">Nothing yet tonight</div>') +
    (a.next_before && PLAN === "A" ? '<a class="lnk" style="margin:0 16px" id="more">Load more</a>' : "");
  var m = $("#more", v); if (m) m.onclick = function () { get("activity?before=" + a.next_before).then(function (j) { a.rows = a.rows.concat(j.rows); a.next_before = j.next_before; R.activity(v); }); };
};
R.coin = function (v, mint) {
  var co = S.data["coin:" + mint];
  if (co === null) { v.innerHTML = back() + '<div class="empty">Coin not on the desk tonight</div>'; return; }
  if (!co) { v.innerHTML = back() + '<div style="padding:16px"><div class="sk" style="height:34px;width:60%"></div><div class="sk" style="height:60px;width:50%;margin-top:16px"></div><div class="sk" style="height:260px;margin-top:16px"></div></div>'; return; }
  var pos = co.position && !co.position.closed_at ? co.position : null, xl = co.exit_lines;
  var chip = co.audit_layers ? '<a class="chip" href="#/audit/' + esc(mint) + '" style="color:' + (co.audit_passed === 8 ? C.green : C.red) + '">🛡 ' + co.audit_passed + "/8</a>" : '<a class="chip" href="#/audit/' + esc(mint) + '" style="color:var(--sec)">🛡 –</a>';
  v.innerHTML = back() + '<div style="padding:0 16px"><div style="display:flex;align-items:center;gap:8px"><span class="cname">' + esc(co.name || mint.slice(0, 6)) + "</span>" + chip + (co.mode === "PAPER" ? '<span class="pill paper">PAPER</span>' : "") + "</div>" +
    '<div class="ct" style="color:var(--sec)">' + esc(co.symbol || "") + " · Solana · " + age(co.age_min) + '</div><div style="font:700 66px/1.1 var(--disp);margin-top:12px">' + price(co.price) + "</div>" +
    (co.since_entry_pct != null ? '<div class="' + (co.since_entry_pct >= 0 ? "up" : "dn") + '">' + (co.since_entry_pct >= 0 ? "▲ " : "▼ ") + Math.abs(co.since_entry_pct).toFixed(2) + "% since entry</div>" : "") + "</div>" +
    '<div class="chartbox" style="height:260px;margin:12px 16px 0"><canvas id="cc"></canvas></div>' +
    '<div class="stats"><div><span>Market cap</span><b>' + compact(co.stats.market_cap) + "</b></div><div><span>Liquidity</span><b>" + compact(co.stats.liquidity_usd) + "</b></div><div><span>24h volume</span><b>" + compact(co.stats.volume_24h) + "</b></div><div><span>Holders</span><b>" + (co.stats.holders == null ? "n/a" : co.stats.holders) + "</b></div></div>" +
    (pos && xl ? '<div class="exit"><div style="font-weight:600">Your position · ' + money(pos.size_usd) + ' in · Executor</div><div class="l"><span style="color:var(--sec)">Stop line' + (xl.stop_pct != null ? " · -" + xl.stop_pct + "%" : "") + '</span><span>' + price(xl.stop) + '</span></div><div class="l"><span style="color:var(--sec)">Trail line</span><span>' + (xl.trail == null ? "not on yet" : price(xl.trail)) + '</span></div><div class="l"><span style="color:var(--sec)">Timeout in</span><span>' + Math.floor(xl.timeout_left_s / 3600) + "h " + Math.floor(xl.timeout_left_s % 3600 / 60) + "m</span></div></div>" : "") +
    '<a class="cta' + (pos ? " sell" : "") + '" href="' + esc(co.coin_url) + '" target="_blank" rel="noopener">' + (pos ? "Sell on FOMO" : "Buy on FOMO") + "</a>";
  candleChart($("#cc", v), co);
};
function back() { return '<div class="head"><button class="back" onclick="history.length>1?history.back():location.hash=\'#/home\'">‹</button></div>'; }
R.audit = function (v, mint) {
  var au = S.data["audit:" + mint];
  if (!au) { v.innerHTML = back() + '<div class="discs">' + [1, 2, 3, 4, 5, 6, 7, 8].map(function () { return '<div class="disc sk"></div>'; }).join("") + "</div>"; return; }
  var L = au.layers || [], en = S.data.settings && S.data.settings.auditor ? S.data.settings.auditor.enabled.value : true;
  if (!L.length) { v.innerHTML = back() + '<div class="empty">No coin taken apart yet</div>'; return; }
  var shown = S.beat[mint] || 0;   // how many layers already revealed (beam never runs ahead of the server)
  v.innerHTML = back() + '<div class="cname" style="padding:0 16px">' + esc(au.name) + '</div><div class="discs">' + L.map(function (l, i) { return '<div class="disc" id="d' + i + '"></div>'; }).join("") + '</div><div class="verd" id="verd"></div><div class="list">' +
    L.map(function (l, i) { return '<div class="row" style="min-height:48px" id="r' + i + '"><div class="mid"><div class="t">' + (i + 1) + ". " + esc(l.name || "Layer " + (i + 1)) + '</div></div><div class="v" style="color:var(--sec)">…</div></div>'; }).join("") + "</div>" +
    '<div class="list" style="margin-top:12px"><div class="row"><div class="mid"><div class="t">Take apart before buying</div></div><button class="sw' + (en ? " on" : "") + '" id="aen"></button></div></div>' +
    '<a class="cta" href="' + esc(au.coin_url) + '" target="_blank" rel="noopener">Open on FOMO</a>';
  function reveal(i) {
    var l = L[i], d = $("#d" + i, v), r = $("#r" + i + " .v", v); if (!d) return;
    d.className = "disc " + (l.pass === true ? "ok" : l.pass === false ? "no" : ""); d.textContent = l.pass === true ? "✓" : l.pass === false ? "✕" : "";
    r.textContent = l.value || ""; r.style.color = l.pass === false ? C.red : l.pass === true ? "#fff" : C.ter;
  }
  function verdict() {
    var vd = au.verdict || {}; $("#verd", v).innerHTML = vd.result && vd.result !== "pending" ? '<b class="' + (vd.result === "cleared" ? "up" : "dn") + '">' + esc(vd.title) + "</b><span>" + esc(vd.subtitle || "") + "</span>" : "<b>Taking apart...</b>";
  }
  var known = L.filter(function (l) { return l.pass !== null || l.value === "not checked"; }).length;
  var done = au.verdict && au.verdict.result !== "pending" ? L.length : known;
  for (var i = 0; i < shown; i++) reveal(i);
  if (RM) { for (i = shown; i < done; i++) reveal(i); S.beat[mint] = done; verdict(); }
  else (function step(i) {
    if (i >= done) { S.beat[mint] = done; if (done === L.length) verdict(); else { var d = $("#d" + i, v); if (d) d.className = "disc scan"; } return; }  // wait on slow server
    var d = $("#d" + i, v); if (!d) return; d.className = "disc scan";
    setTimeout(function () { reveal(i); setTimeout(function () { step(i + 1); }, 150); }, 350);
  })(shown);
  if (shown >= done && done === L.length) verdict();
  $("#aen", v).onclick = function () {
    var b = this, on = b.classList.contains("on");
    if (on && !(confirm("Turn off taking coins apart?") && confirm("Sure? Coins will be bought without the 8-part audit."))) return;
    post("settings", {"auditor.enabled": !on}).then(function () { b.classList.toggle("on"); }).catch(function (e) { toast(e.message); });
  };
};
R.account = function (v, arg) {
  var a = S.data.account, set = S.data.settings;
  if (!a || !set) { v.innerHTML = '<div class="sk" style="height:400px;margin:60px 16px"></div>'; return; }
  var row = function (t, r, href, id) { return '<a class="row" ' + (href ? 'href="' + esc(href) + '" target="_blank" rel="noopener"' : "") + (id ? ' id="' + id + '"' : "") + '><div class="mid"><div class="t">' + t + '</div></div><div class="v" style="color:var(--sec)">' + r + "</div></a>"; };
  var order = ["scanner", "auditor", "analyst", "executor", "risk", "desk"];
  var groups = Object.keys(set).sort(function (a, b) { return order.indexOf(a) - order.indexOf(b); }).map(function (g) {
    return "<h2>" + cap(g) + '</h2><div class="list" id="g-' + g + '">' + Object.keys(set[g]).map(function (k) {
      var s = set[g][k], inp;
      if (s.type === "bool") inp = '<button class="sw' + (s.value ? " on" : "") + '" data-k="' + s.key + '" data-bool="1"></button>';
      else if (s.choices) inp = '<select data-k="' + s.key + '">' + s.choices.map(function (c) { return "<option" + (c === s.value ? " selected" : "") + ">" + c + "</option>"; }).join("") + "</select>";
      else if (s.type === "int" || s.type === "float") inp = '<input type="number" inputmode="decimal" data-k="' + s.key + '" value="' + (s.value == null ? "" : s.value) + '" min="' + s.min + '" max="' + s.max + '" step="' + (s.type === "int" ? 1 : "any") + '">';
      else inp = '<input type="text" data-k="' + s.key + '" value="' + esc(s.value == null ? "" : s.value) + '">';
      var slider = (s.type === "int" || s.type === "float") && s.min != null ? '<input type="range" data-for="' + s.key + '" min="' + s.min + '" max="' + s.max + '" step="' + (s.type === "int" ? 1 : (s.max - s.min) / 200) + '" value="' + (s.value == null ? s.min : s.value) + '">' : "";
      return '<div class="set"><div class="top"><span>' + esc(k.replace(/_/g, " ")) + "</span>" + inp + "</div>" + slider + "</div>";
    }).join("") + "</div>";
  }).join("");
  v.innerHTML = '<div class="nav"><span class="bot" style="font:700 34px var(--disp)">Account</span></div><div class="list">' +
    '<div class="row"><div class="mid"><div class="t">Mode</div></div><div class="seg"><button data-m="PAPER"' + (a.mode === "PAPER" ? ' class="on"' : "") + '>PAPER</button><button data-m="LIVE"' + (a.mode === "LIVE" ? ' class="on"' : "") + ">LIVE</button></div></div>" +
    '<div class="set"><div class="top"><span>Stack (LIVE)</span><input type="number" inputmode="decimal" data-k="desk.stack" value="' + (a.stack == null ? "" : a.stack) + '" placeholder="not set"></div></div>' +
    row("Your FOMO profile", "›", a.profile_url) + row("Invite a friend", "›", null, "inv") +
    row("Telegram", a.telegram === "connected" ? "Connected" : "Not connected") +
    (a.telegram === "connected" ? row("Send test push", "›", null, "tp") : "") +
    row("Notifications", PLAN === "B" ? "Telegram only · plan B" : (navigator.standalone || matchMedia("(display-mode: standalone)").matches) ? "Enable" : "Add to home screen first") +
    "</div>" + (PLAN === "B" ? '<div class="ro">Read-only view · change settings on Telegram ("set stop to -8%")</div>' : "") + groups;
  if (arg && arg.g) { var gEl = $("#g-" + arg.g, v); if (gEl) gEl.scrollIntoView(); }
  $("#inv", v).onclick = function (e) { e.preventDefault(); var u = a.signup_url;
    if (navigator.share) navigator.share({title: "FOMO", url: u}).catch(function () {}); else navigator.clipboard.writeText(u).then(function () { toast("Link copied"); }); };
  var tp = $("#tp", v); if (tp) tp.onclick = function (e) { e.preventDefault(); toast("Test push is sent from the desk on Telegram"); };
  v.querySelectorAll(".seg button").forEach(function (b) { b.onclick = function () {
    var m = b.dataset.m, body = {mode: m}; if (m === a.mode) return;
    if (m === "LIVE") { var t = prompt("Type LIVE to confirm"); if (t !== "LIVE") return; body.confirm = "LIVE"; }
    post("mode", body).then(function () { refresh(); }).catch(function (e) { toast(e.message); });
  }; });
  function save(k, val, el) { var o = {}; o[k] = val; post("settings", o).then(function (j) { toast(j.note || "Saved"); }).catch(function (e) { toast(e.message); refresh(); }); }
  v.querySelectorAll("[data-k]").forEach(function (el) {
    if (el.dataset.bool) el.onclick = function () { var on = !el.classList.contains("on");
      if (el.dataset.k === "auditor.enabled" && !on && !(confirm("Turn off taking coins apart?") && confirm("Sure? Coins will be bought without the 8-part audit."))) return;
      el.classList.toggle("on", on); save(el.dataset.k, on); };
    else el.onchange = function () { var r = v.querySelector('[data-for="' + el.dataset.k + '"]'); if (r) r.value = el.value; save(el.dataset.k, el.value); };
  });
  v.querySelectorAll("input[type=range]").forEach(function (r) {
    r.oninput = function () { var n = v.querySelector('[data-k="' + r.dataset.for + '"]'); n.value = +(+r.value).toFixed(4); };
    r.onchange = function () { save(r.dataset.for, r.value); };
  });
};
S.beat = {};

// ---- routing + polling ----
function route() { var p = (location.hash.slice(1) || "/home").split("?"), parts = p[0].split("/").filter(Boolean); return {name: parts[0] || "home", arg: parts[1], q: Object.fromEntries(new URLSearchParams(p[1] || ""))}; }
function render() {
  var r = route(), v = $("#view");
  if (v.dataset.route !== location.hash) { v.innerHTML = ""; v.dataset.route = location.hash; window.scrollTo(0, 0); }
  document.querySelectorAll(".tabs a").forEach(function (a) { a.classList.toggle("on", a.dataset.tab === r.name || (r.name === "coin" || r.name === "audit") && a.dataset.tab === "home"); });
  if (!PLAN) { v.innerHTML = '<div class="empty" style="padding-top:120px">Open the link from Grok Bot once to connect this app to the desk.</div>'; return; }
  (R[r.name] || R.home)(v, r.name === "account" ? r.q : r.arg);
  var nv = $(".nav", v), er = ERR; if (nv) nv.after(er); else v.before(er);   // error row sits under the navbar
  var su = S.data.account && S.data.account.signup_url; $("#foot").innerHTML = su ? 'New to FOMO? <a href="' + esc(su) + '" target="_blank" rel="noopener">' + esc(su) + "</a>" : "";
}
function refresh() {
  var r = route(), jobs = {state: "state", activity: "activity", account: "account", settings: "settings", chart: "chart?range=" + S.range};
  if (r.name === "coin") jobs["coin:" + r.arg] = "coin/" + r.arg;
  if (r.name === "audit") jobs["audit:" + r.arg] = "audit/" + r.arg;
  var keys = Object.keys(jobs), anyFail = false;
  var ps = keys.map(function (k) { return get(jobs[k]).then(function (j) { S.data[k] = j; }, function (e) { if (/^404$/.test(e.message) && k.indexOf(":") > 0) S.data[k] = null; else anyFail = true; }); });
  ps.push(Promise.all(AGENTS.map(function (a) { return get("agents/" + a + "/decisions").then(function (j) { (S.data.dec = S.data.dec || {})[a] = j.decisions; }, function () { anyFail = true; }); })));
  return Promise.all(ps).then(function () {
    var la = ((S.data.dec || {}).auditor || [])[0];
    var next = la ? get("audit/" + la.mint).then(function (j) { S.data.lastAudit = j; }, function () {}) : Promise.resolve();
    return next;
  }).then(function () { if (anyFail) fail(); else ok(); render(); });
}
window.addEventListener("hashchange", function () { render(); refresh(); });
window.addEventListener("resize", function () { $("#view").dataset.route = ""; render(); });
ERR = $("#err"); render(); if (PLAN) { refresh(); setInterval(refresh, POLL * 1000); }
})();
