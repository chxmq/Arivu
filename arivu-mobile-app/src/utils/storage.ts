import AsyncStorage from '@react-native-async-storage/async-storage';
import type { KnowledgeEntry } from '@/types';

const KEY = '@arivu/entries';

export async function getAllEntries(): Promise<KnowledgeEntry[]> {
  const raw = await AsyncStorage.getItem(KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as KnowledgeEntry[];
  } catch {
    return [];
  }
}

export async function saveEntry(entry: KnowledgeEntry): Promise<void> {
  const all = await getAllEntries();
  all.unshift(entry);
  await AsyncStorage.setItem(KEY, JSON.stringify(all));
}

export async function updateEntry(
  id: string,
  patch: Partial<KnowledgeEntry>
): Promise<KnowledgeEntry | null> {
  const all = await getAllEntries();
  const idx = all.findIndex((e) => e.id === id);
  if (idx < 0) return null;
  all[idx] = { ...all[idx], ...patch };
  await AsyncStorage.setItem(KEY, JSON.stringify(all));
  return all[idx];
}

/** Wipe all TEACH entries on this device (fresh start). */
export async function clearAllEntries(): Promise<void> {
  await AsyncStorage.removeItem(KEY);
}
