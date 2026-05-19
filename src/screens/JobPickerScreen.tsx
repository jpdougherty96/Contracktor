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
  emptyDetail?: string;
  includeInventoryOption?: boolean;
  multiSelect?: boolean;
  onBack: () => void;
  onCreateJob: () => void;
  onSelectJob: (job: Job) => void;
  onSelectJobs?: (jobs: Job[]) => void;
  refreshKey?: number;
  title?: string;
};

export function JobPickerScreen({
  actionLabel,
  backLabel = 'Back home',
  emptyDetail = 'Create a job before adding updates against it.',
  includeInventoryOption = false,
  multiSelect = false,
  onBack,
  onCreateJob,
  onSelectJob,
  onSelectJobs,
  refreshKey = 0,
  title = 'Select job',
}: JobPickerScreenProps) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [selectedJobIds, setSelectedJobIds] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const openJobs = useMemo(
    () => jobs.filter((job) => !['completed', 'closed'].includes(job.status.toLowerCase())),
    [jobs]
  );

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

  const selectedJobs = openJobs.filter((job) => selectedJobIds.includes(job.id));

  const toggleSelectedJob = (job: Job) => {
    setSelectedJobIds((current) =>
      current.includes(job.id)
        ? current.filter((jobId) => jobId !== job.id)
        : [...current, job.id]
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
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
          <StatePanel
            title="No open jobs"
            detail={emptyDetail}
            onCreateJob={onCreateJob}
          />
        ) : null}
        {!isLoading && !errorMessage && openJobs.length > 0 ? (
          <View style={styles.list}>
            {includeInventoryOption ? (
              <View style={styles.disabledCard}>
                <View style={styles.cardTitleGroup}>
                  <Text style={styles.jobName}>Tools / Inventory</Text>
                  <Text style={styles.clientName}>
                    Track purchases that should not hit a customer job.
                  </Text>
                </View>
                <Text style={styles.disabledNote}>
                  This needs the non-job expense table before receipts can be saved here.
                </Text>
              </View>
            ) : null}
            {openJobs.map((job) => {
              const snapshot = hasFinancialActivity(job)
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
                      <Text style={styles.clientName}>{job.clientName}</Text>
                      {job.location ? <Text style={styles.locationText}>{job.location}</Text> : null}
                    </View>
                    {multiSelect ? (
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
                  <View style={styles.metricRow}>
                    <Text style={styles.metricLabel}>Quote</Text>
                    <Text style={styles.metricValue}>{formatCurrency(job.quoteAmount)}</Text>
                  </View>
                </Pressable>
              );
            })}
            {multiSelect ? (
              <Pressable
                disabled={selectedJobs.length === 0}
                onPress={() => onSelectJobs?.(selectedJobs)}
                style={[
                  styles.continueButton,
                  selectedJobs.length === 0 && styles.disabledButton,
                ]}>
                <Text style={styles.continueButtonText}>
                  Continue with {selectedJobs.length || 'selected'}{' '}
                  {selectedJobs.length === 1 ? 'job' : 'jobs'}
                </Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
      </ScrollView>
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

function hasFinancialActivity(job: Job): boolean {
  return job.receipts.length > 0 || job.hours.length > 0 || job.payments.length > 0;
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
  disabledCard: {
    backgroundColor: '#F1EFEA',
    borderColor: '#D8D3CA',
    borderRadius: 8,
    borderWidth: 1,
    opacity: 0.85,
    padding: 16,
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
    borderRadius: 8,
    justifyContent: 'center',
    minHeight: 56,
  },
  disabledButton: {
    opacity: 0.55,
  },
  continueButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '900',
  },
});
