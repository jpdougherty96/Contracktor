import { useEffect, useState } from 'react';
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

import { createJobHours } from '@/src/lib/jobHours';
import { fetchCurrentProfileDisplayName } from '@/src/lib/profiles';
import type { Job } from '@/src/types/job';

type AddHoursScreenProps = {
  backLabel?: string;
  job: Job;
  onBack: () => void;
  onCreated: () => void;
};

export function AddHoursScreen({
  backLabel = 'Back to updates',
  job,
  onBack,
  onCreated,
}: AddHoursScreenProps) {
  const [hours, setHours] = useState('');
  const [workDate, setWorkDate] = useState(getTodayDate());
  const [workerName, setWorkerName] = useState('');
  const [note, setNote] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    let isMounted = true;

    const loadDefaultWorkerName = async () => {
      try {
        const displayName = await fetchCurrentProfileDisplayName();

        if (isMounted && displayName) {
          setWorkerName((currentWorkerName) => currentWorkerName || displayName);
        }
      } catch {
        // Worker name is editable, so a missing profile should not block adding hours.
      }
    };

    loadDefaultWorkerName();

    return () => {
      isMounted = false;
    };
  }, []);

  const handleSubmit = async () => {
    setErrorMessage(null);

    const parsedHours = parsePositiveNumber(hours);

    if (parsedHours === null) {
      setErrorMessage('Hours are required and must be greater than 0.');
      return;
    }

    if (!job.hourlyRate || job.hourlyRate <= 0) {
      setErrorMessage('Set the hourly rate for this job before adding hours.');
      return;
    }

    if (!isIsoDate(workDate)) {
      setErrorMessage('Work date must use YYYY-MM-DD format.');
      return;
    }

    setIsSaving(true);

    try {
      await createJobHours(job.id, {
        hourlyRate: job.hourlyRate,
        hours: parsedHours,
        note,
        workDate,
        workerName,
      });
      onCreated();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to add hours.');
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
            <Text style={styles.backButtonText}>{backLabel}</Text>
          </Pressable>

          <View style={styles.header}>
            <Text style={styles.title}>Add hours</Text>
            <Text style={styles.subtitle}>{job.name}</Text>
          </View>

          <View style={styles.form}>
            <View style={styles.rateSummary}>
              <Text style={styles.rateLabel}>Hourly rate for this job</Text>
              <Text style={styles.rateValue}>${job.hourlyRate?.toFixed(2) ?? 'Not set'}/hr</Text>
            </View>
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
              disabled={isSaving}
              onPress={handleSubmit}
              style={[styles.saveButton, isSaving && styles.disabledButton]}>
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

function getTodayDate(): string {
  return new Date().toISOString().slice(0, 10);
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
