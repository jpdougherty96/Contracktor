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
import { buttonStyles, colors, radii } from '@/src/styles/theme';
import type { Job } from '@/src/types/job';

type InvoiceDraftScreenProps = {
  job: Job;
  onBack: () => void;
};

type InvoiceLine = {
  label: string;
  meta?: string;
  value: number;
};

const defaultNote = 'Thank you for your business.';

export function InvoiceDraftScreen({ job, onBack }: InvoiceDraftScreenProps) {
  const [snapshot, setSnapshot] = useState<JobFinancialSnapshotRow | null>(null);
  const [laborEntries, setLaborEntries] = useState<JobLaborCostEntry[]>([]);
  const [materialEntries, setMaterialEntries] = useState<JobMaterialCostEntry[]>([]);
  const [note, setNote] = useState(defaultNote);
  const [message, setMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    const loadInvoiceData = async () => {
      setIsLoading(true);
      setErrorMessage(null);

      try {
        const [nextSnapshot, nextLaborEntries, nextMaterialEntries] = await Promise.all([
          fetchJobFinancialSnapshot(job.id),
          fetchJobLaborCostEntries(job.id),
          fetchJobMaterialCostEntries(job.id),
        ]);

        if (isMounted) {
          setSnapshot(nextSnapshot);
          setLaborEntries(nextLaborEntries);
          setMaterialEntries(nextMaterialEntries);
        }
      } catch (error) {
        if (isMounted) {
          setErrorMessage(error instanceof Error ? error.message : 'Unable to build invoice.');
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
    () => buildInvoiceDraft(job, snapshot, laborEntries, materialEntries, note),
    [job, laborEntries, materialEntries, note, snapshot]
  );

  const handleCopy = async () => {
    setMessage(null);

    if (Platform.OS !== 'web') {
      setMessage('Copy is available on web for this draft.');
      return;
    }

    const clipboard = globalThis.navigator?.clipboard;

    try {
      if (clipboard) {
        await clipboard.writeText(invoice.text);
      } else {
        copyTextWithTextarea(invoice.text);
      }

      setMessage('Invoice text copied.');
    } catch {
      try {
        copyTextWithTextarea(invoice.text);
        setMessage('Invoice text copied.');
      } catch {
        setMessage('Unable to copy invoice text in this browser.');
      }
    }
  };

  const handlePrint = async () => {
    setMessage(null);

    try {
      const fileBaseName = `${job.name} Invoice`;
      const html = buildPrintableInvoiceHtml(invoice.html, fileBaseName);

      if (Platform.OS === 'web') {
        printHtmlFromIframe(html);
        return;
      }

      const sharedUri = await createAndSharePdf({
        dialogTitle: 'Share invoice PDF',
        fileBaseName,
        html,
      });
      setMessage(`PDF ready: ${sharedUri}`);
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
            <Pressable style={styles.secondaryButton} onPress={handleCopy}>
              <Text style={styles.secondaryButtonText}>Copy text</Text>
            </Pressable>
            <Pressable style={styles.primaryButton} onPress={handlePrint}>
              <Text style={styles.primaryButtonText}>Print / PDF</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.header}>
          <Text style={styles.title}>Invoice</Text>
          <Text style={styles.subtitle}>Generated from current job data.</Text>
        </View>

        {isLoading ? <Text style={styles.messageText}>Building invoice...</Text> : null}
        {!isLoading && errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}
        {message ? <Text style={styles.messageText}>{message}</Text> : null}

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
      </ScrollView>
    </SafeAreaView>
  );
}

function copyTextWithTextarea(text: string): void {
  const documentRef = globalThis.document;

  if (!documentRef) {
    throw new Error('Document is unavailable.');
  }

  const textarea = documentRef.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.left = '-9999px';
  textarea.style.position = 'fixed';
  textarea.style.top = '0';
  documentRef.body.appendChild(textarea);
  textarea.focus();
  textarea.select();

  const didCopy = documentRef.execCommand('copy');
  documentRef.body.removeChild(textarea);

  if (!didCopy) {
    throw new Error('Copy command failed.');
  }
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
  note: string
) {
  const paymentsReceived = snapshot?.payments_received ?? 0;
  const lines =
    job.jobType === 'time_and_materials'
      ? buildTimeAndMaterialsLines(job, snapshot, laborEntries, materialEntries)
      : buildFixedBidLines(job, snapshot);
  const subtotal = lines.reduce((sum, line) => sum + line.value, 0);
  const balanceDue = subtotal - paymentsReceived;

  return {
    balanceDue,
    lines,
    paymentsReceived,
    subtotal,
    text: formatInvoiceText(job, lines, subtotal, paymentsReceived, balanceDue, note),
    html: formatInvoiceHtml(job, lines, subtotal, paymentsReceived, balanceDue, note),
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
  materialEntries: JobMaterialCostEntry[]
): InvoiceLine[] {
  const totalHours =
    snapshot?.total_hours ??
    laborEntries.reduce((sum, entry) => sum + entry.duration_minutes / 60, 0);
  const laborRate = job.hourlyRate ?? averageLaborRate(laborEntries);
  const laborTotal = totalHours * laborRate;
  const materialTotal =
    snapshot?.receipt_cost ?? materialEntries.reduce((sum, entry) => sum + entry.total_amount, 0);

  return [
    {
      label: 'Labor',
      meta: `${formatNumber(totalHours)} hrs x ${formatCurrency(laborRate)}/hr`,
      value: laborTotal,
    },
    {
      label: 'Materials',
      meta: 'Materials logged',
      value: materialTotal,
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

function formatInvoiceText(
  job: Job,
  lines: InvoiceLine[],
  subtotal: number,
  paymentsReceived: number,
  balanceDue: number,
  note: string
): string {
  return [
    'Invoice',
    '',
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
  note: string
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
    </main>
  `;
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
  invoice: {
    backgroundColor: colors.cardBackground,
    borderColor: colors.standardBorder,
    borderRadius: radii.card,
    borderWidth: 1,
    gap: 20,
    padding: 18,
  },
  invoiceHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
  },
  invoiceTitle: {
    color: colors.text,
    fontSize: 28,
    fontWeight: '900',
  },
  invoiceMeta: {
    color: colors.mutedText,
    fontSize: 14,
    fontWeight: '700',
    marginTop: 4,
  },
  invoiceType: {
    color: colors.primaryGreen,
    fontSize: 13,
    fontWeight: '900',
    textAlign: 'right',
  },
  billTo: {
    gap: 3,
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
    lineHeight: 22,
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
    paddingVertical: 14,
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
    gap: 9,
  },
  totalRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  totalLabel: {
    color: colors.mutedText,
    fontSize: 15,
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
    fontSize: 19,
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
