import { Redirect, useLocalSearchParams, usePathname } from 'expo-router';
import type { ReactNode } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { useEntitlements } from '@/src/contexts/EntitlementsContext';
import { colors } from '@/src/styles/theme';

export function AuthenticatedRoute({ children }: { children: ReactNode }) {
  const { authError, isAuthLoading, refreshAuth, session } = useEntitlements();
  const pathname = usePathname();
  const params = useLocalSearchParams<Record<string, string | string[]>>();

  if (isAuthLoading) {
    return (
      <View style={styles.loadingScreen}>
        <ActivityIndicator color={colors.primaryGreen} size="large" />
        <Text style={styles.loadingText}>Loading conTRACKtor...</Text>
      </View>
    );
  }

  if (authError) {
    const retry = () => {
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.location.reload();
        return;
      }

      void refreshAuth();
    };

    return (
      <View style={styles.loadingScreen}>
        <Text style={styles.recoveryTitle}>We couldn&apos;t finish loading your account.</Text>
        <Text style={styles.recoveryMessage}>{authError}</Text>
        <Pressable accessibilityRole="button" onPress={retry} style={styles.retryButton}>
          <Text style={styles.retryButtonText}>Try again</Text>
        </Pressable>
      </View>
    );
  }

  if (!session) {
    return <Redirect href={{ pathname: '/', params: { returnTo: buildReturnTo(pathname, params) } }} />;
  }

  return children;
}

function buildReturnTo(
  pathname: string,
  params: Record<string, string | string[] | undefined>
): string {
  const query = Object.entries(params).flatMap(([key, rawValue]) => {
    if (key === 'jobId' && pathname.startsWith('/jobs/')) {
      return [];
    }

    const values = Array.isArray(rawValue) ? rawValue : [rawValue];

    return values
      .filter((value): value is string => typeof value === 'string')
      .map((value) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`);
  });

  return query.length > 0 ? `${pathname}?${query.join('&')}` : pathname;
}

const styles = StyleSheet.create({
  loadingScreen: {
    alignItems: 'center',
    backgroundColor: colors.appBackground,
    flex: 1,
    gap: 12,
    justifyContent: 'center',
    padding: 24,
  },
  loadingText: {
    color: colors.mutedText,
    fontSize: 15,
    fontWeight: '700',
  },
  recoveryMessage: {
    color: colors.mutedText,
    fontSize: 15,
    lineHeight: 22,
    maxWidth: 360,
    textAlign: 'center',
  },
  recoveryTitle: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '800',
    maxWidth: 360,
    textAlign: 'center',
  },
  retryButton: {
    alignItems: 'center',
    backgroundColor: colors.primaryGreen,
    borderRadius: 12,
    justifyContent: 'center',
    marginTop: 8,
    minHeight: 48,
    paddingHorizontal: 24,
  },
  retryButtonText: {
    color: colors.warmWhite,
    fontSize: 16,
    fontWeight: '800',
  },
});
