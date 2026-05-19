import type { ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  fetchJobReportData,
  type JobReportData,
  type JobReportExpense,
  type JobReportHours,
  type JobReportNote,
  type JobReportPayment,
} from '@/src/lib/jobReport';
import { createAndSharePdf, sanitizePdfFileName } from '@/src/lib/pdfExport';
import { buttonStyles, colors, radii } from '@/src/styles/theme';
import type { Job } from '@/src/types/job';

type JobReportScreenProps = {
  job: Job;
  onBack: () => void;
};

const emptyReport: JobReportData = {
  expenses: [],
  hours: [],
  notes: [],
  payments: [],
};

export function JobReportScreen({ job, onBack }: JobReportScreenProps) {
  const [report, setReport] = useState<JobReportData>(emptyReport);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    const loadReport = async () => {
      setIsLoading(true);
      setErrorMessage(null);

      try {
        const nextReport = await fetchJobReportData(job.id);

        if (isMounted) {
          setReport(nextReport);
        }
      } catch (error) {
        if (isMounted) {
          setErrorMessage(error instanceof Error ? error.message : 'Unable to build job report.');
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    loadReport();

    return () => {
      isMounted = false;
    };
  }, [job.id]);

  const summary = useMemo(() => getReportSummary(job, report), [job, report]);
  const html = useMemo(() => buildReportHtml(job, report, summary), [job, report, summary]);

  const handleExport = async () => {
    setMessage(null);

    try {
      const fileBaseName = `${job.name} report`;
      const documentHtml = buildPrintableReportHtml(html, fileBaseName);

      if (Platform.OS === 'web') {
        printHtmlFromIframe(documentHtml);
        return;
      }

      const sharedUri = await createAndSharePdf({
        dialogTitle: 'Share job report PDF',
        fileBaseName,
        html: documentHtml,
      });
      setMessage(`PDF ready: ${sharedUri}`);
    } catch {
      setMessage('Unable to export job report PDF.');
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.screenActions}>
          <Pressable style={styles.backButton} onPress={onBack}>
            <Text style={styles.backButtonText}>Back to job</Text>
          </Pressable>
          <Pressable style={styles.primaryButton} onPress={handleExport}>
            <Text style={styles.primaryButtonText}>Export PDF</Text>
          </Pressable>
        </View>

        <View style={styles.header}>
          <Text style={styles.title}>Job report</Text>
          <Text style={styles.subtitle}>{job.name}</Text>
        </View>

        {isLoading ? <Text style={styles.messageText}>Building job report...</Text> : null}
        {!isLoading && errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}
        {message ? <Text style={styles.messageText}>{message}</Text> : null}

        <View style={styles.report}>
          <View style={styles.reportHeader}>
            <Text style={styles.reportEyebrow}>Job report</Text>
            <Text style={styles.reportTitle}>{job.name}</Text>
            <Text style={styles.reportGenerated}>Generated {formatDate(new Date())}</Text>
          </View>

          <Section title="From">
            <InfoRow label="Prepared by" value="conTRACKtor user" />
          </Section>

          <Section title="Job info">
            <InfoRow label="Client" value={job.clientName} />
            <InfoRow label="Location" value={job.location ?? '—'} />
            <InfoRow
              label="Job type"
              value={job.jobType === 'time_and_materials' ? 'Time & materials' : 'Fixed bid'}
            />
            <InfoRow label="Status" value={formatStatus(job.status)} />
            <InfoRow label="Created" value={formatDate(job.createdAt)} />
          </Section>

          <Section title="Budget / quote">
            {job.jobType === 'fixed_bid' ? (
              <InfoRow label="Quote amount" value={formatCurrency(job.quoteAmount)} />
            ) : null}
            <InfoRow label="Material budget" value={formatOptionalCurrency(job.estimatedMaterialCost)} />
            <InfoRow label="Labor hour budget" value={formatOptionalNumber(job.estimatedLaborHours)} />
            <InfoRow label="Hourly rate" value={formatOptionalCurrency(job.hourlyRate)} />
            <InfoRow
              label="Other estimated costs"
              value={formatOptionalCurrency(getOtherEstimatedCost(job))}
            />
          </Section>

          <Section title="Summary">
            <InfoRow label="Receipts / expenses" value={formatCurrency(summary.totalReceipts)} />
            <InfoRow label="Total labor time" value={formatLaborTime(summary.totalLaborMinutes)} />
            <InfoRow label="Total labor value" value={formatCurrency(summary.totalLaborValue)} />
            <InfoRow label="Payments received" value={formatCurrency(summary.totalPayments)} />
            <InfoRow
              label={job.jobType === 'fixed_bid' ? 'Contract balance' : 'Billable amount'}
              value={formatCurrency(summary.balance)}
            />
          </Section>

          <DataSection
            emptyText="No expenses logged."
            items={report.expenses.map((expense) => ({
              detail: `${expense.vendor ?? 'No vendor'} · ${formatExpenseType(expense.expense_type)} · ${
                expense.receiptStatus ?? expense.status
              }`,
              meta: expense.receiptImageUrl ? 'Receipt file available in PDF link' : undefined,
              title: `${formatDate(expense.expense_date)} · ${expense.description}`,
              value: formatCurrency(expense.total_amount),
            }))}
            title="Receipts / expenses"
          />

          <DataSection
            emptyText="No labor logged."
            items={report.hours.map((entry) => ({
              detail: `${formatLaborTime(entry.duration_minutes)} at ${formatCurrency(
                entry.hourly_rate
              )}/hr${entry.description ? ` · ${entry.description}` : ''}`,
              title: `${formatDate(entry.work_date)} · ${entry.worker_name ?? 'Labor'}`,
              value: formatCurrency((entry.duration_minutes / 60) * entry.hourly_rate),
            }))}
            title="Labor"
          />

          <DataSection
            emptyText="No payments logged."
            items={report.payments.map((payment) => ({
              detail: [payment.method, payment.note].filter(Boolean).join(' · ') || undefined,
              title: formatDate(payment.payment_date),
              value: formatCurrency(payment.amount),
            }))}
            title="Payments"
          />

          <DataSection
            emptyText="No notes logged."
            items={report.notes.map((note) => ({
              detail: note.note,
              meta:
                note.photos.length > 0
                  ? `${note.photos.length} photo${note.photos.length === 1 ? '' : 's'} attached`
                  : undefined,
              title: formatDate(note.created_at),
            }))}
            title="Notes"
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Section({ children, title }: { children: ReactNode; title: string }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

function DataSection({
  emptyText,
  items,
  title,
}: {
  emptyText: string;
  items: { detail?: string; meta?: string; title: string; value?: string }[];
  title: string;
}) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {items.length === 0 ? <Text style={styles.emptyText}>{emptyText}</Text> : null}
      {items.map((item) => (
        <View key={`${title}-${item.title}-${item.value ?? item.detail ?? ''}`} style={styles.dataItem}>
          <View style={styles.dataText}>
            <Text style={styles.dataTitle}>{item.title}</Text>
            {item.detail ? <Text style={styles.dataDetail}>{item.detail}</Text> : null}
            {item.meta ? <Text style={styles.dataMeta}>{item.meta}</Text> : null}
          </View>
          {item.value ? <Text style={styles.dataValue}>{item.value}</Text> : null}
        </View>
      ))}
    </View>
  );
}

function getReportSummary(job: Job, report: JobReportData) {
  const totalReceipts = report.expenses.reduce((sum, expense) => sum + expense.total_amount, 0);
  const totalLaborHours = report.hours.reduce(
    (sum, entry) => sum + entry.duration_minutes / 60,
    0
  );
  const totalLaborMinutes = report.hours.reduce((sum, entry) => sum + entry.duration_minutes, 0);
  const totalLaborValue = report.hours.reduce(
    (sum, entry) => sum + (entry.duration_minutes / 60) * entry.hourly_rate,
    0
  );
  const totalPayments = report.payments.reduce((sum, payment) => sum + payment.amount, 0);
  const billableAmount =
    job.jobType === 'fixed_bid' ? job.quoteAmount : totalReceipts + totalLaborValue;

  return {
    balance: billableAmount - totalPayments,
    totalLaborHours,
    totalLaborMinutes,
    totalLaborValue,
    totalPayments,
    totalReceipts,
  };
}

function buildReportHtml(job: Job, report: JobReportData, summary: ReturnType<typeof getReportSummary>) {
  return `
    <main class="report">
      <header>
        <div>
          <p class="eyebrow">Job report</p>
          <h1>${escapeHtml(job.name)}</h1>
          <p>Generated ${escapeHtml(formatDate(new Date()))}</p>
        </div>
      </header>
      ${buildInfoTable('From', [['Prepared by', 'conTRACKtor user']])}
      ${buildInfoTable('Job info', [
        ['Client', job.clientName],
        ['Location', job.location ?? '—'],
        ['Job type', job.jobType === 'time_and_materials' ? 'Time & materials' : 'Fixed bid'],
        ['Status', formatStatus(job.status)],
        ['Created', formatDate(job.createdAt)],
      ])}
      ${buildInfoTable('Budget / quote', [
        ...(job.jobType === 'fixed_bid' ? ([['Quote amount', formatCurrency(job.quoteAmount)]] as [string, string][]) : []),
        ['Material budget', formatOptionalCurrency(job.estimatedMaterialCost)],
        ['Labor hour budget', formatOptionalNumber(job.estimatedLaborHours)],
        ['Hourly rate', formatOptionalCurrency(job.hourlyRate)],
        ['Other estimated costs', formatOptionalCurrency(getOtherEstimatedCost(job))],
      ])}
      ${buildInfoTable('Summary', [
        ['Receipts / expenses', formatCurrency(summary.totalReceipts)],
        ['Total labor time', formatLaborTime(summary.totalLaborMinutes)],
        ['Total labor value', formatCurrency(summary.totalLaborValue)],
        ['Payments received', formatCurrency(summary.totalPayments)],
        [job.jobType === 'fixed_bid' ? 'Contract balance' : 'Billable amount', formatCurrency(summary.balance)],
      ])}
      ${buildExpenseTable(report.expenses)}
      ${buildLaborTable(report.hours)}
      ${buildPaymentTable(report.payments)}
      ${buildNotesTable(report.notes)}
    </main>
  `;
}

function buildInfoTable(title: string, rows: [string, string][]) {
  return `
    <section>
      <h2>${escapeHtml(title)}</h2>
      <table>${rows
        .map(
          ([label, value]) => `
            <tr><th>${escapeHtml(label)}</th><td>${escapeHtml(value)}</td></tr>
          `
        )
        .join('')}</table>
    </section>
  `;
}

function buildExpenseTable(expenses: JobReportExpense[]) {
  return buildDetailTable(
    'Receipts / expenses',
    ['Date', 'Vendor / Description', 'Category', 'Status', 'Amount', 'File'],
    expenses.map((expense) => [
      escapeHtml(formatDate(expense.expense_date)),
      escapeHtml(`${expense.vendor ?? 'No vendor'} · ${expense.description}`),
      escapeHtml(formatExpenseType(expense.expense_type)),
      escapeHtml(expense.receiptStatus ?? expense.status),
      escapeHtml(formatCurrency(expense.total_amount)),
      expense.receiptImageUrl ? `<a href="${escapeHtml(expense.receiptImageUrl)}">Receipt</a>` : '—',
    ])
  );
}

function buildLaborTable(hours: JobReportHours[]) {
  return buildDetailTable(
    'Labor',
    ['Date', 'Worker / Note', 'Time', 'Rate', 'Value'],
    hours.map((entry) => [
      escapeHtml(formatDate(entry.work_date)),
      escapeHtml(
        `${entry.worker_name ?? 'Labor'}${entry.description ? ` · ${entry.description}` : ''}`
      ),
      escapeHtml(formatLaborTime(entry.duration_minutes)),
      escapeHtml(formatCurrency(entry.hourly_rate)),
      escapeHtml(formatCurrency((entry.duration_minutes / 60) * entry.hourly_rate)),
    ])
  );
}

function buildPaymentTable(payments: JobReportPayment[]) {
  return buildDetailTable(
    'Payments',
    ['Date', 'Method / Note', 'Amount'],
    payments.map((payment) => [
      escapeHtml(formatDate(payment.payment_date)),
      escapeHtml([payment.method, payment.note].filter(Boolean).join(' · ') || '—'),
      escapeHtml(formatCurrency(payment.amount)),
    ])
  );
}

function buildNotesTable(notes: JobReportNote[]) {
  return buildDetailTable(
    'Notes',
    ['Date', 'Note', 'Photos'],
    notes.map((note) => [
      escapeHtml(formatDate(note.created_at)),
      escapeHtml(note.note),
      note.photos.length > 0
        ? note.photos
            .map((photo, index) =>
              photo.url
                ? `<a href="${escapeHtml(photo.url)}">${escapeHtml(photo.filename ?? `Photo ${index + 1}`)}</a>`
                : escapeHtml(photo.filename ?? `Photo ${index + 1}`)
            )
            .join('<br />')
        : '—',
    ])
  );
}

function buildDetailTable(title: string, headers: string[], rows: string[][]) {
  return `
    <section>
      <h2>${escapeHtml(title)}</h2>
      ${
        rows.length === 0
          ? '<p class="empty">None logged.</p>'
          : `<table class="detail">
              <thead><tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join('')}</tr></thead>
              <tbody>${rows
                .map(
                  (row) => `
                    <tr>${row.map((cell) => `<td>${cell}</td>`).join('')}</tr>
                  `
                )
                .join('')}</tbody>
            </table>`
      }
    </section>
  `;
}

function buildPrintableReportHtml(reportHtml: string, fileBaseName: string): string {
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
          .report {
            background: #fffdf8;
            border: 1px solid #d8d2c6;
            border-radius: 14px;
            margin: 0 auto;
            max-width: 920px;
            padding: 32px;
          }
          header {
            align-items: flex-start;
            display: flex;
            justify-content: space-between;
            gap: 24px;
            margin-bottom: 28px;
          }
          .eyebrow {
            color: #667382;
            font-size: 13px;
            font-weight: 800;
            letter-spacing: 0;
            margin-bottom: 6px;
            text-transform: uppercase;
          }
          h1 {
            font-size: 34px;
            margin: 0;
          }
          h2 {
            border-bottom: 1px solid #ece6da;
            font-size: 20px;
            margin: 28px 0 12px;
            padding-bottom: 8px;
          }
          p {
            line-height: 1.45;
            margin: 0;
          }
          .date {
            color: #667382;
            font-weight: 700;
            text-align: right;
          }
          table {
            border-collapse: collapse;
            width: 100%;
          }
          th, td {
            border-bottom: 1px solid #ece6da;
            font-size: 13px;
            padding: 9px 7px;
            text-align: left;
            vertical-align: top;
          }
          th {
            color: #667382;
            font-weight: 800;
          }
          a {
            color: #294b38;
            font-weight: 700;
          }
          .empty {
            color: #667382;
            font-weight: 700;
          }
          @media print {
            body {
              background: #ffffff;
              padding: 0;
            }
            .report {
              border: 0;
              border-radius: 0;
              max-width: none;
            }
          }
        </style>
      </head>
      <body>${reportHtml}</body>
    </html>
  `;
}

function printHtmlFromIframe(html: string): void {
  const documentRef = globalThis.document;

  if (!documentRef) {
    throw new Error('Document is unavailable.');
  }

  const iframe = documentRef.createElement('iframe');
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
    documentRef.body.removeChild(iframe);
  }, 1000);
}

function getOtherEstimatedCost(job: Job): number | null {
  if (job.estimatedSubCost == null && job.estimatedMiscCost == null) {
    return null;
  }

  return (job.estimatedSubCost ?? 0) + (job.estimatedMiscCost ?? 0);
}

function formatOptionalCurrency(value: number | null | undefined): string {
  return value == null ? '—' : formatCurrency(value);
}

function formatOptionalNumber(value: number | null | undefined): string {
  return value == null ? '—' : formatNumber(value);
}

function formatLaborTime(totalMinutes: number): string {
  if (totalMinutes < 60) {
    const roundedMinutes = Math.max(1, Math.round(totalMinutes));
    return `${roundedMinutes} min`;
  }

  const hours = totalMinutes / 60;
  const formattedHours = new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 2,
  }).format(hours);

  return `${formattedHours} hrs`;
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

function formatDate(date: string | Date | null | undefined): string {
  if (!date) {
    return '—';
  }

  const parsedDate = typeof date === 'string' ? new Date(date) : date;

  if (Number.isNaN(parsedDate.getTime())) {
    return '—';
  }

  return new Intl.DateTimeFormat('en-US', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(parsedDate);
}

function formatStatus(value: string): string {
  return value
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function formatExpenseType(value: string): string {
  return formatStatus(value);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
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
  primaryButton: {
    ...buttonStyles.primary.container,
    borderRadius: radii.button,
    minHeight: 48,
  },
  primaryButtonText: {
    ...buttonStyles.primary.text,
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
    fontWeight: '700',
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
  report: {
    backgroundColor: colors.cardBackground,
    borderColor: colors.standardBorder,
    borderRadius: radii.card,
    borderWidth: 1,
    gap: 20,
    padding: 18,
  },
  reportHeader: {
    gap: 4,
  },
  reportEyebrow: {
    color: colors.mutedText,
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0,
    textTransform: 'uppercase',
  },
  reportTitle: {
    color: colors.text,
    fontSize: 26,
    fontWeight: '900',
    lineHeight: 32,
  },
  reportGenerated: {
    color: colors.mutedText,
    fontSize: 14,
    fontWeight: '700',
  },
  section: {
    gap: 8,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 19,
    fontWeight: '900',
  },
  infoRow: {
    alignItems: 'flex-start',
    borderTopColor: '#ECE6DA',
    borderTopWidth: 1,
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
    paddingTop: 9,
  },
  infoLabel: {
    color: colors.mutedText,
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
  },
  infoValue: {
    color: colors.text,
    flex: 1,
    fontSize: 14,
    fontWeight: '900',
    textAlign: 'right',
  },
  emptyText: {
    color: colors.mutedText,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
  },
  dataItem: {
    alignItems: 'flex-start',
    borderTopColor: '#ECE6DA',
    borderTopWidth: 1,
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
    paddingTop: 10,
  },
  dataText: {
    flex: 1,
    gap: 3,
  },
  dataTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '900',
    lineHeight: 19,
  },
  dataDetail: {
    color: colors.mutedText,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18,
  },
  dataMeta: {
    color: colors.primaryGreen,
    fontSize: 12,
    fontWeight: '800',
    lineHeight: 17,
  },
  dataValue: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '900',
  },
});
