import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { HealthBadge } from '@/src/components/HealthBadge';
import {
  calculateJobFinancialSnapshot,
  formatCurrency,
  getJobHealth,
} from '@/src/lib/financials';
import { fetchJobs } from '@/src/lib/jobs';
import type { Job } from '@/src/types/job';

type JobPickerScreenProps = {
  actionLabel: string;
  backLabel?: string;
  compactJobCards?: boolean;
  emptyDetail?: string;
  includeInventoryOption?: boolean;
  initialInventorySelected?: boolean;
  initialSelectedJobIds?: string[];
  multiSelect?: boolean;
  onBack: () => void;
  onCreateJob: () => void;
  onSelectInventory?: () => void;
  onSelectJob: (job: Job) => void;
  onSelectJobs?: (jobs: Job[], includesInventory?: boolean) => void;
  pickerContext?: 'default' | 'payment';
  refreshKey?: number;
  title?: string;
};

export function JobPickerScreen({
  actionLabel,
  backLabel = 'Back home',
  compactJobCards = false,
  emptyDetail = 'Create a job before adding updates against it.',
  includeInventoryOption = false,
  initialInventorySelected = false,
  initialSelectedJobIds = [],
  multiSelect = false,
  onBack,
  onCreateJob,
  onSelectInventory,
  onSelectJob,
  onSelectJobs,
  pickerContext = 'default',
  refreshKey = 0,
  title = 'Select job',
}: JobPickerScreenProps) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [selectedJobIds, setSelectedJobIds] = useState<string[]>([]);
  const [isInventorySelected, setIsInventorySelected] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const openJobs = useMemo(
    () => jobs.filter((job) => !['completed', 'closed'].includes(job.status.toLowerCase())),
    [jobs]
  );
  const initialSelectedJobIdsKey = initialSelectedJobIds.join('|');

  const loadJobs = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);

    try {
      setJobs(await fetchJobs());
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to load jobs.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadJobs();
  }, [loadJobs, refreshKey]);

  useEffect(() => {
    if (!multiSelect) {
      return;
    }

    setSelectedJobIds(initialSelectedJobIdsKey ? initialSelectedJobIdsKey.split('|') : []);
    setIsInventorySelected(initialInventorySelected);
  }, [initialInventorySelected, initialSelectedJobIdsKey, multiSelect]);

  const selectedJobs = openJobs.filter((job) => selectedJobIds.includes(job.id));
  const hasSelection = isInventorySelected || selectedJobs.length > 0;

  const toggleSelectedJob = (job: Job) => {
    setSelectedJobIds((current) =>
      current.includes(job.id)
        ? current.filter((jobId) => jobId !== job.id)
        : [...current, job.id]
    );
  };

  const handleInventoryPress = () => {
    if (!multiSelect) {
      onSelectInventory?.();
      return;
    }

    setIsInventorySelected((current) => !current);
  };

  const handleContinue = () => {
    if (multiSelect) {
      onSelectJobs?.(selectedJobs, isInventorySelected);
      return;
    }

    if (isInventorySelected) {
      onSelectInventory?.();
    }
  };
  const continueLabel = getContinueLabel(isInventorySelected, selectedJobs.length);
  const shouldShowFloatingContinue = multiSelect && !isLoading && !errorMessage;

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={[
          styles.container,
          shouldShowFloatingContinue && styles.containerWithFloatingButton,
        ]}>
        <Pressable style={styles.backButton} onPress={onBack}>
          <Text style={styles.backButtonText}>{backLabel}</Text>
        </Pressable>

        <View style={styles.header}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.subtitle}>{actionLabel}</Text>
        </View>

        {isLoading ? <StatePanel title="Loading jobs..." /> : null}
        {!isLoading && errorMessage ? (
          <StatePanel title="Unable to load jobs" detail={errorMessage} onRetry={loadJobs} />
        ) : null}
        {!isLoading && !errorMessage && openJobs.length === 0 ? (
          <>
            {includeInventoryOption ? (
              <InventoryOption
                isSelected={isInventorySelected}
                multiSelect={multiSelect}
                onPress={handleInventoryPress}
              />
            ) : null}
            <StatePanel
              title="No open jobs"
              detail={emptyDetail}
              onCreateJob={onCreateJob}
            />
          </>
        ) : null}
        {!isLoading && !errorMessage && openJobs.length > 0 ? (
          <View style={styles.list}>
            {includeInventoryOption ? (
              <InventoryOption
                isSelected={isInventorySelected}
                multiSelect={multiSelect}
                onPress={handleInventoryPress}
              />
            ) : null}
            {openJobs.map((job) => {
              const usesCompactCard = multiSelect || compactJobCards;
              const snapshot = !usesCompactCard && hasFinancialActivity(job)
                ? calculateJobFinancialSnapshot(job)
                : null;
              const health = snapshot ? getJobHealth(snapshot) : 'New';
              const isSelected = selectedJobIds.includes(job.id);

              return (
                <Pressable
                  key={job.id}
                  style={[styles.card, isSelected && styles.selectedCard]}
                  onPress={() => {
                    if (multiSelect) {
                      toggleSelectedJob(job);
                      return;
                    }

                    onSelectJob(job);
                  }}>
                  <View style={styles.cardHeader}>
                    <View style={styles.cardTitleGroup}>
                      <Text style={styles.jobName}>{job.name}</Text>
                      {!usesCompactCard ? (
                        <>
                          <Text style={styles.clientName}>{job.clientName}</Text>
                          {job.location ? <Text style={styles.locationText}>{job.location}</Text> : null}
                        </>
                      ) : null}
                    </View>
                    {usesCompactCard ? (
                      <View style={[styles.selectBadge, isSelected && styles.selectedBadge]}>
                        <Text
                          style={[
                            styles.selectBadgeText,
                            isSelected && styles.selectedBadgeText,
                          ]}>
                          {isSelected ? 'Selected' : 'Select'}
                        </Text>
                      </View>
                    ) : (
                      <HealthBadge health={health} />
                    )}
                  </View>
                  {!usesCompactCard ? (
                    <View style={styles.metricRow}>
                      <Text style={styles.metricLabel}>
                        {pickerContext === 'payment' ? 'Balance due' : 'Quote'}
                      </Text>
                      <Text style={styles.metricValue}>
                        {formatCurrency(
                          pickerContext === 'payment' ? getJobBalanceDue(job) : job.quoteAmount
                        )}
                      </Text>
                    </View>
                  ) : null}
                </Pressable>
              );
            })}
          </View>
        ) : null}
      </ScrollView>
      {shouldShowFloatingContinue ? (
        <View style={styles.floatingBar}>
          <Pressable
            disabled={!hasSelection}
            onPress={handleContinue}
            style={[styles.continueButton, !hasSelection && styles.disabledButton]}>
            <Text style={styles.continueButtonText}>{continueLabel}</Text>
          </Pressable>
        </View>
      ) : null}
    </SafeAreaView>
  );
}

function StatePanel({
  title,
  detail,
  onCreateJob,
  onRetry,
}: {
  title: string;
  detail?: string;
  onCreateJob?: () => void;
  onRetry?: () => void;
}) {
  return (
    <View style={styles.statePanel}>
      <Text style={styles.stateTitle}>{title}</Text>
      {detail ? <Text style={styles.stateDetail}>{detail}</Text> : null}
      {onRetry ? (
        <Pressable style={styles.secondaryButton} onPress={onRetry}>
          <Text style={styles.secondaryButtonText}>Try again</Text>
        </Pressable>
      ) : null}
      {onCreateJob ? (
        <Pressable style={styles.primaryButton} onPress={onCreateJob}>
          <Text style={styles.primaryButtonText}>Create job</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function InventoryOption({
  isSelected,
  multiSelect,
  onPress,
}: {
  isSelected: boolean;
  multiSelect: boolean;
  onPress?: () => void;
}) {
  return (
    <Pressable disabled={!onPress} onPress={onPress} style={[styles.card, isSelected && styles.selectedCard]}>
      <View style={styles.cardHeader}>
        <View style={styles.cardTitleGroup}>
          <Text style={styles.jobName}>Tools / Inventory</Text>
          <Text style={styles.clientName}>
            Track purchases that should not hit a customer job.
          </Text>
        </View>
        <View style={[styles.selectBadge, isSelected && styles.selectedBadge]}>
          <Text style={[styles.selectBadgeText, isSelected && styles.selectedBadgeText]}>
            {isSelected ? 'Selected' : multiSelect ? 'Select' : 'Open'}
          </Text>
        </View>
      </View>
      <Text style={styles.disabledNote}>
        Receipt costs saved here stay out of job materials totals.
      </Text>
    </Pressable>
  );
}

function hasFinancialActivity(job: Job): boolean {
  return job.receipts.length > 0 || job.hours.length > 0 || job.payments.length > 0;
}

function getJobBalanceDue(job: Job): number {
  return Math.max(0, job.quoteAmount - (job.paymentsReceived ?? 0));
}

function getContinueLabel(isInventorySelected: boolean, selectedJobCount: number): string {
  if (isInventorySelected && selectedJobCount > 0) {
    return `Continue with Tools / Inventory + ${selectedJobCount} ${
      selectedJobCount === 1 ? 'job' : 'jobs'
    }`;
  }

  if (isInventorySelected) {
    return 'Continue with Tools / Inventory';
  }

  return `Continue with ${selectedJobCount || 'selected'} ${
    selectedJobCount === 1 ? 'job' : 'jobs'
  }`;
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F6F5F2',
  },
  container: {
    padding: 20,
    paddingBottom: 36,
  },
  containerWithFloatingButton: {
    paddingBottom: 112,
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
  list: {
    gap: 14,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E2E0DA',
    borderRadius: 8,
    borderWidth: 1,
    padding: 16,
  },
  selectedCard: {
    borderColor: '#335C43',
    borderWidth: 2,
  },
  selectBadge: {
    borderColor: '#C9C3B8',
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  selectedBadge: {
    backgroundColor: '#335C43',
    borderColor: '#335C43',
  },
  selectBadgeText: {
    color: '#475569',
    fontSize: 12,
    fontWeight: '900',
  },
  selectedBadgeText: {
    color: '#FFFFFF',
  },
  cardHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
  },
  cardTitleGroup: {
    flex: 1,
    gap: 3,
  },
  jobName: {
    color: '#1F2933',
    fontSize: 18,
    fontWeight: '800',
  },
  clientName: {
    color: '#64748B',
    fontSize: 14,
    fontWeight: '600',
  },
  locationText: {
    color: '#7C6F64',
    fontSize: 13,
    fontWeight: '600',
  },
  disabledNote: {
    borderTopColor: '#D8D3CA',
    borderTopWidth: 1,
    color: '#7C6F64',
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 19,
    marginTop: 12,
    paddingTop: 10,
  },
  metricRow: {
    alignItems: 'center',
    borderTopColor: '#ECEAE4',
    borderTopWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 12,
    minHeight: 36,
    paddingTop: 8,
  },
  metricLabel: {
    color: '#64748B',
    fontSize: 14,
  },
  metricValue: {
    color: '#1F2933',
    fontSize: 16,
    fontWeight: '800',
  },
  statePanel: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E2E0DA',
    borderRadius: 8,
    borderWidth: 1,
    gap: 12,
    padding: 16,
  },
  stateTitle: {
    color: '#1F2933',
    fontSize: 18,
    fontWeight: '800',
  },
  stateDetail: {
    color: '#64748B',
    fontSize: 15,
    lineHeight: 22,
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: '#335C43',
    borderRadius: 8,
    justifyContent: 'center',
    minHeight: 48,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },
  secondaryButton: {
    alignItems: 'center',
    borderColor: '#335C43',
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 48,
  },
  secondaryButtonText: {
    color: '#335C43',
    fontSize: 16,
    fontWeight: '800',
  },
  continueButton: {
    alignItems: 'center',
    backgroundColor: '#335C43',
    borderRadius: 12,
    justifyContent: 'center',
    minHeight: 56,
    paddingHorizontal: 14,
  },
  disabledButton: {
    opacity: 0.55,
  },
  continueButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '900',
    textAlign: 'center',
  },
  floatingBar: {
    backgroundColor: '#F6F5F2',
    borderTopColor: '#D8D3CA',
    borderTopWidth: 1,
    bottom: 0,
    left: 0,
    padding: 16,
    paddingBottom: 20,
    position: 'absolute',
    right: 0,
  },
});
