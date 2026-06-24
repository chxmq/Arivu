#!/usr/bin/env node
/**
 * Validation health check — run after changes to catch regressions.
 * Usage: node scripts/validation-check.mjs
 */
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";
import {
  applyValidationPipeline,
  findLinkedSentinel,
  confirmValidation,
} from "../server/validate-pipeline.mjs";
import { validatePrediction } from "../server/kaalam.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STORE = path.join(__dirname, "../data/hub-store.json");

let passed = 0;
let failed = 0;

function ok(msg) {
  passed += 1;
  console.log("  ✓", msg);
}

function fail(msg) {
  failed += 1;
  console.error("  ✗", msg);
}

function assert(cond, msg) {
  if (cond) ok(msg);
  else fail(msg);
}

const store = JSON.parse(readFileSync(STORE, "utf8"));
const sentinels = store.sentinels || [];
const typeC = (store.corpus || []).filter((e) => e.knowledge_type === "C" && e.prediction);

console.log("Arivu validation checks\n");

// 1. Sentinel linking — cuckoo should match Cheenkanni, not Pulpalli
const cuckoo = typeC.find((e) =>
  String(e.prediction?.trigger_event || "").includes("Cuckoo")
);
if (cuckoo) {
  const s = findLinkedSentinel(cuckoo, sentinels);
  assert(s?.id === "SNT_WYD_01", `Cuckoo entry links to SNT_WYD_01 (got ${s?.id})`);
} else {
  fail("No cuckoo Type C entry in store");
}

// 2. Pala should match Pulpalli grove
const pala = typeC.find((e) =>
  String(e.prediction?.trigger_event || "").includes("Pala")
);
if (pala) {
  const s = findLinkedSentinel(pala, sentinels);
  assert(s?.id === "SNT_WYD_02", `Pala entry links to SNT_WYD_02 (got ${s?.id})`);
} else {
  fail("No pala Type C entry in store");
}

// 3. Pipeline writes recommendation, not final status (on fresh entry)
const testStore = JSON.parse(readFileSync(STORE, "utf8"));
const sample = testStore.corpus.find((e) => e.knowledge_type === "C");
if (sample) {
  const before = sample.validation_confirmed_at;
  delete sample.validation_confirmed_at;
  sample.validation_status = "PENDING";
  applyValidationPipeline(testStore, { force: true, reason: "health-check", entryIds: [sample.id] });
  assert(!!sample.sentinel_recommendation, "Pipeline sets sentinel_recommendation");
  if (!before) {
    assert(sample.validation_status === "PENDING", "Unconfirmed entry stays PENDING");
  }
} else {
  fail("No Type C sample for pipeline test");
}

// 4. Human confirm is the only path to VALIDATED
const mock = {
  id: "test",
  validation_status: "PENDING",
  sentinel_recommendation: {
    status: "VALIDATED",
    p_value: 0.1,
    correlation: 0.8,
    mean_lag_days: 8,
    n_years: 10,
    method: "test",
    dataset: "test",
    finding: "test",
    series: [],
    assessed_at: new Date().toISOString(),
  },
};
confirmValidation(mock, { status: "VALIDATED", confirmed_by: "Tester", source: "sentinel" });
assert(mock.validation_status === "VALIDATED", "Human confirm sets VALIDATED");
assert(mock.validation_confirmed_by === "Tester", "Human confirm records reviewer");
assert(mock.validation_confirmed_source === "sentinel", "Confirm records source");

// 5. Manual KAALAM runs without error
const pred = cuckoo?.prediction || pala?.prediction;
if (pred) {
  const r = validatePrediction(pred, { preferContinuous: true });
  assert(r.status && r.finding, "Manual KAALAM validatePrediction returns result");
} else {
  fail("No prediction for manual KAALAM test");
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
