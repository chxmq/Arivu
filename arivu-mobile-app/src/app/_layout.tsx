import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';
import { SafeAreaProvider } from 'react-native-safe-area-context';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <StatusBar style="auto" />
      <Stack>
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="teach" options={{ headerShown: false }} />
        <Stack.Screen name="ask" options={{ headerShown: false }} />
        <Stack.Screen name="validate" options={{ headerShown: false }} />
        <Stack.Screen name="deploy" options={{ headerShown: false }} />
        <Stack.Screen name="review" options={{ headerShown: false }} />
      </Stack>
    </SafeAreaProvider>
  );
}
