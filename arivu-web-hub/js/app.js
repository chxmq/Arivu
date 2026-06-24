// Arivu demo — data-driven, connected. Corpus is the single source of truth.
(function () {
  const $ = (id) => document.getElementById(id);
  const S = window.ArivuState;
  const C = window.ArivuCorpus;
  const CFG = window.ArivuConfig;

  let chart = null;
  let map = null;
  let markers = [];
  const markerById = {};

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;

  function makeRecognizer() {
    if (!SR) return null;
    const rec = new SR();
    rec.lang = (CFG && CFG.speech.lang) || "en-IN";
    rec.interimResults = true;
    rec.continuous = false;
    return rec;
  }

  function speak(text) {
    if (!window.speechSynthesis) return;
    const u = new SpeechSynthesisUtterance(text);
    u.lang = (CFG && CFG.speech.lang) || "en-IN";
    u.rate = (CFG && CFG.speech.rate) || 0.95;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  }

  function typeMeta(t) {
    const labels = (CFG && CFG.typeLabels) || {};
    return labels[t] || { cls: "type-a", pill: "a", label: t || "UNKNOWN" };
  }

  function consentColor(label) {
    const colors = (CFG && CFG.consentColors) || {};
    return colors[label] || colors.OPEN || "#1B6B47";
  }

  // ---- examples from data.js (not hardcoded in app) ----
  function renderExamples() {
    const teachWrap = $("teachExamples");
    const askWrap = $("askExamples");
    if (!teachWrap || !askWrap || !window.ArivuData) return;

    teachWrap.innerHTML = "";
    ArivuData.EXAMPLES.teach.forEach((ex) => {
      const chip = document.createElement("button");
      chip.className = "chip chip-" + ex.tag.slice(-1).toLowerCase();
      chip.innerHTML = "<b>" + esc(ex.tag) + "</b> " + esc(ex.note);
      chip.title = ex.text;
      chip.addEventListener("click", () => {
        $("transcriptBox").value = ex.text;
        $("teachHint").textContent = "Loaded an example. Press “Structure it →”.";
        S.emit("teach:example", ex);
        S.logFlow("Loaded " + ex.tag + " example into TEACH");
      });
      teachWrap.appendChild(chip);
    });

    askWrap.innerHTML = "";
    ArivuData.EXAMPLES.ask.forEach((q) => {
      const chip = document.createElement("button");
      chip.className = "chip chip-ask";
      chip.textContent = q;
      chip.addEventListener("click", () => { $("askBox").value = q; doAsk(); });
      askWrap.appendChild(chip);
    });
  }

  // ---- TEACH ----
  let teachRec = null, teaching = false;
  function initTeach() {
    $("teachBtn").addEventListener("click", () => {
      if (!SR) {
        $("teachHint").textContent = "Speech recognition needs Chrome or Edge — type the transcript below instead.";
        return;
      }
      if (teaching) { teachRec && teachRec.stop(); return; }
      teachRec = makeRecognizer();
      teaching = true;
      const btn = $("teachBtn");
      btn.classList.add("recording");
      btn.textContent = "● Listening… (press to stop)";
      S.emit("teach:start");
      S.logFlow("TEACH — listening for elder speech");
      let finalText = "";
      teachRec.onresult = (e) => {
        let interim = "";
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const tr = e.results[i][0].transcript;
          if (e.results[i].isFinal) finalText += tr + " ";
          else interim += tr;
        }
        $("transcriptBox").value = (finalText + interim).trim();
      };
      teachRec.onerror = (e) => { $("teachHint").textContent = "Mic error: " + e.error + " — type instead."; };
      teachRec.onend = () => {
        teaching = false;
        btn.classList.remove("recording");
        btn.textContent = "● Press & speak (TEACH)";
      };
      teachRec.start();
    });

    $("structureBtn").addEventListener("click", () => {
      const transcript = $("transcriptBox").value.trim();
      if (!transcript) {
        $("teachHint").textContent = "Speak or type something first.";
        return;
      }
      const entry = C.add(transcript, tryGeolocationMeta());
      S.set({ lastEntry: entry, selectedEntryId: entry.id, activeLayer: "padhavi" });
      S.bumpStat("taught");
      S.bumpStat("structured");
      S.emit("teach:structured", entry);
      S.logFlow("PADHAVI structured → " + entry.knowledge_type.replace("TYPE_", "Type ").replace(/_/g, " "));
      selectEntry(entry);
      $("padhavi").scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }

  function tryGeolocationMeta() {
    // Optional: if geolocation available, caller could pass coords — kept async-free for demo
    return {};
  }

  // ---- ASK (retrieval from live corpus) ----
  let askRec = null, asking = false;
  function initAsk() {
    $("askBtn").addEventListener("click", () => {
      if (!SR) {
        $("askResult").innerHTML = '<p class="ask-none">Speech recognition unavailable — type your question and press Ask.</p>';
        return;
      }
      if (asking) { askRec && askRec.stop(); return; }
      askRec = makeRecognizer();
      asking = true;
      const btn = $("askBtn");
      btn.classList.add("recording");
      btn.textContent = "● Listening…";
      S.emit("ask:start");
      askRec.onresult = (e) => {
        const t = Array.from(e.results).map((r) => r[0].transcript).join(" ");
        $("askBox").value = t.trim();
      };
      askRec.onend = () => {
        asking = false;
        btn.classList.remove("recording");
        btn.textContent = "● Ask aloud";
        if ($("askBox").value.trim()) doAsk();
      };
      askRec.start();
    });
    $("askGo").addEventListener("click", doAsk);
    $("askBox").addEventListener("keydown", (e) => { if (e.key === "Enter") doAsk(); });
  }

  function doAsk() {
    const query = $("askBox").value.trim();
    if (!query) return;
    const corpus = C.getAll();
    const q = query.toLowerCase();
    const qWords = q.split(/\s+/).filter((w) => w.length > 2);
    let best = null, bestScore = 0;

    corpus.forEach((e) => {
      const hay = (e.transcript + " " + (e.folk_name || "") + " " + (e.species || "") + " " + (e.use_category || "")).toLowerCase();
      let score = 0;
      qWords.forEach((w) => { if (hay.includes(w)) score += 1; });
      if (e.folk_name && q.includes(e.folk_name.toLowerCase())) score += 2;
      if (score > bestScore) { bestScore = score; best = e; }
    });

    if (!best || bestScore === 0) {
      $("askResult").innerHTML = '<p class="ask-none">No elder has taught us about that yet. Arivu never invents an answer.</p>';
      S.logFlow("ASK — no match in corpus of " + corpus.length + " entries");
      return;
    }

    const attribution = (best.folk_name || "Entry") + " · elder " + best.elder_id + " · " + best.location_name;
    $("askResult").innerHTML =
      '<div class="ask-bubble">“' + esc(best.transcript) + '”' +
      '<span class="attr">▶ ' + esc(attribution) + '</span>' +
      '<div class="speaking">🔊 playing back in the elder\'s words…</div></div>';
    speak(best.transcript);
    S.bumpStat("asked");
    S.emit("ask:complete", best);
    S.set({ selectedEntryId: best.id, activeLayer: "saakshi" });
    S.logFlow("ASK retrieved elder " + best.elder_id);
    selectEntry(best);
  }

  // ---- PADHAVI render ----
  function jsonHighlight(obj) {
    const json = JSON.stringify(obj, null, 2);
    return json
      .replace(/("(\\u[\da-fA-F]{4}|\\[^u]|[^\\"])*")(\s*:)?/g, (m, p1, p2, p3) =>
        p3 ? '<span class="k">' + p1 + "</span>" + p3 : '<span class="s">' + p1 + "</span>")
      .replace(/\b(-?\d+\.?\d*)\b/g, '<span class="n">$1</span>');
  }

  function renderEntry(entry, highlight) {
    const tm = typeMeta(entry.knowledge_type);
    const canValidate = entry.knowledge_type === "TYPE_C_PREDICTION" && entry.validatable;
    const display = Object.assign({}, entry);
    ["lat", "lng", "validatable", "id"].forEach((k) => delete display[k]);

    let footer;
    if (canValidate) {
      const prior = C.getValidation(entry.id);
      footer = '<button class="validate-btn" id="validateBtn">' +
        (prior ? "Re-validate with Kaalam →" : "Validate with Kaalam →") + "</button>";
      if (prior) footer += '<p class="muted small">Last verdict: <b>' + esc(prior.status) + "</b></p>";
    } else if (entry.knowledge_type === "TYPE_C_PREDICTION") {
      footer = '<p class="muted small">Prediction captured, but trigger/outcome weren\'t both detected — needs interpreter review.</p>';
    } else {
      footer = '<p class="muted small">Not a prediction — Kaalam validation does not apply to this type.</p>';
    }

    $("padhaviOut").innerHTML =
      '<div class="entry-card ' + tm.cls + (highlight ? " highlight" : "") + '">' +
        '<div class="entry-top">' +
          '<span class="type-pill ' + tm.pill + '">' + esc(tm.label) + '</span>' +
          '<span class="consent-pill consent-' + esc(entry.consent_label) + '">' + esc(entry.consent_label) + '</span>' +
        '</div>' +
        '<div class="entry-json">' + jsonHighlight(display) + "</div>" + footer + "</div>";

    if (canValidate) $("validateBtn").addEventListener("click", () => runValidation(entry));
  }

  function selectEntry(entry) {
    if (!entry) return;
    S.set({ lastEntry: entry, selectedEntryId: entry.id });
    S.emit("entry:select", entry);
    renderEntry(entry, true);
    renderCorpusList();
    refreshMap();
    focusMapMarker(entry.id);

    const saved = C.getValidation(entry.id);
    if (saved) renderVerdict(saved);
    else if (entry.knowledge_type !== "TYPE_C_PREDICTION" || !entry.validatable) {
      $("kaalamVerdict").innerHTML = '<p class="placeholder">Not a validatable Type C prediction.</p>';
    } else {
      $("kaalamVerdict").innerHTML = '<p class="placeholder">Structure a <strong>Type C prediction</strong>, then press <em>Validate</em> on its card.</p>';
    }
  }

  // ---- KAALAM ----
  function renderVerdict(r) {
    const rows = (r.metrics || [])
      .map((m) => '<div class="stat-row"><span>' + esc(m[0]) + "</span><b>" + esc(m[1]) + "</b></div>")
      .join("");
    const concl = r.conclusion
      ? '<p class="verdict-text" style="margin-top:.6rem"><b>→ ' + esc(r.conclusion) + "</b></p>"
      : "";
    const statusCls = r.status.replace(/[^A-Za-z0-9]+/g, "_").replace(/^_|_$/g, "").toLowerCase();
    $("kaalamVerdict").innerHTML =
      '<div class="verdict-box verdict-' + statusCls + '">' +
        '<p class="verdict-status">' + esc(r.status) + "</p>" +
        (r.headline ? '<p class="verdict-text"><b>' + esc(r.headline) + "</b></p>" : "") +
        '<p class="verdict-text">' + esc(r.verdict) + "</p>" +
        rows + concl + "</div>";
    if ($("kaalamNote")) $("kaalamNote").textContent = r.source_note || "";
  }

  function runValidation(entry) {
    const r = Kaalam.validate(entry);
    C.saveValidation(entry.id, r);
    if (r.series) drawChart(r.series);
    else if (chart) { chart.destroy(); chart = null; }
    renderVerdict(r);
    S.set({ lastValidation: r, activeLayer: "kaalam" });
    S.bumpStat("validated");
    S.emit("validate:complete", { entry, result: r });
    S.logFlow("KAALAM verdict → " + r.status);
    renderEntry(entry, true);
    $("kaalam").scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function drawChart(series) {
    const ctx = $("kaalamChart");
    if (!ctx) return;
    if (chart) chart.destroy();
    const colors = (window.ArivuUI && window.ArivuUI.chartColors) || {};
    const primary = colors.primary || "#1B6B47";
    const secondary = colors.secondary || "#C2402B";
    const grid = colors.grid || "rgba(111,102,87,.15)";
    const text = colors.text || "#6F6657";

    const datasets = (series.datasets || []).map((ds, i) => ({
      label: ds.label,
      data: ds.data,
      borderColor: ds.color || (i === 0 ? primary : secondary),
      backgroundColor: (ds.color || (i === 0 ? primary : secondary)) + "33",
      tension: 0.2,
      pointRadius: 4,
      borderWidth: 2,
      pointBackgroundColor: ds.color || (i === 0 ? primary : secondary),
    }));

    chart = new Chart(ctx.getContext("2d"), {
      type: "line",
      data: { labels: series.years, datasets },
      options: {
        responsive: true,
        plugins: {
          legend: { labels: { font: { family: "Inter", size: 11 }, color: text, boxWidth: 12 } },
          title: {
            display: true,
            text: series.title || "Validation series",
            color: primary,
            font: { family: "Playfair Display", size: 13, weight: "bold" },
          },
        },
        scales: {
          x: { grid: { color: grid }, ticks: { color: text, font: { size: 9 }, maxRotation: 60 } },
          y: {
            grid: { color: grid },
            title: { display: true, text: series.yLabel || "Value", color: text, font: { size: 10 } },
            ticks: { color: text, font: { size: 9 } },
          },
        },
      },
    });
  }

  // ---- MAP (auto-fit to corpus bounds) ----
  function refreshMap() {
    const corpus = C.getAll();
    const mcfg = (CFG && CFG.map) || {};

    if (!map) {
      const center = (CFG && CFG.region.center) || [11.69, 76.13];
      map = L.map("map").setView(center, mcfg.defaultZoom || 9);
      L.tileLayer(mcfg.tileUrl || "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: mcfg.attribution || "© OpenStreetMap",
        maxZoom: mcfg.maxZoom || 18,
      }).addTo(map);
    }

    markers.forEach((m) => map.removeLayer(m));
    markers.length = 0;
    Object.keys(markerById).forEach((k) => delete markerById[k]);

    corpus.forEach((e) => {
      if (e.lat == null || e.lng == null) return;
      const tm = typeMeta(e.knowledge_type);
      const isSelected = S.get().selectedEntryId === e.id;
      const marker = L.circleMarker([e.lat, e.lng], {
        radius: isSelected ? 13 : 9,
        color: isSelected ? consentColor("COMMUNITY") : "#fff",
        weight: isSelected ? 3 : 2,
        fillColor: consentColor(e.consent_label),
        fillOpacity: 0.9,
      }).addTo(map);
      marker.bindPopup(
        "<b>" + esc(tm.label) + "</b><br>" + esc(e.folk_name || "") +
        (e.species ? " · <i>" + esc(e.species) + "</i>" : "") + "<br>" +
        "<small>“" + esc(e.transcript) + "”</small><br>" +
        "<small>Elder " + esc(e.elder_id) + " · " + esc(e.location_name) + " · <b>" + esc(e.consent_label) + "</b></small>"
      );
      marker.on("click", () => selectEntry(e));
      markers.push(marker);
      markerById[e.id] = marker;
    });

    const b = C.bounds();
    if (b && corpus.length > 1) {
      map.fitBounds(b, { padding: mcfg.padding || [40, 40], maxZoom: mcfg.focusZoom || 10 });
    } else if (corpus.length === 1 && corpus[0].lat != null) {
      map.setView([corpus[0].lat, corpus[0].lng], mcfg.focusZoom || 10);
    }
  }

  function focusMapMarker(id) {
    if (!map) return;
    const m = markerById[id];
    if (m) {
      map.setView(m.getLatLng(), (CFG && CFG.map && CFG.map.focusZoom) || 10, { animate: true });
      setTimeout(() => m.openPopup(), 350);
    }
  }

  // ---- CORPUS PANEL (reads live corpus) ----
  function renderCorpusList() {
    const list = $("corpusList");
    if (!list) return;
    list.innerHTML = "";
    const selected = S.get().selectedEntryId;
    C.getAll().forEach((e) => {
      const tm = typeMeta(e.knowledge_type);
      const item = document.createElement("div");
      item.className = "corpus-item" + (selected === e.id ? " active" : "");
      item.dataset.id = e.id;
      item.innerHTML =
        '<div class="ci-type ' + tm.pill + '">' + esc(tm.label) + "</div>" +
        '<div class="ci-text">' + esc(e.transcript) + "</div>";
      item.addEventListener("click", () => selectEntry(e));
      list.appendChild(item);
    });
  }

  function initFlowPanel() {
    S.on("flow", (entry) => {
      const log = $("flowLog");
      if (!log) return;
      const idle = log.querySelector(".flow-idle");
      if (idle) idle.remove();
      const li = document.createElement("li");
      li.innerHTML = '<span class="flow-time">' + esc(entry.time) + "</span>" + esc(entry.msg);
      log.insertBefore(li, log.firstChild);
      while (log.children.length > 10) log.removeChild(log.lastChild);
    });
    S.on("stats", (stats) => {
      ["statTaught", "statStructured", "statValidated", "statAsked"].forEach((id, i) => {
        const el = $(id);
        if (el) el.textContent = stats[["taught", "structured", "validated", "asked"][i]];
      });
    });
    S.on("change", (partial) => {
      if (partial.corpus) renderCorpusList();
    });
  }

  function initNav() {
    const sections = ["pipeline", "saakshi", "padhavi", "kaalam", "dashboard"];
    const links = document.querySelectorAll(".nav-links a[href^='#']");
    const gold = (CFG && CFG.consentColors && CFG.consentColors.COMMUNITY) || "#E0A92E";
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        if (en.isIntersecting) {
          links.forEach((a) => {
            a.style.color = a.getAttribute("href") === "#" + en.target.id ? gold : "";
          });
        }
      });
    }, { rootMargin: "-40% 0px -50% 0px" });
    sections.forEach((id) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });
  }

  function init() {
    if (!SR && $("micWarn")) $("micWarn").style.display = "block";
    if (!C || !S || !window.Padhavi || !window.Kaalam) {
      console.error("Arivu: missing required modules");
      return;
    }
    boot();
  }

  async function boot() {
    C.seedFromData();
    let hubMsg = "";

    if (window.ArivuHub) {
      const merge = await ArivuHub.mergeHubCorpus(C.getAll());
      if (merge.hubOnline) {
        C.replaceAll(merge.merged);
        hubMsg = " · hub online";
        if (merge.remoteCount) hubMsg += " (+" + merge.remoteCount + " from app)";
        if (merge.sentinels && window.ArivuSentinels) {
          window._arivuSentinels = merge.sentinels;
        }
        const hubEl = $("hubStatus");
        if (hubEl) {
          hubEl.textContent = "◈ Arivu Hub connected · " + (merge.sentinels?.length || 0) + " sentinels live";
          hubEl.className = "hub-status online small";
        }
      } else {
        hubMsg = " · hub offline (local data only)";
        const hubEl = $("hubStatus");
        if (hubEl) {
          hubEl.textContent = "Hub offline — run: node server/hub.mjs (local seed data only)";
          hubEl.className = "hub-status offline small";
        }
      }
    }

    renderExamples();
    initTeach();
    initAsk();
    initFlowPanel();
    initNav();
    refreshMap();

    if (window.ArivuSentinels && map) {
      const sentinels = window._arivuSentinels || [];
      ArivuSentinels.render(map, sentinels);
      const pollMs = (CFG && CFG.hub && CFG.hub.pollIntervalMs) || 15000;
      ArivuSentinels.startPolling(map, pollMs);
    }

    renderCorpusList();
    S.logFlow("Corpus ready · " + C.getAll().length + " entries" + hubMsg);
  }

  document.addEventListener("DOMContentLoaded", init);
})();
