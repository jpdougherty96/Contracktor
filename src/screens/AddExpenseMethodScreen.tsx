import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, radii } from '@/src/styles/theme';

type AddExpenseMethodScreenProps = {
  contextLabel: string;
  onBack: () => void;
  onManualExpense: () => void;
  onReceipt: () => void;
};

export function AddExpenseMethodScreen({
  contextLabel,
  onBack,
  onManualExpense,
  onReceipt,
}: AddExpenseMethodScreenProps) {
  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <Pressable style={styles.backButton} onPress={onBack}>
          <Text style={styles.backButtonText}>Back</Text>
        </Pressable>

        <View style={styles.header}>
          <Text style={styles.title}>Add expense</Text>
          <Text style={styles.subtitle}>{contextLabel}</Text>
        </View>

        <View style={styles.optionList}>
          <Pressable style={styles.optionButton} onPress={onReceipt}>
            <Text style={styles.optionTitle}>Receipt</Text>
            <Text style={styles.optionText}>Take or upload a receipt photo.</Text>
          </Pressable>
          <Pressable style={styles.optionButton} onPress={onManualExpense}>
            <Text style={styles.optionTitle}>Manual</Text>
            <Text style={styles.optionText}>No receipt? Enter the cost yourself.</Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: colors.appBackground,
    flex: 1,
  },
  container: {
    flex: 1,
    padding: 20,
  },
  backButton: {
    alignSelf: 'flex-start',
    justifyContent: 'center',
    marginBottom: 8,
    minHeight: 44,
  },
  backButtonText: {
    color: colors.primaryGreen,
    fontSize: 16,
    fontWeight: '800',
  },
  header: {
    marginBottom: 18,
  },
  title: {
    color: colors.text,
    fontSize: 30,
    fontWeight: '900',
  },
  subtitle: {
    color: colors.mutedText,
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 22,
    marginTop: 4,
  },
  optionList: {
    gap: 14,
  },
  optionButton: {
    backgroundColor: colors.cardBackground,
    borderColor: colors.standardBorder,
    borderRadius: radii.card,
    borderWidth: 1,
    gap: 6,
    minHeight: 96,
    padding: 18,
  },
  optionTitle: {
    color: colors.text,
    fontSize: 21,
    fontWeight: '900',
  },
  optionText: {
    color: colors.mutedText,
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 21,
  },
});
