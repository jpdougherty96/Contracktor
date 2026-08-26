import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { reportClientError } from '@/src/lib/clientMonitoring';
import { colors } from '@/src/styles/theme';

type ClientErrorBoundaryProps = {
  children: ReactNode;
};

type ClientErrorBoundaryState = {
  hasError: boolean;
};

export class ClientErrorBoundary extends Component<
  ClientErrorBoundaryProps,
  ClientErrorBoundaryState
> {
  state: ClientErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ClientErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, _info: ErrorInfo): void {
    reportClientError(error, 'react-render');
  }

  private handleRecover = () => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.location.assign('/');
      return;
    }

    this.setState({ hasError: false });
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <View style={styles.screen}>
        <Text style={styles.title}>conTRACKtor hit a snag</Text>
        <Text style={styles.detail}>
          Anything already saved remains in your records. Return to Home and try that action again.
        </Text>
        <Pressable accessibilityRole="button" onPress={this.handleRecover} style={styles.button}>
          <Text style={styles.buttonText}>Return to Home</Text>
        </Pressable>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    backgroundColor: colors.primaryGreen,
    borderRadius: 10,
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: 20,
  },
  buttonText: {
    color: colors.warmWhite,
    fontSize: 16,
    fontWeight: '800',
  },
  detail: {
    color: colors.mutedText,
    fontSize: 16,
    lineHeight: 23,
    maxWidth: 440,
    textAlign: 'center',
  },
  screen: {
    alignItems: 'center',
    backgroundColor: colors.appBackground,
    flex: 1,
    gap: 18,
    justifyContent: 'center',
    padding: 28,
  },
  title: {
    color: colors.text,
    fontSize: 28,
    fontWeight: '900',
    textAlign: 'center',
  },
});
