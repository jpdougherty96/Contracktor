import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { fetchJobs } from '@/src/lib/jobs';
import { buttonStyles, colors, radii } from '@/src/styles/theme';
import type { Job } from '@/src/types/job';

type JobsListScreenProps = {
  onBack?: () => void;
  onCreateJob: () => void;
  onSelectJob: (job: Job) => void;
  onLogout?: () => void;
  refreshKey?: number;
  userEmail?: string;
};

export function JobsListScreen({
  onBack,
  onCreateJob,
  onSelectJob,
  onLogout,
  refreshKey = 0,
}: JobsListScreenProps) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const openJobs = useMemo(() => jobs.filter((job) => !isClosedJob(job)), [jobs]);
  const closedJobs = useMemo(() => jobs.filter(isClosedJob), [jobs]);

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

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        {onBack ? (
          <Pressable style={styles.backButton} onPress={onBack}>
            <Text style={styles.backButtonText}>Back home</Text>
          </Pressable>
        ) : null}

        <View style={styles.header}>
          <View style={styles.headerTop}>
            <View style={styles.headerTitle}>
              <Text style={styles.appName}>conTRACKtor</Text>
              <Text style={styles.subtitle}>See where each job stands.</Text>
            </View>
            {onLogout ? (
              <Pressable style={styles.logoutButton} onPress={onLogout}>
                <Text style={styles.logoutButtonText}>Log out</Text>
              </Pressable>
            ) : null}
          </View>
          <Pressable style={styles.createButton} onPress={onCreateJob}>
            <Text style={styles.createButtonText}>Create job</Text>
          </Pressable>
        </View>

        {isLoading ? <StatePanel title="Loading jobs..." /> : null}
        {!isLoading && errorMessage ? (
          <StatePanel title="Unable to load jobs" detail={errorMessage} onRetry={loadJobs} />
        ) : null}
        {!isLoading && !errorMessage && jobs.length === 0 ? (
          <StatePanel
            title="No jobs yet"
            detail="Create your first job to start tracking where the money is going."
          />
        ) : null}
        {!isLoading && !errorMessage && jobs.length > 0 ? (
          <View style={styles.sections}>
            <JobSection
              jobs={openJobs}
              onSelectJob={onSelectJob}
              title="Open jobs"
            />
            {closedJobs.length > 0 ? (
              <JobSection
                jobs={closedJobs}
                onSelectJob={onSelectJob}
                title="Closed jobs"
              />
            ) : null}
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function JobSection({
  jobs,
  onSelectJob,
  title,
}: {
  jobs: Job[];
  onSelectJob: (job: Job) => void;
  title: string;
}) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{title}</Text>
        <Text style={styles.sectionCount}>{jobs.length}</Text>
      </View>
      {jobs.length > 0 ? (
        <View style={styles.list}>
          {jobs.map((job) => (
            <JobCard key={job.id} job={job} onPress={() => onSelectJob(job)} />
          ))}
        </View>
      ) : (
        <Text style={styles.emptySectionText}>No open jobs right now.</Text>
      )}
    </View>
  );
}

function JobCard({ job, onPress }: { job: Job; onPress: () => void }) {
  const materialUsage = getMaterialUsage(job);
  const laborUsage = getLaborUsage(job);
  const triage = getJobTriage(job, materialUsage, laborUsage);
  const isTimeAndMaterials = job.jobType === 'time_and_materials';
  const healthLabel = isTimeAndMaterials ? getTimeAndMaterialsLabel(job) : triage.label;
  const healthTone = isTimeAndMaterials ? getTimeAndMaterialsTone(job) : triage.tone;

  return (
    <Pressable style={[styles.card, getCardAccentStyle(healthTone)]} onPress={onPress}>
      <View style={styles.cardHeader}>
        <View style={styles.cardTitleGroup}>
          <Text style={styles.jobName}>{job.name}</Text>
          <Text style={styles.clientName}>
            {job.clientName}
            {job.location ? ` · ${formatShortLocation(job.location)}` : ''}
          </Text>
        </View>
        <Text style={styles.statusPill}>{formatStatus(job.status)}</Text>
      </View>

      <Text style={[styles.healthPill, getHealthPillStyle(healthTone)]}>{healthLabel}</Text>

      <View style={styles.budgetRows}>
        {isTimeAndMaterials ? (
          <>
            <ValueRow label="Labor" value={`${formatNumber(totalLocalHours(job))} hrs`} />
            <ValueRow label="Materials" value={formatCurrency(totalLocalReceipts(job))} />
          </>
        ) : (
          <>
            <BudgetUsageRow
              label="Materials"
              missingText="No budget set"
              tone={healthTone}
              usage={materialUsage}
            />
            <BudgetUsageRow
              label="Labor"
              missingText="No hour budget set"
              tone={healthTone}
              usage={laborUsage}
            />
          </>
        )}
      </View>

      {!isTimeAndMaterials && triage.reason ? (
        <Text style={styles.attentionReason}>{triage.reason}</Text>
      ) : null}
    </Pressable>
  );
}

function StatePanel({
  title,
  detail,
  onRetry,
}: {
  title: string;
  detail?: string;
  onRetry?: () => void;
}) {
  return (
    <View style={styles.statePanel}>
      <Text style={styles.stateTitle}>{title}</Text>
      {detail ? <Text style={styles.stateDetail}>{detail}</Text> : null}
      {onRetry ? (
        <Pressable style={styles.retryButton} onPress={onRetry}>
          <Text style={styles.retryButtonText}>Try again</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function isClosedJob(job: Job): boolean {
  return ['completed', 'closed'].includes(job.status.toLowerCase());
}

function formatStatus(status: string): string {
  return status
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

type BudgetUsage = {
  percent: number | null;
};

type TriageTone = 'onTrackPill' | 'watchPill' | 'problemPill' | 'missingPill';

function BudgetUsageRow({
  label,
  missingText,
  tone,
  usage,
}: {
  label: string;
  missingText: string;
  tone: TriageTone;
  usage: BudgetUsage;
}) {
  const percent = usage.percent === null ? null : Math.round(usage.percent);

  return (
    <View style={styles.metricBlock}>
      <View style={styles.budgetRow}>
        <Text style={styles.budgetLabel}>{label}</Text>
        <Text style={styles.budgetValue}>{percent === null ? missingText : `${percent}%`}</Text>
      </View>
      {percent !== null ? (
        <View style={styles.progressTrack}>
          <View
            style={[
              styles.progressFill,
              getProgressFillStyle(tone),
              { width: `${Math.min(Math.max(percent, 0), 100)}%` },
            ]}
          />
        </View>
      ) : null}
    </View>
  );
}

function ValueRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.budgetRow}>
      <Text style={styles.budgetLabel}>{label}</Text>
      <Text style={styles.budgetValue}>{value}</Text>
    </View>
  );
}

function getMaterialUsage(job: Job): BudgetUsage {
  if (!job.estimatedMaterialCost || job.estimatedMaterialCost <= 0) {
    return { percent: null };
  }

  const materialSpend = job.actualMaterialCost ?? totalLocalReceipts(job);

  return {
    percent: (materialSpend / job.estimatedMaterialCost) * 100,
  };
}

function getLaborUsage(job: Job): BudgetUsage {
  if (!job.estimatedLaborHours || job.estimatedLaborHours <= 0) {
    return { percent: null };
  }

  const laborHours = totalLocalHours(job);

  return {
    percent: (laborHours / job.estimatedLaborHours) * 100,
  };
}

function getJobTriage(
  job: Job,
  materialUsage: BudgetUsage,
  laborUsage: BudgetUsage
): { label: string; reason?: string; tone: TriageTone } {
  const materialPercent = materialUsage.percent;
  const laborPercent = laborUsage.percent;
  const hasActivity =
    totalLocalReceipts(job) > 0 || totalLocalHours(job) > 0 || job.payments.length > 0;

  if ((materialPercent ?? 0) > 100 || (laborPercent ?? 0) > 100) {
    if ((laborPercent ?? 0) >= (materialPercent ?? 0)) {
      return { label: 'Over budget', reason: 'Labor is over budget', tone: 'problemPill' };
    }

    return { label: 'Over budget', reason: 'Materials are over budget', tone: 'problemPill' };
  }

  const laborNeedsWatch = laborPercent !== null && laborPercent >= 80;
  const materialsNeedWatch = materialPercent !== null && materialPercent >= 80;

  if (laborNeedsWatch && materialsNeedWatch) {
    return laborPercent >= materialPercent
      ? { label: 'Needs attention', reason: 'Labor is near budget', tone: 'watchPill' }
      : { label: 'Needs attention', reason: 'Materials are near budget', tone: 'watchPill' };
  }

  if (laborNeedsWatch) {
    return { label: 'Watch labor', reason: 'Labor is near budget', tone: 'watchPill' };
  }

  if (materialsNeedWatch) {
    return { label: 'Watch materials', reason: 'Materials are near budget', tone: 'watchPill' };
  }

  if (job.status.toLowerCase() === 'active' && materialPercent === null && laborPercent === null) {
    return { label: 'Missing budget', reason: 'Budget missing', tone: 'missingPill' };
  }

  if (!hasActivity) {
    return { label: 'Ready to track', tone: 'missingPill' };
  }

  return { label: 'On track', tone: 'onTrackPill' };
}

function getTimeAndMaterialsLabel(job: Job): string {
  return totalLocalReceipts(job) > 0 || totalLocalHours(job) > 0 ? 'Tracking' : 'Ready to track';
}

function getTimeAndMaterialsTone(job: Job): TriageTone {
  return totalLocalReceipts(job) > 0 || totalLocalHours(job) > 0 ? 'onTrackPill' : 'missingPill';
}

function totalLocalHours(job: Job): number {
  return job.actualLaborHours ?? job.hours.reduce((sum, entry) => sum + entry.hours, 0);
}

function totalLocalReceipts(job: Job): number {
  return job.actualMaterialCost ?? job.receipts.reduce((sum, receipt) => sum + receipt.amount, 0);
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 2,
  }).format(value);
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    currency: 'USD',
    maximumFractionDigits: 0,
    style: 'currency',
  }).format(value);
}

function formatShortLocation(location: string): string {
  const parts = location
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length >= 2) {
    const city = getCityFromStreetSegment(parts[parts.length - 2]);
    const state = parts[parts.length - 1].split(/\s+/)[0];

    return city && state ? `${city}, ${state}` : `${parts[parts.length - 2]}, ${parts[parts.length - 1]}`;
  }

  return location;
}

function getCityFromStreetSegment(value: string): string {
  const words = value.split(/\s+/).filter(Boolean);

  if (words.length <= 1) {
    return value;
  }

  return words[words.length - 1];
}

function getCardAccentStyle(tone: TriageTone) {
  if (tone === 'problemPill') return styles.problemCard;
  if (tone === 'watchPill') return styles.watchCard;
  if (tone === 'onTrackPill') return styles.onTrackCard;

  return styles.missingCard;
}

function getHealthPillStyle(tone: TriageTone) {
  if (tone === 'problemPill') return styles.problemPill;
  if (tone === 'watchPill') return styles.watchPill;
  if (tone === 'onTrackPill') return styles.onTrackPill;

  return styles.missingPill;
}

function getProgressFillStyle(tone: TriageTone) {
  if (tone === 'problemPill') return styles.problemProgressFill;
  if (tone === 'watchPill') return styles.watchProgressFill;
  if (tone === 'onTrackPill') return styles.onTrackProgressFill;

  return styles.missingProgressFill;
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.appBackground,
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
    color: colors.primaryGreen,
    fontSize: 16,
    fontWeight: '800',
  },
  header: {
    marginBottom: 20,
  },
  headerTop: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
  },
  headerTitle: {
    flex: 1,
  },
  appName: {
    color: colors.text,
    fontSize: 34,
    fontWeight: '800',
  },
  subtitle: {
    color: colors.mutedText,
    fontSize: 16,
    marginTop: 4,
  },
  createButton: {
    ...buttonStyles.primary.container,
    borderRadius: radii.button,
    marginTop: 16,
    minHeight: 52,
  },
  createButtonText: {
    ...buttonStyles.primary.text,
    fontSize: 17,
  },
  logoutButton: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 40,
    paddingHorizontal: 6,
  },
  logoutButtonText: {
    color: colors.mutedText,
    fontSize: 13,
    fontWeight: '700',
  },
  sections: {
    gap: 24,
  },
  section: {
    gap: 12,
  },
  sectionHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '800',
  },
  sectionCount: {
    color: colors.mutedText,
    fontSize: 14,
    fontWeight: '800',
  },
  list: {
    gap: 14,
  },
  emptySectionText: {
    color: colors.mutedText,
    fontSize: 15,
    lineHeight: 22,
  },
  card: {
    backgroundColor: colors.cardBackground,
    borderColor: colors.standardBorder,
    borderRadius: radii.card,
    borderWidth: 1,
    borderLeftWidth: 5,
    padding: 16,
  },
  onTrackCard: {
    borderLeftColor: colors.primaryGreen,
  },
  watchCard: {
    borderLeftColor: '#D09222',
  },
  problemCard: {
    borderLeftColor: colors.danger,
  },
  missingCard: {
    borderLeftColor: '#CBD5E1',
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
    color: colors.text,
    fontSize: 18,
    fontWeight: '800',
  },
  clientName: {
    color: colors.mutedText,
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 19,
  },
  statusPill: {
    backgroundColor: '#EFE9DD',
    borderColor: colors.standardBorder,
    borderRadius: 999,
    borderWidth: 1,
    color: colors.text,
    fontSize: 12,
    fontWeight: '800',
    overflow: 'hidden',
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  healthPill: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    fontSize: 14,
    fontWeight: '900',
    marginTop: 16,
    overflow: 'hidden',
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  onTrackPill: {
    backgroundColor: '#E7F0E8',
    color: colors.primaryGreen,
  },
  watchPill: {
    backgroundColor: '#F8EBCF',
    color: '#8A5A12',
  },
  problemPill: {
    backgroundColor: '#F7DED8',
    color: colors.danger,
  },
  missingPill: {
    backgroundColor: '#E8EDF2',
    color: colors.mutedText,
  },
  budgetRows: {
    borderTopColor: '#ECE6DA',
    borderTopWidth: 1,
    gap: 12,
    marginTop: 14,
    paddingTop: 12,
  },
  metricBlock: {
    gap: 6,
  },
  budgetRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 26,
  },
  budgetLabel: {
    color: colors.mutedText,
    fontSize: 14,
    fontWeight: '700',
  },
  budgetValue: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '800',
  },
  progressTrack: {
    backgroundColor: '#ECEFF2',
    borderRadius: 999,
    height: 6,
    overflow: 'hidden',
  },
  progressFill: {
    borderRadius: 999,
    height: 6,
  },
  onTrackProgressFill: {
    backgroundColor: colors.primaryGreen,
  },
  watchProgressFill: {
    backgroundColor: '#D09222',
  },
  problemProgressFill: {
    backgroundColor: colors.danger,
  },
  missingProgressFill: {
    backgroundColor: '#94A3B8',
  },
  attentionReason: {
    color: colors.mutedText,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
    marginTop: 12,
  },
  statePanel: {
    backgroundColor: colors.cardBackground,
    borderColor: colors.standardBorder,
    borderRadius: radii.card,
    borderWidth: 1,
    padding: 18,
  },
  stateTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '800',
  },
  stateDetail: {
    color: colors.mutedText,
    fontSize: 15,
    lineHeight: 22,
    marginTop: 6,
  },
  retryButton: {
    ...buttonStyles.secondary.container,
    borderRadius: radii.button,
    marginTop: 14,
    minHeight: 44,
  },
  retryButtonText: {
    color: colors.primaryGreen,
    fontSize: 15,
    fontWeight: '800',
  },
});
