import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  calculateJobFinancialSnapshot,
  formatCurrency,
  formatPercent,
} from '@/src/lib/financials';
import { fetchJobActivity, type JobActivityItem } from '@/src/lib/jobActivity';
import {
  fetchBasicJobTruthSummary,
  fetchJobFinancialSnapshot,
  fetchJobLaborCostEntries,
  fetchJobMaterialCostEntries,
  type BasicJobTruthSummary,
  type JobLaborCostEntry,
  type JobFinancialSnapshotRow,
  type JobMaterialCostEntry,
} from '@/src/lib/jobFinancials';
import type { Job } from '@/src/types/job';

type JobDashboardScreenProps = {
  job: Job;
  onBack: () => void;
  onAddUpdate: () => void;
  onCreateInvoice: () => void;
  onEditJob: () => void;
  onExportReport: () => void;
  onEditHours: (hoursId: string) => void;
  onEditNote: (noteId: string) => void;
  onEditPayment: (paymentId: string) => void;
  onReviewReceipt: (receiptId: string) => void;
  onShoppingList: () => void;
  refreshKey?: number;
  showShoppingList?: boolean;
};

export function JobDashboardScreen({
  job,
  onBack,
  onAddUpdate,
  onCreateInvoice,
  onEditJob,
  onExportReport,
  onEditHours,
  onEditNote,
  onEditPayment,
  onReviewReceipt,
  onShoppingList,
  refreshKey = 0,
  showShoppingList = false,
}: JobDashboardScreenProps) {
  const snapshot = calculateJobFinancialSnapshot(job);
  const isTimeAndMaterials = job.jobType === 'time_and_materials';
  const [databaseSnapshot, setDatabaseSnapshot] = useState<JobFinancialSnapshotRow | null>(null);
  const [truthSummary, setTruthSummary] = useState<BasicJobTruthSummary | null>(null);
  const [isSnapshotLoading, setIsSnapshotLoading] = useState(true);
  const [snapshotError, setSnapshotError] = useState<string | null>(null);
  const [laborEntries, setLaborEntries] = useState<JobLaborCostEntry[]>([]);
  const [materialEntries, setMaterialEntries] = useState<JobMaterialCostEntry[]>([]);
  const [expandedCost, setExpandedCost] = useState<'labor' | 'materials' | null>(null);
  const [activity, setActivity] = useState<JobActivityItem[]>([]);
  const [isActivityLoading, setIsActivityLoading] = useState(true);
  const [activityError, setActivityError] = useState<string | null>(null);
  const hasFinancialData = job.receipts.length > 0 || job.hours.length > 0 || job.payments.length > 0;

  useEffect(() => {
    let isMounted = true;

    const loadSnapshot = async () => {
      setIsSnapshotLoading(true);
      setSnapshotError(null);

      try {
        const [nextSnapshot, nextLaborEntries, nextMaterialEntries, nextTruthSummary] =
          await Promise.all([
            fetchJobFinancialSnapshot(job.id),
            fetchJobLaborCostEntries(job.id),
            fetchJobMaterialCostEntries(job.id),
            fetchBasicJobTruthSummary(job.id),
          ]);

        if (isMounted) {
          setDatabaseSnapshot(nextSnapshot);
          setLaborEntries(nextLaborEntries);
          setMaterialEntries(nextMaterialEntries);
          setTruthSummary(nextTruthSummary);
        }
      } catch (error) {
        if (isMounted) {
          setSnapshotError(
            error instanceof Error ? error.message : 'Unable to load financial snapshot.'
          );
        }
      } finally {
        if (isMounted) {
          setIsSnapshotLoading(false);
        }
      }
    };

    loadSnapshot();

    return () => {
      isMounted = false;
    };
  }, [job.id, refreshKey]);

  const paymentsReceived = databaseSnapshot?.payments_received ?? snapshot.paymentsReceived;
  const totalCost = databaseSnapshot?.total_cost ?? snapshot.totalCost;
  const totalHours = databaseSnapshot?.total_hours ?? totalLocalHours(job);
  const projectedProfit = databaseSnapshot?.projected_profit ?? snapshot.projectedProfit;
  const recordedBalance = (databaseSnapshot?.quote_amount ?? snapshot.quoteAmount) - paymentsReceived;

  useEffect(() => {
    let isMounted = true;

    const loadActivity = async () => {
      setIsActivityLoading(true);
      setActivityError(null);

      try {
        const nextActivity = await fetchJobActivity(job.id);

        if (isMounted) {
          setActivity(nextActivity);
        }
      } catch (error) {
        if (isMounted) {
          setActivityError(error instanceof Error ? error.message : 'Unable to load activity.');
        }
      } finally {
        if (isMounted) {
          setIsActivityLoading(false);
        }
      }
    };

    loadActivity();

    return () => {
      isMounted = false;
    };
  }, [job.id, refreshKey]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <Pressable style={styles.backButton} onPress={onBack}>
          <Text style={styles.backButtonText}>Back to jobs</Text>
        </Pressable>

        <View style={styles.header}>
          <Text style={styles.jobName}>{job.name}</Text>
          <Text style={styles.clientName}>{job.clientName}</Text>
          {job.location ? <Text style={styles.detailText}>{job.location}</Text> : null}
          <Text style={styles.detailText}>
            Type: {isTimeAndMaterials ? 'Time & materials' : 'Fixed bid'}
          </Text>
          <Text style={styles.detailText}>Status: {job.status}</Text>
          <Pressable style={styles.editButton} onPress={onEditJob}>
            <Text style={styles.editButtonText}>Edit job</Text>
          </Pressable>
        </View>

        <View style={styles.snapshotPanel}>
          <View style={styles.snapshotHeader}>
            <View>
              <Text style={styles.snapshotEyebrow}>JOB SNAPSHOT</Text>
              <Text style={styles.snapshotTitle}>Where this job stands</Text>
            </View>
            <View style={styles.statusBadge}>
              <Text style={styles.statusBadgeText}>{formatCostType(job.status)}</Text>
            </View>
          </View>
          {isSnapshotLoading ? (
            <Text style={styles.snapshotMessage}>Loading job truth...</Text>
          ) : null}
          {!isSnapshotLoading && snapshotError ? (
            <Text style={styles.snapshotError}>{snapshotError}</Text>
          ) : null}
          {!isSnapshotLoading && !snapshotError ? (
            <>
              <View style={styles.snapshotGrid}>
                <SnapshotMetric
                  label="Needs attention"
                  tone={truthSummary?.openAttentionCount ? 'warning' : 'normal'}
                  value={String(truthSummary?.openAttentionCount ?? 0)}
                />
                <SnapshotMetric
                  label="Open shopping"
                  value={String(truthSummary?.openShoppingNeedCount ?? 0)}
                />
                <SnapshotMetric label="Total hours" value={formatNumber(totalHours)} />
                <SnapshotMetric
                  label="Job cost"
                  value={formatCurrency(totalCost, { showCents: true })}
                />
                {!isTimeAndMaterials ? (
                  <SnapshotMetric
                    label="Recorded balance"
                    tone={recordedBalance < 0 ? 'warning' : 'normal'}
                    value={formatCurrency(recordedBalance, { showCents: true })}
                  />
                ) : null}
                {!isTimeAndMaterials ? (
                  <SnapshotMetric
                    label="Projected profit"
                    tone={projectedProfit < 0 ? 'warning' : 'normal'}
                    value={formatCurrency(projectedProfit, { showCents: true })}
                  />
                ) : null}
              </View>
              <Text style={styles.snapshotFootnote}>
                {truthSummary?.openAttentionCount
                  ? `${truthSummary.openAttentionCount} record${truthSummary.openAttentionCount === 1 ? '' : 's'} need review.`
                  : 'No records currently need attention.'}
                {truthSummary?.lastActivityAt
                  ? ` Last activity ${formatActivityDate(truthSummary.lastActivityAt)}.`
                  : ' No activity has been recorded yet.'}
              </Text>
              {isTimeAndMaterials ? (
                <Text style={styles.snapshotFootnote}>
                  Customer balance appears after invoicing; conTRACKtor will not infer it from unbilled time and materials.
                </Text>
              ) : (
                <Text style={styles.snapshotFootnote}>
                  Recorded balance is the fixed bid less payments entered for this job.
                </Text>
              )}
            </>
          ) : null}
        </View>

        <View style={styles.panel}>
          <Text style={styles.panelTitle}>Financial details</Text>
          {isSnapshotLoading ? <Text style={styles.panelMessage}>Loading snapshot...</Text> : null}
          {!isSnapshotLoading && snapshotError ? (
            <Text style={styles.panelError}>{snapshotError}</Text>
          ) : null}
          {!isTimeAndMaterials ? (
            <MetricRow
              label="Quoted amount"
              value={formatCurrency(databaseSnapshot?.quote_amount ?? snapshot.quoteAmount)}
            />
          ) : null}
          <MetricRow
            label="Payments received"
            value={formatCurrency(databaseSnapshot?.payments_received ?? snapshot.paymentsReceived, {
              showCents: true,
            })}
          />
          <MetricRow
            label="Labor cost"
            onPress={() => setExpandedCost((current) => (current === 'labor' ? null : 'labor'))}
            value={formatCurrency(databaseSnapshot?.labor_cost ?? snapshot.totalLaborCost, {
              showCents: true,
            })}
          />
          {expandedCost === 'labor' ? (
            <CostDetailPanel
              emptyText="No reviewed time entries yet."
              items={laborEntries.map((entry) => ({
                detail: `${formatNumber(entry.duration_minutes / 60)} hrs at ${formatCurrency(
                  entry.hourly_rate,
                  { showCents: true }
                )}/hr${entry.description ? ` - ${entry.description}` : ''}`,
                id: entry.id,
                title: entry.worker_name ?? 'Labor',
                value: formatCurrency((entry.duration_minutes / 60) * entry.hourly_rate, {
                  showCents: true,
                }),
              }))}
            />
          ) : null}
          <MetricRow
            label="Materials cost"
            onPress={() =>
              setExpandedCost((current) => (current === 'materials' ? null : 'materials'))
            }
            value={formatCurrency(databaseSnapshot?.receipt_cost ?? snapshot.totalReceiptCost, {
              showCents: true,
            })}
          />
          {expandedCost === 'materials' ? (
            <CostDetailPanel
              emptyText="No material expenses yet."
              items={materialEntries.map((entry) => ({
                detail: `${formatActivityDate(entry.expense_date)}${
                  entry.expense_type ? ` - ${formatCostType(entry.expense_type)}` : ''
                }${
                  entry.tax_amount > 0
                    ? ` - includes ${formatCurrency(entry.tax_amount, { showCents: true })} tax`
                    : ''
                }`,
                id: entry.id,
                title: entry.description,
                value: formatCurrency(entry.total_amount, { showCents: true }),
              }))}
            />
          ) : null}
          <MetricRow
            label="Total cost"
            value={formatCurrency(databaseSnapshot?.total_cost ?? snapshot.totalCost, {
              showCents: true,
            })}
          />
          <MetricRow
            label="Total hours"
            value={formatNumber(databaseSnapshot?.total_hours ?? totalLocalHours(job))}
          />
          {!isTimeAndMaterials ? (
            <>
              <MetricRow
                label="Projected profit"
                value={
                  databaseSnapshot?.projected_profit !== null &&
                  databaseSnapshot?.projected_profit !== undefined
                    ? formatCurrency(databaseSnapshot.projected_profit, { showCents: true })
                    : hasFinancialData
                      ? formatCurrency(snapshot.projectedProfit, { showCents: true })
                      : '—'
                }
                isNegative={
                  databaseSnapshot?.projected_profit !== null &&
                  databaseSnapshot?.projected_profit !== undefined
                    ? databaseSnapshot.projected_profit < 0
                    : hasFinancialData && snapshot.projectedProfit < 0
                }
              />
              <MetricRow
                label="Projected margin"
                value={
                  databaseSnapshot?.projected_margin_percent !== null &&
                  databaseSnapshot?.projected_margin_percent !== undefined
                    ? formatPercent(databaseSnapshot.projected_margin_percent)
                    : hasFinancialData
                      ? formatPercent(snapshot.projectedMarginPercent)
                      : '—'
                }
                isNegative={
                  databaseSnapshot?.projected_margin_percent !== null &&
                  databaseSnapshot?.projected_margin_percent !== undefined
                    ? databaseSnapshot.projected_margin_percent < 0
                    : hasFinancialData && snapshot.projectedMarginPercent < 0
                }
              />
            </>
          ) : null}
        </View>

        <Pressable style={styles.addButton} onPress={onAddUpdate}>
          <Text style={styles.addButtonText}>Add update</Text>
        </Pressable>
        <Pressable style={styles.invoiceButton} onPress={onCreateInvoice}>
          <Text style={styles.invoiceButtonText}>Create invoice</Text>
        </Pressable>
        <Pressable style={styles.invoiceButton} onPress={onExportReport}>
          <Text style={styles.invoiceButtonText}>Export job report</Text>
        </Pressable>
        {showShoppingList ? (
          <Pressable style={styles.invoiceButton} onPress={onShoppingList}>
            <Text style={styles.invoiceButtonText}>Shopping list</Text>
          </Pressable>
        ) : null}

        <View style={styles.panel}>
          <Text style={styles.panelTitle}>Recent activity</Text>
          {isActivityLoading ? <Text style={styles.panelMessage}>Loading activity...</Text> : null}
          {!isActivityLoading && activityError ? (
            <Text style={styles.panelError}>{activityError}</Text>
          ) : null}
          {!isActivityLoading && !activityError && activity.length > 0 ? (
            <View style={styles.activityList}>
              {activity.map((item) => (
                <Pressable
                  disabled={!item.receiptId && !item.hoursId && !item.paymentId && !item.noteId}
                  key={item.id}
                  onPress={() => {
                    if (item.hoursId) {
                      onEditHours(item.hoursId);
                      return;
                    }

                    if (item.paymentId) {
                      onEditPayment(item.paymentId);
                      return;
                    }

                    if (item.noteId) {
                      onEditNote(item.noteId);
                      return;
                    }

                    if (item.receiptId) {
                      onReviewReceipt(item.receiptId);
                    }
                  }}
                  style={styles.activityItem}>
                  <Text style={styles.activityDate}>{formatActivityDate(item.date)}</Text>
                  <Text style={styles.activityLabel}>{item.label}</Text>
                  <Text style={styles.activityDetail}>{item.detail}</Text>
                  {item.hoursId ? <Text style={styles.activityAction}>Edit hours</Text> : null}
                  {item.paymentId ? <Text style={styles.activityAction}>Edit payment</Text> : null}
                  {item.noteId ? <Text style={styles.activityAction}>Edit note</Text> : null}
                  {item.receiptId ? (
                    <Text style={styles.activityAction}>
                      {item.label === 'Receipt' ? 'View receipt' : 'Review receipt'}
                    </Text>
                  ) : null}
                </Pressable>
              ))}
            </View>
          ) : null}
          {!isActivityLoading && !activityError && activity.length === 0 ? (
            <Text style={styles.emptyActivityText}>No receipts, hours, payments, or notes yet.</Text>
          ) : null}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function MetricRow({
  label,
  onPress,
  value,
  isNegative = false,
}: {
  label: string;
  onPress?: () => void;
  value: string;
  isNegative?: boolean;
}) {
  const content = (
    <>
      <Text style={styles.metricLabel}>{label}</Text>
      <View style={styles.metricValueGroup}>
        <Text style={[styles.metricValue, isNegative && styles.negativeValue]}>{value}</Text>
        {onPress ? <Text style={styles.metricChevron}>View</Text> : null}
      </View>
    </>
  );

  if (onPress) {
    return (
      <Pressable onPress={onPress} style={styles.metricRow}>
        {content}
      </Pressable>
    );
  }

  return (
    <View style={styles.metricRow}>
      {content}
    </View>
  );
}

function SnapshotMetric({
  label,
  tone = 'normal',
  value,
}: {
  label: string;
  tone?: 'normal' | 'warning';
  value: string;
}) {
  return (
    <View style={styles.snapshotMetric}>
      <Text style={styles.snapshotMetricLabel}>{label}</Text>
      <Text
        style={[
          styles.snapshotMetricValue,
          tone === 'warning' ? styles.snapshotMetricValueWarning : null,
        ]}>
        {value}
      </Text>
    </View>
  );
}

function CostDetailPanel({
  emptyText,
  items,
}: {
  emptyText: string;
  items: { detail: string; id: string; title: string; value: string }[];
}) {
  return (
    <View style={styles.costDetailPanel}>
      {items.length === 0 ? <Text style={styles.panelMessage}>{emptyText}</Text> : null}
      {items.map((item) => (
        <View key={item.id} style={styles.costDetailItem}>
          <View style={styles.costDetailText}>
            <Text style={styles.costDetailTitle}>{item.title}</Text>
            <Text style={styles.costDetailMeta}>{item.detail}</Text>
          </View>
          <Text style={styles.costDetailValue}>{item.value}</Text>
        </View>
      ))}
    </View>
  );
}

function formatNumber(value: number | null | undefined): string {
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 2,
  }).format(value ?? 0);
}

function totalLocalHours(job: Job): number {
  return job.hours.reduce((sum, entry) => sum + entry.hours, 0);
}

function formatActivityDate(date: string | null): string {
  if (!date) {
    return 'Date pending';
  }

  const normalizedDate = date.includes('T') ? date : `${date}T12:00:00`;
  const parsedDate = new Date(normalizedDate);

  if (Number.isNaN(parsedDate.getTime())) {
    return 'Date pending';
  }

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
  }).format(parsedDate);
}

function formatCostType(value: string): string {
  return value
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
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
    minHeight: 44,
    justifyContent: 'center',
    marginBottom: 8,
  },
  backButtonText: {
    color: '#335C43',
    fontSize: 16,
    fontWeight: '800',
  },
  header: {
    marginBottom: 16,
  },
  jobName: {
    color: '#1F2933',
    fontSize: 28,
    fontWeight: '800',
  },
  clientName: {
    color: '#64748B',
    fontSize: 16,
    fontWeight: '600',
    marginTop: 4,
  },
  detailText: {
    color: '#7C6F64',
    fontSize: 14,
    fontWeight: '700',
    marginTop: 4,
  },
  editButton: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderColor: '#335C43',
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: 'center',
    marginTop: 12,
    minHeight: 44,
    paddingHorizontal: 16,
  },
  editButtonText: {
    color: '#335C43',
    fontSize: 15,
    fontWeight: '800',
  },
  panel: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E2E0DA',
    borderRadius: 8,
    borderWidth: 1,
    padding: 16,
  },
  snapshotPanel: {
    backgroundColor: '#173D2A',
    borderRadius: 12,
    marginBottom: 14,
    padding: 18,
  },
  snapshotHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  snapshotEyebrow: {
    color: '#B7D4BF',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1.2,
  },
  snapshotTitle: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '900',
    marginTop: 3,
  },
  statusBadge: {
    backgroundColor: '#E7F0E9',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  statusBadgeText: {
    color: '#173D2A',
    fontSize: 12,
    fontWeight: '900',
  },
  snapshotGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  snapshotMetric: {
    backgroundColor: '#244E38',
    borderColor: '#3C684F',
    borderRadius: 10,
    borderWidth: 1,
    minWidth: 140,
    padding: 12,
    width: '48%',
  },
  snapshotMetricLabel: {
    color: '#C9DDCE',
    fontSize: 12,
    fontWeight: '800',
  },
  snapshotMetricValue: {
    color: '#FFFFFF',
    fontSize: 21,
    fontWeight: '900',
    marginTop: 4,
  },
  snapshotMetricValueWarning: {
    color: '#FFD38A',
  },
  snapshotFootnote: {
    color: '#C9DDCE',
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 19,
    marginTop: 12,
  },
  snapshotMessage: {
    color: '#C9DDCE',
    fontSize: 14,
    lineHeight: 20,
  },
  snapshotError: {
    color: '#FFD0C7',
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
  },
  panelTitle: {
    color: '#1F2933',
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 12,
  },
  panelMessage: {
    color: '#64748B',
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 8,
  },
  panelError: {
    color: '#B91C1C',
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 8,
  },
  metricRow: {
    alignItems: 'center',
    borderTopColor: '#ECEAE4',
    borderTopWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 44,
  },
  metricLabel: {
    color: '#64748B',
    fontSize: 15,
  },
  metricValue: {
    color: '#1F2933',
    fontSize: 17,
    fontWeight: '800',
  },
  metricValueGroup: {
    alignItems: 'flex-end',
    gap: 2,
  },
  metricChevron: {
    color: '#335C43',
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  costDetailPanel: {
    backgroundColor: '#F8FAF8',
    borderTopColor: '#ECEAE4',
    borderTopWidth: 1,
    gap: 10,
    paddingVertical: 12,
  },
  costDetailItem: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
  },
  costDetailText: {
    flex: 1,
    gap: 3,
  },
  costDetailTitle: {
    color: '#1F2933',
    fontSize: 14,
    fontWeight: '900',
  },
  costDetailMeta: {
    color: '#64748B',
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 17,
  },
  costDetailValue: {
    color: '#1F2933',
    fontSize: 14,
    fontWeight: '900',
  },
  negativeValue: {
    color: '#B91C1C',
  },
  addButton: {
    alignItems: 'center',
    backgroundColor: '#335C43',
    borderRadius: 8,
    justifyContent: 'center',
    marginTop: 16,
    minHeight: 56,
  },
  addButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
  },
  invoiceButton: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#335C43',
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: 'center',
    marginBottom: 16,
    marginTop: 10,
    minHeight: 52,
  },
  invoiceButtonText: {
    color: '#335C43',
    fontSize: 17,
    fontWeight: '800',
  },
  activityList: {
    gap: 12,
  },
  activityItem: {
    borderTopColor: '#ECEAE4',
    borderTopWidth: 1,
    paddingTop: 12,
  },
  activityDate: {
    color: '#7C6F64',
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  activityLabel: {
    color: '#1F2933',
    fontSize: 16,
    fontWeight: '800',
    marginTop: 3,
  },
  activityDetail: {
    color: '#475569',
    fontSize: 14,
    lineHeight: 20,
    marginTop: 3,
  },
  activityAction: {
    color: '#335C43',
    fontSize: 13,
    fontWeight: '800',
    marginTop: 6,
  },
  emptyActivityText: {
    color: '#64748B',
    fontSize: 15,
    lineHeight: 22,
  },
});
