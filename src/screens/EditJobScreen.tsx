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

import {
  createCrewKey,
  JobCrewEditor,
  type CrewFormMember,
} from '@/src/components/JobCrewEditor';
import { fetchJobCrewMembers, replaceJobCrewMembers } from '@/src/lib/jobCrew';
import { updateJob } from '@/src/lib/jobs';
import { fetchCurrentProfile } from '@/src/lib/profiles';
import { getUserFacingError } from '@/src/lib/userFacingError';
import type { Job, JobType } from '@/src/types/job';

const jobStatuses = ['active', 'paused', 'completed', 'archived'];

type EditJobScreenProps = {
  job: Job;
  onCancel: () => void;
  onSaved: (job: Job) => void;
};

export function EditJobScreen({ job, onCancel, onSaved }: EditJobScreenProps) {
  const [name, setName] = useState(job.name);
  const [clientName, setClientName] = useState(job.clientName === 'No client name' ? '' : job.clientName);
  const [location, setLocation] = useState(job.location ?? '');
  const [jobType, setJobType] = useState<JobType>(job.jobType);
  const [quoteAmount, setQuoteAmount] = useState(formatEditableNumber(job.quoteAmount));
  const [hourlyRate, setHourlyRate] = useState(formatEditableNumber(job.hourlyRate));
  const [estimatedLaborHours, setEstimatedLaborHours] = useState(
    formatEditableNumber(job.estimatedLaborHours)
  );
  const [estimatedMaterialCost, setEstimatedMaterialCost] = useState(
    formatEditableNumber(job.estimatedMaterialCost)
  );
  const [estimatedOtherCost, setEstimatedOtherCost] = useState(
    formatEditableNumber(getEstimatedOtherCost(job))
  );
  const [crewMembers, setCrewMembers] = useState<CrewFormMember[]>([
    { hourlyRate: '', key: createCrewKey(), name: '' },
  ]);
  const [status, setStatus] = useState(job.status || 'active');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    let isMounted = true;

    const loadCrew = async () => {
      try {
        const [members, profile] = await Promise.all([
          fetchJobCrewMembers(job.id),
          fetchCurrentProfile().catch(() => ({ defaultHourlyRate: null, displayName: null })),
        ]);

        if (!isMounted) {
          return;
        }

        if (members.length > 0) {
          setCrewMembers(
            members.map((member) => ({
              hourlyRate: formatEditableNumber(member.hourly_rate),
              key: member.id,
              name: member.name,
            }))
          );
          return;
        }

        setCrewMembers([
          {
            hourlyRate:
              profile.defaultHourlyRate == null
                ? formatEditableNumber(job.hourlyRate)
                : formatEditableNumber(profile.defaultHourlyRate),
            key: createCrewKey(),
            name: profile.displayName ?? '',
          },
        ]);
      } catch (error) {
        if (isMounted) {
          setErrorMessage(getUserFacingError(error, 'Unable to load job crew.'));
        }
      }
    };

    loadCrew();

    return () => {
      isMounted = false;
    };
  }, [job.id, job.hourlyRate]);

  const handleSubmit = async () => {
    setErrorMessage(null);

    const parsedQuoteAmount =
      jobType === 'fixed_bid' ? parseRequiredNumber(quoteAmount) : parseOptionalNumber(quoteAmount);
    const parsedHourlyRate = parseOptionalNumber(hourlyRate);
    const parsedLaborHours = parseOptionalNumber(estimatedLaborHours);
    const parsedMaterialCost = parseOptionalNumber(estimatedMaterialCost);
    const parsedOtherCost = parseOptionalNumber(estimatedOtherCost);
    const parsedCrewMembers = parseCrewMembers(crewMembers);

    if (!name.trim()) {
      setErrorMessage('Job name is required.');
      return;
    }

    if (jobType === 'fixed_bid' && parsedQuoteAmount === null) {
      setErrorMessage('Quote amount is required and must be a valid number.');
      return;
    }

    if (parsedQuoteAmount === undefined || parsedHourlyRate === undefined) {
      setErrorMessage('Quote amount and hourly rate must be valid numbers when provided.');
      return;
    }

    if (
      parsedLaborHours === undefined ||
      parsedMaterialCost === undefined ||
      parsedOtherCost === undefined
    ) {
      setErrorMessage('Estimates must be valid numbers when provided.');
      return;
    }

    if (parsedCrewMembers === undefined) {
      setErrorMessage('Crew member names and rates must be valid when provided.');
      return;
    }

    setIsSaving(true);

    try {
      const updatedJob = await updateJob(job.id, {
        clientName,
        jobType,
        estimatedLaborHours: parsedLaborHours,
        estimatedMaterialCost: parsedMaterialCost,
        estimatedMiscCost: parsedOtherCost,
        estimatedSubCost: null,
        hourlyRate: parsedHourlyRate,
        location,
        name: name.trim(),
        quoteAmount: parsedQuoteAmount ?? 0,
        status,
      });
      await replaceJobCrewMembers(job.id, parsedCrewMembers);

      onSaved(updatedJob);
    } catch (error) {
      setErrorMessage(getUserFacingError(error, 'Unable to save job. Try again.'));
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
          <Pressable style={styles.backButton} onPress={onCancel}>
            <Text style={styles.backButtonText}>Back to job</Text>
          </Pressable>

          <View style={styles.header}>
            <Text style={styles.title}>Edit job</Text>
            <Text style={styles.subtitle}>Update quote details and job status.</Text>
          </View>

          <View style={styles.form}>
            <Field label="Job name" value={name} onChangeText={setName} placeholder="Kitchen repair" />
            <Field
              label="Client name"
              value={clientName}
              onChangeText={setClientName}
              placeholder="Client name"
            />
            <Field
              label="Location"
              value={location}
              onChangeText={setLocation}
              placeholder="Street, city, or job site"
            />
            <View style={styles.field}>
              <Text style={styles.label}>Job type</Text>
              <View style={styles.statusGrid}>
                <Pressable
                  onPress={() => setJobType('fixed_bid')}
                  style={[styles.statusButton, jobType === 'fixed_bid' && styles.selectedStatusButton]}>
                  <Text
                    style={[
                      styles.statusButtonText,
                      jobType === 'fixed_bid' && styles.selectedStatusButtonText,
                    ]}>
                    Fixed bid
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => setJobType('time_and_materials')}
                  style={[
                    styles.statusButton,
                    jobType === 'time_and_materials' && styles.selectedStatusButton,
                  ]}>
                  <Text
                    style={[
                      styles.statusButtonText,
                      jobType === 'time_and_materials' && styles.selectedStatusButtonText,
                    ]}>
                    Time & materials
                  </Text>
                </Pressable>
              </View>
            </View>
            {jobType === 'fixed_bid' ? (
              <Field
                inputMode="decimal"
                label="Quote amount"
                value={quoteAmount}
                onChangeText={setQuoteAmount}
                placeholder="0"
              />
            ) : null}
            <Field
              inputMode="decimal"
              label={jobType === 'fixed_bid' ? 'Hourly cost/rate' : 'Labor billing rate'}
              value={hourlyRate}
              onChangeText={setHourlyRate}
              placeholder="Optional"
            />
            <View style={styles.field}>
              <Text style={styles.label}>Status</Text>
              <View style={styles.statusGrid}>
                {jobStatuses.map((option) => (
                  <Pressable
                    key={option}
                    onPress={() => setStatus(option)}
                    style={[styles.statusButton, status === option && styles.selectedStatusButton]}>
                    <Text
                      style={[
                        styles.statusButtonText,
                        status === option && styles.selectedStatusButtonText,
                      ]}>
                      {formatStatus(option)}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
            <Field
              inputMode="decimal"
              label="Estimated labor hours"
              value={estimatedLaborHours}
              onChangeText={setEstimatedLaborHours}
              placeholder="Optional"
            />
            <Field
              inputMode="decimal"
              label="Material budget"
              value={estimatedMaterialCost}
              onChangeText={setEstimatedMaterialCost}
              placeholder="Optional"
            />
            <Field
              inputMode="decimal"
              label="Other estimated costs"
              value={estimatedOtherCost}
              onChangeText={setEstimatedOtherCost}
              placeholder="Optional"
            />
            <JobCrewEditor members={crewMembers} onChangeMembers={setCrewMembers} />

            {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

            <Pressable
              disabled={isSaving}
              onPress={handleSubmit}
              style={[styles.saveButton, isSaving && styles.disabledButton]}>
              <Text style={styles.saveButtonText}>{isSaving ? 'Saving...' : 'Save job'}</Text>
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

function formatEditableNumber(value: number | null | undefined): string {
  return value === null || value === undefined ? '' : String(value);
}

function getEstimatedOtherCost(job: Job): number | null {
  if (job.estimatedSubCost == null && job.estimatedMiscCost == null) {
    return null;
  }

  return (job.estimatedSubCost ?? 0) + (job.estimatedMiscCost ?? 0);
}

function parseRequiredNumber(value: string): number | null {
  const parsed = Number(value.replace(/[$,]/g, '').trim());

  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function parseOptionalNumber(value: string): number | null | undefined {
  const trimmed = value.replace(/[$,]/g, '').trim();

  if (!trimmed) {
    return null;
  }

  const parsed = Number(trimmed);

  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

function parseCrewMembers(
  members: CrewFormMember[]
): { hourlyRate: number; name: string }[] | undefined {
  const parsedMembers: { hourlyRate: number; name: string }[] = [];

  for (const member of members) {
    const name = member.name.trim();
    const rate = parseOptionalNumber(member.hourlyRate);

    if (!name && !member.hourlyRate.trim()) {
      continue;
    }

    if (!name || rate === undefined) {
      return undefined;
    }

    parsedMembers.push({
      hourlyRate: rate ?? 0,
      name,
    });
  }

  return parsedMembers;
}

function formatStatus(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
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
    lineHeight: 23,
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
  statusGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  statusButton: {
    alignItems: 'center',
    borderColor: '#C9C3B8',
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: 12,
  },
  selectedStatusButton: {
    backgroundColor: '#335C43',
    borderColor: '#335C43',
  },
  statusButtonText: {
    color: '#475569',
    fontSize: 14,
    fontWeight: '800',
  },
  selectedStatusButtonText: {
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
