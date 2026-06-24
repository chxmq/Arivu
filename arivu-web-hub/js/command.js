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
  let mapMode = "2d";
  let corpusMarkers = [];
  let pollTimer = null;

  const VIEW_META = {
    overview: { title: "Overview", subtitle: "Western Ghats field operations" },
    system: { title: "System", subtitle: "Three knowledge types · collection pipeline · live store" },
    dataset: { title: "Dataset", subtitle: "Structured TEK records by tribe · exportable" },
    corpus: { title: "Corpus", subtitle: "Knowledge store from Saakshi app" },
    sentinels: { title: "Sentinels", subtitle: "Kaavu box health, incharge, and telemetry" },
    feeds: { title: "Live feeds", subtitle: "Open-Meteo weather + GBIF species data" },
    map: { title: "Map", subtitle: "Corpus entries and sentinel positions" },
    activity: { title: "Activity", subtitle: "System events" },
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
      $("lastSync").textContent = "Run: node server/hub.mjs";
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
    renderSystem();
    renderDataset();
    if (document.querySelector("#view-feeds.active")) renderFeeds();
  }

  function renderNavBadges() {
    $("navCorpusCount").textContent = state.corpus.length;
    const online = state.sentinels.filter((s) => s.status === "online").length;
    $("navSentinelCount").textContent = online + "/" + state.sentinels.length;
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
      const recHint = rec && rec !== val ? " <span class='mono muted'>◈" + esc(rec) + "</span>" : "";
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
            '<div><b class="' + battClass(t.battery_pct) + '">' + (t.battery_pct != null ? t.battery_pct + "%" : "—") + (t.solar_charging ? " ☀" : "") + '</b><small>Battery</small></div>' +
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
        setView("feeds");
        loadFeedsForSentinel(btn.dataset.feedsSentinel);
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

  function renderSystem() {
    const types = (CFG && CFG.knowledgeTypes) || {};
    const pipeline = (CFG && CFG.pipeline) || [];
    const counts = countByType();
    const total = state.corpus.length || 1;

    if ($("problemText")) {
      $("problemText").textContent = (CFG && CFG.problemStatement) || "";
    }

    const flow = $("pipelineFlow");
    if (flow) {
      flow.innerHTML = pipeline.map((step, i) => {
        const arrow = i < pipeline.length - 1 ? '<span class="pipe-arrow">→</span>' : "";
        return (
          (i ? arrow : "") +
          '<div class="pipe-step">' +
            '<img src="' + esc(step.icon) + '" alt="" width="32" height="32" />' +
            '<h3>' + esc(step.label) + ' <span class="pipe-script">' + esc(step.script) + '</span></h3>' +
            '<span class="pipe-role">' + esc(step.role) + '</span>' +
            '<p>' + esc(step.desc) + '</p>' +
          '</div>'
        );
      }).join("");
    }

    const cards = $("typeCards");
    if (cards) {
      cards.innerHTML = ["A", "B", "C"].map((k) => {
        const t = types[k];
        if (!t) return "";
        return (
          '<article class="type-card" style="border-left-color:' + t.color + '">' +
            '<div class="type-count">' + counts[k] + '</div>' +
            '<div>' +
              '<h4>' + esc(t.label) + ' · ' + esc(t.title) + '</h4>' +
              '<p>' + esc(t.desc) + '</p>' +
              '<ul>' + (t.stored || []).map((s) => "<li>" + esc(s) + "</li>").join("") + '</ul>' +
            '</div>' +
          '</article>'
        );
      }).join("");
    }

    const collect = $("collectList");
    if (collect) {
      collect.innerHTML =
        "<li><b>TEACH</b> — facilitator records elder in local dialect (Expo Go app)</li>" +
        "<li><b>GPS</b> — grove location captured as lat/lng + geohash</li>" +
        "<li><b>Consent</b> — OPEN / COMMUNITY / EMBARGOED chosen per entry</li>" +
        "<li><b>Sync</b> — POST to Arivu Hub → appears here within 15s</li>" +
        "<li><b>Structure</b> — Padhavi sorts into Type A, B, or C automatically</li>" +
        "<li><b>Validate</b> — Type C sent to Kaalam + sentinel + GBIF/IMD feeds</li>";
    }

    const bars = $("datasetBars");
    if (bars) {
      bars.innerHTML = "<p class='muted' style='font-size:11px;margin:0 0 10px'>Entries by knowledge type</p>" +
        ["A", "B", "C"].map((k) => {
          const t = types[k] || { label: k, color: "var(--green)" };
          const pct = Math.round((counts[k] / total) * 100);
          return (
            '<div class="bar-group">' +
              '<label><span>' + esc(t.label) + " · " + esc(t.title || "") + '</span><span>' + counts[k] + '</span></label>' +
              '<div class="bar-track"><div class="bar-fill" style="width:' + pct + '%;background:' + t.color + '"></div></div>' +
            '</div>'
          );
        }).join("");
    }

    const consentEl = $("datasetConsent");
    if (consentEl) {
      const consent = { OPEN: 0, COMMUNITY_ONLY: 0, EMBARGOED: 0 };
      state.corpus.forEach((e) => {
        const c = e.consent_level || "OPEN";
        consent[c] = (consent[c] || 0) + 1;
      });
      const colors = { OPEN: "#1b6b47", COMMUNITY_ONLY: "#e0a92e", EMBARGOED: "#f07167" };
      consentEl.innerHTML = "<p class='muted' style='font-size:11px;margin:0 0 10px'>Consent distribution</p>" +
        Object.entries(consent).map(([k, n]) => {
          const pct = Math.round((n / total) * 100);
          const label = k === "COMMUNITY_ONLY" ? "COMMUNITY" : k;
          return (
            '<div class="bar-group">' +
              '<label><span>' + esc(label) + '</span><span>' + n + '</span></label>' +
              '<div class="bar-track"><div class="bar-fill" style="width:' + pct + '%;background:' + (colors[k] || "#666") + '"></div></div>' +
            '</div>'
          );
        }).join("");
    }

    if ($("datasetMeta")) {
      $("datasetMeta").textContent = state.corpus.length + " entries · updated " + ($("lastSync") && $("lastSync").textContent.replace("Synced ", "") || "—");
    }

    const live = $("datasetLive");
    if (live) {
      const groups = { A: [], B: [], C: [] };
      state.corpus.forEach((e) => {
        const k = typeKey(e.knowledge_type);
        if (k && groups[k].length < 3) groups[k].push(e);
      });
      let html = "";
      ["A", "B", "C"].forEach((k) => {
        const t = types[k];
        const entries = groups[k];
        html += '<div class="live-type-group">' +
          '<div class="live-type-head">' + esc(t ? t.label + " · " + t.title : "Type " + k) +
          ' <span>' + counts[k] + ' stored</span></div>';
        if (!entries.length) {
          html += '<p class="muted" style="font-size:12px">No ' + k + ' entries yet — teach from the app.</p>';
        } else {
          entries.forEach((e) => {
            html += '<div class="live-entry">' +
              '<b>' + esc(e.elder_name || "Unknown") + ' · ' + esc(e.village || "") + '</b>' +
              '<span class="muted">' + esc((e.transcript || "").slice(0, 100)) + (e.transcript && e.transcript.length > 100 ? "…" : "") + '</span>' +
            '</div>';
          });
        }
        html += '</div>';
      });
      live.innerHTML = html || '<p class="empty">Dataset empty — save from Saakshi TEACH</p>';
    }
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

  function setMapMode(mode) {
    mapMode = mode;
    const map2d = $("mapFull");
    const map3dWrap = $("map3dWrap");
    const map3dEl = $("map3d");
    document.querySelectorAll(".map-mode").forEach((b) => {
      b.classList.toggle("active", b.dataset.mode === mode);
    });
    if (mode === "3d") {
      map2d.hidden = true;
      if (map3dWrap) map3dWrap.hidden = false;
      if (!window.ArivuMap3D) {
        alert("3D map unavailable — Three.js failed to load. Check your connection and refresh.");
        return;
      }
      requestAnimationFrame(() => {
        ArivuMap3D.show(map3dEl);
      });
    } else {
      map2d.hidden = false;
      if (map3dWrap) map3dWrap.hidden = true;
      setTimeout(() => mapFull && mapFull.invalidateSize(), 100);
    }
  }

  // ---- maps ----
  function initMap(elId) {
    const mcfg = (CFG && CFG.map) || {};
    const center = (CFG && CFG.region && CFG.region.center) || [11.6854, 76.132];
    const map = L.map(elId, { zoomControl: true }).setView(center, mcfg.defaultZoom || 9);
    L.tileLayer(
      "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
      { attribution: "© OpenStreetMap · © CARTO", maxZoom: 18 }
    ).addTo(map);
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
    if (!mapOverview) mapOverview = initMap("mapOverview");
    if (!mapFull) mapFull = initMap("mapFull");

    renderCorpusOnMap(mapOverview, corpusMarkers);

    if (window.ArivuSentinels) {
      ArivuSentinels.render(mapOverview, state.sentinels);
      ArivuSentinels.render(mapFull, state.sentinels);
    }

    const fullMarkers = [];
    renderCorpusOnMap(mapFull, fullMarkers);

    setTimeout(() => { mapOverview.invalidateSize(); mapFull.invalidateSize(); }, 100);

    if (mapMode === "3d" && window.ArivuMap3D && $("map3d") && $("map3dWrap") && !$("map3dWrap").hidden) {
      ArivuMap3D.update(state.corpus, state.sentinels);
      ArivuMap3D.resize($("map3d"));
    }
  }

  // ---- navigation ----
  function setView(name) {
    document.querySelectorAll(".nav-btn").forEach((b) => {
      b.classList.toggle("active", b.dataset.view === name);
    });
    document.querySelectorAll(".view").forEach((v) => {
      v.classList.toggle("active", v.id === "view-" + name);
    });
    const meta = VIEW_META[name] || VIEW_META.overview;
    $("viewTitle").textContent = meta.title;
    $("viewSubtitle").textContent = meta.subtitle;
    $("searchWrap").hidden = name !== "corpus";
    if (name === "map") {
      setTimeout(() => {
        if (mapMode === "3d" && window.ArivuMap3D && $("map3d")) {
          ArivuMap3D.show($("map3d"));
        } else if (mapFull) mapFull.invalidateSize();
      }, 200);
    }
    if (name === "feeds") loadAllFeeds();
    if (window.ArivuAssistant) ArivuAssistant.setCurrentView(name);
  }

  window.ArivuCommand = {
    setView,
    getState: () => ({ ...state }),
  };

  function init() {
    document.querySelectorAll(".nav-btn").forEach((btn) => {
      btn.addEventListener("click", () => setView(btn.dataset.view));
    });

    $("refreshBtn").addEventListener("click", async () => {
      await refresh();
      if (document.querySelector("#view-feeds.active")) loadAllFeeds();
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

    document.querySelectorAll(".map-mode").forEach((btn) => {
      btn.addEventListener("click", () => setMapMode(btn.dataset.mode));
    });
    $("exportCsvBtn").addEventListener("click", exportCsv);

    log("Arivu Command initialized");
    refresh();

    const pollMs = (CFG && CFG.hub && CFG.hub.pollIntervalMs) || 15000;
    pollTimer = setInterval(refresh, pollMs);
  }

  document.addEventListener("DOMContentLoaded", init);
})();
