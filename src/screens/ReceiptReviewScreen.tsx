import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
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
import {
  suggestReceiptLineAssignmentsFromShoppingNeeds,
  type ShoppingNeedLineAssignmentSuggestion,
} from '@/src/lib/shoppingNeeds';
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
  const { width: viewportWidth } = useWindowDimensions();
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
  const [imageDimensions, setImageDimensions] = useState<{ height: number; width: number } | null>(null);
  const [isImageViewerOpen, setIsImageViewerOpen] = useState(false);
  const [imageZoom, setImageZoom] = useState(1);
  const [lineItems, setLineItems] = useState<Tables<'receipt_line_items'>[]>([]);
  const [lineAssignments, setLineAssignments] = useState<Record<string, LineAssignmentState>>({});
  const [lineAssignmentSuggestions, setLineAssignmentSuggestions] = useState<
    Record<string, ShoppingNeedLineAssignmentSuggestion>
  >({});
  const [jobs, setJobs] = useState<Job[]>([]);
  const [potentialDuplicates, setPotentialDuplicates] = useState<PotentialDuplicateReceipt[]>([]);
  const [isDeletingReceiptId, setIsDeletingReceiptId] = useState<string | null>(null);
  const [isEditingLineAssignments, setIsEditingLineAssignments] = useState(false);
  const [isReviewingSingleJobLines, setIsReviewingSingleJobLines] = useState(false);
  const [receiptPollKey, setReceiptPollKey] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [isAutoFinalizing, setIsAutoFinalizing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const hasLoadedReceiptRef = useRef(false);
  const loadedImageStoragePathRef = useRef<string | null>(null);
  const autoFinalizedReceiptIdsRef = useRef<Set<string>>(new Set());
  const shouldUseInlineImageZoom = viewportWidth < 768;
  const needsManualReceiptReview = receipt?.status === 'error' || receipt?.review_status === 'error';
  const hasLineItems = lineItems.length > 0;
  const isReceiptStillProcessing = isReceiptProcessingStatus(receipt?.processing_status);
  const selectedReceiptJobs =
    contextJobs && contextJobs.length > 0 ? contextJobs : job && !inventoryMode ? [job] : [];
  const receiptAdjustment = receipt ? getReceiptAdjustmentDecision(lineItems, receipt) : null;
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
  const isSingleJobLineReceipt = selectedReceiptJobs.length === 1 && hasLineItems;
  const hasReceiptAdjustmentDecision =
    Boolean(receiptAdjustment) &&
    lineItemsExceedReceiptTotal &&
    selectedReceiptJobs.length === 1 &&
    !inventoryMode &&
    !includeInventoryDestination;
  const hasUntrustedLineItems = lineItemsExceedReceiptTotal && !hasReceiptAdjustmentDecision;
  const requiresLineItems =
    (selectedReceiptJobs.length > 1 ||
      (includeInventoryDestination && selectedReceiptJobs.length > 0)) &&
    (!hasLineItems || hasUntrustedLineItems);
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
  const assignedDestinationKeys = getAssignedDestinationKeys(lineItems, lineAssignments);
  const hasMultipleAssignedDestinations = isSavedReceipt && assignedDestinationKeys.length > 1;
  const isMultiDestinationReceipt =
    selectedReceiptJobs.length > 1 ||
    (includeInventoryDestination && selectedReceiptJobs.length > 0) ||
    hasMultipleAssignedDestinations;
  const canEditLineAssignments = hasLineItems && isSavedReceipt;
  const shouldShowLineEditor =
    hasLineItems &&
    !hasUntrustedLineItems &&
    (inventoryMode ||
      includeInventoryDestination ||
      hasMultipleAssignedDestinations ||
      !isSingleJobLineReceipt ||
      isReviewingSingleJobLines ||
      isEditingLineAssignments);
  const canSaveLineAssignments =
    hasLineItems &&
    !hasUntrustedLineItems &&
    (!isSavedReceipt || isEditingLineAssignments || isSingleJobLineReceipt);
  const canAutoFinalizeSingleJobReceipt =
    Boolean(receipt) &&
    !isLoading &&
    !isSaving &&
    !isAutoFinalizing &&
    !isReceiptStillProcessing &&
    !isSavedReceipt &&
    !inventoryMode &&
    !includeInventoryDestination &&
    selectedReceiptJobs.length === 1 &&
    hasLineItems &&
    !hasReceiptAdjustmentDecision &&
    !hasUntrustedLineItems &&
    receipt?.processing_status === 'complete';

  useEffect(() => {
    let isMounted = true;

    const loadReceipt = async () => {
      const isPollingRefresh = receiptPollKey > 0 && hasLoadedReceiptRef.current;

      if (!isPollingRefresh) {
        setIsLoading(true);
      }

      setErrorMessage(null);

      try {
        const shouldFetchJobs = !contextJobs || contextJobs.length === 0;
        const [nextReceipt, nextLineItems, fetchedJobs] = await Promise.all([
          fetchReceipt(receiptId),
          fetchReceiptLineItems(receiptId),
          shouldFetchJobs ? fetchJobs() : Promise.resolve([]),
        ]);
        let nextJobs = shouldFetchJobs ? fetchedJobs : contextJobs ?? [];
        const knownJobIds = new Set(nextJobs.map((nextJob) => nextJob.id));
        const hasAssignedJobOutsideContext = nextLineItems.some(
          (lineItem) => lineItem.assigned_job_id && !knownJobIds.has(lineItem.assigned_job_id)
        );

        if (!inventoryMode && hasAssignedJobOutsideContext) {
          nextJobs = await fetchJobs();
        }

        const assignmentJobs = inventoryMode ? [] : nextJobs.length > 0 ? nextJobs : job ? [job] : [];
        const needsLineItemReset =
          (assignmentJobs.length > 1 || (includeInventoryDestination && assignmentJobs.length > 0)) &&
          nextLineItems.length === 0 &&
          nextReceipt.status === 'accepted';
        const displayReceipt = needsLineItemReset
          ? await requireReceiptLineItems(nextReceipt.id)
          : nextReceipt;
        const initialAssignments = getInitialLineAssignments(
          nextLineItems,
          displayReceipt,
          job?.id ?? null,
          inventoryMode,
          assignmentJobs.length > 1 || (includeInventoryDestination && assignmentJobs.length > 0)
        );
        const shoppingNeedSuggestions =
          !inventoryMode && nextLineItems.length > 0 && assignmentJobs.length > 0
            ? await suggestReceiptLineAssignmentsFromShoppingNeeds(
                nextLineItems,
                assignmentJobs.map((assignmentJob) => assignmentJob.id)
              )
            : [];
        const shoppingNeedSuggestionsByLineId = Object.fromEntries(
          shoppingNeedSuggestions.map((suggestion) => [suggestion.lineItemId, suggestion])
        );
        const suggestedAssignments = applyShoppingNeedAssignmentSuggestions(
          initialAssignments,
          shoppingNeedSuggestions
        );

        if (isMounted) {
          setIsEditingLineAssignments(false);
          setIsReviewingSingleJobLines(false);
          setReceipt(displayReceipt);
          setLineItems(nextLineItems);
          setJobs(assignmentJobs);
          setLineAssignments(suggestedAssignments);
          setLineAssignmentSuggestions(shoppingNeedSuggestionsByLineId);
          setVendor(displayReceipt.vendor ?? '');
          setReceiptDate(displayReceipt.receipt_date ?? '');
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

          hasLoadedReceiptRef.current = true;

          if (
            displayReceipt.storage_path &&
            displayReceipt.storage_path !== loadedImageStoragePathRef.current
          ) {
            setIsImageLoading(true);
            setImageError(null);

            createReceiptImageSignedUrl(displayReceipt.storage_path)
              .then((signedUrl) => {
                if (isMounted) {
                  loadedImageStoragePathRef.current = displayReceipt.storage_path;
                  setImageUrl(signedUrl);
                  Image.getSize(
                    signedUrl,
                    (width, height) => {
                      if (isMounted) {
                        setImageDimensions({ height, width });
                      }
                    },
                    () => {
                      if (isMounted) {
                        setImageDimensions(null);
                      }
                    }
                  );
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
          } else if (!displayReceipt.storage_path) {
            loadedImageStoragePathRef.current = null;
            setImageUrl(null);
            setImageDimensions(null);
            setImageError(null);
            setIsImageLoading(false);
          }
        }
      } catch (error) {
        if (isMounted) {
          setErrorMessage(error instanceof Error ? error.message : 'Unable to load receipt.');
        }
      } finally {
        if (isMounted && !isPollingRefresh) {
          setIsLoading(false);
        }
      }
    };

    loadReceipt();

    return () => {
      isMounted = false;
    };
  }, [
    contextJobs,
    includeInventoryDestination,
    inventoryMode,
    job,
    receiptId,
    receiptPollKey,
  ]);

  useEffect(() => {
    if (!isReceiptStillProcessing) {
      return;
    }

    const pollTimer = setTimeout(() => setReceiptPollKey((key) => key + 1), 2500);

    return () => clearTimeout(pollTimer);
  }, [isReceiptStillProcessing, receiptPollKey]);

  useEffect(() => {
    if (!receipt || !canAutoFinalizeSingleJobReceipt) {
      return;
    }

    if (autoFinalizedReceiptIdsRef.current.has(receipt.id)) {
      return;
    }

    let isMounted = true;
    autoFinalizedReceiptIdsRef.current.add(receipt.id);
    setIsAutoFinalizing(true);
    setErrorMessage(null);

    const finalizeReceipt = async () => {
      try {
        await confirmReceiptLineAssignments(
          receipt.id,
          getReceiptLineAssignmentInputs(lineItems, lineAssignments)
        );

        if (isMounted) {
          onSaved();
        }
      } catch (error) {
        autoFinalizedReceiptIdsRef.current.delete(receipt.id);

        if (isMounted) {
          setErrorMessage(
            error instanceof Error ? error.message : 'Unable to finalize this receipt.'
          );
        }
      } finally {
        if (isMounted) {
          setIsAutoFinalizing(false);
        }
      }
    };

    void finalizeReceipt();

    return () => {
      isMounted = false;
    };
  }, [
    canAutoFinalizeSingleJobReceipt,
    lineAssignments,
    lineItems,
    onSaved,
    receipt,
  ]);

  const handleSave = async () => {
    setErrorMessage(null);

    if (requiresLineItems) {
      setErrorMessage(
        hasUntrustedLineItems
          ? 'This receipt needs a clean line-item scan before it can be split across multiple jobs.'
          : 'This receipt was scanned for multiple jobs, but no line items were returned. It needs line items before it can be saved.'
      );
      return;
    }

    if (hasLineItems && !hasUntrustedLineItems) {
      const assignedDestinations = getAssignedDestinationKeys(lineItems, lineAssignments);

      if (isMultiDestinationReceipt && assignedDestinations.length < 2) {
        setErrorMessage(
          'Assign receipt lines to at least two selected destinations, or edit the receipt destinations before saving.'
        );
        return;
      }

      if (!isMultiDestinationReceipt && assignedDestinations.length === 0) {
        setErrorMessage('Assign at least one receipt line before saving.');
        return;
      }

      if (
        assignedLineItemsExceedReceiptTotal &&
        !hasReceiptAdjustmentDecision &&
        typeof receipt?.total === 'number'
      ) {
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
          getReceiptLineAssignmentInputs(lineItems, lineAssignments),
          {
            allowAssignedTotalAboveReceiptTotal: hasReceiptAdjustmentDecision,
          }
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
        destinationJobId: getWholeReceiptDestinationJobId(
          inventoryMode,
          selectedReceiptJobs,
          receipt
        ),
        jobCostAmount: parsedJobCostAmount,
        ignoreLineItems: hasUntrustedLineItems,
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

  const handleUseAmountPaidForAdjustment = async () => {
    setErrorMessage(null);

    if (!receipt) {
      return;
    }

    if (!receipt.vendor?.trim()) {
      setErrorMessage('Vendor is required.');
      return;
    }

    if (!receipt.receipt_date) {
      setErrorMessage('Receipt date is required.');
      return;
    }

    if (receipt.total === null || receipt.total <= 0) {
      setErrorMessage('Receipt total is required and must be greater than 0.');
      return;
    }

    setIsSaving(true);

    try {
      await updateReceipt(receiptId, {
        category,
        destinationJobId: getWholeReceiptDestinationJobId(
          inventoryMode,
          selectedReceiptJobs,
          receipt
        ),
        ignoreLineItems: true,
        jobCostAmount: receipt.total,
        receiptDate: receipt.receipt_date,
        subtotal: receipt.subtotal,
        tax: receipt.tax,
        total: receipt.total,
        vendor: receipt.vendor.trim(),
      });
      onSaved();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to save receipt.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleUseFullItemPricesForAdjustment = async () => {
    setErrorMessage(null);

    if (!hasReceiptAdjustmentDecision) {
      setErrorMessage('Review this receipt before saving line items.');
      return;
    }

    setIsSaving(true);

    try {
      await confirmReceiptLineAssignments(
        receiptId,
        getReceiptLineAssignmentInputs(lineItems, lineAssignments),
        { allowAssignedTotalAboveReceiptTotal: true }
      );
      onSaved();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to save receipt lines.');
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
    const message =
      'This removes the receipt record, parsed lines, related expenses, and stored image. Use this only for duplicates.';

    if (Platform.OS === 'web') {
      if (window.confirm(`Delete receipt?\n\n${message}`)) {
        void handleDeleteReceipt(targetReceiptId, isCurrentReceipt);
      }

      return;
    }

    Alert.alert(
      'Delete receipt?',
      message,
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

  const openImageViewer = () => {
    setImageZoom(1);
    setIsImageViewerOpen(true);
  };

  const zoomImageIn = () => {
    setImageZoom((current) => Math.min(current + 0.25, 3));
  };

  const zoomImageOut = () => {
    setImageZoom((current) => Math.max(current - 0.25, 0.75));
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
                    shouldUseInlineImageZoom ? (
                      <View style={styles.inlineImageViewer}>
                        <View style={styles.inlineImageControls}>
                          <Pressable onPress={zoomImageOut} style={styles.inlineImageControlButton}>
                            <Text style={styles.inlineImageControlButtonText}>-</Text>
                          </Pressable>
                          <Pressable onPress={() => setImageZoom(1)} style={styles.inlineImageResetButton}>
                            <Text style={styles.inlineImageResetButtonText}>
                              {Math.round(imageZoom * 100)}%
                            </Text>
                          </Pressable>
                          <Pressable onPress={zoomImageIn} style={styles.inlineImageControlButton}>
                            <Text style={styles.inlineImageControlButtonText}>+</Text>
                          </Pressable>
                        </View>
                        <ScrollView
                          contentContainerStyle={styles.inlineImageVerticalContent}
                          maximumZoomScale={3}
                          minimumZoomScale={0.75}
                          style={styles.inlineImageViewport}>
                          <ScrollView
                            contentContainerStyle={styles.inlineImageHorizontalContent}
                            horizontal
                            maximumZoomScale={3}
                            minimumZoomScale={0.75}>
                            <Image
                              resizeMode="contain"
                              source={{ uri: imageUrl }}
                              style={getInlineImageStyle(imageZoom, imageDimensions, viewportWidth)}
                            />
                          </ScrollView>
                        </ScrollView>
                        <Text style={styles.imageHint}>Pinch where supported, or use zoom controls.</Text>
                      </View>
                    ) : (
                      <Pressable
                        accessibilityLabel="Open receipt photo viewer"
                        onPress={openImageViewer}
                        style={styles.receiptImageButton}>
                        <Image
                          resizeMode="contain"
                          source={{ uri: imageUrl }}
                          style={styles.receiptImage}
                        />
                        <Text style={styles.imageHint}>Tap photo to zoom</Text>
                      </Pressable>
                    )
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
                {needsManualReceiptReview ? (
                  <View style={styles.manualReviewPanel}>
                    <Text style={styles.manualReviewTitle}>Needs manual review</Text>
                    <Text style={styles.manualReviewText}>
                      {receipt.error_message ??
                        "We couldn't read the required receipt details from this photo. Add the details you can read from the receipt."}
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
                {isReceiptStillProcessing || isAutoFinalizing ? (
                  <View style={styles.processingPanel}>
                    <ActivityIndicator color="#335C43" />
                    <View style={styles.processingTextColumn}>
                      <Text style={styles.processingTitle}>
                        {isAutoFinalizing ? 'Saving receipt' : 'Reading receipt'}
                      </Text>
                      <Text style={styles.processingText}>
                        {isAutoFinalizing
                          ? 'conTRACKtor is assigning this receipt to the selected job.'
                          : 'conTRACKtor is extracting the receipt details. You can leave this screen; it will continue in the background.'}
                      </Text>
                    </View>
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

                {hasReceiptAdjustmentDecision && receiptAdjustment ? (
                  <View style={styles.adjustmentDecisionPanel}>
                    <Text style={styles.adjustmentDecisionTitle}>
                      This receipt includes a {formatCurrency(receiptAdjustment.adjustmentTotal, {
                        showCents: true,
                      })}{' '}
                      rebate, credit, or discount.
                    </Text>
                    <View style={styles.adjustmentDecisionRows}>
                      <View style={styles.adjustmentDecisionRow}>
                        <Text style={styles.adjustmentDecisionLabel}>Items before adjustment</Text>
                        <Text style={styles.adjustmentDecisionValue}>
                          {formatCurrency(receiptAdjustment.itemsBeforeAdjustment, {
                            showCents: true,
                          })}
                        </Text>
                      </View>
                      <View style={styles.adjustmentDecisionRow}>
                        <Text style={styles.adjustmentDecisionLabel}>Tax</Text>
                        <Text style={styles.adjustmentDecisionValue}>
                          {formatCurrency(receiptAdjustment.tax, { showCents: true })}
                        </Text>
                      </View>
                      <View style={styles.adjustmentDecisionRow}>
                        <Text style={styles.adjustmentDecisionLabel}>Amount paid</Text>
                        <Text style={styles.adjustmentDecisionValue}>
                          {formatCurrency(receiptAdjustment.amountPaid, { showCents: true })}
                        </Text>
                      </View>
                    </View>
                    <Text style={styles.adjustmentDecisionHelp}>
                      Choose how conTRACKtor should save this job cost.
                    </Text>
                    <View style={styles.adjustmentDecisionActions}>
                      <Pressable
                        disabled={isSaving}
                        onPress={handleUseAmountPaidForAdjustment}
                        style={[styles.adjustmentPrimaryButton, isSaving && styles.disabledButton]}>
                        <Text style={styles.adjustmentPrimaryButtonText}>
                          Use amount paid:{' '}
                          {formatCurrency(receiptAdjustment.amountPaid, { showCents: true })}
                        </Text>
                      </Pressable>
                      <Pressable
                        disabled={isSaving}
                        onPress={handleUseFullItemPricesForAdjustment}
                        style={[styles.adjustmentSecondaryButton, isSaving && styles.disabledButton]}>
                        <Text style={styles.adjustmentSecondaryButtonText}>
                          Use full item prices + tax:{' '}
                          {formatCurrency(receiptAdjustment.fullItemCostWithTax, {
                            showCents: true,
                          })}
                        </Text>
                      </Pressable>
                      <Pressable
                        disabled={isSaving}
                        onPress={() => setIsReviewingSingleJobLines(true)}
                        style={styles.adjustmentReviewButton}>
                        <Text style={styles.adjustmentReviewButtonText}>Review receipt</Text>
                      </Pressable>
                    </View>
                  </View>
                ) : null}

                {lineItemsExceedReceiptTotal && !hasReceiptAdjustmentDecision && receipt?.total ? (
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

                {!isReceiptStillProcessing &&
                !isAutoFinalizing &&
                hasLineItems &&
                !hasReceiptAdjustmentDecision &&
                !hasUntrustedLineItems &&
                isSingleJobLineReceipt &&
                !shouldShowLineEditor ? (
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
                        disabled={isSaving || isAutoFinalizing}
                        onPress={handleSave}
                        style={[
                          styles.quickSaveButton,
                          (isSaving || isAutoFinalizing) && styles.disabledButton,
                        ]}>
                        <Text style={styles.quickSaveButtonText}>
                          {isSaving || isAutoFinalizing ? 'Saving...' : 'Save'}
                        </Text>
                      </Pressable>
                      <Pressable
                        disabled={isSaving || isAutoFinalizing}
                        onPress={() => setIsReviewingSingleJobLines(true)}
                        style={styles.quickEditButton}>
                        <Text style={styles.quickEditButtonText}>Edit</Text>
                      </Pressable>
                    </View>
                  </View>
                ) : null}

                {!isReceiptStillProcessing && shouldShowLineEditor ? (
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
                        suggestion={lineAssignmentSuggestions[lineItem.id]}
                        taxAmount={getLineAllocatedTax(lineItem, lineItems, receipt.tax)}
                        readOnly={isSavedReceipt && !isEditingLineAssignments}
                        onChange={(nextAssignment) =>
                          updateLineAssignment(lineItem.id, nextAssignment)
                        }
                      />
                    ))}
                  </View>
                ) : isReceiptStillProcessing || requiresLineItems ? null : (
                  <>
                    {hasUntrustedLineItems ? (
                      <>
                        <View style={styles.manualReviewPanel}>
                          <Text style={styles.manualReviewTitle}>Use receipt total instead</Text>
                          <Text style={styles.manualReviewText}>
                            The parsed lines do not match the receipt total, so conTRACKtor will ignore
                            those parsed lines and save the corrected receipt details below.
                          </Text>
                        </View>
                        <View style={styles.lineItemsPanel}>
                          <Text style={styles.sectionTitle}>Parsed lines, not saved</Text>
                          <Text style={styles.helpText}>
                            These lines are shown as reference only because they add up to more than
                            the receipt total.
                          </Text>
                          {lineItems.map((lineItem) => (
                            <LineItemCard
                              assignment={lineAssignments[lineItem.id]}
                              jobs={jobs}
                              key={lineItem.id}
                              lineItem={lineItem}
                              suggestion={lineAssignmentSuggestions[lineItem.id]}
                              taxAmount={getLineAllocatedTax(lineItem, lineItems, receipt.tax)}
                              readOnly
                              showAssignments={false}
                              onChange={(nextAssignment) =>
                                updateLineAssignment(lineItem.id, nextAssignment)
                              }
                            />
                          ))}
                        </View>
                      </>
                    ) : null}
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

            {isReceiptStillProcessing || isAutoFinalizing ? (
              <Pressable onPress={onBack} style={styles.processingExitButton}>
                <Text style={styles.processingExitButtonText}>Done for now</Text>
              </Pressable>
            ) : isSavedReceipt && !isEditingLineAssignments ? (
              <View style={styles.savedPanel}>
                <Text style={styles.savedTitle}>Receipt saved</Text>
                <Text style={styles.savedText}>
                  {hasMultipleAssignedDestinations
                    ? 'This receipt is already assigned to multiple destinations.'
                    : inventoryMode
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
              </View>
            ) : isSingleJobLineReceipt && !shouldShowLineEditor ? null : (
              <Pressable
                disabled={
                  isSaving ||
                  isAutoFinalizing ||
                  isLoading ||
                  !receipt ||
                  requiresLineItems ||
                  isReceiptStillProcessing ||
                  (hasLineItems && !hasUntrustedLineItems && !canSaveLineAssignments)
                }
                onPress={handleSave}
                style={[
                  styles.saveButton,
                  (isSaving ||
                    isAutoFinalizing ||
                    isLoading ||
                    !receipt ||
                    requiresLineItems ||
                    isReceiptStillProcessing ||
                    (hasLineItems && !hasUntrustedLineItems && !canSaveLineAssignments)) &&
                    styles.disabledButton,
                ]}>
                <Text style={styles.saveButtonText}>
                  {isSaving || isAutoFinalizing
                    ? 'Saving...'
                    : hasLineItems && !hasUntrustedLineItems
                      ? 'Save line assignments'
                      : 'Save receipt'}
                </Text>
              </Pressable>
            )}

            {isEditingLineAssignments ? (
              <Pressable
                disabled={isSaving || isAutoFinalizing}
                onPress={() => setIsEditingLineAssignments(false)}
                style={styles.cancelEditButton}>
                <Text style={styles.cancelEditButtonText}>Cancel edit</Text>
              </Pressable>
            ) : null}
            {isReviewingSingleJobLines ? (
              <Pressable
                disabled={isSaving || isAutoFinalizing}
                onPress={() => setIsReviewingSingleJobLines(false)}
                style={styles.cancelEditButton}>
                <Text style={styles.cancelEditButtonText}>Hide line details</Text>
              </Pressable>
            ) : null}

            {receipt ? (
              <Pressable
                disabled={isDeletingReceiptId === receipt.id || isAutoFinalizing}
                onPress={() => confirmDeleteReceipt(receipt.id, true)}
                style={[
                  styles.deleteCurrentButton,
                  (isDeletingReceiptId === receipt.id || isAutoFinalizing) && styles.disabledButton,
                ]}>
                <Text style={styles.deleteCurrentButtonText}>
                  {isDeletingReceiptId === receipt.id ? 'Deleting receipt...' : 'Delete receipt'}
                </Text>
              </Pressable>
            ) : null}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
      <Modal
        animationType="slide"
        onRequestClose={() => setIsImageViewerOpen(false)}
        visible={!shouldUseInlineImageZoom && isImageViewerOpen}>
        <SafeAreaView style={styles.viewerSafeArea}>
          <View style={styles.viewerHeader}>
            <Text style={styles.viewerTitle}>Receipt photo</Text>
            <Pressable onPress={() => setIsImageViewerOpen(false)} style={styles.viewerCloseButton}>
              <Text style={styles.viewerCloseButtonText}>Close</Text>
            </Pressable>
          </View>

          <View style={styles.viewerControls}>
            <Pressable onPress={zoomImageOut} style={styles.viewerControlButton}>
              <Text style={styles.viewerControlButtonText}>-</Text>
            </Pressable>
            <Pressable onPress={() => setImageZoom(1)} style={styles.viewerResetButton}>
              <Text style={styles.viewerResetButtonText}>{Math.round(imageZoom * 100)}%</Text>
            </Pressable>
            <Pressable onPress={zoomImageIn} style={styles.viewerControlButton}>
              <Text style={styles.viewerControlButtonText}>+</Text>
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.viewerVerticalContent}>
            <ScrollView contentContainerStyle={styles.viewerHorizontalContent} horizontal>
              {imageUrl ? (
                <Image
                  resizeMode="contain"
                  source={{ uri: imageUrl }}
                  style={getViewerImageStyle(imageZoom, imageDimensions)}
                />
              ) : null}
            </ScrollView>
          </ScrollView>
        </SafeAreaView>
      </Modal>
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

function getViewerImageStyle(
  zoom: number,
  dimensions: { height: number; width: number } | null
) {
  const baseWidth = Platform.OS === 'web' ? 900 : 420;
  const aspectRatio =
    dimensions && dimensions.width > 0 ? dimensions.height / dimensions.width : 1.4;
  const width = baseWidth * zoom;

  return {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    height: width * aspectRatio,
    width,
  };
}

function getInlineImageStyle(
  zoom: number,
  dimensions: { height: number; width: number } | null,
  viewportWidth: number
) {
  const baseWidth = Math.max(260, Math.min(viewportWidth - 56, 430));
  const aspectRatio =
    dimensions && dimensions.width > 0 ? dimensions.height / dimensions.width : 1.4;
  const width = baseWidth * zoom;

  return {
    backgroundColor: '#F6F5F2',
    borderRadius: 8,
    height: width * aspectRatio,
    width,
  };
}

function LineItemCard({
  assignment,
  jobs,
  lineItem,
  onChange,
  readOnly = false,
  showAssignments = true,
  suggestion,
  taxAmount = 0,
}: {
  assignment: LineAssignmentState | undefined;
  jobs: Job[];
  lineItem: Tables<'receipt_line_items'>;
  onChange: (assignment: LineAssignmentState) => void;
  readOnly?: boolean;
  showAssignments?: boolean;
  suggestion?: ShoppingNeedLineAssignmentSuggestion;
  taxAmount?: number;
}) {
  const currentAssignment = assignment ?? {
    assignedJobId: lineItem.assigned_job_id,
    assignmentType: lineItem.assignment_type as ReceiptLineAssignmentType,
  };
  const canAssignToJob = jobs.length > 0;
  const originalText = getLineItemOriginalText(lineItem);
  const hasActiveSuggestion =
    showAssignments &&
    currentAssignment.assignmentType === 'job' &&
    Boolean(suggestion?.assignedJobId) &&
    currentAssignment.assignedJobId === suggestion?.assignedJobId;

  return (
    <View style={styles.lineItemCard}>
      <View style={styles.lineItemHeader}>
        <View style={styles.lineItemTextColumn}>
          <Text style={styles.lineItemName}>{lineItem.cleaned_name}</Text>
          {originalText ? (
            <Text style={styles.lineItemOriginal}>{originalText}</Text>
          ) : null}
        </View>
        <View style={styles.lineItemAmountColumn}>
          <Text style={styles.lineItemAmount}>
            {formatLineItemAmount(lineItem)}
          </Text>
          {taxAmount > 0 ? (
            <Text style={styles.lineItemTaxAmount}>
              Tax {formatCurrency(taxAmount, { showCents: true })}
            </Text>
          ) : null}
        </View>
      </View>
      <Text style={styles.lineItemMeta}>
        {formatCategory(lineItem.line_type)}
        {lineItem.quantity !== null ? ` · Qty ${lineItem.quantity}` : ''}
        {lineItem.unit_price !== null
          ? ` · ${formatCurrency(lineItem.unit_price, { showCents: true })} each`
          : ''}
      </Text>
      {hasActiveSuggestion ? (
        <View style={styles.suggestionPill}>
          <Text style={styles.suggestionPillText}>
            Suggested from shopping list: {suggestion?.shoppingNeedDescription}
          </Text>
        </View>
      ) : null}

      {showAssignments ? (
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
      ) : null}

      {showAssignments && currentAssignment.assignmentType === 'job' ? (
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
                suggestion?.assignedJobId === jobOption.id && styles.suggestedJobChoiceButton,
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

function getLineItemOriginalText(lineItem: Tables<'receipt_line_items'>): string | null {
  if (!lineItem.original_text || lineItem.original_text === lineItem.cleaned_name) {
    return null;
  }

  const amountPattern = formatLineAmountPattern(lineItem.line_total);
  const trailingAmountPattern = formatTrailingLineAmountPattern(lineItem.line_total);
  const lines = lineItem.original_text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !amountPattern.test(line));
  const displayText = lines
    .join('\n')
    .replace(trailingAmountPattern, '')
    .trim();

  return displayText && displayText !== lineItem.cleaned_name ? displayText : null;
}

function formatLineItemAmount(lineItem: Tables<'receipt_line_items'>): string {
  const amount = formatCurrency(lineItem.line_total, { showCents: true });

  return lineItem.line_type === 'discount' ? `-${amount}` : amount;
}

function formatLineAmountPattern(amount: number): RegExp {
  const fixedAmount = amount.toFixed(2).replace('.', '\\.');
  const wholeAmount = Number.isInteger(amount) ? String(amount) : null;
  const amountAlternatives = wholeAmount ? `${fixedAmount}|${wholeAmount}` : fixedAmount;

  return new RegExp(`^\\$?(?:${amountAlternatives})$`);
}

function formatTrailingLineAmountPattern(amount: number): RegExp {
  const fixedAmount = amount.toFixed(2).replace('.', '\\.');
  const wholeAmount = Number.isInteger(amount) ? String(amount) : null;
  const amountAlternatives = wholeAmount ? `${fixedAmount}|${wholeAmount}` : fixedAmount;

  return new RegExp(`(?:\\s|\\n)+\\$?(?:${amountAlternatives})$`);
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
  inventoryMode = false,
  requiresExplicitAssignment = false
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

      if (requiresExplicitAssignment && lineItem.review_status === 'needs_review') {
        return [
          lineItem.id,
          {
            assignedJobId: null,
            assignmentType: 'job' as const,
          },
        ];
      }

      const assignmentType = receipt.review_status === 'needs_destination' && fallbackJobId
        ? 'job'
        : inventoryMode
        ? 'tools_inventory'
        : isReceiptLineAssignmentType(lineItem.assignment_type)
        ? lineItem.assignment_type
        : 'job';
      const assignedJobId =
        assignmentType === 'job'
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

function getReceiptLineAssignmentInputs(
  lineItems: Tables<'receipt_line_items'>[],
  lineAssignments: Record<string, LineAssignmentState>
) {
  return lineItems.map((lineItem) => ({
    assignedJobId: lineAssignments[lineItem.id]?.assignedJobId ?? null,
    assignmentType: lineAssignments[lineItem.id]?.assignmentType ?? 'ignore',
    lineItemId: lineItem.id,
  }));
}

function applyShoppingNeedAssignmentSuggestions(
  assignments: Record<string, LineAssignmentState>,
  suggestions: ShoppingNeedLineAssignmentSuggestion[]
): Record<string, LineAssignmentState> {
  if (suggestions.length === 0) {
    return assignments;
  }

  const nextAssignments = { ...assignments };

  for (const suggestion of suggestions) {
    const currentAssignment = nextAssignments[suggestion.lineItemId];

    if (currentAssignment?.assignmentType === 'ignore') {
      continue;
    }

    nextAssignments[suggestion.lineItemId] = {
      assignedJobId: suggestion.assignedJobId,
      assignmentType: 'job',
    };
  }

  return nextAssignments;
}

function isReceiptLineAssignmentType(value: string): value is ReceiptLineAssignmentType {
  return value === 'job' || value === 'tools_inventory' || value === 'ignore';
}

function isReceiptProcessingStatus(value: string | null | undefined): boolean {
  return value === 'uploading' || value === 'queued' || value === 'processing';
}

function getReceiptAdjustmentDecision(
  lineItems: Tables<'receipt_line_items'>[],
  receipt: Tables<'receipts'>
): {
  adjustmentTotal: number;
  amountPaid: number;
  fullItemCostWithTax: number;
  itemsBeforeAdjustment: number;
  tax: number;
} | null {
  if (receipt.total === null || lineItems.length === 0) {
    return null;
  }

  const itemsBeforeAdjustment = roundMoney(
    lineItems
      .filter((lineItem) => lineItem.line_type === 'item')
      .reduce((sum, lineItem) => sum + lineItem.line_total, 0)
  );
  const adjustmentTotal = roundMoney(
    lineItems
      .filter((lineItem) => lineItem.line_type === 'discount')
      .reduce((sum, lineItem) => sum + lineItem.line_total, 0)
  );
  const tax = roundMoney(receipt.tax ?? 0);

  if (itemsBeforeAdjustment <= 0 || adjustmentTotal <= 0) {
    return null;
  }

  const adjustedTotal = roundMoney(itemsBeforeAdjustment - adjustmentTotal + tax);

  if (Math.abs(adjustedTotal - receipt.total) > 0.05) {
    return null;
  }

  return {
    adjustmentTotal,
    amountPaid: receipt.total,
    fullItemCostWithTax: roundMoney(itemsBeforeAdjustment + tax),
    itemsBeforeAdjustment,
    tax,
  };
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

function getLineAllocatedTax(
  lineItem: Tables<'receipt_line_items'>,
  lineItems: Tables<'receipt_line_items'>[],
  receiptTax: number | null
): number {
  const taxableSubtotal = lineItems
    .filter((nextLineItem) => nextLineItem.line_type === 'item')
    .reduce((sum, nextLineItem) => sum + nextLineItem.line_total, 0);

  if (!receiptTax || taxableSubtotal <= 0 || lineItem.line_type !== 'item') {
    return 0;
  }

  return roundMoney(receiptTax * (lineItem.line_total / taxableSubtotal));
}

function getAssignedLineItemsTotal(
  lineItems: Tables<'receipt_line_items'>[],
  assignments: Record<string, LineAssignmentState>,
  receiptTax: number | null
): number {
  return lineItems.reduce((sum, lineItem) => {
    const assignment = assignments[lineItem.id];

    if (assignment?.assignmentType === 'ignore' || isNonPurchaseLineItem(lineItem)) {
      return sum;
    }

    return sum + lineItem.line_total + getLineAllocatedTax(lineItem, lineItems, receiptTax);
  }, 0);
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function isNonPurchaseLineItem(lineItem: Tables<'receipt_line_items'>): boolean {
  return (
    lineItem.line_type === 'tax' ||
    lineItem.line_type === 'fee' ||
    lineItem.line_type === 'discount'
  );
}

function getAssignedDestinationKeys(
  lineItems: Tables<'receipt_line_items'>[],
  assignments: Record<string, LineAssignmentState>
): string[] {
  return Array.from(
    new Set(
      lineItems
        .map((lineItem) => {
          if (isNonPurchaseLineItem(lineItem)) {
            return null;
          }

          const assignment = assignments[lineItem.id];

          if (!assignment || assignment.assignmentType === 'ignore') {
            return null;
          }

          if (assignment.assignmentType === 'tools_inventory') {
            return 'tools_inventory';
          }

          return assignment.assignedJobId ? `job:${assignment.assignedJobId}` : null;
        })
        .filter((destination): destination is string => Boolean(destination))
    )
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

function getWholeReceiptDestinationJobId(
  inventoryMode: boolean,
  selectedReceiptJobs: Job[],
  receipt: Tables<'receipts'> | null
): string | null {
  if (inventoryMode) {
    return null;
  }

  return selectedReceiptJobs[0]?.id ?? receipt?.scan_context_job_id ?? null;
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
  receiptImageButton: {
    gap: 8,
  },
  receiptImage: {
    alignSelf: 'stretch',
    backgroundColor: '#F6F5F2',
    borderColor: '#E2E0DA',
    borderRadius: 8,
    borderWidth: 1,
    height: Platform.select({ default: 360, web: 520 }),
  },
  inlineImageViewer: {
    gap: 8,
  },
  inlineImageControls: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
  },
  inlineImageControlButton: {
    alignItems: 'center',
    backgroundColor: '#335C43',
    borderRadius: 8,
    justifyContent: 'center',
    minHeight: 40,
    minWidth: 50,
  },
  inlineImageControlButtonText: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '900',
    lineHeight: 26,
  },
  inlineImageResetButton: {
    alignItems: 'center',
    borderColor: '#BCD7C4',
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 40,
    minWidth: 78,
  },
  inlineImageResetButtonText: {
    color: '#335C43',
    fontSize: 15,
    fontWeight: '900',
  },
  inlineImageViewport: {
    alignSelf: 'stretch',
    backgroundColor: '#F6F5F2',
    borderColor: '#E2E0DA',
    borderRadius: 8,
    borderWidth: 1,
    height: 380,
  },
  inlineImageVerticalContent: {
    alignItems: 'center',
    flexGrow: 1,
    justifyContent: 'center',
    padding: 8,
  },
  inlineImageHorizontalContent: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  imageHint: {
    color: '#335C43',
    fontSize: 14,
    fontWeight: '800',
    textAlign: 'center',
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
  viewerSafeArea: {
    backgroundColor: '#111827',
    flex: 1,
  },
  viewerHeader: {
    alignItems: 'center',
    borderBottomColor: 'rgba(255,255,255,0.16)',
    borderBottomWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 58,
    paddingHorizontal: 16,
  },
  viewerTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '900',
  },
  viewerCloseButton: {
    alignItems: 'center',
    borderColor: 'rgba(255,255,255,0.28)',
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 40,
    paddingHorizontal: 14,
  },
  viewerCloseButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '900',
  },
  viewerControls: {
    alignItems: 'center',
    borderBottomColor: 'rgba(255,255,255,0.12)',
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'center',
    padding: 12,
  },
  viewerControlButton: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    justifyContent: 'center',
    minHeight: 42,
    minWidth: 52,
  },
  viewerControlButtonText: {
    color: '#111827',
    fontSize: 24,
    fontWeight: '900',
    lineHeight: 28,
  },
  viewerResetButton: {
    alignItems: 'center',
    borderColor: 'rgba(255,255,255,0.28)',
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 42,
    minWidth: 82,
  },
  viewerResetButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '900',
  },
  viewerVerticalContent: {
    alignItems: 'center',
    flexGrow: 1,
    padding: 16,
  },
  viewerHorizontalContent: {
    justifyContent: 'center',
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
  adjustmentDecisionPanel: {
    backgroundColor: '#F8FAF8',
    borderColor: '#BCD7C4',
    borderRadius: 8,
    borderWidth: 1,
    gap: 12,
    padding: 12,
  },
  adjustmentDecisionTitle: {
    color: '#1F2933',
    fontSize: 17,
    fontWeight: '900',
    lineHeight: 23,
  },
  adjustmentDecisionRows: {
    borderColor: '#DDE7DE',
    borderRadius: 8,
    borderWidth: 1,
  },
  adjustmentDecisionRow: {
    alignItems: 'center',
    borderBottomColor: '#DDE7DE',
    borderBottomWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 38,
    paddingHorizontal: 10,
  },
  adjustmentDecisionLabel: {
    color: '#64748B',
    fontSize: 13,
    fontWeight: '800',
  },
  adjustmentDecisionValue: {
    color: '#1F2933',
    fontSize: 13,
    fontWeight: '900',
  },
  adjustmentDecisionHelp: {
    color: '#64748B',
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18,
  },
  adjustmentDecisionActions: {
    gap: 8,
  },
  adjustmentPrimaryButton: {
    alignItems: 'center',
    backgroundColor: '#335C43',
    borderRadius: 8,
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: 12,
  },
  adjustmentPrimaryButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '900',
    textAlign: 'center',
  },
  adjustmentSecondaryButton: {
    alignItems: 'center',
    borderColor: '#335C43',
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: 12,
  },
  adjustmentSecondaryButtonText: {
    color: '#335C43',
    fontSize: 15,
    fontWeight: '900',
    textAlign: 'center',
  },
  adjustmentReviewButton: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  adjustmentReviewButtonText: {
    color: '#335C43',
    fontSize: 15,
    fontWeight: '900',
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
  processingPanel: {
    alignItems: 'center',
    backgroundColor: '#F8FAF8',
    borderColor: '#BCD7C4',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    padding: 12,
  },
  processingTextColumn: {
    flex: 1,
    gap: 3,
  },
  processingTitle: {
    color: '#1F2933',
    fontSize: 16,
    fontWeight: '900',
  },
  processingText: {
    color: '#64748B',
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18,
  },
  processingExitButton: {
    alignItems: 'center',
    borderColor: '#335C43',
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 52,
  },
  processingExitButtonText: {
    color: '#335C43',
    fontSize: 16,
    fontWeight: '900',
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
  lineItemAmountColumn: {
    alignItems: 'flex-end',
    gap: 2,
  },
  lineItemAmount: {
    color: '#1F2933',
    fontSize: 15,
    fontWeight: '900',
  },
  lineItemTaxAmount: {
    color: '#64748B',
    fontSize: 11,
    fontWeight: '800',
  },
  lineItemMeta: {
    color: '#64748B',
    fontSize: 12,
    fontWeight: '700',
  },
  suggestionPill: {
    alignSelf: 'flex-start',
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  suggestionPillText: {
    color: '#276749',
    fontSize: 12,
    fontWeight: '900',
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
    backgroundColor: '#F0FDF4',
    borderColor: '#335C43',
    borderWidth: 2,
  },
  suggestedJobChoiceButton: {
    borderColor: '#2F855A',
  },
  jobChoiceButtonText: {
    color: '#475569',
    fontSize: 12,
    fontWeight: '800',
  },
  selectedJobChoiceButtonText: {
    color: '#335C43',
    fontWeight: '900',
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
  manualReviewPanel: {
    backgroundColor: '#FFF7ED',
    borderColor: '#FDBA74',
    borderRadius: 8,
    borderWidth: 1,
    gap: 6,
    padding: 12,
  },
  manualReviewTitle: {
    color: '#9A3412',
    fontSize: 16,
    fontWeight: '900',
  },
  manualReviewText: {
    color: '#7C2D12',
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
