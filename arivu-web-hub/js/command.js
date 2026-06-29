// Arivu Command — operations dashboard (hub as source of truth).
(function () {
  const $ = (id) => document.getElementById(id);
  const CFG = window.ArivuConfig;

  let state = {
    corpus: [],
    sentinels: [],
    activity: [],
    hubOnline: false,
    selectedId: null,
    selectedSentinelId: null,
    search: "",
    serialPaused: false,
    serialLines: [],
    serialSentinelId: null,
    gatewaySentinelId: null,
  };

  let mapOverview = null;
  let mapFull = null;
  let overviewCorpusMarkers = [];
  let fullCorpusMarkers = [];
  let pollTimer = null;
  let serialTimer = null;
  let systemTimer = null;

  const DEFAULT_SETTINGS = {
    hubUrl: (CFG && CFG.hub && CFG.hub.url) || "http://localhost:8787",
    liveSentinelId: "grove_1",
    pollIntervalSec: 15,
    serialPollMs: 1000,
  };

  function loadSettings() {
    const s = (window.ArivuHub && ArivuHub.getSettings()) || {};
    return Object.assign({}, DEFAULT_SETTINGS, s);
  }

  function getLiveSentinelId() {
    return loadSettings().liveSentinelId || "grove_1";
  }

  const VIEW_META = {
    overview: { title: "Overview", subtitle: "Western Ghats operations at a glance" },
    serial: { title: "Serial", subtitle: "ESP32 USB output per sentinel" },
    corpus: { title: "Knowledge", subtitle: "Elder corpus from Saakshi · structured & exportable" },
    sentinels: { title: "Sentinels", subtitle: "Kaavu boxes linked to elder predictions for Kaalam validation" },
    areas: { title: "Areas", subtitle: "Corpus & sentinels grouped by grove / region" },
    map: { title: "Map", subtitle: "Corpus entries and sentinel positions" },
    settings: { title: "Settings", subtitle: "Connection, display, and system status" },
  };

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function log(msg) {
    const time = new Date().toLocaleTimeString("en-IN", { hour12: false });
    state.activity.unshift({ time, msg });
    if (state.activity.length > 50) state.activity.pop();
  }

  function fmtTime(iso) {
    if (!iso) return "—";
    try {
      return new Date(iso).toLocaleString("en-IN", {
        day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
      });
    } catch { return iso; }
  }

  function typeLabel(t) {
    const map = { A: "TYPE A", B: "TYPE B", C: "TYPE C",
      TYPE_A_IDENTIFICATION: "TYPE A", TYPE_B_USE: "TYPE B", TYPE_C_PREDICTION: "TYPE C" };
    return map[t] || t || "—";
  }

  function typeKey(t) {
    if (!t) return null;
    const s = String(t).toUpperCase();
    if (s === "A" || s.includes("TYPE_A") || s.includes("IDENT")) return "A";
    if (s === "B" || s.includes("TYPE_B") || s.includes("USE")) return "B";
    if (s === "C" || s.includes("TYPE_C") || s.includes("PRED")) return "C";
    return null;
  }

  function countByTribe() {
    const counts = {};
    state.corpus.forEach((e) => {
      const t = (e.tribe || "Unspecified").trim();
      counts[t] = (counts[t] || 0) + 1;
    });
    return counts;
  }

  function datasetRow(e) {
    const lat = e.lat != null ? e.lat : e.latitude;
    const lng = e.lng != null ? e.lng : e.longitude;
    return {
      id: e.id,
      elder_name: e.elder_name || "",
      tribe: e.tribe || "",
      village: e.village || e.location_name || "",
      district: e.district || "",
      knowledge_type: typeLabel(e.knowledge_type),
      species: e.species_mentioned || "",
      consent_level: consentLabel(e.consent_level),
      validation_status: e.validation_status || "PENDING",
      geohash: e.geohash || "",
      lat: lat != null && !(lat === 0 && lng === 0) ? lat : "",
      lng: lng != null && !(lat === 0 && lng === 0) ? lng : "",
      transcript: e.transcript || "",
      synced: e.received_at || e.created_at || "",
    };
  }

  function countByType() {
    const counts = { A: 0, B: 0, C: 0, other: 0 };
    state.corpus.forEach((e) => {
      const k = typeKey(e.knowledge_type);
      if (k) counts[k]++;
      else counts.other++;
    });
    return counts;
  }

  function consentClass(c) {
    const v = (c || "OPEN").toLowerCase().replace("community_only", "community");
    return v.includes("embargo") ? "embargoed" : v.includes("community") ? "community" : "open";
  }

  function consentLabel(c) {
    if (!c) return "OPEN";
    if (c === "COMMUNITY_ONLY") return "COMMUNITY";
    return c;
  }

  function coords(e) {
    const lat = e.lat != null ? e.lat : e.latitude;
    const lng = e.lng != null ? e.lng : e.longitude;
    if (lat == null || lng == null || (lat === 0 && lng === 0)) return null;
    return [lat, lng];
  }

  function sentinelHealth(s) {
    const t = s.telemetry || {};
    if (s.live_hardware && s.last_live_at) {
      const age = Date.now() - new Date(s.last_live_at).getTime();
      if (age < 120_000) return 95;
      if (age < 600_000) return 55;
    }
    const batt = t.battery_pct != null ? t.battery_pct : 50;
    const online = s.status === "online";
    let score = online ? 40 : 0;
    score += Math.min(40, batt * 0.4);
    if (t.solar_charging) score += 10;
    if (t.humidity_pct != null && t.humidity_pct > 30 && t.humidity_pct < 95) score += 10;
    return Math.round(Math.min(100, score));
  }

  function healthClass(score) {
    if (score < 40) return "crit";
    if (score < 70) return "warn";
    return "";
  }

  function battClass(pct) {
    if (pct == null) return "";
    if (pct < 25) return "crit";
    if (pct < 50) return "low";
    return "";
  }

  // ---- data ----
  async function refresh() {
    if (!window.ArivuHub) return;
    try {
      const dash = await ArivuHub.fetchDashboard();
      state.corpus = dash.corpus || [];
      state.sentinels = dash.sentinels || [];
      state.hubOnline = true;
      $("hubPill").className = "hub-pill online";
      $("hubPill").innerHTML = '<span class="dot"></span> Hub online';
      $("lastSync").textContent = "Synced " + fmtTime(dash.updated_at);
      log("Dashboard refreshed · " + state.corpus.length + " entries · " + state.sentinels.length + " sentinels");
      if (dash.validation_pipeline && !dash.validation_pipeline.skipped && dash.validation_pipeline.assessed_count) {
        log("Sentinel assessment · " + dash.validation_pipeline.assessed_count + " Type C" +
          (dash.validation_pipeline.changed_count ? " · " + dash.validation_pipeline.changed_count + " new recommendations" : ""));
      }
      (dash.validation_log || []).slice(0, 3).forEach((v) => log(v.msg));
    } catch (e) {
      state.hubOnline = false;
      $("hubPill").className = "hub-pill offline";
      $("hubPill").innerHTML = '<span class="dot"></span> Hub offline';
      $("lastSync").textContent = "Hub offline — restart the hub server";
      log("Hub unreachable — " + (e.message || e));
    }
    renderAll();
  }

  async function deleteEntry(id) {
    if (!confirm("Delete this entry from the store?")) return;
    try {
      await ArivuHub.deleteCorpusEntry(id);
      log("Deleted entry " + id);
      await refresh();
      $("entryModal").close();
    } catch (e) {
      alert("Delete failed: " + (e.message || e));
    }
  }

  // ---- render ----
  function renderAll() {
    renderStats();
    renderCorpusTable();
    renderSentinels();
    renderSentinelMini();
    renderRecent();
    renderMaps();
    renderNavBadges();
    renderOverviewTypes();
    renderAreas();
    renderDataset();
    renderOverview();
    if (state.currentView === "serial") renderSerialSentinelTabs();
    if (document.querySelector("#view-sentinels.active")) renderSentinelValidation();
  }

  function renderNavBadges() {
    $("navCorpusCount").textContent = state.corpus.length;
    const online = state.sentinels.filter((s) => s.status === "online").length;
    $("navSentinelCount").textContent = online + "/" + state.sentinels.length;
  }

  // ---- areas (grove / region grouping) ----
  const AREA_RULES = [
    { name: "Wayanad", re: /wayanad|pulpalli|meppadi|kalpetta|cheenkanni|kurichiya|paniya|kuruma|mananthavady|sultan/i },
    { name: "BR Hills", re: /br\s*hills|biligiri|chamarajanagar|yelandur|soliga|k\.?\s*gudi/i },
    { name: "Nilgiris", re: /nilgiri|gudalur|ooty|toda|kota/i },
    { name: "Idukki", re: /idukki|munnar|muthuvan|high\s*range|shola/i },
    { name: "Silent Valley", re: /silent\s*valley|cholanaikkan|attappadi|palakkad/i },
  ];

  function areaOf(rec) {
    const hay = [rec.location, rec.district, rec.village, rec.location_name, rec.tribe, rec.name]
      .filter(Boolean).join(" ");
    for (const r of AREA_RULES) if (r.re.test(hay)) return r.name;
    return (rec.location || rec.district || rec.village || "Other").trim() || "Other";
  }

  function groupAreas() {
    const map = new Map();
    const ensure = (name) => {
      if (!map.has(name)) map.set(name, { name, sentinels: [], corpus: [] });
      return map.get(name);
    };
    state.sentinels.forEach((s) => ensure(areaOf(s)).sentinels.push(s));
    state.corpus.forEach((e) => ensure(areaOf(e)).corpus.push(e));
    const areas = [...map.values()].map((a) => {
      const online = a.sentinels.filter((s) => s.status === "online").length;
      const healths = a.sentinels.map(sentinelHealth);
      const health = healths.length ? Math.round(healths.reduce((x, y) => x + y, 0) / healths.length) : null;
      const alerts = a.sentinels.filter(
        (s) => s.status === "offline" || sentinelHealth(s) < 40 || (s.telemetry && s.telemetry.smoke)
      ).length;
      return Object.assign(a, { online, health, alerts });
    });
    areas.sort((a, b) => (b.sentinels.length + b.corpus.length) - (a.sentinels.length + a.corpus.length));
    return areas;
  }

  function selectArea(name) {
    state.selectedArea = state.selectedArea === name ? null : name;
    renderAreas();
  }

  function renderAreas() {
    const grid = $("areasGrid");
    if (!grid) return;
    const areas = groupAreas();
    if ($("navAreaCount")) $("navAreaCount").textContent = areas.length;
    if (!areas.length) { grid.innerHTML = '<p class="empty">No data yet — sync from the Saakshi app.</p>'; return; }

    grid.innerHTML = areas.map((a) => {
      const hCls = a.health == null ? "" : healthClass(a.health);
      const alertChip = a.alerts
        ? '<span class="area-alert warn">⚠ ' + a.alerts + " alert" + (a.alerts > 1 ? "s" : "") + "</span>"
        : '<span class="area-alert ok">✓ clear</span>';
      const healthRow = a.health == null
        ? '<div class="area-health none">No sentinel yet</div>'
        : '<div class="area-health"><div class="bar-track"><div class="bar-fill ' + hCls +
          '" style="width:' + a.health + '%"></div></div><span>' + a.health + "%</span></div>";
      return (
        '<button type="button" class="area-card' + (state.selectedArea === a.name ? " active" : "") +
          '" data-area="' + esc(a.name) + '">' +
          '<div class="area-card-head"><h3>' + esc(a.name) + "</h3>" + alertChip + "</div>" +
          '<div class="area-stats">' +
            "<div><b>" + a.sentinels.length + "</b><small>" + a.online + " online</small></div>" +
            "<div><b>" + a.corpus.length + "</b><small>entries</small></div>" +
          "</div>" +
          healthRow +
        "</button>"
      );
    }).join("");

    grid.querySelectorAll("[data-area]").forEach((btn) => {
      btn.addEventListener("click", () => selectArea(btn.dataset.area));
    });
    renderAreaDetail();
  }

  function renderAreaDetail() {
    const el = $("areaDetail");
    if (!el) return;
    const area = state.selectedArea ? groupAreas().find((a) => a.name === state.selectedArea) : null;
    if (!area) { el.hidden = true; el.innerHTML = ""; return; }
    el.hidden = false;

    const boxes = area.sentinels.length
      ? area.sentinels.map((s) => {
          const t = s.telemetry || {};
          const st = s.status || "offline";
          const tele = [
            t.temp_c != null ? t.temp_c + "°C" : null,
            t.humidity_pct != null ? t.humidity_pct + "% RH" : null,
            "Health " + sentinelHealth(s) + "%",
          ].filter(Boolean).join(" · ");
          return '<div class="area-box"><div class="ab-head"><b>' + esc(s.name) +
            '</b><span class="status-chip ' + esc(st) + '">' + esc(st) + "</span></div>" +
            '<span class="muted">' + esc(s.id) + " · " + esc(s.location || "") + "</span>" +
            '<div class="ab-tele">' + esc(tele) + "</div></div>";
        }).join("")
      : '<p class="muted">No sentinels deployed in this area yet.</p>';

    const entries = area.corpus.length
      ? area.corpus.map((e) =>
          '<button type="button" class="area-entry" data-entry="' + esc(e.id) + '">' +
            "<b>" + esc(e.elder_name || "Elder") + '</b> <span class="pill ' + consentClass(e.consent_level) +
            '">' + esc(consentLabel(e.consent_level)) + "</span>" +
            '<span class="muted">' + esc(e.tribe || "") + " · " + esc(typeLabel(e.knowledge_type)) + "</span>" +
            '<span class="ae-txt">' + esc((e.transcript || "").slice(0, 90)) + "</span>" +
          "</button>"
        ).join("")
      : '<p class="muted">No corpus entries from this area yet.</p>';

    el.innerHTML =
      '<div class="area-detail-head"><h2>' + esc(area.name) + "</h2>" +
        '<button type="button" class="btn" id="areaClose">✕ Close</button></div>' +
      '<div class="area-detail-grid">' +
        '<div class="panel"><div class="panel-head"><h3>Sentinels (' + area.sentinels.length +
          ')</h3></div><div class="area-box-list">' + boxes + "</div></div>" +
        '<div class="panel"><div class="panel-head"><h3>Corpus (' + area.corpus.length +
          ')</h3></div><div class="area-entry-list">' + entries + "</div></div>" +
      "</div>";

    const close = $("areaClose");
    if (close) close.addEventListener("click", () => selectArea(state.selectedArea));
    el.querySelectorAll("[data-entry]").forEach((b) =>
      b.addEventListener("click", () => openEntry(b.dataset.entry))
    );
  }

  function renderStats() {
    const c = state.corpus;
    const typeC = c.filter((e) => ["C", "TYPE_C_PREDICTION"].includes(e.knowledge_type)).length;
    const pending = c.filter((e) => !e.validation_status || e.validation_status === "PENDING").length;
    const online = state.sentinels.filter((s) => s.status === "online").length;

    $("statCorpus").textContent = c.length;
    const metaEl = $("statCorpusMeta");
    if (metaEl) metaEl.textContent = c.length ? "synced from field" : "waiting for Saakshi";
    $("statSentinels").textContent = online;
    $("statSentinelsMeta").textContent = "of " + state.sentinels.length + " deployed";
    $("statTypeC").textContent = typeC;
    $("statPending").textContent = pending;
  }

  function renderOverview() {
    renderOverviewFleet();
    renderOverviewAreas();
  }

  function renderOverviewFleet() {
    const el = $("overviewFleet");
    if (!el) return;
    if (!state.sentinels.length) {
      el.innerHTML = '<p class="empty muted">No sentinels registered — add one from the Sentinels tab.</p>';
      return;
    }
    el.innerHTML = state.sentinels.slice(0, 8).map((s) => {
      const t = s.telemetry || {};
      const live = s.live_hardware && isLiveActive(s);
      const h = sentinelHealth(s);
      const tele = live
        ? (t.temp_c != null ? t.temp_c + "°C" : "—") + " · " + (t.current_sound || t.last_sound || "quiet")
        : (t.temp_c != null ? t.temp_c + "°C" : "—") + " · " + h + "% health";
      return (
        '<button type="button" class="ov-fleet-card' + (live ? " live" : "") + '" data-goto-sentinel="' + esc(s.id) + '">' +
          '<span class="ov-fleet-dot ' + esc(s.status || "offline") + '"></span>' +
          '<span class="ov-fleet-name">' + esc(s.name) + "</span>" +
          '<span class="ov-fleet-meta muted">' + esc(s.location || s.id) + "</span>" +
          '<span class="ov-fleet-tele mono">' + esc(tele) + "</span>" +
        "</button>"
      );
    }).join("");
    el.querySelectorAll("[data-goto-sentinel]").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.selectedSentinelId = btn.dataset.gotoSentinel;
        setView("sentinels");
      });
    });
  }

  function renderOverviewAreas() {
    const el = $("overviewAreas");
    if (!el) return;
    const areas = groupAreas().slice(0, 6);
    if (!areas.length) {
      el.innerHTML = '<p class="empty muted">No regional data yet.</p>';
      return;
    }
    el.innerHTML = areas.map((a) =>
      '<button type="button" class="ov-area-chip" data-area="' + esc(a.name) + '">' +
        '<strong>' + esc(a.name) + "</strong>" +
        '<span>' + a.sentinels.length + " sentinels · " + a.corpus.length + " entries</span>" +
        (a.alerts ? '<em class="ov-area-warn">' + a.alerts + " alert" + (a.alerts > 1 ? "s" : "") + "</em>" : "") +
      "</button>"
    ).join("");
    el.querySelectorAll("[data-area]").forEach((btn) => {
      btn.addEventListener("click", () => { setView("areas"); selectArea(btn.dataset.area); });
    });
  }

  function filteredCorpus() {
    const q = state.search.trim().toLowerCase();
    if (!q) return state.corpus;
    return state.corpus.filter((e) => {
      const hay = [
        e.elder_name, e.tribe, e.village, e.transcript, e.id, e.geohash,
      ].join(" ").toLowerCase();
      return hay.includes(q);
    });
  }

  function renderCorpusTable() {
    const rows = filteredCorpus();
    $("corpusFilterMeta").textContent = rows.length + " of " + state.corpus.length + " entries";

    if (!rows.length) {
      $("corpusBody").innerHTML =
        '<tr><td colspan="8" class="empty">No entries yet — save from the Saakshi app TEACH screen.</td></tr>';
      return;
    }

    $("corpusBody").innerHTML = rows.map((e) => {
      const cc = consentClass(e.consent_level);
      const val = e.validation_status || "PENDING";
      const rec = e.sentinel_recommendation?.status;
      const valCls = val === "VALIDATED" ? "ok" : val === "BROKEN" ? "warn" : "";
      const recHint = rec && rec !== val ? " <span class='mono muted'>· " + esc(rec) + "</span>" : "";
      const tribe = e.tribe || "—";
      return (
        "<tr>" +
          "<td><b>" + esc(e.elder_name || "—") + "</b></td>" +
          "<td><span class='tribe-tag'>" + esc(tribe) + "</span></td>" +
          "<td><span class='type-tag'>" + esc(typeLabel(e.knowledge_type)) + "</span></td>" +
          "<td class='truncate'>" + esc(e.village || e.location_name || "—") + "<br><span class='mono muted'>" + esc(e.geohash || "") + "</span></td>" +
          "<td><span class='consent-tag " + cc + "'>" + esc(consentLabel(e.consent_level)) + "</span></td>" +
          "<td><span class='val-tag " + valCls + "'>" + esc(val) + "</span>" + recHint + "</td>" +
          "<td class='mono muted'>" + esc(fmtTime(e.received_at || e.created_at)) + "</td>" +
          "<td><div class='row-actions'>" +
            "<button type='button' data-view='" + esc(e.id) + "'>Manage</button>" +
            "<button type='button' class='del' data-del='" + esc(e.id) + "'>Delete</button>" +
          "</div></td>" +
        "</tr>"
      );
    }).join("");

    $("corpusBody").querySelectorAll("[data-view]").forEach((btn) => {
      btn.addEventListener("click", () => openEntry(btn.dataset.view));
    });
    $("corpusBody").querySelectorAll("[data-del]").forEach((btn) => {
      btn.addEventListener("click", () => deleteEntry(btn.dataset.del));
    });
  }

  function typeCEntries() {
    return state.corpus.filter((e) => {
      const k = typeKey(e.knowledge_type);
      return k === "C" || String(e.knowledge_type || "").toUpperCase().includes("TYPE_C");
    });
  }

  function linkedCorpusEntry(s) {
    if (!s || !s.linked_corpus_id) return null;
    return state.corpus.find((e) => e.id === s.linked_corpus_id) || null;
  }

  function validationBadge(entry) {
    if (!entry) return { cls: "pending", label: "Unlinked" };
    const val = entry.validation_status || "PENDING";
    const rec = entry.sentinel_recommendation && entry.sentinel_recommendation.status;
    const label = rec && rec !== val ? rec : val;
    const cls = label === "VALIDATED" ? "ok" : label === "BROKEN" ? "warn" : label === "WEAKENING" ? "warn" : "pending";
    return { cls, label, rec };
  }

  function populateLinkedCorpusSelect(selectedId) {
    const sel = $("sentinelLinkedCorpus");
    if (!sel) return;
    const typeC = typeCEntries();
    const opts = ['<option value="">— Select from Knowledge store —</option>']
      .concat(typeC.map((e) =>
        '<option value="' + esc(e.id) + '"' + (e.id === selectedId ? " selected" : "") + ">" +
          esc(e.elder_name || "Elder") + " · " + esc((e.transcript || "").slice(0, 55)) + (e.transcript && e.transcript.length > 55 ? "…" : "") +
        "</option>"
      ));
    if (!typeC.length) {
      opts.push('<option value="" disabled>No Type C entries — sync from Saakshi TEACH</option>');
    }
    sel.innerHTML = opts.join("");
  }

  function renderSentinelValidation() {
    const grid = $("validationGrid");
    if (!grid) return;
    if (!state.sentinels.length) {
      grid.innerHTML = '<p class="empty">Register a sentinel box, then link it to an elder prediction from Knowledge.</p>';
      return;
    }
    grid.innerHTML = state.sentinels.map((s) => {
      const entry = linkedCorpusEntry(s);
      const badge = validationBadge(entry);
      const t = s.telemetry || {};
      const live = s.live_hardware && isLiveActive(s);
      const signals = live
        ? [
            t.temp_c != null ? t.temp_c + "°C" : null,
            t.last_sound || t.current_sound ? String(t.last_sound || t.current_sound).replace(/_/g, " ") : null,
            t.gas != null ? "gas " + t.gas : null,
          ].filter(Boolean).join(" · ")
        : [
            t.rain_mm_24h != null ? t.rain_mm_24h + " mm rain" : null,
            t.bioacoustic_events_24h != null ? t.bioacoustic_events_24h + " bio events" : null,
            t.temp_c != null ? t.temp_c + "°C" : null,
          ].filter(Boolean).join(" · ");

      if (!entry) {
        return (
          '<article class="val-card unlinked">' +
            '<div class="val-head"><h3>' + esc(s.name) + '</h3><span class="val-badge pending">No claim linked</span></div>' +
            '<p class="muted">' + esc(s.id) + " · " + esc(s.location || "") + "</p>" +
            '<p class="val-empty">Assign a Type C elder prediction so this box can validate field conditions against what the elder said.</p>' +
            '<div class="val-actions">' +
              '<button type="button" class="btn sm" data-manage-sentinel="' + esc(s.id) + '">Link prediction</button>' +
              '<button type="button" class="btn sm" data-goto-corpus>Open Knowledge</button>' +
            "</div></article>"
        );
      }

      const rec = entry.sentinel_recommendation;
      const recHtml = rec
        ? '<p class="val-rec"><strong>Kaalam assessment:</strong> ' + esc(rec.status || "—") +
          (rec.finding ? '<br><span class="muted">' + esc(String(rec.finding).slice(0, 200)) + (String(rec.finding).length > 200 ? "…" : "") + "</span>" : "") +
          "</p>"
        : "";

      return (
        '<article class="val-card">' +
          '<div class="val-head">' +
            '<h3>' + esc(s.name) + '</h3>' +
            '<span class="val-badge ' + badge.cls + '">' + esc(badge.label) + "</span>" +
          "</div>" +
          '<p class="val-elder"><b>' + esc(entry.elder_name || s.linked_elder || "Elder") + '</b>' +
            (entry.tribe ? ' · <span class="tribe-tag">' + esc(entry.tribe) + "</span>" : "") +
          "</p>" +
          '<blockquote class="val-quote">“' + esc((entry.transcript || "").slice(0, 220)) + (entry.transcript && entry.transcript.length > 220 ? "…" : "") + "”</blockquote>" +
          '<div class="val-meta">' +
            '<span class="type-tag">Type C</span> ' +
            '<span class="val-tag">' + esc(s.linked_prediction || entry.species_mentioned || "Field validation") + "</span>" +
          "</div>" +
          recHtml +
          '<p class="val-signals"><strong>Sentinel signals:</strong> ' + esc(signals || "—") +
            (live ? ' <span class="live-dot">● live</span>' : "") + "</p>" +
          '<div class="val-actions">' +
            '<button type="button" class="btn sm" data-view-entry="' + esc(entry.id) + '">Manage claim</button>' +
            '<button type="button" class="btn sm" data-manage-sentinel="' + esc(s.id) + '">Edit link</button>' +
            '<button type="button" class="btn sm" data-serial-sentinel="' + esc(s.id) + '">Serial</button>' +
          "</div></article>"
      );
    }).join("");

    grid.querySelectorAll("[data-manage-sentinel]").forEach((btn) => {
      btn.addEventListener("click", () => openSentinel(btn.dataset.manageSentinel));
    });
    grid.querySelectorAll("[data-view-entry]").forEach((btn) => {
      btn.addEventListener("click", () => openEntry(btn.dataset.viewEntry));
    });
    grid.querySelectorAll("[data-serial-sentinel]").forEach((btn) => {
      btn.addEventListener("click", () => openSerialForSentinel(btn.dataset.serialSentinel));
    });
    grid.querySelectorAll("[data-goto-corpus]").forEach((btn) => {
      btn.addEventListener("click", () => setView("corpus"));
    });
  }

  function renderSentinels() {
    const grid = $("sentinelGrid");
    if (!state.sentinels.length) {
      grid.innerHTML = '<p class="empty">No sentinels configured in hub store.</p>';
      return;
    }

    grid.innerHTML = state.sentinels.map((s) => {
      const t = s.telemetry || {};
      const inc = s.incharge || {};
      const health = sentinelHealth(s);
      const hCls = healthClass(health);
      const entry = linkedCorpusEntry(s);
      const badge = validationBadge(entry);
      const cardCls = health < 40 ? "critical" : badge.rec === "BROKEN" || badge.label === "BROKEN" ? "alert" : "";
      const st = s.status || "offline";
      const maint = s.maintenance_status || "operational";

      return (
        '<article class="sentinel-card ' + cardCls + '">' +
          '<div class="sc-head">' +
            '<div><h3>' + esc(s.name) + '<span class="maint-chip ' + esc(maint) + '">' + esc(maint.replace("_", " ")) + '</span></h3>' +
            '<span class="sc-id">' + esc(s.id) + " · " + esc(s.location) + '</span></div>' +
            '<span class="status-chip ' + esc(st) + '">' + esc(st) + '</span>' +
          '</div>' +
          '<div class="sc-incharge">' +
            '<b>In-charge: ' + esc(inc.name || "—") + '</b>' +
            esc(inc.role || "") + (inc.organisation ? " · " + esc(inc.organisation) : "") +
            (inc.phone ? '<br><span class="mono">' + esc(inc.phone) + '</span>' : "") +
          '</div>' +
          '<div class="health-bar ' + hCls + '"><span style="width:' + health + '%"></span></div>' +
          (entry
            ? '<div class="sc-validation">' +
                '<span class="sc-val-label">Validating</span>' +
                '<p class="sc-val-quote">“' + esc((entry.transcript || "").slice(0, 90)) + (entry.transcript && entry.transcript.length > 90 ? "…" : "") + '”</p>' +
                '<span class="val-badge ' + badge.cls + '">' + esc(badge.label) + "</span>" +
              "</div>"
            : '<p class="muted sc-unlinked">No elder claim linked — assign from Knowledge</p>') +
          '<div class="telemetry-grid">' +
            (s.live_hardware
              ? '<div><b>' + (t.temp_c != null ? t.temp_c + "°C" : "—") + '</b><small>Live temp</small></div>' +
                '<div><b>' + (t.humidity_pct != null ? t.humidity_pct + "%" : "—") + '</b><small>Live humidity</small></div>' +
                '<div><b>' + (t.gas != null ? "gas " + t.gas : "—") + '</b><small>MQ sensor</small></div>' +
                '<div><b>' + (t.last_sound ? esc(String(t.last_sound).replace(/_/g, " ")) : "background") + '</b><small>Last sound</small></div>' +
                '<div><b class="' + (t.lora_ok ? "status-ok" : "status-bad") + '">' + (t.lora_ok ? "OK" : "—") + '</b><small>LoRa</small></div>' +
                '<div><b class="' + (t.sd_ok ? "status-ok" : "status-bad") + '">' + (t.sd_ok ? "OK" : "—") + '</b><small>SD card</small></div>'
              : '<div><b>' + (t.temp_c != null ? t.temp_c + "°C" : "—") + '</b><small>Box temp</small></div>' +
                '<div><b>' + (t.humidity_pct != null ? t.humidity_pct + "%" : "—") + '</b><small>Humidity</small></div>' +
                '<div><b>' + (t.rain_mm_24h != null ? t.rain_mm_24h + " mm" : "—") + '</b><small>Rain 24h</small></div>' +
                '<div><b>' + (t.bioacoustic_events_24h != null ? t.bioacoustic_events_24h : "—") + '</b><small>Bio events</small></div>' +
                '<div><b class="' + battClass(t.battery_pct) + '">' + (t.battery_pct != null ? t.battery_pct + "%" : "—") + '</b><small>Battery</small></div>' +
                '<div><b>' + esc(badge.label) + '</b><small>Kaalam</small></div>') +
          '</div>' +
          (s.lat != null && s.lng != null
            ? '<p class="muted mono" style="font-size:11px;margin:8px 0 0">' + esc(fmtCoords(s.lat, s.lng)) +
              (s.location_stamped_at ? " · stamped " + esc(fmtTime(s.location_stamped_at)) : "") + "</p>"
            : '<p class="muted" style="font-size:11px;margin:8px 0 0">Location not stamped — use mobile DEPLOY</p>') +
          '<div class="sc-actions">' +
            '<button type="button" data-manage-sentinel="' + esc(s.id) + '">Manage</button>' +
            '<button type="button" data-serial-sentinel="' + esc(s.id) + '">Serial</button>' +
            (entry
              ? '<button type="button" data-view-entry="' + esc(entry.id) + '">Claim</button>'
              : '<button type="button" data-link-sentinel="' + esc(s.id) + '">Link elder</button>') +
          '</div>' +
        '</article>'
      );
    }).join("");

    grid.querySelectorAll("[data-manage-sentinel]").forEach((btn) => {
      btn.addEventListener("click", () => openSentinel(btn.dataset.manageSentinel));
    });
    grid.querySelectorAll("[data-serial-sentinel]").forEach((btn) => {
      btn.addEventListener("click", () => openSerialForSentinel(btn.dataset.serialSentinel));
    });
    grid.querySelectorAll("[data-view-entry]").forEach((btn) => {
      btn.addEventListener("click", () => openEntry(btn.dataset.viewEntry));
    });
    grid.querySelectorAll("[data-link-sentinel]").forEach((btn) => {
      btn.addEventListener("click", () => openSentinel(btn.dataset.linkSentinel));
    });
    renderSentinelValidation();
  }

  function renderSentinelMini() {
    const el = $("sentinelMini");
    if (!state.sentinels.length) {
      el.innerHTML = '<p class="muted">No sentinels</p>';
      return;
    }
    el.innerHTML = state.sentinels.map((s) => {
      const t = s.telemetry || {};
      const h = sentinelHealth(s);
      const live = s.live_hardware && isLiveActive(s);
      const detail = live && t.temp_c != null
        ? t.temp_c + "°C · " + (t.humidity_pct != null ? t.humidity_pct + "%" : "—")
        : h + "% · " + (t.battery_pct != null ? t.battery_pct + "%" : "—");
      return (
        '<div class="mini-row' + (live ? " mini-live" : "") + '">' +
          '<span><b>' + esc(s.name) + '</b> <span class="muted">· ' + esc(live ? "live" : s.status) + '</span></span>' +
          '<span class="mini-batt">' + esc(detail) + '</span>' +
        '</div>'
      );
    }).join("");
  }

  function renderRecent() {
    const recent = [...state.corpus]
      .sort((a, b) => new Date(b.received_at || b.created_at || 0) - new Date(a.received_at || a.created_at || 0))
      .slice(0, 5);
    const el = $("recentCorpus");
    if (!recent.length) {
      el.innerHTML = '<p class="empty">No syncs yet</p>';
      return;
    }
    el.innerHTML = recent.map((e) =>
      '<div class="recent-item" data-id="' + esc(e.id) + '">' +
        '<span><b>' + esc(e.elder_name || "Unknown") + '</b> · ' + esc((e.transcript || "").slice(0, 60)) + (e.transcript && e.transcript.length > 60 ? "…" : "") + '</span>' +
        '<span class="mono muted">' + esc(fmtTime(e.received_at || e.created_at)) + '</span>' +
      '</div>'
    ).join("");
    el.querySelectorAll("[data-id]").forEach((row) => {
      row.addEventListener("click", () => openEntry(row.dataset.id));
    });
  }

  function renderOverviewTypes() {
    const el = $("overviewTypes");
    if (!el) return;
    const counts = countByType();
    const types = (CFG && CFG.knowledgeTypes) || {};
    el.innerHTML = ["A", "B", "C"].map((k) => {
      const t = types[k] || { label: "Type " + k, title: "" };
      return (
        '<div class="overview-type-chip" style="border-left-color:' + (t.color || "var(--green)") + '">' +
          '<b>' + counts[k] + '</b>' +
          '<span>' + esc(t.label) + " · " + esc(t.title) + '</span>' +
        '</div>'
      );
    }).join("");
  }

  function openSerialForSentinel(id) {
    state.serialSentinelId = id;
    setView("serial");
  }

  function corpusAudioUrl(e) {
    if (!e) return null;
    if (e.audio_url) {
      return e.audio_url.startsWith("http") ? e.audio_url : ArivuHub.baseUrl() + e.audio_url;
    }
    if (e.has_audio && e.id) {
      return ArivuHub.baseUrl() + "/api/corpus/" + encodeURIComponent(e.id) + "/audio";
    }
    return null;
  }

  function openEntry(id) {
    const e = state.corpus.find((x) => x.id === id);
    if (!e) return;
    state.selectedId = id;
    const c = coords(e);
    const audioSrc = corpusAudioUrl(e);
    $("entryReadonly").innerHTML =
      '<p><b>' + esc(e.elder_name || "Unknown") + '</b> · ' + esc(typeLabel(e.knowledge_type)) + ' · ' + esc(e.tribe || "") + ' · ' + esc(e.village || "") + '</p>' +
      '<p class="muted">' + esc(e.transcript) + '</p>' +
      (e.language || e.dialect ? '<p><span class="muted">Language / dialect:</span> ' + esc(e.language || e.dialect) + '</p>' : '') +
      (e.corpus_partition === "tribal-language" ? '<p><span class="dataset-tag">Tribal language dataset</span></p>' : '') +
      (audioSrc
        ? '<div class="entry-audio"><p class="muted">Elder speech</p><audio controls preload="metadata" src="' + esc(audioSrc) + '"></audio>' +
          (e.audio_duration_seconds ? '<span class="mono muted">' + esc(e.audio_duration_seconds) + 's</span>' : '') +
          '</div>'
        : e.has_audio
          ? '<p class="muted">Audio flagged on device — re-save from TEACH to upload speech.</p>'
          : '') +
      (e.species_mentioned ? '<p><span class="muted">Species:</span> ' + esc(e.species_mentioned) + '</p>' : '') +
      (e.season ? '<p><span class="muted">Season:</span> ' + esc(e.season) + '</p>' : '') +
      (e.prediction ? '<p class="mono muted">Trigger: ' + esc(e.prediction.trigger_event) + ' → ' + esc(e.prediction.outcome_event) + ' (' + esc(e.prediction.time_window_days && e.prediction.time_window_days.join("–")) + ' d)</p>' : '') +
      (e.sentinel_recommendation
        ? '<div class="rec-block"><p class="rec-label">Sentinel recommends <b>' + esc(e.sentinel_recommendation.status) + '</b>' +
          (e.sentinel_recommendation.sentinel_name ? ' · ' + esc(e.sentinel_recommendation.sentinel_name) : '') + '</p>' +
          '<p class="muted small">' + esc(e.sentinel_recommendation.finding) + '</p></div>'
        : '') +
      (e.manual_assessment
        ? '<div class="rec-block manual"><p class="rec-label">Manual KAALAM: <b>' + esc(e.manual_assessment.status) + '</b></p>' +
          '<p class="muted small">' + esc(e.manual_assessment.finding) + '</p></div>'
        : '') +
      (e.validation_confirmed_by
        ? '<p class="muted">Human confirmed: <b>' + esc(e.validation_status) + '</b> by ' + esc(e.validation_confirmed_by) + '</p>'
        : '<p class="muted warn-text">Awaiting human confirmation of validation status</p>') +
      (c ? '<p class="mono muted">' + c[0].toFixed(5) + ", " + c[1].toFixed(5) + " · " + esc(e.geohash || "") + '</p>' : "");
    $("entryValidation").value = e.validation_status || "PENDING";
    $("entryAssigned").value = e.assigned_to || "";
    $("entryConsent").value = e.consent_level || "OPEN";
    $("entryNotes").value = e.review_notes || "";
    $("entryModal").showModal();
  }

  async function saveEntry() {
    const id = state.selectedId;
    if (!id) return;
    try {
      await ArivuHub.updateCorpusEntry(id, {
        validation_status: $("entryValidation").value,
        assigned_to: $("entryAssigned").value.trim(),
        consent_level: $("entryConsent").value,
        review_notes: $("entryNotes").value.trim(),
        validation_confirmed_by: $("entryAssigned").value.trim() || "Command Board reviewer",
        validation_confirmed_at: new Date().toISOString(),
      });
      log("Updated entry " + id);
      $("entryModal").close();
      await refresh();
    } catch (err) {
      alert("Save failed: " + (err.message || err));
    }
  }

  function openSentinel(id) {
    const s = id ? state.sentinels.find((x) => x.id === id) : null;
    const form = $("sentinelForm");
    const inc = (s && s.incharge) || {};
    $("sentinelModalTitle").textContent = s ? "Manage sentinel" : "Register new box";
    form.name.value = s ? s.name : "";
    form.location.value = s ? s.location : "Wayanad";
    form.status.value = s ? s.status : "offline";
    form.maintenance_status.value = s ? (s.maintenance_status || "operational") : "operational";
    form.incharge_name.value = inc.name || "";
    form.incharge_role.value = inc.role || "BMC Field Officer";
    form.incharge_phone.value = inc.phone || "";
    form.incharge_organisation.value = inc.organisation || "";
    form.linked_elder.value = s ? (s.linked_elder || "") : "";
    form.linked_prediction.value = s ? (s.linked_prediction || "") : "";
    populateLinkedCorpusSelect(s ? s.linked_corpus_id : "");
    form.installed_date.value = s ? (s.installed_date || "") : new Date().toISOString().slice(0, 10);
    form.notes.value = s ? (s.notes || "") : "";
    $("sentinelId").value = s ? s.id : "";
    state.selectedSentinelId = s ? s.id : null;
    $("sentinelModal").showModal();
  }

  async function saveSentinel() {
    const form = $("sentinelForm");
    const id = $("sentinelId").value;
    const linkedCorpusId = ($("sentinelLinkedCorpus") && $("sentinelLinkedCorpus").value) || "";
    const linkedEntry = linkedCorpusId ? state.corpus.find((e) => e.id === linkedCorpusId) : null;
    const payload = {
      name: form.name.value.trim(),
      location: form.location.value.trim(),
      status: form.status.value,
      maintenance_status: form.maintenance_status.value,
      incharge: {
        name: form.incharge_name.value.trim(),
        role: form.incharge_role.value.trim(),
        phone: form.incharge_phone.value.trim(),
        organisation: form.incharge_organisation.value.trim(),
      },
      linked_corpus_id: linkedCorpusId || null,
      linked_elder: form.linked_elder.value.trim() || (linkedEntry && linkedEntry.elder_name) || "",
      linked_prediction: form.linked_prediction.value.trim() || (linkedEntry && (linkedEntry.prediction || linkedEntry.species_mentioned)) || "",
      installed_date: form.installed_date.value,
      notes: form.notes.value.trim(),
    };
    if (!payload.name) return alert("Box name is required");
    try {
      if (id) {
        await ArivuHub.updateSentinel(id, payload);
        log("Updated sentinel " + id);
      } else {
        const region = (CFG && CFG.region && CFG.region.center) || [11.6854, 76.132];
        await ArivuHub.createSentinel({ ...payload, lat: region[0], lng: region[1] });
        log("Registered new sentinel: " + payload.name);
      }
      $("sentinelModal").close();
      await refresh();
    } catch (err) {
      alert("Save failed: " + (err.message || err));
    }
  }

  function renderDataset() {
    const tribes = countByTribe();
    const tribeNames = Object.keys(tribes);
    const districts = new Set(state.corpus.map((e) => e.district).filter(Boolean));
    const total = state.corpus.length || 1;

    const stats = $("datasetStats");
    if (stats) {
      stats.innerHTML =
        '<article class="stat-card"><span class="stat-label">Records</span><strong class="stat-value">' + state.corpus.length + '</strong><span class="stat-meta">live hub store</span></article>' +
        '<article class="stat-card"><span class="stat-label">Tribes</span><strong class="stat-value">' + tribeNames.length + '</strong><span class="stat-meta">' + esc(tribeNames.join(", ") || "—") + '</span></article>' +
        '<article class="stat-card"><span class="stat-label">Districts</span><strong class="stat-value">' + districts.size + '</strong><span class="stat-meta">geographic coverage</span></article>' +
        '<article class="stat-card"><span class="stat-label">With GPS</span><strong class="stat-value">' + state.corpus.filter((e) => coords(e)).length + '</strong><span class="stat-meta">mappable entries</span></article>';
    }

    const bars = $("tribeBars");
    if (bars) {
      const sorted = tribeNames.sort((a, b) => tribes[b] - tribes[a]);
      bars.innerHTML = sorted.length
        ? sorted.map((t) => {
            const pct = Math.round((tribes[t] / total) * 100);
            return (
              '<div class="bar-group">' +
                '<label><span>' + esc(t) + '</span><span>' + tribes[t] + '</span></label>' +
                '<div class="bar-track"><div class="bar-fill" style="width:' + pct + '%;background:var(--green)"></div></div>' +
              '</div>'
            );
          }).join("")
        : '<p class="muted">No tribe data yet — fill tribe in Saakshi TEACH</p>';
    }

    const body = $("datasetBody");
    if (!body) return;
    if (!state.corpus.length) {
      body.innerHTML = '<tr><td colspan="13" class="empty">No dataset rows yet</td></tr>';
      return;
    }
    body.innerHTML = state.corpus.map((e) => {
      const r = datasetRow(e);
      return (
        "<tr>" +
          "<td class='mono'>" + esc(String(r.id).slice(0, 12)) + "</td>" +
          "<td>" + esc(r.elder_name) + "</td>" +
          "<td><span class='tribe-tag'>" + esc(r.tribe || "—") + "</span></td>" +
          "<td>" + esc(r.village) + "</td>" +
          "<td>" + esc(r.district) + "</td>" +
          "<td>" + esc(r.knowledge_type) + "</td>" +
          "<td>" + esc(r.species) + "</td>" +
          "<td>" + esc(r.consent_level) + "</td>" +
          "<td>" + esc(r.validation_status) + "</td>" +
          "<td class='mono'>" + esc(r.geohash) + "</td>" +
          "<td class='mono'>" + esc(r.lat) + "</td>" +
          "<td class='mono'>" + esc(r.lng) + "</td>" +
          "<td class='mono muted'>" + esc(fmtTime(r.synced)) + "</td>" +
        "</tr>"
      );
    }).join("");
  }

  function exportCsv() {
    const rows = state.corpus.map(datasetRow);
    if (!rows.length) return alert("No data to export");
    const cols = Object.keys(rows[0]);
    const escCsv = (v) => '"' + String(v == null ? "" : v).replace(/"/g, '""') + '"';
    const lines = [cols.join(",")].concat(rows.map((r) => cols.map((c) => escCsv(r[c])).join(",")));
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "arivu-dataset-" + new Date().toISOString().slice(0, 10) + ".csv";
    a.click();
    log("Exported CSV · " + rows.length + " rows");
  }

  // ---- maps ----
  // Keep the map pinned to one copy of the world, focused on India / the
  // Western Ghats — no zooming out to a repeating whole-earth view.
  let tileLayers = [];

  function currentTheme() {
    return document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark";
  }

  function tileUrl() {
    return currentTheme() === "light"
      ? "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
      : "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png";
  }

  function swapMapTiles() {
    tileLayers.forEach((t) => t.setUrl(tileUrl()));
  }

  function initMap(elId) {
    const center = (CFG && CFG.region && CFG.region.center) || [11.6854, 76.132];
    // India bounding box (with a little margin) — pan/zoom is clamped to this.
    const indiaBounds = L.latLngBounds([6.0, 67.0], [37.5, 98.5]);
    const map = L.map(elId, {
      zoomControl: true,
      minZoom: 5,
      maxZoom: 18,
      maxBounds: indiaBounds,
      maxBoundsViscosity: 1.0,
      worldCopyJump: false,
    }).setView(center, 9);
    const layer = L.tileLayer(tileUrl(), {
      attribution: "© OpenStreetMap · © CARTO",
      maxZoom: 18,
      minZoom: 5,
      noWrap: true,
      bounds: indiaBounds,
    }).addTo(map);
    tileLayers.push(layer);
    return map;
  }

  function renderCorpusOnMap(map, markers, opts) {
    markers.forEach((m) => map.removeLayer(m));
    markers.length = 0;

    const colors = { open: "#1b6b47", community: "#e0a92e", embargoed: "#f07167" };

    state.corpus.forEach((e) => {
      const pt = coords(e);
      if (!pt) return;
      const cc = consentClass(e.consent_level);
      const marker = L.circleMarker(pt, {
        radius: 8,
        color: "#fff",
        weight: 2,
        fillColor: colors[cc] || colors.open,
        fillOpacity: 0.9,
      }).addTo(map);
      marker.bindPopup(
        "<b>" + esc(e.elder_name || "Entry") + "</b><br>" +
        esc(typeLabel(e.knowledge_type)) + "<br>" +
        "<small>" + esc((e.transcript || "").slice(0, 80)) + "</small>"
      );
      marker.on("click", () => openEntry(e.id));
      markers.push(marker);
    });

    if (opts && opts.fit === false) return;

    const pts = state.corpus.map(coords).filter(Boolean);
    if (pts.length > 1) {
      map.fitBounds(pts, { padding: [30, 30], maxZoom: 11 });
    } else if (pts.length === 1) {
      map.setView(pts[0], 10);
    }
  }

  function mapDataBounds() {
    const pts = [
      ...state.corpus.map(coords).filter(Boolean),
      ...state.sentinels.filter((s) => s.lat != null && s.lng != null).map((s) => [s.lat, s.lng]),
    ];
    return pts;
  }

  function fitMapToData(map) {
    const pts = mapDataBounds();
    const center = (CFG && CFG.region && CFG.region.center) || [11.6854, 76.132];
    if (pts.length > 1) {
      map.fitBounds(pts, { padding: [40, 40], maxZoom: 12 });
    } else if (pts.length === 1) {
      map.setView(pts[0], 11);
    } else {
      map.setView(center, 9);
    }
  }

  function renderFullMap() {
    if (!$("mapFull")) return;
    if (!mapFull) mapFull = initMap("mapFull");
    renderCorpusOnMap(mapFull, fullCorpusMarkers, { fit: false });
    if (window.ArivuSentinels) ArivuSentinels.render(mapFull, state.sentinels);
    fitMapToData(mapFull);
    setTimeout(() => { mapFull.invalidateSize(); }, 100);
  }

  function renderMaps() {
    if ($("mapOverview")) {
      if (!mapOverview) mapOverview = initMap("mapOverview");
      renderCorpusOnMap(mapOverview, overviewCorpusMarkers, { fit: false });
      if (window.ArivuSentinels) ArivuSentinels.render(mapOverview, state.sentinels);
      fitMapToData(mapOverview);
      setTimeout(() => { mapOverview.invalidateSize(); }, 100);
    }
    if (state.currentView === "map") renderFullMap();
  }

  // ---- live hardware sentinel (ESP32 → gateway → hub) ----

  function isLiveActive(s) {
    if (!s || !s.last_live_at) return false;
    return Date.now() - new Date(s.last_live_at).getTime() < 120_000;
  }

  function liveSentinelFromState() {
    return state.sentinels.find((s) => s.id === getLiveSentinelId()) || null;
  }

  function setOpsPill(id, online, label, detail) {
    const el = $(id);
    if (!el) return;
    el.className = "ov-sys" + (online ? " online" : online === false ? " offline" : "");
    const val = el.querySelector(".ov-sys-val, .ops-pill-val");
    if (val) val.textContent = detail || label || "—";
  }

  async function updateSystemStatus() {
    if (!window.ArivuHub) return;
    try {
      const st = await ArivuHub.fetchSystemStatus();
      setOpsPill("opsHub", true, "Hub", "Online · :" + (st.hub && st.hub.port ? st.hub.port : "8787"));
      const gw = st.gateway || {};
      state.gatewaySentinelId = gw.sentinel_id || getLiveSentinelId();
      setOpsPill("opsGateway", !!gw.online, "Gateway", gw.online ? "Forwarding" : "Not connected");
      setOpsPill("opsSerial", !!gw.online, "USB serial", gw.serial_port || (gw.online ? "Active" : "No data"));
      const live = st.live_sentinel || {};
      setOpsPill("opsLive", !!live.online, "Live box", live.online ? (live.name || live.id) : "Offline");

      const setDd = (id, txt) => { const el = $(id); if (el) el.textContent = txt; };
      setDd("setStatHub", "Online · " + ArivuHub.baseUrl());
      setDd("setStatGateway", gw.online ? "Connected · forwarding" : "Offline — run make or make gateway");
      setDd("setStatPort", gw.serial_port || "—");
      setDd("setStatSentinel", (live.name || live.id || "—") + (live.online ? " · LIVE" : " · offline"));
      setDd("setStatSerial", gw.last_line_at ? fmtTime(gw.last_line_at) : "—");
    } catch {
      setOpsPill("opsHub", false, "Hub", "Offline");
      setOpsPill("opsGateway", false, "Gateway", "—");
      setOpsPill("opsSerial", false, "USB serial", "—");
      setOpsPill("opsLive", false, "Live box", "—");
    }
  }

  function serialLineClass(line) {
    if (/^>>>/.test(line)) return "serial-alert";
    if (/^\[(REC|LISTEN|STOP)/.test(line)) return "serial-status";
    if (/^\[AI\]/.test(line) || /^#/.test(line)) return "serial-meta";
    return "";
  }

  function serialLineVisible(line) {
    const listenOn = !$("serialFilterListen") || $("serialFilterListen").checked;
    const alertOn = !$("serialFilterAlert") || $("serialFilterAlert").checked;
    if (/^>>>/.test(line)) return alertOn;
    if (/^\[(REC|LISTEN|STOP)/.test(line)) return listenOn;
    return true;
  }

  async function refreshAll() {
    await refresh();
    await updateLiveSentinel();
    await updateAlerts();
    await updateSystemStatus();
    if (state.currentView === "serial") {
      renderSerialSentinelTabs();
      await updateSerialMonitor();
    }
    if (state.currentView === "map") renderFullMap();
    if (state.currentView === "sentinels") renderSentinelValidation();
  }

  function renderSerialSentinelTabs() {
    const wrap = $("serialSentinelTabs");
    if (!wrap) return;
    const list = state.sentinels.length ? state.sentinels : [{ id: getLiveSentinelId(), name: "Kaavu Sentinel 01", live_hardware: true }];
    if (!state.serialSentinelId) state.serialSentinelId = list.find((s) => s.live_hardware)?.id || list[0].id;

    wrap.innerHTML = list.map((s) => {
      const live = s.live_hardware && isLiveActive(s);
      const active = s.id === state.serialSentinelId;
      return (
        '<button type="button" class="serial-sentinel-btn' + (active ? " active" : "") + '" data-serial-id="' + esc(s.id) + '">' +
          '<span class="serial-sentinel-name">' + esc(s.name) + "</span>" +
          '<span class="serial-sentinel-id mono muted">' + esc(s.id) + "</span>" +
          '<span class="serial-sentinel-status ' + (live ? "live" : "idle") + '">' + (live ? "● Live" : s.live_hardware ? "Hardware" : "Simulated") + "</span>" +
        "</button>"
      );
    }).join("");

    wrap.querySelectorAll("[data-serial-id]").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.serialSentinelId = btn.dataset.serialId;
        renderSerialSentinelTabs();
        updateSerialMonitor();
      });
    });

    const sel = list.find((s) => s.id === state.serialSentinelId);
    if ($("serialPanelTitle")) $("serialPanelTitle").textContent = (sel && sel.name) || "Serial monitor";
    if ($("serialPanelMeta")) {
      const gw = state.gatewaySentinelId;
      const isActive = sel && sel.live_hardware && gw === sel.id;
      $("serialPanelMeta").textContent = isActive
        ? "Receiving USB serial for this box · close Arduino Serial Monitor first"
        : sel && sel.live_hardware
          ? "No USB stream for this ID — set gateway ARIVU_SENTINEL_ID=" + sel.id
          : "Simulated sentinel — no physical serial stream";
    }
  }

  function serialLinesForSelected(allLines) {
    const sid = state.serialSentinelId || getLiveSentinelId();
    const gw = state.gatewaySentinelId;
    if (!sid) return [];
    return (allLines || []).filter((e) => {
      if (e.sentinel_id) return e.sentinel_id === sid;
      return sid === (gw || getLiveSentinelId());
    });
  }
  function renderSerialMonitor() {
    const el = $("serialMonitor");
    if (!el) return;
    const sid = state.serialSentinelId || getLiveSentinelId();
    const sel = state.sentinels.find((s) => s.id === sid);
    const lines = state.serialLines.filter((e) => serialLineVisible(e.line));
    if (!lines.length) {
      const msg = sel && !sel.live_hardware
        ? "Simulated sentinel — no USB serial stream for " + sid
        : "No serial lines yet — plug in ESP32, run make, and select the live box";
      el.innerHTML = '<span class="serial-empty">' + esc(msg) + "</span>";
      return;
    }
    el.innerHTML = lines.slice().reverse().map((e) => {
      const t = e.ts ? new Date(e.ts).toLocaleTimeString("en-IN", { hour12: false }) : "";
      return '<div class="serial-line ' + serialLineClass(e.line) + '">' +
        '<span class="serial-ts">' + esc(t) + "</span>" +
        '<span class="serial-txt">' + esc(e.line) + "</span></div>";
    }).join("");
    if (!state.serialPaused) el.scrollTop = el.scrollHeight;
  }

  async function updateSerialMonitor() {
    if (!window.ArivuHub || state.serialPaused) return;
    if (state.currentView !== "serial" && state.currentView !== "settings") return;
    try {
      const sid = state.serialSentinelId || getLiveSentinelId();
      const data = await ArivuHub.fetchSerialLog(200, sid);
      state.serialLines = serialLinesForSelected(data.lines || []);
      state.gatewaySentinelId = (data.gateway && data.gateway.sentinel_id) || getLiveSentinelId();
      renderSerialMonitor();
      if (state.currentView === "serial") renderSerialSentinelTabs();
      const gw = data.gateway || {};
      if (gw.last_line_at && $("setStatSerial")) $("setStatSerial").textContent = fmtTime(gw.last_line_at);
    } catch { /* hub offline */ }
  }

  function applySettingsForm() {
    const s = loadSettings();
    const hub = $("setHubUrl"); if (hub) hub.value = s.hubUrl || DEFAULT_SETTINGS.hubUrl;
    const sid = $("setLiveSentinelId"); if (sid) sid.value = s.liveSentinelId || DEFAULT_SETTINGS.liveSentinelId;
    const poll = $("setPollSec"); if (poll) poll.value = s.pollIntervalSec || DEFAULT_SETTINGS.pollIntervalSec;
    const spoll = $("setSerialPollMs"); if (spoll) spoll.value = s.serialPollMs || DEFAULT_SETTINGS.serialPollMs;
    const theme = $("setTheme"); if (theme) theme.value = currentTheme();
    const lang = $("setLang");
    if (lang && window.ArivuI18n) {
      lang.innerHTML = ArivuI18n.LANGS.map((l) => '<option value="' + l.code + '">' + l.label + "</option>").join("");
      lang.value = ArivuI18n.getLang();
    }
  }

  function saveSettingsFromForm() {
    const patch = {
      hubUrl: ($("setHubUrl") && $("setHubUrl").value.trim()) || DEFAULT_SETTINGS.hubUrl,
      liveSentinelId: ($("setLiveSentinelId") && $("setLiveSentinelId").value.trim()) || DEFAULT_SETTINGS.liveSentinelId,
      pollIntervalSec: Number($("setPollSec") && $("setPollSec").value) || DEFAULT_SETTINGS.pollIntervalSec,
      serialPollMs: Number($("setSerialPollMs") && $("setSerialPollMs").value) || DEFAULT_SETTINGS.serialPollMs,
    };
    if (window.ArivuHub) ArivuHub.saveSettings(patch);
    log("Settings saved");
    restartPollers();
    updateSystemStatus();
    updateLiveSentinel();
  }

  function resetSettings() {
    if (window.ArivuHub) ArivuHub.saveSettings({});
    applySettingsForm();
    log("Settings reset to defaults");
    restartPollers();
  }

  function restartPollers() {
    if (pollTimer) clearInterval(pollTimer);
    if (serialTimer) clearInterval(serialTimer);
    if (systemTimer) clearInterval(systemTimer);
    const s = loadSettings();
    pollTimer = setInterval(refreshAll, (s.pollIntervalSec || 15) * 1000);
    serialTimer = setInterval(updateSerialMonitor, s.serialPollMs || 1000);
    systemTimer = setInterval(updateSystemStatus, 3000);
  }

  function fmtCoords(lat, lng) {
    if (lat == null || lng == null) return "—";
    return Number(lat).toFixed(4) + "°N, " + Number(lng).toFixed(4) + "°E";
  }

  function fmtDeploymentLocation(s) {
    if (!s || s.lat == null || s.lng == null) {
      return { html: '<span class="status-warn">Not stamped yet</span><br><span class="muted" style="font-size:12px">BMC worker: open mobile app → DEPLOY → Stamp location</span>', stamped: false };
    }
    const coords = fmtCoords(s.lat, s.lng);
    const who = s.location_stamped_by ? esc(s.location_stamped_by) : "Field worker";
    const when = s.location_stamped_at ? esc(fmtTime(s.location_stamped_at)) : "";
    const place = s.location ? esc(s.location) : "";
    return {
      html: coords + (place ? "<br><span class=\"muted\" style=\"font-size:12px\">" + place + "</span>" : "") +
        "<br><span class=\"muted\" style=\"font-size:12px\">Stamped by " + who + (when ? " · " + when : "") + "</span>",
      stamped: true,
    };
  }

  function mergeLiveSentinel(sentinel, reading) {
    if (!sentinel) return null;
    const merged = { ...sentinel, telemetry: { ...(sentinel.telemetry || {}) } };
    if (!reading) return merged;
    const t = merged.telemetry;
    if (reading.temperature != null) t.temp_c = reading.temperature;
    if (reading.humidity != null) t.humidity_pct = reading.humidity;
    if (reading.gas != null) t.gas = reading.gas;
    if (reading.smoke != null) t.smoke = reading.smoke;
    if (reading.vibration_rate != null) t.vibration_rate = reading.vibration_rate;
    if (reading.sd_ok != null) t.sd_ok = reading.sd_ok;
    if (reading.lora_ok != null) t.lora_ok = reading.lora_ok;
    if (reading.recording != null) t.recording = reading.recording;
    if (reading.link != null) t.link = reading.link;
    if (reading.sound_label != null) {
      t.current_sound = reading.sound_label;
      t.current_sound_conf = reading.sound_conf;
    }
    if (reading.sound_alert) {
      t.last_sound = reading.sound_alert;
      t.last_sound_conf = reading.sound_conf;
      t.last_sound_at = reading.received_at;
    }
    if (reading.received_at) merged.last_live_at = reading.received_at;
    merged.status = isLiveActive(merged) ? "online" : merged.status;
    return merged;
  }

  function patchLiveSentinelInState(sentinel) {
    if (!sentinel) return;
    const i = state.sentinels.findIndex((s) => s.id === sentinel.id);
    if (i >= 0) state.sentinels[i] = sentinel;
    else state.sentinels.unshift(sentinel);
  }

  async function updateLiveSentinel() {
    if (!window.ArivuHub) return;
    try {
      const res = await fetch(ArivuHub.baseUrl() + "/api/sentinel/live?id=" + encodeURIComponent(getLiveSentinelId()), { cache: "no-store" });
      if (!res.ok) return;
      const payload = await res.json();
      const reading = payload.reading;
      if (!reading) return;

      const merged = mergeLiveSentinel(payload.sentinel || liveSentinelFromState(), reading);
      if (merged) patchLiveSentinelInState(merged);

      const set = (id, v) => { const el = $(id); if (el) el.textContent = v; };
      const setHtml = (id, v) => { const el = $(id); if (el) el.innerHTML = v; };
      const ic = (n) => (window.ArivuIcons ? ArivuIcons.svg(n) : "");
      const t = merged.telemetry || {};

      if ($("liveSentinelTitle")) {
        $("liveSentinelTitle").textContent = merged.name + " — " + merged.location;
      }
      if ($("liveSentinelMeta")) {
        const active = isLiveActive(merged);
        $("liveSentinelMeta").textContent = active
          ? "● Live · " + (reading.link || "usb").toUpperCase() + " · " + getLiveSentinelId()
          : "Offline — check ESP32 USB + gateway (Settings → System status)";
      }
      const badge = $("liveBadge");
      if (badge) {
        const active = isLiveActive(merged);
        badge.textContent = active ? "LIVE" : "OFFLINE";
        badge.className = "live-badge " + (active ? "on" : "off");
      }

      setHtml("s1-location", fmtDeploymentLocation(merged).html);

      if (reading.temperature != null) set("s1-temp", reading.temperature + "°C");
      if (reading.humidity != null) set("s1-humid", reading.humidity + "%");

      if (reading.smoke) setHtml("s1-smoke", '<span class="reading-alert">' + ic("flame") + " FIRE</span>");
      else if (reading.gas != null) set("s1-smoke", "gas " + reading.gas);
      else set("s1-smoke", "Clear");

      if (reading.vibration_rate != null) {
        const v = Number(reading.vibration_rate);
        setHtml("s1-vib", v > 0
          ? '<span class="reading-alert">' + ic("activity") + " " + v + "/s</span>"
          : "0/s");
      } else set("s1-vib", "0/s");

      const sound = reading.sound_label || reading.sound_alert || t.current_sound || t.last_sound;
      const soundConf = reading.sound_conf != null ? reading.sound_conf : (t.current_sound_conf != null ? t.current_sound_conf : t.last_sound_conf);
      if (sound && sound !== "--") {
        const pretty = String(sound).replace(/_/g, " ");
        const pct = soundConf != null && Number(soundConf) > 0 ? " " + Math.round(Number(soundConf) * 100) + "%" : "";
        setHtml("s1-sound", '<span class="' + (sound === "background" ? "" : "reading-alert") + '">' + ic("activity") + " " + pretty + pct + "</span>");
      } else {
        set("s1-sound", "background");
      }

      const lora = reading.lora_ok != null ? reading.lora_ok : t.lora_ok;
      const sd = reading.sd_ok != null ? reading.sd_ok : t.sd_ok;
      const link = reading.link || t.link || "usb";
      setHtml("s1-link",
        '<span class="' + (lora ? "status-ok" : "status-bad") + '">LoRa ' + (lora ? "OK" : "down") + "</span> · " +
        '<span class="' + (sd ? "status-ok" : "status-bad") + '">SD ' + (sd ? "OK" : "—") + "</span> · " +
        esc(String(link).toUpperCase()));

      const mode = reading.recording ? "Recording" : (isLiveActive(merged) ? "Listening" : "Standby");
      set("s1-mode", mode);

      if (reading.received_at) {
        set("s1-updated", fmtTime(reading.received_at));
        if ($("lastSync")) $("lastSync").textContent = "Live · " + fmtTime(reading.received_at);
      }

      renderSentinelMini();
      if (state.currentView === "overview") renderOverviewFleet();
      if (state.currentView === "sentinels") renderSentinels();
      if (state.currentView === "map") renderFullMap();
    } catch { /* hub/gateway offline */ }
  }

  async function updateAlerts() {
    if (!window.ArivuHub) return;
    try {
      const res = await fetch(ArivuHub.baseUrl() + "/api/alerts");
      if (!res.ok) return;
      const alerts = await res.json();
      const list = $("alert-list");
      if (!list) return;
      if (!Array.isArray(alerts) || !alerts.length) {
        list.innerHTML = '<p class="empty">No alerts yet</p>';
        if ($("alertMeta")) $("alertMeta").textContent = "none";
        if ($("statAlerts")) $("statAlerts").textContent = "0";
        return;
      }
      if ($("alertMeta")) $("alertMeta").textContent = alerts.length + " in feed";
      if ($("statAlerts")) $("statAlerts").textContent = String(alerts.length);
      list.innerHTML = alerts.map((a) => {
        const iconName = a.type === "smoke" || a.type === "fire" ? "flame"
          : a.type === "tamper" ? "alert"
          : a.type === "sound" ? "activity"
          : "thermometer";
        const icon = window.ArivuIcons ? ArivuIcons.svg(iconName) : "";
        const t = a.timestamp ? new Date(a.timestamp).toLocaleTimeString("en-IN", { hour12: false }) : "";
        return '<div class="alert-item ' + esc(a.type || "") + '">' +
          '<span class="alert-icon">' + icon + "</span>" +
          '<span class="alert-time">' + esc(t) + "</span>" +
          '<span class="alert-msg">' + esc(a.message || "") + "</span>" +
        "</div>";
      }).join("");
    } catch { /* hub offline — keep last feed */ }
  }

  // ---- navigation ----
  function setView(name) {
    document.querySelectorAll(".nav-btn").forEach((b) => {
      b.classList.toggle("active", b.dataset.view === name);
    });
    document.querySelectorAll(".view").forEach((v) => {
      v.classList.toggle("active", v.id === "view-" + name);
    });
    state.currentView = name;
    const meta = VIEW_META[name] || VIEW_META.overview;
    const titleKeys = { overview: "nav.overview", corpus: "nav.knowledge", sentinels: "nav.sentinels", areas: "nav.areas", map: "nav.map" };
    const subKeys = { overview: "sub.overview", corpus: "sub.knowledge", sentinels: "sub.sentinels", areas: "sub.areas", map: "sub.map" };
    $("viewTitle").textContent = window.ArivuI18n && titleKeys[name] ? ArivuI18n.t(titleKeys[name]) : meta.title;
    $("viewSubtitle").textContent = window.ArivuI18n && subKeys[name] ? ArivuI18n.t(subKeys[name]) : meta.subtitle;
    $("searchWrap").hidden = name !== "corpus";
    if (name === "map") {
      renderFullMap();
    }
    if (name === "overview") {
      renderOverview();
      renderMaps();
    }
    if (name === "sentinels") renderSentinelValidation();
    if (name === "serial") { renderSerialSentinelTabs(); updateSerialMonitor(); }
    if (name === "settings") { applySettingsForm(); updateSystemStatus(); }
    if (window.ArivuAssistant) ArivuAssistant.setCurrentView(name);
  }

  window.ArivuCommand = {
    setView,
    getState: () => ({ ...state }),
    // Called by ArivuI18n after a language change — refresh JS-set strings.
    onLangChange: () => {
      setView(state.currentView || "overview");
    },
  };

  function applyTheme(theme) {
    const t = theme === "light" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", t);
    try { localStorage.setItem("arivu-theme", t); } catch (_) {}
    swapMapTiles();
  }

  function init() {
    let savedTheme = "dark";
    try { savedTheme = localStorage.getItem("arivu-theme") || "dark"; } catch (_) {}
    applyTheme(savedTheme);

    if (window.ArivuI18n) {
      ArivuI18n.apply();
      setView("overview");
    }

    if (window.ArivuIcons) {
      document.querySelectorAll(".nav-btn[data-icon]").forEach((btn) => {
        btn.insertAdjacentHTML("afterbegin", ArivuIcons.svg(btn.dataset.icon, "nav-ico"));
      });
      const btnIcon = (id, name) => {
        const el = $(id);
        if (el) el.insertAdjacentHTML("afterbegin", ArivuIcons.svg(name) + " ");
      };
      btnIcon("exportCsvBtn", "download");
      btnIcon("addSentinelBtn", "radio");
      const fab = $("assistFab");
      if (fab) fab.innerHTML = ArivuIcons.svg("leaf", "fab-ico");
    }

    document.querySelectorAll(".nav-btn").forEach((btn) => {
      btn.addEventListener("click", () => setView(btn.dataset.view));
    });

    $("corpusSearch").addEventListener("input", (e) => {
      state.search = e.target.value;
      renderCorpusTable();
    });

    $("closeModal").addEventListener("click", () => $("entryModal").close());
    $("closeModal2").addEventListener("click", () => $("entryModal").close());
    $("saveEntryBtn").addEventListener("click", saveEntry);
    $("deleteEntryBtn").addEventListener("click", () => state.selectedId && deleteEntry(state.selectedId));

    $("addSentinelBtn").addEventListener("click", () => openSentinel(null));
    $("closeSentinelModal").addEventListener("click", () => $("sentinelModal").close());
    $("closeSentinelModal2").addEventListener("click", () => $("sentinelModal").close());
    $("saveSentinelBtn").addEventListener("click", saveSentinel);

    $("exportCsvBtn").addEventListener("click", exportCsv);

    const opsSettings = $("opsOpenSettings");
    if (opsSettings) opsSettings.addEventListener("click", () => setView("settings"));
    const ovMap = $("ovOpenMap");
    if (ovMap) ovMap.addEventListener("click", () => setView("map"));
    const ovSerial = $("ovOpenSerial");
    if (ovSerial) ovSerial.addEventListener("click", () => openSerialForSentinel(getLiveSentinelId()));
    const mapOv = $("mapOverview");
    if (mapOv) mapOv.addEventListener("click", () => setView("map"));
    document.querySelectorAll("[data-goto]").forEach((btn) => {
      btn.addEventListener("click", () => setView(btn.dataset.goto));
    });

    const settingsForm = $("settingsForm");
    if (settingsForm) {
      settingsForm.addEventListener("submit", (e) => { e.preventDefault(); saveSettingsFromForm(); });
    }
    const settingsReset = $("settingsResetBtn");
    if (settingsReset) settingsReset.addEventListener("click", resetSettings);
    const setTheme = $("setTheme");
    if (setTheme) setTheme.addEventListener("change", () => applyTheme(setTheme.value));
    const setLang = $("setLang");
    if (setLang && window.ArivuI18n) {
      setLang.addEventListener("change", () => ArivuI18n.setLang(setLang.value));
    }

    const serialPause = $("serialPauseBtn");
    if (serialPause) {
      serialPause.addEventListener("click", () => {
        state.serialPaused = !state.serialPaused;
        serialPause.textContent = state.serialPaused ? "Resume" : "Pause";
      });
    }
    const serialClear = $("serialClearBtn");
    if (serialClear) {
      serialClear.addEventListener("click", async () => {
        state.serialLines = [];
        renderSerialMonitor();
        try { if (window.ArivuHub) await ArivuHub.clearSerialLog(); } catch (_) {}
      });
    }
    ["serialFilterListen", "serialFilterAlert"].forEach((id) => {
      const el = $(id);
      if (el) el.addEventListener("change", renderSerialMonitor);
    });

    applySettingsForm();
    refreshAll();
    setInterval(updateLiveSentinel, 2000);
    setInterval(updateAlerts, 3000);
    restartPollers();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
