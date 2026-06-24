// Single source of truth for demo config — edit here, not scattered in app code.
(function (global) {
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
