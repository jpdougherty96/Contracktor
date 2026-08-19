import { Feather } from '@expo/vector-icons';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { resolveActivityEvent } from '@/src/lib/activityEvents';
import { fetchGlobalActivity, type GlobalActivityItem, type GlobalActivitySummary } from '@/src/lib/globalActivity';
import { colors } from '@/src/styles/theme';

type ActivityScreenProps = {
  onChanged?: () => void;
  onBack: () => void;
  onOpenItem: (item: GlobalActivityItem) => void;
  refreshKey?: number;
};

export function ActivityScreen({ onBack, onChanged, onOpenItem, refreshKey = 0 }: ActivityScreenProps) {
  const [summary, setSummary] = useState<GlobalActivitySummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [resolvingEventId, setResolvingEventId] = useState<string | null>(null);

  const loadActivity = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const nextSummary = await fetchGlobalActivity();
      setSummary(nextSummary);
    } catch (activityError) {
      setError(activityError instanceof Error ? activityError.message : 'Unable to load activity.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    let isMounted = true;

    const loadMountedActivity = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const nextSummary = await fetchGlobalActivity();

        if (isMounted) {
          setSummary(nextSummary);
        }
      } catch (activityError) {
        if (isMounted) {
          setError(activityError instanceof Error ? activityError.message : 'Unable to load activity.');
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    loadMountedActivity();

    return () => {
      isMounted = false;
    };
  }, [refreshKey]);

  const handleResolveItem = async (item: GlobalActivityItem) => {
    if (!item.activityEventId) {
      return;
    }

    setResolvingEventId(item.activityEventId);
    setError(null);

    try {
      await resolveActivityEvent(item.activityEventId);
      await loadActivity();
      onChanged?.();
    } catch (resolveError) {
      setError(resolveError instanceof Error ? resolveError.message : 'Unable to mark item reviewed.');
    } finally {
      setResolvingEventId(null);
    }
  };

  const attentionItems = summary?.needsReview ?? [];
  const normalActivity = useMemo(
    () => (summary?.items ?? []).filter((item) => !item.needsReview),
    [summary?.items]
  );
  const todayActivity = useMemo(() => getTodayItems(normalActivity), [normalActivity]);
  const groupedEarlierActivity = useMemo(
    () => groupActivityByDay(normalActivity.filter((item) => !isToday(item.capturedAt ?? item.date))),
    [normalActivity]
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.content}>
          <Pressable onPress={onBack}>
            <Text style={styles.backLink}>Back home</Text>
          </Pressable>

          <View style={styles.header}>
            <View>
              <Text style={styles.title}>Recent activity</Text>
              <Text style={styles.subtitle}>Completed work and items that need attention.</Text>
            </View>
          </View>

          {isLoading ? (
            <View style={styles.stateCard}>
              <ActivityIndicator color={colors.primaryGreen} />
              <Text style={styles.stateText}>Loading activity...</Text>
            </View>
          ) : null}

          {!isLoading && error ? (
            <View style={styles.stateCard}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          {!isLoading && !error && summary ? (
            <>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Needs Attention</Text>
                {summary.needsReviewCount > 0 ? (
                  <View style={styles.reviewCount}>
                    <Text style={styles.reviewCountText}>{summary.needsReviewCount}</Text>
                  </View>
                ) : null}
              </View>

              {attentionItems.length > 0 ? (
                <View style={styles.reviewList}>
                  {attentionItems.map((item) => (
                    <ActivityRow
                      isResolving={resolvingEventId === item.activityEventId}
                      key={item.id}
                      item={item}
                      onPress={() => onOpenItem(item)}
                      onResolve={
                        item.activityEventId && item.type === 'activity_event'
                          ? () => handleResolveItem(item)
                          : undefined
                      }
                      prominent
                    />
                  ))}
                </View>
              ) : (
                <View style={styles.emptyState}>
                  <Feather color={colors.primaryGreen} name="check-circle" size={22} />
                  <View style={styles.rowText}>
                    <Text style={styles.rowTitle}>Nothing needs attention</Text>
                    <Text style={styles.rowDetail}>conTRACKtor is not waiting on you to finish anything right now.</Text>
                  </View>
                </View>
              )}

              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Today</Text>
              </View>

              {todayActivity.length > 0 ? (
                <View style={styles.activityList}>
                  {todayActivity.map((item) => (
                    <ActivityRow
                      detailOverride={getCapturedDetail(item)}
                      key={`captured-${item.id}`}
                      item={item}
                      labelOverride={getCapturedLabel(item)}
                      onPress={() => onOpenItem(item)}
                    />
                  ))}
                </View>
              ) : (
                <View style={styles.emptyState}>
                  <Feather color={colors.mutedText} name="inbox" size={22} />
                  <View style={styles.rowText}>
                    <Text style={styles.rowTitle}>Nothing completed today</Text>
                    <Text style={styles.rowDetail}>Receipts, hours, notes, payments, and expenses will show here.</Text>
                  </View>
                </View>
              )}

              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Earlier</Text>
              </View>

              {groupedEarlierActivity.length > 0 ? (
                <View style={styles.dayList}>
                  {groupedEarlierActivity.map((group) => (
                    <View key={group.label} style={styles.dayGroup}>
                      <Text style={styles.dayLabel}>{group.label}</Text>
                      {group.items.length > 0 ? (
                        <View style={styles.activityList}>
                          {group.items.map((item) => (
                            <ActivityRow key={item.id} item={item} onPress={() => onOpenItem(item)} />
                          ))}
                        </View>
                      ) : (
                        <View style={styles.emptyDayCard}>
                          <Text style={styles.emptyDayText}>No activity today yet.</Text>
                        </View>
                      )}
                    </View>
                  ))}
                </View>
              ) : (
                <View style={styles.stateCard}>
                  <Text style={styles.stateText}>No earlier activity yet.</Text>
                </View>
              )}
            </>
          ) : null}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function ActivityRow({
  detailOverride,
  item,
  labelOverride,
  onPress,
  onResolve,
  prominent = false,
  isResolving = false,
}: {
  detailOverride?: string;
  isResolving?: boolean;
  item: GlobalActivityItem;
  labelOverride?: string;
  onPress: () => void;
  onResolve?: () => void;
  prominent?: boolean;
}) {
  return (
    <Pressable onPress={onPress} style={[styles.row, prominent ? styles.prominentRow : null]}>
      <View style={[styles.typeIcon, getToneStyle(item.tone)]}>
        <Feather color={colors.warmWhite} name={getIconName(item.type, item.needsReview)} size={18} />
      </View>
      <View style={styles.rowText}>
        <View style={styles.rowTitleLine}>
          <Text style={styles.rowTitle}>{labelOverride ?? item.label}</Text>
          {item.needsReview ? (
            <View style={styles.smallReviewPill}>
              <Text style={styles.smallReviewPillText}>Attention</Text>
            </View>
          ) : null}
        </View>
        <Text style={styles.jobName}>{item.jobName ?? 'Tools / Inventory'}</Text>
        <Text numberOfLines={prominent ? 3 : 2} style={styles.rowDetail}>
          {detailOverride ?? item.reviewReason ?? item.detail}
        </Text>
        {onResolve ? (
          <Pressable
            disabled={isResolving}
            onPress={(event) => {
              event.stopPropagation();
              onResolve();
            }}
            style={styles.resolveButton}>
            <Text style={styles.resolveButtonText}>{isResolving ? 'Saving...' : 'Mark reviewed'}</Text>
          </Pressable>
        ) : null}
      </View>
      <Feather color={colors.mutedText} name="chevron-right" size={20} />
    </Pressable>
  );
}

function getTodayItems(items: GlobalActivityItem[]) {
  return items
    .filter((item) => isToday(item.capturedAt ?? item.date))
    .sort(sortCapturedNewestFirst)
    .slice(0, 10);
}

function getCapturedDetail(item: GlobalActivityItem): string {
  const activityDate = formatBusinessDate(item.date);

  if (item.type === 'receipt') {
    return `${item.detail} · Receipt date ${activityDate}`;
  }

  if (item.type === 'hours') {
    return `${item.detail} · Work date ${activityDate}`;
  }

  if (item.type === 'payment') {
    return `${item.detail} · Payment date ${activityDate}`;
  }

  if (item.type === 'expense') {
    return `${item.detail} · Expense date ${activityDate}`;
  }

  return item.detail;
}

function getCapturedLabel(item: GlobalActivityItem): string {
  return item.label;
}

function groupActivityByDay(items: GlobalActivityItem[]) {
  const groups = new Map<string, GlobalActivityItem[]>();

  for (const item of items) {
    const label = formatDayLabel(item.date);
    const existing = groups.get(label);

    if (existing) {
      existing.push(item);
    } else {
      groups.set(label, [item]);
    }
  }

  return Array.from(groups.entries()).map(([label, groupItems]) => ({
    items: groupItems,
    label,
  }));
}

function formatDayLabel(dateValue: string | null): string {
  if (!dateValue) {
    return 'No date';
  }

  const date = parseActivityDate(dateValue);

  if (!date) {
    return 'No date';
  }

  const today = startOfDay(new Date());
  const target = startOfDay(date);
  const dayDifference = Math.round((today.getTime() - target.getTime()) / (24 * 60 * 60 * 1000));

  if (dayDifference === 0) {
    return 'Today';
  }

  if (dayDifference === 1) {
    return 'Yesterday';
  }

  return new Intl.DateTimeFormat('en-US', {
    day: 'numeric',
    month: 'short',
    year: today.getFullYear() === target.getFullYear() ? undefined : 'numeric',
  }).format(target);
}

function formatBusinessDate(dateValue: string | null): string {
  if (!dateValue) {
    return 'No date';
  }

  const date = parseActivityDate(dateValue);

  if (!date) {
    return 'No date';
  }

  return new Intl.DateTimeFormat('en-US', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

function isToday(dateValue: string | null | undefined): boolean {
  const date = dateValue ? parseActivityDate(dateValue) : null;

  if (!date) {
    return false;
  }

  return startOfDay(date).getTime() === startOfDay(new Date()).getTime();
}

function parseActivityDate(dateValue: string): Date | null {
  const normalizedDate = dateValue.includes('T') ? dateValue : `${dateValue}T12:00:00`;
  const date = new Date(normalizedDate);

  return Number.isNaN(date.getTime()) ? null : date;
}

function sortCapturedNewestFirst(a: GlobalActivityItem, b: GlobalActivityItem) {
  return (b.capturedAt ?? b.date ?? '').localeCompare(a.capturedAt ?? a.date ?? '');
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function getIconName(type: GlobalActivityItem['type'], needsReview?: boolean) {
  if (needsReview) {
    return 'alert-circle';
  }

  if (type === 'receipt' || type === 'expense') {
    return 'file-text';
  }

  if (type === 'hours') {
    return 'clock';
  }

  if (type === 'payment') {
    return 'dollar-sign';
  }

  if (type === 'note') {
    return 'clipboard';
  }

  return 'briefcase';
}

function getToneStyle(tone: GlobalActivityItem['tone']) {
  if (tone === 'danger') {
    return styles.dangerIcon;
  }

  if (tone === 'warning') {
    return styles.warningIcon;
  }

  return styles.normalIcon;
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.appBackground,
  },
  container: {
    paddingBottom: 32,
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  content: {
    alignSelf: 'center',
    maxWidth: 980,
    paddingHorizontal: 4,
    paddingTop: 12,
    width: '100%',
  },
  backLink: {
    color: colors.primaryGreen,
    fontSize: 18,
    fontWeight: '900',
    marginBottom: 26,
  },
  header: {
    marginBottom: 24,
  },
  title: {
    color: colors.text,
    fontSize: 40,
    fontWeight: '900',
    lineHeight: 46,
  },
  subtitle: {
    color: colors.mutedText,
    fontSize: 17,
    fontWeight: '700',
    lineHeight: 24,
    marginTop: 6,
  },
  sectionHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
    marginTop: 8,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 24,
    fontWeight: '900',
  },
  reviewCount: {
    alignItems: 'center',
    backgroundColor: colors.danger,
    borderRadius: 999,
    justifyContent: 'center',
    minHeight: 28,
    minWidth: 28,
    paddingHorizontal: 8,
  },
  reviewCountText: {
    color: colors.warmWhite,
    fontSize: 14,
    fontWeight: '900',
  },
  reviewList: {
    gap: 10,
    marginBottom: 20,
  },
  dayList: {
    gap: 18,
  },
  dayGroup: {
    gap: 8,
  },
  dayLabel: {
    color: colors.mutedText,
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  activityList: {
    backgroundColor: colors.cardBackground,
    borderColor: colors.standardBorder,
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden',
  },
  emptyDayCard: {
    backgroundColor: colors.cardBackground,
    borderColor: colors.standardBorder,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 16,
  },
  emptyDayText: {
    color: colors.mutedText,
    fontSize: 15,
    fontWeight: '800',
  },
  row: {
    alignItems: 'center',
    backgroundColor: colors.cardBackground,
    borderBottomColor: colors.standardBorder,
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: 12,
    minHeight: 82,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  prominentRow: {
    borderColor: colors.standardBorder,
    borderRadius: 14,
    borderWidth: 1,
  },
  typeIcon: {
    alignItems: 'center',
    borderRadius: 12,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  normalIcon: {
    backgroundColor: colors.primaryGreen,
  },
  warningIcon: {
    backgroundColor: colors.warning,
  },
  dangerIcon: {
    backgroundColor: colors.danger,
  },
  rowText: {
    flex: 1,
    gap: 3,
  },
  rowTitleLine: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  rowTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '900',
    lineHeight: 22,
  },
  jobName: {
    color: colors.primaryGreen,
    fontSize: 14,
    fontWeight: '900',
    lineHeight: 18,
  },
  rowDetail: {
    color: colors.mutedText,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 19,
  },
  resolveButton: {
    alignSelf: 'flex-start',
    borderColor: colors.primaryGreen,
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  resolveButtonText: {
    color: colors.primaryGreen,
    fontSize: 13,
    fontWeight: '900',
  },
  smallReviewPill: {
    backgroundColor: '#F7E2DE',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  smallReviewPillText: {
    color: colors.danger,
    fontSize: 12,
    fontWeight: '900',
  },
  emptyState: {
    alignItems: 'center',
    backgroundColor: 'transparent',
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
    paddingHorizontal: 4,
    paddingVertical: 8,
  },
  stateCard: {
    alignItems: 'center',
    backgroundColor: colors.cardBackground,
    borderColor: colors.standardBorder,
    borderRadius: 14,
    borderWidth: 1,
    gap: 10,
    justifyContent: 'center',
    minHeight: 120,
    padding: 18,
  },
  stateText: {
    color: colors.mutedText,
    fontSize: 16,
    fontWeight: '800',
    textAlign: 'center',
  },
  errorText: {
    color: colors.danger,
    fontSize: 16,
    fontWeight: '800',
    lineHeight: 22,
    textAlign: 'center',
  },
});
