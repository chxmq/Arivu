import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { Colors } from '@/constants/colors';
import {
  requestMicPermission,
  startRecording,
  stopRecording,
} from '@/utils/audio';

type RecordButtonProps = {
  onRecorded: (uri: string, duration: number) => void;
};

type RecordState = 'idle' | 'recording' | 'recorded';

const isWeb = Platform.OS === 'web';

function formatTimer(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export default function RecordButton({ onRecorded }: RecordButtonProps) {
  const [state, setState] = useState<RecordState>('idle');
  const [duration, setDuration] = useState(0);
  const [timerSeconds, setTimerSeconds] = useState(0);
  const recordingRef = useRef<import('expo-av').Audio.Recording | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const pulseScale = useRef(new Animated.Value(1)).current;
  const pulseOpacity = useRef(new Animated.Value(1)).current;
  const barAnims = useRef(
    Array.from({ length: 5 }, () => new Animated.Value(0.3))
  ).current;

  useEffect(() => {
    if (state !== 'recording') return;

    const pulse = Animated.loop(
      Animated.parallel([
        Animated.sequence([
          Animated.timing(pulseScale, {
            toValue: 1.3,
            duration: 800,
            easing: Easing.out(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(pulseScale, {
            toValue: 1,
            duration: 0,
            useNativeDriver: true,
          }),
        ]),
        Animated.sequence([
          Animated.timing(pulseOpacity, {
            toValue: 0,
            duration: 800,
            useNativeDriver: true,
          }),
          Animated.timing(pulseOpacity, {
            toValue: 1,
            duration: 0,
            useNativeDriver: true,
          }),
        ]),
      ])
    );
    pulse.start();

    const barLoops = barAnims.map((anim) =>
      Animated.loop(
        Animated.sequence([
          Animated.timing(anim, {
            toValue: 0.3 + Math.random() * 0.7,
            duration: 200 + Math.random() * 200,
            useNativeDriver: true,
          }),
          Animated.timing(anim, {
            toValue: 0.2 + Math.random() * 0.4,
            duration: 200 + Math.random() * 200,
            useNativeDriver: true,
          }),
        ])
      )
    );
    barLoops.forEach((l) => l.start());

    return () => {
      pulse.stop();
      barLoops.forEach((l) => l.stop());
    };
  }, [state, pulseScale, pulseOpacity, barAnims]);

  const handlePress = async () => {
    if (state === 'idle') {
      const granted = await requestMicPermission();
      if (!granted) return;

      if (!isWeb && FileSystem.documentDirectory) {
        const dir = `${FileSystem.documentDirectory}recordings/`;
        await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
      }

      const recording = await startRecording();
      recordingRef.current = recording;
      setState('recording');
      setTimerSeconds(0);
      timerRef.current = setInterval(() => {
        setTimerSeconds((s) => s + 1);
      }, 1000);
      return;
    }

    if (state === 'recording' && recordingRef.current) {
      if (timerRef.current) clearInterval(timerRef.current);
      const result = await stopRecording(recordingRef.current);
      recordingRef.current = null;

      if (result.uri) {
        let finalUri = result.uri;
        if (!isWeb && FileSystem.documentDirectory) {
          const id = Math.random().toString(36).slice(2) + Date.now();
          const dest = `${FileSystem.documentDirectory}recordings/${id}.m4a`;
          await FileSystem.moveAsync({ from: result.uri, to: dest });
          finalUri = dest;
        }
        const dur = Math.round(result.duration || timerSeconds);
        setDuration(dur);
        setState('recorded');
        onRecorded(finalUri, dur);
      }
    }
  };

  const bgColor =
    state === 'recording'
      ? Colors.reviewRed
      : state === 'recorded'
        ? Colors.teachGreen
        : Colors.teachGreen;

  const label =
    state === 'idle'
      ? 'Tap to Record'
      : state === 'recording'
        ? formatTimer(timerSeconds)
        : `Recorded — ${duration} seconds`;

  return (
    <View style={styles.wrapper}>
      <View style={styles.buttonArea}>
        {state === 'recording' && (
          <Animated.View
            style={[
              styles.pulseRing,
              {
                transform: [{ scale: pulseScale }],
                opacity: pulseOpacity,
              },
            ]}
          />
        )}
        <Pressable
          onPress={handlePress}
          disabled={state === 'recorded'}
          style={[styles.button, { backgroundColor: bgColor }]}
        >
          <Text style={styles.icon}>
            {state === 'recording' ? '⏹' : state === 'recorded' ? '✓' : '🎙'}
          </Text>
        </Pressable>
      </View>

      {state === 'recording' && (
        <View style={styles.waveform}>
          {barAnims.map((anim, i) => (
            <Animated.View
              key={i}
              style={[
                styles.bar,
                {
                  transform: [{ scaleY: anim }],
                },
              ]}
            />
          ))}
        </View>
      )}

      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    alignItems: 'center',
    marginVertical: 16,
  },
  buttonArea: {
    width: 120,
    height: 120,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pulseRing: {
    position: 'absolute',
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 3,
    borderColor: Colors.reviewRed,
  },
  button: {
    width: 100,
    height: 100,
    borderRadius: 50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: {
    fontSize: 32,
    color: Colors.textOnDark,
  },
  waveform: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: 32,
    gap: 4,
    marginTop: 8,
  },
  bar: {
    width: 6,
    height: 28,
    backgroundColor: Colors.teachGreen,
    borderRadius: 3,
  },
  label: {
    marginTop: 12,
    fontSize: 14,
    color: Colors.textOnLight,
  },
});
