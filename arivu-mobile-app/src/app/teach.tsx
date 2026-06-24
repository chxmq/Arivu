import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ConsentSelector from '@/components/ConsentSelector';
import RecordButton from '@/components/RecordButton';
import { Colors } from '@/constants/colors';
import {
  ConsentLevel,
  KnowledgeEntry,
  KnowledgeType,
  PredictionSchema,
} from '@/types';
import { encodeGeohash } from '@/utils/geohash';
import { TEACH_DEMOS } from '@/constants/teach-demos';
import { saveEntry } from '@/utils/storage';
import { syncEntryToHub } from '@/utils/sync';

const KNOWLEDGE_DESCRIPTIONS: Record<KnowledgeType, string> = {
  A: 'Names and identifies a species',
  B: 'Describes a plant or animal use',
  C: 'Links a natural signal to an outcome (testable)',
};

const CONSENT_DESCRIPTIONS: Record<ConsentLevel, string> = {
  OPEN: 'Anyone may access this record',
  COMMUNITY_ONLY: 'BMC members and ZSI only',
  EMBARGOED: 'Elder community approval required before release',
};

function FieldLabel({ children }: { children: string }) {
  return <Text style={styles.fieldLabel}>{children}</Text>;
}

function FieldInput({
  value,
  onChangeText,
  placeholder,
  multiline,
  error,
}: {
  value: string;
  onChangeText: (t: string) => void;
  placeholder: string;
  multiline?: boolean;
  error?: boolean;
}) {
  return (
    <>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={Colors.grey}
        multiline={multiline}
        style={[
          styles.input,
          multiline && styles.inputMultiline,
          error && styles.inputError,
        ]}
      />
    </>
  );
}

export default function TeachScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [elderName, setElderName] = useState('');
  const [tribe, setTribe] = useState('');
  const [village, setVillage] = useState('');
  const [district, setDistrict] = useState('');
  const [dialect, setDialect] = useState('');
  const [consentGivenBy, setConsentGivenBy] = useState('');
  const [interpreterId, setInterpreterId] = useState('');
  const [knowledgeType, setKnowledgeType] = useState<KnowledgeType>('A');
  const [consentLevel, setConsentLevel] = useState<ConsentLevel>('OPEN');
  const [audioUri, setAudioUri] = useState('');
  const [audioDuration, setAudioDuration] = useState(0);
  const [transcript, setTranscript] = useState('');
  const [speciesMentioned, setSpeciesMentioned] = useState('');
  const [season, setSeason] = useState('');
  const [geohash, setGeohash] = useState('');
  const [latitude, setLatitude] = useState(0);
  const [longitude, setLongitude] = useState(0);
  // Type C — PADHAVI prediction schema fields.
  const [triggerEvent, setTriggerEvent] = useState('');
  const [triggerTime, setTriggerTime] = useState('');
  const [outcomeEvent, setOutcomeEvent] = useState('');
  const [windowLow, setWindowLow] = useState('');
  const [windowHigh, setWindowHigh] = useState('');
  const [firstObserved, setFirstObserved] = useState('');
  const [showStructured, setShowStructured] = useState(false);
  const [errors, setErrors] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);

  const buildPrediction = (): PredictionSchema => ({
    trigger_event: triggerEvent.trim(),
    trigger_time: triggerTime.trim(),
    outcome_event: outcomeEvent.trim(),
    time_window_days: [
      parseInt(windowLow, 10) || 0,
      parseInt(windowHigh, 10) || 0,
    ],
    first_observed: firstObserved.trim(),
  });

  const applyDemo = (demoId: string) => {
    const demo = TEACH_DEMOS.find((d) => d.id === demoId);
    if (!demo) return;
    setElderName(demo.elder_name);
    setTribe(demo.tribe);
    setVillage(demo.village);
    setDistrict(demo.district);
    setDialect(demo.dialect);
    setKnowledgeType(demo.knowledge_type);
    setConsentLevel(demo.consent_level);
    setTranscript(demo.transcript);
    setSpeciesMentioned(demo.species_mentioned);
    setSeason(demo.season);
    setGeohash(demo.geohash);
    setLatitude(demo.latitude);
    setLongitude(demo.longitude);
    setConsentGivenBy('');
    setInterpreterId('');
    setAudioUri('');
    setAudioDuration(0);
    setErrors({});
    if (demo.prediction) {
      setTriggerEvent(demo.prediction.trigger_event);
      setTriggerTime(demo.prediction.trigger_time);
      setOutcomeEvent(demo.prediction.outcome_event);
      setWindowLow(String(demo.prediction.time_window_days[0]));
      setWindowHigh(String(demo.prediction.time_window_days[1]));
      setFirstObserved(demo.prediction.first_observed);
    } else {
      setTriggerEvent('');
      setTriggerTime('');
      setOutcomeEvent('');
      setWindowLow('');
      setWindowHigh('');
      setFirstObserved('');
    }
    if (demo.validateHint) {
      Alert.alert('Demo loaded', demo.validateHint);
    }
  };

  const captureGPS = async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Location access is required to capture grove GPS.');
      return;
    }
    const loc = await Location.getCurrentPositionAsync({});
    const { latitude: lat, longitude: lng } = loc.coords;
    setLatitude(lat);
    setLongitude(lng);
    setGeohash(encodeGeohash(lat, lng, 7));
  };

  const handleSave = async () => {
    const newErrors: Record<string, boolean> = {};
    if (!elderName.trim()) newErrors.elder_name = true;
    if (!tribe.trim()) newErrors.tribe = true;
    if (!village.trim()) newErrors.village = true;
    if (!transcript.trim()) newErrors.transcript = true;
    if (knowledgeType === 'C') {
      if (!triggerEvent.trim()) newErrors.trigger_event = true;
      if (!outcomeEvent.trim()) newErrors.outcome_event = true;
      if (!windowLow.trim() || !windowHigh.trim()) newErrors.time_window = true;
    }

    setErrors(newErrors);
    if (Object.keys(newErrors).length > 0) return;

    setSaving(true);
    const entry: KnowledgeEntry = {
      id: Math.random().toString(36).slice(2) + Date.now(),
      created_at: new Date().toISOString(),
      elder_name: elderName.trim(),
      tribe: tribe.trim(),
      village: village.trim(),
      district: district.trim(),
      geohash,
      latitude,
      longitude,
      consent_level: consentLevel,
      consent_given_by: consentGivenBy.trim(),
      audio_uri: audioUri,
      audio_duration_seconds: audioDuration,
      dialect: dialect.trim(),
      transcript: transcript.trim(),
      interpreter_id: interpreterId.trim(),
      knowledge_type: knowledgeType,
      species_mentioned: speciesMentioned.trim(),
      season: season.trim(),
      validation_status: 'PENDING',
      review_confirmed: false,
      reviewer_id: '',
      review_notes: '',
      flagged: false,
      ...(knowledgeType === 'C' ? { prediction: buildPrediction() } : {}),
    };

    try {
      await saveEntry(entry);
      const { ok: synced, audioUploaded } = await syncEntryToHub(entry);
      let msg = synced
        ? 'Entry saved and synced to the Arivu Hub. It will appear on the website map.'
        : 'Entry saved on this device. Hub was offline — open the site later to sync.';
      if (synced && entry.audio_uri) {
        msg += audioUploaded
          ? ' Elder speech is playable on the website.'
          : ' Speech stayed on this phone (audio upload failed).';
      }
      Alert.alert('Success', msg, [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch {
      Alert.alert('Error', 'Failed to save entry. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backArrow}>←</Text>
        </Pressable>
        <View style={styles.headerText}>
          <Text style={styles.headerTitle}>TEACH</Text>
          <Text style={styles.headerSubtitle}>record an elder</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.demoHeading}>DEMO RECORDINGS</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.demoRow}
        >
          {TEACH_DEMOS.map((demo) => (
            <Pressable
              key={demo.id}
              style={styles.demoChip}
              onPress={() => applyDemo(demo.id)}
            >
              <Text style={styles.demoChipLabel}>{demo.label}</Text>
              <Text style={styles.demoChipSub}>{demo.subtitle}</Text>
            </Pressable>
          ))}
        </ScrollView>

        <Text style={styles.sectionLabel}>SESSION DETAILS</Text>

        <FieldLabel>Elder Name</FieldLabel>
        <FieldInput
          value={elderName}
          onChangeText={setElderName}
          placeholder="Elder's name"
          error={errors.elder_name}
        />
        {errors.elder_name && (
          <Text style={styles.errorText}>Elder name is required</Text>
        )}

        <FieldLabel>Tribe</FieldLabel>
        <FieldInput
          value={tribe}
          onChangeText={setTribe}
          placeholder="e.g. Paniya, Soliga, Kurumba"
          error={errors.tribe}
        />
        {errors.tribe && (
          <Text style={styles.errorText}>Tribe is required</Text>
        )}

        <FieldLabel>Village</FieldLabel>
        <FieldInput
          value={village}
          onChangeText={setVillage}
          placeholder="Village name"
          error={errors.village}
        />
        {errors.village && (
          <Text style={styles.errorText}>Village is required</Text>
        )}

        <FieldLabel>District</FieldLabel>
        <FieldInput
          value={district}
          onChangeText={setDistrict}
          placeholder="e.g. Wayanad, Chamarajanagar"
        />

        <FieldLabel>Dialect</FieldLabel>
        <FieldInput
          value={dialect}
          onChangeText={setDialect}
          placeholder="e.g. Paniya dialect"
        />

        <FieldLabel>BMC Representative</FieldLabel>
        <FieldInput
          value={consentGivenBy}
          onChangeText={setConsentGivenBy}
          placeholder="Consent given by"
        />

        <FieldLabel>Interpreter Name</FieldLabel>
        <FieldInput
          value={interpreterId}
          onChangeText={setInterpreterId}
          placeholder="Interpreter present"
        />

        <Text style={[styles.sectionLabel, styles.sectionGap]}>KNOWLEDGE TYPE</Text>
        <View style={styles.toggleRow}>
          {(['A', 'B', 'C'] as KnowledgeType[]).map((type) => (
            <Pressable
              key={type}
              onPress={() => setKnowledgeType(type)}
              style={[
                styles.typeToggle,
                knowledgeType === type
                  ? styles.typeToggleSelected
                  : styles.typeToggleUnselected,
              ]}
            >
              <Text
                style={[
                  styles.typeToggleText,
                  knowledgeType === type
                    ? styles.typeToggleTextSelected
                    : styles.typeToggleTextUnselected,
                ]}
              >
                {type} —{' '}
                {type === 'A'
                  ? 'Identification'
                  : type === 'B'
                    ? 'Use'
                    : 'Prediction'}
              </Text>
            </Pressable>
          ))}
        </View>
        <Text style={styles.hint}>{KNOWLEDGE_DESCRIPTIONS[knowledgeType]}</Text>

        {knowledgeType === 'C' && (
          <View style={styles.predictionBlock}>
            <Text style={styles.predictionHeading}>
              PADHAVI · PREDICTION SCHEMA
            </Text>
            <Text style={styles.predictionIntro}>
              Turn the elder&apos;s claim into a testable hypothesis. KAALAM
              will cross-check it against eBird + IMD data.
            </Text>

            <FieldLabel>Trigger event</FieldLabel>
            <FieldInput
              value={triggerEvent}
              onChangeText={setTriggerEvent}
              placeholder="e.g. Indian_Cuckoo_first_call"
              error={errors.trigger_event}
            />
            {errors.trigger_event && (
              <Text style={styles.errorText}>Trigger event is required</Text>
            )}

            <FieldLabel>Trigger time</FieldLabel>
            <FieldInput
              value={triggerTime}
              onChangeText={setTriggerTime}
              placeholder="e.g. pre_dawn"
            />

            <FieldLabel>Outcome event</FieldLabel>
            <FieldInput
              value={outcomeEvent}
              onChangeText={setOutcomeEvent}
              placeholder="e.g. monsoon_onset"
              error={errors.outcome_event}
            />
            {errors.outcome_event && (
              <Text style={styles.errorText}>Outcome event is required</Text>
            )}

            <FieldLabel>Time window (days)</FieldLabel>
            <View style={styles.windowRow}>
              <TextInput
                value={windowLow}
                onChangeText={setWindowLow}
                placeholder="min"
                placeholderTextColor={Colors.grey}
                keyboardType="number-pad"
                style={[styles.input, styles.windowInput]}
              />
              <Text style={styles.windowDash}>to</Text>
              <TextInput
                value={windowHigh}
                onChangeText={setWindowHigh}
                placeholder="max"
                placeholderTextColor={Colors.grey}
                keyboardType="number-pad"
                style={[styles.input, styles.windowInput]}
              />
            </View>
            {errors.time_window && (
              <Text style={styles.errorText}>Time window is required</Text>
            )}

            <FieldLabel>First observed</FieldLabel>
            <FieldInput
              value={firstObserved}
              onChangeText={setFirstObserved}
              placeholder="e.g. ~1962"
            />

            <Pressable
              style={styles.structureButton}
              onPress={() => setShowStructured((s) => !s)}
            >
              <Text style={styles.structureButtonText}>
                {showStructured ? 'Hide structured JSON' : 'Structure it →'}
              </Text>
            </Pressable>

            {showStructured && (
              <View style={styles.jsonBox}>
                <Text style={styles.jsonText}>
                  {JSON.stringify(
                    {
                      knowledge_type: 'TYPE_C_PREDICTION',
                      ...buildPrediction(),
                      location_geohash: geohash || 'pending_gps',
                      consent_label: consentLevel,
                      validation_status: 'pending',
                    },
                    null,
                    2
                  )}
                </Text>
              </View>
            )}
          </View>
        )}

        <Text style={[styles.sectionLabel, styles.sectionGap]}>CONSENT LEVEL</Text>
        <ConsentSelector value={consentLevel} onChange={setConsentLevel} />
        <Text style={styles.hint}>{CONSENT_DESCRIPTIONS[consentLevel]}</Text>

        <Text style={[styles.sectionLabel, styles.sectionGap]}>
          RECORD ELDER&apos;S VOICE (optional)
        </Text>
        <RecordButton
          onRecorded={(uri, dur) => {
            setAudioUri(uri);
            setAudioDuration(dur);
            setErrors((e) => ({ ...e, audio_uri: false }));
          }}
        />

        <Text style={[styles.sectionLabel, styles.sectionGap]}>
          INTERPRETER&apos;S TRANSCRIPTION
        </Text>
        <Text style={styles.transcriptHint}>
          Interpreter types the meaning in Malayalam or Kannada. This will be used
          to train the Arivu transcription model.
        </Text>
        <FieldInput
          value={transcript}
          onChangeText={setTranscript}
          placeholder="Type the translated meaning here..."
          multiline
          error={errors.transcript}
        />
        {errors.transcript && (
          <Text style={styles.errorText}>Transcription is required</Text>
        )}

        <Text style={[styles.sectionLabel, styles.sectionGap]}>OPTIONAL DETAILS</Text>
        <FieldLabel>Species Mentioned</FieldLabel>
        <FieldInput
          value={speciesMentioned}
          onChangeText={setSpeciesMentioned}
          placeholder="Scientific or local name"
        />
        <FieldLabel>Season</FieldLabel>
        <FieldInput
          value={season}
          onChangeText={setSeason}
          placeholder="e.g. Southwest Monsoon, Pre-kharif"
        />

        <Text style={[styles.sectionLabel, styles.sectionGap]}>GROVE LOCATION</Text>
        <View style={styles.locationRow}>
          <Text style={styles.geohashText}>
            {geohash ? `Geohash: ${geohash}` : 'Not yet captured'}
          </Text>
          <Pressable style={styles.gpsButton} onPress={captureGPS}>
            <Text style={styles.gpsButtonText}>📍 Capture GPS</Text>
          </Pressable>
        </View>
        {geohash ? (
          <Text style={styles.coordsText}>
            Geohash: {geohash} · Lat: {latitude.toFixed(1)} · Lng:{' '}
            {longitude.toFixed(1)}
          </Text>
        ) : null}

        <Pressable
          style={[styles.saveButton, saving && { opacity: 0.7 }]}
          onPress={handleSave}
          disabled={saving}
        >
          <Text style={styles.saveButtonText}>SAVE ENTRY</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    backgroundColor: Colors.teachGreen,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  backBtn: {
    padding: 8,
    marginRight: 8,
  },
  backArrow: {
    color: Colors.textOnDark,
    fontSize: 24,
  },
  headerText: {
    flex: 1,
  },
  headerTitle: {
    color: Colors.textOnDark,
    fontSize: 22,
    fontWeight: '700',
  },
  headerSubtitle: {
    color: Colors.textOnDark,
    fontSize: 12,
    opacity: 0.85,
    marginTop: 2,
  },
  content: {
    padding: 20,
    paddingBottom: 40,
  },
  demoHeading: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    color: Colors.grey,
    marginBottom: 8,
  },
  demoRow: {
    gap: 10,
    paddingBottom: 16,
  },
  demoChip: {
    backgroundColor: Colors.askGold,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    minWidth: 148,
    maxWidth: 170,
  },
  demoChipLabel: {
    color: Colors.headerDark,
    fontSize: 13,
    fontWeight: '700',
  },
  demoChipSub: {
    color: Colors.headerDark,
    fontSize: 10,
    marginTop: 4,
    opacity: 0.85,
  },
  predictionBlock: {
    marginTop: 16,
    backgroundColor: Colors.textOnDark,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.headerDark,
    padding: 14,
  },
  predictionHeading: {
    color: Colors.headerDark,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.5,
    marginBottom: 4,
  },
  predictionIntro: {
    fontSize: 12,
    color: Colors.grey,
    fontStyle: 'italic',
    marginBottom: 12,
  },
  windowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  windowInput: {
    flex: 1,
  },
  windowDash: {
    color: Colors.grey,
    fontSize: 13,
  },
  structureButton: {
    backgroundColor: Colors.teachGreen,
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  structureButtonText: {
    color: Colors.textOnDark,
    fontSize: 14,
    fontWeight: '700',
  },
  jsonBox: {
    backgroundColor: Colors.headerDark,
    borderRadius: 8,
    padding: 12,
    marginTop: 12,
  },
  jsonText: {
    color: '#A8E6CF',
    fontSize: 12,
    fontFamily: Platform.select({ ios: 'Courier', default: 'monospace' }),
    lineHeight: 18,
  },
  sectionLabel: {
    color: Colors.teachGreen,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 2,
    marginBottom: 8,
  },
  sectionGap: {
    marginTop: 24,
  },
  fieldLabel: {
    color: Colors.teachGreen,
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 4,
  },
  input: {
    backgroundColor: Colors.textOnDark,
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    fontSize: 15,
    color: Colors.textOnLight,
  },
  inputMultiline: {
    minHeight: 120,
    textAlignVertical: 'top',
  },
  inputError: {
    borderWidth: 1,
    borderColor: Colors.reviewRed,
  },
  errorText: {
    color: Colors.reviewRed,
    fontSize: 12,
    marginTop: -8,
    marginBottom: 8,
  },
  toggleRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  typeToggle: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
  },
  typeToggleSelected: {
    backgroundColor: Colors.headerDark,
    borderColor: Colors.headerDark,
  },
  typeToggleUnselected: {
    backgroundColor: Colors.textOnDark,
    borderColor: Colors.headerDark,
  },
  typeToggleText: {
    fontSize: 12,
    fontWeight: '600',
  },
  typeToggleTextSelected: {
    color: Colors.textOnDark,
  },
  typeToggleTextUnselected: {
    color: Colors.headerDark,
  },
  hint: {
    fontSize: 12,
    color: Colors.grey,
    fontStyle: 'italic',
    marginTop: 8,
  },
  transcriptHint: {
    fontSize: 12,
    color: Colors.grey,
    fontStyle: 'italic',
    marginBottom: 8,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.textOnDark,
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
  },
  geohashText: {
    flex: 1,
    fontSize: 13,
    color: Colors.textOnLight,
  },
  gpsButton: {
    backgroundColor: Colors.teachGreen,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  gpsButtonText: {
    color: Colors.textOnDark,
    fontSize: 13,
    fontWeight: '600',
  },
  coordsText: {
    fontSize: 12,
    color: Colors.grey,
    marginBottom: 12,
  },
  saveButton: {
    backgroundColor: Colors.headerDark,
    height: 56,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 24,
  },
  saveButtonText: {
    color: Colors.textOnDark,
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 1,
  },
});
