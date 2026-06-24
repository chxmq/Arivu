// Fetches corpus + sentinels from Arivu Hub. Falls back to local data if hub is offline.
(function (global) {
  const DEFAULT_BASE = "http://localhost:8787";

  function baseUrl() {
    const cfg = global.ArivuConfig && global.ArivuConfig.hub;
    if (cfg && cfg.url) return cfg.url.replace(/\/$/, "");
    if (location.protocol === "file:") return DEFAULT_BASE;
    if (location.hostname === "localhost" || location.hostname === "127.0.0.1") {
      return DEFAULT_BASE;
    }
    return location.origin;
  }

  async function get(path) {
    const res = await fetch(baseUrl() + path, { headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error("Hub " + res.status);
    return res.json();
  }

  async function post(path, body) {
    const res = await fetch(baseUrl() + path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error("Hub POST " + res.status);
    return res.json();
  }

  async function del(path) {
    const res = await fetch(baseUrl() + path, { method: "DELETE", headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error("Hub DELETE " + res.status);
    return res.json();
  }

  async function deleteCorpusEntry(id) {
    return del("/api/corpus/" + encodeURIComponent(id));
  }

  async function patch(path, body) {
    const res = await fetch(baseUrl() + path, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error("Hub PATCH " + res.status);
    return res.json();
  }

  async function updateCorpusEntry(id, patch) {
    return patch("/api/corpus/" + encodeURIComponent(id), patch);
  }

  async function updateSentinel(id, patch) {
    return patch("/api/sentinels/" + encodeURIComponent(id), patch);
  }

  async function createSentinel(body) {
    return post("/api/sentinels", body);
  }

  async function fetchFeeds(lat, lng, species) {
    const q = new URLSearchParams({
      lat: String(lat),
      lng: String(lng),
      species: species || "Cuculus micropterus",
    });
    return get("/api/feeds?" + q.toString());
  }

  async function health() {
    try {
      await get("/api/health");
      return true;
    } catch {
      return false;
    }
  }

  async function fetchDashboard() {
    return get("/api/dashboard");
  }

  async function fetchSentinels(simulate) {
    const q = simulate === false ? "?simulate=false" : "";
    const data = await get("/api/sentinels" + q);
    return data.sentinels || [];
  }

  /** Normalize app/hub entry → Padhavi-shaped corpus entry for the website */
  function normalizeHubEntry(raw, index) {
    if (raw.knowledge_type && raw.transcript) {
      return Object.assign({ id: raw.id || index + 1 }, raw);
    }
    const transcript = raw.transcript || "";
    const meta = {
      elder_id: raw.elder_id || raw.elder_name || "APP_SYNC",
      location: raw.location_name || raw.village || raw.location || "Wayanad",
      geohash: raw.location_geohash || raw.geohash || "",
      lat: raw.lat != null ? raw.lat : raw.latitude,
      lng: raw.lng != null ? raw.lng : raw.longitude,
    };
    if (global.Padhavi) {
      const e = Padhavi.structure(transcript, meta);
      e.id = raw.id || "hub_" + index;
      e.lat = meta.lat;
      e.lng = meta.lng;
      e._source = raw.source || "hub";
      return e;
    }
    return { id: raw.id, transcript, lat: meta.lat, lng: meta.lng, knowledge_type: "TYPE_A_IDENTIFICATION" };
  }

  async function mergeHubCorpus(localCorpus) {
    try {
      const dash = await fetchDashboard();
      const remote = (dash.corpus || []).map((r, i) => normalizeHubEntry(r, i + 1000));
      if (!remote.length) return { merged: localCorpus, hubOnline: true, remoteCount: 0 };

      const byId = {};
      localCorpus.forEach((e) => { byId[e.id] = e; });
      remote.forEach((e) => { byId[e.id] = e; });
      return {
        merged: Object.values(byId),
        hubOnline: true,
        remoteCount: remote.length,
        sentinels: dash.sentinels || [],
      };
    } catch (e) {
      return { merged: localCorpus, hubOnline: false, error: String(e.message || e) };
    }
  }

  global.ArivuHub = {
    baseUrl,
    health,
    fetchDashboard,
    fetchSentinels,
    mergeHubCorpus,
    normalizeHubEntry,
    post,
    deleteCorpusEntry,
    updateCorpusEntry,
    updateSentinel,
    createSentinel,
    fetchFeeds,
    async ask(question, viewerRole) {
      return post("/api/ask", { question, viewer_role: viewerRole || "OUTSIDER" });
    },
    async assistant(message, context) {
      return post("/api/assistant", { message, context: context || {} });
    },
  };
})(window);
