import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ScreenHeader } from '@/src/components/ScreenHeader';
import { colors } from '@/src/styles/theme';

type ScreenLayoutProps = {
  backDisabled?: boolean;
  backLabel?: string;
  children: ReactNode;
  onBack?: () => void;
  rightAction?: ReactNode;
  subtitle?: string;
  title: string;
};

export function ScreenLayout({
  backDisabled,
  backLabel,
  children,
  onBack,
  rightAction,
  subtitle,
  title,
}: ScreenLayoutProps) {
  return (
    <SafeAreaView style={styles.safeArea}>
      <ScreenHeader
        backDisabled={backDisabled}
        backLabel={backLabel}
        onBack={onBack}
        rightAction={rightAction}
        subtitle={subtitle}
        title={title}
      />
      <View style={styles.body}>{children}</View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  body: {
    flex: 1,
  },
  safeArea: {
    backgroundColor: colors.appBackground,
    flex: 1,
  },
});
