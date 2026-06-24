import { Audio } from 'expo-av';

export async function requestMicPermission(): Promise<boolean> {
  const { granted } = await Audio.requestPermissionsAsync();
  return granted;
}

export async function startRecording(): Promise<Audio.Recording> {
  await Audio.setAudioModeAsync({
    allowsRecordingIOS: true,
    playsInSilentModeIOS: true,
  });

  const recording = new Audio.Recording();
  await recording.prepareToRecordAsync(
    Audio.RecordingOptionsPresets.HIGH_QUALITY
  );
  await recording.startAsync();
  return recording;
}

export async function stopRecording(
  recording: Audio.Recording
): Promise<{ uri: string; duration: number }> {
  const statusBefore = await recording.getStatusAsync();
  const durationMillis =
    'durationMillis' in statusBefore
      ? (statusBefore.durationMillis ?? 0)
      : 0;

  await recording.stopAndUnloadAsync();
  const uri = recording.getURI() ?? '';

  return { uri, duration: durationMillis / 1000 };
}

export async function playAudio(uri: string): Promise<Audio.Sound> {
  const { sound } = await Audio.Sound.createAsync({ uri });
  await sound.playAsync();
  return sound;
}
