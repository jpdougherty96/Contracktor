import { useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useGuardedBack } from '@/src/hooks/useGuardedBack';
import { getLocalDateString } from '@/src/lib/localDate';
import {
  createManualExpense,
  expenseTypes,
  type ExpenseType,
} from '@/src/lib/manualExpenses';
import { getUserFacingError } from '@/src/lib/userFacingError';
import { buttonStyles, colors, radii } from '@/src/styles/theme';
import type { Job } from '@/src/types/job';

type AddManualExpenseScreenProps = {
  backLabel?: string;
  inventoryMode?: boolean;
  job?: Job | null;
  onBack: () => void;
  onCreated: () => void;
};

export function AddManualExpenseScreen({
  backLabel = 'Back to updates',
  inventoryMode = false,
  job,
  onBack,
  onCreated,
}: AddManualExpenseScreenProps) {
  const defaultExpenseType: ExpenseType = inventoryMode ? 'tool' : 'material';
  const defaultBillable = inventoryMode ? false : job?.jobType === 'time_and_materials';
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [expenseType, setExpenseType] = useState<ExpenseType>(defaultExpenseType);
  const [expenseDate, setExpenseDate] = useState(getLocalDateString());
  const [billable, setBillable] = useState(defaultBillable);
  const [notes, setNotes] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const handleBack = useGuardedBack({
    hasUnsavedChanges:
      description.trim().length > 0 ||
      amount.trim().length > 0 ||
      notes.trim().length > 0 ||
      expenseDate !== getLocalDateString() ||
      expenseType !== defaultExpenseType ||
      billable !== defaultBillable,
    isBusy: isSaving,
    message: 'This unsaved expense will be lost.',
    onBack,
    title: 'Discard expense?',
  });

  const subtitle = useMemo(() => {
    if (inventoryMode) {
      return 'Tools / Inventory';
    }

    return job?.name ?? 'Job expense';
  }, [inventoryMode, job?.name]);

  const handleSubmit = async () => {
    setErrorMessage(null);

    const parsedAmount = parseMoney(amount);

    if (!description.trim()) {
      setErrorMessage('Description is required.');
      return;
    }

    if (parsedAmount === null || parsedAmount <= 0) {
      setErrorMessage('Amount is required and must be greater than 0.');
      return;
    }

    if (!isIsoDate(expenseDate)) {
      setErrorMessage('Date must use YYYY-MM-DD format.');
      return;
    }

    setIsSaving(true);

    try {
      await createManualExpense({
        amount: parsedAmount,
        billable,
        description: description.trim(),
        expenseDate,
        expenseType,
        jobId: inventoryMode ? null : job?.id ?? null,
        notes,
      });
      onCreated();
    } catch (error) {
      setErrorMessage(getUserFacingError(error, 'Unable to add expense. Try again.'));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardView}>
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          <Pressable disabled={isSaving} style={styles.backButton} onPress={handleBack}>
            <Text style={styles.backButtonText}>{backLabel}</Text>
          </Pressable>

          <View style={styles.header}>
            <Text style={styles.title}>Add expense</Text>
            <Text style={styles.subtitle}>{subtitle}</Text>
          </View>

          <View style={styles.form}>
            <Field
              label="Description"
              onChangeText={setDescription}
              placeholder="What is this for?"
              value={description}
            />
            <Field
              inputMode="decimal"
              label="Amount"
              onChangeText={setAmount}
              placeholder="0.00"
              value={amount}
            />

            <View style={styles.field}>
              <Text style={styles.label}>Category</Text>
              <View style={styles.categoryGrid}>
                {expenseTypes.map((type) => (
                  <Pressable
                    accessibilityRole="radio"
                    accessibilityState={{ checked: expenseType === type }}
                    key={type}
                    onPress={() => {
                      setExpenseType(type);
                      if (inventoryMode || type === 'tool' || type === 'inventory') {
                        setBillable(false);
                      }
                    }}
                    style={[
                      styles.categoryButton,
                      expenseType === type && styles.selectedCategoryButton,
                    ]}>
                    <Text
                      style={[
                        styles.categoryButtonText,
                        expenseType === type && styles.selectedCategoryButtonText,
                      ]}>
                      {formatExpenseType(type)}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            <Field
              label="Date"
              onChangeText={setExpenseDate}
              placeholder="YYYY-MM-DD"
              value={expenseDate}
            />

            <Pressable
              accessibilityRole="checkbox"
              accessibilityState={{ checked: billable }}
              onPress={() => setBillable((current) => !current)}
              style={[styles.billableToggle, billable && styles.selectedBillableToggle]}>
              <View style={[styles.checkbox, billable && styles.checkedBox]} />
              <Text style={[styles.billableText, billable && styles.selectedBillableText]}>
                Billable
              </Text>
            </Pressable>

            <Field
              label="Notes"
              multiline
              onChangeText={setNotes}
              placeholder="Optional"
              value={notes}
            />

            {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

            <Pressable
              disabled={isSaving}
              onPress={handleSubmit}
              style={[styles.saveButton, isSaving && styles.disabledButton]}>
              <Text style={styles.saveButtonText}>
                {isSaving ? 'Adding expense...' : 'Add expense'}
              </Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Field({
  inputMode,
  label,
  multiline = false,
  onChangeText,
  placeholder,
  value,
}: {
  inputMode?: 'decimal';
  label: string;
  multiline?: boolean;
  onChangeText: (value: string) => void;
  placeholder: string;
  value: string;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        inputMode={inputMode}
        multiline={multiline}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#8A94A6"
        style={[styles.input, multiline && styles.multilineInput]}
        value={value}
      />
    </View>
  );
}

function parseMoney(value: string): number | null {
  const parsed = Number(value.replace(/[$,]/g, '').trim());

  return Number.isFinite(parsed) ? roundMoney(parsed) : null;
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function formatExpenseType(value: ExpenseType): string {
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
  keyboardView: {
    flex: 1,
  },
  container: {
    padding: 20,
    paddingBottom: 36,
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
  form: {
    backgroundColor: colors.cardBackground,
    borderColor: colors.standardBorder,
    borderRadius: radii.card,
    borderWidth: 1,
    gap: 14,
    padding: 16,
  },
  field: {
    gap: 6,
  },
  label: {
    color: colors.mutedText,
    fontSize: 14,
    fontWeight: '800',
  },
  input: {
    borderColor: colors.strongBorder,
    borderRadius: 8,
    borderWidth: 1,
    color: colors.text,
    fontSize: 16,
    minHeight: 52,
    paddingHorizontal: 14,
  },
  multilineInput: {
    minHeight: 86,
    paddingTop: 12,
    textAlignVertical: 'top',
  },
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  categoryButton: {
    borderColor: colors.strongBorder,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  selectedCategoryButton: {
    backgroundColor: colors.primaryGreen,
    borderColor: colors.primaryGreen,
  },
  categoryButtonText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '800',
  },
  selectedCategoryButtonText: {
    color: colors.warmWhite,
  },
  billableToggle: {
    alignItems: 'center',
    borderColor: colors.strongBorder,
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    minHeight: 48,
    paddingHorizontal: 12,
  },
  selectedBillableToggle: {
    borderColor: colors.primaryGreen,
  },
  checkbox: {
    borderColor: colors.strongBorder,
    borderRadius: 5,
    borderWidth: 2,
    height: 20,
    width: 20,
  },
  checkedBox: {
    backgroundColor: colors.primaryGreen,
    borderColor: colors.primaryGreen,
  },
  billableText: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '800',
  },
  selectedBillableText: {
    color: colors.primaryGreen,
  },
  errorText: {
    color: colors.danger,
    fontSize: 14,
    lineHeight: 20,
  },
  saveButton: {
    ...buttonStyles.primary.container,
  },
  saveButtonText: {
    ...buttonStyles.primary.text,
  },
  disabledButton: {
    opacity: 0.55,
  },
});
