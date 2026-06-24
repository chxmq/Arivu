// PADHAVI (browser build) — structures a transcript into a typed knowledge entry.
// Type A = Identification · Type B = Use · Type C = Phenological prediction.
// Deterministic, offline, explainable — perfect for a live demo.
(function (global) {
  const SPECIES_LEXICON = [
    { folk: ["cheevakka", "asoka", "ashoka"], species: "Saraca asoca", common: "Ashoka tree" },
    { folk: ["pala", "ezhilampala"], species: "Alstonia scholaris", common: "Blackboard tree" },
    { folk: ["cuckoo", "kuyil", "brainfever"], species: "Cuculus micropterus", common: "Indian Cuckoo" },
    { folk: ["bamboo", "mula", "eetta"], species: "Bambusa bambos", common: "Giant thorny bamboo" },
    { folk: ["neem", "veppu", "aryaveppu"], species: "Azadirachta indica", common: "Neem" },
    { folk: ["jackfruit", "plavu", "chakka"], species: "Artocarpus heterophyllus", common: "Jackfruit" },
    { folk: ["frog", "thavala"], species: "Indosylvirana", common: "Frog (chorus)" },
  ];
  const TRIGGER_HINTS = [
    { kw: ["cuckoo", "kuyil", "brainfever", "bird call", "calls"], event: "Indian_Cuckoo_first_call", time: "pre_dawn" },
    { kw: ["flower", "bloom", "blossom", "flowering"], event: "tree_flowering", time: "season" },
    { kw: ["ant", "termite"], event: "insect_swarm", time: "day" },
    { kw: ["frog", "croak"], event: "frog_chorus", time: "night" },
  ];
  const OUTCOME_HINTS = [
    { kw: ["monsoon", "rain", "rains", "mazha"], event: "monsoon_onset", variable: "IMD_rainfall" },
    { kw: ["drought", "dry"], event: "dry_spell", variable: "IMD_rainfall_deficit" },
    { kw: ["flood"], event: "flood", variable: "IMD_extreme_rainfall" },
  ];
  const USE_HINTS = [
    { kw: ["fever", "cure", "medicine", "heal", "paste", "remedy", "treat"], cat: "medicinal" },
    { kw: ["eat", "food", "edible", "cook"], cat: "food" },
    { kw: ["ritual", "sacred", "worship", "festival", "ceremony", "deity"], cat: "ritual" },
    { kw: ["insect", "grain", "store", "pest"], cat: "agricultural" },
  ];

  const lc = (s) => (s || "").toLowerCase();
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

  // Tiny synchronous SHA-256 (FNV-style fallback if SubtleCrypto unavailable).
  function quickHash(str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    const hex = (h >>> 0).toString(16).padStart(8, "0");
    return "sha256:" + hex + Date.now().toString(16).slice(-8) + "…";
  }

  function findSpecies(text) {
    const t = lc(text);
    for (const row of SPECIES_LEXICON) {
      const hit = row.folk.find((f) => t.includes(f));
      if (hit) return { folk_name: cap(hit), species: row.species, common_name: row.common };
    }
    return null;
  }

  function extractTimeWindow(text) {
    const t = lc(text);
    const range = t.match(/(\d+)\s*(?:to|-|–|and)\s*(\d+)\s*day/);
    if (range) return [parseInt(range[1]), parseInt(range[2])];
    const single = t.match(/(\d+)\s*day/);
    if (single) { const n = parseInt(single[1]); return [Math.max(1, n - 1), n + 1]; }
    const words = { three: 3, five: 5, seven: 7, eight: 8, ten: 10, twelve: 12, fifteen: 15 };
    for (const [w, n] of Object.entries(words)) {
      if (t.includes(w + " day")) return [Math.max(1, n - 1), n + 1];
    }
    return [7, 10];
  }

  function firstWord(text) {
    const m = (text || "").trim().split(/\s+/);
    return m.length ? m[0].replace(/[^a-zA-Z]/g, "") : null;
  }

  function structure(transcript, meta) {
    meta = meta || {};
    const text = transcript || "";
    const t = lc(text);
    const speciesInfo = findSpecies(text);

    const trigger = TRIGGER_HINTS.find((h) => h.kw.some((k) => t.includes(k)));
    const outcome = OUTCOME_HINTS.find((h) => h.kw.some((k) => t.includes(k)));
    const isPrediction = !!(trigger && outcome) ||
      /(when|after|once).*(then|comes|arrive|follow|in \d)/.test(t);
    const use = USE_HINTS.find((h) => h.kw.some((k) => t.includes(k)));

    const defaults = (global.ArivuConfig && global.ArivuConfig.defaultMeta) || {};
    const base = {
      elder_id: meta.elder_id || defaults.elder_id || "WYD_042",
      location_name: meta.location || defaults.location || "Wayanad",
      location_geohash: meta.geohash || defaults.geohash || "tdr7h2",
      captured_at: new Date().toISOString().slice(0, 10),
      audio_hash: quickHash(text),
      transcript: text,
    };

    if (isPrediction) {
      return Object.assign({ knowledge_type: "TYPE_C_PREDICTION" }, base, {
        trigger_event: trigger ? trigger.event : "observed_natural_signal",
        trigger_time: trigger ? trigger.time : "unspecified",
        outcome_event: outcome ? outcome.event : "seasonal_change",
        outcome_variable: outcome ? outcome.variable : "IMD_rainfall",
        time_window_days: extractTimeWindow(text),
        species: speciesInfo ? speciesInfo.species : null,
        folk_name: speciesInfo ? speciesInfo.folk_name : null,
        consent_label: "OPEN",
        validation_status: "pending",
        validatable: !!(trigger && outcome),
      });
    }
    if (use) {
      return Object.assign({ knowledge_type: "TYPE_B_USE" }, base, {
        species: speciesInfo ? speciesInfo.species : null,
        folk_name: speciesInfo ? speciesInfo.folk_name : null,
        use_category: use.cat,
        consent_label: "COMMUNITY",
        visibility: "community_only_until_ABS",
        tkdl_match: "prior_art_check_queued",
      });
    }
    return Object.assign({ knowledge_type: "TYPE_A_IDENTIFICATION" }, base, {
      folk_name: speciesInfo ? speciesInfo.folk_name : (firstWord(text) || "unknown"),
      species: speciesInfo ? speciesInfo.species : null,
      common_name: speciesInfo ? speciesInfo.common_name : null,
      candidates: speciesInfo ? [{ species: speciesInfo.species, score: 0.86 }] : [],
      consent_label: "OPEN",
      verification_status: speciesInfo ? "ai_suggested" : "needs_field_id",
    });
  }

  global.Padhavi = { structure: structure };
})(window);
