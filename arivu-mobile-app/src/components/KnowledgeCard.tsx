import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Colors } from '@/constants/colors';
import { KnowledgeEntry, ViewerRole } from '@/types';
import { resolveVisibility } from '@/utils/consent';
import AudioPlayer from './AudioPlayer';

type KnowledgeCardProps = {
  entry: KnowledgeEntry;
  viewerRole?: ViewerRole;
};

function statusColor(status: KnowledgeEntry['validation_status']): string {
  switch (status) {
    case 'VALIDATED':
      return Colors.teachGreen;
    case 'BROKEN':
      return Colors.reviewRed;
    case 'WEAKENING':
      return Colors.askGold;
    default:
      return Colors.grey;
  }
}

function consentColor(level: KnowledgeEntry['consent_level']): string {
  switch (level) {
    case 'OPEN':
      return Colors.teachGreen;
    case 'COMMUNITY_ONLY':
      return Colors.askGold;
    default:
      return Colors.reviewRed;
  }
}

function consentLabel(level: KnowledgeEntry['consent_level']): string {
  switch (level) {
    case 'OPEN':
      return 'OPEN';
    case 'COMMUNITY_ONLY':
      return 'COMMUNITY';
    default:
      return 'EMBARGOED';
  }
}

export default function KnowledgeCard({
  entry,
  viewerRole = 'OUTSIDER',
}: KnowledgeCardProps) {
  const borderColor = statusColor(entry.validation_status);
  const visibility = resolveVisibility(entry, viewerRole);

  return (
    <View style={[styles.card, { borderLeftColor: borderColor }]}>
      <View style={styles.topRow}>
        <View>
          <Text style={styles.elderName}>{entry.elder_name}</Text>
          <Text style={styles.tribe}>{entry.tribe}</Text>
        </View>
        <View
          style={[
            styles.statusBadge,
            { backgroundColor: borderColor },
          ]}
        >
          <Text style={styles.statusText}>{entry.validation_status}</Text>
        </View>
      </View>

      <Text style={styles.location}>
        {entry.village}, {entry.district}
      </Text>

      {visibility.showContent ? (
        <Text style={styles.transcript} numberOfLines={3} ellipsizeMode="tail">
          {entry.transcript}
        </Text>
      ) : (
        <View style={styles.lockedBox}>
          <Text style={styles.lockedTitle}>
            {entry.consent_level === 'EMBARGOED' ? '🔒 EMBARGOED' : '🛡 COMMUNITY-ONLY'}
          </Text>
          <Text style={styles.lockedText}>{visibility.reason}</Text>
        </View>
      )}

      <View style={styles.bottomRow}>
        <View style={styles.badges}>
          <View style={styles.typeBadge}>
            <Text style={styles.typeText}>TYPE {entry.knowledge_type}</Text>
          </View>
          <View
            style={[
              styles.consentBadge,
              { backgroundColor: consentColor(entry.consent_level) },
            ]}
          >
            <Text style={styles.consentText}>
              {consentLabel(entry.consent_level)}
            </Text>
          </View>
        </View>
        {visibility.showContent ? (
          entry.audio_uri ? (
            <AudioPlayer
              uri={entry.audio_uri}
              duration={entry.audio_duration_seconds}
              compact
            />
          ) : (
            <Text style={styles.lockedAudio}>no audio</Text>
          )
        ) : (
          <Text style={styles.lockedAudio}>🔒 audio withheld</Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.textOnDark,
    borderRadius: 10,
    padding: 16,
    marginHorizontal: 16,
    marginBottom: 12,
    borderLeftWidth: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  elderName: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.textOnLight,
  },
  tribe: {
    fontSize: 12,
    color: Colors.grey,
    marginTop: 2,
  },
  statusBadge: {
    borderRadius: 20,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  statusText: {
    color: Colors.textOnDark,
    fontSize: 10,
    fontWeight: '600',
  },
  location: {
    fontSize: 13,
    color: Colors.grey,
    marginTop: 8,
  },
  transcript: {
    fontSize: 14,
    color: Colors.textOnLight,
    marginTop: 8,
    lineHeight: 20,
  },
  lockedBox: {
    marginTop: 8,
    backgroundColor: Colors.lightGrey,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.borderGrey,
    borderStyle: 'dashed',
    padding: 12,
  },
  lockedTitle: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    color: Colors.grey,
    marginBottom: 4,
  },
  lockedText: {
    fontSize: 12,
    color: Colors.grey,
    lineHeight: 17,
    fontStyle: 'italic',
  },
  lockedAudio: {
    fontSize: 11,
    color: Colors.grey,
    fontStyle: 'italic',
  },
  bottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
  },
  badges: {
    flexDirection: 'row',
    gap: 6,
    flex: 1,
  },
  typeBadge: {
    backgroundColor: Colors.teachGreen,
    borderRadius: 20,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  typeText: {
    color: Colors.textOnDark,
    fontSize: 10,
    fontWeight: '700',
  },
  consentBadge: {
    borderRadius: 20,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  consentText: {
    color: Colors.textOnDark,
    fontSize: 10,
    fontWeight: '600',
  },
});
