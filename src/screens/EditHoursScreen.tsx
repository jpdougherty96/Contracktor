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

import { fetchJobHours, minutesToHours, updateJobHours, type JobHoursEntry } from '@/src/lib/jobHours';
import type { Job } from '@/src/types/job';

type EditHoursScreenProps = {
  hoursId: string;
  job: Job;
  onBack: () => void;
  onSaved: () => void;
};

export function EditHoursScreen({ hoursId, job, onBack, onSaved }: EditHoursScreenProps) {
  const [hoursEntry, setHoursEntry] = useState<JobHoursEntry | null>(null);
  const [hours, setHours] = useState('');
  const [workDate, setWorkDate] = useState('');
  const [workerName, setWorkerName] = useState('');
  const [note, setNote] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    const loadHours = async () => {
      setIsLoading(true);
      setErrorMessage(null);

      try {
        const nextHoursEntry = await fetchJobHours(hoursId);

        if (isMounted) {
          setHoursEntry(nextHoursEntry);
          setHours(String(minutesToHours(nextHoursEntry.duration_minutes)));
          setWorkDate(nextHoursEntry.work_date);
          setWorkerName(nextHoursEntry.worker_name ?? '');
          setNote(nextHoursEntry.description ?? '');
        }
      } catch (error) {
        if (isMounted) {
          setErrorMessage(error instanceof Error ? error.message : 'Unable to load hours.');
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    loadHours();

    return () => {
      isMounted = false;
    };
  }, [hoursId]);

  const handleSubmit = async () => {
    setErrorMessage(null);

    const parsedHours = parsePositiveNumber(hours);

    if (parsedHours === null) {
      setErrorMessage('Hours are required and must be greater than 0.');
      return;
    }

    if (!isIsoDate(workDate)) {
      setErrorMessage('Work date must use YYYY-MM-DD format.');
      return;
    }

    setIsSaving(true);

    try {
      await updateJobHours(hoursId, {
        hours: parsedHours,
        note,
        workDate,
        workerName,
      });
      onSaved();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to save hours.');
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
          <Pressable style={styles.backButton} onPress={onBack}>
            <Text style={styles.backButtonText}>Back to job</Text>
          </Pressable>

          <View style={styles.header}>
            <Text style={styles.title}>Edit hours</Text>
            <Text style={styles.subtitle}>{job.name}</Text>
          </View>

          <View style={styles.form}>
            {isLoading ? (
              <View style={styles.loadingRow}>
                <ActivityIndicator color="#335C43" />
                <Text style={styles.loadingText}>Loading hours...</Text>
              </View>
            ) : null}

            {hoursEntry ? (
              <View style={styles.rateSummary}>
                <Text style={styles.rateLabel}>Hourly rate saved on this entry</Text>
                <Text style={styles.rateValue}>${hoursEntry.hourly_rate.toFixed(2)}/hr</Text>
              </View>
            ) : null}

            <Field
              inputMode="decimal"
              label="Hours"
              onChangeText={setHours}
              placeholder="0"
              value={hours}
            />
            <Field
              label="Work date"
              onChangeText={setWorkDate}
              placeholder="YYYY-MM-DD"
              value={workDate}
            />
            <Field
              label="Worker name"
              onChangeText={setWorkerName}
              placeholder="Optional"
              value={workerName}
            />
            <Field label="Note" onChangeText={setNote} placeholder="Optional" value={note} />

            {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

            <Pressable
              disabled={isSaving || isLoading || !hoursEntry}
              onPress={handleSubmit}
              style={[styles.saveButton, (isSaving || isLoading || !hoursEntry) && styles.disabledButton]}>
              <Text style={styles.saveButtonText}>{isSaving ? 'Saving...' : 'Save hours'}</Text>
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

function parsePositiveNumber(value: string): number | null {
  const parsed = Number(value.replace(/[$,]/g, '').trim());

  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
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
  rateSummary: {
    backgroundColor: '#F6F5F2',
    borderColor: '#E2E0DA',
    borderRadius: 8,
    borderWidth: 1,
    padding: 12,
  },
  rateLabel: {
    color: '#64748B',
    fontSize: 13,
    fontWeight: '800',
  },
  rateValue: {
    color: '#1F2933',
    fontSize: 18,
    fontWeight: '800',
    marginTop: 3,
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
