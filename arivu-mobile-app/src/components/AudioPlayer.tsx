import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Audio } from 'expo-av';
import { Colors } from '@/constants/colors';
import { playAudio } from '@/utils/audio';

type AudioPlayerProps = {
  uri: string;
  duration?: number;
  compact?: boolean;
  showWaveform?: boolean;
};

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export default function AudioPlayer({
  uri,
  duration = 0,
  compact = true,
  showWaveform = false,
}: AudioPlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [totalDuration, setTotalDuration] = useState(duration);
  const soundRef = useRef<Audio.Sound | null>(null);

  const barHeights = useRef(
    Array.from({ length: 20 }, () => 8 + Math.random() * 24)
  ).current;

  useEffect(() => {
    return () => {
      soundRef.current?.unloadAsync();
    };
  }, []);

  const togglePlay = async () => {
    if (!uri) return;

    if (isPlaying && soundRef.current) {
      await soundRef.current.pauseAsync();
      setIsPlaying(false);
      return;
    }

    if (soundRef.current) {
      await soundRef.current.playAsync();
      setIsPlaying(true);
      return;
    }

    const sound = await playAudio(uri);
    soundRef.current = sound;
    const status = await sound.getStatusAsync();
    if (status.isLoaded) {
      setTotalDuration((status.durationMillis ?? 0) / 1000);
    }
    sound.setOnPlaybackStatusUpdate((s) => {
      if (!s.isLoaded) return;
      setPosition((s.positionMillis ?? 0) / 1000);
      if (s.didJustFinish) {
        setIsPlaying(false);
        setPosition(0);
        sound.setPositionAsync(0);
      }
    });
    setIsPlaying(true);
  };

  const progress = totalDuration > 0 ? position / totalDuration : 0;
  const buttonSize = compact ? 36 : 48;

  return (
    <View style={[styles.container, !compact && styles.containerLarge]}>
      <Pressable
        onPress={togglePlay}
        style={[
          styles.playButton,
          { width: buttonSize, height: buttonSize, borderRadius: buttonSize / 2 },
        ]}
      >
        <Text style={styles.playIcon}>{isPlaying ? '⏸' : '▶'}</Text>
      </Pressable>

      {showWaveform ? (
        <View style={styles.waveform}>
          {barHeights.map((h, i) => {
            const filled = i / barHeights.length <= progress;
            return (
              <View
                key={i}
                style={[
                  styles.waveBar,
                  {
                    height: h,
                    backgroundColor: filled ? Colors.teachGreen : Colors.borderGrey,
                  },
                ]}
              />
            );
          })}
        </View>
      ) : (
        <View style={styles.progressTrack}>
          <View
            style={[styles.progressFill, { width: `${progress * 100}%` }]}
          />
        </View>
      )}

      <Text style={styles.duration}>
        {formatTime(isPlaying || position > 0 ? position : totalDuration)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  containerLarge: {
    flex: 1,
  },
  playButton: {
    backgroundColor: Colors.teachGreen,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playIcon: {
    color: Colors.textOnDark,
    fontSize: 14,
  },
  progressTrack: {
    width: 100,
    height: 4,
    backgroundColor: Colors.borderGrey,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: Colors.teachGreen,
  },
  waveform: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    height: 32,
  },
  waveBar: {
    flex: 1,
    borderRadius: 1,
    minHeight: 4,
  },
  duration: {
    fontSize: 12,
    color: Colors.grey,
    minWidth: 36,
  },
});
