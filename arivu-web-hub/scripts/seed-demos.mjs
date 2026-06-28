#!/usr/bin/env node
/** Seed hub corpus with TEACH demo entries for Command Board / pitch. */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STORE_PATH = path.join(__dirname, '../data/hub-store.json');

const DEMOS = [
  {
    id: 'demo_cuckoo_monsoon',
    transcript:
      'When the Indian Cuckoo (kuyil) calls before dawn, the monsoon arrives in seven to ten days.',
    elder_name: 'Rajan',
    tribe: 'Paniya',
    village: 'Wayanad',
    district: 'Wayanad',
    knowledge_type: 'C',
    consent_level: 'OPEN',
    species_mentioned: 'Cuculus micropterus',
    lat: 11.6854,
    lng: 76.132,
    geohash: 'tdr7h2',
    prediction: {
      trigger_event: 'Indian_Cuckoo_first_call',
      trigger_time: 'pre_dawn',
      outcome_event: 'monsoon_onset',
      time_window_days: [7, 10],
      first_observed: '1962',
    },
  },
  {
    id: 'demo_pala_rain',
    transcript:
      'When the Pala tree (Bartaea longifolia) is in full flower, the first heavy rain comes within two to three weeks.',
    elder_name: 'Elder (WYD_017)',
    tribe: 'Kuruma',
    village: 'Pulpalli',
    district: 'Wayanad',
    knowledge_type: 'C',
    consent_level: 'OPEN',
    species_mentioned: 'Bartaea longifolia',
    lat: 11.702,
    lng: 76.081,
    geohash: 'tdr7h0',
    prediction: {
      trigger_event: 'Pala_tree_full_bloom',
      trigger_time: 'daytime',
      outcome_event: 'first_heavy_rain',
      time_window_days: [14, 21],
      first_observed: '~1970',
    },
  },
  {
    id: 'demo_cheevakka_fever',
    transcript:
      'The inner bark of Cheevakka is scraped, pounded with wild turmeric, and pasted on the chest for three nights when fever comes with chills.',
    elder_name: 'Elder (BRH_004)',
    tribe: 'Soliga',
    village: 'BR Hills',
    district: 'Chamarajanagar',
    knowledge_type: 'B',
    consent_level: 'COMMUNITY_ONLY',
    species_mentioned: 'Wrightia tinctoria',
    lat: 11.97,
    lng: 77.14,
    geohash: 'tdnk9p',
  },
];

const store = JSON.parse(fs.readFileSync(STORE_PATH, 'utf8'));
const now = new Date().toISOString();
store.corpus = DEMOS.map((d) => ({
  ...d,
  source: 'demo-seed',
  received_at: now,
  validation_status: 'PENDING',
}));
store.updated_at = now;
fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2) + '\n');
console.log('Seeded', DEMOS.length, 'demo corpus entries into hub-store.json');
