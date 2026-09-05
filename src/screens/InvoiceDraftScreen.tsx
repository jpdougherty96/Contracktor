import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  fetchJobFinancialSnapshot,
  fetchJobLaborCostEntries,
  fetchJobMaterialCostEntries,
  type JobFinancialSnapshotRow,
  type JobLaborCostEntry,
  type JobMaterialCostEntry,
} from '@/src/lib/jobFinancials';
import {
  buildFixedBidInvoiceLines,
  buildInvoiceDocumentHtml,
  buildInvoiceDocumentText,
  buildTimeAndMaterialsInvoiceLines,
  formatCurrency,
  formatInvoiceDate,
  getInvoiceDueDate,
  type InvoiceDraftPresentationLine,
} from '@/src/lib/invoiceDocument';
import {
  createInvoiceDraft,
  fetchAvailableInvoicePaymentCredit,
  fetchJobInvoiceDraft,
  saveInvoiceDraft,
  type InvoiceBundle,
  type InvoiceDraftLineInput,
} from '@/src/lib/invoices';
import { getLocalDateString } from '@/src/lib/localDate';
import { createAndSharePdf } from '@/src/lib/pdfExport';
import { fetchAccountProfile, type AccountProfile } from '@/src/lib/profiles';
import { getUserFacingError } from '@/src/lib/userFacingError';
import { buttonStyles, colors, radii } from '@/src/styles/theme';
import type { Job } from '@/src/types/job';

type InvoiceDraftScreenProps = {
  job: Job;
  onBack: () => void;
  onEditBusinessProfile: () => void;
};

type InvoiceLine = InvoiceDraftPresentationLine;

const defaultNote = 'Thank you for your business.';
const materialMarkupPresets = [0, 10, 15, 20];

export function InvoiceDraftScreen({ job, onBack, onEditBusinessProfile }: InvoiceDraftScreenProps) {
  const [snapshot, setSnapshot] = useState<JobFinancialSnapshotRow | null>(null);
  const [laborEntries, setLaborEntries] = useState<JobLaborCostEntry[]>([]);
  const [materialEntries, setMaterialEntries] = useState<JobMaterialCostEntry[]>([]);
  const [profile, setProfile] = useState<AccountProfile | null>(null);
  const [invoiceDraft, setInvoiceDraft] = useState<InvoiceBundle | null>(null);
  const [availablePaymentCredit, setAvailablePaymentCredit] = useState(0);
  const [savedDraftFingerprint, setSavedDraftFingerprint] = useState<string | null>(null);
  const [materialMarkupPercent, setMaterialMarkupPercent] = useState('0');
  const [note, setNote] = useState(defaultNote);
  const [message, setMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const parsedMaterialMarkupPercent = parseMarkupPercent(materialMarkupPercent);
  const materialMarkupError =
    parsedMaterialMarkupPercent === undefined ? 'Enter a valid materials markup percent.' : null;
  const isTimeAndMaterialsJob = job.jobType === 'time_and_materials';
  const missingInvoiceFields = getMissingInvoiceProfileFields(profile);
  const invoiceIssueDate = invoiceDraft?.invoice.issue_date ?? getLocalDateString();
  const invoiceTerms = invoiceDraft?.invoice.terms ?? profile?.defaultInvoiceTerms ?? null;
  const invoiceDueDate = getInvoiceDueDate(
    invoiceIssueDate,
    invoiceDraft?.invoice.due_date ?? null,
    invoiceTerms
  );

  useEffect(() => {
    let isMounted = true;

    const loadInvoiceData = async () => {
      setIsLoading(true);
      setErrorMessage(null);

      try {
        const [
          nextSnapshot,
          nextLaborEntries,
          nextMaterialEntries,
          nextProfile,
          nextDraft,
          nextPaymentCredit,
        ] =
          await Promise.all([
            fetchJobFinancialSnapshot(job.id),
            fetchJobLaborCostEntries(job.id),
            fetchJobMaterialCostEntries(job.id),
            fetchAccountProfile(),
            fetchJobInvoiceDraft(job.id),
            fetchAvailableInvoicePaymentCredit(job.id),
          ]);

        if (isMounted) {
          setSnapshot(nextSnapshot);
          setLaborEntries(nextLaborEntries);
          setMaterialEntries(nextMaterialEntries);
          setProfile(nextProfile);
          setInvoiceDraft(nextDraft);
          setAvailablePaymentCredit(nextPaymentCredit);
          setSavedDraftFingerprint(nextDraft ? getBundleDraftFingerprint(nextDraft) : null);
          setMaterialMarkupPercent(
            nextDraft ? String(nextDraft.invoice.material_markup_percent) : '0'
          );
          setNote(nextDraft?.invoice.note ?? nextProfile.defaultInvoiceNote ?? defaultNote);
        }
      } catch (error) {
        if (isMounted) {
          setErrorMessage(getUserFacingError(error, 'Unable to build invoice. Try again.'));
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    loadInvoiceData();

    return () => {
      isMounted = false;
    };
  }, [job.id]);

  const invoice = useMemo(
    () =>
      buildInvoiceDraft(
        job,
        snapshot,
        laborEntries,
        materialEntries,
        parsedMaterialMarkupPercent ?? 0,
        note,
        profile,
        availablePaymentCredit,
        invoiceDraft?.invoice.invoice_number ?? 'Draft',
        invoiceIssueDate,
        invoiceDueDate,
        invoiceTerms
      ),
    [
      availablePaymentCredit,
      invoiceDraft?.invoice.invoice_number,
      invoiceDueDate,
      invoiceIssueDate,
      invoiceTerms,
      job,
      laborEntries,
      materialEntries,
      note,
      parsedMaterialMarkupPercent,
      profile,
      snapshot,
    ]
  );
  const currentDraftFingerprint = useMemo(
    () =>
      getDraftFingerprint(
        toLedgerDraftLines(invoice.lines),
        parsedMaterialMarkupPercent ?? 0,
        note,
        invoice.issueDate,
        invoice.dueDate,
        invoice.terms
      ),
    [invoice.dueDate, invoice.issueDate, invoice.lines, invoice.terms, note, parsedMaterialMarkupPercent]
  );
  const hasUnsavedInvoiceChanges =
    invoiceDraft !== null && savedDraftFingerprint !== currentDraftFingerprint;
  const canSaveInvoiceDraft =
    !isLoading &&
    !isSavingDraft &&
    missingInvoiceFields.length === 0 &&
    !materialMarkupError &&
    invoice.lines.length > 0 &&
    (invoiceDraft === null || hasUnsavedInvoiceChanges);
  const canExportInvoice =
    !isLoading &&
    !isSavingDraft &&
    invoiceDraft !== null &&
    !hasUnsavedInvoiceChanges &&
    missingInvoiceFields.length === 0 &&
    !materialMarkupError &&
    invoice.lines.length > 0;

  const handleSaveDraft = async () => {
    setMessage(null);

    if (!canSaveInvoiceDraft) {
      if (missingInvoiceFields.length > 0) {
        setMessage('Complete your business profile before saving this draft.');
      } else if (invoice.lines.length === 0) {
        setMessage('There is no unbilled work to add to this invoice.');
      }
      return;
    }

    setIsSavingDraft(true);

    try {
      const draft =
        invoiceDraft ??
        (await createInvoiceDraft({
          dueDate: invoiceDueDate,
          issueDate: invoiceIssueDate,
          jobId: job.id,
          paymentRequestType: isTimeAndMaterialsJob ? 'standard' : 'progress',
        }));
      const savedDraft = await saveInvoiceDraft({
        billingPeriodEnd: draft.invoice.billing_period_end,
        billingPeriodStart: draft.invoice.billing_period_start,
        dueDate: getInvoiceDueDate(
          draft.invoice.issue_date,
          draft.invoice.due_date,
          draft.invoice.terms ?? invoiceTerms
        ),
        expectedVersion: draft.invoice.version,
        invoiceId: draft.invoice.id,
        issueDate: draft.invoice.issue_date,
        lines: toLedgerDraftLines(invoice.lines),
        materialMarkupPercent: parsedMaterialMarkupPercent ?? 0,
        note,
        retainageAmount: draft.invoice.retainage_amount,
        terms: draft.invoice.terms ?? invoiceTerms,
      });

      let nextPaymentCredit = Math.max(availablePaymentCredit, savedDraft.invoice.amount_paid);

      try {
        nextPaymentCredit = await fetchAvailableInvoicePaymentCredit(job.id);
      } catch {
        // The saved ledger amount is still safe to display if the availability refresh fails.
      }

      setInvoiceDraft(savedDraft);
      setAvailablePaymentCredit(nextPaymentCredit);
      setSavedDraftFingerprint(getBundleDraftFingerprint(savedDraft));
      setMaterialMarkupPercent(String(savedDraft.invoice.material_markup_percent));
      setNote(savedDraft.invoice.note ?? '');
      setMessage(`${savedDraft.invoice.invoice_number} saved as a draft.`);
    } catch (error) {
      setMessage(getUserFacingError(error, 'Unable to save this invoice draft. Try again.'));
    } finally {
      setIsSavingDraft(false);
    }
  };

  const handleSavePdf = async () => {
    setMessage(null);

    if (materialMarkupError) {
      setMessage(materialMarkupError);
      return;
    }

    if (missingInvoiceFields.length > 0) {
      setMessage('Complete your business profile before saving this invoice.');
      return;
    }

    try {
      const fileBaseName = `${job.name} Invoice`;
      const html = invoice.html;

      if (Platform.OS === 'web') {
        setMessage('Use Print and choose Save as PDF in your browser.');
        return;
      }

      const result = await createAndSharePdf({
        dialogTitle: 'Save invoice PDF',
        fileBaseName,
        html,
      });
      setMessage(result.didOpen ? 'Invoice PDF opened.' : 'Invoice PDF saved.');
    } catch {
      setMessage('Unable to save invoice PDF.');
    }
  };

  const handlePrint = async () => {
    setMessage(null);

    if (materialMarkupError) {
      setMessage(materialMarkupError);
      return;
    }

    if (missingInvoiceFields.length > 0) {
      setMessage('Complete your business profile before printing this invoice.');
      return;
    }

    try {
      const fileBaseName = `${job.name} Invoice`;
      const html = invoice.html;

      if (Platform.OS === 'web') {
        printHtmlFromIframe(html);
        return;
      }

      const result = await createAndSharePdf({
        dialogTitle: 'Share invoice PDF',
        fileBaseName,
        html,
      });
      setMessage(result.didOpen ? 'Invoice PDF opened for sharing.' : 'Invoice PDF saved.');
    } catch {
      setMessage('Unable to create invoice PDF.');
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.screenActions}>
          <Pressable style={styles.backButton} onPress={onBack}>
            <Text style={styles.backButtonText}>Back to job</Text>
          </Pressable>
          <View style={styles.exportActions}>
            <Pressable
              disabled={!canExportInvoice}
              style={[styles.secondaryButton, !canExportInvoice && styles.disabledButton]}
              onPress={handleSavePdf}>
              <Text style={styles.secondaryButtonText}>Save PDF</Text>
            </Pressable>
            <Pressable
              disabled={!canExportInvoice}
              style={[styles.primaryButton, !canExportInvoice && styles.disabledButton]}
              onPress={handlePrint}>
              <Text style={styles.primaryButtonText}>
                {Platform.OS === 'web' ? 'Print' : 'Share PDF'}
              </Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.header}>
          <Text style={styles.title}>Invoice preview</Text>
          <Text style={styles.subtitle}>Save the current draft before printing or exporting.</Text>
        </View>

        {isLoading ? <Text style={styles.messageText}>Building invoice...</Text> : null}
        {!isLoading && errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}
        {message ? <Text style={styles.messageText}>{message}</Text> : null}
        {!isLoading && missingInvoiceFields.length > 0 ? (
          <View style={styles.profileWarningPanel}>
            <Text style={styles.profileWarningTitle}>Business profile required</Text>
            <Text style={styles.profileWarningText}>
              Complete your business profile before saving or printing this invoice.
            </Text>
            <Text style={styles.profileWarningText}>
              Missing: {missingInvoiceFields.join(', ')}
            </Text>
            <Pressable style={styles.warningButton} onPress={onEditBusinessProfile}>
              <Text style={styles.warningButtonText}>Complete business profile</Text>
            </Pressable>
          </View>
        ) : null}

        <View style={styles.settingsPanel}>
          <View style={styles.draftHeader}>
            <View style={styles.draftHeaderText}>
              <Text style={styles.settingsTitle}>Invoice options</Text>
              <Text style={styles.draftStatusText}>
                {invoiceDraft ? invoiceDraft.invoice.invoice_number : 'Not saved yet'}
              </Text>
            </View>
            <View style={styles.draftBadge}>
              <Text style={styles.draftBadgeText}>{invoiceDraft ? 'Draft' : 'Unsaved'}</Text>
            </View>
          </View>
          {isTimeAndMaterialsJob ? (
            <View style={styles.markupPanel}>
              <View style={styles.markupHeader}>
                <View style={styles.markupText}>
                  <Text style={styles.sectionLabel}>Materials markup</Text>
                  <Text style={styles.markupHelp}>Applies to this invoice only.</Text>
                </View>
                <View style={styles.markupInputRow}>
                  <TextInput
                    inputMode="decimal"
                    keyboardType="decimal-pad"
                    onChangeText={setMaterialMarkupPercent}
                    placeholder="0"
                    placeholderTextColor="#8A94A6"
                    style={styles.markupInput}
                    value={materialMarkupPercent}
                  />
                  <Text style={styles.markupPercentText}>%</Text>
                </View>
              </View>
              <View style={styles.markupPresetRow}>
                {materialMarkupPresets.map((preset) => (
                  <Pressable
                    key={preset}
                    onPress={() => setMaterialMarkupPercent(String(preset))}
                    style={[
                      styles.markupPresetButton,
                      parsedMaterialMarkupPercent === preset && styles.selectedMarkupPresetButton,
                    ]}>
                    <Text
                      style={[
                        styles.markupPresetButtonText,
                        parsedMaterialMarkupPercent === preset &&
                          styles.selectedMarkupPresetButtonText,
                      ]}>
                      {preset}%
                    </Text>
                  </Pressable>
                ))}
              </View>
              {materialMarkupError ? (
                <Text style={styles.markupErrorText}>{materialMarkupError}</Text>
              ) : null}
            </View>
          ) : null}

          <View style={styles.noteEditor}>
            <Text style={styles.sectionLabel}>Customer note</Text>
            <TextInput
              multiline
              onChangeText={setNote}
              placeholder="Add a note for the customer"
              placeholderTextColor="#8A94A6"
              style={styles.noteInput}
              textAlignVertical="top"
              value={note}
            />
          </View>

          <Pressable
            disabled={!canSaveInvoiceDraft}
            onPress={handleSaveDraft}
            style={[styles.saveDraftButton, !canSaveInvoiceDraft && styles.disabledButton]}>
            {isSavingDraft ? (
              <View style={styles.saveDraftContent}>
                <ActivityIndicator color={colors.warmWhite} size="small" />
                <Text style={styles.saveDraftButtonText}>Saving draft...</Text>
              </View>
            ) : (
              <Text style={styles.saveDraftButtonText}>
                {invoiceDraft
                  ? hasUnsavedInvoiceChanges
                    ? 'Update draft'
                    : 'Draft saved'
                  : 'Save draft'}
              </Text>
            )}
          </Pressable>
          {!invoiceDraft ? (
            <Text style={styles.exportHint}>Save the draft to assign an invoice number.</Text>
          ) : hasUnsavedInvoiceChanges ? (
            <Text style={styles.exportHint}>Save your changes before exporting.</Text>
          ) : null}
        </View>

        <View style={styles.previewWrap}>
          <View style={styles.invoice}>
          <View style={styles.invoiceHeader}>
            <View>
              <Text style={styles.invoiceTitle}>Invoice</Text>
              <Text style={styles.invoiceNumber}>{invoice.invoiceNumber}</Text>
              <Text style={styles.invoiceMeta}>{formatInvoiceDate(invoice.issueDate)}</Text>
              {invoice.dueDate ? (
                <Text style={styles.invoiceDueDate}>
                  Due {formatInvoiceDate(invoice.dueDate)}
                </Text>
              ) : null}
            </View>
            <Text style={styles.invoiceType}>
              {job.jobType === 'time_and_materials' ? 'Time & materials' : 'Fixed bid'}
            </Text>
          </View>

          <View style={styles.fromBlock}>
            <Text style={styles.sectionLabel}>From</Text>
            {formatInvoiceProfileLines(profile).map((line) => (
              <Text key={line} style={styles.invoiceText}>{line}</Text>
            ))}
          </View>

          <View style={styles.billTo}>
            <Text style={styles.sectionLabel}>Bill to</Text>
            <Text style={styles.invoiceText}>{job.clientName}</Text>
            <Text style={styles.invoiceText}>{job.name}</Text>
            {job.location ? <Text style={styles.invoiceText}>{job.location}</Text> : null}
          </View>

          <View style={styles.lines}>
            {invoice.lines.map((line) => (
              <View key={`${line.label}-${line.meta ?? ''}`} style={styles.lineItem}>
                <View style={styles.lineText}>
                  <Text style={styles.lineLabel}>{line.label}</Text>
                  {line.meta ? <Text style={styles.lineMeta}>{line.meta}</Text> : null}
                </View>
                <Text style={styles.lineValue}>{formatCurrency(line.value)}</Text>
              </View>
            ))}
          </View>

          <View style={styles.totals}>
            <TotalRow label="Subtotal" value={invoice.subtotal} />
            {invoice.paymentsReceived > 0 ? (
              <TotalRow isCredit label="Payments received" value={invoice.paymentsReceived} />
            ) : null}
            <View style={styles.totalDivider} />
            <TotalRow isStrong label="Balance due" value={invoice.balanceDue} />
          </View>

          <View style={styles.noteBlock}>
            <Text style={styles.sectionLabel}>Note</Text>
            <Text style={styles.invoiceText}>{note}</Text>
          </View>
          {invoice.terms ? (
            <View style={styles.noteBlock}>
              <Text style={styles.sectionLabel}>Terms</Text>
              <Text style={styles.invoiceText}>{invoice.terms}</Text>
            </View>
          ) : null}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function printHtmlFromIframe(html: string): void {
  const documentRef = globalThis.document;

  if (!documentRef) {
    throw new Error('Document is unavailable.');
  }

  const iframe = documentRef.createElement('iframe');
  const previousTitle = documentRef.title;
  const printTitle = html.match(/<title>(.*?)<\/title>/i)?.[1]?.trim();

  if (printTitle) {
    documentRef.title = printTitle;
  }

  iframe.style.height = '0';
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.width = '0';
  iframe.style.border = '0';
  documentRef.body.appendChild(iframe);

  const frameWindow = iframe.contentWindow;
  const frameDocument = iframe.contentDocument ?? frameWindow?.document;

  if (!frameWindow || !frameDocument) {
    documentRef.body.removeChild(iframe);
    throw new Error('Print frame is unavailable.');
  }

  frameDocument.open();
  frameDocument.write(html);
  frameDocument.close();

  frameWindow.focus();
  frameWindow.print();
  window.setTimeout(() => {
    documentRef.title = previousTitle;
    documentRef.body.removeChild(iframe);
  }, 1000);
}

function TotalRow({
  isCredit = false,
  isStrong = false,
  label,
  value,
}: {
  isCredit?: boolean;
  isStrong?: boolean;
  label: string;
  value: number;
}) {
  return (
    <View style={styles.totalRow}>
      <Text style={[styles.totalLabel, isStrong && styles.strongTotalText]}>{label}</Text>
      <Text style={[styles.totalValue, isStrong && styles.strongTotalText]}>
        {isCredit && value > 0 ? '-' : ''}
        {formatCurrency(value)}
      </Text>
    </View>
  );
}

function buildInvoiceDraft(
  job: Job,
  snapshot: JobFinancialSnapshotRow | null,
  laborEntries: JobLaborCostEntry[],
  materialEntries: JobMaterialCostEntry[],
  materialMarkupPercent: number,
  note: string,
  profile: AccountProfile | null,
  invoiceAmountPaid: number,
  invoiceNumber: string,
  issueDate: string,
  dueDate: string | null,
  terms: string | null
) {
  const lines =
    job.jobType === 'time_and_materials'
      ? buildTimeAndMaterialsInvoiceLines({
          expenseEntries: materialEntries,
          laborEntries,
          materialMarkupPercent,
        })
      : buildFixedBidInvoiceLines(snapshot?.quote_amount ?? job.quoteAmount);
  const subtotal = lines.reduce((sum, line) => sum + line.value, 0);
  const paymentsReceived = Math.min(Math.max(invoiceAmountPaid, 0), subtotal);
  const balanceDue = Math.max(subtotal - paymentsReceived, 0);
  const documentInput = {
    balanceDue,
    billToLines: [job.clientName, job.name, job.location ?? ''].filter(hasText),
    dueDate,
    fileName: `${job.name} Invoice`,
    fromLines: formatInvoiceProfileLines(profile),
    invoiceNumber,
    invoiceType: job.jobType === 'time_and_materials' ? 'Time & materials' : 'Fixed bid',
    issueDate,
    lines,
    note,
    paymentsReceived,
    subtotal,
    terms,
  };

  return {
    balanceDue,
    dueDate,
    html: buildInvoiceDocumentHtml(documentInput),
    invoiceNumber,
    issueDate,
    lines,
    paymentsReceived,
    subtotal,
    terms,
    text: buildInvoiceDocumentText(documentInput),
  };
}

function toLedgerDraftLines(lines: InvoiceLine[]): InvoiceDraftLineInput[] {
  return lines.map((line, position) => ({
    amount: line.value,
    description: line.label,
    detail: line.meta ?? null,
    expenseIds: line.expenseIds ?? [],
    lineType: line.lineType,
    position,
    quantity: line.quantity,
    timeEntryIds: line.timeEntryIds ?? [],
    unit: line.unit,
    unitRate: line.unitRate,
  }));
}

function getBundleDraftFingerprint(bundle: InvoiceBundle): string {
  return getDraftFingerprint(
    bundle.lines.map((line) => ({
      amount: line.amount,
      description: line.description,
      detail: line.detail,
      expenseIds: line.expenseIds,
      lineType: line.line_type,
      position: line.position,
      quantity: line.quantity,
      timeEntryIds: line.timeEntryIds,
      unit: line.unit,
      unitRate: line.unit_rate,
    })),
    bundle.invoice.material_markup_percent,
    bundle.invoice.note,
    bundle.invoice.issue_date,
    bundle.invoice.due_date,
    bundle.invoice.terms
  );
}

function getDraftFingerprint(
  lines: InvoiceDraftLineInput[],
  materialMarkupPercent: number,
  note: string | null,
  issueDate: string,
  dueDate: string | null,
  terms: string | null
): string {
  return JSON.stringify({
    lines: lines.map((line) => ({
      amount: roundMoney(line.amount ?? line.quantity * line.unitRate),
      description: line.description.trim(),
      detail: line.detail?.trim() || null,
      expenseIds: [...(line.expenseIds ?? [])].sort(),
      lineType: line.lineType,
      position: line.position,
      quantity: line.quantity,
      timeEntryIds: [...(line.timeEntryIds ?? [])].sort(),
      unit: line.unit,
      unitRate: line.unitRate,
    })),
    materialMarkupPercent: roundMoney(materialMarkupPercent),
    note: note?.trim() || null,
    issueDate,
    dueDate,
    terms: terms?.trim() || null,
  });
}

function parseMarkupPercent(value: string): number | undefined {
  const cleaned = value.replace(/[%\s,]/g, '');

  if (!cleaned) {
    return 0;
  }

  const parsed = Number(cleaned);

  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 500) {
    return undefined;
  }

  return Math.round(parsed * 100) / 100;
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function getMissingInvoiceProfileFields(profile: AccountProfile | null): string[] {
  if (!profile) {
    return ['business name', 'phone', 'address', 'city', 'state', 'ZIP'];
  }

  const missingFields: string[] = [];

  if (!hasText(profile.companyName) && !hasText(profile.fullName)) {
    missingFields.push('business name');
  }

  if (!hasText(profile.phone)) {
    missingFields.push('phone');
  }

  if (!hasText(profile.invoiceEmail)) {
    missingFields.push('email');
  }

  if (!hasText(profile.addressLine1)) {
    missingFields.push('address');
  }

  if (!hasText(profile.city)) {
    missingFields.push('city');
  }

  if (!hasText(profile.state)) {
    missingFields.push('state');
  }

  if (!hasText(profile.postalCode)) {
    missingFields.push('ZIP');
  }

  return missingFields;
}

function formatInvoiceProfileLines(profile: AccountProfile | null): string[] {
  if (!profile) {
    return [];
  }

  return [
    profile.companyName ?? profile.fullName ?? '',
    profile.companyName && profile.fullName ? profile.fullName : '',
    profile.addressLine1 ?? '',
    profile.addressLine2 ?? '',
    [profile.city, profile.state, profile.postalCode].filter(hasText).join(', ').replace(', ', ', '),
    profile.phone ?? '',
    profile.invoiceEmail ?? '',
    profile.website ?? '',
  ].filter(hasText);
}

function hasText(value: string | null | undefined): value is string {
  return Boolean(value?.trim());
}

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: colors.appBackground,
    flex: 1,
  },
  container: {
    padding: 20,
    paddingBottom: 36,
  },
  screenActions: {
    gap: 10,
    marginBottom: 12,
  },
  backButton: {
    alignSelf: 'flex-start',
    justifyContent: 'center',
    minHeight: 44,
  },
  backButtonText: {
    color: colors.primaryGreen,
    fontSize: 16,
    fontWeight: '800',
  },
  exportActions: {
    flexDirection: 'row',
    gap: 10,
  },
  primaryButton: {
    ...buttonStyles.primary.container,
    borderRadius: radii.button,
    flex: 1,
    minHeight: 46,
  },
  primaryButtonText: {
    ...buttonStyles.primary.text,
    fontSize: 15,
  },
  secondaryButton: {
    ...buttonStyles.secondary.container,
    borderRadius: radii.button,
    flex: 1,
    minHeight: 46,
  },
  secondaryButtonText: {
    ...buttonStyles.secondary.text,
    fontSize: 15,
  },
  disabledButton: {
    opacity: 0.55,
  },
  header: {
    marginBottom: 16,
  },
  title: {
    color: colors.text,
    fontSize: 30,
    fontWeight: '900',
  },
  subtitle: {
    color: colors.mutedText,
    fontSize: 16,
    fontWeight: '600',
    lineHeight: 22,
    marginTop: 4,
  },
  messageText: {
    color: colors.mutedText,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
    marginBottom: 12,
  },
  errorText: {
    color: colors.danger,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 12,
  },
  profileWarningPanel: {
    backgroundColor: '#FFF7ED',
    borderColor: '#FDBA74',
    borderRadius: radii.card,
    borderWidth: 1,
    gap: 8,
    marginBottom: 14,
    padding: 14,
  },
  profileWarningTitle: {
    color: '#9A3412',
    fontSize: 16,
    fontWeight: '900',
  },
  profileWarningText: {
    color: '#7C2D12',
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
  },
  warningButton: {
    alignItems: 'center',
    borderColor: '#9A3412',
    borderRadius: radii.button,
    borderWidth: 1,
    justifyContent: 'center',
    marginTop: 4,
    minHeight: 42,
  },
  warningButtonText: {
    color: '#9A3412',
    fontSize: 14,
    fontWeight: '900',
  },
  settingsPanel: {
    backgroundColor: colors.cardBackground,
    borderColor: colors.standardBorder,
    borderRadius: radii.card,
    borderWidth: 1,
    gap: 14,
    marginBottom: 16,
    padding: 16,
  },
  settingsTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '900',
  },
  draftHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
  },
  draftHeaderText: {
    flex: 1,
    gap: 4,
  },
  draftStatusText: {
    color: colors.mutedText,
    fontSize: 13,
    fontWeight: '700',
  },
  draftBadge: {
    backgroundColor: '#EEF2F6',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  draftBadgeText: {
    color: colors.mutedText,
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  saveDraftButton: {
    ...buttonStyles.primary.container,
    borderRadius: radii.button,
    minHeight: 48,
  },
  saveDraftButtonText: {
    ...buttonStyles.primary.text,
    fontSize: 15,
  },
  saveDraftContent: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
  },
  exportHint: {
    color: colors.mutedText,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18,
    textAlign: 'center',
  },
  noteEditor: {
    gap: 8,
  },
  previewWrap: {
    backgroundColor: '#F6F3EC',
    borderColor: '#D8D2C6',
    borderRadius: 14,
    borderWidth: 1,
    padding: 12,
  },
  invoice: {
    backgroundColor: '#FFFDF8',
    borderColor: '#D8D2C6',
    borderRadius: 14,
    borderWidth: 1,
    gap: 28,
    padding: 32,
  },
  invoiceHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 24,
    justifyContent: 'space-between',
  },
  invoiceTitle: {
    color: colors.text,
    fontSize: 36,
    fontWeight: '900',
  },
  invoiceNumber: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '900',
    marginTop: 6,
  },
  invoiceMeta: {
    color: colors.mutedText,
    fontSize: 16,
    fontWeight: '700',
    marginTop: 6,
  },
  invoiceDueDate: {
    color: colors.primaryGreen,
    fontSize: 14,
    fontWeight: '900',
    marginTop: 4,
  },
  invoiceType: {
    color: colors.primaryGreen,
    fontSize: 16,
    fontWeight: '900',
    textAlign: 'right',
  },
  billTo: {
    gap: 2,
  },
  fromBlock: {
    gap: 2,
  },
  sectionLabel: {
    color: colors.mutedText,
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0,
    textTransform: 'uppercase',
  },
  invoiceText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 23,
  },
  markupPanel: {
    borderColor: colors.standardBorder,
    borderRadius: 10,
    borderWidth: 1,
    gap: 12,
    padding: 12,
  },
  markupHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
  },
  markupText: {
    flex: 1,
    gap: 4,
  },
  markupHelp: {
    color: colors.mutedText,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18,
  },
  markupInputRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  markupInput: {
    borderColor: colors.standardBorder,
    borderRadius: 8,
    borderWidth: 1,
    color: colors.text,
    fontSize: 16,
    fontWeight: '800',
    minHeight: 44,
    paddingHorizontal: 12,
    textAlign: 'right',
    width: 86,
  },
  markupPercentText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '900',
  },
  markupPresetRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  markupPresetButton: {
    alignItems: 'center',
    borderColor: colors.standardBorder,
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 38,
    minWidth: 58,
    paddingHorizontal: 12,
  },
  selectedMarkupPresetButton: {
    backgroundColor: colors.primaryGreen,
    borderColor: colors.primaryGreen,
  },
  markupPresetButtonText: {
    color: colors.primaryGreen,
    fontSize: 14,
    fontWeight: '900',
  },
  selectedMarkupPresetButtonText: {
    color: colors.warmWhite,
  },
  markupErrorText: {
    color: colors.danger,
    fontSize: 13,
    fontWeight: '800',
    lineHeight: 18,
  },
  lines: {
    borderTopColor: '#ECE6DA',
    borderTopWidth: 1,
  },
  lineItem: {
    alignItems: 'flex-start',
    borderBottomColor: '#ECE6DA',
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
    paddingVertical: 16,
  },
  lineText: {
    flex: 1,
    gap: 3,
  },
  lineLabel: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '900',
  },
  lineMeta: {
    color: colors.mutedText,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18,
  },
  lineValue: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '900',
  },
  totals: {
    alignSelf: 'flex-end',
    gap: 9,
    maxWidth: 360,
    width: '100%',
  },
  totalRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  totalLabel: {
    color: colors.mutedText,
    fontSize: 16,
    fontWeight: '800',
  },
  totalValue: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '900',
  },
  totalDivider: {
    backgroundColor: '#ECE6DA',
    height: 1,
  },
  strongTotalText: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '900',
  },
  noteBlock: {
    gap: 8,
  },
  noteInput: {
    borderColor: colors.standardBorder,
    borderRadius: 10,
    borderWidth: 1,
    color: colors.text,
    fontSize: 15,
    lineHeight: 21,
    minHeight: 92,
    padding: 12,
  },
});
