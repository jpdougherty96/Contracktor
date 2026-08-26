import type { Session } from '@supabase/supabase-js';
import { Redirect } from 'expo-router';
import { useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { getCurrentAuthState } from '@/src/lib/auth';
import { supabase } from '@/src/lib/supabase';
import { colors } from '@/src/styles/theme';

export function AuthenticatedRoute({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null | undefined>(undefined);

  useEffect(() => {
    let isMounted = true;

    void getCurrentAuthState()
      .then((authState) => {
        if (isMounted) {
          setSession(authState.session);
        }
      })
      .catch(() => {
        if (isMounted) {
          setSession(null);
        }
      });

    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (isMounted) {
        setSession(nextSession);
      }
    });

    return () => {
      isMounted = false;
      data.subscription.unsubscribe();
    };
  }, []);

  if (session === undefined) {
    return (
      <View style={styles.loadingScreen}>
        <ActivityIndicator color={colors.primaryGreen} size="large" />
        <Text style={styles.loadingText}>Loading conTRACKtor...</Text>
      </View>
    );
  }

  if (!session) {
    return <Redirect href="/" />;
  }

  return children;
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
});
