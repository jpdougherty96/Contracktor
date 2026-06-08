import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  fetchToolsInventoryExpenses,
  type ToolsInventoryExpense,
} from '@/src/lib/toolsInventoryExpenses';
import { colors, radii } from '@/src/styles/theme';

type ToolsInventoryScreenProps = {
  onAddManualExpense: () => void;
  onBack: () => void;
};

export function ToolsInventoryScreen({ onAddManualExpense, onBack }: ToolsInventoryScreenProps) {
  const [expenses, setExpenses] = useState<ToolsInventoryExpense[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadExpenses = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);

    try {
      setExpenses(await fetchToolsInventoryExpenses());
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'Unable to load tools and inventory.'
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadExpenses();
  }, [loadExpenses]);

  const totalValue = useMemo(
    () => expenses.reduce((sum, expense) => sum + (expense.total_amount ?? 0), 0),
    [expenses]
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <Pressable style={styles.backButton} onPress={onBack}>
          <Text style={styles.backButtonText}>Back home</Text>
        </Pressable>

        <View style={styles.header}>
          <Text style={styles.title}>Tools / Inventory</Text>
          <Text style={styles.subtitle}>Non-job purchases saved outside customer job costs.</Text>
        </View>

        <Pressable style={styles.primaryButton} onPress={onAddManualExpense}>
          <Text style={styles.primaryButtonText}>Add Tools / Inventory expense</Text>
        </Pressable>

        <View style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>Tracked value</Text>
          <Text style={styles.summaryValue}>{formatCurrency(totalValue)}</Text>
          <Text style={styles.summaryHelp}>
            Includes reviewed tool and inventory expenses with no job assigned.
          </Text>
        </View>

        {isLoading ? <StatePanel title="Loading tools and inventory..." /> : null}
        {!isLoading && errorMessage ? (
          <StatePanel title="Unable to load tools and inventory" detail={errorMessage} onRetry={loadExpenses} />
        ) : null}
        {!isLoading && !errorMessage && expenses.length === 0 ? (
          <StatePanel
            title="No tools or inventory yet"
            detail="Assign receipt line items to Tools / Inventory and they will show up here."
          />
        ) : null}

        {!isLoading && !errorMessage && expenses.length > 0 ? (
          <View style={styles.list}>
            {expenses.map((expense) => (
              <View key={expense.id ?? `${expense.expense_date}-${expense.description}`} style={styles.row}>
                <View style={styles.rowText}>
                  <Text style={styles.rowTitle}>{expense.description ?? 'Expense'}</Text>
                  <Text style={styles.rowMeta}>
                    {formatDate(expense.expense_date)} · {formatType(expense.expense_type)}
                    {expense.receipt_vendor ? ` · ${expense.receipt_vendor}` : ''}
                  </Text>
                </View>
                <Text style={styles.rowAmount}>{formatCurrency(expense.total_amount)}</Text>
              </View>
            ))}
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function StatePanel({
  detail,
  onRetry,
  title,
}: {
  detail?: string;
  onRetry?: () => void;
  title: string;
}) {
  return (
    <View style={styles.statePanel}>
      <Text style={styles.stateTitle}>{title}</Text>
      {detail ? <Text style={styles.stateDetail}>{detail}</Text> : null}
      {onRetry ? (
        <Pressable style={styles.retryButton} onPress={onRetry}>
          <Text style={styles.retryButtonText}>Try again</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function formatCurrency(value: number | null | undefined): string {
  return new Intl.NumberFormat('en-US', {
    currency: 'USD',
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
    style: 'currency',
  }).format(value ?? 0);
}

function formatDate(value: string | null | undefined): string {
  if (!value) {
    return 'No date';
  }

  return new Intl.DateTimeFormat('en-US', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value));
}

function formatType(value: string | null | undefined): string {
  if (!value) {
    return 'Other';
  }

  return value
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: colors.appBackground,
    flex: 1,
  },
  container: {
    padding: 20,
    paddingBottom: 36,
  },
  backButton: {
    alignSelf: 'flex-start',
    justifyContent: 'center',
    marginBottom: 10,
    minHeight: 44,
  },
  backButtonText: {
    color: colors.primaryGreen,
    fontSize: 16,
    fontWeight: '800',
  },
  header: {
    marginBottom: 16,
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
  summaryCard: {
    backgroundColor: colors.cardBackground,
    borderColor: colors.standardBorder,
    borderRadius: radii.card,
    borderWidth: 1,
    marginBottom: 16,
    padding: 16,
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: colors.primaryGreen,
    borderRadius: radii.button,
    justifyContent: 'center',
    marginBottom: 16,
    minHeight: 48,
    paddingHorizontal: 18,
  },
  primaryButtonText: {
    color: colors.warmWhite,
    fontSize: 16,
    fontWeight: '900',
  },
  summaryLabel: {
    color: colors.mutedText,
    fontSize: 13,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  summaryValue: {
    color: colors.text,
    fontSize: 30,
    fontWeight: '900',
    marginTop: 4,
  },
  summaryHelp: {
    color: colors.mutedText,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
    marginTop: 6,
  },
  list: {
    gap: 10,
  },
  row: {
    alignItems: 'flex-start',
    backgroundColor: colors.cardBackground,
    borderColor: colors.standardBorder,
    borderRadius: radii.card,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
    padding: 14,
  },
  rowText: {
    flex: 1,
    gap: 4,
  },
  rowTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '900',
    lineHeight: 20,
  },
  rowMeta: {
    color: colors.mutedText,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18,
  },
  rowAmount: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '900',
  },
  statePanel: {
    backgroundColor: colors.cardBackground,
    borderColor: colors.standardBorder,
    borderRadius: radii.card,
    borderWidth: 1,
    padding: 16,
  },
  stateTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '900',
  },
  stateDetail: {
    color: colors.mutedText,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
    marginTop: 6,
  },
  retryButton: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderColor: colors.primaryGreen,
    borderRadius: radii.button,
    borderWidth: 1,
    justifyContent: 'center',
    marginTop: 12,
    minHeight: 42,
    paddingHorizontal: 16,
  },
  retryButtonText: {
    color: colors.primaryGreen,
    fontSize: 14,
    fontWeight: '900',
  },
});
