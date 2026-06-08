import { useCallback, useEffect, useMemo, useState } from 'react';
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

type TimeEntryMode = 'duration' | 'range';

export function AddHoursScreen({
  backLabel = 'Back to updates',
  job,
  onBack,
  onCreated,
}: AddHoursScreenProps) {
  const [hours, setHours] = useState('');
  const [timeEntryMode, setTimeEntryMode] = useState<TimeEntryMode>('duration');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [breakMinutes, setBreakMinutes] = useState('');
  const [workDate, setWorkDate] = useState(getTodayDate());
  const [workerName, setWorkerName] = useState('');
  const [hourlyRate, setHourlyRate] = useState(formatEditableNumber(job.hourlyRate));
  const [crewOptions, setCrewOptions] = useState<CrewOption[]>([]);
  const [selectedCrewOptionId, setSelectedCrewOptionId] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const calculatedHours = useMemo(
    () => calculateTimeRangeHours(startTime, endTime, breakMinutes),
    [breakMinutes, endTime, startTime]
  );

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

    const parsedHours =
      timeEntryMode === 'duration' ? parsePositiveNumber(hours) : calculatedHours.hours;
    const parsedHourlyRate = parsePositiveNumber(hourlyRate);

    if (parsedHours === null) {
      setErrorMessage(
        timeEntryMode === 'duration'
          ? 'Hours are required and must be greater than 0.'
          : calculatedHours.error ?? 'Enter a valid start time and end time.'
      );
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
            <View style={styles.field}>
              <Text style={styles.label}>Time entry</Text>
              <View style={styles.segmentedControl}>
                {(['duration', 'range'] as TimeEntryMode[]).map((mode) => (
                  <Pressable
                    key={mode}
                    onPress={() => setTimeEntryMode(mode)}
                    style={[
                      styles.segmentButton,
                      timeEntryMode === mode && styles.selectedSegmentButton,
                    ]}>
                    <Text
                      style={[
                        styles.segmentButtonText,
                        timeEntryMode === mode && styles.selectedSegmentButtonText,
                      ]}>
                      {mode === 'duration' ? 'Duration' : 'Time range'}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
            {timeEntryMode === 'duration' ? (
              <Field
                inputMode="decimal"
                label="Hours"
                onChangeText={setHours}
                placeholder="0"
                value={hours}
              />
            ) : (
              <View style={styles.timeRangePanel}>
                <View style={styles.timeRangeGrid}>
                  <Field
                    label="Start time"
                    onChangeText={setStartTime}
                    placeholder="8:00 AM"
                    value={startTime}
                  />
                  <Field
                    label="End time"
                    onChangeText={setEndTime}
                    placeholder="4:30 PM"
                    value={endTime}
                  />
                </View>
                <Field
                  inputMode="decimal"
                  label="Break minutes"
                  onChangeText={setBreakMinutes}
                  placeholder="Optional"
                  value={breakMinutes}
                />
                <View style={styles.calculatedPanel}>
                  <Text style={styles.calculatedLabel}>Calculated hours</Text>
                  <Text
                    style={[
                      styles.calculatedValue,
                      calculatedHours.error && styles.calculatedErrorValue,
                    ]}>
                    {calculatedHours.hours === null
                      ? calculatedHours.error ?? 'Enter start and end times'
                      : formatHours(calculatedHours.hours)}
                  </Text>
                </View>
              </View>
            )}
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

function parseNonNegativeNumber(value: string): number | null {
  const trimmedValue = value.replace(/[$,]/g, '').trim();

  if (!trimmedValue) {
    return 0;
  }

  const parsed = Number(trimmedValue);

  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function calculateTimeRangeHours(
  startTime: string,
  endTime: string,
  breakMinutes: string
): { error?: string; hours: number | null } {
  if (!startTime.trim() && !endTime.trim()) {
    return { hours: null };
  }

  const startMinutes = parseTimeOfDay(startTime);
  const endMinutes = parseTimeOfDay(endTime);
  const parsedBreakMinutes = parseNonNegativeNumber(breakMinutes);

  if (startMinutes === null || endMinutes === null) {
    return { error: 'Use times like 8:00 AM or 4:30 PM.', hours: null };
  }

  if (parsedBreakMinutes === null) {
    return { error: 'Break minutes must be 0 or more.', hours: null };
  }

  const workedMinutes = endMinutes - startMinutes - parsedBreakMinutes;

  if (endMinutes <= startMinutes) {
    return { error: 'End time must be after start time.', hours: null };
  }

  if (workedMinutes <= 0) {
    return { error: 'Calculated hours must be greater than 0.', hours: null };
  }

  return { hours: Math.round((workedMinutes / 60) * 100) / 100 };
}

function parseTimeOfDay(value: string): number | null {
  const normalizedValue = value.trim().toLowerCase().replace(/\s+/g, '');

  if (!normalizedValue) {
    return null;
  }

  const match = normalizedValue.match(/^(\d{1,2})(?::?(\d{2}))?(am|pm)?$/);

  if (!match) {
    return null;
  }

  let hours = Number(match[1]);
  const minutes = match[2] ? Number(match[2]) : 0;
  const meridiem = match[3];

  if (!Number.isInteger(hours) || !Number.isInteger(minutes) || minutes < 0 || minutes > 59) {
    return null;
  }

  if (meridiem) {
    if (hours < 1 || hours > 12) {
      return null;
    }

    if (meridiem === 'am') {
      hours = hours === 12 ? 0 : hours;
    } else {
      hours = hours === 12 ? 12 : hours + 12;
    }
  } else if (hours < 0 || hours > 23) {
    return null;
  }

  return hours * 60 + minutes;
}

function formatHours(hours: number): string {
  return `${new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 2,
    minimumFractionDigits: hours % 1 === 0 ? 0 : 2,
  }).format(hours)} hrs`;
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
  segmentedControl: {
    backgroundColor: '#F6F5F2',
    borderColor: '#D8D3CA',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    padding: 3,
  },
  segmentButton: {
    alignItems: 'center',
    borderRadius: 6,
    flex: 1,
    justifyContent: 'center',
    minHeight: 42,
  },
  selectedSegmentButton: {
    backgroundColor: '#335C43',
  },
  segmentButtonText: {
    color: '#475569',
    fontSize: 14,
    fontWeight: '900',
  },
  selectedSegmentButtonText: {
    color: '#FFFFFF',
  },
  timeRangePanel: {
    gap: 12,
  },
  timeRangeGrid: {
    gap: 12,
  },
  calculatedPanel: {
    backgroundColor: '#F6F5F2',
    borderColor: '#E2E0DA',
    borderRadius: 8,
    borderWidth: 1,
    gap: 3,
    padding: 12,
  },
  calculatedLabel: {
    color: '#64748B',
    fontSize: 13,
    fontWeight: '800',
  },
  calculatedValue: {
    color: '#1F2933',
    fontSize: 18,
    fontWeight: '900',
  },
  calculatedErrorValue: {
    color: '#B91C1C',
    fontSize: 14,
    lineHeight: 20,
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
