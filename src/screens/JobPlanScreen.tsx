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

import { fetchJobPlan, saveJobPlan } from '@/src/lib/jobPlans';
import type { Job } from '@/src/types/job';

type JobPlanScreenProps = {
  job: Job;
  onBack: () => void;
  onSaved: () => void;
};

export function JobPlanScreen({ job, onBack, onSaved }: JobPlanScreenProps) {
  const [scopeOfWork, setScopeOfWork] = useState('');
  const [assumptions, setAssumptions] = useState('');
  const [exclusions, setExclusions] = useState('');
  const [estimatedLaborHours, setEstimatedLaborHours] = useState('');
  const [estimatedMaterialCost, setEstimatedMaterialCost] = useState('');
  const [estimatedOtherCost, setEstimatedOtherCost] = useState('');
  const [plannedPhases, setPlannedPhases] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    const loadPlan = async () => {
      setIsLoading(true);
      setErrorMessage(null);

      try {
        const plan = await fetchJobPlan(job.id);

        if (isMounted) {
          setScopeOfWork(plan?.scope_of_work ?? '');
          setAssumptions(plan?.assumptions ?? '');
          setExclusions(plan?.exclusions ?? '');
          setEstimatedLaborHours(
            formatEditableNumber(plan?.estimated_labor_hours ?? job.estimatedLaborHours ?? null)
          );
          setEstimatedMaterialCost(
            formatEditableCurrency(
              plan?.estimated_material_cost ?? job.estimatedMaterialCost ?? null
            )
          );
          setEstimatedOtherCost(
            formatEditableCurrency(plan?.estimated_other_cost ?? getEstimatedOtherCost(job))
          );
          setPlannedPhases(plan?.planned_phases ?? '');
        }
      } catch (error) {
        if (isMounted) {
          setErrorMessage(error instanceof Error ? error.message : 'Unable to load job plan.');
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    loadPlan();

    return () => {
      isMounted = false;
    };
  }, [job]);

  const handleSubmit = async () => {
    setErrorMessage(null);

    const parsedLaborHours = parseOptionalNumber(estimatedLaborHours);
    const parsedMaterialCost = parseOptionalNumber(estimatedMaterialCost);
    const parsedOtherCost = parseOptionalNumber(estimatedOtherCost);

    if (
      parsedLaborHours === undefined ||
      parsedMaterialCost === undefined ||
      parsedOtherCost === undefined
    ) {
      setErrorMessage('Estimated values must be valid numbers when provided.');
      return;
    }

    setIsSaving(true);

    try {
      await saveJobPlan(job.id, {
        assumptions,
        estimatedLaborHours: parsedLaborHours,
        estimatedMaterialCost: parsedMaterialCost,
        estimatedOtherCost: parsedOtherCost,
        exclusions,
        plannedPhases,
        scopeOfWork,
      });
      onSaved();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to save job plan.');
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
            <Text style={styles.title}>Job Plan</Text>
            <Text style={styles.subtitle}>{job.name}</Text>
          </View>

          <View style={styles.form}>
            {isLoading ? (
              <View style={styles.loadingRow}>
                <ActivityIndicator color="#335C43" />
                <Text style={styles.loadingText}>Loading plan...</Text>
              </View>
            ) : null}

            <Field
              label="Scope of work"
              multiline
              onChangeText={setScopeOfWork}
              placeholder="What is included in this job?"
              value={scopeOfWork}
            />
            <Field
              label="Assumptions"
              multiline
              onChangeText={setAssumptions}
              placeholder="What is the quote based on?"
              value={assumptions}
            />
            <Field
              label="Exclusions"
              multiline
              onChangeText={setExclusions}
              placeholder="What is not included?"
              value={exclusions}
            />
            <Field
              inputMode="decimal"
              label="Estimated labor hours"
              onChangeText={setEstimatedLaborHours}
              placeholder="Optional"
              value={estimatedLaborHours}
            />
            <Field
              inputMode="decimal"
              label="Estimated material cost"
              onChangeText={setEstimatedMaterialCost}
              placeholder="Optional"
              value={estimatedMaterialCost}
            />
            <Field
              inputMode="decimal"
              label="Estimated other cost"
              onChangeText={setEstimatedOtherCost}
              placeholder="Optional"
              value={estimatedOtherCost}
            />
            <Field
              label="Planned phases / rough sequence"
              multiline
              onChangeText={setPlannedPhases}
              placeholder="Rough order of work"
              value={plannedPhases}
            />

            {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

            <Pressable
              disabled={isSaving || isLoading}
              onPress={handleSubmit}
              style={[styles.saveButton, (isSaving || isLoading) && styles.disabledButton]}>
              <Text style={styles.saveButtonText}>
                {isSaving ? 'Saving...' : 'Save job plan'}
              </Text>
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
  multiline = false,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  inputMode?: 'decimal';
  multiline?: boolean;
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
        style={[styles.input, multiline && styles.textArea]}
        textAlignVertical={multiline ? 'top' : 'center'}
        value={value}
      />
    </View>
  );
}

function formatEditableNumber(value: number | null | undefined): string {
  return value === null || value === undefined ? '' : String(value);
}

function formatEditableCurrency(value: number | null | undefined): string {
  if (value === null || value === undefined) {
    return '';
  }

  return new Intl.NumberFormat('en-US', {
    currency: 'USD',
    maximumFractionDigits: 2,
    minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
    style: 'currency',
  }).format(value);
}

function getEstimatedOtherCost(job: Job): number | null {
  const subCost = job.estimatedSubCost ?? 0;
  const miscCost = job.estimatedMiscCost ?? 0;

  if (job.estimatedSubCost == null && job.estimatedMiscCost == null) {
    return null;
  }

  return subCost + miscCost;
}

function parseOptionalNumber(value: string): number | null | undefined {
  const trimmed = value.replace(/[$,]/g, '').trim();

  if (!trimmed) {
    return null;
  }

  const parsed = Number(trimmed);

  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
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
  textArea: {
    minHeight: 120,
    paddingVertical: 12,
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
