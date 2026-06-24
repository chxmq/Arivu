import * as FileSystem from 'expo-file-system/legacy';
import type { KnowledgeEntry, ValidationAssessment, ValidationStatus } from '@/types';
import { HUB_URL } from '@/constants/hub';

export type SyncResult = {
  ok: boolean;
  audioUploaded: boolean;
};

async function uploadAudioToHub(
  entryId: string,
  uri: string,
  durationSeconds: number
): Promise<boolean> {
  if (!uri || uri.startsWith('http')) return false;
  try {
    const info = await FileSystem.getInfoAsync(uri);
    if (!info.exists) return false;

    const base64 = await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.Base64,
    });

    const res = await fetch(
      `${HUB_URL}/api/corpus/${encodeURIComponent(entryId)}/audio`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          audio_base64: base64,
          mime_type: 'audio/mp4',
          duration_seconds: durationSeconds,
        }),
      }
    );
    return res.ok;
  } catch {
    return false;
  }
}

/** Push TEACH metadata + elder speech recording to the Arivu Hub. */
export async function syncEntryToHub(entry: KnowledgeEntry): Promise<SyncResult> {
  const payload = {
    id: entry.id,
    source: 'saakshi-app',
    transcript: entry.transcript,
    elder_name: entry.elder_name,
    elder_id: entry.elder_name,
    tribe: entry.tribe,
    village: entry.village,
    district: entry.district,
    dialect: entry.dialect,
    language: entry.dialect || entry.tribe,
    corpus_partition: entry.corpus_partition || 'field',
    location_name: entry.village,
    location_geohash: entry.geohash,
    geohash: entry.geohash,
    latitude: entry.latitude,
    longitude: entry.longitude,
    lat: entry.latitude,
    lng: entry.longitude,
    knowledge_type: entry.knowledge_type,
    consent_level: entry.consent_level,
    consent_given_by: entry.consent_given_by,
    species_mentioned: entry.species_mentioned,
    season: entry.season,
    interpreter_id: entry.interpreter_id,
    audio_duration_seconds: entry.audio_duration_seconds,
    has_audio: Boolean(entry.audio_uri),
    prediction: entry.prediction,
    validation_status: entry.validation_status || 'PENDING',
    validation_confirmed_by: entry.validation_confirmed_by,
    validation_confirmed_at: entry.validation_confirmed_at,
    created_at: entry.created_at,
  };

  try {
    const res = await fetch(`${HUB_URL}/api/corpus`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) return { ok: false, audioUploaded: false };

    let audioUploaded = false;
    if (entry.audio_uri) {
      audioUploaded = await uploadAudioToHub(
        entry.id,
        entry.audio_uri,
        entry.audio_duration_seconds
      );
    }

    return { ok: true, audioUploaded };
  } catch {
    return { ok: false, audioUploaded: false };
  }
}

export async function hubHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${HUB_URL}/api/health`);
    return res.ok;
  } catch {
    return false;
  }
}

/** Pull sentinel + manual assessments from hub — does NOT overwrite unconfirmed status. */
export async function syncRecommendationsFromHub(
  updateEntry: (id: string, patch: Partial<KnowledgeEntry>) => Promise<unknown>
): Promise<number> {
  try {
    const res = await fetch(`${HUB_URL}/api/corpus`, {
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return 0;
    const data = await res.json();
    const remote = (data.corpus || []) as KnowledgeEntry[];
    let updated = 0;
    for (const r of remote) {
      if (!r.id) continue;
      const patch: Partial<KnowledgeEntry> = {};
      if (r.sentinel_recommendation) {
        patch.sentinel_recommendation = r.sentinel_recommendation;
        patch.linked_sentinel_id = r.linked_sentinel_id;
      }
      if (r.manual_assessment) {
        patch.manual_assessment = r.manual_assessment;
      }
      if (r.validation_confirmed_at) {
        patch.validation_status = r.validation_status;
        patch.validation_result = r.validation_result;
        patch.validation_confirmed_by = r.validation_confirmed_by;
        patch.validation_confirmed_at = r.validation_confirmed_at;
        patch.validation_confirmed_source = r.validation_confirmed_source;
      }
      if (Object.keys(patch).length) {
        await updateEntry(r.id, patch);
        updated += 1;
      }
    }
    return updated;
  } catch {
    return 0;
  }
}

/** Ask hub to refresh sentinel KAALAM recommendations (not final validation). */
export async function triggerSentinelAssessment(entryId?: string): Promise<boolean> {
  try {
    const res = await fetch(`${HUB_URL}/api/validate/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(
        entryId ? { entry_id: entryId, reason: 'app-refresh' } : { reason: 'app-refresh' }
      ),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Human confirms final validation status on the hub. */
export async function confirmValidationOnHub(
  entryId: string,
  status: ValidationStatus,
  confirmedBy: string,
  source: 'sentinel' | 'manual' | 'custom' = 'custom',
  notes?: string
): Promise<boolean> {
  try {
    const res = await fetch(`${HUB_URL}/api/validate/confirm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        entry_id: entryId,
        validation_status: status,
        confirmed_by: confirmedBy,
        source,
        notes,
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Push manual KAALAM assessment to hub (does not set final status). */
export async function pushManualAssessmentToHub(
  entryId: string,
  assessment: ValidationAssessment
): Promise<boolean> {
  try {
    const res = await fetch(`${HUB_URL}/api/validate/manual`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ entry_id: entryId, manual_assessment: assessment }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export function assessmentAsResult(
  assessment?: ValidationAssessment
): KnowledgeEntry['validation_result'] | null {
  if (!assessment) return null;
  return {
    status: assessment.status,
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

/** @deprecated use assessmentAsResult */
export const recommendationAsResult = assessmentAsResult;
