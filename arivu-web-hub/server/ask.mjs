/** Corpus-grounded ASK — retrieves elder knowledge, never invents. */

const SYNONYMS = {
  monsoon: ["monsoon", "rain", "rains", "southwest", "sw monsoon", "kuyil", "cuckoo"],
  cuckoo: ["cuckoo", "kuyil", "bird", "call", "calls"],
  fever: ["fever", "cheevakka", "medicine", "bark", "paste"],
  grain: ["grain", "neem", "insect", "storage", "aryaveppu"],
  flower: ["flower", "pala", "bloom", "flowering"],
  tribe: ["tribe", "paniya", "kuruma", "aden", "elder"],
};

const GREETING_RE =
  /^(hi|hello|hey|hola|namaste|good\s*(morning|afternoon|evening|night)|thanks?|thank\s*you|ok|okay|bye|sup|yo|help|test)\s*[!?.]*$/i;

const NOISE_TOKENS = new Set([
  "hi", "he", "we", "me", "no", "so", "to", "in", "on", "at", "it", "is", "am", "an", "or", "if", "as", "be", "do", "go",
]);

function tokenize(text) {
  return String(text || "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 0);
}

function classifyQuery(q) {
  const trimmed = (q || "").trim();
  if (!trimmed) return "empty";
  if (GREETING_RE.test(trimmed)) return "greeting";
  const contentTokens = tokenize(trimmed).filter((w) => w.length >= 3 && !NOISE_TOKENS.has(w));
  if (!contentTokens.length) return "too_vague";
  return "ok";
}

function offTopicMessage(kind) {
  if (kind === "greeting") {
    return "Hello — I'm Saakshi. Ask about what elders have taught: seasons, birds, plants, medicine, or monsoon signs.";
  }
  if (kind === "too_vague") {
    return 'Try a specific question — e.g. "When does monsoon come?" or "What is Cheevakka used for?"';
  }
  return "Ask a question about species, seasons, medicine, or predictions.";
}

function expandQuery(q) {
  const words = tokenize(q).filter((w) => w.length >= 3 && !NOISE_TOKENS.has(w));
  const expanded = new Set(words);
  Object.entries(SYNONYMS).forEach(([key, syns]) => {
    if (words.some((w) => syns.includes(w) || w === key)) {
      syns.forEach((s) => expanded.add(s));
    }
  });
  return [...expanded].filter((w) => w.length >= 3 && !NOISE_TOKENS.has(w));
}

function entryHaystack(entry) {
  const p = entry.prediction || {};
  return [
    entry.transcript,
    entry.elder_name,
    entry.tribe,
    entry.village,
    entry.district,
    entry.species_mentioned,
    entry.season,
    p.trigger_event,
    p.outcome_event,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function scoreEntry(query, entry) {
  const qWords = expandQuery(query);
  if (!qWords.length) return 0;

  const hayTokens = new Set(tokenize(entryHaystack(entry)));
  let score = 0;
  qWords.forEach((w) => {
    if (hayTokens.has(w)) score += 1;
    if (w.length >= 5) {
      for (const h of hayTokens) {
        if (h.startsWith(w.slice(0, 5))) {
          score += 0.5;
          break;
        }
      }
    }
  });
  if (entry.species_mentioned) {
    const speciesTokens = tokenize(entry.species_mentioned);
    if (speciesTokens.some((st) => qWords.includes(st))) score += 3;
  }
  if (qWords.includes("monsoon") && hayTokens.has("monsoon")) score += 2;
  return score;
}

function canView(entry, role) {
  switch (entry.consent_level) {
    case "OPEN":
      return true;
    case "COMMUNITY_ONLY":
      // Community-tier: never public, only the originating community's BMC (and ZSI).
      return role === "BMC" || role === "ZSI";
    case "EMBARGOED":
      return false;
    default:
      // Fail closed: an unrecognised or missing label is never served to anyone
      // until a BMC assigns an explicit consent level.
      return false;
  }
}

function composeAnswer(query, matches) {
  if (!matches.length) {
    return {
      answer: "No elder recording found for this query.",
      confidence: 0,
      method: "retrieval",
    };
  }

  const top = matches[0];
  const extra = matches.length > 1
    ? `\n\n${matches.length - 1} other related recording(s) may also help — see below.`
    : "";

  const typeNote =
    top.knowledge_type === "C" || top.knowledge_type === "TYPE_C_PREDICTION"
      ? " This is a Type C prediction — testable against climate and sentinel data."
      : top.knowledge_type === "B" || top.knowledge_type === "TYPE_B_USE"
        ? " This is Type B use knowledge."
        : " This is Type A species identification.";

  return {
    answer:
      `${top.elder_name} (${top.tribe || "local elder"}) from ${top.village || "the grove"} taught:\n\n` +
      `"${top.transcript}"${typeNote}${extra}`,
    confidence: top.score,
    method: "retrieval",
  };
}

export async function askCorpus(corpus, question, viewerRole = "OUTSIDER") {
  const q = (question || "").trim();
  const queryKind = classifyQuery(q);
  if (queryKind !== "ok") {
    return {
      answer: offTopicMessage(queryKind),
      sources: [],
      confidence: 0,
      method: "retrieval",
    };
  }

  const visible = (corpus || []).filter((e) => canView(e, viewerRole));
  const scored = visible
    .map((e) => ({ entry: e, score: scoreEntry(q, e) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);

  const matches = scored.map((x) => x.entry);

  const { answer, confidence, method } = composeAnswer(q, matches);

  return {
    answer,
    confidence,
    method,
    sources: matches.slice(0, 5).map((e) => ({
      id: e.id,
      elder_name: e.elder_name,
      tribe: e.tribe,
      village: e.village,
      transcript: e.transcript,
      knowledge_type: e.knowledge_type,
      consent_level: e.consent_level,
      validation_status: e.validation_status,
      score: scoreEntry(q, e),
    })),
  };
}
