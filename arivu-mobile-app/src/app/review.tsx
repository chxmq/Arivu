import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import AudioPlayer from '@/components/AudioPlayer';
import { Colors } from '@/constants/colors';
import { ConsentLevel, KnowledgeEntry } from '@/types';
import { getAllEntries, updateEntry } from '@/utils/storage';

const SCREEN_WIDTH = Dimensions.get('window').width;

function consentColor(level: ConsentLevel): string {
  switch (level) {
    case 'OPEN':
      return Colors.teachGreen;
    case 'COMMUNITY_ONLY':
      return Colors.askGold;
    default:
      return Colors.reviewRed;
  }
}

function consentLabel(level: ConsentLevel): string {
  switch (level) {
    case 'OPEN':
      return 'OPEN';
    case 'COMMUNITY_ONLY':
      return 'COMMUNITY';
    default:
      return 'EMBARGOED';
  }
}

function EmptyCheckmark() {
  return (
    <Svg width={64} height={64} viewBox="0 0 64 64">
      <Path
        d="M16 32 L28 44 L48 20"
        stroke={Colors.teachGreen}
        strokeWidth={4}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

type ReviewCardProps = {
  entry: KnowledgeEntry;
  onConfirm: (id: string, notes: string, reviewerId: string) => void;
  onFlag: (id: string) => void;
  onRemove: (id: string) => void;
};

function ReviewCard({ entry, onConfirm, onFlag, onRemove }: ReviewCardProps) {
  const [notes, setNotes] = useState('');
  const [reviewerId, setReviewerId] = useState('');
  const translateX = useRef(new Animated.Value(0)).current;

  const slideOut = (callback: () => void) => {
    Animated.timing(translateX, {
      toValue: -SCREEN_WIDTH,
      duration: 300,
      useNativeDriver: true,
    }).start(() => {
      onRemove(entry.id);
      callback();
    });
  };

  return (
    <Animated.View
      style={[styles.card, { transform: [{ translateX }] }]}
    >
      <Text style={styles.elderName}>{entry.elder_name}</Text>
      <Text style={styles.tribe}>{entry.tribe}</Text>
      <Text style={styles.location}>
        {entry.village}, {entry.district}
      </Text>

      <Text style={styles.sectionLabel}>ORIGINAL RECORDING</Text>
      {entry.audio_uri ? (
        <AudioPlayer
          uri={entry.audio_uri}
          duration={entry.audio_duration_seconds}
          compact={false}
          showWaveform
        />
      ) : (
        <Text style={styles.noAudioText}>No audio recorded for this entry.</Text>
      )}

      <Text style={[styles.sectionLabel, { marginTop: 16 }]}>
        INTERPRETER&apos;S TRANSCRIPTION
      </Text>
      <View style={styles.transcriptBox}>
        <Text style={styles.transcriptText}>{entry.transcript}</Text>
      </View>

      <View style={styles.pills}>
        <View style={styles.typePill}>
          <Text style={styles.typePillText}>TYPE {entry.knowledge_type}</Text>
        </View>
        <View
          style={[
            styles.consentPill,
            { backgroundColor: consentColor(entry.consent_level) },
          ]}
        >
          <Text style={styles.consentPillText}>
            {consentLabel(entry.consent_level)}
          </Text>
        </View>
        <View style={styles.dialectPill}>
          <Text style={styles.dialectPillText}>
            {entry.dialect || 'Unknown dialect'}
          </Text>
        </View>
      </View>

      <Text style={[styles.sectionLabel, { marginTop: 16 }]}>
        REVIEWER NOTES (optional)
      </Text>
      <TextInput
        value={notes}
        onChangeText={setNotes}
        placeholder="Add correction or clarification..."
        placeholderTextColor={Colors.grey}
        multiline
        style={styles.notesInput}
      />
      <TextInput
        value={reviewerId}
        onChangeText={setReviewerId}
        placeholder="Your name / BMC ID"
        placeholderTextColor={Colors.grey}
        style={styles.reviewerInput}
      />

      <View style={styles.actions}>
        <Pressable
          style={styles.flagButton}
          onPress={() => slideOut(() => onFlag(entry.id))}
        >
          <Text style={styles.flagText}>✗ FLAG ISSUE</Text>
        </Pressable>
        <Pressable
          style={styles.confirmButton}
          onPress={() =>
            slideOut(() => onConfirm(entry.id, notes, reviewerId))
          }
        >
          <Text style={styles.confirmText}>✓ CONFIRM MAPPING</Text>
        </Pressable>
      </View>
    </Animated.View>
  );
}

export default function ReviewScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [entries, setEntries] = useState<KnowledgeEntry[]>([]);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const loadEntries = useCallback(async () => {
    const all = await getAllEntries();
    setEntries(
      all.filter((e) => !e.review_confirmed && !e.flagged)
    );
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadEntries();
    }, [loadEntries])
  );

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 2500);
  };

  const handleConfirm = async (
    id: string,
    notes: string,
    reviewerId: string
  ) => {
    // Human review confirms the interpreter's mapping is faithful. It does
    // NOT scientifically validate a prediction — only KAALAM can move a Type C
    // entry to VALIDATED/BROKEN. validation_status is left untouched here.
    await updateEntry(id, {
      review_confirmed: true,
      reviewer_id: reviewerId,
      review_notes: notes,
    });
    showToast('Mapping confirmed ✓', 'success');
  };

  const handleFlag = async (id: string) => {
    await updateEntry(id, { flagged: true });
    showToast('Entry flagged for re-recording', 'error');
  };

  const removeFromList = (id: string) => {
    setEntries((prev) => prev.filter((e) => e.id !== id));
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backArrow}>←</Text>
        </Pressable>
        <View style={styles.headerText}>
          <Text style={styles.headerTitle}>REVIEW</Text>
          <Text style={styles.headerSubtitle}>verify mappings</Text>
        </View>
      </View>

      {entries.length === 0 ? (
        <View style={styles.empty}>
          <EmptyCheckmark />
          <Text style={styles.emptyText}>
            All entries reviewed. Nothing pending.
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.list}>
          {entries.map((entry) => (
            <ReviewCard
              key={entry.id}
              entry={entry}
              onConfirm={handleConfirm}
              onFlag={handleFlag}
              onRemove={removeFromList}
            />
          ))}
        </ScrollView>
      )}

      {toast && (
        <View
          style={[
            styles.toast,
            {
              backgroundColor:
                toast.type === 'success' ? Colors.teachGreen : Colors.reviewRed,
              bottom: insets.bottom + 16,
            },
          ]}
        >
          <Text style={styles.toastText}>{toast.message}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    backgroundColor: Colors.reviewRed,
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
  list: {
    paddingVertical: 16,
    paddingBottom: 32,
  },
  card: {
    backgroundColor: Colors.textOnDark,
    borderRadius: 12,
    marginHorizontal: 16,
    marginBottom: 20,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  elderName: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.textOnLight,
  },
  tribe: {
    fontSize: 13,
    color: Colors.grey,
    marginTop: 2,
  },
  location: {
    fontSize: 12,
    color: Colors.grey,
    marginTop: 4,
    marginBottom: 12,
  },
  sectionLabel: {
    color: Colors.teachGreen,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.5,
    marginBottom: 8,
  },
  transcriptBox: {
    backgroundColor: Colors.lightGrey,
    borderRadius: 8,
    padding: 12,
  },
  noAudioText: {
    fontSize: 13,
    color: Colors.grey,
    fontStyle: 'italic',
  },
  transcriptText: {
    fontSize: 15,
    lineHeight: 22,
    color: Colors.textOnLight,
  },
  pills: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
  },
  typePill: {
    backgroundColor: Colors.headerDark,
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  typePillText: {
    color: Colors.textOnDark,
    fontSize: 10,
    fontWeight: '700',
  },
  consentPill: {
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  consentPillText: {
    color: Colors.textOnDark,
    fontSize: 10,
    fontWeight: '600',
  },
  dialectPill: {
    backgroundColor: Colors.grey,
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  dialectPillText: {
    color: Colors.textOnDark,
    fontSize: 10,
  },
  notesInput: {
    backgroundColor: Colors.textOnDark,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.borderGrey,
    padding: 12,
    minHeight: 80,
    textAlignVertical: 'top',
    fontSize: 14,
    color: Colors.textOnLight,
    marginBottom: 8,
  },
  reviewerInput: {
    backgroundColor: Colors.textOnDark,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.borderGrey,
    padding: 12,
    fontSize: 14,
    color: Colors.textOnLight,
    marginBottom: 16,
  },
  actions: {
    flexDirection: 'row',
  },
  flagButton: {
    flex: 1,
    borderWidth: 2,
    borderColor: Colors.reviewRed,
    backgroundColor: Colors.textOnDark,
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    marginRight: 8,
  },
  flagText: {
    color: Colors.reviewRed,
    fontWeight: '700',
    fontSize: 13,
  },
  confirmButton: {
    flex: 1,
    backgroundColor: Colors.teachGreen,
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
  },
  confirmText: {
    color: Colors.textOnDark,
    fontWeight: '700',
    fontSize: 13,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  emptyText: {
    fontSize: 16,
    color: Colors.teachGreen,
    marginTop: 16,
    textAlign: 'center',
  },
  toast: {
    position: 'absolute',
    left: 16,
    right: 16,
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  toastText: {
    color: Colors.textOnDark,
    fontWeight: '600',
    fontSize: 14,
  },
});
