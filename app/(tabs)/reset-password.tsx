import { router, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { RoutedScreenFrame } from '@/src/components/RoutedScreenFrame';
import { useAppNotice } from '@/src/contexts/AppNoticeContext';
import { useEntitlements } from '@/src/contexts/EntitlementsContext';
import {
  clearPasswordRecoveryRequested,
  hasPendingPasswordRecoveryRequest,
} from '@/src/lib/passwordRecovery';
import { signOut } from '@/src/lib/auth';
import { UpdatePasswordScreen } from '@/src/screens/UpdatePasswordScreen';
import { colors } from '@/src/styles/theme';

export default function ResetPasswordRoute() {
  const { authFlow, type } = useLocalSearchParams<{
    authFlow?: string;
    type?: string;
  }>();
  const { showNotice } = useAppNotice();
  const { authEvent, isAuthLoading, session } = useEntitlements();
  const isRecoveryRequest =
    hasPendingPasswordRecoveryRequest() ||
    authEvent === 'PASSWORD_RECOVERY' ||
    authFlow === 'password-recovery' ||
    type === 'recovery';

  const leaveRecovery = () => {
    clearPasswordRecoveryRequested();
    router.replace('/');
  };

  if (isAuthLoading) {
    return (
      <RoutedScreenFrame>
        <View style={styles.centered}>
          <ActivityIndicator color={colors.primaryGreen} size="large" />
          <Text style={styles.message}>Opening your secure password reset…</Text>
        </View>
      </RoutedScreenFrame>
    );
  }

  if (!session || !isRecoveryRequest) {
    return (
      <RoutedScreenFrame>
        <View style={styles.centered}>
          <Text style={styles.title}>This reset link is no longer available.</Text>
          <Text style={styles.message}>Return to login and request a new password reset email.</Text>
          <Text accessibilityRole="link" onPress={leaveRecovery} style={styles.link}>
            Back to login
          </Text>
        </View>
      </RoutedScreenFrame>
    );
  }

  return (
    <RoutedScreenFrame>
      <UpdatePasswordScreen
        onBack={() => {
          void signOut().finally(leaveRecovery);
        }}
        onSaved={() => {
          clearPasswordRecoveryRequested();
          showNotice('Password updated.');
          router.replace('/');
        }}
      />
    </RoutedScreenFrame>
  );
}

const styles = StyleSheet.create({
  centered: {
    alignItems: 'center',
    backgroundColor: colors.appBackground,
    flex: 1,
    gap: 12,
    justifyContent: 'center',
    padding: 24,
  },
  link: {
    color: colors.primaryGreen,
    fontSize: 16,
    fontWeight: '800',
    marginTop: 8,
  },
  message: {
    color: colors.mutedText,
    fontSize: 15,
    lineHeight: 22,
    maxWidth: 380,
    textAlign: 'center',
  },
  title: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '800',
    maxWidth: 380,
    textAlign: 'center',
  },
});
