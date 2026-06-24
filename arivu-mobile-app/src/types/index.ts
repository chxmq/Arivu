export type KnowledgeType = 'A' | 'B' | 'C';
export type ConsentLevel = 'OPEN' | 'COMMUNITY_ONLY' | 'EMBARGOED';
export type ValidationStatus =
  | 'PENDING'
  | 'VALIDATED'
  | 'BROKEN'
  | 'WEAKENING'
  | 'INCONCLUSIVE'
  | 'NOT_TESTABLE';
export type ViewerRole = 'OUTSIDER' | 'BMC' | 'ZSI';

export type PredictionSchema = {
  trigger_event: string;
  trigger_time: string;
  outcome_event: string;
  time_window_days: [number, number];
  first_observed: string;
};

export type ValidationSeriesPoint = {
  year: number;
  trigger_doy: number;
  outcome_doy: number;
};

export type ValidationResult = {
  status: ValidationStatus;
  p_value: number | null;
  correlation: number | null;
  mean_lag_days: number | null;
  n_years: number;
  method: string;
  dataset: string;
  finding: string;
  series: ValidationSeriesPoint[];
};

/** KAALAM assessment draft — sentinel or manual; human confirms final status. */
export type ValidationAssessment = {
  status: ValidationStatus;
  p_value: number | null;
  correlation: number | null;
  mean_lag_days: number | null;
  n_years: number;
  method: string;
  dataset: string;
  finding: string;
  series: ValidationSeriesPoint[];
  assessed_at: string;
  sentinel_id?: string | null;
  sentinel_name?: string;
  source?: 'kaalam+sentinel' | 'kaalam+manual' | 'kaalam+occurrence' | string;
};

/** @deprecated alias */
export type SentinelRecommendation = ValidationAssessment;

export type KnowledgeEntry = {
  id: string;
  created_at: string;
  elder_name: string;
  tribe: string;
  village: string;
  district: string;
  geohash: string;
  latitude: number;
  longitude: number;
  consent_level: ConsentLevel;
  consent_given_by: string;
  audio_uri: string;
  audio_duration_seconds: number;
  dialect: string;
  transcript: string;
  interpreter_id: string;
  knowledge_type: KnowledgeType;
  species_mentioned: string;
  season: string;
  validation_status: ValidationStatus;
  validation_result?: ValidationResult;
  sentinel_recommendation?: ValidationAssessment;
  manual_assessment?: ValidationAssessment;
  validation_confirmed_by?: string;
  validation_confirmed_at?: string;
  validation_confirmed_source?: 'sentinel' | 'manual' | 'custom';
  linked_sentinel_id?: string;
  review_confirmed: boolean;
  reviewer_id: string;
  review_notes: string;
  flagged: boolean;
  prediction?: PredictionSchema;
  hub_synced_at?: string;
  /** field = TEACH corpus; tribal-language = dedicated language dataset partition */
  corpus_partition?: 'field' | 'tribal-language';
};
