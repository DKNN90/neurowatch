/* NeuroWatch — reads feed.json, renders Research / Practice / MND / Ahead, works offline. */
(function () {
  "use strict";

  const TABS = ["research", "practice", "mnd", "ahead"];
  const VIEWS = { research: ["latest"], practice: ["latest", "tracker"], mnd: ["latest", "pipeline"], ahead: ["ahead"] };
  const VIEW_LABEL = { latest: "Latest", tracker: "Tracker", pipeline: "Trial pipeline" };
  const GUIDE_STEP = { proposed: 1, consultation: 2, development: 2, published: 3, in_effect: 4, stalled: 2 };
  const TRIAL_STEP = { preclinical: 0, phase1: 1, phase2: 2, phase3: 3, review: 4, approved: 5 };
  const QUALITY = {
    peer: { cls: "q-peer", text: "Peer-reviewed journal" },
    official: { cls: "q-official", text: "Official body" },
    secondary: { cls: "q-secondary", text: "Reputable secondary — charity, university or specialist press" },
    preprint: { cls: "q-flag", text: "Preprint or conference abstract — not peer reviewed" },
    company: { cls: "q-flag", text: "Company announcement — not peer reviewed" },
    lower: { cls: "q-flag", text: "Lower-reputability source — verify against the original" }
  };
  const KIND_HEAD = {
    study: { points: "Findings", caveats: "Limitations" },
    trial: { points: "Results", caveats: "Caveats" },
    policy: { points: "What it says", caveats: "Caveats" },
    news: { points: "What happened", caveats: "Caveats" }
  };
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  const state = { feed: null, tab: "research", view: "latest", openId: null, topic: {}, aheadFilter: "all", fromCache: false, pendingSeen: null };

  /* ---------- storage (best effort) ---------- */
  const store = {
    get(k, d) { try { const v = localStorage.getItem("nw:" + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem("nw:" + k, JSON.stringify(v)); } catch (e) {} }
  };

  /* ---------- helpers ---------- */
  const $ = (s, el) => (el || document).querySelector(s);
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  function fmtDate(d, approx) {
    if (!d) return "";
    const p = String(d).split("-");
    let out;
    if (p.length === 1) out = p[0];
    else if (p.length === 2) out = MONTHS[+p[1] - 1] + " " + p[0];
    else out = (+p[2]) + " " + MONTHS[+p[1] - 1] + " " + p[0];
    return approx ? "Expected " + out : out;
  }
  function today() { return new Date().toISOString().slice(0, 10); }
  function daysUntil(d) {
    return Math.round((new Date(d + "T00:00:00Z").getTime() - new Date(today() + "T00:00:00Z").getTime()) / 86400000);
  }
  function relDays(d) {
    const n = daysUntil(d);
    if (n === 0) return "today";
    if (n === 1) return "tomorrow";
    if (n > 1 && n < 60) return "in " + n + " days";
    return "";
  }
  function sectionObj(id) {
    if (id === "ahead") return { id: "ahead", name: "Ahead", blurb: state.feed.ahead_blurb || "" };
    return (state.feed.sections || []).find((s) => s.id === id) || { id, name: id, blurb: "", topics: [] };
  }
  function topicLabel(id) {
    for (const s of state.feed.sections || []) for (const t of s.topics || []) if (t.id === id) return t.label;
    return id;
  }
  function trackerById(id) { return (state.feed.trackers || []).find((t) => t.id === id); }
  function inSection(u, sec) { return u.section === sec || (u.also || []).includes(sec); }
  function trackerView(t) { return t.kind === "trial" ? "pipeline" : "tracker"; }

  /* ---------- "new" tracking ---------- */
  function seenMap() { return store.get("seen", {}); }
  function isNew(u, sec) {
    const seen = seenMap()[sec];
    if (!seen) {
      const ref = new Date((state.feed.generated_at || today()).slice(0, 10) + "T00:00:00Z");
      ref.setUTCDate(ref.getUTCDate() - 7);
      return (u.added || u.date) >= ref.toISOString().slice(0, 10);
    }
    return (u.added || u.date) > seen;
  }
  function commitSeen() {
    if (!state.pendingSeen) return;
    const m = seenMap();
    m[state.pendingSeen] = (state.feed.generated_at || today()).slice(0, 10);
    store.set("seen", m);
    state.pendingSeen = null;
    updateDots();
  }
  function updateDots() {
    ["research", "practice", "mnd"].forEach((s) => {
      const has = (state.feed.updates || []).some((u) => inSection(u, s) && isNew(u, s));
      const dot = $('.tabs button[data-tab="' + s + '"] .dot');
      if (dot) dot.hidden = !(has && s !== state.tab);
    });
  }

  /* ---------- rendering ---------- */
  function linkList(links) {
    if (!links || !links.length) return "";
    return '<ul class="links">' + links.map((l) => {
      const q = QUALITY[l.quality] || QUALITY.secondary;
      return '<li><a href="' + esc(l.url) + '" target="_blank" rel="noopener"><span class="u">' + esc(l.label) +
        '</span> ↗<br><span class="q ' + q.cls + '">' + q.text + "</span></a></li>";
    }).join("") + "</ul>";
  }
  function bulletsOrPara(x) {
    if (!x) return "";
    if (Array.isArray(x)) return x.length ? "<ul>" + x.map((v) => "<li>" + esc(v) + "</li>").join("") + "</ul>" : "";
    return "<p>" + esc(x) + "</p>";
  }
  function flagFor(links) {
    // Show a badge when no peer-reviewed or official source backs the item.
    const qs = (links || []).map((l) => l.quality);
    if (qs.includes("peer") || qs.includes("official")) return "";
    if (qs.includes("preprint")) return '<span class="flag-badge">NOT PEER REVIEWED</span>';
    if (qs.includes("company")) return '<span class="flag-badge">COMPANY DATA</span>';
    return "";
  }

  function updateCard(u, sec) {
    const open = state.openId === u.id;
    const tr = u.tracker ? trackerById(u.tracker) : null;
    const h = KIND_HEAD[u.kind] || KIND_HEAD.news;
    const also = u.section !== sec ? '<p class="also">From ' + esc(sectionObj(u.section).name) + "</p>" : "";
    return '<article class="card" id="c-' + esc(u.id) + '"' + (open ? " open" : "") + ">" +
      '<button class="card-btn" data-toggle="' + esc(u.id) + '" aria-expanded="' + open + '">' +
        '<div class="card-meta"><span>' + esc(u.date_label || fmtDate(u.date)) + '</span><span class="chip">' + esc(u.source) + "</span><span>" + esc(u.type) + "</span>" +
        (isNew(u, sec) ? '<span class="new-badge">NEW</span>' : "") + flagFor(u.links) + '<span class="chev">▾</span></div>' +
        "<h3>" + esc(u.title) + "</h3>" +
        '<p class="summary">' + esc(u.summary) + "</p>" +
      "</button>" +
      (open ? '<div class="detail">' + also +
        (u.design ? "<h4>Design</h4>" + bulletsOrPara(u.design) : "") +
        (u.points && u.points.length ? "<h4>" + h.points + "</h4>" + bulletsOrPara(u.points) : "") +
        (u.caveats && u.caveats.length ? "<h4>" + h.caveats + "</h4>" + bulletsOrPara(u.caveats) : "") +
        (u.who ? "<h4>Who it affects</h4>" + bulletsOrPara(u.who) : "") +
        (u.dates ? "<h4>Key dates</h4>" + bulletsOrPara(u.dates) : "") +
        "<h4>Sources</h4>" + linkList(u.links) +
        (tr ? '<button class="related" data-goto-tracker="' + esc(tr.id) + '">Follow it: ' + esc(tr.short || tr.name) + " →</button>" : "") +
      "</div>" : "") +
    "</article>";
  }

  function stageBar(t) {
    const trial = t.kind === "trial";
    const stalled = t.stage === "stalled" || t.stage === "stopped";
    const total = trial ? 5 : 4;
    const n = trial ? (TRIAL_STEP[t.stage === "stopped" ? t.reached : t.stage] || 0) : (GUIDE_STEP[t.stage === "stalled" && t.reached ? t.reached : t.stage] || 1);
    let steps = "";
    for (let i = 1; i <= total; i++) steps += '<i class="' + (i <= n ? "on" : "") + '"></i>';
    const key = trial ? '<div class="phase-key" aria-hidden="true"><span>Ph1</span><span>Ph2</span><span>Ph3</span><span>Rev</span><span>Lic</span></div>' : "";
    return '<div class="stage"><div class="stage-bar"><span class="steps' + (stalled ? " stalled" : "") + '" aria-hidden="true">' + steps + "</span>" + key + "</div>" +
      '<span class="stage-label' + (stalled ? " stalled" : "") + '">' + esc(t.stage_label) + "</span></div>";
  }

  function trackerCard(t) {
    const open = state.openId === t.id;
    return '<article class="card" id="c-' + esc(t.id) + '"' + (open ? " open" : "") + ">" +
      '<button class="card-btn" data-toggle="' + esc(t.id) + '" aria-expanded="' + open + '">' +
        '<div class="card-meta"><span>' + esc((t.bodies || []).slice(0, 3).join(" · ")) + '</span><span class="chev">▾</span></div>' +
        "<h3>" + esc(t.name) + "</h3>" + stageBar(t) +
        '<p class="summary">' + esc(t.summary) + "</p>" +
      "</button>" +
      (open ? '<div class="detail">' +
        (t.points && t.points.length ? "<h4>Where it stands</h4>" + bulletsOrPara(t.points) : "") +
        (t.timeline && t.timeline.length ? '<h4>Timeline</h4><ul class="timeline">' + t.timeline.map((s) =>
          '<li class="' + (s.done ? "done" : "") + '"><span class="t-date">' + fmtDate(s.date, s.approx && !s.done) + '</span><span class="t-label">' + esc(s.label) + "</span></li>").join("") + "</ul>" : "") +
        (t.next ? "<h4>What happens next</h4><p>" + esc(t.next) + "</p>" : "") +
        "<h4>Sources</h4>" + linkList(t.links) +
        '<p class="footnote" style="text-align:left;margin:12px 0 0">Last reviewed ' + fmtDate(t.updated) + "</p>" +
      "</div>" : "") +
    "</article>";
  }

  function filterBar(sec) {
    // Only offer topics that currently have items in this section.
    const used = new Set();
    (state.feed.updates || []).forEach((u) => { if (inSection(u, sec)) (u.topics || []).forEach((t) => used.add(t)); });
    const topics = (sectionObj(sec).topics || []).filter((t) => used.has(t.id));
    if (!topics.length) return "";
    const cur = state.topic[sec] || "all";
    return '<div class="filters" role="group" aria-label="Filter by topic">' +
      ['<button data-topic="all" aria-pressed="' + (cur === "all") + '">All</button>']
        .concat(topics.map((t) => '<button data-topic="' + esc(t.id) + '" aria-pressed="' + (cur === t.id) + '">' + esc(t.label) + "</button>")).join("") +
      "</div>";
  }

  function renderLatest() {
    const sec = state.tab;
    const cur = state.topic[sec] || "all";
    const items = (state.feed.updates || []).filter((u) => inSection(u, sec) && (cur === "all" || (u.topics || []).includes(cur)))
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
    state.pendingSeen = sec;
    let html = filterBar(sec);
    if (!items.length) return html + '<p class="empty">Nothing here yet for this topic.</p>';
    return html + items.map((u) => updateCard(u, sec)).join("");
  }

  function renderTrackers() {
    const sec = state.tab;
    const lastMove = (t) => (t.timeline || []).filter((s) => s.done).map((s) => String(s.date)).sort().pop() || "";
    const items = (state.feed.trackers || []).filter((t) => t.section === sec)
      .sort((a, b) => { const x = lastMove(a), y = lastMove(b); return x < y ? 1 : x > y ? -1 : 0; });
    if (!items.length) return '<p class="empty">Nothing tracked here yet.</p>';
    return items.map(trackerCard).join("");
  }

  function renderAhead() {
    const t = today();
    const f = state.aheadFilter;
    const items = (state.feed.upcoming || []).filter((e) => (e.end || e.date) >= t && (f === "all" || e.section === f))
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    let html = '<div class="filters" role="group" aria-label="Filter by section">' +
      [["all", "All"], ["research", "Research"], ["practice", "Practice"], ["mnd", "MND"]].map(([id, label]) =>
        '<button data-ahead="' + id + '" aria-pressed="' + (f === id) + '">' + label + "</button>").join("") + "</div>";
    if (!items.length) return html + '<p class="empty">Nothing scheduled.</p>';
    let lastMonth = "";
    items.forEach((e) => {
      const p = e.date.split("-");
      const m = MONTHS[+p[1] - 1] + " " + p[0];
      if (m !== lastMonth) { html += '<div class="month">' + m + "</div>"; lastMonth = m; }
      const live = e.end && e.date <= t && e.end >= t;
      const rel = e.approx ? "Date approximate" : live ? "happening now" : relDays(e.date);
      const span = e.end ? fmtDate(e.date) + " – " + fmtDate(e.end) : fmtDate(e.date);
      const tr = e.tracker ? trackerById(e.tracker) : null;
      html += '<div class="event"><div class="day"><b>' + (e.approx ? "~" : +p[2]) + "</b><small>" + MONTHS[+p[1] - 1] + "</small></div>" +
        '<div><p class="e-title">' + esc(e.title) + "</p>" +
        '<div class="e-sub"><span class="sec-tag ' + esc(e.section) + '">' + esc(sectionObj(e.section).short || e.section).toUpperCase() + "</span>" +
          "<span>" + esc(e.approx ? rel : span + (rel ? " · " + rel : "")) + (e.where ? " · " + esc(e.where) : "") + "</span></div>" +
        '<div class="e-actions">' +
          (tr ? '<button class="e-link" data-goto-tracker="' + esc(tr.id) + '">' + esc(tr.short || tr.name) + " →</button>" : "") +
          (e.url ? '<a class="e-link" href="' + esc(e.url) + '" target="_blank" rel="noopener">Details ↗</a>' : "") +
        "</div></div></div>";
    });
    return html;
  }

  function renderSegments() {
    const views = VIEWS[state.tab];
    const nav = $("#segments");
    if (views.length < 2) { nav.innerHTML = ""; return; }
    nav.innerHTML = views.map((v) => '<button role="tab" data-view="' + v + '" aria-selected="' + (v === state.view) + '">' + VIEW_LABEL[v] + "</button>").join("");
  }

  function render() {
    const f = state.feed;
    document.documentElement.setAttribute("data-tab", state.tab);
    const s = sectionObj(state.tab);
    $("#tab-title").textContent = s.title || s.name;
    const updated = fmtDate((f.generated_at || "").slice(0, 10));
    const next = f.next_update ? " · Next update " + fmtDate(f.next_update) : "";
    $("#meta").textContent = "Updated " + updated + next + (state.fromCache ? " · offline copy" : "");
    renderSegments();
    document.querySelectorAll(".tabs button").forEach((b) => b.setAttribute("aria-current", String(b.dataset.tab === state.tab)));

    let blurb = s.blurb;
    if (state.view === "tracker") blurb = s.tracker_blurb || blurb;
    if (state.view === "pipeline") blurb = s.pipeline_blurb || blurb;
    let body = '<p class="blurb">' + esc(blurb) + "</p>";
    if (state.view === "latest") body += renderLatest();
    else if (state.view === "ahead") body += renderAhead();
    else body += renderTrackers();
    body += '<p class="footnote">Summaries of published research and public documents, for professional awareness. Not clinical guidance — check the original source before relying on anything here.</p>';
    $("#content").innerHTML = body;
    updateDots();
  }

  /* ---------- navigation ---------- */
  function hashFor() {
    if (state.tab === "ahead") return "#/ahead";
    return "#/" + state.tab + "/" + state.view + (state.openId ? "/" + state.openId : "");
  }
  function go(tab, view, openId, scroll) {
    if (tab !== state.tab) commitSeen();
    if (!VIEWS[tab].includes(view)) view = VIEWS[tab][0];
    state.tab = tab; state.view = view; state.openId = openId || null;
    store.set("last", { tab, view });
    const hash = hashFor();
    if (location.hash !== hash) history.replaceState(null, "", hash);
    render();
    if (scroll && openId) {
      const el = document.getElementById("c-" + openId);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    } else if (!openId) window.scrollTo(0, 0);
  }
  function gotoTracker(id) {
    const t = trackerById(id);
    if (!t) return;
    closeSheets();
    go(t.section, trackerView(t), id, true);
  }

  document.addEventListener("click", (e) => {
    const tog = e.target.closest("[data-toggle]");
    if (tog) {
      const id = tog.dataset.toggle;
      state.openId = state.openId === id ? null : id;
      history.replaceState(null, "", hashFor());
      render();
      const el = document.getElementById("c-" + id);
      if (el && state.openId && el.getBoundingClientRect().top < 50) el.scrollIntoView({ block: "start" });
      return;
    }
    const gt = e.target.closest("[data-goto-tracker]");
    if (gt) { gotoTracker(gt.dataset.gotoTracker); return; }
    const tp = e.target.closest("[data-topic]");
    if (tp) { state.topic[state.tab] = tp.dataset.topic; state.openId = null; render(); return; }
    const ah = e.target.closest("[data-ahead]");
    if (ah) { state.aheadFilter = ah.dataset.ahead; render(); return; }
    const seg = e.target.closest(".segments button");
    if (seg) { go(state.tab, seg.dataset.view, null); return; }
    const tb = e.target.closest(".tabs button");
    if (tb) { go(tb.dataset.tab, tb.dataset.tab === state.tab ? state.view : (VIEWS[tb.dataset.tab][0]), null); return; }
    const res = e.target.closest("[data-result]");
    if (res) {
      const [kind, id] = res.dataset.result.split(":");
      closeSheets();
      if (kind === "t") gotoTracker(id);
      else {
        const u = state.feed.updates.find((x) => x.id === id);
        if (u) { state.topic[u.section] = "all"; go(u.section, "latest", id, true); }
      }
      return;
    }
    if (e.target.closest("[data-close]") || e.target.classList.contains("sheet")) closeSheets();
  });

  /* ---------- sheets ---------- */
  function closeSheets() { document.querySelectorAll(".sheet").forEach((s) => (s.hidden = true)); }

  $("#btn-search").addEventListener("click", () => {
    if (!state.feed) return;
    $("#search-sheet").hidden = false;
    const inp = $("#search-input");
    inp.value = ""; $("#search-results").innerHTML = '<p class="empty">Search studies, guidance and tracked items across every section.</p>';
    setTimeout(() => inp.focus(), 50);
  });
  $("#search-input").addEventListener("input", (e) => {
    const q = e.target.value.trim().toLowerCase();
    const out = $("#search-results");
    if (q.length < 2) { out.innerHTML = '<p class="empty">Type at least two letters.</p>'; return; }
    const hit = (o) => JSON.stringify(o).toLowerCase().includes(q);
    const ts = state.feed.trackers.filter(hit).map((t) => ({ k: "t", id: t.id, s: t.section, meta: (t.kind === "trial" ? "Pipeline" : "Tracker") + " · " + t.stage_label, title: t.name }));
    const us = state.feed.updates.filter(hit).sort((a, b) => (a.date < b.date ? 1 : -1))
      .map((u) => ({ k: "u", id: u.id, s: u.section, meta: (u.date_label || fmtDate(u.date)) + " · " + u.source, title: u.title }));
    const all = ts.concat(us);
    out.innerHTML = all.length ? all.map((x) =>
      '<div class="result"><button data-result="' + x.k + ":" + esc(x.id) + '"><div class="r-meta">' + esc(sectionObj(x.s).name) + " · " + esc(x.meta) + '</div><div class="r-title">' + esc(x.title) + "</div></button></div>").join("")
      : '<p class="empty">No matches.</p>';
  });

  let deferredInstall = null;
  window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); deferredInstall = e; });

  function installHelp() {
    const standalone = window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
    if (standalone) return "";
    const ua = navigator.userAgent || "";
    const ios = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    if (ios) {
      return '<div class="install"><b>Add to your Home Screen</b><ol>' +
        "<li>Open this page in <b>Safari</b>.</li>" +
        "<li>Tap the <b>Share</b> button (the square with an arrow).</li>" +
        "<li>Scroll down and tap <b>Add to Home Screen</b>, then <b>Add</b>.</li></ol></div>";
    }
    if (deferredInstall) return '<button class="install-btn" id="do-install">Install on this device</button>';
    return '<div class="install"><b>Install:</b> in Chrome, open the ⋮ menu and choose <i>Install app</i> or <i>Add to Home screen</i>.</div>';
  }

  $("#btn-info").addEventListener("click", () => {
    const f = state.feed;
    if (!f) return;
    const bySection = ["research", "practice", "mnd"].map((s) => {
      const srcs = (f.sources || []).filter((x) => x.section === s);
      return "<h3>" + esc(sectionObj(s).name) + '</h3><ul class="src-list">' + srcs.map((x) =>
        '<li><a href="' + esc(x.url) + '" target="_blank" rel="noopener">' + esc(x.name) + ' ↗</a><span class="src-status ' +
        (x.status === "checked" ? "ok" : "bad") + '">' + (x.status === "checked" ? "Checked" : "Not reached") + "</span></li>").join("") + "</ul>";
    }).join("");
    $("#info-body").innerHTML =
      "<h3>What this is</h3><p>" + esc(f.about || "") + "</p>" +
      "<p>" + esc(f.coverage_note || "") + " Last updated " + fmtDate((f.generated_at || "").slice(0, 10)) + ".</p>" +
      installHelp() +
      '<h3>Source labels</h3><div class="legend">' +
      Object.keys(QUALITY).map((k) => '<p><span class="q ' + QUALITY[k].cls + '">' + QUALITY[k].text + "</span></p>").join("") +
      "<p>Items backed only by a company release or an unreviewed abstract carry a badge on the card.</p></div>" +
      "<h3>Sources monitored</h3>" + bySection +
      '<p class="footnote">Summaries are prepared with AI assistance and may contain errors. Not clinical, legal or prescribing advice.</p>';
    $("#info-sheet").hidden = false;
    const ib = $("#do-install");
    if (ib) ib.addEventListener("click", async () => { deferredInstall.prompt(); await deferredInstall.userChoice; deferredInstall = null; closeSheets(); });
  });

  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") commitSeen(); });
  window.addEventListener("pagehide", commitSeen);

  /* ---------- data loading ---------- */
  const ROUTE = /^#\/(research|practice|mnd|ahead)(?:\/(latest|tracker|pipeline))?(?:\/(.+))?$/;
  function routeFromHash() {
    const m = location.hash.match(ROUTE);
    if (!m) return null;
    return { tab: m[1], view: m[2] || VIEWS[m[1]][0], id: m[3] || null };
  }

  async function load() {
    try {
      const res = await fetch("feed.json", { cache: "no-cache" });
      if (!res.ok) throw new Error("HTTP " + res.status);
      state.fromCache = res.headers.get("x-nw-cache") === "1";
      state.feed = await res.json();
      if (!state.feed.sections) throw new Error("empty feed");
    } catch (err) {
      $("#content").innerHTML = '<p class="empty">Couldn\'t load the feed. Connect to the internet once so the app can save a copy for offline use.</p>';
      $("#meta").textContent = "";
      return;
    }
    const banner = $("#offline-banner");
    if (state.fromCache || !navigator.onLine) { banner.textContent = "Offline — showing the last saved update"; banner.hidden = false; }

    const r = routeFromHash();
    const last = store.get("last", null);
    if (r) go(r.tab, r.view, r.id, !!r.id);
    else if (last && TABS.includes(last.tab)) go(last.tab, last.view || VIEWS[last.tab][0], null);
    else go("research", "latest", null);
  }

  window.addEventListener("hashchange", () => {
    if (!state.feed) return;
    const r = routeFromHash();
    if (r && (r.tab !== state.tab || r.view !== state.view || r.id !== state.openId)) go(r.tab, r.view, r.id, !!r.id);
  });
  window.addEventListener("online", () => { $("#offline-banner").hidden = true; });
  window.addEventListener("offline", () => { const b = $("#offline-banner"); b.textContent = "Offline — showing the last saved update"; b.hidden = false; });

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => { navigator.serviceWorker.register("sw.js").catch(() => {}); });
  }
  load();
})();
