import { useState } from 'react';
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
import { createPayment } from '@/src/lib/payments';
import { getUserFacingError } from '@/src/lib/userFacingError';
import type { Job } from '@/src/types/job';

type AddPaymentScreenProps = {
  backLabel?: string;
  job: Job;
  onBack: () => void;
  onCreated: () => void;
};

export function AddPaymentScreen({
  backLabel = 'Back to updates',
  job,
  onBack,
  onCreated,
}: AddPaymentScreenProps) {
  const [amount, setAmount] = useState('');
  const [paymentDate, setPaymentDate] = useState(getLocalDateString());
  const [note, setNote] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const handleBack = useGuardedBack({
    hasUnsavedChanges:
      amount.trim().length > 0 || note.trim().length > 0 || paymentDate !== getLocalDateString(),
    isBusy: isSaving,
    message: 'This unsaved payment will be lost.',
    onBack,
    title: 'Discard payment?',
  });

  const handleSubmit = async () => {
    setErrorMessage(null);

    const parsedAmount = parseMoney(amount);

    if (parsedAmount === null || parsedAmount <= 0) {
      setErrorMessage('Payment amount is required and must be greater than 0.');
      return;
    }

    if (!isIsoDate(paymentDate)) {
      setErrorMessage('Payment date must use YYYY-MM-DD format.');
      return;
    }

    setIsSaving(true);

    try {
      await createPayment(job.id, {
        amount: parsedAmount,
        paymentDate,
        note,
      });
      onCreated();
    } catch (error) {
      setErrorMessage(getUserFacingError(error, 'Unable to add payment. Try again.'));
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
            <Text style={styles.title}>Add payment</Text>
            <Text style={styles.subtitle}>{job.name}</Text>
          </View>

          <View style={styles.form}>
            <Field
              inputMode="decimal"
              label="Amount"
              onChangeText={setAmount}
              placeholder="0"
              value={amount}
            />
            <Field
              label="Payment date"
              onChangeText={setPaymentDate}
              placeholder="YYYY-MM-DD"
              value={paymentDate}
            />
            <Field label="Note" onChangeText={setNote} placeholder="Optional" value={note} />

            {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

            <Pressable
              disabled={isSaving}
              onPress={handleSubmit}
              style={[styles.saveButton, isSaving && styles.disabledButton]}>
              <Text style={styles.saveButtonText}>{isSaving ? 'Saving...' : 'Save payment'}</Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Field({
  label,
  value,
  onChangeText,
  placeholder,
  inputMode,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  inputMode?: 'decimal';
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        inputMode={inputMode}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#8A94A6"
        style={styles.input}
        value={value}
      />
    </View>
  );
}

function parseMoney(value: string): number | null {
  const parsed = Number(value.replace(/[$,]/g, '').trim());

  return Number.isFinite(parsed) ? parsed : null;
}

function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F6F5F2',
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
    color: '#335C43',
    fontSize: 16,
    fontWeight: '800',
  },
  header: {
    marginBottom: 16,
  },
  title: {
    color: '#1F2933',
    fontSize: 30,
    fontWeight: '800',
  },
  subtitle: {
    color: '#64748B',
    fontSize: 16,
    fontWeight: '600',
    marginTop: 4,
  },
  form: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E2E0DA',
    borderRadius: 8,
    borderWidth: 1,
    gap: 14,
    padding: 16,
  },
  field: {
    gap: 6,
  },
  label: {
    color: '#475569',
    fontSize: 14,
    fontWeight: '800',
  },
  input: {
    borderColor: '#C9C3B8',
    borderRadius: 8,
    borderWidth: 1,
    color: '#1F2933',
    fontSize: 16,
    minHeight: 52,
    paddingHorizontal: 14,
  },
  errorText: {
    color: '#B91C1C',
    fontSize: 14,
    lineHeight: 20,
  },
  saveButton: {
    alignItems: 'center',
    backgroundColor: '#335C43',
    borderRadius: 8,
    justifyContent: 'center',
    minHeight: 56,
  },
  disabledButton: {
    opacity: 0.7,
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
  },
});
