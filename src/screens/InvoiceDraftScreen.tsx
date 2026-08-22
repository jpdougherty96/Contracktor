import { useEffect, useMemo, useState } from 'react';
import {
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
import { createAndSharePdf, sanitizePdfFileName } from '@/src/lib/pdfExport';
import { fetchAccountProfile, type AccountProfile } from '@/src/lib/profiles';
import { getUserFacingError } from '@/src/lib/userFacingError';
import { buttonStyles, colors, radii } from '@/src/styles/theme';
import type { Job } from '@/src/types/job';

type InvoiceDraftScreenProps = {
  job: Job;
  onBack: () => void;
  onEditBusinessProfile: () => void;
};

type InvoiceLine = {
  label: string;
  meta?: string;
  value: number;
};

const defaultNote = 'Thank you for your business.';
const materialMarkupPresets = [0, 10, 15, 20];

export function InvoiceDraftScreen({ job, onBack, onEditBusinessProfile }: InvoiceDraftScreenProps) {
  const [snapshot, setSnapshot] = useState<JobFinancialSnapshotRow | null>(null);
  const [laborEntries, setLaborEntries] = useState<JobLaborCostEntry[]>([]);
  const [materialEntries, setMaterialEntries] = useState<JobMaterialCostEntry[]>([]);
  const [profile, setProfile] = useState<AccountProfile | null>(null);
  const [materialMarkupPercent, setMaterialMarkupPercent] = useState('0');
  const [note, setNote] = useState(defaultNote);
  const [message, setMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const parsedMaterialMarkupPercent = parseMarkupPercent(materialMarkupPercent);
  const materialMarkupError =
    parsedMaterialMarkupPercent === undefined ? 'Enter a valid materials markup percent.' : null;
  const isTimeAndMaterialsJob = job.jobType === 'time_and_materials';
  const missingInvoiceFields = getMissingInvoiceProfileFields(profile);
  const canExportInvoice = missingInvoiceFields.length === 0 && !materialMarkupError;

  useEffect(() => {
    let isMounted = true;

    const loadInvoiceData = async () => {
      setIsLoading(true);
      setErrorMessage(null);

      try {
        const [nextSnapshot, nextLaborEntries, nextMaterialEntries, nextProfile] = await Promise.all([
          fetchJobFinancialSnapshot(job.id),
          fetchJobLaborCostEntries(job.id),
          fetchJobMaterialCostEntries(job.id),
          fetchAccountProfile(),
        ]);

        if (isMounted) {
          setSnapshot(nextSnapshot);
          setLaborEntries(nextLaborEntries);
          setMaterialEntries(nextMaterialEntries);
          setProfile(nextProfile);
          setNote(nextProfile.defaultInvoiceNote ?? defaultNote);
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
        profile
      ),
    [job, laborEntries, materialEntries, note, parsedMaterialMarkupPercent, profile, snapshot]
  );

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
      const html = buildPrintableInvoiceHtml(invoice.html, fileBaseName);

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
      const html = buildPrintableInvoiceHtml(invoice.html, fileBaseName);

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
          <Text style={styles.subtitle}>Review the invoice before saving or printing.</Text>
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
          <Text style={styles.settingsTitle}>Invoice options</Text>
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
        </View>

        <View style={styles.previewWrap}>
          <View style={styles.invoice}>
          <View style={styles.invoiceHeader}>
            <View>
              <Text style={styles.invoiceTitle}>Invoice</Text>
              <Text style={styles.invoiceMeta}>{formatDate(new Date())}</Text>
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
            <TotalRow isCredit label="Payments received" value={invoice.paymentsReceived} />
            <View style={styles.totalDivider} />
            <TotalRow isStrong label="Balance due" value={invoice.balanceDue} />
          </View>

          <View style={styles.noteBlock}>
            <Text style={styles.sectionLabel}>Note</Text>
            <Text style={styles.invoiceText}>{note}</Text>
          </View>
          {profile?.defaultInvoiceTerms ? (
            <View style={styles.noteBlock}>
              <Text style={styles.sectionLabel}>Terms</Text>
              <Text style={styles.invoiceText}>{profile.defaultInvoiceTerms}</Text>
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
  profile: AccountProfile | null
) {
  const paymentsReceived = snapshot?.payments_received ?? 0;
  const lines =
    job.jobType === 'time_and_materials'
      ? buildTimeAndMaterialsLines(
          job,
          snapshot,
          laborEntries,
          materialEntries,
          materialMarkupPercent
        )
      : buildFixedBidLines(job, snapshot);
  const subtotal = lines.reduce((sum, line) => sum + line.value, 0);
  const balanceDue = subtotal - paymentsReceived;

  return {
    balanceDue,
    lines,
    paymentsReceived,
    subtotal,
    text: formatInvoiceText(job, lines, subtotal, paymentsReceived, balanceDue, note, profile),
    html: formatInvoiceHtml(job, lines, subtotal, paymentsReceived, balanceDue, note, profile),
  };
}

function buildFixedBidLines(job: Job, snapshot: JobFinancialSnapshotRow | null): InvoiceLine[] {
  return [
    {
      label: 'Contract amount',
      value: snapshot?.quote_amount ?? job.quoteAmount,
    },
  ];
}

function buildTimeAndMaterialsLines(
  job: Job,
  snapshot: JobFinancialSnapshotRow | null,
  laborEntries: JobLaborCostEntry[],
  materialEntries: JobMaterialCostEntry[],
  materialMarkupPercent: number
): InvoiceLine[] {
  const totalHours =
    snapshot?.total_hours ??
    laborEntries.reduce((sum, entry) => sum + entry.duration_minutes / 60, 0);
  const laborRate = job.hourlyRate ?? averageLaborRate(laborEntries);
  const laborTotal = totalHours * laborRate;
  const materialTotal =
    snapshot?.receipt_cost ?? materialEntries.reduce((sum, entry) => sum + entry.total_amount, 0);
  const markedUpMaterialTotal = roundMoney(materialTotal * (1 + materialMarkupPercent / 100));

  return [
    {
      label: 'Labor',
      meta: `${formatNumber(totalHours)} hrs x ${formatCurrency(laborRate)}/hr`,
      value: laborTotal,
    },
    {
      label: 'Materials',
      meta:
        materialMarkupPercent > 0
          ? `${formatCurrency(materialTotal)} materials + ${formatNumber(materialMarkupPercent)}% markup`
          : 'Materials logged',
      value: markedUpMaterialTotal,
    },
  ];
}

function averageLaborRate(laborEntries: JobLaborCostEntry[]): number {
  const hours = laborEntries.reduce((sum, entry) => sum + entry.duration_minutes / 60, 0);

  if (hours <= 0) {
    return 0;
  }

  const total = laborEntries.reduce(
    (sum, entry) => sum + (entry.duration_minutes / 60) * entry.hourly_rate,
    0
  );

  return total / hours;
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

function formatInvoiceText(
  job: Job,
  lines: InvoiceLine[],
  subtotal: number,
  paymentsReceived: number,
  balanceDue: number,
  note: string,
  profile: AccountProfile | null
): string {
  const fromLines = formatInvoiceProfileLines(profile);

  return [
    'Invoice',
    '',
    'From',
    ...fromLines,
    '',
    'Bill to',
    job.clientName,
    job.name,
    job.location ?? '',
    '',
    ...lines.flatMap((line) => [
      line.label,
      line.meta ? `${line.meta}: ${formatCurrency(line.value)}` : formatCurrency(line.value),
      '',
    ]),
    `Subtotal: ${formatCurrency(subtotal)}`,
    `Payments received: -${formatCurrency(paymentsReceived)}`,
    `Balance due: ${formatCurrency(balanceDue)}`,
    '',
    note,
    profile?.defaultInvoiceTerms ? `Terms: ${profile.defaultInvoiceTerms}` : '',
  ]
    .filter((line, index, allLines) => line || allLines[index - 1])
    .join('\n');
}

function formatInvoiceHtml(
  job: Job,
  lines: InvoiceLine[],
  subtotal: number,
  paymentsReceived: number,
  balanceDue: number,
  note: string,
  profile: AccountProfile | null
): string {
  const lineRows = lines
    .map(
      (line) => `
        <tr>
          <td>
            <strong>${escapeHtml(line.label)}</strong>
            ${line.meta ? `<span>${escapeHtml(line.meta)}</span>` : ''}
          </td>
          <td>${escapeHtml(formatCurrency(line.value))}</td>
        </tr>
      `
    )
    .join('');

  return `
    <main class="invoice">
      <header>
        <div>
          <h1>Invoice</h1>
          <p>${escapeHtml(formatDate(new Date()))}</p>
        </div>
        <p class="type">${job.jobType === 'time_and_materials' ? 'Time & materials' : 'Fixed bid'}</p>
      </header>

      <section>
        <h2>From</h2>
        ${formatInvoiceProfileLines(profile)
          .map((line) => `<p>${escapeHtml(line)}</p>`)
          .join('')}
      </section>

      <section>
        <h2>Bill to</h2>
        <p>${escapeHtml(job.clientName)}</p>
        <p>${escapeHtml(job.name)}</p>
        ${job.location ? `<p>${escapeHtml(job.location)}</p>` : ''}
      </section>

      <table>
        <tbody>${lineRows}</tbody>
      </table>

      <section class="totals">
        <p><span>Subtotal</span><strong>${escapeHtml(formatCurrency(subtotal))}</strong></p>
        <p><span>Payments received</span><strong>-${escapeHtml(formatCurrency(paymentsReceived))}</strong></p>
        <p class="balance"><span>Balance due</span><strong>${escapeHtml(formatCurrency(balanceDue))}</strong></p>
      </section>

      ${note ? `<section><h2>Note</h2><p>${escapeHtml(note)}</p></section>` : ''}
      ${profile?.defaultInvoiceTerms ? `<section><h2>Terms</h2><p>${escapeHtml(profile.defaultInvoiceTerms)}</p></section>` : ''}
    </main>
  `;
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

function buildPrintableInvoiceHtml(invoiceHtml: string, fileBaseName: string): string {
  return `
    <!doctype html>
    <html>
      <head>
        <title>${escapeHtml(sanitizePdfFileName(fileBaseName))}</title>
        <style>
          body {
            background: #f6f3ec;
            color: #202629;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
            margin: 0;
            padding: 32px;
          }

          .invoice {
            background: #fffdf8;
            border: 1px solid #d8d2c6;
            border-radius: 14px;
            margin: 0 auto;
            max-width: 720px;
            padding: 32px;
          }

          header {
            align-items: flex-start;
            display: flex;
            justify-content: space-between;
            gap: 24px;
            margin-bottom: 32px;
          }

          h1 {
            font-size: 36px;
            margin: 0;
          }

          h2 {
            color: #667382;
            font-size: 12px;
            letter-spacing: 0;
            margin: 0 0 8px;
            text-transform: uppercase;
          }

          p {
            font-size: 16px;
            line-height: 1.45;
            margin: 0;
          }

          .type {
            color: #294b38;
            font-weight: 800;
            text-align: right;
          }

          section {
            margin-bottom: 28px;
          }

          table {
            border-collapse: collapse;
            margin-bottom: 28px;
            width: 100%;
          }

          td {
            border-bottom: 1px solid #ece6da;
            font-size: 16px;
            padding: 16px 0;
            vertical-align: top;
          }

          td:last-child {
            font-weight: 800;
            text-align: right;
            white-space: nowrap;
          }

          td span {
            color: #667382;
            display: block;
            font-size: 13px;
            font-weight: 700;
            margin-top: 4px;
          }

          .totals {
            margin-left: auto;
            max-width: 360px;
          }

          .totals p {
            display: flex;
            justify-content: space-between;
            padding: 6px 0;
          }

          .balance {
            border-top: 1px solid #ece6da;
            font-size: 20px;
            margin-top: 8px;
            padding-top: 14px !important;
          }

          @media print {
            body {
              background: #ffffff;
              padding: 0;
            }

            .invoice {
              border: 0;
              border-radius: 0;
              max-width: none;
            }
          }
        </style>
      </head>
      <body>${invoiceHtml}</body>
    </html>
  `;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatCurrency(value: number | null | undefined): string {
  return new Intl.NumberFormat('en-US', {
    currency: 'USD',
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
    style: 'currency',
  }).format(value ?? 0);
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 2,
  }).format(value);
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date);
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
  invoiceMeta: {
    color: colors.mutedText,
    fontSize: 16,
    fontWeight: '700',
    marginTop: 6,
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
