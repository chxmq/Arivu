// Kaavu Sentinel markers on the Leaflet map — linked to hub telemetry.
(function (global) {
  let sentinelLayer = [];
  let pollTimer = null;

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function sentinelIcon(status) {
    const color = status === "online" ? "#1B6B47" : status === "simulated" ? "#E0A92E" : "#6F6657";
    return L.divIcon({
      className: "sentinel-marker-wrap",
      html:
        '<div class="sentinel-marker ' + status + '" style="--s-color:' + color + '">' +
          '<img src="assets/sentinel.png" alt="" width="28" height="28" />' +
          '<span class="sentinel-pulse"></span>' +
        "</div>",
      iconSize: [36, 36],
      iconAnchor: [18, 18],
    });
  }

  function popupHtml(s) {
    const t = s.telemetry || {};
    return (
      "<b>◈ " + esc(s.name) + "</b><br>" +
      "<small>" + esc(s.location) + " · " + esc(s.id) + "</small><br>" +
      "<hr style='margin:6px 0;border-color:#ddd'>" +
      "<b>Status:</b> " + esc(s.status) + "<br>" +
      "<b>Linked:</b> " + esc(s.linked_prediction || "—") + "<br>" +
      "<b>Temp:</b> " + (t.temp_c != null ? t.temp_c + "°C" : "—") +
      " · <b>RH:</b> " + (t.humidity_pct != null ? t.humidity_pct + "%" : "—") + "<br>" +
      "<b>Rain 24h:</b> " + (t.rain_mm_24h != null ? t.rain_mm_24h + " mm" : "—") +
      " · <b>Bio events:</b> " + (t.bioacoustic_events_24h != null ? t.bioacoustic_events_24h : "—") + "<br>" +
      (t.cuckoo_call_detected ? "<b style='color:#C2402B'>🐦 Cuckoo call detected</b><br>" : "") +
      "<b>Battery:</b> " + (t.battery_pct != null ? t.battery_pct + "%" : "—") +
      (t.solar_charging ? " ☀️" : "")
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
