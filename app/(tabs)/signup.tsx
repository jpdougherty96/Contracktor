import { Redirect } from 'expo-router';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { RoutedScreenFrame } from '@/src/components/RoutedScreenFrame';
import { useEntitlements } from '@/src/contexts/EntitlementsContext';
import { AuthScreen } from '@/src/screens/AuthScreen';
import { colors } from '@/src/styles/theme';

export default function SignupRoute() {
  const { authError, isAuthLoading, session } = useEntitlements();

  if (isAuthLoading) {
    return (
      <RoutedScreenFrame>
        <View style={styles.loadingScreen}>
          <ActivityIndicator color={colors.primaryGreen} size="large" />
        </View>
      </RoutedScreenFrame>
    );
  }

  if (session) {
    return <Redirect href="/" />;
  }

  return (
    <RoutedScreenFrame>
      <AuthScreen configError={authError} initialMode="signup" />
    </RoutedScreenFrame>
  );
}

const styles = StyleSheet.create({
  loadingScreen: {
    alignItems: 'center',
    backgroundColor: colors.appBackground,
    flex: 1,
    justifyContent: 'center',
  },
});
