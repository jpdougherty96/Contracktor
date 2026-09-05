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
import { parseDateForDisplay } from '@/src/lib/localDate';
import { createAndSharePdf, sanitizePdfFileName } from '@/src/lib/pdfExport';
import { getUserFacingError } from '@/src/lib/userFacingError';
import { buttonStyles, colors, radii } from '@/src/styles/theme';
import type { Job } from '@/src/types/job';

type JobReportScreenProps = {
  job: Job;
  onBack: () => void;
};

type ReceiptExpenseGroup = {
  categoryTotals: { amount: number; category: string }[];
  date: string;
  expenses: JobReportExpense[];
  id: string;
  total: number;
  vendor: string;
};

type ReceiptPhotoItem = {
  amount: number;
  date: string;
  id: string;
  imageUrl: string;
  vendor: string;
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
          setErrorMessage(getUserFacingError(error, 'Unable to build job report. Try again.'));
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
      const fileBaseName = `${job.name} Report`;
      const documentHtml = buildPrintableReportHtml(html, fileBaseName);

      if (Platform.OS === 'web') {
        downloadReportPdf(job, report, summary, fileBaseName);
        return;
      }

      const result = await createAndSharePdf({
        dialogTitle: 'Share job report PDF',
        fileBaseName,
        html: documentHtml,
      });
      setMessage(result.didOpen ? 'Job report PDF opened.' : 'Job report PDF saved.');
    } catch {
      setMessage('Unable to export job report PDF.');
    }
  };

  const handleExportReceiptPhotos = async () => {
    setMessage(null);

    try {
      const receiptPhotos = getReceiptPhotoItems(report.expenses);

      if (receiptPhotos.length === 0) {
        setMessage('No receipt photos to export.');
        return;
      }

      const fileBaseName = `${job.name} Receipt Photos`;
      const receiptPhotosHtml = buildPrintableReceiptPhotosHtml(
        buildReceiptPhotosHtml(job, receiptPhotos),
        fileBaseName
      );

      if (Platform.OS === 'web') {
        printHtmlFromIframe(receiptPhotosHtml);
        return;
      }

      const result = await createAndSharePdf({
        dialogTitle: 'Share receipt photos PDF',
        fileBaseName,
        html: receiptPhotosHtml,
      });
      setMessage(result.didOpen ? 'Receipt photos PDF opened.' : 'Receipt photos PDF saved.');
    } catch {
      setMessage('Unable to export receipt photos.');
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
          <Pressable style={styles.secondaryButton} onPress={handleExportReceiptPhotos}>
            <Text style={styles.secondaryButtonText}>Export receipt photos</Text>
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

          <SummarySection job={job} summary={summary} />

          <Section title="Job info">
            <InfoRow label="Client" value={job.clientName} />
            <InfoRow label="Location" value={formatLocation(job.location)} />
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
            <InfoRow label="Labor hour budget" value={formatOptionalLaborBudget(job.estimatedLaborHours)} />
            <InfoRow label="Hourly rate" value={formatOptionalCurrency(job.hourlyRate)} />
            <InfoRow
              label="Other estimated costs"
              value={formatOptionalCurrency(getOtherEstimatedCost(job))}
            />
          </Section>

          <ReceiptSection expenses={report.expenses} />

          <DataSection
            emptyText="None logged."
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
            emptyText="None logged."
            items={report.payments.map((payment) => ({
              detail: [payment.method, payment.note].filter(Boolean).join(' · ') || undefined,
              title: formatDate(payment.payment_date),
              value: formatCurrency(payment.amount),
            }))}
            title="Payments"
          />

          <DataSection
            emptyText="None logged."
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

function SummarySection({
  job,
  summary,
}: {
  job: Job;
  summary: ReturnType<typeof getReportSummary>;
}) {
  const rows = [
    ['Receipts / expenses', formatCurrency(summary.totalReceipts)],
    ['Total labor time', formatLaborTime(summary.totalLaborMinutes)],
    ['Total labor value', formatCurrency(summary.totalLaborValue)],
    ['Payments received', formatCurrency(summary.totalPayments)],
    [getBalanceLabel(job), formatCurrency(summary.balance)],
  ] as const;

  return (
    <View style={styles.summarySection}>
      <Text style={styles.sectionTitle}>Summary</Text>
      <View style={styles.summaryGrid}>
        {rows.map(([label, value], index) => {
          const isBalance = index === rows.length - 1;

          return (
          <View key={label} style={[styles.summaryItem, isBalance && styles.balanceSummaryItem]}>
            <Text style={[styles.summaryLabel, isBalance && styles.balanceSummaryText]}>{label}</Text>
            <Text style={[styles.summaryValue, isBalance && styles.balanceSummaryValue]}>{value}</Text>
          </View>
          );
        })}
      </View>
    </View>
  );
}

function ReceiptSection({ expenses }: { expenses: JobReportExpense[] }) {
  const hasReceiptFiles = expenses.some((expense) => expense.receiptImageUrl);
  const groups = groupExpensesByDateAndVendor(expenses);

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Receipts / expenses</Text>
      {hasReceiptFiles ? <Text style={styles.sectionNote}>Receipt files available in conTRACKtor.</Text> : null}
      {groups.length === 0 ? <Text style={styles.emptyText}>None logged.</Text> : null}
      {groups.map((group) => (
        <View key={group.id} style={styles.receiptGroup}>
          <View style={styles.receiptGroupHeader}>
            <View style={styles.receiptGroupText}>
              <Text style={styles.receiptTitle}>
                {formatDate(group.date)} · {group.vendor}
              </Text>
              <Text style={styles.receiptCategoryTotals}>{formatCategoryTotals(group.categoryTotals)}</Text>
            </View>
            <Text style={styles.receiptAmount}>Total: {formatCurrency(group.total)}</Text>
          </View>
          {group.expenses.map((expense) => (
            <Text key={expense.id} style={styles.receiptLineItem}>
              - {expense.description} · {formatExpenseType(expense.expense_type)} ·{' '}
              {formatCurrency(expense.total_amount)}
              {expense.source_type === 'manual' ? ' · No receipt attached' : ''}
            </Text>
          ))}
        </View>
      ))}
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
      ${buildSummaryTable(job, summary)}
      ${buildInfoTable('Job info', [
        ['Client', job.clientName],
        ['Location', formatLocation(job.location)],
        ['Job type', job.jobType === 'time_and_materials' ? 'Time & materials' : 'Fixed bid'],
        ['Status', formatStatus(job.status)],
        ['Created', formatDate(job.createdAt)],
      ])}
      ${buildInfoTable('Budget / quote', [
        ...(job.jobType === 'fixed_bid' ? ([['Quote amount', formatCurrency(job.quoteAmount)]] as [string, string][]) : []),
        ['Material budget', formatOptionalCurrency(job.estimatedMaterialCost)],
        ['Labor hour budget', formatOptionalLaborBudget(job.estimatedLaborHours)],
        ['Hourly rate', formatOptionalCurrency(job.hourlyRate)],
        ['Other estimated costs', formatOptionalCurrency(getOtherEstimatedCost(job))],
      ])}
      ${buildExpenseTable(report.expenses)}
      ${buildLaborTable(report.hours)}
      ${buildPaymentTable(report.payments)}
      ${buildNotesTable(report.notes)}
      <footer>Generated by conTRACKtor · ${escapeHtml(formatDate(new Date()))}</footer>
    </main>
  `;
}

function buildSummaryTable(job: Job, summary: ReturnType<typeof getReportSummary>) {
  return `
    <section>
      <h2>Summary</h2>
      <table class="summary-table">
        ${[
          ['Receipts / expenses', formatCurrency(summary.totalReceipts)],
          ['Total labor time', formatLaborTime(summary.totalLaborMinutes)],
          ['Total labor value', formatCurrency(summary.totalLaborValue)],
          ['Payments received', formatCurrency(summary.totalPayments)],
          [getBalanceLabel(job), formatCurrency(summary.balance)],
        ]
          .map(
            ([label, value]) => `
              <tr><th>${escapeHtml(label)}</th><td>${escapeHtml(value)}</td></tr>
            `
          )
          .join('')}
      </table>
    </section>
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
  const hasReceiptFiles = expenses.some((expense) => expense.receiptImageUrl);
  const groups = groupExpensesByDateAndVendor(expenses);

  return `
    <section>
      <h2>Receipts / expenses</h2>
      ${hasReceiptFiles ? '<p class="section-note">Receipt files available in conTRACKtor.</p>' : ''}
      ${
        groups.length === 0
          ? '<p class="empty">None logged.</p>'
          : groups
              .map(
                (group) => `
                  <div class="receipt-group">
                    <div class="receipt-group-header">
                      <div>
                        <strong>${escapeHtml(formatDate(group.date))} · ${escapeHtml(group.vendor)}</strong>
                        <span>${escapeHtml(formatCategoryTotals(group.categoryTotals))}</span>
                      </div>
                      <strong>Total: ${escapeHtml(formatCurrency(group.total))}</strong>
                    </div>
                    <ul>
                      ${group.expenses
                        .map(
                          (expense) => `
                            <li>${escapeHtml(expense.description)} · ${escapeHtml(
                              formatExpenseType(expense.expense_type)
                            )} · ${escapeHtml(formatCurrency(expense.total_amount))}${expense.source_type === 'manual' ? ' · No receipt attached' : ''}</li>
                          `
                        )
                        .join('')}
                    </ul>
                  </div>
                `
              )
              .join('')
      }
    </section>
  `;
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
          .summary-table {
            background: #f8f4eb;
            border: 1px solid #e2dacb;
            border-radius: 10px;
            border-collapse: separate;
            border-spacing: 0;
            overflow: hidden;
          }
          .summary-table th,
          .summary-table td {
            font-size: 15px;
            padding: 12px 14px;
          }
          .summary-table td {
            font-size: 16px;
            font-weight: 900;
            text-align: right;
          }
          a {
            color: #294b38;
            font-weight: 700;
          }
          .empty {
            color: #667382;
            font-weight: 700;
          }
          .section-note {
            color: #667382;
            font-size: 12px;
            font-weight: 700;
            margin: -4px 0 10px;
          }
          .compact-detail td:first-child {
            width: auto;
          }
          .compact-detail td:last-child {
            font-weight: 900;
            text-align: right;
            white-space: nowrap;
            width: 110px;
          }
          .compact-detail strong,
          .compact-detail span {
            display: block;
          }
          .compact-detail span {
            color: #667382;
            font-size: 12px;
            font-weight: 700;
            margin-top: 3px;
          }
          .receipt-group {
            border-top: 1px solid #ece6da;
            padding: 10px 0 8px;
          }
          .receipt-group-header {
            align-items: flex-start;
            display: flex;
            gap: 18px;
            justify-content: space-between;
          }
          .receipt-group-header span {
            color: #667382;
            display: block;
            font-size: 12px;
            font-weight: 700;
            margin-top: 3px;
          }
          .receipt-group ul {
            color: #202629;
            font-size: 12px;
            line-height: 1.35;
            margin: 7px 0 0;
            padding-left: 18px;
          }
          .receipt-group li {
            margin: 0 0 3px;
          }
          footer {
            border-top: 1px solid #ece6da;
            color: #667382;
            font-size: 12px;
            font-weight: 700;
            margin-top: 28px;
            padding-top: 12px;
          }
          @page {
            margin: 0;
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

function buildReceiptPhotosHtml(job: Job, receiptPhotos: ReceiptPhotoItem[]): string {
  return `
    <main class="receipt-photos">
      <header>
        <p class="eyebrow">Receipt photos</p>
        <h1>${escapeHtml(job.name)}</h1>
        <p>Generated ${escapeHtml(formatDate(new Date()))}</p>
      </header>
      ${receiptPhotos
        .map(
          (receiptPhoto) => `
            <section class="receipt-photo">
              <h2>${escapeHtml(formatDate(receiptPhoto.date))} · ${escapeHtml(
                receiptPhoto.vendor
              )} · ${escapeHtml(formatCurrency(receiptPhoto.amount))}</h2>
              <img src="${escapeHtml(receiptPhoto.imageUrl)}" alt="Receipt from ${escapeHtml(
                receiptPhoto.vendor
              )}" />
            </section>
          `
        )
        .join('')}
      <footer>Generated by conTRACKtor · ${escapeHtml(formatDate(new Date()))}</footer>
    </main>
  `;
}

function buildPrintableReceiptPhotosHtml(receiptPhotosHtml: string, fileBaseName: string): string {
  return `
    <!doctype html>
    <html>
      <head>
        <title>${escapeHtml(sanitizePdfFileName(fileBaseName))}</title>
        <style>
          body {
            background: #ffffff;
            color: #202629;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
            margin: 0;
            padding: 32px;
          }
          .receipt-photos {
            margin: 0 auto;
            max-width: 760px;
          }
          header {
            margin-bottom: 28px;
          }
          .eyebrow {
            color: #667382;
            font-size: 13px;
            font-weight: 800;
            letter-spacing: 0;
            margin: 0 0 6px;
            text-transform: uppercase;
          }
          h1 {
            font-size: 34px;
            margin: 0 0 4px;
          }
          h2 {
            border-bottom: 1px solid #ece6da;
            font-size: 16px;
            margin: 0 0 14px;
            padding-bottom: 8px;
          }
          p {
            color: #667382;
            font-weight: 700;
            margin: 0;
          }
          .receipt-photo {
            break-inside: avoid;
            margin-bottom: 28px;
            page-break-inside: avoid;
          }
          img {
            border: 1px solid #d8d2c6;
            display: block;
            height: auto;
            max-height: 860px;
            max-width: 100%;
            object-fit: contain;
            width: 100%;
          }
          footer {
            border-top: 1px solid #ece6da;
            color: #667382;
            font-size: 12px;
            font-weight: 700;
            margin-top: 28px;
            padding-top: 12px;
          }
        </style>
      </head>
      <body>${receiptPhotosHtml}</body>
    </html>
  `;
}

function downloadReportPdf(
  job: Job,
  report: JobReportData,
  summary: ReturnType<typeof getReportSummary>,
  fileBaseName: string
): void {
  const documentRef = globalThis.document;

  if (!documentRef) {
    throw new Error('Document is unavailable.');
  }

  const pdfBytes = buildReportPdf(job, report, summary);
  const pdfBuffer = new ArrayBuffer(pdfBytes.byteLength);
  new Uint8Array(pdfBuffer).set(pdfBytes);
  const blob = new Blob([pdfBuffer], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const anchor = documentRef.createElement('a');

  anchor.href = url;
  anchor.download = `${sanitizePdfFileName(fileBaseName)}.pdf`;
  documentRef.body.appendChild(anchor);
  anchor.click();
  documentRef.body.removeChild(anchor);

  window.setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 1000);
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

function buildReportPdf(
  job: Job,
  report: JobReportData,
  summary: ReturnType<typeof getReportSummary>
): Uint8Array {
  const pageWidth = 612;
  const pageHeight = 792;
  const margin = 54;
  const contentWidth = pageWidth - margin * 2;
  const bottomMargin = 58;
  const generatedDate = formatDate(new Date());
  const pages: string[][] = [];
  let commands: string[] = [];
  let y = pageHeight - margin;

  const pushPage = (includeFooter = false) => {
    if (commands.length > 0) {
      if (includeFooter) {
        commands.push(setStrokeColor('#ece6da'), `0.7 w`, `${margin} 42 m ${pageWidth - margin} 42 l S`);
        addRawText(`Generated by conTRACKtor | ${generatedDate}`, margin, 28, 9, '#667382');
      }
      pages.push(commands);
    }

    commands = [];
    y = pageHeight - margin;
  };

  const ensureSpace = (height: number) => {
    if (y - height < bottomMargin) {
      pushPage();
    }
  };

  const addRawText = (
    text: string,
    x: number,
    textY: number,
    size: number,
    color = '#202629',
    font = 'F1'
  ) => {
    commands.push(
      `${setFillColor(color)} BT /${font} ${size} Tf ${formatPdfNumber(x)} ${formatPdfNumber(
        textY
      )} Td (${escapePdfText(text)}) Tj ET`
    );
  };

  const addText = (
    text: string,
    options: { color?: string; font?: string; maxWidth?: number; size?: number; x?: number } = {}
  ) => {
    const size = options.size ?? 11;
    const x = options.x ?? margin;
    const lines = wrapPdfText(text, options.maxWidth ?? contentWidth, size);
    ensureSpace(lines.length * (size + 4));

    lines.forEach((line) => {
      addRawText(line, x, y, size, options.color, options.font);
      y -= size + 4;
    });
  };

  const addSectionTitle = (title: string) => {
    ensureSpace(34);
    y -= 18;
    addRawText(title.toUpperCase(), margin, y, 14, '#202629', 'F2');
    y -= 10;
    commands.push(setStrokeColor('#e2dacb'), `0.7 w`, `${margin} ${y} m ${pageWidth - margin} ${y} l S`);
    y -= 18;
  };

  const addKeyValueRows = (rows: [string, string][], isSummary = false) => {
    rows.forEach(([label, value]) => {
      ensureSpace(isSummary ? 34 : 24);
      if (isSummary) {
        commands.push(setFillColor('#f8f4eb'), `${margin} ${y - 20} ${contentWidth} 28 re f`);
      }
      addRawText(label, margin + 8, y - 10, isSummary ? 11 : 10, '#202629', 'F2');
      addRawText(
        value,
        pageWidth - margin - estimatePdfTextWidth(value, isSummary ? 12 : 10),
        y - 10,
        isSummary ? 12 : 10,
        '#202629',
        isSummary ? 'F2' : 'F1'
      );
      y -= isSummary ? 30 : 24;
    });
  };

  const addDetailRows = (
    title: string,
    rows: { amount?: string; detail?: string; meta?: string; title: string }[]
  ) => {
    addSectionTitle(title);

    if (rows.length === 0) {
      addText('None logged.', { color: '#667382', font: 'F2', size: 10 });
      return;
    }

    rows.forEach((row) => {
      ensureSpace(56);
      addRawText(row.title, margin, y, 10, '#202629', 'F2');
      if (row.amount) {
        addRawText(row.amount, pageWidth - margin - estimatePdfTextWidth(row.amount, 10), y, 10, '#202629', 'F2');
      }
      y -= 15;
      if (row.detail) {
        addText(row.detail, { color: '#667382', maxWidth: contentWidth - 80, size: 9 });
      }
      if (row.meta) {
        addText(row.meta, { color: '#294b38', maxWidth: contentWidth - 80, size: 9 });
      }
      commands.push(setStrokeColor('#ece6da'), `0.5 w`, `${margin} ${y - 2} m ${pageWidth - margin} ${y - 2} l S`);
      y -= 14;
    });
  };

  const addReceiptRows = (expenses: JobReportExpense[]) => {
    const groups = groupExpensesByDateAndVendor(expenses);

    addSectionTitle('Receipts / expenses');

    if (expenses.some((expense) => expense.receiptImageUrl)) {
      addText('Receipt files available in conTRACKtor.', { color: '#667382', font: 'F2', size: 9 });
      y -= 4;
    }

    if (groups.length === 0) {
      addText('None logged.', { color: '#667382', font: 'F2', size: 10 });
      return;
    }

    groups.forEach((group) => {
      const total = `Total ${formatCurrency(group.total)}`;
      ensureSpace(54 + group.expenses.length * 13);
      addRawText(`${formatDate(group.date)} | ${group.vendor}`, margin, y, 10, '#202629', 'F2');
      addRawText(total, pageWidth - margin - estimatePdfTextWidth(total, 10), y, 10, '#202629', 'F2');
      y -= 13;
      addText(formatCategoryTotals(group.categoryTotals), {
        color: '#667382',
        font: 'F2',
        maxWidth: contentWidth - 90,
        size: 9,
      });
      y -= 2;

      group.expenses.forEach((expense) => {
        addText(
          `- ${expense.description} | ${formatExpenseType(expense.expense_type)} | ${formatCurrency(
            expense.total_amount
          )}${expense.source_type === 'manual' ? ' | No receipt attached' : ''}`,
          { color: '#202629', maxWidth: contentWidth - 18, size: 9, x: margin + 10 }
        );
      });

      commands.push(setStrokeColor('#ece6da'), `0.5 w`, `${margin} ${y - 2} m ${pageWidth - margin} ${y - 2} l S`);
      y -= 10;
    });
  };

  addText('JOB REPORT', { color: '#202629', font: 'F2', size: 12 });
  y -= 8;
  addText(job.name, { color: '#202629', font: 'F2', size: 28 });
  addText(`Generated ${generatedDate}`, { color: '#667382', size: 12 });

  addSectionTitle('Summary');
  addKeyValueRows(
    [
      ['Receipts / expenses', formatCurrency(summary.totalReceipts)],
      ['Total labor time', formatLaborTime(summary.totalLaborMinutes)],
      ['Total labor value', formatCurrency(summary.totalLaborValue)],
      ['Payments received', formatCurrency(summary.totalPayments)],
      [getBalanceLabel(job), formatCurrency(summary.balance)],
    ],
    true
  );

  addSectionTitle('Job info');
  addKeyValueRows([
    ['Client', job.clientName],
    ['Location', formatLocation(job.location)],
    ['Job type', job.jobType === 'time_and_materials' ? 'Time & materials' : 'Fixed bid'],
    ['Status', formatStatus(job.status)],
    ['Created', formatDate(job.createdAt)],
  ]);

  addSectionTitle('Budget / quote');
  addKeyValueRows([
    ...(job.jobType === 'fixed_bid' ? ([['Quote amount', formatCurrency(job.quoteAmount)]] as [string, string][]) : []),
    ['Material budget', formatOptionalCurrency(job.estimatedMaterialCost)],
    ['Labor hour budget', formatOptionalLaborBudget(job.estimatedLaborHours)],
    ['Hourly rate', formatOptionalCurrency(job.hourlyRate)],
    ['Other estimated costs', formatOptionalCurrency(getOtherEstimatedCost(job))],
  ]);

  addReceiptRows(report.expenses);

  addDetailRows(
    'Labor',
    report.hours.map((entry) => ({
      amount: formatCurrency((entry.duration_minutes / 60) * entry.hourly_rate),
      detail: `${formatLaborTime(entry.duration_minutes)} at ${formatCurrency(entry.hourly_rate)}/hr${
        entry.description ? ` · ${entry.description}` : ''
      }`,
      title: `${formatDate(entry.work_date)} · ${entry.worker_name ?? 'Labor'}`,
    }))
  );

  addDetailRows(
    'Payments',
    report.payments.map((payment) => ({
      amount: formatCurrency(payment.amount),
      detail: [payment.method, payment.note].filter(Boolean).join(' · ') || undefined,
      title: formatDate(payment.payment_date),
    }))
  );

  addDetailRows(
    'Notes',
    report.notes.map((note) => ({
      detail: note.note,
      meta:
        note.photos.length > 0
          ? `${note.photos.length} photo${note.photos.length === 1 ? '' : 's'} attached`
          : undefined,
      title: formatDate(note.created_at),
    }))
  );

  pushPage(true);

  return writePdf(pages, pageWidth, pageHeight);
}

function getOtherEstimatedCost(job: Job): number | null {
  if (job.estimatedSubCost == null && job.estimatedMiscCost == null) {
    return null;
  }

  return (job.estimatedSubCost ?? 0) + (job.estimatedMiscCost ?? 0);
}

function groupExpensesByDateAndVendor(expenses: JobReportExpense[]): ReceiptExpenseGroup[] {
  const groups = new Map<string, ReceiptExpenseGroup>();

  expenses.forEach((expense) => {
    const date = expense.expense_date;
    const vendor = expense.vendor?.trim() || (expense.source_type === 'manual' ? 'Manual expense' : 'No vendor');
    const key = `${date}::${vendor.toLocaleLowerCase()}`;
    const existingGroup = groups.get(key);

    if (existingGroup) {
      existingGroup.expenses.push(expense);
      existingGroup.total += expense.total_amount;
      return;
    }

    groups.set(key, {
      categoryTotals: [],
      date,
      expenses: [expense],
      id: key,
      total: expense.total_amount,
      vendor,
    });
  });

  return Array.from(groups.values()).map((group) => {
    const categoryTotals = new Map<string, number>();

    group.expenses.forEach((expense) => {
      const category = formatExpenseType(expense.expense_type);
      categoryTotals.set(category, (categoryTotals.get(category) ?? 0) + expense.total_amount);
    });

    return {
      ...group,
      categoryTotals: Array.from(categoryTotals.entries()).map(([category, amount]) => ({
        amount,
        category,
      })),
      total: roundCurrency(group.total),
    };
  });
}

function getReceiptPhotoItems(expenses: JobReportExpense[]): ReceiptPhotoItem[] {
  const receiptPhotos = new Map<string, ReceiptPhotoItem>();

  expenses.forEach((expense) => {
    if (!expense.receiptImageUrl) {
      return;
    }

    const id = expense.receipt_id ?? expense.receiptImageUrl;
    const existingReceiptPhoto = receiptPhotos.get(id);

    if (existingReceiptPhoto) {
      existingReceiptPhoto.amount += expense.total_amount;
      return;
    }

    receiptPhotos.set(id, {
      amount: expense.total_amount,
      date: expense.expense_date,
      id,
      imageUrl: expense.receiptImageUrl,
      vendor: expense.vendor?.trim() || 'No vendor',
    });
  });

  return Array.from(receiptPhotos.values()).map((receiptPhoto) => ({
    ...receiptPhoto,
    amount: roundCurrency(receiptPhoto.amount),
  }));
}

function formatCategoryTotals(categoryTotals: ReceiptExpenseGroup['categoryTotals']): string {
  return categoryTotals
    .map(({ amount, category }) => `${category} ${formatCurrency(amount)}`)
    .join(' · ');
}

function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100;
}

function getBalanceLabel(job: Job): string {
  return job.jobType === 'fixed_bid' ? 'Balance due' : 'Billable amount';
}

function formatLocation(value: string | null | undefined): string {
  if (!value) {
    return '—';
  }

  const normalized = value
    .replace(/\s*,\s*/g, ', ')
    .replace(/\s{2,}/g, ' ')
    .trim();

  return normalized.replace(
    /\b(Ave|Avenue|St|Street|Rd|Road|Dr|Drive|Ln|Lane|Blvd|Boulevard|Ct|Court|Way|Pkwy|Parkway|Hwy|Highway|Trail)\s+([^,]+,\s*[A-Z]{2}\s+\d{5}(?:-\d{4})?)$/i,
    '$1, $2'
  );
}

function formatOptionalCurrency(value: number | null | undefined): string {
  return value == null ? '—' : formatCurrency(value);
}

function formatOptionalLaborBudget(value: number | null | undefined): string {
  return value == null ? '—' : `${formatNumber(value)} hrs`;
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

  const parsedDate = typeof date === 'string' ? parseDateForDisplay(date) : date;

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

function writePdf(pages: string[][], pageWidth: number, pageHeight: number): Uint8Array {
  const objects: string[] = [];
  const pageObjectIds: number[] = [];
  const fontRegularId = 3;
  const fontBoldId = 4;

  objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  objects[fontRegularId] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';
  objects[fontBoldId] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>';

  pages.forEach((pageCommands, index) => {
    const pageId = 5 + index * 2;
    const contentId = pageId + 1;
    const content = pageCommands.join('\n');
    pageObjectIds.push(pageId);
    objects[pageId] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 ${fontRegularId} 0 R /F2 ${fontBoldId} 0 R >> >> /Contents ${contentId} 0 R >>`;
    objects[contentId] = `<< /Length ${content.length} >>\nstream\n${content}\nendstream`;
  });

  objects[2] = `<< /Type /Pages /Kids [${pageObjectIds
    .map((id) => `${id} 0 R`)
    .join(' ')}] /Count ${pageObjectIds.length} >>`;

  let pdf = '%PDF-1.4\n';
  const offsets = [0];

  for (let id = 1; id < objects.length; id += 1) {
    if (!objects[id]) {
      continue;
    }

    offsets[id] = pdf.length;
    pdf += `${id} 0 obj\n${objects[id]}\nendobj\n`;
  }

  const xrefStart = pdf.length;
  pdf += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;

  for (let id = 1; id < objects.length; id += 1) {
    pdf += `${String(offsets[id] ?? 0).padStart(10, '0')} 00000 n \n`;
  }

  pdf += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;

  return new TextEncoder().encode(pdf);
}

function wrapPdfText(text: string, maxWidth: number, size: number): string[] {
  const words = sanitizePdfText(text).split(/\s+/).filter(Boolean);
  const maxCharacters = Math.max(12, Math.floor(maxWidth / (size * 0.52)));
  const lines: string[] = [];
  let currentLine = '';

  words.forEach((word) => {
    const nextLine = currentLine ? `${currentLine} ${word}` : word;

    if (nextLine.length <= maxCharacters) {
      currentLine = nextLine;
      return;
    }

    if (currentLine) {
      lines.push(currentLine);
    }

    currentLine = word;
  });

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines.length > 0 ? lines : [''];
}

function estimatePdfTextWidth(text: string, size: number): number {
  return sanitizePdfText(text).length * size * 0.52;
}

function escapePdfText(value: string): string {
  return sanitizePdfText(value).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

function sanitizePdfText(value: string): string {
  return value
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/·/g, '|')
    .replace(/—/g, '-')
    .replace(/–/g, '-')
    .replace(/[^\x20-\x7E]/g, '');
}

function setFillColor(hex: string): string {
  const [red, green, blue] = hexToRgb(hex);
  return `${red} ${green} ${blue} rg`;
}

function setStrokeColor(hex: string): string {
  const [red, green, blue] = hexToRgb(hex);
  return `${red} ${green} ${blue} RG`;
}

function hexToRgb(hex: string): [string, string, string] {
  const normalized = hex.replace('#', '');
  const red = parseInt(normalized.slice(0, 2), 16) / 255;
  const green = parseInt(normalized.slice(2, 4), 16) / 255;
  const blue = parseInt(normalized.slice(4, 6), 16) / 255;

  return [formatPdfNumber(red), formatPdfNumber(green), formatPdfNumber(blue)];
}

function formatPdfNumber(value: number): string {
  return Number(value.toFixed(3)).toString();
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
  secondaryButton: {
    alignItems: 'center',
    backgroundColor: colors.cardBackground,
    borderColor: colors.primaryGreen,
    borderRadius: radii.button,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: 18,
  },
  secondaryButtonText: {
    color: colors.primaryGreen,
    fontSize: 16,
    fontWeight: '900',
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
  summarySection: {
    gap: 10,
  },
  summaryGrid: {
    backgroundColor: '#F8F4EB',
    borderColor: colors.standardBorder,
    borderRadius: 10,
    borderWidth: 1,
    overflow: 'hidden',
  },
  summaryItem: {
    alignItems: 'flex-start',
    borderTopColor: '#ECE6DA',
    borderTopWidth: 1,
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  summaryLabel: {
    color: colors.mutedText,
    flex: 1,
    fontSize: 14,
    fontWeight: '800',
  },
  summaryValue: {
    color: colors.text,
    flex: 1,
    fontSize: 16,
    fontWeight: '900',
    textAlign: 'right',
  },
  balanceSummaryItem: {
    backgroundColor: '#EEF4EF',
    paddingVertical: 14,
  },
  balanceSummaryText: {
    color: colors.text,
    fontSize: 16,
  },
  balanceSummaryValue: {
    color: colors.primaryGreen,
    fontSize: 20,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 19,
    fontWeight: '900',
  },
  sectionNote: {
    color: colors.mutedText,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 17,
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
  receiptGroup: {
    borderTopColor: '#ECE6DA',
    borderTopWidth: 1,
    gap: 6,
    paddingTop: 10,
  },
  receiptGroupHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'space-between',
  },
  receiptGroupText: {
    flex: 1,
    gap: 2,
  },
  receiptTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '900',
    lineHeight: 19,
  },
  receiptCategoryTotals: {
    color: colors.mutedText,
    fontSize: 12,
    fontWeight: '800',
    lineHeight: 17,
  },
  receiptAmount: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '900',
  },
  receiptLineItem: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 17,
    paddingLeft: 6,
  },
});
