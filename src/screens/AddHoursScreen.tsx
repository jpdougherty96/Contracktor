import { useCallback, useEffect, useState } from 'react';
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

import { fetchJobCrewMembers } from '@/src/lib/jobCrew';
import { createJobHours } from '@/src/lib/jobHours';
import { fetchCurrentProfile } from '@/src/lib/profiles';
import type { Job } from '@/src/types/job';

type AddHoursScreenProps = {
  backLabel?: string;
  job: Job;
  onBack: () => void;
  onCreated: () => void;
};

type CrewOption = {
  hourlyRate: number | null;
  id: string;
  name: string;
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
  const [hourlyRate, setHourlyRate] = useState(formatEditableNumber(job.hourlyRate));
  const [crewOptions, setCrewOptions] = useState<CrewOption[]>([]);
  const [selectedCrewOptionId, setSelectedCrewOptionId] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const applyCrewOption = useCallback(
    (option: CrewOption) => {
      setSelectedCrewOptionId(option.id);
      setWorkerName(option.name);
      setHourlyRate(formatEditableNumber(option.hourlyRate ?? job.hourlyRate));
    },
    [job.hourlyRate]
  );

  useEffect(() => {
    let isMounted = true;

    const loadCrewOptions = async () => {
      try {
        const [crewMembers, profile] = await Promise.all([
          fetchJobCrewMembers(job.id),
          fetchCurrentProfile().catch(() => ({ defaultHourlyRate: null, displayName: null })),
        ]);

        const options: CrewOption[] = crewMembers.map((member) => ({
          hourlyRate: member.hourly_rate,
          id: member.id,
          name: member.name,
        }));

        if (options.length === 0 && profile.displayName) {
          options.push({
            hourlyRate: profile.defaultHourlyRate ?? job.hourlyRate ?? null,
            id: 'current-user',
            name: profile.displayName,
          });
        }

        if (isMounted) {
          setCrewOptions(options);

          const defaultOption =
            options.find((option) => option.name.trim() === profile.displayName?.trim()) ?? options[0];
          if (defaultOption) {
            applyCrewOption(defaultOption);
          } else if (profile.displayName) {
            setWorkerName((currentWorkerName) => currentWorkerName || profile.displayName || '');
          }
        }
      } catch {
        // Worker name and rate are editable, so missing crew data should not block adding hours.
      }
    };

    loadCrewOptions();

    return () => {
      isMounted = false;
    };
  }, [applyCrewOption, job.id, job.hourlyRate]);

  const handleSubmit = async () => {
    setErrorMessage(null);

    const parsedHours = parsePositiveNumber(hours);
    const parsedHourlyRate = parsePositiveNumber(hourlyRate);

    if (parsedHours === null) {
      setErrorMessage('Hours are required and must be greater than 0.');
      return;
    }

    if (parsedHourlyRate === null) {
      setErrorMessage('Hourly rate is required and must be greater than 0.');
      return;
    }

    if (!isIsoDate(workDate)) {
      setErrorMessage('Work date must use YYYY-MM-DD format.');
      return;
    }

    setIsSaving(true);

    try {
      await createJobHours(job.id, {
        hourlyRate: parsedHourlyRate,
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
            {crewOptions.length > 0 ? (
              <View style={styles.field}>
                <Text style={styles.label}>Worker</Text>
                <View style={styles.crewGrid}>
                  {crewOptions.map((option) => (
                    <Pressable
                      key={option.id}
                      onPress={() => applyCrewOption(option)}
                      style={[
                        styles.crewOption,
                        selectedCrewOptionId === option.id && styles.selectedCrewOption,
                      ]}>
                      <Text
                        style={[
                          styles.crewOptionName,
                          selectedCrewOptionId === option.id && styles.selectedCrewOptionText,
                        ]}>
                        {option.name}
                      </Text>
                      <Text
                        style={[
                          styles.crewOptionRate,
                          selectedCrewOptionId === option.id && styles.selectedCrewOptionText,
                        ]}>
                        {option.hourlyRate == null ? 'Rate not set' : `${formatCurrency(option.hourlyRate)}/hr`}
                      </Text>
                    </Pressable>
                  ))}
                </View>
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
            <Field
              inputMode="decimal"
              label="Hourly rate"
              onChangeText={setHourlyRate}
              placeholder="0"
              value={hourlyRate}
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

function formatEditableNumber(value: number | null | undefined): string {
  return value === null || value === undefined ? '' : String(value);
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    currency: 'USD',
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
    style: 'currency',
  }).format(value);
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
  crewGrid: {
    gap: 8,
  },
  crewOption: {
    borderColor: '#C9C3B8',
    borderRadius: 8,
    borderWidth: 1,
    gap: 3,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  selectedCrewOption: {
    backgroundColor: '#335C43',
    borderColor: '#335C43',
  },
  crewOptionName: {
    color: '#1F2933',
    fontSize: 15,
    fontWeight: '900',
  },
  crewOptionRate: {
    color: '#64748B',
    fontSize: 13,
    fontWeight: '700',
  },
  selectedCrewOptionText: {
    color: '#FFFFFF',
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
