// Arivu Command — operations dashboard (hub as source of truth).
(function () {
  const $ = (id) => document.getElementById(id);
  const CFG = window.ArivuConfig;

  let state = {
    corpus: [],
    sentinels: [],
    feeds: [],
    hubOnline: false,
    selectedId: null,
    selectedSentinelId: null,
    search: "",
    activity: [],
  };

  let mapOverview = null;
  let mapFull = null;
  let corpusMarkers = [];
  let groveMarkers = [];
  let pollTimer = null;

  const VIEW_META = {
    overview: { title: "Overview", subtitle: "Western Ghats field operations" },
    corpus: { title: "Knowledge", subtitle: "Elder corpus from Saakshi · structured & exportable" },
    sentinels: { title: "Sentinels", subtitle: "Kaavu box health, telemetry & live feeds" },
    areas: { title: "Areas", subtitle: "Corpus & sentinels grouped by grove / region" },
    map: { title: "Map", subtitle: "Corpus entries and sentinel positions" },
  };

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function log(msg) {
    const time = new Date().toLocaleTimeString("en-IN", { hour12: false });
    state.activity.unshift({ time, msg });
    if (state.activity.length > 50) state.activity.pop();
    renderActivity();
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
    if (document.querySelector("#view-sentinels.active")) renderFeeds();
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
    $("statCorpusMeta").textContent = c.length ? "synced from field" : "waiting for Saakshi";
    $("statSentinels").textContent = online;
    $("statSentinelsMeta").textContent = "of " + state.sentinels.length + " deployed";
    $("statTypeC").textContent = typeC;
    $("statPending").textContent = pending;
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
      const cardCls = health < 40 ? "critical" : t.cuckoo_call_detected ? "alert" : "";
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
          '<p class="muted" style="font-size:11px;margin:0 0 10px">Health ' + health + '% · ' + esc(s.linked_prediction || "—") + '</p>' +
          '<div class="telemetry-grid">' +
            '<div><b>' + (t.temp_c != null ? t.temp_c + "°C" : "—") + '</b><small>Box temp</small></div>' +
            '<div><b>' + (t.humidity_pct != null ? t.humidity_pct + "%" : "—") + '</b><small>Humidity</small></div>' +
            '<div><b>' + (t.rain_mm_24h != null ? t.rain_mm_24h + " mm" : "—") + '</b><small>Rain 24h</small></div>' +
            '<div><b>' + (t.bioacoustic_events_24h != null ? t.bioacoustic_events_24h : "—") + '</b><small>Bio events</small></div>' +
            '<div><b class="' + battClass(t.battery_pct) + '">' + (t.battery_pct != null ? t.battery_pct + "%" : "—") + (t.solar_charging ? ' <span class="solar-ico">' + (window.ArivuIcons ? ArivuIcons.svg("sun") : "") + "</span>" : "") + '</b><small>Battery</small></div>' +
            '<div><b>' + (t.cuckoo_call_detected ? '<span style="color:var(--gold)">DETECTED</span>' : "—") + '</b><small>Cuckoo call</small></div>' +
          '</div>' +
          '<div class="sc-actions">' +
            '<button type="button" data-manage-sentinel="' + esc(s.id) + '">Manage box</button>' +
            '<button type="button" data-feeds-sentinel="' + esc(s.id) + '">Live feeds</button>' +
          '</div>' +
        '</article>'
      );
    }).join("");

    grid.querySelectorAll("[data-manage-sentinel]").forEach((btn) => {
      btn.addEventListener("click", () => openSentinel(btn.dataset.manageSentinel));
    });
    grid.querySelectorAll("[data-feeds-sentinel]").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.selectedSentinelId = btn.dataset.feedsSentinel;
        loadFeedsForSentinel(btn.dataset.feedsSentinel);
        const fg = $("feedsGrid");
        if (fg) fg.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    });
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
      return (
        '<div class="mini-row">' +
          '<span><b>' + esc(s.name) + '</b> <span class="muted">· ' + esc(s.status) + '</span></span>' +
          '<span class="mini-batt ' + battClass(t.battery_pct) + '">' + h + '% · ' + (t.battery_pct != null ? t.battery_pct + "%" : "—") + '</span>' +
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

  function renderActivity() {
    const el = $("activityLog");
    if (!state.activity.length) {
      el.innerHTML = "<li>Waiting for events…</li>";
      return;
    }
    el.innerHTML = state.activity.map((a) =>
      "<li><span>" + esc(a.time) + "</span>" + esc(a.msg) + "</li>"
    ).join("");
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
    form.installed_date.value = s ? (s.installed_date || "") : new Date().toISOString().slice(0, 10);
    form.notes.value = s ? (s.notes || "") : "";
    $("sentinelId").value = s ? s.id : "";
    state.selectedSentinelId = s ? s.id : null;
    $("sentinelModal").showModal();
  }

  async function saveSentinel() {
    const form = $("sentinelForm");
    const id = $("sentinelId").value;
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
      linked_elder: form.linked_elder.value.trim(),
      linked_prediction: form.linked_prediction.value.trim(),
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

  async function loadFeedsForSentinel(id) {
    const s = state.sentinels.find((x) => x.id === id);
    if (!s || !window.ArivuHub) return;
    $("feedsGrid").innerHTML = '<p class="empty">Fetching Open-Meteo + GBIF…</p>';
    try {
      const data = await ArivuHub.fetchFeeds(s.lat, s.lng, "Cuculus micropterus");
      state.feeds = [{ sentinel: s, ...data }];
      renderFeeds();
      log("Loaded feeds for " + s.name);
    } catch (e) {
      $("feedsGrid").innerHTML = '<p class="empty">Feed error: ' + esc(e.message || e) + '</p>';
    }
  }

  async function loadAllFeeds() {
    if (!state.sentinels.length || !window.ArivuHub) {
      $("feedsGrid").innerHTML = '<p class="empty">No sentinels to load feeds for</p>';
      return;
    }
    $("feedsGrid").innerHTML = '<p class="empty">Loading feeds for all boxes…</p>';
    try {
      const results = await Promise.all(
        state.sentinels.map(async (s) => {
          const data = await ArivuHub.fetchFeeds(s.lat, s.lng, "Cuculus micropterus");
          return { sentinel: s, ...data };
        })
      );
      state.feeds = results;
      renderFeeds();
    } catch (e) {
      $("feedsGrid").innerHTML = '<p class="empty">Feed error: ' + esc(e.message || e) + '</p>';
    }
  }

  function renderFeeds() {
    const grid = $("feedsGrid");
    if (!state.feeds.length) {
      grid.innerHTML = '<p class="empty">Select a sentinel or refresh to load live data</p>';
      return;
    }
    grid.innerHTML = state.feeds.map((f) => {
      const s = f.sentinel;
      const w = f.weather && f.weather.current;
      const gb = f.gbif || {};
      const daily = f.weather && f.weather.daily;
      const rain3d = daily && daily.precipitation_sum
        ? daily.precipitation_sum.reduce((a, b) => a + b, 0).toFixed(1)
        : "—";
      const src = (CFG && CFG.externalSources) || {};
      return (
        '<article class="feed-card">' +
          '<h3>' + esc(s.name) + '</h3>' +
          '<p class="feed-source">' + esc(s.location) + ' · ' + esc(s.lat) + ', ' + esc(s.lng) + '</p>' +
          '<p class="muted" style="font-size:12px;margin:0 0 12px">In-charge: <b>' + esc((s.incharge && s.incharge.name) || "—") + '</b></p>' +
          '<div class="feed-metrics">' +
            '<div><b>' + (w ? w.temperature_2m + "°C" : "—") + '</b><small>Open-Meteo · temp now</small></div>' +
            '<div><b>' + (w ? w.relative_humidity_2m + "%" : "—") + '</b><small>Open-Meteo · humidity</small></div>' +
            '<div><b>' + (w ? w.precipitation + " mm" : "—") + '</b><small>Open-Meteo · rain now</small></div>' +
            '<div><b>' + rain3d + ' mm</b><small>Open-Meteo · 3-day rain</small></div>' +
            '<div><b>' + (gb.count != null ? gb.count.toLocaleString() : "—") + '</b><small>GBIF · cuckoo records (30km)</small></div>' +
            '<div><b>' + esc((s.telemetry && s.telemetry.temp_c) != null ? s.telemetry.temp_c + "°C" : "—") + '</b><small>Sentinel · box reading</small></div>' +
          '</div>' +
          '<a class="feed-link" href="' + esc((src.weather && src.weather.url) || "https://open-meteo.com") + '" target="_blank" rel="noopener">Open-Meteo ↗</a> ' +
          '<a class="feed-link" href="' + esc((src.species && src.species.url) || "https://www.gbif.org") + '" target="_blank" rel="noopener">GBIF ↗</a>' +
        '</article>'
      );
    }).join("");
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

  function renderCorpusOnMap(map, markers) {
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

    const pts = state.corpus.map(coords).filter(Boolean);
    if (pts.length > 1) {
      map.fitBounds(pts, { padding: [30, 30], maxZoom: 11 });
    } else if (pts.length === 1) {
      map.setView(pts[0], 10);
    }
  }

  function renderMaps() {
    if (!mapOverview) { mapOverview = initMap("mapOverview"); addGroveMarker(mapOverview); }

    renderCorpusOnMap(mapOverview, corpusMarkers);
    if (window.ArivuSentinels) ArivuSentinels.render(mapOverview, state.sentinels);
    setTimeout(() => { mapOverview.invalidateSize(); }, 100);

    // Map view uses the bespoke illustrated Western Ghats map (no tiles).
    renderGhatsMap();
  }

  function renderGhatsMap() {
    if (!window.ArivuGhatsMap || !$("mapFull")) return;
    ArivuGhatsMap.render($("mapFull"), {
      corpus: state.corpus,
      sentinels: state.sentinels,
      onRegionClick: (name) => { setView("areas"); selectArea(name); },
    });
  }

  // ---- live grove sentinel (real LoRa data via /api/sentinel/data) ----
  const GROVE = { id: "grove_1", name: "Kaavu Sentinel 01", place: "Meppadi, Wayanad", lat: 11.6854, lng: 76.1320 };

  function grovePopupHtml(temp) {
    return "<b>" + GROVE.name + "</b><br>" + GROVE.place + "<br>" +
      'Status: <span style="color:#1b6b47">● Online</span><br>' +
      'Last reading: <span id="grove1-temp">' + (temp || "--") + "</span>°C";
  }

  function addGroveMarker(map) {
    if (!window.L) return;
    const m = L.marker([GROVE.lat, GROVE.lng]).addTo(map);
    m.bindPopup(grovePopupHtml("--"));
    groveMarkers.push(m);
  }

  async function updateLiveSentinel() {
    if (!window.ArivuHub) return;
    try {
      const res = await fetch(ArivuHub.baseUrl() + "/api/sentinel/data");
      if (!res.ok) return;
      const data = await res.json();
      if (!Array.isArray(data) || !data.length) return;
      const latest = data[0];
      const set = (id, v) => { const el = $(id); if (el) el.textContent = v; };
      const setHtml = (id, v) => { const el = $(id); if (el) el.innerHTML = v; };
      const ic = (n) => (window.ArivuIcons ? ArivuIcons.svg(n) : "");
      if (latest.temperature != null) set("s1-temp", latest.temperature + "°C");
      if (latest.humidity != null) set("s1-humid", latest.humidity + "%");
      // Gas / fire (MQ sensor). smoke=true once gas crosses the fire threshold.
      if (latest.smoke) setHtml("s1-smoke", '<span class="reading-alert">' + ic("flame") + " FIRE</span>");
      else if (latest.gas != null) set("s1-smoke", "gas " + latest.gas);
      else set("s1-smoke", "Clear");
      // Vibration edges/sec (SW-420 tamper sensor).
      if (latest.vibration_rate != null) {
        const v = Number(latest.vibration_rate);
        setHtml("s1-vib", v > 0
          ? '<span class="reading-alert">' + ic("activity") + " " + v + "/s</span>"
          : "0/s");
      } else if (latest.sound_alert) {
        set("s1-vib", String(latest.sound_alert));
      } else {
        set("s1-vib", "None");
      }
      set("grove1-temp", latest.temperature != null ? latest.temperature : "--");
      // AI sound classification
      if (latest.sound_alert) {
        const pretty = String(latest.sound_alert).replace(/_/g, " ");
        const pct = latest.sound_conf != null ? " " + Math.round(latest.sound_conf * 100) + "%" : "";
        setHtml("s1-sound", '<span class="reading-alert">' + ic("activity") + " " + pretty + pct + "</span>");
      } else {
        set("s1-sound", "background");
      }
      groveMarkers.forEach((m) => m.setPopupContent(grovePopupHtml(latest.temperature)));
    } catch { /* gateway not connected yet — leave placeholders */ }
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
        if ($("alertMeta")) $("alertMeta").textContent = "0 alerts";
        return;
      }
      if ($("alertMeta")) $("alertMeta").textContent = alerts.length + " alert" + (alerts.length === 1 ? "" : "s");
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
      renderGhatsMap();
    }
    if (name === "sentinels") loadAllFeeds();
    if (window.ArivuAssistant) ArivuAssistant.setCurrentView(name);
  }

  window.ArivuCommand = {
    setView,
    getState: () => ({ ...state }),
    // Called by ArivuI18n after a language change — refresh JS-set strings.
    onLangChange: () => {
      applyTheme(currentTheme());          // re-label the theme button
      setView(state.currentView || "overview"); // re-translate title/subtitle
    },
  };

  function applyTheme(theme) {
    const t = theme === "light" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", t);
    try { localStorage.setItem("arivu-theme", t); } catch (_) {}
    const btn = $("themeToggle");
    if (btn) {
      const ic = window.ArivuIcons ? ArivuIcons.svg(t === "light" ? "moon" : "sun") : "";
      const tr = window.ArivuI18n ? ArivuI18n.t(t === "light" ? "theme.dark" : "theme.light") : (t === "light" ? "Dark" : "Light");
      btn.innerHTML = ic + ' <span class="btn-label">' + tr + "</span>";
      btn.setAttribute("aria-label", t === "light" ? "Switch to dark mode" : "Switch to light mode");
    }
    swapMapTiles();
  }

  function init() {
    let savedTheme = "dark";
    try { savedTheme = localStorage.getItem("arivu-theme") || "dark"; } catch (_) {}
    applyTheme(savedTheme);
    const themeBtn = $("themeToggle");
    if (themeBtn) {
      themeBtn.addEventListener("click", () => {
        applyTheme(currentTheme() === "light" ? "dark" : "light");
      });
    }

    // Language selector + initial localisation
    if (window.ArivuI18n) {
      const sel = $("langSelect");
      if (sel) {
        sel.innerHTML = ArivuI18n.LANGS
          .map((l) => '<option value="' + l.code + '">' + l.label + "</option>")
          .join("");
        sel.value = ArivuI18n.getLang();
        sel.addEventListener("change", () => ArivuI18n.setLang(sel.value));
      }
      ArivuI18n.apply();
      setView("overview"); // localise the initial title/subtitle
    }

    // Inject line icons into nav items + top-bar buttons (no emoji).
    if (window.ArivuIcons) {
      document.querySelectorAll(".nav-btn[data-icon]").forEach((btn) => {
        btn.insertAdjacentHTML("afterbegin", ArivuIcons.svg(btn.dataset.icon, "nav-ico"));
      });
      const btnIcon = (id, name) => {
        const el = $(id);
        if (el) el.insertAdjacentHTML("afterbegin", ArivuIcons.svg(name) + " ");
      };
      btnIcon("refreshBtn", "refresh");
      btnIcon("exportCsvBtn", "download");
      btnIcon("activityToggle", "bell");
      btnIcon("addSentinelBtn", "radio");
      const fab = $("assistFab");
      if (fab) fab.innerHTML = ArivuIcons.svg("leaf", "fab-ico");
    }

    document.querySelectorAll(".nav-btn").forEach((btn) => {
      btn.addEventListener("click", () => setView(btn.dataset.view));
    });

    // Activity slide-over
    const openActivity = () => {
      renderActivity();
      $("activityDrawer").hidden = false;
      $("activityScrim").hidden = false;
      requestAnimationFrame(() => {
        $("activityDrawer").classList.add("open");
        $("activityScrim").classList.add("open");
      });
    };
    const closeActivity = () => {
      $("activityDrawer").classList.remove("open");
      $("activityScrim").classList.remove("open");
      setTimeout(() => { $("activityDrawer").hidden = true; $("activityScrim").hidden = true; }, 250);
    };
    $("activityToggle").addEventListener("click", openActivity);
    $("activityClose").addEventListener("click", closeActivity);
    $("activityScrim").addEventListener("click", closeActivity);

    $("refreshBtn").addEventListener("click", async () => {
      await refresh();
      if (document.querySelector("#view-sentinels.active")) loadAllFeeds();
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

    log("Arivu Command initialized");
    refresh();

    // Live grove sensor + alert feeds (real data from ESP32 LoRa gateway → hub).
    updateLiveSentinel();
    updateAlerts();
    setInterval(updateLiveSentinel, 5000);
    setInterval(updateAlerts, 3000);

    const pollMs = (CFG && CFG.hub && CFG.hub.pollIntervalMs) || 15000;
    pollTimer = setInterval(refresh, pollMs);
  }

  document.addEventListener("DOMContentLoaded", init);
})();
