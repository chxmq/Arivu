import { HUB_URL } from '@/constants/hub';
import { KnowledgeEntry, KnowledgeType, ViewerRole } from '@/types';
import { resolveVisibility } from './consent';

export type AskMatch = {
  entry: KnowledgeEntry;
  score: number;
};

export type AskResult = {
  matches: AskMatch[];
  hubConnected: boolean;
  corpusCount: number;
  message: string;
  method: 'local';
};

type HubCorpusItem = Record<string, unknown>;

const GREETING_RE =
  /^(hi|hello|hey|hola|namaste|good\s*(morning|afternoon|evening|night)|thanks?|thank\s*you|ok|okay|bye|sup|yo|help|test)\s*[!?.]*$/i;

/** Short tokens that must not match as substrings inside other words (e.g. "hi" in "within"). */
const NOISE_TOKENS = new Set([
  'hi', 'he', 'we', 'me', 'no', 'so', 'to', 'in', 'on', 'at', 'it', 'is', 'am', 'an', 'or', 'if', 'as', 'be', 'do', 'go',
]);

type QueryKind = 'empty' | 'greeting' | 'too_vague' | 'ok';

function tokenize(text: string): string[] {
  return text.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 0);
}

function classifyQuery(q: string): QueryKind {
  const trimmed = q.trim();
  if (!trimmed) return 'empty';
  if (GREETING_RE.test(trimmed)) return 'greeting';
  const contentTokens = tokenize(trimmed).filter((w) => w.length >= 3 && !NOISE_TOKENS.has(w));
  if (!contentTokens.length) return 'too_vague';
  return 'ok';
}

function offTopicMessage(kind: QueryKind): string {
  if (kind === 'greeting') {
    return "Hello — I'm Saakshi. Ask about what elders have taught: seasons, birds, plants, medicine, or monsoon signs.";
  }
  if (kind === 'too_vague') {
    return 'Try a specific question — e.g. "When does monsoon come?" or "What is Cheevakka used for?"';
  }
  return 'Ask about something an elder has actually taught in TEACH.';
}

function normalizeType(raw: unknown): KnowledgeType {
  const t = String(raw || 'C').toUpperCase();
  if (t === 'A' || t.includes('TYPE_A')) return 'A';
  if (t === 'B' || t.includes('TYPE_B')) return 'B';
  return 'C';
}

function hubAudioUrl(raw: HubCorpusItem): string {
  const direct = String(raw.audio_uri || raw.audio_url || '');
  if (direct.startsWith('http')) return direct;
  if (direct.startsWith('/')) return `${HUB_URL}${direct}`;
  if (raw.has_audio && raw.id) {
    return `${HUB_URL}/api/corpus/${encodeURIComponent(String(raw.id))}/audio`;
  }
  return '';
}

function hubToEntry(raw: HubCorpusItem): KnowledgeEntry {
  const lat = Number(raw.latitude ?? raw.lat ?? 0);
  const lng = Number(raw.longitude ?? raw.lng ?? 0);
  const consent = raw.consent_level as KnowledgeEntry['consent_level'];
  return {
    id: String(raw.id || `hub_${Date.now()}`),
    created_at: String(raw.created_at || raw.received_at || new Date().toISOString()),
    elder_name: String(raw.elder_name || 'Elder'),
    tribe: String(raw.tribe || ''),
    village: String(raw.village || raw.location_name || ''),
    district: String(raw.district || ''),
    geohash: String(raw.geohash || raw.location_geohash || ''),
    latitude: lat,
    longitude: lng,
    // Only an explicit 'OPEN' is public. Anything unrecognised falls back to
    // the locked COMMUNITY_ONLY tier so a missing label can never leak content.
    consent_level:
      consent === 'OPEN' || consent === 'COMMUNITY_ONLY' || consent === 'EMBARGOED'
        ? consent
        : 'COMMUNITY_ONLY',
    consent_given_by: String(raw.consent_given_by || ''),
    audio_uri: hubAudioUrl(raw),
    audio_duration_seconds: Number(raw.audio_duration_seconds || 0),
    dialect: String(raw.dialect || ''),
    transcript: String(raw.transcript || ''),
    interpreter_id: String(raw.interpreter_id || ''),
    knowledge_type: normalizeType(raw.knowledge_type),
    species_mentioned: String(raw.species_mentioned || ''),
    season: String(raw.season || ''),
    corpus_partition: (raw.corpus_partition as KnowledgeEntry['corpus_partition']) || 'field',
    validation_status: (raw.validation_status as KnowledgeEntry['validation_status']) || 'PENDING',
    review_confirmed: Boolean(raw.review_confirmed),
    reviewer_id: String(raw.reviewer_id || ''),
    review_notes: String(raw.review_notes || ''),
    flagged: Boolean(raw.flagged),
    prediction: raw.prediction as KnowledgeEntry['prediction'],
  };
}

function mergeCorpus(local: KnowledgeEntry[], remote: KnowledgeEntry[]): KnowledgeEntry[] {
  const byId = new Map<string, KnowledgeEntry>();
  remote.forEach((e) => byId.set(e.id, e));
  local.forEach((e) => byId.set(e.id, e));
  return [...byId.values()];
}

function entryHaystack(entry: KnowledgeEntry): string {
  return [
    entry.transcript,
    entry.elder_name,
    entry.tribe,
    entry.village,
    entry.district,
    entry.species_mentioned,
    entry.season,
    entry.prediction?.trigger_event,
    entry.prediction?.outcome_event,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function scoreEntry(query: string, entry: KnowledgeEntry): number {
  const qTokens = tokenize(query).filter((w) => w.length >= 3 && !NOISE_TOKENS.has(w));
  if (!qTokens.length) return 0;

  const hayTokens = new Set(tokenize(entryHaystack(entry)));
  let score = 0;
  qTokens.forEach((w) => {
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
    if (speciesTokens.some((st) => qTokens.includes(st))) score += 3;
  }
  if (qTokens.includes('monsoon') && hayTokens.has('monsoon')) score += 2;
  return score;
}

async function fetchHubCorpus(): Promise<KnowledgeEntry[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(`${HUB_URL}/api/corpus`, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.corpus || []).map((raw: HubCorpusItem) => hubToEntry(raw));
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

function localIntro(matches: AskMatch[]): string {
  const top = matches[0].entry;
  return matches.length === 1
    ? `Matched 1 recording from ${top.elder_name} (${top.tribe || 'local elder'}).`
    : `Matched ${matches.length} recordings — best fit from ${top.elder_name} (${top.tribe || 'local elder'}).`;
}

export async function checkHubOnline(): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(`${HUB_URL}/api/health`, { signal: controller.signal });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/** Load phone TEACH entries merged with hub corpus (hub refreshed each call). */
export async function loadMergedCorpus(localEntries: KnowledgeEntry[]): Promise<{
  corpus: KnowledgeEntry[];
  hubConnected: boolean;
}> {
  const hubConnected = await checkHubOnline();
  if (!hubConnected) return { corpus: localEntries, hubConnected: false };
  const remote = await fetchHubCorpus();
  return { corpus: mergeCorpus(localEntries, remote), hubConnected: true };
}

function humanizeToken(raw: string): string {
  return raw.replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Suggestion chips derived from whatever is actually in the corpus. */
export function buildAskSuggestions(
  corpus: KnowledgeEntry[],
  viewerRole: ViewerRole,
  limit = 4
): string[] {
  const visible = corpus.filter((e) => resolveVisibility(e, viewerRole).showContent);
  const out: string[] = [];

  for (const e of visible) {
    if (e.species_mentioned) {
      const common = e.transcript.match(/\(([^)]+)\)/)?.[1];
      if (common) out.push(`What does ${common} mean?`);
      else out.push(`Tell me about ${e.species_mentioned}.`);
    }
    if (e.prediction?.outcome_event) {
      out.push(`When does ${humanizeToken(e.prediction.outcome_event)} come?`);
    }
    if (e.prediction?.trigger_event) {
      out.push(`What is ${humanizeToken(e.prediction.trigger_event)}?`);
    }
    if (e.season && e.knowledge_type === 'B') {
      out.push(`${e.season} remedies?`);
    }
    if (out.length >= limit * 2) break;
  }

  const unique = [...new Set(out.map((s) => s.trim()).filter(Boolean))];
  return unique.slice(0, limit);
}

function searchLocal(
  corpus: KnowledgeEntry[],
  question: string,
  viewerRole: ViewerRole
): { matches: AskMatch[]; message: string } {
  const visible = corpus.filter((e) => resolveVisibility(e, viewerRole).showContent);
  const scored = visible
    .map((entry) => ({ entry, score: scoreEntry(question, entry) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);

  if (!scored.length) {
    const withheld = corpus.filter(
      (e) => !resolveVisibility(e, viewerRole).showContent && scoreEntry(question, e) > 0
    ).length;
    let message = 'No elder recording found for this query.';
    if (withheld > 0) {
      message += `\n\n${withheld} related recording(s) exist but are withheld for your viewer role.`;
    }
    return { matches: [], message };
  }

  return {
    matches: scored.slice(0, 5),
    message: localIntro(scored),
  };
}

/** Saakshi ASK — searches live corpus (phone + hub), returns elder words verbatim. */
export async function askCorpus(
  localEntries: KnowledgeEntry[],
  question: string,
  viewerRole: ViewerRole = 'OUTSIDER'
): Promise<AskResult> {
  const q = question.trim();
  const queryKind = classifyQuery(q);
  if (queryKind !== 'ok') {
    const { corpus, hubConnected } = await loadMergedCorpus(localEntries);
    return {
      matches: [],
      hubConnected,
      corpusCount: corpus.length,
      message: offTopicMessage(queryKind),
      method: 'local',
    };
  }

  const { corpus, hubConnected } = await loadMergedCorpus(localEntries);

  // Pure retrieval — keyword search across phone + hub corpus. Never generates answers.
  const { matches, message } = searchLocal(corpus, q, viewerRole);
  let finalMessage = message;
  if (!matches.length && !hubConnected) {
    finalMessage += ' Connect to the Arivu Hub for the full field corpus.';
  }

  return {
    matches,
    hubConnected,
    corpusCount: corpus.length,
    message: finalMessage,
    method: 'local',
  };
}
