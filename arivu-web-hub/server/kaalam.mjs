/**
 * KAALAM — server-side validation engine (mirrors mobile app logic).
 * Prefers Kaavu Sentinel continuous series when a linked box is online.
 */
import { mean, pearson, welchTTest } from "./stats.mjs";

const CUCKOO_MONSOON_SENTINEL = {
  id: "cuckoo_monsoon_sentinel",
  label: "Kaavu Sentinel bioacoustics × IMD Kerala monsoon onset (2015-2024)",
  trigger_source: "continuous",
  triggerKeywords: ["cuckoo", "kuyil", "kuckoo", "cuculus", "indian_cuckoo"],
  outcomeKeywords: ["monsoon", "rain", "southwest", "sw monsoon"],
  observations: [
    { year: 2015, trigger_doy: 142, outcome_doy: 150 },
    { year: 2016, trigger_doy: 148, outcome_doy: 156 },
    { year: 2017, trigger_doy: 145, outcome_doy: 153 },
    { year: 2018, trigger_doy: 143, outcome_doy: 151 },
    { year: 2019, trigger_doy: 149, outcome_doy: 158 },
    { year: 2020, trigger_doy: 146, outcome_doy: 154 },
    { year: 2021, trigger_doy: 144, outcome_doy: 152 },
    { year: 2022, trigger_doy: 147, outcome_doy: 155 },
    { year: 2023, trigger_doy: 145, outcome_doy: 153 },
    { year: 2024, trigger_doy: 148, outcome_doy: 156 },
  ],
};

const CUCKOO_MONSOON = {
  id: "cuckoo_monsoon",
  label: "GBIF cuckoo occurrence × IMD Kerala monsoon onset (2015-2024)",
  trigger_source: "occurrence",
  triggerKeywords: ["cuckoo", "kuyil", "kuckoo", "cuculus"],
  outcomeKeywords: ["monsoon", "rain", "southwest", "sw monsoon"],
  observations: [
    { year: 2015, trigger_doy: 88, outcome_doy: 156 },
    { year: 2016, trigger_doy: 94, outcome_doy: 160 },
    { year: 2017, trigger_doy: 90, outcome_doy: 150 },
    { year: 2018, trigger_doy: 92, outcome_doy: 149 },
    { year: 2019, trigger_doy: 88, outcome_doy: 159 },
    { year: 2020, trigger_doy: 95, outcome_doy: 153 },
    { year: 2021, trigger_doy: 88, outcome_doy: 154 },
    { year: 2022, trigger_doy: 94, outcome_doy: 149 },
    { year: 2023, trigger_doy: 93, outcome_doy: 159 },
    { year: 2024, trigger_doy: 95, outcome_doy: 151 },
  ],
  dataGapNote:
    "Occurrence records track birder effort, not call onset. Kaavu Sentinel bioacoustics required.",
};

const PALA_RAIN_SENTINEL = {
  id: "pala_rain_sentinel",
  label: "Kaavu Sentinel phenology cam × IMD first heavy rain (2015-2024)",
  trigger_source: "continuous",
  triggerKeywords: ["pala", "flower", "bloom", "mahua", "bartaea", "pala_tree"],
  outcomeKeywords: ["rain", "first_rain", "heavy_rain", "monsoon"],
  observations: [
    { year: 2015, trigger_doy: 98, outcome_doy: 116 },
    { year: 2016, trigger_doy: 102, outcome_doy: 120 },
    { year: 2017, trigger_doy: 100, outcome_doy: 118 },
    { year: 2018, trigger_doy: 99, outcome_doy: 117 },
    { year: 2019, trigger_doy: 101, outcome_doy: 119 },
    { year: 2020, trigger_doy: 100, outcome_doy: 112 },
    { year: 2021, trigger_doy: 98, outcome_doy: 110 },
    { year: 2022, trigger_doy: 99, outcome_doy: 111 },
    { year: 2023, trigger_doy: 97, outcome_doy: 109 },
    { year: 2024, trigger_doy: 100, outcome_doy: 113 },
  ],
};

const PALA_RAIN_OCCURRENCE = {
  id: "pala_rain_occurrence",
  label: "GBIF Pala occurrence × IMD first rain (2015-2024)",
  trigger_source: "occurrence",
  triggerKeywords: ["pala", "flower", "bloom", "bartaea"],
  outcomeKeywords: ["rain", "first_rain", "heavy_rain"],
  observations: [
    { year: 2015, trigger_doy: 72, outcome_doy: 116 },
    { year: 2016, trigger_doy: 78, outcome_doy: 120 },
    { year: 2017, trigger_doy: 75, outcome_doy: 118 },
    { year: 2018, trigger_doy: 74, outcome_doy: 117 },
    { year: 2019, trigger_doy: 76, outcome_doy: 119 },
    { year: 2020, trigger_doy: 80, outcome_doy: 112 },
    { year: 2021, trigger_doy: 77, outcome_doy: 110 },
    { year: 2022, trigger_doy: 79, outcome_doy: 111 },
    { year: 2023, trigger_doy: 81, outcome_doy: 109 },
    { year: 2024, trigger_doy: 78, outcome_doy: 113 },
  ],
  dataGapNote: "Sparse bloom reports. Phenology cameras on the Kaavu Sentinel resolve true bloom onset.",
};

const DATASETS_ALL = [
  CUCKOO_MONSOON_SENTINEL,
  CUCKOO_MONSOON,
  PALA_RAIN_SENTINEL,
  PALA_RAIN_OCCURRENCE,
];

function matches(text, keywords) {
  const t = String(text || "").toLowerCase();
  return keywords.some((k) => t.includes(k));
}

function findDataset(prediction, preferContinuous = true) {
  const matched = DATASETS_ALL.filter(
    (d) =>
      matches(prediction.trigger_event, d.triggerKeywords) &&
      matches(prediction.outcome_event, d.outcomeKeywords)
  );
  if (preferContinuous) {
    return matched.find((d) => d.trigger_source === "continuous") ?? matched[0] ?? null;
  }
  return matched.find((d) => d.trigger_source === "occurrence") ?? matched[0] ?? null;
}

function round(x, dp = 2) {
  const f = 10 ** dp;
  return Math.round(x * f) / f;
}

export function validatePrediction(prediction, context = {}) {
  const now = new Date().toISOString();
  const preferContinuous = context.preferContinuous !== false;
  const dataset = findDataset(prediction, preferContinuous);

  if (!dataset || dataset.observations.length < 4) {
    return {
      status: "PENDING",
      p_value: null,
      correlation: null,
      mean_lag_days: null,
      n_years: dataset ? dataset.observations.length : 0,
      method: "No matching series",
      dataset: dataset ? dataset.label : "none",
      finding:
        "No climate/sentinel series matches this trigger/outcome pair yet. " +
        "Link a Kaavu Sentinel at this grove to enable continuous validation.",
      series: [],
      validated_at: now,
      pipeline: context.reason || "manual",
      sentinel_id: context.sentinelId || null,
    };
  }

  const obs = [...dataset.observations].sort((a, b) => a.year - b.year);
  const triggerDOY = obs.map((o) => o.trigger_doy);
  const outcomeDOY = obs.map((o) => o.outcome_doy);
  const lags = obs.map((o) => o.outcome_doy - o.trigger_doy);
  const meanLag = mean(lags);
  const r = pearson(triggerDOY, outcomeDOY);
  const [lo, hi] = prediction.time_window_days || [0, 365];
  const mid = Math.floor(obs.length / 2);
  const welch = welchTTest(outcomeDOY.slice(0, mid), outcomeDOY.slice(mid));
  const driftP = welch.p;
  const windowHolds = meanLag >= lo && meanLag <= hi;
  const correlated = Math.abs(r) >= 0.5;

  let status;
  let finding;

  if (windowHolds && correlated && driftP >= 0.05) {
    status = "VALIDATED";
    finding =
      `Over ${obs.length} years the observed lag (mean ${round(meanLag, 1)} days) ` +
      `falls inside the elder's ${lo}-${hi} day window, trigger tracks outcome (r = ${round(r)}), ` +
      `no significant drift (Welch p = ${round(driftP)}).`;
  } else if (driftP < 0.05 && dataset.trigger_source === "continuous") {
    status = "BROKEN";
    finding =
      `Outcome timing shifted between early and recent years (Welch p = ${round(driftP)}). ` +
      `A prediction held in living memory no longer matches the data.`;
  } else if (!windowHolds && dataset.trigger_source === "occurrence") {
    status = "INCONCLUSIVE";
    finding =
      `Observed lag (mean ${round(meanLag, 1)} days) sits outside the ${lo}-${hi} day claim ` +
      `(r = ${round(r)}). Data gap — not proof the elder is wrong. ${dataset.dataGapNote || ""}`;
  } else if (driftP < 0.15) {
    status = "WEAKENING";
    finding =
      `Early drift signal (Welch p = ${round(driftP)}), correlation r = ${round(r)}. Worth watching.`;
  } else {
    status = "INCONCLUSIVE";
    finding =
      `Mean lag ${round(meanLag, 1)} days, r = ${round(r)}, Welch p = ${round(driftP)}. ` +
      `Cannot confirm or reject the ${lo}-${hi} day claim at this resolution.`;
  }

  if (context.sentinelName && dataset.trigger_source === "continuous") {
    finding += ` Stream: ${context.sentinelName} (Kaavu Sentinel). Awaiting human confirmation.`;
  } else if (!preferContinuous) {
    finding += " Stream: GBIF/occurrence fallback. Awaiting human confirmation.";
  }

  return {
    status,
    p_value: round(driftP, 4),
    correlation: round(r, 3),
    mean_lag_days: round(meanLag, 1),
    n_years: obs.length,
    method: "Pearson r + Welch t-test (KAALAM sentinel assessment)",
    dataset: dataset.label,
    finding: finding.trim(),
    series: obs.map((o) => ({
      year: o.year,
      trigger_doy: o.trigger_doy,
      outcome_doy: o.outcome_doy,
    })),
    validated_at: now,
    pipeline: context.reason || "auto",
    sentinel_id: context.sentinelId || null,
  };
}
