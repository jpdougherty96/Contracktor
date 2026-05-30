import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
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

import { formatCurrency } from '@/src/lib/financials';
import { fetchJobs } from '@/src/lib/jobs';
import {
  confirmReceiptLineAssignments,
  createReceiptImageSignedUrl,
  deleteReceipt,
  fetchReceipt,
  fetchReceiptLineItems,
  fetchPotentialDuplicateReceipts,
  receiptCategories,
  requireReceiptLineItems,
  updateReceipt,
  type PotentialDuplicateReceipt,
  type ReceiptCategory,
  type ReceiptLineAssignmentType,
} from '@/src/lib/receipts';
import type { Tables } from '@/src/types/database';
import type { Job } from '@/src/types/job';

type LineAssignmentState = {
  assignedJobId: string | null;
  assignmentType: ReceiptLineAssignmentType;
};

type ReceiptReviewScreenProps = {
  includeInventoryDestination?: boolean;
  inventoryMode?: boolean;
  job?: Job | null;
  jobs?: Job[];
  onBack: () => void;
  onEditReceiptJobs?: (initialJobIds: string[], initialInventorySelected: boolean) => void;
  onReviewReceipt: (receiptId: string) => void;
  onSaved: () => void;
  receiptId: string;
};

export function ReceiptReviewScreen({
  includeInventoryDestination = false,
  inventoryMode = false,
  job,
  jobs: contextJobs,
  onBack,
  onEditReceiptJobs,
  onReviewReceipt,
  onSaved,
  receiptId,
}: ReceiptReviewScreenProps) {
  const [receipt, setReceipt] = useState<Tables<'receipts'> | null>(null);
  const [vendor, setVendor] = useState('');
  const [receiptDate, setReceiptDate] = useState('');
  const [subtotal, setSubtotal] = useState('');
  const [tax, setTax] = useState('');
  const [total, setTotal] = useState('');
  const [jobCostAmount, setJobCostAmount] = useState('');
  const [category, setCategory] = useState<ReceiptCategory>('other');
  const [isLoading, setIsLoading] = useState(true);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [isImageLoading, setIsImageLoading] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const [lineItems, setLineItems] = useState<Tables<'receipt_line_items'>[]>([]);
  const [lineAssignments, setLineAssignments] = useState<Record<string, LineAssignmentState>>({});
  const [jobs, setJobs] = useState<Job[]>([]);
  const [potentialDuplicates, setPotentialDuplicates] = useState<PotentialDuplicateReceipt[]>([]);
  const [isDeletingReceiptId, setIsDeletingReceiptId] = useState<string | null>(null);
  const [isEditingLineAssignments, setIsEditingLineAssignments] = useState(false);
  const [isReviewingSingleJobLines, setIsReviewingSingleJobLines] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const requiresRetake = receipt?.status === 'error' || receipt?.review_status === 'error';
  const hasLineItems = lineItems.length > 0;
  const lineItemsTotal = receipt ? getLineItemsTotal(lineItems, receipt.tax) : 0;
  const lineItemsExceedReceiptTotal =
    hasLineItems &&
    typeof receipt?.total === 'number' &&
    lineItemsTotal > receipt.total + 0.05;
  const assignedLineItemsTotal = receipt
    ? getAssignedLineItemsTotal(lineItems, lineAssignments, receipt.tax)
    : 0;
  const assignedLineItemsExceedReceiptTotal =
    hasLineItems &&
    typeof receipt?.total === 'number' &&
    assignedLineItemsTotal > receipt.total + 0.05;
  const selectedReceiptJobs =
    contextJobs && contextJobs.length > 0 ? contextJobs : job && !inventoryMode ? [job] : [];
  const isSingleJobLineReceipt = selectedReceiptJobs.length === 1 && hasLineItems;
  const requiresLineItems =
    (selectedReceiptJobs.length > 1 ||
      (includeInventoryDestination && selectedReceiptJobs.length > 0)) &&
    !hasLineItems;
  const areLineItemsFinalized =
    hasLineItems &&
    lineItems.every((lineItem) =>
      lineItem.review_status === 'confirmed' || lineItem.review_status === 'ignored'
    );
  const isSavedReceipt =
    receipt?.status === 'accepted' &&
    receipt?.review_status === 'reviewed' &&
    !requiresLineItems &&
    (!hasLineItems || areLineItemsFinalized);
  const canEditLineAssignments = hasLineItems && isSavedReceipt;
  const canEditReceiptDestinations = hasLineItems && Boolean(onEditReceiptJobs);
  const shouldShowLineEditor =
    hasLineItems &&
    (inventoryMode ||
      includeInventoryDestination ||
      lineItemsExceedReceiptTotal ||
      !isSingleJobLineReceipt ||
      isReviewingSingleJobLines ||
      isEditingLineAssignments);
  const canSaveLineAssignments =
    hasLineItems && (!isSavedReceipt || isEditingLineAssignments || isSingleJobLineReceipt);

  useEffect(() => {
    let isMounted = true;

    const loadReceipt = async () => {
      setIsLoading(true);
      setErrorMessage(null);

      try {
        const shouldFetchJobs = !contextJobs || contextJobs.length === 0;
        const [nextReceipt, nextLineItems, nextJobs] = await Promise.all([
          fetchReceipt(receiptId),
          fetchReceiptLineItems(receiptId),
          shouldFetchJobs ? fetchJobs() : Promise.resolve(contextJobs),
        ]);
        const assignmentJobs = inventoryMode ? [] : nextJobs.length > 0 ? nextJobs : job ? [job] : [];
        const needsLineItemReset =
          (assignmentJobs.length > 1 || (includeInventoryDestination && assignmentJobs.length > 0)) &&
          nextLineItems.length === 0 &&
          nextReceipt.status === 'accepted';
        const displayReceipt = needsLineItemReset
          ? await requireReceiptLineItems(nextReceipt.id)
          : nextReceipt;

        if (isMounted) {
          setIsEditingLineAssignments(false);
          setIsReviewingSingleJobLines(false);
          setReceipt(displayReceipt);
          setLineItems(nextLineItems);
          setJobs(assignmentJobs);
          setLineAssignments(
            getInitialLineAssignments(nextLineItems, displayReceipt, job?.id ?? null, inventoryMode)
          );
          setVendor(displayReceipt.vendor ?? '');
          setReceiptDate(displayReceipt.receipt_date ?? getTodayDate());
          setSubtotal(formatEditableMoney(displayReceipt.subtotal));
          setTax(formatEditableMoney(displayReceipt.tax));
          setTotal(formatEditableMoney(displayReceipt.total));
          setJobCostAmount(formatEditableMoney(displayReceipt.total));
          setCategory(
            isReceiptCategory(displayReceipt.category)
              ? displayReceipt.category
              : inventoryMode
                ? 'tools'
                : 'other'
          );
          setPotentialDuplicates([]);

          fetchPotentialDuplicateReceipts(displayReceipt)
            .then((duplicates) => {
              if (isMounted) {
                setPotentialDuplicates(duplicates);
              }
            })
            .catch((error) => {
              if (isMounted) {
                setErrorMessage(
                  error instanceof Error
                    ? error.message
                    : 'Unable to check for duplicate receipts.'
                );
              }
            });

          if (displayReceipt.storage_path) {
            setIsImageLoading(true);
            setImageError(null);

            createReceiptImageSignedUrl(displayReceipt.storage_path)
              .then((signedUrl) => {
                if (isMounted) {
                  setImageUrl(signedUrl);
                }
              })
              .catch((error) => {
                if (isMounted) {
                  setImageError(
                    error instanceof Error ? error.message : 'Unable to load receipt image.'
                  );
                }
              })
              .finally(() => {
                if (isMounted) {
                  setIsImageLoading(false);
                }
              });
          } else {
            setImageUrl(null);
            setImageError(null);
            setIsImageLoading(false);
          }
        }
      } catch (error) {
        if (isMounted) {
          setErrorMessage(error instanceof Error ? error.message : 'Unable to load receipt.');
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    loadReceipt();

    return () => {
      isMounted = false;
    };
  }, [contextJobs, includeInventoryDestination, inventoryMode, job, receiptId]);

  const handleSave = async () => {
    setErrorMessage(null);

    if (requiresRetake) {
      setErrorMessage(receipt?.error_message ?? 'Please retake this receipt photo before saving.');
      return;
    }

    if (requiresLineItems) {
      setErrorMessage(
        'This receipt was scanned for multiple jobs, but no line items were returned. It needs line items before it can be saved.'
      );
      return;
    }

    if (hasLineItems) {
      if (assignedLineItemsExceedReceiptTotal && typeof receipt?.total === 'number') {
        setErrorMessage(
          `Assigned receipt lines add up to ${formatCurrency(assignedLineItemsTotal, {
            showCents: true,
          })}, which is more than the receipt total of ${formatCurrency(receipt.total, {
            showCents: true,
          })}. Review the parsed line items before saving.`
        );
        return;
      }

      setIsSaving(true);

      try {
        await confirmReceiptLineAssignments(
          receiptId,
          lineItems.map((lineItem) => ({
            assignedJobId: lineAssignments[lineItem.id]?.assignedJobId ?? null,
            assignmentType: lineAssignments[lineItem.id]?.assignmentType ?? 'ignore',
            lineItemId: lineItem.id,
          }))
        );
        onSaved();
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : 'Unable to save receipt lines.');
      } finally {
        setIsSaving(false);
      }

      return;
    }

    const parsedSubtotal = parseOptionalMoney(subtotal);
    const parsedTax = parseOptionalMoney(tax);
    const parsedTotal = parseRequiredMoney(total);
    const parsedJobCostAmount = parseRequiredMoney(jobCostAmount);

    if (!vendor.trim()) {
      setErrorMessage('Vendor is required.');
      return;
    }

    if (!isIsoDate(receiptDate)) {
      setErrorMessage('Receipt date must use YYYY-MM-DD format.');
      return;
    }

    if (parsedSubtotal === undefined) {
      setErrorMessage('Subtotal must be a valid number.');
      return;
    }

    if (parsedTax === undefined) {
      setErrorMessage('Tax must be a valid number.');
      return;
    }

    if (parsedTotal === null || parsedTotal <= 0) {
      setErrorMessage('Total is required and must be greater than 0.');
      return;
    }

    if (parsedJobCostAmount === null || parsedJobCostAmount < 0) {
      setErrorMessage(
        inventoryMode
          ? 'Amount saved to Tools / Inventory is required and cannot be negative.'
          : 'Amount applied to this job is required and cannot be negative.'
      );
      return;
    }

    if (parsedJobCostAmount > parsedTotal) {
      setErrorMessage(
        inventoryMode
          ? 'Amount saved to Tools / Inventory cannot be more than the receipt total.'
          : 'Amount applied to this job cannot be more than the receipt total.'
      );
      return;
    }

    setIsSaving(true);

    try {
      await updateReceipt(receiptId, {
        category,
        jobCostAmount: parsedJobCostAmount,
        receiptDate,
        subtotal: parsedSubtotal,
        tax: parsedTax,
        total: parsedTotal,
        vendor: vendor.trim(),
      });
      onSaved();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to save receipt.');
    } finally {
      setIsSaving(false);
    }
  };

  const updateLineAssignment = (lineItemId: string, nextAssignment: LineAssignmentState) => {
    setLineAssignments((current) => ({
      ...current,
      [lineItemId]: nextAssignment,
    }));
  };

  const confirmDeleteReceipt = (targetReceiptId: string, isCurrentReceipt: boolean) => {
    Alert.alert(
      'Delete receipt?',
      'This removes the receipt record, parsed lines, related expenses, and stored image. Use this only for duplicates.',
      [
        { style: 'cancel', text: 'Cancel' },
        {
          onPress: () => {
            void handleDeleteReceipt(targetReceiptId, isCurrentReceipt);
          },
          style: 'destructive',
          text: 'Delete',
        },
      ]
    );
  };

  const handleDeleteReceipt = async (targetReceiptId: string, isCurrentReceipt: boolean) => {
    setErrorMessage(null);
    setIsDeletingReceiptId(targetReceiptId);

    try {
      await deleteReceipt(targetReceiptId);

      if (isCurrentReceipt) {
        onSaved();
        return;
      }

      setPotentialDuplicates((duplicates) =>
        duplicates.filter((duplicate) => duplicate.id !== targetReceiptId)
      );
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to delete receipt.');
    } finally {
      setIsDeletingReceiptId(null);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardView}>
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          <Pressable style={styles.backButton} onPress={onBack}>
            <Text style={styles.backButtonText}>
              {inventoryMode ? 'Back to receipt' : 'Back to job'}
            </Text>
          </Pressable>

          <View style={styles.header}>
            <Text style={styles.title}>Review receipt</Text>
            <Text style={styles.subtitle}>{inventoryMode ? 'Tools / Inventory' : job?.name}</Text>
          </View>

          <View style={styles.form}>
            {isLoading ? (
              <View style={styles.loadingRow}>
                <ActivityIndicator color="#335C43" />
                <Text style={styles.loadingText}>Loading receipt...</Text>
              </View>
            ) : null}

            {receipt ? (
              <>
                <View style={styles.imagePanel}>
                  <Text style={styles.imageTitle}>Receipt photo</Text>
                  {isImageLoading ? (
                    <View style={styles.loadingRow}>
                      <ActivityIndicator color="#335C43" />
                      <Text style={styles.loadingText}>Loading image...</Text>
                    </View>
                  ) : null}
                  {imageUrl ? (
                    <Image
                      resizeMode="contain"
                      source={{ uri: imageUrl }}
                      style={styles.receiptImage}
                    />
                  ) : null}
                  {!isImageLoading && imageError ? (
                    <Text style={styles.imageError}>{imageError}</Text>
                  ) : null}
                  {!isImageLoading && !imageUrl && !imageError ? (
                    <Text style={styles.imageMessage}>No receipt image is available.</Text>
                  ) : null}
                </View>

                <View style={styles.statusRow}>
                  <Text style={styles.statusLabel}>Status</Text>
                  <Text style={styles.statusValue}>{formatStatus(receipt.status)}</Text>
                </View>
                {requiresRetake ? (
                  <View style={styles.retakePanel}>
                    <Text style={styles.retakeTitle}>Retake required</Text>
                    <Text style={styles.retakeText}>
                      {receipt.error_message ??
                        "We couldn't read the required receipt details from this photo."}
                    </Text>
                  </View>
                ) : null}
                {receipt.total !== null ? (
                  <View style={styles.statusRow}>
                    <Text style={styles.statusLabel}>Current total</Text>
                    <Text style={styles.statusValue}>
                      {formatCurrency(receipt.total, { showCents: true })}
                    </Text>
                  </View>
                ) : null}
                {requiresLineItems ? (
                  <View style={styles.retakePanel}>
                    <Text style={styles.retakeTitle}>Line items required</Text>
                    <Text style={styles.retakeText}>
                      This receipt was selected for multiple jobs. It cannot be saved as one
                      whole-receipt cost because that would put the full amount on one job.
                    </Text>
                  </View>
                ) : null}

                {potentialDuplicates.length > 0 ? (
                  <View style={styles.duplicatePanel}>
                    <Text style={styles.duplicateTitle}>Possible duplicate receipt</Text>
                    <Text style={styles.duplicateHelp}>
                      These receipts have matching totals and receipt details. Delete the duplicate before saving job costs.
                    </Text>
                    {potentialDuplicates.map((duplicate) => (
                      <View
                        key={`${duplicate.source}-${duplicate.id}-${duplicate.expenseId ?? 'receipt'}`}
                        style={styles.duplicateCard}>
                        <View style={styles.duplicateTextColumn}>
                          <Text style={styles.duplicateName}>
                            {duplicate.vendor ?? 'Receipt'} ·{' '}
                            {duplicate.total !== null
                              ? formatCurrency(duplicate.total, { showCents: true })
                              : 'No total'}
                          </Text>
                          <Text style={styles.duplicateMeta}>
                            {duplicate.matchReason} · {duplicate.receipt_date ?? 'No date'} ·{' '}
                            {formatStatus(duplicate.status)}
                            {duplicate.source === 'expense' ? ' · Already in job costs' : ''}
                          </Text>
                        </View>
                        <View style={styles.duplicateActions}>
                          <Pressable
                            onPress={() => onReviewReceipt(duplicate.id)}
                            style={styles.secondaryButton}>
                            <Text style={styles.secondaryButtonText}>Review</Text>
                          </Pressable>
                          <Pressable
                            disabled={isDeletingReceiptId === duplicate.id}
                            onPress={() => confirmDeleteReceipt(duplicate.id, false)}
                            style={[
                              styles.deleteButton,
                              isDeletingReceiptId === duplicate.id && styles.disabledButton,
                            ]}>
                            <Text style={styles.deleteButtonText}>
                              {isDeletingReceiptId === duplicate.id
                                ? 'Deleting...'
                                : 'Delete duplicate'}
                            </Text>
                          </Pressable>
                        </View>
                      </View>
                    ))}
                    <Pressable
                      disabled={isDeletingReceiptId === receipt.id}
                      onPress={() => confirmDeleteReceipt(receipt.id, true)}
                      style={[
                        styles.deleteCurrentButton,
                        isDeletingReceiptId === receipt.id && styles.disabledButton,
                      ]}>
                      <Text style={styles.deleteCurrentButtonText}>
                        {isDeletingReceiptId === receipt.id
                          ? 'Deleting this receipt...'
                          : 'Keep duplicate, delete this scan'}
                      </Text>
                    </Pressable>
                  </View>
                ) : null}

                {lineItemsExceedReceiptTotal && receipt?.total ? (
                  <View style={styles.warningPanel}>
                    <Text style={styles.warningTitle}>Line items need review</Text>
                    <Text style={styles.warningText}>
                      Parsed lines add up to{' '}
                      {formatCurrency(lineItemsTotal, { showCents: true })}, but the receipt total is{' '}
                      {formatCurrency(receipt.total, { showCents: true })}. conTRACKtor will not save
                      more than the receipt total.
                    </Text>
                  </View>
                ) : null}

                {hasLineItems && isSingleJobLineReceipt && !shouldShowLineEditor ? (
                  <View style={styles.quickConfirmPanel}>
                    <View style={styles.quickConfirmText}>
                      <Text style={styles.quickConfirmTitle}>Materials total</Text>
                      <Text style={styles.quickConfirmHelp}>
                        Confirm this total against the receipt, then save.
                      </Text>
                    </View>
                    <Text style={styles.quickConfirmAmount}>
                      {formatCurrency(lineItemsTotal, {
                        showCents: true,
                      })}
                    </Text>
                    <View style={styles.quickConfirmActions}>
                      <Pressable
                        disabled={isSaving}
                        onPress={handleSave}
                        style={[styles.quickSaveButton, isSaving && styles.disabledButton]}>
                        <Text style={styles.quickSaveButtonText}>
                          {isSaving ? 'Saving...' : 'Save'}
                        </Text>
                      </Pressable>
                      <Pressable
                        disabled={isSaving}
                        onPress={() => setIsReviewingSingleJobLines(true)}
                        style={styles.quickEditButton}>
                        <Text style={styles.quickEditButtonText}>Edit</Text>
                      </Pressable>
                    </View>
                  </View>
                ) : null}

                {shouldShowLineEditor ? (
                  <View style={styles.lineItemsPanel}>
                    <Text style={styles.sectionTitle}>Line items</Text>
                    <Text style={styles.helpText}>
                      Assign each line to a job, Tools / Inventory, or ignore it. Tax is split across item lines when saved.
                    </Text>
                    {lineItems.map((lineItem) => (
                      <LineItemCard
                        assignment={lineAssignments[lineItem.id]}
                        jobs={jobs}
                        key={lineItem.id}
                        lineItem={lineItem}
                        readOnly={isSavedReceipt && !isEditingLineAssignments}
                        onChange={(nextAssignment) =>
                          updateLineAssignment(lineItem.id, nextAssignment)
                        }
                      />
                    ))}
                  </View>
                ) : requiresLineItems ? null : (
                  <>
                    <Field
                      label="Vendor"
                      onChangeText={setVendor}
                      placeholder="Vendor"
                      value={vendor}
                    />
                    <Field
                      label="Receipt date"
                      onChangeText={setReceiptDate}
                      placeholder="YYYY-MM-DD"
                      value={receiptDate}
                    />
                    <Field
                      inputMode="decimal"
                      label="Subtotal"
                      onChangeText={setSubtotal}
                      placeholder="Optional"
                      value={subtotal}
                    />
                    <Field
                      inputMode="decimal"
                      label="Tax"
                      onChangeText={setTax}
                      placeholder="Optional"
                      value={tax}
                    />
                    <Field
                      inputMode="decimal"
                      label="Total"
                      onChangeText={setTotal}
                      placeholder="0.00"
                      value={total}
                    />
                    <Field
                      inputMode="decimal"
                      label={inventoryMode ? 'Amount saved to Tools / Inventory' : 'Amount applied to this job'}
                      onChangeText={setJobCostAmount}
                      placeholder="0.00"
                      value={jobCostAmount}
                    />
                    <Text style={styles.helpText}>
                      {inventoryMode
                        ? 'Use this when a receipt should stay out of customer job costs.'
                        : 'Use this when one receipt includes tools, overhead, or materials for more than one job.'}
                    </Text>

                    <View style={styles.field}>
                      <Text style={styles.label}>Category</Text>
                      <View style={styles.categoryGrid}>
                        {receiptCategories.map((option) => (
                          <Pressable
                            key={option}
                            onPress={() => setCategory(option)}
                            style={[
                              styles.categoryButton,
                              category === option && styles.selectedCategoryButton,
                            ]}>
                            <Text
                              style={[
                                styles.categoryButtonText,
                                category === option && styles.selectedCategoryButtonText,
                              ]}>
                              {formatCategory(option)}
                            </Text>
                          </Pressable>
                        ))}
                      </View>
                    </View>
                  </>
                )}
              </>
            ) : null}

            {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

            {isSavedReceipt && !isEditingLineAssignments ? (
              <View style={styles.savedPanel}>
                <Text style={styles.savedTitle}>Receipt saved</Text>
                <Text style={styles.savedText}>
                  {inventoryMode
                    ? 'This receipt is already saved to Tools / Inventory.'
                    : "This receipt is already included in this job's costs."}
                </Text>
                {canEditLineAssignments ? (
                  <Pressable
                    onPress={() => {
                      if (onEditReceiptJobs && receipt) {
                        onEditReceiptJobs(
                          getReceiptAssignedJobIds(lineItems, receipt),
                          getReceiptHasInventoryDestination(lineItems, inventoryMode)
                        );
                        return;
                      }

                      setIsEditingLineAssignments(true);
                    }}
                    style={styles.savedEditButton}>
                    <Text style={styles.savedEditButtonText}>Edit line assignments</Text>
                  </Pressable>
                ) : null}
                {canEditReceiptDestinations ? (
                  <Pressable
                    onPress={() => {
                      onEditReceiptJobs?.(
                        getReceiptAssignedJobIds(lineItems, receipt),
                        getReceiptHasInventoryDestination(lineItems, inventoryMode)
                      );
                    }}
                    style={styles.savedSecondaryButton}>
                    <Text style={styles.savedSecondaryButtonText}>Change jobs / destinations</Text>
                  </Pressable>
                ) : null}
              </View>
            ) : isSingleJobLineReceipt && !shouldShowLineEditor ? null : (
              <Pressable
                disabled={
                  isSaving ||
                  isLoading ||
                  !receipt ||
                  requiresRetake ||
                  requiresLineItems ||
                  (hasLineItems && !canSaveLineAssignments)
                }
                onPress={handleSave}
                style={[
                  styles.saveButton,
                  (isSaving ||
                    isLoading ||
                    !receipt ||
                    requiresRetake ||
                    requiresLineItems ||
                    (hasLineItems && !canSaveLineAssignments)) &&
                    styles.disabledButton,
                ]}>
                <Text style={styles.saveButtonText}>
                  {isSaving
                    ? 'Saving...'
                    : hasLineItems
                      ? 'Save line assignments'
                      : 'Save receipt'}
                </Text>
              </Pressable>
            )}

            {isEditingLineAssignments ? (
              <Pressable
                disabled={isSaving}
                onPress={() => setIsEditingLineAssignments(false)}
                style={styles.cancelEditButton}>
                <Text style={styles.cancelEditButtonText}>Cancel edit</Text>
              </Pressable>
            ) : null}
            {isReviewingSingleJobLines ? (
              <Pressable
                disabled={isSaving}
                onPress={() => setIsReviewingSingleJobLines(false)}
                style={styles.cancelEditButton}>
                <Text style={styles.cancelEditButtonText}>Hide line details</Text>
              </Pressable>
            ) : null}

            {receipt ? (
              <Pressable
                disabled={isDeletingReceiptId === receipt.id}
                onPress={() => confirmDeleteReceipt(receipt.id, true)}
                style={[
                  styles.deleteCurrentButton,
                  isDeletingReceiptId === receipt.id && styles.disabledButton,
                ]}>
                <Text style={styles.deleteCurrentButtonText}>
                  {isDeletingReceiptId === receipt.id ? 'Deleting receipt...' : 'Delete receipt'}
                </Text>
              </Pressable>
            ) : null}
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

function LineItemCard({
  assignment,
  jobs,
  lineItem,
  onChange,
  readOnly = false,
}: {
  assignment: LineAssignmentState | undefined;
  jobs: Job[];
  lineItem: Tables<'receipt_line_items'>;
  onChange: (assignment: LineAssignmentState) => void;
  readOnly?: boolean;
}) {
  const currentAssignment = assignment ?? {
    assignedJobId: lineItem.assigned_job_id,
    assignmentType: lineItem.assignment_type as ReceiptLineAssignmentType,
  };
  const canAssignToJob = jobs.length > 0;

  return (
    <View style={styles.lineItemCard}>
      <View style={styles.lineItemHeader}>
        <View style={styles.lineItemTextColumn}>
          <Text style={styles.lineItemName}>{lineItem.cleaned_name}</Text>
          {lineItem.original_text && lineItem.original_text !== lineItem.cleaned_name ? (
            <Text style={styles.lineItemOriginal}>{lineItem.original_text}</Text>
          ) : null}
        </View>
        <Text style={styles.lineItemAmount}>
          {formatCurrency(lineItem.line_total, { showCents: true })}
        </Text>
      </View>
      <Text style={styles.lineItemMeta}>
        {formatCategory(lineItem.line_type)}
        {lineItem.quantity !== null ? ` · Qty ${lineItem.quantity}` : ''}
        {lineItem.unit_price !== null
          ? ` · ${formatCurrency(lineItem.unit_price, { showCents: true })} each`
          : ''}
      </Text>

      <View style={styles.assignmentGrid}>
        {canAssignToJob ? (
          <Pressable
            disabled={readOnly}
            onPress={() =>
              onChange({
                assignedJobId: currentAssignment.assignedJobId ?? jobs[0]?.id ?? null,
                assignmentType: 'job',
              })
            }
            style={[
              styles.assignmentButton,
              currentAssignment.assignmentType === 'job' && styles.selectedAssignmentButton,
              readOnly && styles.readOnlyButton,
            ]}>
            <Text
              style={[
                styles.assignmentButtonText,
                currentAssignment.assignmentType === 'job' && styles.selectedAssignmentButtonText,
              ]}>
              Job
            </Text>
          </Pressable>
        ) : null}
        <Pressable
          disabled={readOnly}
          onPress={() => onChange({ assignedJobId: null, assignmentType: 'tools_inventory' })}
          style={[
            styles.assignmentButton,
            currentAssignment.assignmentType === 'tools_inventory' &&
              styles.selectedAssignmentButton,
            readOnly && styles.readOnlyButton,
          ]}>
          <Text
            style={[
              styles.assignmentButtonText,
              currentAssignment.assignmentType === 'tools_inventory' &&
                styles.selectedAssignmentButtonText,
            ]}>
            Tools / Inventory
          </Text>
        </Pressable>
        <Pressable
          disabled={readOnly}
          onPress={() => onChange({ assignedJobId: null, assignmentType: 'ignore' })}
          style={[
            styles.assignmentButton,
            currentAssignment.assignmentType === 'ignore' && styles.selectedAssignmentButton,
            readOnly && styles.readOnlyButton,
          ]}>
          <Text
            style={[
              styles.assignmentButtonText,
              currentAssignment.assignmentType === 'ignore' && styles.selectedAssignmentButtonText,
            ]}>
            Ignore
          </Text>
        </Pressable>
      </View>

      {currentAssignment.assignmentType === 'job' ? (
        <View style={styles.jobChoiceGrid}>
          {jobs.map((jobOption) => (
            <Pressable
              disabled={readOnly}
              key={jobOption.id}
              onPress={() =>
                onChange({
                  assignedJobId: jobOption.id,
                  assignmentType: 'job',
                })
              }
              style={[
                styles.jobChoiceButton,
                currentAssignment.assignedJobId === jobOption.id && styles.selectedJobChoiceButton,
                readOnly && styles.readOnlyButton,
              ]}>
              <Text
                style={[
                  styles.jobChoiceButtonText,
                  currentAssignment.assignedJobId === jobOption.id &&
                    styles.selectedJobChoiceButtonText,
                ]}>
                {jobOption.name}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function formatEditableMoney(value: number | null): string {
  return value === null ? '' : String(value);
}

function parseRequiredMoney(value: string): number | null {
  const parsed = Number(value.replace(/[$,]/g, '').trim());

  return Number.isFinite(parsed) ? parsed : null;
}

function parseOptionalMoney(value: string): number | null | undefined {
  const trimmedValue = value.replace(/[$,]/g, '').trim();

  if (!trimmedValue) {
    return null;
  }

  const parsed = Number(trimmedValue);

  return Number.isFinite(parsed) ? parsed : undefined;
}

function getTodayDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function isReceiptCategory(value: string | null): value is ReceiptCategory {
  return receiptCategories.includes(value as ReceiptCategory);
}

function getInitialLineAssignments(
  lineItems: Tables<'receipt_line_items'>[],
  receipt: Tables<'receipts'>,
  fallbackJobId: string | null,
  inventoryMode = false
): Record<string, LineAssignmentState> {
  return Object.fromEntries(
    lineItems.map((lineItem) => {
      if (isNonPurchaseLineItem(lineItem)) {
        return [
          lineItem.id,
          {
            assignedJobId: null,
            assignmentType: 'ignore' as const,
          },
        ];
      }

      const assignmentType = inventoryMode
        ? 'tools_inventory'
        : isReceiptLineAssignmentType(lineItem.assignment_type)
        ? lineItem.assignment_type
        : 'job';
      const assignedJobId =
        assignmentType === 'job' && fallbackJobId
          ? lineItem.assigned_job_id ?? receipt.scan_context_job_id ?? fallbackJobId
          : null;

      return [
        lineItem.id,
        {
          assignedJobId,
          assignmentType,
        },
      ];
    })
  );
}

function isReceiptLineAssignmentType(value: string): value is ReceiptLineAssignmentType {
  return value === 'job' || value === 'tools_inventory' || value === 'ignore';
}

function getLineItemsTotal(
  lineItems: Tables<'receipt_line_items'>[],
  receiptTax: number | null
): number {
  const itemTotal = lineItems
    .filter((lineItem) => lineItem.line_type === 'item')
    .reduce((sum, lineItem) => sum + lineItem.line_total, 0);

  return itemTotal + (receiptTax ?? 0);
}

function getAssignedLineItemsTotal(
  lineItems: Tables<'receipt_line_items'>[],
  assignments: Record<string, LineAssignmentState>,
  receiptTax: number | null
): number {
  const taxableSubtotal = lineItems
    .filter((lineItem) => lineItem.line_type === 'item')
    .reduce((sum, lineItem) => sum + lineItem.line_total, 0);

  return lineItems.reduce((sum, lineItem) => {
    const assignment = assignments[lineItem.id];

    if (assignment?.assignmentType === 'ignore' || isNonPurchaseLineItem(lineItem)) {
      return sum;
    }

    const allocatedTax =
      receiptTax && taxableSubtotal > 0 && lineItem.line_type === 'item'
        ? receiptTax * (lineItem.line_total / taxableSubtotal)
        : 0;

    return sum + lineItem.line_total + allocatedTax;
  }, 0);
}

function isNonPurchaseLineItem(lineItem: Tables<'receipt_line_items'>): boolean {
  return (
    lineItem.line_type === 'tax' ||
    lineItem.line_type === 'fee' ||
    lineItem.line_type === 'discount'
  );
}

function getReceiptAssignedJobIds(
  lineItems: Tables<'receipt_line_items'>[],
  receipt: Tables<'receipts'>
): string[] {
  return Array.from(
    new Set(
      [
        receipt.scan_context_job_id,
        ...lineItems
          .filter((lineItem) => lineItem.assignment_type === 'job')
          .map((lineItem) => lineItem.assigned_job_id),
      ].filter((jobId): jobId is string => Boolean(jobId))
    )
  );
}

function getReceiptHasInventoryDestination(
  lineItems: Tables<'receipt_line_items'>[],
  inventoryMode: boolean
): boolean {
  return inventoryMode || lineItems.some((lineItem) => lineItem.assignment_type === 'tools_inventory');
}

function formatCategory(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function formatStatus(value: string): string {
  return value
    .split('_')
    .map((part) => formatCategory(part))
    .join(' ');
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
    alignSelf: 'center',
    maxWidth: 980,
    padding: 20,
    paddingBottom: 36,
    width: '100%',
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
  statusRow: {
    alignItems: 'center',
    borderBottomColor: '#ECEAE4',
    borderBottomWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 38,
  },
  imagePanel: {
    borderBottomColor: '#ECEAE4',
    borderBottomWidth: 1,
    gap: 10,
    paddingBottom: 14,
  },
  imageTitle: {
    color: '#1F2933',
    fontSize: 16,
    fontWeight: '800',
  },
  receiptImage: {
    alignSelf: 'stretch',
    backgroundColor: '#F6F5F2',
    borderColor: '#E2E0DA',
    borderRadius: 8,
    borderWidth: 1,
    height: Platform.select({ default: 360, web: 520 }),
  },
  imageMessage: {
    color: '#64748B',
    fontSize: 14,
    lineHeight: 20,
  },
  imageError: {
    color: '#B91C1C',
    fontSize: 14,
    lineHeight: 20,
  },
  statusLabel: {
    color: '#64748B',
    fontSize: 14,
    fontWeight: '700',
  },
  statusValue: {
    color: '#1F2933',
    fontSize: 14,
    fontWeight: '800',
  },
  sectionTitle: {
    color: '#1F2933',
    fontSize: 18,
    fontWeight: '900',
  },
  warningPanel: {
    backgroundColor: '#FFF7ED',
    borderColor: '#FDBA74',
    borderRadius: 8,
    borderWidth: 1,
    gap: 6,
    padding: 12,
  },
  warningTitle: {
    color: '#9A3412',
    fontSize: 15,
    fontWeight: '900',
  },
  warningText: {
    color: '#7C2D12',
    fontSize: 13,
    lineHeight: 19,
  },
  quickConfirmPanel: {
    backgroundColor: '#F8FAF8',
    borderColor: '#BCD7C4',
    borderRadius: 8,
    borderWidth: 1,
    gap: 12,
    padding: 12,
  },
  quickConfirmText: {
    gap: 4,
  },
  quickConfirmTitle: {
    color: '#1F2933',
    fontSize: 17,
    fontWeight: '900',
  },
  quickConfirmHelp: {
    color: '#64748B',
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18,
  },
  quickConfirmAmount: {
    color: '#1F2933',
    fontSize: 30,
    fontWeight: '900',
  },
  quickConfirmActions: {
    flexDirection: 'row',
    gap: 8,
  },
  quickSaveButton: {
    alignItems: 'center',
    backgroundColor: '#335C43',
    borderRadius: 8,
    flex: 1,
    justifyContent: 'center',
    minHeight: 48,
  },
  quickSaveButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '900',
  },
  quickEditButton: {
    alignItems: 'center',
    borderColor: '#335C43',
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    justifyContent: 'center',
    minHeight: 48,
  },
  quickEditButtonText: {
    color: '#335C43',
    fontSize: 16,
    fontWeight: '900',
  },
  lineItemsPanel: {
    gap: 10,
  },
  lineItemCard: {
    borderColor: '#E2E0DA',
    borderRadius: 8,
    borderWidth: 1,
    gap: 10,
    padding: 12,
  },
  lineItemHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'space-between',
  },
  lineItemTextColumn: {
    flex: 1,
    gap: 4,
  },
  lineItemName: {
    color: '#1F2933',
    fontSize: 16,
    fontWeight: '900',
  },
  lineItemOriginal: {
    color: '#64748B',
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18,
  },
  lineItemAmount: {
    color: '#1F2933',
    fontSize: 15,
    fontWeight: '900',
  },
  lineItemMeta: {
    color: '#64748B',
    fontSize: 12,
    fontWeight: '700',
  },
  assignmentGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  assignmentButton: {
    alignItems: 'center',
    borderColor: '#C9C3B8',
    borderRadius: 8,
    borderWidth: 1,
    flexGrow: 1,
    justifyContent: 'center',
    minHeight: 40,
    paddingHorizontal: 10,
  },
  selectedAssignmentButton: {
    backgroundColor: '#335C43',
    borderColor: '#335C43',
  },
  assignmentButtonText: {
    color: '#475569',
    fontSize: 13,
    fontWeight: '900',
  },
  selectedAssignmentButtonText: {
    color: '#FFFFFF',
  },
  readOnlyButton: {
    opacity: 0.8,
  },
  jobChoiceGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  jobChoiceButton: {
    borderColor: '#C9C3B8',
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 38,
    paddingHorizontal: 10,
  },
  selectedJobChoiceButton: {
    backgroundColor: '#EEF6F0',
    borderColor: '#335C43',
  },
  jobChoiceButtonText: {
    color: '#475569',
    fontSize: 12,
    fontWeight: '800',
  },
  selectedJobChoiceButtonText: {
    color: '#335C43',
  },
  retakePanel: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FCA5A5',
    borderRadius: 8,
    borderWidth: 1,
    gap: 6,
    padding: 12,
  },
  retakeTitle: {
    color: '#B91C1C',
    fontSize: 16,
    fontWeight: '900',
  },
  retakeText: {
    color: '#7F1D1D',
    fontSize: 14,
    lineHeight: 20,
  },
  duplicatePanel: {
    backgroundColor: '#FFF7ED',
    borderColor: '#FDBA74',
    borderRadius: 8,
    borderWidth: 1,
    gap: 10,
    padding: 12,
  },
  duplicateTitle: {
    color: '#9A3412',
    fontSize: 16,
    fontWeight: '900',
  },
  duplicateHelp: {
    color: '#7C2D12',
    fontSize: 13,
    lineHeight: 19,
  },
  duplicateCard: {
    backgroundColor: '#FFFFFF',
    borderColor: '#FED7AA',
    borderRadius: 8,
    borderWidth: 1,
    gap: 10,
    padding: 10,
  },
  duplicateTextColumn: {
    gap: 4,
  },
  duplicateName: {
    color: '#1F2933',
    fontSize: 14,
    fontWeight: '900',
  },
  duplicateMeta: {
    color: '#7C2D12',
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 17,
  },
  duplicateActions: {
    flexDirection: 'row',
    gap: 8,
  },
  secondaryButton: {
    alignItems: 'center',
    borderColor: '#335C43',
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    justifyContent: 'center',
    minHeight: 42,
  },
  secondaryButtonText: {
    color: '#335C43',
    fontSize: 14,
    fontWeight: '900',
  },
  deleteButton: {
    alignItems: 'center',
    backgroundColor: '#B91C1C',
    borderRadius: 8,
    flex: 1,
    justifyContent: 'center',
    minHeight: 42,
  },
  deleteButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '900',
  },
  deleteCurrentButton: {
    alignItems: 'center',
    borderColor: '#B91C1C',
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 44,
  },
  deleteCurrentButtonText: {
    color: '#B91C1C',
    fontSize: 14,
    fontWeight: '900',
  },
  savedPanel: {
    backgroundColor: '#F0FDF4',
    borderColor: '#86EFAC',
    borderRadius: 8,
    borderWidth: 1,
    gap: 4,
    padding: 12,
  },
  savedTitle: {
    color: '#166534',
    fontSize: 16,
    fontWeight: '900',
  },
  savedText: {
    color: '#166534',
    fontSize: 14,
    lineHeight: 20,
  },
  savedEditButton: {
    alignItems: 'center',
    backgroundColor: '#166534',
    borderRadius: 8,
    justifyContent: 'center',
    marginTop: 6,
    minHeight: 44,
  },
  savedEditButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '900',
  },
  savedSecondaryButton: {
    alignItems: 'center',
    borderColor: '#166534',
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: 'center',
    marginTop: 6,
    minHeight: 44,
  },
  savedSecondaryButtonText: {
    color: '#166534',
    fontSize: 15,
    fontWeight: '900',
  },
  cancelEditButton: {
    alignItems: 'center',
    borderColor: '#335C43',
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 48,
  },
  cancelEditButtonText: {
    color: '#335C43',
    fontSize: 16,
    fontWeight: '900',
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
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  categoryButton: {
    alignItems: 'center',
    borderColor: '#C9C3B8',
    borderRadius: 8,
    borderWidth: 1,
    minHeight: 44,
    paddingHorizontal: 12,
    justifyContent: 'center',
  },
  selectedCategoryButton: {
    backgroundColor: '#335C43',
    borderColor: '#335C43',
  },
  categoryButtonText: {
    color: '#475569',
    fontSize: 14,
    fontWeight: '800',
  },
  selectedCategoryButtonText: {
    color: '#FFFFFF',
  },
  errorText: {
    color: '#B91C1C',
    fontSize: 14,
    lineHeight: 20,
  },
  helpText: {
    color: '#64748B',
    fontSize: 13,
    lineHeight: 19,
    marginTop: -6,
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
