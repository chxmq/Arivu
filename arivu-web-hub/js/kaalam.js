// KAALAM (browser build) — validation engine, REAL DATA edition.
//
// The flagship cuckoo→monsoon prediction is now tested against REAL data
// (GBIF/eBird cuckoo records + IMD monsoon onset). The honest result: occurrence
// data cannot measure call-onset (first-detection is pinned by observer effort),
// so the claim is NOT TESTABLE this way — which is exactly why the Kaavu Sentinel
// (continuous bioacoustic monitoring) is required.
//
// The Welch t-test machinery is retained: once real call-onset data exists
// (from the Sentinel), the same engine produces VALIDATED / BROKEN verdicts.
(function (global) {
  // ---------- statistics (computed live, not hardcoded) ----------
  const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
  const sd = (a) => { const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1)); };
  function pearson(a, b) {
    const ma = mean(a), mb = mean(b);
    let num = 0, da = 0, db = 0;
    for (let i = 0; i < a.length; i++) { num += (a[i] - ma) * (b[i] - mb); da += (a[i] - ma) ** 2; db += (b[i] - mb) ** 2; }
    if (da === 0 || db === 0) return 0;
    return num / Math.sqrt(da * db);
  }
  const round = (n, d) => { const p = Math.pow(10, d || 1); return Math.round(n * p) / p; };

  // ---------- the honest real-data finding for the cuckoo claim ----------
  function cuckooFinding() {
    const R = global.ArivuReal;
    const cMean = mean(R.cuckoo_first_doy), cSd = sd(R.cuckoo_first_doy);
    const mMin = Math.min(...R.monsoon_onset_doy), mMax = Math.max(...R.monsoon_onset_doy);
    const rCuckooMonsoon = pearson(R.cuckoo_first_doy, R.monsoon_onset_doy);
    const rEffort = pearson(R.cuckoo_effort, R.cuckoo_first_doy);

    return {
      status: "NOT TESTABLE (yet)",
      headline: "Occurrence data can't measure call-onset",
      verdict:
        "Tested against REAL data: the cuckoo's first pre-monsoon detection sits at " +
        "DOY " + round(cMean, 1) + " ± " + round(cSd, 1) + " every year — essentially flat. " +
        "It tracks how many birders were out, not when the bird began calling. So the " +
        "7–10 day claim cannot be validated from occurrence records. This is not evidence " +
        "the elder is wrong — it is a data gap. Measuring true call-onset needs continuous " +
        "bioacoustic monitoring at the grove: the Kaavu Sentinel.",
      metrics: [
        ["Cuckoo first-detection (2015–24)", "DOY " + round(cMean, 1) + " ± " + round(cSd, 1) + " — no interannual signal"],
        ["Monsoon onset (real, IMD)", "DOY " + mMin + "–" + mMax + " — varies " + (mMax - mMin) + " days"],
        ["Correlation: cuckoo ↔ onset", "r = " + round(rCuckooMonsoon, 2) + " (none detectable, n=10)"],
        ["Correlation: effort ↔ first-detection", "r = " + round(rEffort, 2) + " — sampling-driven artifact"],
      ],
      conclusion:
        "eBird tells you WHERE birds are. The Kaavu Sentinel tells you WHEN they start calling. " +
        "The data gap is the argument for the instrument.",
      series: {
        years: R.years,
        datasets: [
          { key: "cuckoo", label: "Cuckoo first-detection (DOY)", data: R.cuckoo_first_doy, color: "#1B6B47" },
          { key: "monsoon", label: "Monsoon onset, IMD (DOY)", data: R.monsoon_onset_doy, color: "#C2402B" },
        ],
        yLabel: "Day of Year",
        title: "REAL data: cuckoo first-detection vs monsoon onset",
      },
      source_note:
        "Cuckoo: " + R.sources.cuckoo + "  Monsoon: " + R.sources.monsoon +
        "  Statistics computed live in your browser.",
    };
  }

  // ---------- Welch t-test (retained for real call-onset data from the Sentinel) ----------
  function gammaln(x) {
    const c = [76.18009172947146, -86.50532032941677, 24.01409824083091,
      -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
    let y = x, t = x + 5.5; t -= (x + 0.5) * Math.log(t);
    let s = 1.000000000190015; for (let j = 0; j < 6; j++) { y++; s += c[j] / y; }
    return -t + Math.log((2.5066282746310005 * s) / x);
  }
  function ibeta(x, a, b) {
    const lb = gammaln(a) + gammaln(b) - gammaln(a + b);
    const front = Math.exp(Math.log(x) * a + Math.log(1 - x) * b - lb) / a;
    let f = 1, c = 1, d = 0; const T = 1e-30;
    for (let i = 0; i <= 200; i++) {
      const m = Math.floor(i / 2); let num;
      if (i === 0) num = 1;
      else if (i % 2 === 0) num = (m * (b - m) * x) / ((a + 2 * m - 1) * (a + 2 * m));
      else num = -((a + m) * (a + b + m) * x) / ((a + 2 * m) * (a + 2 * m + 1));
      d = 1 + num * d; if (Math.abs(d) < T) d = T; d = 1 / d;
      c = 1 + num / c; if (Math.abs(c) < T) c = T; f *= d * c;
      if (Math.abs(1 - d * c) < 1e-8) break;
    }
    return front * (f - 1);
  }
  function welchP(a, b) {
    const va = sd(a) ** 2, vb = sd(b) ** 2, na = a.length, nb = b.length;
    const t = (mean(b) - mean(a)) / Math.sqrt(va / na + vb / nb);
    const df = (va / na + vb / nb) ** 2 / ((va / na) ** 2 / (na - 1) + (vb / nb) ** 2 / (nb - 1));
    const x = df / (df + t * t);
    return { t, df, p: Math.min(1, Math.max(0, ibeta(x, df / 2, 0.5))) };
  }

  function validate(prediction) {
    const key = prediction.trigger_event + "→" + prediction.outcome_event;
    const isCuckooMonsoon =
      prediction.trigger_event === "Indian_Cuckoo_first_call" &&
      prediction.outcome_event === "monsoon_onset";
    if (isCuckooMonsoon) return cuckooFinding();

    return {
      status: "DATA_PENDING",
      headline: "No long-term series loaded for this trigger/outcome",
      verdict:
        "Kaalam has no dataset registered for " + key + " yet. " +
        "In production it pulls species-specific records and the relevant IMD/MODIS " +
        "variable for this pixel, then runs the same statistical test.",
      metrics: [
        ["Trigger", prediction.trigger_event || "—"],
        ["Outcome", prediction.outcome_event || "—"],
        ["Location", (prediction.location_name || "—") + " · " + (prediction.location_geohash || "—")],
      ],
      conclusion: "Add a series for this trigger/outcome pair in data-real.js to enable validation.",
      series: null,
      source_note: "No matching dataset for: " + key,
    };
  }

  global.Kaalam = { validate: validate, _welchP: welchP };
})(window);
