import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '@/constants/colors';
import { HUB_URL } from '@/constants/hub';
import { encodeGeohash } from '@/utils/geohash';
import { fetchSentinels, stampSentinelLocation } from '@/utils/sync';

type SentinelRow = {
  id: string;
  name: string;
  location?: string;
  lat?: number | null;
  lng?: number | null;
  location_stamped_at?: string | null;
};

export default function DeployScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [sentinels, setSentinels] = useState<SentinelRow[]>([]);
  const [selectedId, setSelectedId] = useState('grove_1');
  const [workerName, setWorkerName] = useState('');
  const [placeName, setPlaceName] = useState('');
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [geohash, setGeohash] = useState('');
  const [loading, setLoading] = useState(true);
  const [stamping, setStamping] = useState(false);

  const loadSentinels = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await fetchSentinels();
      setSentinels(rows);
      const live = rows.find((s) => s.id === 'grove_1') || rows.find((s) => s.id.startsWith('grove')) || rows[0];
      if (live) setSelectedId(live.id);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSentinels();
  }, [loadSentinels]);

  const captureLocation = async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Location access is required to stamp where the box is deployed.');
      return;
    }
    const loc = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.High,
    });
    const { latitude: lat, longitude: lng } = loc.coords;
    setLatitude(lat);
    setLongitude(lng);
    setGeohash(encodeGeohash(lat, lng, 7));
  };

  const handleStamp = async () => {
    if (!workerName.trim()) {
      Alert.alert('Your name', 'Enter your name so the dashboard shows who stamped this location.');
      return;
    }
    if (latitude == null || longitude == null) {
      Alert.alert('Stamp location first', 'Tap "Stamp location" while standing at the deployment site.');
      return;
    }

    setStamping(true);
    try {
      const ok = await stampSentinelLocation(selectedId, {
        lat: latitude,
        lng: longitude,
        geohash,
        stamped_by: workerName.trim(),
        location: placeName.trim() || undefined,
      });
      if (!ok) {
        Alert.alert('Hub offline', `Could not reach the hub at ${HUB_URL}. Check WiFi and that make is running.`);
        return;
      }
      Alert.alert(
        'Location stamped',
        'The command center map will show this box at your current coordinates.',
        [{ text: 'OK', onPress: () => router.back() }]
      );
    } finally {
      setStamping(false);
    }
  };

  const selected = sentinels.find((s) => s.id === selectedId);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>← Back</Text>
        </Pressable>
        <Text style={styles.title}>DEPLOY</Text>
        <Text style={styles.subtitle}>stamp sentinel location on the map</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Text style={styles.help}>
          Stand at the grove where you mount the Kaavu box, then stamp your phone&apos;s coordinates.
          The web command center map updates immediately.
        </Text>

        {loading ? (
          <ActivityIndicator color={Colors.headerDark} style={{ marginVertical: 24 }} />
        ) : (
          <View style={styles.section}>
            <Text style={styles.label}>Sentinel box</Text>
            {sentinels.length ? (
              sentinels.map((s) => (
                <Pressable
                  key={s.id}
                  style={[styles.option, selectedId === s.id && styles.optionActive]}
                  onPress={() => setSelectedId(s.id)}
                >
                  <Text style={styles.optionTitle}>{s.name}</Text>
                  <Text style={styles.optionMeta}>{s.id}{s.location_stamped_at ? ' · stamped' : ' · not stamped'}</Text>
                </Pressable>
              ))
            ) : (
              <Text style={styles.muted}>No sentinels on hub — will register grove_1 on stamp.</Text>
            )}
          </View>
        )}

        <View style={styles.section}>
          <Text style={styles.label}>Your name (BMC / field worker)</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. Rajesh K."
            placeholderTextColor={Colors.grey}
            value={workerName}
            onChangeText={setWorkerName}
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>Grove / place name (optional)</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. Cheenkanni kaavu, Meppadi"
            placeholderTextColor={Colors.grey}
            value={placeName}
            onChangeText={setPlaceName}
          />
        </View>

        <Pressable style={styles.stampBtn} onPress={captureLocation}>
          <Text style={styles.stampBtnText}>📍 Stamp location</Text>
          <Text style={styles.stampHint}>Uses this phone&apos;s GPS at the deployment spot</Text>
        </Pressable>

        {latitude != null && longitude != null ? (
          <View style={styles.coordsBox}>
            <Text style={styles.coordsTitle}>Ready to send</Text>
            <Text style={styles.coords}>{latitude.toFixed(5)}°N, {longitude.toFixed(5)}°E</Text>
            <Text style={styles.coordsMeta}>geohash {geohash}</Text>
          </View>
        ) : (
          <Text style={styles.muted}>No coordinates captured yet.</Text>
        )}

        {selected?.location_stamped_at ? (
          <Text style={styles.prevStamp}>
            Previously stamped: {selected.lat?.toFixed(4)}, {selected.lng?.toFixed(4)}
          </Text>
        ) : null}

        <Pressable
          style={[styles.submitBtn, stamping && { opacity: 0.6 }]}
          onPress={handleStamp}
          disabled={stamping}
        >
          <Text style={styles.submitText}>{stamping ? 'Sending…' : 'Update map on command center'}</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    backgroundColor: Colors.headerDark,
    paddingBottom: 16,
    paddingHorizontal: 20,
  },
  backBtn: { alignSelf: 'flex-start', paddingVertical: 8 },
  backText: { color: Colors.textOnDark, fontSize: 14 },
  title: {
    color: Colors.textOnDark,
    fontSize: 24,
    fontWeight: '700',
    letterSpacing: 2,
    textAlign: 'center',
  },
  subtitle: {
    color: Colors.textOnDark,
    fontSize: 11,
    fontStyle: 'italic',
    textAlign: 'center',
    marginTop: 4,
    opacity: 0.9,
  },
  scroll: { padding: 20, paddingBottom: 40 },
  help: {
    fontSize: 14,
    color: Colors.grey,
    lineHeight: 20,
    marginBottom: 20,
  },
  section: { marginBottom: 18 },
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.headerDark,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  input: {
    borderWidth: 1,
    borderColor: Colors.borderGrey,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    backgroundColor: Colors.textOnDark,
  },
  option: {
    borderWidth: 1,
    borderColor: Colors.borderGrey,
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    backgroundColor: Colors.textOnDark,
  },
  optionActive: {
    borderColor: Colors.teachGreen,
    borderWidth: 2,
  },
  optionTitle: { fontSize: 15, fontWeight: '600', color: Colors.headerDark },
  optionMeta: { fontSize: 12, color: Colors.grey, marginTop: 2 },
  stampBtn: {
    backgroundColor: Colors.teachGreen,
    borderRadius: 12,
    paddingVertical: 18,
    paddingHorizontal: 16,
    alignItems: 'center',
    marginBottom: 16,
  },
  stampBtnText: { fontSize: 18, fontWeight: '700', color: Colors.textOnDark },
  stampHint: { fontSize: 12, color: Colors.textOnDark, marginTop: 6, opacity: 0.85 },
  coordsBox: {
    backgroundColor: Colors.textOnDark,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.borderGrey,
    padding: 14,
    marginBottom: 12,
  },
  coordsTitle: { fontSize: 12, fontWeight: '600', color: Colors.grey, marginBottom: 4 },
  coords: { fontSize: 16, fontWeight: '600', color: Colors.headerDark, fontVariant: ['tabular-nums'] },
  coordsMeta: { fontSize: 12, color: Colors.grey, marginTop: 4 },
  muted: { fontSize: 13, color: Colors.grey, marginBottom: 12 },
  prevStamp: { fontSize: 12, color: Colors.grey, fontStyle: 'italic', marginBottom: 16 },
  submitBtn: {
    backgroundColor: Colors.headerDark,
    borderRadius: 10,
    paddingVertical: 16,
    alignItems: 'center',
  },
  submitText: { color: Colors.textOnDark, fontSize: 16, fontWeight: '600' },
});
