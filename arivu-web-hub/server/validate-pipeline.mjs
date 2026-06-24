/**
 * Sentinel assessment pipeline — Kaavu boxes + KAALAM produce recommendations only.
 * Humans confirm the final validation_status (never auto-set here).
 */
import { validatePrediction } from "./kaalam.mjs";

const PIPELINE_MIN_INTERVAL_MS = 30_000;

function isTypeC(entry) {
  const t = String(entry.knowledge_type || "").toUpperCase();
  return t === "C" || t.includes("TYPE_C");
}

function geohashNear(a, b) {
  if (!a || !b) return false;
  const prefix = Math.min(a.length, b.length, 5);
  return a.slice(0, prefix) === b.slice(0, prefix);
}

function scoreSentinelMatch(entry, sentinel) {
  if (!entry || !sentinel) return 0;
  let score = 0;
  if (sentinel.linked_corpus_id === entry.id) score += 100;

  const trigger = String(entry.prediction?.trigger_event || "").toLowerCase();
  const outcome = String(entry.prediction?.outcome_event || "").toLowerCase();
  const lp = String(sentinel.linked_prediction || "").toLowerCase();
  if (lp && trigger && lp.includes(trigger)) score += 50;
  if (lp && outcome && lp.includes(outcome)) score += 40;
  if (geohashNear(entry.geohash, sentinel.geohash)) score += 25;
  if (geohashNear(entry.location_geohash, sentinel.geohash)) score += 25;

  const lat = entry.latitude ?? entry.lat;
  const lng = entry.longitude ?? entry.lng;
  if (lat != null && lng != null && sentinel.lat != null && sentinel.lng != null) {
    const d = (sentinel.lat - lat) ** 2 + (sentinel.lng - lng) ** 2;
    if (d < 0.001) score += 20;
    else if (d < 0.01) score += 12;
    else if (d < 0.05) score += 6;
  }
  return score;
}

/** Find best Kaavu Sentinel for a corpus entry (scored, not first-match). */
export function findLinkedSentinel(entry, sentinels) {
  if (!entry || !sentinels?.length) return null;
  let best = null;
  let bestScore = 0;
  for (const s of sentinels) {
    const sc = scoreSentinelMatch(entry, s);
    if (sc > bestScore) {
      bestScore = sc;
      best = s;
    }
  }
  return bestScore >= 8 ? best : null;
}

export function sentinelReady(sentinel) {
  if (!sentinel) return false;
  if (sentinel.status === "offline") return false;
  if (sentinel.maintenance_status === "offline") return false;
  const t = sentinel.telemetry || {};
  return t.battery_pct == null || t.battery_pct > 5;
}

export function shouldRunPipeline(store, force = false) {
  if (force) return true;
  const last = store.last_validation_run ? Date.parse(store.last_validation_run) : 0;
  return Date.now() - last > PIPELINE_MIN_INTERVAL_MS;
}

function toRecommendation(validation, sentinel, useSentinel) {
  return {
    status: validation.status,
    p_value: validation.p_value,
    correlation: validation.correlation,
    mean_lag_days: validation.mean_lag_days,
    n_years: validation.n_years,
    method: validation.method,
    dataset: validation.dataset,
    finding: validation.finding,
    series: validation.series || [],
    assessed_at: validation.validated_at,
    sentinel_id: sentinel?.id || validation.sentinel_id || null,
    sentinel_name: sentinel?.name || null,
    source: useSentinel ? `kaalam+sentinel:${sentinel?.id}` : "kaalam+occurrence",
  };
}

export function runValidationPipeline(store, options = {}) {
  const { reason = "sentinel-assessment", entryIds = null } = options;
  const sentinels = store.sentinels || [];
  const corpus = store.corpus || [];
  const runAt = new Date().toISOString();
  const results = [];

  const targets = corpus.filter((e) => {
    if (!isTypeC(e) || !e.prediction) return false;
    if (entryIds?.length) return entryIds.includes(e.id);
    return true;
  });

  for (const entry of targets) {
    const sentinel = findLinkedSentinel(entry, sentinels);
    const useSentinel = sentinelReady(sentinel);
    const prevRec = entry.sentinel_recommendation?.status || null;

    const validation = validatePrediction(entry.prediction, {
      preferContinuous: useSentinel,
      sentinelId: sentinel?.id || null,
      sentinelName: sentinel?.name || null,
      reason,
    });

    const recommendation = toRecommendation(validation, sentinel, useSentinel);
    entry.sentinel_recommendation = recommendation;
    entry.linked_sentinel_id = sentinel?.id || entry.linked_sentinel_id || null;

    if (!entry.validation_confirmed_at) {
      entry.validation_status = "PENDING";
    }

    if (sentinel && !sentinel.linked_corpus_id) {
      sentinel.linked_corpus_id = entry.id;
    }

    const changed = prevRec !== recommendation.status;
    results.push({
      entry_id: entry.id,
      elder_name: entry.elder_name,
      recommended_status: recommendation.status,
      human_status: entry.validation_status,
      changed,
      sentinel_id: sentinel?.id || null,
      sentinel_name: sentinel?.name || null,
      dataset: recommendation.dataset,
      awaiting_human: !entry.validation_confirmed_at,
    });
  }

  store.last_validation_run = runAt;
  store.validation_log = store.validation_log || [];

  for (const r of results) {
    const msg = r.sentinel_name
      ? `Sentinel recommends ${r.recommended_status} for ${r.elder_name || r.entry_id} (${r.sentinel_name}) — awaiting human`
      : `KAALAM recommends ${r.recommended_status} for ${r.elder_name || r.entry_id} (no sentinel) — awaiting human`;
    store.validation_log.unshift({
      time: runAt,
      entry_id: r.entry_id,
      recommended_status: r.recommended_status,
      human_status: r.human_status,
      sentinel_id: r.sentinel_id,
      msg,
      reason,
    });
  }

  if (store.validation_log.length > 80) {
    store.validation_log.length = 80;
  }

  const changedCount = results.filter((r) => r.changed).length;
  console.log(
    `[hub] sentinel assessment (${reason}): ${results.length} Type C, ${changedCount} recommendation updates`
  );

  return {
    run_at: runAt,
    reason,
    assessed_count: results.length,
    changed_count: changedCount,
    results,
  };
}

export function applyValidationPipeline(store, options = {}) {
  if (!shouldRunPipeline(store, options.force)) {
    return { skipped: true, reason: "throttled", min_interval_ms: PIPELINE_MIN_INTERVAL_MS };
  }
  const out = runValidationPipeline(store, options);
  return { skipped: false, ...out };
}

function assessmentToResult(assessment, status) {
  if (!assessment) {
    return { status, finding: "Human override without attached assessment data." };
  }
  return {
    status,
    p_value: assessment.p_value,
    correlation: assessment.correlation,
    mean_lag_days: assessment.mean_lag_days,
    n_years: assessment.n_years,
    method: assessment.method,
    dataset: assessment.dataset,
    finding: assessment.finding,
    series: assessment.series || [],
  };
}

/** Human confirms final validation_status (sentinel, manual, or custom override). */
export function confirmValidation(entry, { status, confirmed_by, notes, source }) {
  const rec =
    source === "manual"
      ? entry.manual_assessment
      : source === "sentinel"
        ? entry.sentinel_recommendation
        : null;

  entry.validation_status = status;
  entry.validation_confirmed_by = confirmed_by || "Reviewer";
  entry.validation_confirmed_at = new Date().toISOString();
  entry.validation_confirmed_source = source || "custom";
  if (notes) entry.review_notes = notes;
  entry.validation_result = assessmentToResult(rec, status);
  return entry;
}

/** Store a manual KAALAM run on the hub (does not set final status). */
export function storeManualAssessment(entry, validation) {
  entry.manual_assessment = {
    status: validation.status,
    p_value: validation.p_value,
    correlation: validation.correlation,
    mean_lag_days: validation.mean_lag_days,
    n_years: validation.n_years,
    method: validation.method + " (manual run)",
    dataset: validation.dataset,
    finding: validation.finding + " Manual KAALAM on device — awaiting human confirmation.",
    series: validation.series || [],
    assessed_at: validation.validated_at || new Date().toISOString(),
    source: "kaalam+manual",
  };
  if (!entry.validation_confirmed_at) {
    entry.validation_status = "PENDING";
  }
  return entry;
}
