import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { HUB_URL } from './hub';

export type CommandSection = {
  id: string;
  name: string;
  description: string;
};

/** Command Board sections — mirrors the website dashboard. */
export const COMMAND_SECTIONS: CommandSection[] = [
  {
    id: 'overview',
    name: 'Overview',
    description: 'Live stats, mini map, recent Saakshi syncs.',
  },
  {
    id: 'system',
    name: 'System',
    description: 'Pipeline (Saakshi → Padhavi → Kaalam) and Type A/B/C knowledge.',
  },
  {
    id: 'dataset',
    name: 'Dataset',
    description: 'Structured table, tribe chart, CSV export.',
  },
  {
    id: 'corpus',
    name: 'Corpus',
    description: 'Manage elder entries — validation, consent, notes.',
  },
  {
    id: 'sentinels',
    name: 'Sentinels',
    description: 'Kaavu boxes — status, incharge, register new units.',
  },
  {
    id: 'feeds',
    name: 'Live feeds',
    description: 'Open-Meteo weather + GBIF species per sentinel.',
  },
  {
    id: 'map',
    name: 'Map',
    description: '2D / 3D terrain map of corpus and sentinels.',
  },
  {
    id: 'activity',
    name: 'Activity',
    description: 'System log of syncs and changes.',
  },
];

export const ASSISTANT_PROMPTS = [
  'How many corpus entries?',
  'Open sentinels',
  'What is Type C?',
  'How do I export CSV?',
  'Show the map',
];

function resolveCommandBoardHost(): string {
  const fromEnv = process.env.EXPO_PUBLIC_COMMAND_URL;
  if (fromEnv) return fromEnv.replace(/\/$/, '');

  const hostUri =
    Constants.expoConfig?.hostUri ??
    (Constants as { manifest?: { debuggerHost?: string } }).manifest?.debuggerHost;

  if (hostUri && Platform.OS !== 'web') {
    const host = hostUri.replace(/^https?:\/\//, '').split(':')[0];
    if (host && host !== 'localhost' && host !== '127.0.0.1') {
      return `http://${host}:8765`;
    }
  }

  const hubHost = HUB_URL.replace(/^https?:\/\//, '').replace(':8787', '');
  return `http://${hubHost}:8765`;
}

export const COMMAND_BOARD_URL = resolveCommandBoardHost();
