// Single source of truth for demo config — edit here, not scattered in app code.
(function (global) {
  // ── Inline line-icon set (Lucide paths, MIT). No CDN, no emoji. ──
  const ICON_PATHS = {
    home: '<path d="M3 9.5 12 3l9 6.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1Z"/>',
    book: '<path d="M12 7v14"/><path d="M3 18a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3Z"/>',
    radio: '<path d="M4.9 19.1a10 10 0 0 1 0-14.2M7.8 16.2a6 6 0 0 1 0-8.4M19.1 4.9a10 10 0 0 1 0 14.2M16.2 7.8a6 6 0 0 1 0 8.4"/><circle cx="12" cy="12" r="1.5"/>',
    layers: '<path d="m12.8 2.2a2 2 0 0 0-1.6 0L2.6 6.1a1 1 0 0 0 0 1.8l8.6 3.9a2 2 0 0 0 1.6 0l8.6-3.9a1 1 0 0 0 0-1.8Z"/><path d="m6 9.5-3.4 1.6a1 1 0 0 0 0 1.8l8.6 3.9a2 2 0 0 0 1.6 0l8.6-3.9a1 1 0 0 0 0-1.8L18 9.5"/>',
    map: '<path d="M14.5 3 9 5.5 3.5 3 3 3.2v15.6l.5.2L9 16.5l5.5 2.5 5.5-2.5.5-.2V3.2L20.5 3 15 5.5Z"/><path d="M9 5.5v11M15 5.5v11"/>',
    flame: '<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.4-.5-2-1-3-1.1-2.1-.2-4 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.2.4-2.3 1-3a2.5 2.5 0 0 0 2.5 2.5Z"/>',
    activity: '<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>',
    thermometer: '<path d="M14 4v10.5a4 4 0 1 1-4 0V4a2 2 0 0 1 4 0Z"/>',
    bird: '<path d="M16 7h.01"/><path d="M3.4 18H12a8 8 0 0 0 8-8V7a4 4 0 0 0-7.3-2.3L2 20"/><path d="m20 7 2 .5-2 .5"/><path d="M10 18v3M14 17.8V21"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M6.3 17.7l-1.4 1.4M19.1 4.9l-1.4 1.4"/>',
    moon: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>',
    leaf: '<path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.5 19 2c1 2 2 4.2 2 8 0 5.5-4.8 10-10 10Z"/><path d="M2 21c0-3 1.9-5.4 5.1-6"/>',
    refresh: '<path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/>',
    download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    alert: '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4M12 17h.01"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0"/>',
  };
  global.ArivuIcons = {
    svg(name, cls) {
      const p = ICON_PATHS[name];
      if (!p) return "";
      return (
        '<svg class="ico' + (cls ? " " + cls : "") + '" viewBox="0 0 24 24" fill="none" ' +
        'stroke="currentColor" stroke-width="1.8" stroke-linecap="round" ' +
        'stroke-linejoin="round" aria-hidden="true">' + p + "</svg>"
      );
    },
  };

  global.ArivuConfig = {
    speech: { lang: "en-IN", rate: 0.95 },

    // Default elder/location when user teaches without seed meta
    defaultMeta: {
      elder_id: "WYD_042",
      location: "Wayanad",
      geohash: "tdr7h2",
      lat: 11.6854,
      lng: 76.132,
    },

    // Fallback region for entries with no coordinates (small jitter around center)
    region: {
      center: [11.6854, 76.132],
      jitter: 0.08,
    },

    map: {
      tileUrl: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
      attribution: "© OpenStreetMap contributors",
      maxZoom: 18,
      defaultZoom: 9,
      focusZoom: 10,
      padding: [40, 40],
    },

    consentColors: {
      OPEN: "#1B6B47",
      COMMUNITY: "#E0A92E",
      EMBARGOED: "#C2402B",
    },

    chartColors: {
      primary: "#1B6B47",
      secondary: "#C2402B",
      grid: "rgba(111, 102, 87, 0.15)",
      text: "#6F6657",
    },

    layers: {
      saakshi: { icon: "assets/icon-mic.png", label: "Saakshi" },
      padhavi: { icon: "assets/icon-structure.png", label: "Padhavi" },
      kaalam: { icon: "assets/icon-time.png", label: "Kaalam" },
    },

    typeLabels: {
      TYPE_C_PREDICTION: { cls: "type-c", pill: "c", label: "TYPE C · PREDICTION" },
      TYPE_B_USE: { cls: "type-b", pill: "b", label: "TYPE B · USE" },
      TYPE_A_IDENTIFICATION: { cls: "type-a", pill: "a", label: "TYPE A · IDENTIFICATION" },
    },

    // Pitch deck stats — edit here to update hero
    heroStats: [
      { value: "484,839", label: "Scheduled Tribe population in Kerala" },
      { value: "~14,000", label: "Sacred groves documented across India" },
      { value: "60+ yr", label: "of predictions, lost untested" },
      { value: "₹5,500", label: "Kaavu Sentinel BOM · Indian-sourced" },
    ],

    // Arivu Hub — website + mobile app sync (run: node server/hub.mjs)
    hub: {
      url: "http://localhost:8787",
      pollIntervalMs: 15000,
    },

    externalSources: {
      weather: { name: "Open-Meteo", url: "https://open-meteo.com" },
      species: { name: "GBIF", url: "https://www.gbif.org", defaultSpecies: "Cuculus micropterus" },
    },

    // Three knowledge categories + collection pipeline (pitch deck → command UI)
    knowledgeTypes: {
      A: {
        key: "A",
        label: "Type A",
        title: "Identification",
        desc: "Names and identifies a species — folk names, dialect terms, where it grows.",
        stored: ["Audio recording", "Dialect transcript", "GPS / geohash", "Species mention"],
        color: "#6eb5ff",
      },
      B: {
        key: "B",
        label: "Type B",
        title: "Use knowledge",
        desc: "Describes how a plant or animal is used — medicine, ritual, storage, food.",
        stored: ["Audio recording", "Use category", "Consent tier", "Community attribution"],
        color: "#e0a92e",
      },
      C: {
        key: "C",
        label: "Type C",
        title: "Prediction",
        desc: "Links a natural signal to an outcome — testable against climate & sentinel data.",
        stored: ["Prediction schema", "Trigger → outcome window", "Kaalam validation", "Sentinel link"],
        color: "#3dd68c",
      },
    },

    pipeline: [
      {
        id: "saakshi",
        label: "Saakshi",
        script: "साक्षी",
        role: "Capture",
        icon: "assets/icon-mic.png",
        desc: "Facilitator records elder voice on phone. GPS tagged. Raw dialect audio saved.",
      },
      {
        id: "padhavi",
        label: "Padhavi",
        script: "പദവി",
        role: "Structure",
        icon: "assets/icon-structure.png",
        desc: "Speech → structured JSON. Sorted into Type A / B / C. Consent label applied.",
      },
      {
        id: "kaalam",
        label: "Kaalam",
        script: "കാലം",
        role: "Validate",
        icon: "assets/icon-time.png",
        desc: "Type C predictions tested vs IMD, GBIF, and Kaavu Sentinel bioacoustics.",
      },
    ],

    problemStatement:
      "Tribal elders hold decades of phenological knowledge. Arivu captures it by voice, " +
      "structures it for science, and tests whether the forest still agrees — before that library is lost.",
  };
})(window);
