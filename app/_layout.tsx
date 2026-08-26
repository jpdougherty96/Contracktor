import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { VercelAnalytics } from '@/src/components/VercelAnalytics';
import { ClientErrorBoundary } from '@/src/components/ClientErrorBoundary';
import { EntitlementsProvider } from '@/src/contexts/EntitlementsContext';
import { ServerStateProvider } from '@/src/lib/serverState';

export const unstable_settings = {
  anchor: '(tabs)',
};

export default function RootLayout() {
  const colorScheme = useColorScheme();

  return (
    <ClientErrorBoundary>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <ServerStateProvider>
          <EntitlementsProvider>
            <Stack>
              <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            </Stack>
            <StatusBar style="auto" />
            <VercelAnalytics />
          </EntitlementsProvider>
        </ServerStateProvider>
      </ThemeProvider>
    </ClientErrorBoundary>
  );
}
