// Deck-matched UI polish: scroll reveals, nav, chart theme.
(function () {
  const nav = document.getElementById("nav");
  window.addEventListener("scroll", () => {
    if (nav) nav.style.boxShadow = window.scrollY > 60
      ? "0 4px 32px rgba(14, 61, 41, 0.55)"
      : "0 4px 24px rgba(14, 61, 41, 0.4)";
  }, { passive: true });

  const reveals = document.querySelectorAll(".layer, .howto, .info-grid, .pipeline-section, .hero-stats");
  reveals.forEach((el) => el.classList.add("reveal"));
  const io = new IntersectionObserver((entries) => {
    entries.forEach((en) => { if (en.isIntersecting) en.target.classList.add("visible"); });
  }, { threshold: 0.08, rootMargin: "0px 0px -40px 0px" });
  reveals.forEach((el) => io.observe(el));

  const heroStats = document.getElementById("heroStats");
  const stats = (window.ArivuConfig && window.ArivuConfig.heroStats) || [];
  if (heroStats && stats.length) {
    heroStats.innerHTML = stats.map((s) =>
      '<div class="stat-card"><b>' + s.value + '</b><span>' + s.label + "</span></div>"
    ).join("");
  }

  window.ArivuUI = {
    chartColors: (window.ArivuConfig && window.ArivuConfig.chartColors) || {
      primary: "#1B6B47",
      secondary: "#C2402B",
      grid: "rgba(111, 102, 87, 0.15)",
      text: "#6F6657",
    },
  };
})();
