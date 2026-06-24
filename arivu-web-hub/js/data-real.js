// REAL data for Kaalam — no synthetic numbers.
// Two honest series for 2015–2024 (the years with adequate cuckoo sampling):
//
//  1. Indian Cuckoo (Cuculus micropterus) first pre-monsoon detection (day-of-year)
//     Source: GBIF occurrence API (aggregates eBird), taxonKey 5231904,
//     Kerala / Western Ghats bbox (lat 8.0–13.2, lng 74.5–77.6), Apr–Jun window.
//     Pulled by tools/fetch-cuckoo.js → data/cuckoo_gbif.json
//
//  2. Southwest Monsoon Onset over Kerala (day-of-year)
//     Source: IMD declared onset dates (widely reported each year).
//
// KEY FINDING (the honest one): cuckoo "first detection" is pinned near DOY 91–93
// every year — it tracks how many birders were out, NOT when the bird started
// calling. Occurrence data cannot measure call-onset. That is why continuous
// bioacoustic monitoring (the Kaavu Sentinel) is required.
(function (global) {
  const REAL = {
    years: [2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024],

    // GBIF first pre-monsoon (Apr–Jun) detection DOY — see data/cuckoo_gbif.json
    cuckoo_first_doy: [91, 92, 92, 92, 91, 93, 91, 92, 92, 91],

    // GBIF records in the Apr–Jun window (proxy for observer effort / sampling)
    cuckoo_effort: [133, 215, 183, 150, 214, 135, 198, 144, 214, 301],

    // IMD declared SW-monsoon onset over Kerala, converted to day-of-year
    // 2015 Jun5 · 2016 Jun8 · 2017 May30 · 2018 May29 · 2019 Jun8 ·
    // 2020 Jun1 · 2021 Jun3 · 2022 May29 · 2023 Jun8 · 2024 May30
    monsoon_onset_doy: [156, 160, 150, 149, 159, 153, 154, 149, 159, 151],

    sources: {
      cuckoo: "GBIF.org occurrence download (eBird-aggregated), Cuculus micropterus, Kerala/Western Ghats, Mar–Jun.",
      monsoon: "India Meteorological Department — declared SW monsoon onset over Kerala, 2015–2024.",
    },
  };
  global.ArivuReal = REAL;
})(window);
