import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import ActionCard from '@/components/ActionCard';
import SentinelIllustration from '@/components/SentinelIllustration';
import { Colors } from '@/constants/colors';
import { clearAllEntries } from '@/utils/storage';

function MicIcon() {
  return (
    <Text style={{ fontSize: 18 }}>🎙</Text>
  );
}

function PlayIcon() {
  return (
    <Text style={{ fontSize: 16 }}>▶</Text>
  );
}

function ValidateIcon() {
  // Small line-chart glyph for the validation engine.
  return (
    <Svg width={18} height={18} viewBox="0 0 18 18">
      <Path
        d="M2 14 L7 8 L10 11 L16 3"
        stroke={Colors.headerDark}
        strokeWidth={2}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [resetting, setResetting] = useState(false);

  const handleResetLocal = () => {
    Alert.alert(
      'Clear local TEACH data?',
      'Removes all recordings saved on this phone. Hub corpus was already cleared — use TEACH to record fresh elders.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            setResetting(true);
            try {
              await clearAllEntries();
              Alert.alert('Done', 'Local app data cleared. You can TEACH again from scratch.');
            } finally {
              setResetting(false);
            }
          },
        },
      ]
    );
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.title}>ARIVU</Text>
        <Text style={styles.subtitle}>the almanac science can listen to</Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.illustration}>
          <SentinelIllustration />
        </View>

        <View style={styles.cards}>
          <ActionCard
            backgroundColor={Colors.teachGreen}
            icon={<MicIcon />}
            label="TEACH"
            subtitle="record an elder"
            onPress={() => router.push('/teach')}
            accentColor={Colors.teachGreen}
          />
          <ActionCard
            backgroundColor={Colors.askGold}
            icon={<PlayIcon />}
            label="ASK"
            subtitle="hear what elders taught"
            onPress={() => router.push('/ask')}
            accentColor={Colors.askGold}
          />
          <ActionCard
            backgroundColor={Colors.headerDark}
            icon={<ValidateIcon />}
            label="VALIDATE"
            subtitle="test predictions (Kaalam)"
            onPress={() => router.push('/validate')}
            accentColor={Colors.headerDark}
          />
        </View>

        <Pressable style={styles.resetBtn} onPress={handleResetLocal} disabled={resetting}>
          <Text style={styles.resetText}>
            {resetting ? 'Clearing…' : '↻ Clear local TEACH data (fresh start)'}
          </Text>
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
    backgroundColor: Colors.headerDark,
    height: 100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    color: Colors.textOnDark,
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: 2,
  },
  subtitle: {
    color: Colors.textOnDark,
    fontSize: 11,
    fontStyle: 'italic',
    marginTop: 4,
    opacity: 0.9,
  },
  scrollContent: {
    paddingBottom: 32,
  },
  illustration: {
    alignItems: 'center',
    paddingVertical: 24,
    height: 140,
    justifyContent: 'center',
  },
  cards: {
    paddingHorizontal: 24,
    gap: 16,
  },
  resetBtn: {
    marginHorizontal: 24,
    marginTop: 20,
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.borderGrey,
    backgroundColor: Colors.textOnDark,
  },
  resetText: {
    fontSize: 12,
    color: Colors.grey,
    fontWeight: '600',
  },
});
