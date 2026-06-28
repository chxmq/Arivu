// Arivu — bespoke illustrated map of the southern Western Ghats.
// A hand-styled "almanac" cartography (sea, coastline, mountain hachures,
// rivers) with the six community regions as labelled zones and live Kaavu
// sentinel markers. Theme-aware via CSS variables. No tiles, no external map.
(function (global) {
  const BOUNDS = { lngMin: 74.6, lngMax: 77.9, latMin: 8.2, latMax: 13.4 };
  const W = 820, H = 1040, PAD = 34;

  function project(lng, lat) {
    const x = PAD + ((lng - BOUNDS.lngMin) / (BOUNDS.lngMax - BOUNDS.lngMin)) * (W - 2 * PAD);
    const y = PAD + ((BOUNDS.latMax - lat) / (BOUNDS.latMax - BOUNDS.latMin)) * (H - 2 * PAD);
    return [x, y];
  }

  // West coastline (lng,lat), north → south.
  const COAST = [
    [75.05, 13.4], [74.95, 13.0], [74.92, 12.6], [75.02, 12.2], [75.16, 11.8],
    [75.34, 11.4], [75.52, 11.0], [75.74, 10.6], [75.96, 10.2], [76.18, 9.8],
    [76.38, 9.4], [76.58, 9.0], [76.78, 8.6], [76.96, 8.2],
  ];
  // Ghats crest (lng,lat), north → south — the spine the hachures follow.
  const CREST = [
    [75.62, 13.1], [75.72, 12.6], [75.88, 12.1], [76.08, 11.65], [76.34, 11.32],
    [76.55, 11.0], [76.74, 10.6], [76.92, 10.2], [77.04, 9.7], [77.14, 9.2], [77.2, 8.6],
  ];
  const REGIONS = [
    { name: "Mysuru–Kodagu", tribe: "Jenu Kuruba", lng: 75.86, lat: 12.34 },
    { name: "Wayanad", tribe: "Paniya · Kurichiya", lng: 76.13, lat: 11.66 },
    { name: "BR Hills", tribe: "Soliga", lng: 77.16, lat: 11.94 },
    { name: "Silent Valley", tribe: "Cholanaikkan", lng: 76.43, lat: 11.08 },
    { name: "Idukki · High Shola", tribe: "Muthuvan", lng: 77.0, lat: 9.92 },
  ];

  const pt = (p) => p[0].toFixed(1) + "," + p[1].toFixed(1);

  function smoothPath(lngLatPts) {
    const pts = lngLatPts.map(([lng, lat]) => project(lng, lat));
    let d = "M " + pt(pts[0]);
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i];
      const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
      d += " Q " + pt(a) + " " + mx.toFixed(1) + "," + my.toFixed(1);
    }
    d += " L " + pt(pts[pts.length - 1]);
    return d;
  }

  function landPath() {
    const coast = COAST.map(([lng, lat]) => project(lng, lat));
    let d = "M " + pt(coast[0]);
    for (let i = 1; i < coast.length; i++) {
      const a = coast[i - 1], b = coast[i];
      const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
      d += " Q " + pt(a) + " " + mx.toFixed(1) + "," + my.toFixed(1);
    }
    d += " L " + pt(coast[coast.length - 1]);
    d += " L " + (W - 6) + "," + (H - 6) + " L " + (W - 6) + ",6 L " + pt(coast[0]) + " Z";
    return d;
  }

  // Sea wave hatch lines parallel to the coast.
  function seaWaves() {
    let s = "";
    for (let k = 1; k <= 4; k++) {
      const off = -0.12 * k; // shift west
      const pts = COAST.filter((_, i) => i % 2 === 0).map(([lng, lat]) => project(lng + off, lat));
      if (pts.length < 2) continue;
      let d = "M " + pt(pts[0]);
      for (let i = 1; i < pts.length; i++) d += " L " + pt(pts[i]);
      s += '<path class="gm-wave" d="' + d + '"/>';
    }
    return s;
  }

  // Mountain hachures — rows of little peaks straddling the crest.
  function mountains() {
    let s = "";
    const offsets = [-26, -9, 9, 26, 44];
    for (let i = 0; i < CREST.length - 1; i++) {
      const [aLng, aLat] = CREST[i];
      const [bLng, bLat] = CREST[i + 1];
      for (let t = 0; t < 1; t += 0.34) {
        const lng = aLng + (bLng - aLng) * t;
        const lat = aLat + (bLat - aLat) * t;
        const [cx, cy] = project(lng, lat);
        offsets.forEach((ox, j) => {
          const x = cx + ox;
          const h = 11 - Math.abs(ox) * 0.12 + (j % 2 ? 2 : 0);
          const w = 7;
          s += '<path class="gm-peak" d="M ' + (x - w).toFixed(1) + ' ' + (cy + 3).toFixed(1) +
            ' L ' + x.toFixed(1) + ' ' + (cy + 3 - h).toFixed(1) +
            ' L ' + (x + w).toFixed(1) + ' ' + (cy + 3).toFixed(1) + '"/>';
        });
      }
    }
    return s;
  }

  function rivers() {
    // a few rivers draining east off the crest, plus one west to the sea
    const lines = [
      [[76.08, 11.65], [76.6, 11.8], [77.2, 12.0], [77.8, 12.1]],
      [[76.55, 11.0], [76.9, 10.7], [77.4, 10.4], [77.85, 10.2]],
      [[77.04, 9.7], [77.3, 9.4], [77.7, 9.2]],
      [[76.08, 11.65], [75.7, 11.5], [75.3, 11.3]],
    ];
    return lines.map((l) => '<path class="gm-river" d="' + smoothPath(l) + '"/>').join("");
  }

  function nearestRegion(lng, lat) {
    let best = null, bd = Infinity;
    REGIONS.forEach((r) => {
      const d = (r.lng - lng) ** 2 + (r.lat - lat) ** 2;
      if (d < bd) { bd = d; best = r; }
    });
    return bd < 0.6 ? best : null;
  }

  function regionCounts(data) {
    const counts = {};
    REGIONS.forEach((r) => (counts[r.name] = { boxes: 0, entries: 0 }));
    (data.sentinels || []).forEach((s) => {
      if (s.lat == null || s.lng == null) return;
      const r = nearestRegion(s.lng, s.lat);
      if (r) counts[r.name].boxes++;
    });
    (data.corpus || []).forEach((e) => {
      const lat = e.latitude ?? e.lat, lng = e.longitude ?? e.lng;
      if (lat == null || lng == null || (lat === 0 && lng === 0)) return;
      const r = nearestRegion(lng, lat);
      if (r) counts[r.name].entries++;
    });
    return counts;
  }

  function esc(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function regionsLayer(data) {
    const counts = regionCounts(data);
    return REGIONS.map((r) => {
      const [x, y] = project(r.lng, r.lat);
      const c = counts[r.name];
      const labelRight = x < W * 0.62;
      const lx = labelRight ? x + 16 : x - 16;
      const anchor = labelRight ? "start" : "end";
      const tip = r.name + " — " + r.tribe + " · " + c.boxes + " boxes, " + c.entries + " entries";
      return (
        '<g class="gm-region" data-region="' + esc(r.name) + '" tabindex="0" role="button">' +
          "<title>" + esc(tip) + "</title>" +
          '<ellipse class="gm-zone" cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" rx="34" ry="26"/>' +
          '<circle class="gm-pin" cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="5.5"/>' +
          '<circle class="gm-pin-dot" cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="2"/>' +
          '<text class="gm-rlabel" x="' + lx.toFixed(1) + '" y="' + (y - 2).toFixed(1) + '" text-anchor="' + anchor + '">' + esc(r.name) + "</text>" +
          '<text class="gm-rtribe" x="' + lx.toFixed(1) + '" y="' + (y + 12).toFixed(1) + '" text-anchor="' + anchor + '">' + esc(r.tribe) + "</text>" +
          '<text class="gm-rcount" x="' + lx.toFixed(1) + '" y="' + (y + 25).toFixed(1) + '" text-anchor="' + anchor + '">' +
            c.boxes + " ◆ · " + c.entries + " ●</text>" +
        "</g>"
      );
    }).join("");
  }

  function sentinelMarkers(data) {
    return (data.sentinels || []).map((s) => {
      if (s.lat == null || s.lng == null) return "";
      const [x, y] = project(s.lng, s.lat);
      const cls = s.status === "online" ? "on" : s.status === "offline" ? "off" : "sim";
      return '<g class="gm-snt ' + cls + '" transform="translate(' + x.toFixed(1) + ',' + y.toFixed(1) + ')">' +
        "<title>" + esc(s.name + " · " + (s.status || "")) + "</title>" +
        '<rect x="-4.5" y="-4.5" width="9" height="9" rx="1.6" transform="rotate(45)"/></g>';
    }).join("");
  }

  function compass() {
    const cx = W - 70, cy = 86;
    return (
      '<g class="gm-compass" transform="translate(' + cx + ',' + cy + ')">' +
        '<circle class="gm-comp-ring" r="26"/>' +
        '<path class="gm-comp-n" d="M 0 -22 L 6 0 L 0 -6 L -6 0 Z"/>' +
        '<path class="gm-comp-s" d="M 0 22 L 6 0 L 0 6 L -6 0 Z"/>' +
        '<text class="gm-comp-t" x="0" y="-30" text-anchor="middle">N</text>' +
      "</g>"
    );
  }

  function frame() {
    return (
      '<rect class="gm-frame-o" x="6" y="6" width="' + (W - 12) + '" height="' + (H - 12) + '" rx="6"/>' +
      '<rect class="gm-frame-i" x="12" y="12" width="' + (W - 24) + '" height="' + (H - 24) + '" rx="4"/>'
    );
  }

  function cartouche() {
    return (
      '<g class="gm-cartouche" transform="translate(40,46)">' +
        '<text class="gm-title" x="0" y="0">Western Ghats</text>' +
        '<text class="gm-sub" x="2" y="20">Southern Sahyadri · Traditional Ecological Knowledge</text>' +
      "</g>"
    );
  }

  function scaleBar() {
    const [x0] = project(BOUNDS.lngMin + 0.2, 8.6);
    const [x1] = project(BOUNDS.lngMin + 0.2 + 0.45, 8.6); // ~50 km
    const y = H - 40;
    return (
      '<g class="gm-scale">' +
        '<line class="gm-scale-l" x1="' + x0.toFixed(1) + '" y1="' + y + '" x2="' + x1.toFixed(1) + '" y2="' + y + '"/>' +
        '<text class="gm-scale-t" x="' + ((x0 + x1) / 2).toFixed(1) + '" y="' + (y - 6) + '" text-anchor="middle">~50 km</text>' +
      "</g>"
    );
  }

  const STYLE = `
    .gm-svg { width:100%; height:100%; display:block; }
    .gm-sea { fill: color-mix(in srgb, var(--blue) 14%, var(--map-bg)); }
    .gm-wave { fill:none; stroke: var(--blue); stroke-width:1; opacity:.22; }
    .gm-land { fill: var(--surface); stroke: var(--border); stroke-width:1.4; }
    .gm-coast { fill:none; stroke: var(--blue); stroke-width:1.5; opacity:.55; }
    .gm-peak { fill:none; stroke: var(--muted); stroke-width:1.25; stroke-linecap:round; stroke-linejoin:round; opacity:.5; }
    .gm-river { fill:none; stroke: var(--blue); stroke-width:1.3; opacity:.5; stroke-linecap:round; }
    .gm-frame-o, .gm-frame-i { fill:none; stroke: var(--border); }
    .gm-frame-o { stroke-width:2; }
    .gm-frame-i { stroke-width:1; opacity:.6; }
    .gm-title { fill: var(--text); font-family: var(--serif); font-size:30px; font-weight:600; letter-spacing:.01em; }
    .gm-sub { fill: var(--muted); font-family: var(--sans); font-size:11.5px; letter-spacing:.04em; }
    .gm-region { cursor:pointer; }
    .gm-zone { fill: color-mix(in srgb, var(--green) 12%, transparent); stroke: var(--green); stroke-width:1.4; stroke-dasharray:5 3; opacity:.8; transition: fill .15s, opacity .15s; }
    .gm-region:hover .gm-zone, .gm-region:focus .gm-zone { fill: color-mix(in srgb, var(--green) 26%, transparent); opacity:1; outline:none; }
    .gm-pin { fill: var(--green); stroke: var(--surface); stroke-width:2; }
    .gm-pin-dot { fill: var(--surface); }
    .gm-rlabel { fill: var(--text); font-family: var(--serif); font-size:15px; font-weight:500; }
    .gm-rtribe { fill: var(--muted); font-family: var(--sans); font-size:11px; }
    .gm-rcount { fill: var(--gold); font-family: var(--mono); font-size:10px; }
    .gm-snt rect { fill: var(--gold); stroke: var(--surface); stroke-width:1.4; }
    .gm-snt.on rect { fill: var(--green); }
    .gm-snt.off rect { fill: var(--muted); }
    .gm-comp-ring { fill:none; stroke: var(--border); stroke-width:1.2; }
    .gm-comp-n { fill: var(--red); }
    .gm-comp-s { fill: var(--muted); }
    .gm-comp-t { fill: var(--muted); font-family: var(--sans); font-size:11px; }
    .gm-scale-l { stroke: var(--muted); stroke-width:2; }
    .gm-scale-t { fill: var(--muted); font-family: var(--mono); font-size:10px; }
  `;

  function render(container, data) {
    if (!container) return;
    data = data || {};
    const svg =
      '<svg class="gm-svg" viewBox="0 0 ' + W + " " + H + '" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Illustrated map of the southern Western Ghats">' +
      "<style>" + STYLE + "</style>" +
      '<rect class="gm-sea" x="0" y="0" width="' + W + '" height="' + H + '"/>' +
      seaWaves() +
      '<path class="gm-land" d="' + landPath() + '"/>' +
      '<path class="gm-coast" d="' + smoothPath(COAST) + '"/>' +
      rivers() +
      mountains() +
      regionsLayer(data) +
      sentinelMarkers(data) +
      compass() +
      scaleBar() +
      cartouche() +
      frame() +
      "</svg>";
    container.innerHTML = svg;

    if (typeof data.onRegionClick === "function") {
      container.querySelectorAll(".gm-region[data-region]").forEach((g) => {
        const fire = () => data.onRegionClick(g.getAttribute("data-region"));
        g.addEventListener("click", fire);
        g.addEventListener("keydown", (e) => {
          if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fire(); }
        });
      });
    }
  }

  global.ArivuGhatsMap = { render };
})(window);
