// Kaavu Sentinel markers on the Leaflet map — linked to hub telemetry.
(function (global) {
  let sentinelLayer = [];
  let pollTimer = null;

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function sentinelIcon(status) {
    const st = status === "online" ? "online" : status === "simulated" ? "simulated" : "offline";
    const color = st === "online" ? "#3dd68c" : st === "simulated" ? "#e0a92e" : "#8a9a8f";
    // Flat SVG diamond — visually distinct from the round, consent-coloured
    // corpus dots. Crisp at any zoom, no raster photo.
    return L.divIcon({
      className: "sentinel-marker-wrap",
      html:
        '<div class="sentinel-marker ' + st + '">' +
          (st === "online" ? '<span class="sentinel-pulse"></span>' : "") +
          '<svg viewBox="0 0 28 28" width="26" height="26" aria-hidden="true">' +
            '<rect x="8" y="8" width="12" height="12" rx="2.5" transform="rotate(45 14 14)" ' +
              'fill="' + color + '" stroke="#fff" stroke-width="1.6" />' +
            '<circle cx="14" cy="14" r="2.3" fill="#fff" />' +
          "</svg>" +
        "</div>",
      iconSize: [30, 30],
      iconAnchor: [15, 15],
    });
  }

  function ic(name) {
    return global.ArivuIcons ? ArivuIcons.svg(name) : "";
  }

  function popupHtml(s) {
    const t = s.telemetry || {};
    return (
      "<b>" + esc(s.name) + "</b><br>" +
      "<small>" + esc(s.location) + " · " + esc(s.id) + "</small><br>" +
      "<hr style='margin:6px 0;border-color:var(--border)'>" +
      "<b>Status:</b> " + esc(s.status) + "<br>" +
      "<b>Linked:</b> " + esc(s.linked_prediction || "—") + "<br>" +
      "<b>Temp:</b> " + (t.temp_c != null ? t.temp_c + "°C" : "—") +
      " · <b>RH:</b> " + (t.humidity_pct != null ? t.humidity_pct + "%" : "—") + "<br>" +
      "<b>Rain 24h:</b> " + (t.rain_mm_24h != null ? t.rain_mm_24h + " mm" : "—") +
      " · <b>Bio events:</b> " + (t.bioacoustic_events_24h != null ? t.bioacoustic_events_24h : "—") + "<br>" +
      (t.cuckoo_call_detected
        ? '<b style="color:var(--green);display:inline-flex;align-items:center;gap:4px">' +
          ic("bird") + "Cuckoo call detected</b><br>"
        : "") +
      "<b>Battery:</b> " + (t.battery_pct != null ? t.battery_pct + "%" : "—") +
      (t.solar_charging ? ' <span style="display:inline-flex;vertical-align:middle">' + ic("sun") + "</span>" : "")
    );
  }

  function render(map, sentinels, onSelect) {
    if (!map) return;
    sentinelLayer.forEach((m) => map.removeLayer(m));
    sentinelLayer = [];

    (sentinels || []).forEach((s) => {
      if (s.lat == null || s.lng == null) return;
      const marker = L.marker([s.lat, s.lng], { icon: sentinelIcon(s.status) }).addTo(map);
      marker.bindPopup(popupHtml(s));
      marker.on("click", () => {
        if (onSelect) onSelect(s);
        if (global.ArivuState) {
          global.ArivuState.logFlow("Sentinel " + s.id + " · " + (s.telemetry?.temp_c || "?") + "°C");
        }
      });
      sentinelLayer.push(marker);
    });
  }

  function startPolling(map, intervalMs, onUpdate) {
    stopPolling();
    const tick = async () => {
      if (!global.ArivuHub) return;
      try {
        const sentinels = await ArivuHub.fetchSentinels(true);
        render(map, sentinels, onUpdate);
        if (global.ArivuState) global.ArivuState.emit("sentinels:update", sentinels);
      } catch { /* hub offline */ }
    };
    tick();
    pollTimer = setInterval(tick, intervalMs || 15000);
  }

  function stopPolling() {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = null;
  }

  global.ArivuSentinels = { render, startPolling, stopPolling };
})(window);
