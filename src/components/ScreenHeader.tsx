import { Feather } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors } from '@/src/styles/theme';

type ScreenHeaderProps = {
  backDisabled?: boolean;
  backLabel?: string;
  onBack?: () => void;
  rightAction?: ReactNode;
  subtitle?: string;
  title: string;
};

export function ScreenHeader({
  backDisabled = false,
  backLabel = 'Back',
  onBack,
  rightAction,
  subtitle,
  title,
}: ScreenHeaderProps) {
  const visibleBackLabel = getVisibleBackLabel(backLabel);
  const backAccessibilityLabel = getBackAccessibilityLabel(backLabel);

  return (
    <View style={styles.header}>
      {onBack ? (
        <Pressable
          accessibilityLabel={backAccessibilityLabel}
          accessibilityRole="button"
          disabled={backDisabled}
          hitSlop={8}
          onPress={onBack}
          style={({ pressed }) => [
            styles.backButton,
            pressed && !backDisabled && styles.pressedButton,
            backDisabled && styles.disabledButton,
          ]}>
          <Feather color={colors.primaryGreen} name="chevron-left" size={24} />
          <Text numberOfLines={1} style={styles.backLabel}>
            {visibleBackLabel}
          </Text>
        </Pressable>
      ) : (
        <View style={styles.backPlaceholder} />
      )}

      <View style={styles.titleGroup}>
        <Text numberOfLines={1} style={styles.title}>
          {title}
        </Text>
        {subtitle ? (
          <Text numberOfLines={1} style={styles.subtitle}>
            {subtitle}
          </Text>
        ) : null}
      </View>

      {rightAction ? <View style={styles.rightAction}>{rightAction}</View> : null}
    </View>
  );
}

function getVisibleBackLabel(backLabel: string): string {
  return backLabel.replace(/^Back(?: to)?\s+/i, '') || 'Back';
}

function getBackAccessibilityLabel(backLabel: string): string {
  return /^Back\b/i.test(backLabel) ? backLabel : `Back to ${backLabel}`;
}

const styles = StyleSheet.create({
  backButton: {
    alignItems: 'center',
    borderRadius: 10,
    flexDirection: 'row',
    flexShrink: 1,
    justifyContent: 'center',
    marginLeft: -8,
    minHeight: 44,
    paddingHorizontal: 8,
  },
  backLabel: {
    color: colors.primaryGreen,
    fontSize: 15,
    fontWeight: '800',
    marginLeft: -2,
    maxWidth: 116,
  },
  backPlaceholder: {
    minWidth: 4,
  },
  disabledButton: {
    opacity: 0.45,
  },
  header: {
    alignItems: 'center',
    backgroundColor: colors.appBackground,
    borderBottomColor: colors.standardBorder,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    minHeight: 64,
    paddingHorizontal: 20,
    paddingVertical: 8,
  },
  pressedButton: {
    backgroundColor: colors.standardBorder,
    opacity: 0.78,
  },
  rightAction: {
    marginLeft: 12,
  },
  subtitle: {
    color: colors.mutedText,
    fontSize: 13,
    fontWeight: '700',
    marginTop: 1,
  },
  title: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '900',
  },
  titleGroup: {
    flex: 1,
    marginLeft: 8,
    minWidth: 0,
  },
});
