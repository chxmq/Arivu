import Constants from 'expo-constants';
import { Platform } from 'react-native';

/** Arivu Hub — sync target for TEACH entries (website data server). */
function resolveHubUrl(): string {
  const fromEnv = process.env.EXPO_PUBLIC_HUB_URL;
  if (fromEnv) return fromEnv.replace(/\/$/, '');

  // Expo Go loads the bundle from your Mac over LAN — use that same IP for the hub.
  const hostUri =
    Constants.expoConfig?.hostUri ??
    (Constants as { manifest?: { debuggerHost?: string } }).manifest?.debuggerHost;

  if (hostUri && Platform.OS !== 'web') {
    const host = hostUri.replace(/^https?:\/\//, '').split(':')[0];
    if (host && host !== 'localhost' && host !== '127.0.0.1') {
      return `http://${host}:8787`;
    }
  }

  return 'http://localhost:8787';
}

export const HUB_URL = resolveHubUrl();
