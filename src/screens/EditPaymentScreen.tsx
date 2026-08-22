import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
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
import { fetchPayment, updatePayment } from '@/src/lib/payments';
import { getUserFacingError } from '@/src/lib/userFacingError';
import type { Job } from '@/src/types/job';

type EditPaymentScreenProps = {
  job: Job;
  onBack: () => void;
  onSaved: () => void;
  paymentId: string;
};

export function EditPaymentScreen({ job, onBack, onSaved, paymentId }: EditPaymentScreenProps) {
  const [amount, setAmount] = useState('');
  const [paymentDate, setPaymentDate] = useState('');
  const [note, setNote] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [baselineSignature, setBaselineSignature] = useState<string | null>(null);
  const [loadKey, setLoadKey] = useState(0);
  const currentSignature = JSON.stringify({ amount, note, paymentDate });
  const handleBack = useGuardedBack({
    hasUnsavedChanges: baselineSignature !== null && currentSignature !== baselineSignature,
    isBusy: isSaving,
    message: 'Your unsaved payment changes will be lost.',
    onBack,
    title: 'Discard payment changes?',
  });

  useEffect(() => {
    let isMounted = true;

    const loadPayment = async () => {
      setIsLoading(true);
      setErrorMessage(null);
      setBaselineSignature(null);

      try {
        const payment = await fetchPayment(paymentId);

        if (isMounted) {
          setAmount(String(payment.amount));
          setPaymentDate(payment.payment_date);
          setNote(payment.note ?? '');
          setBaselineSignature(
            JSON.stringify({
              amount: String(payment.amount),
              note: payment.note ?? '',
              paymentDate: payment.payment_date,
            })
          );
        }
      } catch (error) {
        if (isMounted) {
          setErrorMessage(getUserFacingError(error, 'Unable to load payment.'));
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    loadPayment();

    return () => {
      isMounted = false;
    };
  }, [loadKey, paymentId]);

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
      await updatePayment(paymentId, {
        amount: parsedAmount,
        note,
        paymentDate,
      });
      onSaved();
    } catch (error) {
      setErrorMessage(getUserFacingError(error, 'Unable to save payment. Try again.'));
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
            <Text style={styles.backButtonText}>Back to job</Text>
          </Pressable>

          <View style={styles.header}>
            <Text style={styles.title}>Edit payment</Text>
            <Text style={styles.subtitle}>{job.name}</Text>
          </View>

          <View style={styles.form}>
            {isLoading ? (
              <View style={styles.loadingRow}>
                <ActivityIndicator color="#335C43" />
                <Text style={styles.loadingText}>Loading payment...</Text>
              </View>
            ) : null}

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
            {!isLoading && baselineSignature === null ? (
              <Pressable style={styles.retryButton} onPress={() => setLoadKey((key) => key + 1)}>
                <Text style={styles.retryButtonText}>Try again</Text>
              </Pressable>
            ) : null}

            <Pressable
              disabled={isSaving || isLoading || baselineSignature === null}
              onPress={handleSubmit}
              style={[
                styles.saveButton,
                (isSaving || isLoading || baselineSignature === null) && styles.disabledButton,
              ]}>
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
  loadingRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  loadingText: {
    color: '#64748B',
    fontSize: 14,
    fontWeight: '700',
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
  retryButton: {
    alignItems: 'center',
    borderColor: '#335C43',
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 44,
  },
  retryButtonText: {
    color: '#335C43',
    fontSize: 15,
    fontWeight: '800',
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
