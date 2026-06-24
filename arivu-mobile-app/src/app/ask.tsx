import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AudioPlayer from '@/components/AudioPlayer';
import KnowledgeCard from '@/components/KnowledgeCard';
import { Colors } from '@/constants/colors';
import { KnowledgeEntry } from '@/types';
import { resolveVisibility } from '@/utils/consent';
import { askCorpus, AskResult, buildAskSuggestions, loadMergedCorpus } from '@/utils/ask';
import { getAllEntries } from '@/utils/storage';

/** ASK shows OPEN corpus entries (community-only knowledge stays gated). */
const VIEWER_ROLE = 'OUTSIDER' as const;

export default function AskScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [entries, setEntries] = useState<KnowledgeEntry[]>([]);
  const [question, setQuestion] = useState('');
  const [asking, setAsking] = useState(false);
  const [result, setResult] = useState<AskResult | null>(null);
  const [hubOnline, setHubOnline] = useState<boolean | null>(null);
  const [corpusCount, setCorpusCount] = useState(0);
  const [suggestions, setSuggestions] = useState<string[]>([]);

  const refreshCorpus = useCallback(async () => {
    const local = await getAllEntries();
    setEntries(local);
    const { corpus, hubConnected } = await loadMergedCorpus(local);
    setCorpusCount(corpus.length);
    setHubOnline(hubConnected);
    setSuggestions(buildAskSuggestions(corpus, VIEWER_ROLE));
  }, []);

  useFocusEffect(
    useCallback(() => {
      refreshCorpus();
    }, [refreshCorpus])
  );

  const handleAsk = async (q?: string) => {
    const text = (q ?? question).trim();
    if (!text) return;
    setQuestion(text);
    setAsking(true);
    setResult(null);
    try {
      const res = await askCorpus(entries, text, VIEWER_ROLE);
      setResult(res);
      setHubOnline(res.hubConnected);
      setCorpusCount(res.corpusCount);
    } finally {
      setAsking(false);
    }
  };

  const top = result?.matches[0]?.entry;
  const topVisible = top ? resolveVisibility(top, VIEWER_ROLE).showContent : false;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backArrow}>←</Text>
        </Pressable>
        <View style={styles.headerText}>
          <Text style={styles.headerTitle}>ASK</Text>
          <Text style={styles.headerSubtitle}>Saakshi · elder recordings, verbatim</Text>
        </View>
      </View>

      {hubOnline !== null && (
        <View style={[styles.banner, hubOnline ? styles.bannerOn : styles.bannerOff]}>
          <Text style={styles.bannerText}>
            {hubOnline
              ? `${corpusCount} recording${corpusCount === 1 ? '' : 's'} in corpus (phone + hub)`
              : `${corpusCount} on this phone only — hub offline`}
          </Text>
        </View>
      )}

      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.askBox}>
          <TextInput
            value={question}
            onChangeText={setQuestion}
            placeholder="Ask anything — e.g. when does monsoon come?"
            placeholderTextColor={Colors.grey}
            style={styles.askInput}
            multiline
            onSubmitEditing={() => handleAsk()}
          />
          <Pressable
            style={[styles.askBtn, asking && styles.askBtnDisabled]}
            onPress={() => handleAsk()}
            disabled={asking}
          >
            <Text style={styles.askBtnText}>{asking ? 'Searching…' : '◈ Ask Saakshi'}</Text>
          </Pressable>
        </View>

        {suggestions.length > 0 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow}>
            {suggestions.map((s) => (
              <Pressable key={s} style={styles.chip} onPress={() => handleAsk(s)}>
                <Text style={styles.chipText}>{s}</Text>
              </Pressable>
            ))}
          </ScrollView>
        ) : (
          <Text style={styles.emptyHint}>
            No recordings yet — save something in TEACH, then suggestions will appear here.
          </Text>
        )}

        {result && (
          <View style={styles.resultSection}>
            {result.method === 'hub-llm' && (
              <Text style={styles.methodTag}>Grounded in elder corpus · hub AI</Text>
            )}
            {result.method === 'hub-retrieval' && (
              <Text style={styles.methodTag}>Matched from live hub corpus</Text>
            )}
            {result.method === 'local' && result.matches.length > 0 && (
              <Text style={styles.methodTag}>Matched on this device</Text>
            )}
            <Text style={styles.resultIntro}>{result.message}</Text>

            {top && topVisible && (
              <View style={styles.playbackBox}>
                <Text style={styles.playbackLabel}>ELDER RECORDING · VERBATIM</Text>
                <Text style={styles.attribution}>
                  {top.elder_name} · {top.tribe} · {top.village}
                  {top.district ? `, ${top.district}` : ''}
                </Text>
                <Text style={styles.quoteMark}>“</Text>
                <Text style={styles.verbatim}>{top.transcript}</Text>
                <Text style={styles.quoteMarkEnd}>”</Text>
                {top.audio_uri ? (
                  <View style={styles.playerWrap}>
                    <AudioPlayer
                      uri={top.audio_uri}
                      duration={top.audio_duration_seconds}
                      compact={false}
                      showWaveform
                    />
                  </View>
                ) : (
                  <Text style={styles.noAudio}>
                    No audio on this device — transcript is the elder’s words as captured.
                  </Text>
                )}
                <Text style={styles.attributionMeta}>
                  Type {top.knowledge_type}
                  {top.species_mentioned ? ` · ${top.species_mentioned}` : ''}
                  {top.season ? ` · ${top.season}` : ''}
                </Text>
              </View>
            )}

            {result.matches.length === 0 && (
              <Text style={styles.noMatch}>{result.message}</Text>
            )}
          </View>
        )}

        {result && result.matches.length > 1 && (
          <View style={styles.moreSection}>
            <Text style={styles.sectionLabel}>MORE MATCHES</Text>
            {result.matches.slice(1).map(({ entry }) => (
              <KnowledgeCard key={entry.id} entry={entry} viewerRole={VIEWER_ROLE} />
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    backgroundColor: Colors.askGold,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  backBtn: { padding: 8, marginRight: 8 },
  backArrow: { color: Colors.textOnDark, fontSize: 24 },
  headerText: { flex: 1 },
  headerTitle: { color: Colors.textOnDark, fontSize: 22, fontWeight: '700' },
  headerSubtitle: { color: Colors.textOnDark, fontSize: 12, opacity: 0.85, marginTop: 2 },
  banner: {
    marginHorizontal: 16,
    marginTop: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  bannerOn: { backgroundColor: '#E8F5E9', borderWidth: 1, borderColor: '#81C784' },
  bannerOff: { backgroundColor: '#FFF3E0', borderWidth: 1, borderColor: Colors.askGold },
  bannerText: { fontSize: 11, color: Colors.headerDark },
  scroll: { paddingBottom: 32 },
  askBox: {
    margin: 16,
    marginBottom: 8,
    backgroundColor: Colors.textOnDark,
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: Colors.askGold,
  },
  askInput: {
    minHeight: 56,
    fontSize: 15,
    color: Colors.textOnLight,
    textAlignVertical: 'top',
    marginBottom: 10,
  },
  askBtn: {
    backgroundColor: Colors.headerDark,
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  askBtnDisabled: { opacity: 0.6 },
  askBtnText: { color: Colors.textOnDark, fontWeight: '700', fontSize: 14 },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    color: Colors.grey,
    marginHorizontal: 16,
    marginBottom: 8,
    marginTop: 4,
  },
  chipRow: { maxHeight: 40, marginHorizontal: 12, marginBottom: 12 },
  chip: {
    backgroundColor: Colors.lightGrey,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginRight: 8,
  },
  chipText: { fontSize: 11, color: Colors.headerDark },
  emptyHint: {
    fontSize: 12,
    color: Colors.grey,
    fontStyle: 'italic',
    marginHorizontal: 16,
    marginBottom: 12,
    lineHeight: 18,
  },
  methodTag: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
    color: Colors.grey,
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  resultSection: { marginHorizontal: 16 },
  resultIntro: {
    fontSize: 13,
    color: Colors.headerDark,
    lineHeight: 20,
    marginBottom: 12,
  },
  playbackBox: {
    backgroundColor: Colors.headerDark,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  playbackLabel: {
    color: Colors.askGold,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: 10,
  },
  attribution: {
    color: Colors.textOnDark,
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 12,
  },
  quoteMark: {
    color: Colors.askGold,
    fontSize: 28,
    lineHeight: 28,
    marginBottom: -4,
  },
  quoteMarkEnd: {
    color: Colors.askGold,
    fontSize: 28,
    lineHeight: 28,
    textAlign: 'right',
    marginTop: -4,
  },
  verbatim: {
    color: Colors.textOnDark,
    fontSize: 16,
    lineHeight: 24,
    fontStyle: 'italic',
    paddingHorizontal: 4,
  },
  playerWrap: { marginTop: 16 },
  noAudio: {
    marginTop: 12,
    fontSize: 12,
    color: Colors.grey,
    fontStyle: 'italic',
  },
  attributionMeta: {
    marginTop: 12,
    fontSize: 11,
    color: Colors.grey,
  },
  noMatch: {
    fontSize: 14,
    color: Colors.reviewRed,
    fontStyle: 'italic',
    lineHeight: 21,
  },
  moreSection: { marginTop: 8 },
});
