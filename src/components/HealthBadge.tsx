import { StyleSheet, Text, View } from 'react-native';

import type { JobHealth } from '@/src/lib/financials';

type HealthBadgeProps = {
  health: JobHealth;
};

const healthStyles = {
  Healthy: {
    backgroundColor: '#E8F5EE',
    color: '#166534',
  },
  Warning: {
    backgroundColor: '#FFF7E6',
    color: '#92400E',
  },
  'Losing Money': {
    backgroundColor: '#FDECEC',
    color: '#991B1B',
  },
  New: {
    backgroundColor: '#EEF2F7',
    color: '#475569',
  },
};

export function HealthBadge({ health }: HealthBadgeProps) {
  const colors = healthStyles[health];

  return (
    <View style={[styles.badge, { backgroundColor: colors.backgroundColor }]}>
      <Text style={[styles.text, { color: colors.color }]}>{health}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  text: {
    fontSize: 12,
    fontWeight: '700',
  },
});
