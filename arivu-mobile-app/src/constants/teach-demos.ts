import type { ConsentLevel, KnowledgeType, PredictionSchema } from '@/types';

export type TeachDemo = {
  id: string;
  label: string;
  subtitle: string;
  knowledge_type: KnowledgeType;
  elder_name: string;
  tribe: string;
  village: string;
  district: string;
  dialect: string;
  consent_level: ConsentLevel;
  transcript: string;
  species_mentioned: string;
  season: string;
  geohash: string;
  latitude: number;
  longitude: number;
  prediction?: PredictionSchema;
  /** Expected Kaalam outcome when validated (Type C only). */
  validateHint?: string;
};

export const TEACH_DEMOS: TeachDemo[] = [
  {
    id: 'cuckoo_monsoon',
    label: 'Cuckoo → monsoon',
    subtitle: 'Type C · BROKEN (climate drift)',
    knowledge_type: 'C',
    elder_name: 'Rajan',
    tribe: 'Paniya',
    village: 'Wayanad',
    district: 'Wayanad',
    dialect: 'Paniya dialect',
    consent_level: 'OPEN',
    transcript:
      'When the Indian Cuckoo (kuyil) calls before dawn, the monsoon arrives in seven to ten days.',
    species_mentioned: 'Cuculus micropterus',
    season: 'Pre-monsoon',
    geohash: 'tdr7h2',
    latitude: 11.6854,
    longitude: 76.132,
    prediction: {
      trigger_event: 'Indian_Cuckoo_first_call',
      trigger_time: 'pre_dawn',
      outcome_event: 'monsoon_onset',
      time_window_days: [7, 10],
      first_observed: '1962',
    },
    validateHint: 'Run VALIDATE → expect BROKEN (gap widened 8→15 days, 2001–2024)',
  },
  {
    id: 'pala_rain',
    label: 'Pala bloom → rain',
    subtitle: 'Type C · WEAKENING signal',
    knowledge_type: 'C',
    elder_name: 'Elder (WYD_017)',
    tribe: 'Kuruma',
    village: 'Pulpalli',
    district: 'Wayanad',
    dialect: 'Kuruma dialect',
    consent_level: 'OPEN',
    transcript:
      'When the Pala tree (Bartaea longifolia) is in full flower, the first heavy rain comes within two to three weeks.',
    species_mentioned: 'Bartaea longifolia',
    season: 'Pre-monsoon',
    geohash: 'tdr7h0',
    latitude: 11.702,
    longitude: 76.081,
    prediction: {
      trigger_event: 'Pala_tree_full_bloom',
      trigger_time: 'daytime',
      outcome_event: 'first_heavy_rain',
      time_window_days: [14, 21],
      first_observed: '~1970',
    },
    validateHint: 'Run VALIDATE → expect WEAKENING (climate drift)',
  },
  {
    id: 'cheevakka_fever',
    label: 'Cheevakka fever bark',
    subtitle: 'Type B · use knowledge',
    knowledge_type: 'B',
    elder_name: 'Elder (BRH_004)',
    tribe: 'Soliga',
    village: 'BR Hills',
    district: 'Chamarajanagar',
    dialect: 'Soliga dialect',
    consent_level: 'COMMUNITY_ONLY',
    transcript:
      'The inner bark of Cheevakka is scraped, pounded with wild turmeric, and pasted on the chest for three nights when fever comes with chills.',
    species_mentioned: 'Wrightia tinctoria',
    season: 'Monsoon',
    geohash: 'tdnk9p',
    latitude: 11.97,
    longitude: 77.14,
    validateHint: 'Shows COMMUNITY consent on Command Board',
  },
];
