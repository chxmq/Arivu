import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import {
  Dimensions,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Line, Polyline, Text as SvgText } from 'react-native-svg';
import AudioPlayer from '@/components/AudioPlayer';
import { Colors } from '@/constants/colors';
import { KnowledgeEntry, ValidationAssessment, ValidationResult, ValidationStatus } from '@/types';
import { validatePrediction } from '@/utils/kaalam';
import {
  assessmentAsResult,
  confirmValidationOnHub,
  pushManualAssessmentToHub,
  syncRecommendationsFromHub,
  triggerSentinelAssessment,
} from '@/utils/sync';
import { getAllEntries, updateEntry } from '@/utils/storage';

const SCREEN_WIDTH = Dimensions.get('window').width;

function statusColor(status: ValidationStatus): string {
  switch (status) {
    case 'VALIDATED':
      return Colors.teachGreen;
    case 'BROKEN':
      return Colors.reviewRed;
    case 'WEAKENING':
      return Colors.askGold;
    case 'INCONCLUSIVE':
      return Colors.grey;
    default:
      return Colors.grey;
  }
}

function PredictionChart({
  result,
  windowDays,
}: {
  result: ValidationResult;
  windowDays?: [number, number];
}) {
  const series = result.series;
  if (series.length === 0) return null;

  // Gap = days between trigger (e.g. cuckoo call) and outcome (e.g. monsoon onset).
  const gaps = series.map((s) => s.outcome_doy - s.trigger_doy);
  const earlyN = Math.max(1, Math.min(10, Math.floor(series.length / 2)));
  const recentN = Math.max(1, Math.min(7, series.length - earlyN));
  const avg = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length;
  const earlyAvg = Math.round(avg(gaps.slice(0, earlyN)));
  const recentAvg = Math.round(avg(gaps.slice(series.length - recentN)));
  const earlyYears = `${series[0].year}–${series[earlyN - 1].year}`;
  const recentYears = `${series[series.length - recentN].year}–${series[series.length - 1].year}`;
  const recentTag = result.status === 'BROKEN' ? 'BREAKING' : result.status;

  const W = SCREEN_WIDTH - 72;
  const H = 180;
  const padL = 32;
  const padR = 12;
  const padT = 12;
  const padB = 24;

  const allDOY = series.flatMap((s) => [s.trigger_doy, s.outcome_doy]);
  const minY = Math.min(...allDOY) - 10;
  const maxY = Math.max(...allDOY) + 10;

  const xOf = (i: number) =>
    padL + (i / Math.max(1, series.length - 1)) * (W - padL - padR);
  const yOf = (doy: number) =>
    padT + (1 - (doy - minY) / (maxY - minY)) * (H - padT - padB);

  const triggerPts = series.map((s, i) => `${xOf(i)},${yOf(s.trigger_doy)}`).join(' ');
  const outcomePts = series.map((s, i) => `${xOf(i)},${yOf(s.outcome_doy)}`).join(' ');

  return (
    <View>
      <Svg width={W} height={H}>
        {/* y gridlines */}
        {[minY, (minY + maxY) / 2, maxY].map((v, idx) => (
          <React.Fragment key={idx}>
            <Line
              x1={padL}
              y1={yOf(v)}
              x2={W - padR}
              y2={yOf(v)}
              stroke={Colors.borderGrey}
              strokeWidth={0.5}
            />
            <SvgText x={0} y={yOf(v) + 3} fontSize={9} fill={Colors.grey}>
              {Math.round(v)}
            </SvgText>
          </React.Fragment>
        ))}

        <Polyline points={outcomePts} fill="none" stroke={Colors.teachGreen} strokeWidth={2} />
        <Polyline points={triggerPts} fill="none" stroke={Colors.askGold} strokeWidth={2} />

        {series.map((s, i) => (
          <React.Fragment key={s.year}>
            <Circle cx={xOf(i)} cy={yOf(s.outcome_doy)} r={3} fill={Colors.teachGreen} />
            <Circle cx={xOf(i)} cy={yOf(s.trigger_doy)} r={3} fill={Colors.askGold} />
            {(i === 0 || i === series.length - 1) && (
              <SvgText
                x={xOf(i)}
                y={H - 8}
                fontSize={9}
                fill={Colors.grey}
                textAnchor="middle"
              >
                {s.year}
              </SvgText>
            )}
          </React.Fragment>
        ))}
      </Svg>
      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: Colors.askGold }]} />
          <Text style={styles.legendText}>Trigger (day-of-year)</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: Colors.teachGreen }]} />
          <Text style={styles.legendText}>Outcome (day-of-year)</Text>
        </View>
      </View>

      <View style={styles.gapPanel}>
        <Text style={styles.gapTitle}>GAP · trigger → outcome</Text>
        {windowDays && (
          <View style={styles.gapRow}>
            <View style={[styles.gapDot, { backgroundColor: Colors.headerDark }]} />
            <Text style={styles.gapText}>
              Elder predicted: {windowDays[0]}–{windowDays[1]} days
            </Text>
          </View>
        )}
        <View style={styles.gapRow}>
          <View style={[styles.gapDot, { backgroundColor: Colors.teachGreen }]} />
          <Text style={styles.gapText}>
            {earlyYears}: {earlyAvg} days avg ✓
          </Text>
        </View>
        <View style={styles.gapRow}>
          <View style={[styles.gapDot, { backgroundColor: Colors.reviewRed }]} />
          <Text style={[styles.gapText, styles.gapBad]}>
            {recentYears}: {recentAvg} days avg ✗ {recentTag}
          </Text>
        </View>
      </View>
    </View>
  );
}

function kaalamToManualAssessment(res: ValidationResult): ValidationAssessment {
  return {
    status: res.status,
    p_value: res.p_value,
    correlation: res.correlation,
    mean_lag_days: res.mean_lag_days,
    n_years: res.n_years,
    method: res.method,
    dataset: res.dataset,
    finding: res.finding,
    series: res.series,
    assessed_at: new Date().toISOString(),
    source: 'kaalam+manual',
  };
}

function AssessmentBlock({
  title,
  subtitle,
  result,
  accent,
  windowDays,
}: {
  title: string;
  subtitle?: string;
  result: ValidationResult;
  accent: string;
  windowDays?: [number, number];
}) {
  return (
    <View style={[styles.resultBox, { borderLeftWidth: 4, borderLeftColor: accent }]}>
      <Text style={styles.recLabel}>{title}</Text>
      {subtitle ? <Text style={styles.sentinelMeta}>{subtitle}</Text> : null}
      <View style={[styles.resultBadge, { backgroundColor: statusColor(result.status) }]}>
        <Text style={styles.resultBadgeText}>{result.status}</Text>
      </View>
      {result.series.length > 0 && <PredictionChart result={result} windowDays={windowDays} />}
      <View style={styles.statsRow}>
        <View style={styles.stat}>
          <Text style={styles.statValue}>{result.p_value == null ? '—' : result.p_value}</Text>
          <Text style={styles.statLabel}>p-value</Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.statValue}>{result.correlation == null ? '—' : result.correlation}</Text>
          <Text style={styles.statLabel}>Pearson r</Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.statValue}>{result.mean_lag_days == null ? '—' : result.mean_lag_days}</Text>
          <Text style={styles.statLabel}>mean lag (d)</Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.statValue}>{result.n_years}</Text>
          <Text style={styles.statLabel}>years</Text>
        </View>
      </View>
      <Text style={styles.method}>{result.method}</Text>
      <Text style={styles.dataset}>Source: {result.dataset}</Text>
      <Text style={styles.finding}>{result.finding}</Text>
    </View>
  );
}

function PredictionRow({
  entry,
  selected,
  onPress,
}: {
  entry: KnowledgeEntry;
  selected: boolean;
  onPress: () => void;
}) {
  const status = entry.validation_status;
  const rec = entry.sentinel_recommendation?.status;
  const showRec = rec && rec !== status;
  return (
    <Pressable
      onPress={onPress}
      style={[styles.row, selected && styles.rowSelected]}
    >
      <View style={{ flex: 1 }}>
        <Text style={styles.rowTitle} numberOfLines={1}>
          {entry.prediction?.trigger_event || 'Untitled'} →{' '}
          {entry.prediction?.outcome_event || '?'}
        </Text>
        <Text style={styles.rowSub} numberOfLines={1}>
          {entry.elder_name} · {entry.village}
          {showRec ? ` · ◈ ${rec}` : ''}
        </Text>
      </View>
      <View style={[styles.rowBadge, { backgroundColor: statusColor(status) }]}>
        <Text style={styles.rowBadgeText}>{status}</Text>
      </View>
    </Pressable>
  );
}

export default function ValidateScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [predictions, setPredictions] = useState<KnowledgeEntry[]>([]);
  const [selected, setSelected] = useState<KnowledgeEntry | null>(null);
  const [running, setRunning] = useState(false);
  const [manualRunning, setManualRunning] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [reviewerName, setReviewerName] = useState('');

  const load = useCallback(async () => {
    await syncRecommendationsFromHub(updateEntry);
    const all = await getAllEntries();
    const preds = all.filter((e) => e.knowledge_type === 'C' && e.prediction);
    setPredictions(preds);
    setSelected((prev) => {
      if (!prev) return prev;
      return preds.find((p) => p.id === prev.id) ?? null;
    });
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const select = (entry: KnowledgeEntry) => {
    setSelected(entry);
  };

  const refreshSentinelAssessment = async () => {
    if (!selected?.prediction) return;
    setRunning(true);
    try {
      await triggerSentinelAssessment(selected.id);
      await syncRecommendationsFromHub(updateEntry);
      await load();
    } finally {
      setRunning(false);
    }
  };

  const runManualKaalam = async () => {
    if (!selected?.prediction) return;
    setManualRunning(true);
    try {
      await new Promise((r) => setTimeout(r, 350));
      const res = validatePrediction(selected.prediction);
      const manual = kaalamToManualAssessment(res);
      await updateEntry(selected.id, { manual_assessment: manual });
      await pushManualAssessmentToHub(selected.id, manual);
      await load();
      const all = await getAllEntries();
      setSelected(all.find((e) => e.id === selected.id) ?? null);
    } finally {
      setManualRunning(false);
    }
  };

  const confirmStatus = async (
    status: ValidationStatus,
    source: 'sentinel' | 'manual' | 'custom'
  ) => {
    if (!selected) return;
    const name = reviewerName.trim() || 'Field reviewer';
    setConfirming(true);
    try {
      const assessment =
        source === 'sentinel'
          ? selected.sentinel_recommendation
          : source === 'manual'
            ? selected.manual_assessment
            : undefined;
      await confirmValidationOnHub(selected.id, status, name, source);
      await updateEntry(selected.id, {
        validation_status: status,
        validation_result: assessmentAsResult(assessment) ?? undefined,
        validation_confirmed_by: name,
        validation_confirmed_at: new Date().toISOString(),
        validation_confirmed_source: source,
      });
      await syncRecommendationsFromHub(updateEntry);
      await load();
    } finally {
      setConfirming(false);
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backArrow}>←</Text>
        </Pressable>
        <View style={styles.headerText}>
          <Text style={styles.headerTitle}>VALIDATE</Text>
          <Text style={styles.headerSubtitle}>Sentinel + manual KAALAM · you decide</Text>
        </View>
      </View>

      {predictions.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>
            No Type C predictions yet. Save a demo in TEACH — sentinels will assess,
            then you confirm the final status here.
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.sectionLabel}>PREDICTIONS</Text>
          {predictions.map((p) => (
            <PredictionRow
              key={p.id}
              entry={p}
              selected={selected?.id === p.id}
              onPress={() => select(p)}
            />
          ))}

              {selected && (
            <View style={styles.detail}>
              <View style={styles.humanStatusRow}>
                <Text style={styles.humanStatusLabel}>YOUR DECISION</Text>
                <View
                  style={[
                    styles.humanStatusBadge,
                    { backgroundColor: statusColor(selected.validation_status) },
                  ]}
                >
                  <Text style={styles.humanStatusText}>{selected.validation_status}</Text>
                </View>
              </View>
              {selected.validation_confirmed_by ? (
                <Text style={styles.confirmedMeta}>
                  Confirmed by {selected.validation_confirmed_by}
                  {selected.validation_confirmed_source
                    ? ` (${selected.validation_confirmed_source})`
                    : ''}
                </Text>
              ) : (
                <Text style={styles.confirmedMeta}>
                  Not confirmed yet — compare sentinel vs manual below
                </Text>
              )}

              <Text style={styles.sectionLabel}>HYPOTHESIS</Text>
              <View style={styles.hypoBox}>
                <Text style={styles.hypoText}>
                  When{' '}
                  <Text style={styles.hypoStrong}>
                    {selected.prediction?.trigger_event}
                  </Text>{' '}
                  ({selected.prediction?.trigger_time || 'any time'}) →{' '}
                  <Text style={styles.hypoStrong}>
                    {selected.prediction?.outcome_event}
                  </Text>{' '}
                  within {selected.prediction?.time_window_days[0]}–
                  {selected.prediction?.time_window_days[1]} days.
                </Text>
                <Text style={styles.hypoMeta}>
                  First observed {selected.prediction?.first_observed || '—'} · geohash{' '}
                  {selected.geohash || '—'}
                </Text>
              </View>

              <Text style={styles.sectionLabel}>SENTINEL PATH</Text>
              <Pressable
                style={[styles.runButton, styles.sentinelBtn, running && { opacity: 0.6 }]}
                onPress={refreshSentinelAssessment}
                disabled={running}
              >
                <Text style={styles.runButtonText}>
                  {running ? 'Refreshing…' : '↻ Refresh sentinel assessment'}
                </Text>
              </Pressable>
              {selected.sentinel_recommendation ? (
                <AssessmentBlock
                  title="SENTINEL + KAALAM"
                  subtitle={
                    selected.sentinel_recommendation.sentinel_name
                      ? `via ${selected.sentinel_recommendation.sentinel_name}`
                      : 'GBIF / occurrence fallback'
                  }
                  result={assessmentAsResult(selected.sentinel_recommendation)!}
                  accent={Colors.askGold}
                  windowDays={selected.prediction?.time_window_days}
                />
              ) : (
                <Text style={styles.hintText}>
                  No sentinel assessment yet — save to hub and refresh, or check hub is online.
                </Text>
              )}

              <Text style={styles.sectionLabel}>MANUAL PATH</Text>
              <Pressable
                style={[styles.runButton, styles.manualBtn, manualRunning && { opacity: 0.6 }]}
                onPress={runManualKaalam}
                disabled={manualRunning}
              >
                <Text style={styles.runButtonText}>
                  {manualRunning ? 'Running Welch t-test…' : '▶ Run manual KAALAM (on device)'}
                </Text>
              </Pressable>
              {selected.manual_assessment ? (
                <AssessmentBlock
                  title="MANUAL KAALAM"
                  subtitle="Run on this phone — independent of sentinel"
                  result={assessmentAsResult(selected.manual_assessment)!}
                  accent={Colors.teachGreen}
                  windowDays={selected.prediction?.time_window_days}
                />
              ) : (
                <Text style={styles.hintText}>
                  Tap above to run KAALAM locally without waiting for a sentinel box.
                </Text>
              )}

              <View style={styles.confirmBlock}>
                <Text style={styles.sectionLabel}>YOUR FINAL DECISION</Text>
                <TextInput
                  value={reviewerName}
                  onChangeText={setReviewerName}
                  placeholder="Your name / BMC ID"
                  placeholderTextColor={Colors.grey}
                  style={styles.reviewerInput}
                />
                {selected.sentinel_recommendation && (
                  <Pressable
                    style={[styles.confirmBtn, styles.sentinelConfirm, confirming && { opacity: 0.6 }]}
                    onPress={() =>
                      confirmStatus(selected.sentinel_recommendation!.status, 'sentinel')
                    }
                    disabled={confirming}
                  >
                    <Text style={styles.confirmBtnText}>
                      ✓ Confirm sentinel: {selected.sentinel_recommendation.status}
                    </Text>
                  </Pressable>
                )}
                {selected.manual_assessment && (
                  <Pressable
                    style={[styles.confirmBtn, confirming && { opacity: 0.6 }]}
                    onPress={() => confirmStatus(selected.manual_assessment!.status, 'manual')}
                    disabled={confirming}
                  >
                    <Text style={styles.confirmBtnText}>
                      ✓ Confirm manual: {selected.manual_assessment.status}
                    </Text>
                  </Pressable>
                )}
                <Text style={styles.overrideLabel}>Or override with your own judgment:</Text>
                <View style={styles.overrideRow}>
                  {(['VALIDATED', 'WEAKENING', 'BROKEN', 'INCONCLUSIVE', 'PENDING'] as ValidationStatus[]).map(
                    (s) => (
                      <Pressable
                        key={s}
                        style={[styles.overridePill, confirming && { opacity: 0.6 }]}
                        onPress={() => confirmStatus(s, 'custom')}
                        disabled={confirming}
                      >
                        <Text style={styles.overridePillText}>{s}</Text>
                      </Pressable>
                    )
                  )}
                </View>
              </View>

              {selected.audio_uri ? (
                <View style={styles.askBox}>
                  <Text style={styles.sectionLabel}>ASK · ELDER&apos;S VOICE</Text>
                  <AudioPlayer
                    uri={selected.audio_uri}
                    duration={selected.audio_duration_seconds}
                    compact={false}
                    showWaveform
                  />
                </View>
              ) : null}
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    backgroundColor: Colors.headerDark,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  backBtn: { padding: 8, marginRight: 8 },
  backArrow: { color: Colors.textOnDark, fontSize: 24 },
  headerText: { flex: 1 },
  headerTitle: { color: Colors.textOnDark, fontSize: 22, fontWeight: '700' },
  headerSubtitle: {
    color: Colors.textOnDark,
    fontSize: 12,
    opacity: 0.85,
    marginTop: 2,
  },
  content: { padding: 16, paddingBottom: 40 },
  sectionLabel: {
    color: Colors.teachGreen,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.5,
    marginBottom: 8,
    marginTop: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.textOnDark,
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: Colors.borderGrey,
  },
  rowSelected: { borderColor: Colors.headerDark, borderWidth: 2 },
  rowTitle: { fontSize: 14, fontWeight: '700', color: Colors.textOnLight },
  rowSub: { fontSize: 12, color: Colors.grey, marginTop: 2 },
  rowBadge: { borderRadius: 20, paddingHorizontal: 8, paddingVertical: 4, marginLeft: 8 },
  rowBadgeText: { color: Colors.textOnDark, fontSize: 9, fontWeight: '700' },
  detail: { marginTop: 12 },
  humanStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  humanStatusLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    color: Colors.grey,
  },
  humanStatusBadge: {
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  humanStatusText: { color: Colors.textOnDark, fontSize: 11, fontWeight: '700' },
  confirmedMeta: {
    fontSize: 12,
    color: Colors.grey,
    fontStyle: 'italic',
    marginBottom: 8,
  },
  recLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
    color: Colors.askGold,
    marginBottom: 8,
  },
  sentinelMeta: { fontSize: 12, color: Colors.grey, marginBottom: 10 },
  confirmBlock: { marginTop: 16, gap: 8 },
  reviewerInput: {
    borderWidth: 1,
    borderColor: Colors.borderGrey,
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    color: Colors.textOnLight,
    backgroundColor: Colors.background,
  },
  confirmBtn: {
    backgroundColor: Colors.teachGreen,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  confirmBtnText: { color: Colors.textOnDark, fontWeight: '700', fontSize: 14 },
  hypoBox: {
    backgroundColor: Colors.textOnDark,
    borderRadius: 10,
    padding: 14,
    borderLeftWidth: 4,
    borderLeftColor: Colors.askGold,
  },
  hypoText: { fontSize: 15, lineHeight: 22, color: Colors.textOnLight },
  hypoStrong: { fontWeight: '700', color: Colors.headerDark },
  hypoMeta: { fontSize: 12, color: Colors.grey, marginTop: 8 },
  runButton: {
    backgroundColor: Colors.headerDark,
    borderRadius: 12,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    marginBottom: 8,
  },
  sentinelBtn: { backgroundColor: Colors.headerDark },
  manualBtn: { backgroundColor: Colors.teachGreen },
  runButtonText: { color: Colors.textOnDark, fontSize: 15, fontWeight: '700' },
  hintText: {
    fontSize: 12,
    color: Colors.grey,
    fontStyle: 'italic',
    marginBottom: 12,
    lineHeight: 18,
  },
  overrideLabel: {
    fontSize: 11,
    color: Colors.grey,
    marginTop: 12,
    marginBottom: 8,
  },
  overrideRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  overridePill: {
    borderWidth: 1,
    borderColor: Colors.borderGrey,
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: Colors.background,
  },
  overridePillText: { fontSize: 10, fontWeight: '700', color: Colors.headerDark },
  sentinelConfirm: { backgroundColor: Colors.askGold },
  resultBox: {
    backgroundColor: Colors.textOnDark,
    borderRadius: 12,
    padding: 16,
    marginTop: 16,
  },
  resultBadge: {
    alignSelf: 'flex-start',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 6,
    marginBottom: 12,
  },
  resultBadgeText: { color: Colors.textOnDark, fontSize: 13, fontWeight: '700' },
  legend: { flexDirection: 'row', gap: 16, marginTop: 4, marginBottom: 8 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendText: { fontSize: 11, color: Colors.grey },
  gapPanel: {
    backgroundColor: Colors.background,
    borderRadius: 10,
    padding: 12,
    marginTop: 4,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: Colors.borderGrey,
  },
  gapTitle: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
    color: Colors.grey,
    marginBottom: 8,
  },
  gapRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 5 },
  gapDot: { width: 10, height: 10, borderRadius: 5 },
  gapText: { fontSize: 13, fontWeight: '700', color: Colors.headerDark },
  gapBad: { color: Colors.reviewRed },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
    marginBottom: 12,
  },
  stat: { alignItems: 'center', flex: 1 },
  statValue: { fontSize: 18, fontWeight: '700', color: Colors.headerDark },
  statLabel: { fontSize: 10, color: Colors.grey, marginTop: 2 },
  method: { fontSize: 11, color: Colors.grey, fontStyle: 'italic' },
  dataset: { fontSize: 11, color: Colors.grey, marginTop: 2, marginBottom: 10 },
  finding: { fontSize: 14, lineHeight: 21, color: Colors.textOnLight },
  askBox: { marginTop: 20 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  emptyText: { fontSize: 15, color: Colors.grey, textAlign: 'center', lineHeight: 22 },
});
