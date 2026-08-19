import { Feather } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { fetchJobs } from '@/src/lib/jobs';
import {
  createShoppingNeed,
  dismissShoppingNeed,
  fetchJobShoppingNeeds,
  fetchOpenShoppingNeeds,
  markShoppingNeedFulfilled,
  reopenShoppingNeed,
  updateShoppingNeedDetails,
  type ShoppingNeedWithJob,
} from '@/src/lib/shoppingNeeds';
import { colors } from '@/src/styles/theme';
import type { Job } from '@/src/types/job';

type ShoppingListScreenProps = {
  contextJob?: Job | null;
  onChanged?: () => void;
  onBack: () => void;
};

export function ShoppingListScreen({ contextJob = null, onBack, onChanged }: ShoppingListScreenProps) {
  const [newItemText, setNewItemText] = useState('');
  const [selectedJobId, setSelectedJobId] = useState<string | null>(contextJob?.id ?? null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [needs, setNeeds] = useState<ShoppingNeedWithJob[]>([]);
  const [editingNeedId, setEditingNeedId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const groupedNeeds = useMemo(() => groupNeedsByJob(needs), [needs]);
  const activeJobs = useMemo(
    () => jobs.filter((job) => job.status === 'active').slice(0, 12),
    [jobs]
  );

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const [nextJobs, nextNeeds] = contextJob
        ? [[contextJob], await fetchJobShoppingNeeds(contextJob.id)]
        : await Promise.all([fetchJobs(), fetchOpenShoppingNeeds()]);
      setJobs(nextJobs);
      setNeeds(nextNeeds);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load shopping list.');
    } finally {
      setIsLoading(false);
    }
  }, [contextJob]);

  useEffect(() => {
    setSelectedJobId(contextJob?.id ?? null);
    load();
  }, [contextJob?.id, load]);

  const handleAdd = async () => {
    const cleanItemText = newItemText.trim();

    if (!cleanItemText) {
      setError('Enter what needs to be bought.');
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      await createShoppingNeed({
        description: cleanItemText,
        jobId: selectedJobId,
        quantity: null,
        unit: null,
      });
      setNewItemText('');
      await load();
      onChanged?.();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to add shopping need.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleStatusChange = async (
    needId: string,
    action: 'dismiss' | 'fulfilled' | 'open'
  ) => {
    setError(null);

    try {
      if (action === 'fulfilled') {
        await markShoppingNeedFulfilled(needId);
      } else if (action === 'open') {
        await reopenShoppingNeed(needId);
      } else {
        await dismissShoppingNeed(needId);
      }

      await load();
      onChanged?.();
    } catch (statusError) {
      setError(
        statusError instanceof Error ? statusError.message : 'Unable to update shopping need.'
      );
    }
  };

  const startEditing = (need: ShoppingNeedWithJob) => {
    setError(null);
    setEditingNeedId(need.id);
    setEditingText(formatNeedForEditing(need));
  };

  const cancelEditing = () => {
    setEditingNeedId(null);
    setEditingText('');
  };

  const handleSaveEdit = async () => {
    if (!editingNeedId) {
      return;
    }

    const cleanText = editingText.trim();

    if (!cleanText) {
      setError('Enter what needs to be bought.');
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      await updateShoppingNeedDetails(editingNeedId, {
        description: cleanText,
        normalizedName: null,
        quantity: null,
        unit: null,
      });
      cancelEditing();
      await load();
      onChanged?.();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to edit shopping need.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.content}>
          <Pressable onPress={onBack}>
            <Text style={styles.backLink}>{contextJob ? 'Back to job' : 'Back home'}</Text>
          </Pressable>

          <View style={styles.header}>
            <Text style={styles.title}>Shopping list</Text>
            <Text style={styles.subtitle}>
              {contextJob ? `${contextJob.name} material needs.` : 'Open material needs across active jobs.'}
            </Text>
          </View>

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          {isLoading ? (
            <View style={styles.loadingCard}>
              <ActivityIndicator color={colors.primaryGreen} />
              <Text style={styles.loadingText}>Loading shopping list...</Text>
            </View>
          ) : null}

          {!isLoading && groupedNeeds.length === 0 ? (
            <View style={styles.emptyState}>
              <Feather color={colors.primaryGreen} name="check-circle" size={24} />
              <View style={styles.emptyTextWrap}>
                <Text style={styles.emptyTitle}>Nothing on the list</Text>
                <Text style={styles.emptyDetail}>Open material needs will show here.</Text>
              </View>
            </View>
          ) : null}

          {!isLoading && groupedNeeds.length > 0 ? (
            <View style={styles.groupList}>
              {groupedNeeds.map((group) => {
                const openItems = group.items.filter((need) => need.status === 'open');
                const fulfilledItems = contextJob
                  ? group.items.filter((need) => need.status === 'fulfilled')
                  : [];

                return (
                  <View key={group.key} style={styles.group}>
                    {!contextJob ? <Text style={styles.groupTitle}>{group.label}</Text> : null}
                    {openItems.length > 0 ? (
                      <View style={styles.needList}>
                        {openItems.map((need) => (
                          <ShoppingNeedRow
                            editingNeedId={editingNeedId}
                            editingText={editingText}
                            isSaving={isSaving}
                            key={need.id}
                            need={need}
                            onCancelEditing={cancelEditing}
                            onChangeEditingText={setEditingText}
                            onDismiss={() => handleStatusChange(need.id, 'dismiss')}
                            onSaveEdit={handleSaveEdit}
                            onStartEditing={() => startEditing(need)}
                            onToggleFulfilled={() => handleStatusChange(need.id, 'fulfilled')}
                          />
                        ))}
                      </View>
                    ) : null}
                    {fulfilledItems.length > 0 ? (
                      <View style={styles.fulfilledGroup}>
                        <Text style={styles.fulfilledTitle}>Fulfilled</Text>
                        <View style={styles.needList}>
                          {fulfilledItems.map((need) => (
                            <ShoppingNeedRow
                              editingNeedId={editingNeedId}
                              editingText={editingText}
                              isFulfilled
                              isSaving={isSaving}
                              key={need.id}
                              need={need}
                              onCancelEditing={cancelEditing}
                              onChangeEditingText={setEditingText}
                              onDismiss={() => handleStatusChange(need.id, 'dismiss')}
                              onSaveEdit={handleSaveEdit}
                              onStartEditing={() => startEditing(need)}
                              onToggleFulfilled={() => handleStatusChange(need.id, 'open')}
                            />
                          ))}
                        </View>
                      </View>
                    ) : null}
                  </View>
                );
              })}
            </View>
          ) : null}

          <View style={styles.addInlineRow}>
            <TextInput
              onChangeText={setNewItemText}
              onSubmitEditing={handleAdd}
              placeholder="Add item..."
              placeholderTextColor={colors.mutedText}
              returnKeyType="done"
              style={styles.addInlineInput}
              value={newItemText}
            />
            <Pressable
              accessibilityLabel="Add shopping list item"
              disabled={isSaving}
              onPress={handleAdd}
              style={[styles.addInlineButton, isSaving ? styles.addInlineButtonDisabled : null]}>
              <Feather color={colors.warmWhite} name="plus" size={22} />
            </Pressable>
          </View>

          {!contextJob ? (
            <View style={styles.destinationPicker}>
              <Text style={styles.destinationLabel}>Destination</Text>
              <ScrollView
                contentContainerStyle={styles.jobChipList}
                horizontal
                keyboardShouldPersistTaps="handled"
                showsHorizontalScrollIndicator={false}>
                <JobChip
                  isSelected={selectedJobId === null}
                  label="General"
                  onPress={() => setSelectedJobId(null)}
                />
                {activeJobs.map((job) => (
                  <JobChip
                    isSelected={selectedJobId === job.id}
                    key={job.id}
                    label={job.name}
                    onPress={() => setSelectedJobId(job.id)}
                  />
                ))}
              </ScrollView>
            </View>
          ) : null}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function JobChip({
  isSelected,
  label,
  onPress,
}: {
  isSelected: boolean;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={[styles.jobChip, isSelected ? styles.jobChipSelected : null]}>
      <Text style={[styles.jobChipText, isSelected ? styles.jobChipTextSelected : null]}>
        {label}
      </Text>
    </Pressable>
  );
}

function ShoppingNeedRow({
  editingNeedId,
  editingText,
  isFulfilled = false,
  isSaving,
  need,
  onCancelEditing,
  onChangeEditingText,
  onDismiss,
  onSaveEdit,
  onStartEditing,
  onToggleFulfilled,
}: {
  editingNeedId: string | null;
  editingText: string;
  isFulfilled?: boolean;
  isSaving: boolean;
  need: ShoppingNeedWithJob;
  onCancelEditing: () => void;
  onChangeEditingText: (value: string) => void;
  onDismiss: () => void;
  onSaveEdit: () => void;
  onStartEditing: () => void;
  onToggleFulfilled: () => void;
}) {
  const isEditing = editingNeedId === need.id;

  return (
    <View style={[styles.needRow, isFulfilled ? styles.fulfilledNeedRow : null]}>
      <Pressable
        accessibilityLabel={isFulfilled ? 'Move shopping need back to open' : 'Check off shopping need'}
        onPress={onToggleFulfilled}
        style={[styles.checkButton, isFulfilled ? styles.fulfilledCheckButton : null]}>
        <Feather
          color={isFulfilled ? colors.warmWhite : colors.primaryGreen}
          name="check"
          size={19}
        />
      </Pressable>
      {isEditing ? (
        <View style={styles.editWrap}>
          <TextInput
            autoFocus
            onChangeText={onChangeEditingText}
            onSubmitEditing={onSaveEdit}
            returnKeyType="done"
            style={styles.editInput}
            value={editingText}
          />
          <View style={styles.editActions}>
            <Pressable
              disabled={isSaving}
              onPress={onSaveEdit}
              style={[styles.editActionButton, styles.saveEditButton]}>
              <Feather color={colors.warmWhite} name="check" size={18} />
            </Pressable>
            <Pressable onPress={onCancelEditing} style={styles.editActionButton}>
              <Feather color={colors.mutedText} name="x" size={18} />
            </Pressable>
          </View>
        </View>
      ) : (
        <>
          <Pressable
            accessibilityLabel="Edit shopping need"
            onPress={onStartEditing}
            style={styles.needText}>
            <View style={styles.needTitleRow}>
              {formatNeedQuantityLabel(need) ? (
                <Text style={[styles.quantityPill, isFulfilled ? styles.fulfilledQuantityPill : null]}>
                  {formatNeedQuantityLabel(need)}
                </Text>
              ) : null}
              <Text style={[styles.needTitle, isFulfilled ? styles.fulfilledNeedTitle : null]}>
                {formatNeedItem(need)}
              </Text>
            </View>
            {isFulfilled ? (
              <Text style={styles.needDetail}>Purchased</Text>
            ) : need.needed_by ? (
              <Text style={styles.needDetail}>Needed by {formatDate(need.needed_by)}</Text>
            ) : null}
          </Pressable>
          <Pressable
            accessibilityLabel="Dismiss shopping need"
            onPress={onDismiss}
            style={styles.dismissButton}>
            <Feather color={colors.mutedText} name="x" size={18} />
          </Pressable>
        </>
      )}
    </View>
  );
}

function groupNeedsByJob(needs: ShoppingNeedWithJob[]) {
  const groups = new Map<string, { items: ShoppingNeedWithJob[]; key: string; label: string }>();

  for (const need of needs) {
    const key = need.job_id ?? 'general';
    const label = need.jobName;
    const existing = groups.get(key);

    if (existing) {
      existing.items.push(need);
    } else {
      groups.set(key, {
        items: [need],
        key,
        label,
      });
    }
  }

  return Array.from(groups.values());
}

function formatNeedLine(need: ShoppingNeedWithJob): string {
  const quantity = formatNeedQuantity(need);
  const unit = getDisplayUnit(need);
  const item = formatNeedItem(need);

  if (!quantity) {
    return item;
  }

  if (unit) {
    return `${quantity} ${unit} of ${item}`;
  }

  return `${quantity} ${item}`;
}

function formatNeedQuantity(need: ShoppingNeedWithJob): string | null {
  if (!need.quantity) {
    return null;
  }

  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(
    need.quantity
  );
}

function formatNeedQuantityLabel(need: ShoppingNeedWithJob): string | null {
  const quantity = formatNeedQuantity(need);

  if (!quantity) {
    return null;
  }

  const unit = getDisplayUnit(need);

  return unit ? `${quantity} ${unit}` : quantity;
}

function formatNeedItem(need: ShoppingNeedWithJob): string {
  let item = getDisplayText(need);

  if (need.quantity) {
    const quantity = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(
      need.quantity
    );
    item = item
      .replace(new RegExp(`^${escapeRegExp(quantity)}\\s*`, 'i'), '')
      .replace(/^(more|additional|extra|x|×|of)\s+/i, '')
      .replace(/^(boxes?|buckets?|sheets?|bags?|bundles?|tubes?|rolls?|pieces?|feet|foot|ft|linear feet|yards?|yds?|gallons?|gals?)\s+(?:of\s+)?/i, '')
      .trim();
  }

  return capitalizeFirst(item || need.description);
}

function formatNeedForEditing(need: ShoppingNeedWithJob): string {
  return need.user_display_text?.trim() || formatNeedLine(need);
}

function getDisplayUnit(need: ShoppingNeedWithJob): string | null {
  const storedUnit = normalizeDisplayUnit(need.unit);

  if (storedUnit) {
    return storedUnit;
  }

  const descriptionUnit = getDisplayText(need).match(
    /^(?:\d+(?:\.\d+)?\s+)?(boxes?|buckets?|sheets?|bags?|bundles?|tubes?|rolls?|pieces?|feet|foot|ft|linear feet|yards?|yds?|gallons?|gals?)\s+(?:of\s+)?/i
  );

  return descriptionUnit ? normalizeDisplayUnit(descriptionUnit[1]) : null;
}

function getDisplayText(need: ShoppingNeedWithJob): string {
  return need.user_display_text?.trim() || need.description.trim();
}

function normalizeDisplayUnit(value: string | null): string | null {
  if (!value) {
    return null;
  }

  const unit = normalizeUnitKey(value);
  const unitMap: Record<string, string> = {
    bag: 'bags',
    box: 'boxes',
    bucket: 'buckets',
    bundle: 'bundles',
    piece: 'pieces',
    foot: 'feet',
    ft: 'feet',
    'linear foot': 'feet',
    'linear feet': 'feet',
    yard: 'yards',
    yd: 'yards',
    gallon: 'gallons',
    gal: 'gallons',
    roll: 'rolls',
    sheet: 'sheets',
    tube: 'tubes',
  };

  return unitMap[unit] ?? null;
}

function normalizeUnitKey(value: string): string {
  const unit = value.toLowerCase().trim();

  if (unit === 'boxes') {
    return 'box';
  }

  if (unit.endsWith('s')) {
    return unit.slice(0, -1);
  }

  return unit;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function capitalizeFirst(value: string): string {
  const trimmed = value.trim();

  if (!trimmed) {
    return trimmed;
  }

  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

function formatDate(dateValue: string): string {
  const date = new Date(`${dateValue}T12:00:00`);

  if (Number.isNaN(date.getTime())) {
    return dateValue;
  }

  return new Intl.DateTimeFormat('en-US', {
    day: 'numeric',
    month: 'short',
  }).format(date);
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
    marginBottom: 22,
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
  addInlineRow: {
    alignItems: 'center',
    backgroundColor: colors.warmWhite,
    borderColor: colors.standardBorder,
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
    minHeight: 48,
    paddingHorizontal: 10,
  },
  addInlineInput: {
    color: colors.text,
    flex: 1,
    fontSize: 17,
    fontWeight: '800',
    minHeight: 48,
  },
  jobChipList: {
    gap: 8,
    paddingVertical: 2,
  },
  destinationPicker: {
    gap: 8,
    marginTop: 12,
  },
  destinationLabel: {
    color: colors.mutedText,
    fontSize: 14,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  jobChip: {
    borderColor: colors.standardBorder,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  jobChipSelected: {
    backgroundColor: colors.primaryGreen,
    borderColor: colors.primaryGreen,
  },
  jobChipText: {
    color: colors.primaryGreen,
    fontSize: 14,
    fontWeight: '900',
  },
  jobChipTextSelected: {
    color: colors.warmWhite,
  },
  addInlineButton: {
    alignItems: 'center',
    backgroundColor: colors.primaryGreen,
    borderRadius: 9,
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  addInlineButtonDisabled: {
    opacity: 0.65,
  },
  errorText: {
    color: colors.danger,
    fontSize: 15,
    fontWeight: '800',
    lineHeight: 20,
    marginBottom: 12,
  },
  loadingCard: {
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
  loadingText: {
    color: colors.mutedText,
    fontSize: 16,
    fontWeight: '800',
  },
  emptyState: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 4,
    paddingVertical: 10,
  },
  emptyTextWrap: {
    flex: 1,
    gap: 3,
  },
  emptyTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '900',
  },
  emptyDetail: {
    color: colors.mutedText,
    fontSize: 15,
    fontWeight: '700',
  },
  groupList: {
    gap: 18,
  },
  group: {
    gap: 8,
  },
  groupTitle: {
    color: colors.text,
    fontSize: 24,
    fontWeight: '900',
  },
  fulfilledGroup: {
    gap: 8,
    marginTop: 6,
  },
  fulfilledTitle: {
    color: colors.mutedText,
    fontSize: 15,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  needList: {
    backgroundColor: colors.cardBackground,
    borderColor: colors.standardBorder,
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden',
  },
  needRow: {
    alignItems: 'center',
    borderBottomColor: colors.standardBorder,
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: 10,
    minHeight: 64,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  fulfilledNeedRow: {
    backgroundColor: '#F8FAF8',
  },
  needText: {
    flex: 1,
    gap: 4,
  },
  needTitleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  quantityPill: {
    backgroundColor: colors.primaryGreen,
    borderRadius: 8,
    color: colors.warmWhite,
    fontSize: 16,
    fontWeight: '900',
    overflow: 'hidden',
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  fulfilledQuantityPill: {
    backgroundColor: '#7D8B81',
  },
  needTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '900',
    lineHeight: 22,
    flexShrink: 1,
  },
  fulfilledNeedTitle: {
    color: '#55635B',
    textDecorationLine: 'line-through',
  },
  needDetail: {
    color: colors.mutedText,
    fontSize: 14,
    fontWeight: '700',
  },
  editWrap: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: 8,
  },
  editInput: {
    backgroundColor: colors.warmWhite,
    borderColor: colors.standardBorder,
    borderRadius: 10,
    borderWidth: 1,
    color: colors.text,
    flex: 1,
    fontSize: 17,
    fontWeight: '800',
    minHeight: 44,
    paddingHorizontal: 10,
  },
  editActions: {
    flexDirection: 'row',
    gap: 6,
  },
  editActionButton: {
    alignItems: 'center',
    borderColor: colors.standardBorder,
    borderRadius: 9,
    borderWidth: 1,
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  saveEditButton: {
    backgroundColor: colors.primaryGreen,
    borderColor: colors.primaryGreen,
  },
  checkButton: {
    alignItems: 'center',
    borderColor: colors.standardBorder,
    borderRadius: 10,
    borderWidth: 1,
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  fulfilledCheckButton: {
    backgroundColor: colors.primaryGreen,
    borderColor: colors.primaryGreen,
  },
  dismissButton: {
    alignItems: 'center',
    height: 38,
    justifyContent: 'center',
    width: 32,
  },
});
