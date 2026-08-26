import type { ReactNode } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';

export function RoutedScreenFrame({ children }: { children: ReactNode }) {
  const { width } = useWindowDimensions();

  return (
    <View style={styles.appShell}>
      <View style={[styles.screenFrame, width >= 768 && styles.desktopScreenFrame]}>
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  appShell: {
    flex: 1,
  },
  desktopScreenFrame: {
    alignSelf: 'center',
    maxWidth: 1180,
    width: '100%',
  },
  screenFrame: {
    flex: 1,
  },
});
