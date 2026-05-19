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

import { createJob } from '@/src/lib/jobs';
import type { Job, JobType } from '@/src/types/job';

type CreateJobScreenProps = {
  onCancel: () => void;
  onCreated: (job: Job) => void;
};

type EstimateSummaryValue = {
  laborCost: number;
  materialCost: number;
  otherCost: number;
  total: number;
};

export function CreateJobScreen({ onCancel, onCreated }: CreateJobScreenProps) {
  const [name, setName] = useState('');
  const [clientName, setClientName] = useState('');
  const [location, setLocation] = useState('');
  const [jobType, setJobType] = useState<JobType>('fixed_bid');
  const [quoteAmount, setQuoteAmount] = useState('');
  const [hourlyRate, setHourlyRate] = useState('');
  const [timeClockEnabled, setTimeClockEnabled] = useState(false);
  const [estimatedLaborHours, setEstimatedLaborHours] = useState('');
  const [estimatedMaterialCost, setEstimatedMaterialCost] = useState('');
  const [estimatedOtherCost, setEstimatedOtherCost] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const estimateSummary = getEstimateSummary({
    estimatedLaborHours,
    estimatedMaterialCost,
    estimatedOtherCost,
    hourlyRate,
  });

  const handleSubmit = async () => {
    setErrorMessage(null);

    const parsedQuoteAmount =
      jobType === 'fixed_bid' ? parseRequiredNumber(quoteAmount) : parseOptionalNumber(quoteAmount);
    const parsedHourlyRate = parseOptionalNumber(hourlyRate);
    const parsedLaborHours = parseOptionalNumber(estimatedLaborHours);
    const parsedMaterialCost = parseOptionalNumber(estimatedMaterialCost);
    const parsedOtherCost = parseOptionalNumber(estimatedOtherCost);

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

    setIsSaving(true);

    try {
      const createdJob = await createJob({
        name: name.trim(),
        clientName,
        location,
        jobType,
        hourlyRate: parsedHourlyRate,
        timeClockEnabled,
        quoteAmount: parsedQuoteAmount ?? 0,
        estimatedLaborHours: parsedLaborHours,
        estimatedMaterialCost: parsedMaterialCost,
        estimatedSubCost: null,
        estimatedMiscCost: parsedOtherCost,
      });

      onCreated(createdJob);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to create job.');
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
            <Text style={styles.backButtonText}>Back to jobs</Text>
          </Pressable>

          <View style={styles.header}>
            <Text style={styles.title}>Create job</Text>
            <Text style={styles.subtitle}>Set up how this job should be tracked.</Text>
          </View>

          <View style={styles.form}>
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Job basics</Text>
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
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Job type</Text>
              <View style={styles.choiceGrid}>
                <ChoiceButton
                  description="Track costs against a set quote."
                  isSelected={jobType === 'fixed_bid'}
                  label="Fixed bid"
                  onPress={() => setJobType('fixed_bid')}
                />
                <ChoiceButton
                  description="Track labor and materials to bill as you go."
                  isSelected={jobType === 'time_and_materials'}
                  label="Time & materials"
                  onPress={() => setJobType('time_and_materials')}
                />
              </View>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>
                {jobType === 'fixed_bid' ? 'Budget this job' : 'Tracking setup'}
              </Text>
              <Text style={styles.sectionDescription}>
                {jobType === 'fixed_bid'
                  ? 'Set rough targets so conTRACKtor can warn you before costs get away from you.'
                  : 'Set the rate and optional targets you want to track while the job is active.'}
              </Text>
              <Field
                inputMode="decimal"
                label="Material budget"
                value={estimatedMaterialCost}
                onChangeText={setEstimatedMaterialCost}
                placeholder="Optional"
              />
              <Field
                inputMode="decimal"
                label="Estimated labor hours"
                value={estimatedLaborHours}
                onChangeText={setEstimatedLaborHours}
                placeholder="Optional"
              />
              <Field
                inputMode="decimal"
                label={jobType === 'fixed_bid' ? 'Hourly cost/rate' : 'Labor billing rate'}
                value={hourlyRate}
                onChangeText={setHourlyRate}
                placeholder="Optional"
              />
              <Field
                inputMode="decimal"
                label="Other estimated costs"
                value={estimatedOtherCost}
                onChangeText={setEstimatedOtherCost}
                placeholder="Optional"
              />
            </View>

            <EstimateSummary summary={estimateSummary} />

            {jobType === 'fixed_bid' ? (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Set quote with markup</Text>
                <View style={styles.markupGrid}>
                  {[10, 15, 20, 25].map((percent) => (
                    <Pressable
                      key={percent}
                      onPress={() =>
                        setQuoteAmount(formatPlainNumber(applyMarkup(estimateSummary.total, percent)))
                      }
                      style={styles.markupButton}>
                      <Text style={styles.markupButtonText}>{percent}%</Text>
                    </Pressable>
                  ))}
                </View>
                <Field
                  inputMode="decimal"
                  label="Quote amount"
                  value={quoteAmount}
                  onChangeText={setQuoteAmount}
                  placeholder="0"
                />
                <Text style={styles.helperText}>You can edit this before saving.</Text>
              </View>
            ) : null}

            <ToggleRow
              description="Show Start and Stop controls for this job in Add hours."
              isEnabled={timeClockEnabled}
              label="Time clock"
              onPress={() => setTimeClockEnabled((isEnabled) => !isEnabled)}
            />

            {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

            <Pressable
              disabled={isSaving}
              onPress={handleSubmit}
              style={[styles.saveButton, isSaving && styles.disabledButton]}>
              <Text style={styles.saveButtonText}>{isSaving ? 'Creating...' : 'Create job'}</Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function ChoiceButton({
  description,
  isSelected,
  label,
  onPress,
}: {
  description: string;
  isSelected: boolean;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable style={[styles.choiceButton, isSelected && styles.selectedChoiceButton]} onPress={onPress}>
      <Text style={[styles.choiceLabel, isSelected && styles.selectedChoiceText]}>{label}</Text>
      <Text style={[styles.choiceDescription, isSelected && styles.selectedChoiceText]}>
        {description}
      </Text>
    </Pressable>
  );
}

function EstimateSummary({ summary }: { summary: EstimateSummaryValue }) {
  return (
    <View style={styles.summaryPanel}>
      <Text style={styles.sectionTitle}>Estimated total</Text>
      <SummaryRow label="Labor" value={formatCurrency(summary.laborCost)} />
      <SummaryRow label="Materials" value={formatCurrency(summary.materialCost)} />
      <SummaryRow label="Other" value={formatCurrency(summary.otherCost)} />
      <View style={styles.summaryDivider} />
      <SummaryRow isTotal label="Total" value={formatCurrency(summary.total)} />
    </View>
  );
}

function SummaryRow({
  isTotal = false,
  label,
  value,
}: {
  isTotal?: boolean;
  label: string;
  value: string;
}) {
  return (
    <View style={styles.summaryRow}>
      <Text style={[styles.summaryLabel, isTotal && styles.summaryTotalText]}>{label}</Text>
      <Text style={[styles.summaryValue, isTotal && styles.summaryTotalText]}>{value}</Text>
    </View>
  );
}

function ToggleRow({
  description,
  isEnabled,
  label,
  onPress,
}: {
  description: string;
  isEnabled: boolean;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable style={styles.toggleRow} onPress={onPress}>
      <View style={styles.toggleTextGroup}>
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.toggleDescription}>{description}</Text>
      </View>
      <View style={[styles.toggleTrack, isEnabled && styles.enabledToggleTrack]}>
        <View style={[styles.toggleKnob, isEnabled && styles.enabledToggleKnob]} />
      </View>
    </Pressable>
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

function getEstimateSummary({
  estimatedLaborHours,
  estimatedMaterialCost,
  estimatedOtherCost,
  hourlyRate,
}: {
  estimatedLaborHours: string;
  estimatedMaterialCost: string;
  estimatedOtherCost: string;
  hourlyRate: string;
}): EstimateSummaryValue {
  const laborHours = parseOptionalNumber(estimatedLaborHours) ?? 0;
  const rate = parseOptionalNumber(hourlyRate) ?? 0;
  const materialCost = parseOptionalNumber(estimatedMaterialCost) ?? 0;
  const otherCost = parseOptionalNumber(estimatedOtherCost) ?? 0;
  const laborCost = laborHours * rate;

  return {
    laborCost,
    materialCost,
    otherCost,
    total: laborCost + materialCost + otherCost,
  };
}

function applyMarkup(total: number, percent: number): number {
  return Math.round(total * (1 + percent / 100));
}

function formatPlainNumber(value: number): string {
  return String(value);
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    currency: 'USD',
    maximumFractionDigits: 0,
    style: 'currency',
  }).format(value);
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
    gap: 18,
    padding: 16,
  },
  section: {
    gap: 12,
  },
  sectionTitle: {
    color: '#1F2933',
    fontSize: 18,
    fontWeight: '900',
  },
  sectionDescription: {
    color: '#64748B',
    fontSize: 14,
    lineHeight: 20,
  },
  field: {
    gap: 6,
  },
  toggleRow: {
    alignItems: 'center',
    borderColor: '#C9C3B8',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
    minHeight: 66,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  toggleTextGroup: {
    flex: 1,
    gap: 3,
  },
  toggleDescription: {
    color: '#64748B',
    fontSize: 13,
    lineHeight: 18,
  },
  toggleTrack: {
    backgroundColor: '#C9C3B8',
    borderRadius: 999,
    height: 28,
    justifyContent: 'center',
    paddingHorizontal: 3,
    width: 52,
  },
  enabledToggleTrack: {
    backgroundColor: '#335C43',
  },
  toggleKnob: {
    backgroundColor: '#FFFFFF',
    borderRadius: 999,
    height: 22,
    width: 22,
  },
  enabledToggleKnob: {
    alignSelf: 'flex-end',
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
  choiceGrid: {
    gap: 10,
  },
  choiceButton: {
    borderColor: '#C9C3B8',
    borderRadius: 10,
    borderWidth: 1,
    gap: 4,
    padding: 12,
  },
  selectedChoiceButton: {
    backgroundColor: '#335C43',
    borderColor: '#335C43',
  },
  choiceLabel: {
    color: '#1F2933',
    fontSize: 16,
    fontWeight: '900',
  },
  choiceDescription: {
    color: '#64748B',
    fontSize: 13,
    lineHeight: 18,
  },
  selectedChoiceText: {
    color: '#FFFFFF',
  },
  summaryPanel: {
    backgroundColor: '#F6F5F2',
    borderColor: '#E2E0DA',
    borderRadius: 10,
    borderWidth: 1,
    gap: 8,
    padding: 14,
  },
  summaryRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  summaryLabel: {
    color: '#64748B',
    fontSize: 14,
    fontWeight: '700',
  },
  summaryValue: {
    color: '#1F2933',
    fontSize: 15,
    fontWeight: '900',
  },
  summaryDivider: {
    backgroundColor: '#E2E0DA',
    height: 1,
  },
  summaryTotalText: {
    color: '#1F2933',
    fontSize: 17,
    fontWeight: '900',
  },
  markupGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  markupButton: {
    alignItems: 'center',
    borderColor: '#335C43',
    borderRadius: 999,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 38,
    paddingHorizontal: 16,
  },
  markupButtonText: {
    color: '#335C43',
    fontSize: 14,
    fontWeight: '900',
  },
  helperText: {
    color: '#64748B',
    fontSize: 13,
    lineHeight: 18,
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
