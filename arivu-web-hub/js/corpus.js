// Corpus store — single source of truth, synced with ArivuState.
(function (global) {
  let entries = [];
  let nextId = 1;
  const validations = {}; // entryId -> Kaalam result

  function assignCoords(entry, meta) {
    const cfg = global.ArivuConfig;
    if (meta && meta.lat != null && meta.lng != null) {
      entry.lat = meta.lat;
      entry.lng = meta.lng;
      return entry;
    }
    if (entry.lat != null && entry.lng != null) return entry;
    const [clat, clng] = cfg.region.center;
    const j = cfg.region.jitter;
    entry.lat = clat + (Math.random() - 0.5) * j;
    entry.lng = clng + (Math.random() - 0.5) * j;
    return entry;
  }

  function syncState() {
    if (global.ArivuState) global.ArivuState.set({ corpus: entries.slice() });
  }

  function seedFromData() {
    entries = [];
    Object.keys(validations).forEach((k) => delete validations[k]);
    nextId = 1;
    (global.ArivuData.SEED || []).forEach((s) => {
      const e = global.Padhavi.structure(s.transcript, s.meta);
      e.id = nextId++;
      assignCoords(e, s.meta);
      entries.push(e);
    });
    syncState();
    return entries;
  }

  function add(transcript, meta) {
    meta = meta || {};
    const cfg = global.ArivuConfig.defaultMeta;
    const merged = Object.assign({}, cfg, meta);
    const entry = global.Padhavi.structure(transcript, merged);
    entry.id = nextId++;
    assignCoords(entry, merged);
    entries.push(entry);
    syncState();
    return entry;
  }

  function getAll() {
    return entries.slice();
  }

  function getById(id) {
    return entries.find((e) => e.id === id) || null;
  }

  function saveValidation(entryId, result) {
    validations[entryId] = result;
  }

  function getValidation(entryId) {
    return validations[entryId] || null;
  }

  function replaceAll(newEntries) {
    entries = (newEntries || []).map((e) => {
      const copy = Object.assign({}, e);
      assignCoords(copy, copy);
      return copy;
    });
    const ids = entries.map((e) => Number(e.id) || 0);
    nextId = ids.length ? Math.max(...ids) + 1 : 1;
    syncState();
    return entries;
  }

  function bounds() {
    const pts = entries.filter((e) => e.lat != null && e.lng != null);
    if (!pts.length) return null;
    let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
    pts.forEach((e) => {
      minLat = Math.min(minLat, e.lat);
      maxLat = Math.max(maxLat, e.lat);
      minLng = Math.min(minLng, e.lng);
      maxLng = Math.max(maxLng, e.lng);
    });
    return [[minLat, minLng], [maxLat, maxLng]];
  }

  global.ArivuCorpus = {
    seedFromData,
    add,
    getAll,
    getById,
    saveValidation,
    getValidation,
    replaceAll,
    bounds,
    syncState,
  };
})(window);
