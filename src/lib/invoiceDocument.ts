export type InvoiceDocumentLine = {
  label: string;
  meta?: string;
  value: number;
};

export type InvoiceDraftPresentationLine = InvoiceDocumentLine & {
  expenseIds?: string[];
  lineType: 'change_order' | 'fee' | 'fixed_scope' | 'labor' | 'material' | 'other';
  quantity: number;
  timeEntryIds?: string[];
  unit: string;
  unitRate: number;
};

export type InvoiceLaborSource = {
  duration_minutes: number;
  hourly_rate: number;
  id: string;
  invoice_id: string | null;
};

export type InvoiceExpenseSource = {
  billable: boolean;
  description: string;
  expense_date: string;
  expense_type: string;
  id: string;
  invoice_id: string | null;
  status: string;
  total_amount: number;
};

export type InvoiceDocumentInput = {
  balanceDue: number;
  billToLines: string[];
  dueDate: string | null;
  fileName: string;
  fromLines: string[];
  invoiceNumber: string;
  invoiceType: string;
  issueDate: string;
  lines: InvoiceDocumentLine[];
  note: string;
  paymentsReceived: number;
  subtotal: number;
  terms: string | null;
};

export function buildFixedBidInvoiceLines(contractAmount: number): InvoiceDraftPresentationLine[] {
  return [
    {
      label: 'Contract amount',
      lineType: 'fixed_scope',
      quantity: 1,
      unit: 'project',
      unitRate: contractAmount,
      value: contractAmount,
    },
  ];
}

export function buildTimeAndMaterialsInvoiceLines({
  expenseEntries,
  laborEntries,
  materialMarkupPercent,
}: {
  expenseEntries: InvoiceExpenseSource[];
  laborEntries: InvoiceLaborSource[];
  materialMarkupPercent: number;
}): InvoiceDraftPresentationLine[] {
  const unbilledLaborEntries = laborEntries.filter((entry) => !entry.invoice_id);
  const unbilledExpenseEntries = expenseEntries.filter(
    (entry) =>
      entry.billable &&
      !entry.invoice_id &&
      (entry.status === 'reviewed' || entry.status === 'billable')
  );
  const totalMinutes = unbilledLaborEntries.reduce(
    (sum, entry) => sum + entry.duration_minutes,
    0
  );
  const totalHours = totalMinutes / 60;
  const laborTotal = roundMoney(
    unbilledLaborEntries.reduce(
      (sum, entry) => sum + (entry.duration_minutes / 60) * entry.hourly_rate,
      0
    )
  );
  const distinctLaborRates = new Set(unbilledLaborEntries.map((entry) => entry.hourly_rate));
  const effectiveLaborRate = totalHours > 0 ? laborTotal / totalHours : 0;
  const expenseTotal = roundMoney(
    unbilledExpenseEntries.reduce((sum, entry) => sum + entry.total_amount, 0)
  );
  const materialFee = roundMoney(expenseTotal * (materialMarkupPercent / 100));
  const lines: InvoiceDraftPresentationLine[] = [];

  if (unbilledLaborEntries.length > 0) {
    const recordedRate = unbilledLaborEntries[0]?.hourly_rate ?? effectiveLaborRate;

    lines.push({
      label: 'Labor',
      lineType: 'labor',
      meta:
        distinctLaborRates.size === 1
          ? `${formatDurationMinutes(totalMinutes)} at ${formatCurrency(recordedRate)}/hr`
          : `${formatDurationMinutes(totalMinutes)} at recorded contract rates`,
      quantity: totalHours,
      timeEntryIds: unbilledLaborEntries.map((entry) => entry.id),
      unit: 'hours',
      unitRate: effectiveLaborRate,
      value: laborTotal,
    });
  }

  for (const entry of [...unbilledExpenseEntries].sort((left, right) =>
    left.expense_date.localeCompare(right.expense_date)
  )) {
    lines.push({
      expenseIds: [entry.id],
      label: entry.description.trim() || `${formatExpenseType(entry.expense_type)} expense`,
      lineType: 'material',
      meta: `${formatExpenseType(entry.expense_type)} - ${formatInvoiceDate(entry.expense_date)}`,
      quantity: 1,
      unit: 'item',
      unitRate: entry.total_amount,
      value: entry.total_amount,
    });
  }

  if (materialFee > 0) {
    lines.push({
      label: 'Material procurement & handling fee',
      lineType: 'fee',
      meta: `${formatNumber(materialMarkupPercent)}% contractual fee`,
      quantity: 1,
      unit: 'fee',
      unitRate: materialFee,
      value: materialFee,
    });
  }

  return lines;
}

export function buildInvoiceDocumentHtml(input: InvoiceDocumentInput): string {
  const lineRows = input.lines
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
  const paymentsRow =
    input.paymentsReceived > 0
      ? `<p><span>Payments received</span><strong>-${escapeHtml(
          formatCurrency(input.paymentsReceived)
        )}</strong></p>`
      : '';
  const dueDateLine = input.dueDate
    ? `<p class="due-date"><strong>Due ${escapeHtml(formatInvoiceDate(input.dueDate))}</strong></p>`
    : '';

  return `
    <!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>${escapeHtml(sanitizeDocumentTitle(input.fileName))}</title>
        <style>
          @page {
            size: Letter;
            margin: 0.42in;
          }

          * {
            box-sizing: border-box;
          }

          html,
          body {
            margin: 0;
            min-height: 0;
            padding: 0;
          }

          body {
            background: #f6f3ec;
            color: #202629;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
            padding: 24px;
          }

          .invoice {
            background: #fffdf8;
            border: 1px solid #d8d2c6;
            border-radius: 14px;
            margin: 0 auto;
            max-width: 720px;
            padding: 28px;
            width: 100%;
          }

          header {
            align-items: flex-start;
            display: flex;
            gap: 24px;
            justify-content: space-between;
            margin-bottom: 26px;
          }

          h1 {
            font-size: 34px;
            line-height: 1.1;
            margin: 0;
          }

          h2 {
            color: #667382;
            font-size: 11px;
            letter-spacing: 0.04em;
            margin: 0 0 7px;
            text-transform: uppercase;
          }

          p {
            font-size: 15px;
            line-height: 1.4;
            margin: 0;
          }

          .invoice-meta {
            margin-top: 6px;
          }

          .due-date {
            color: #294b38;
            margin-top: 4px;
          }

          .type {
            color: #294b38;
            font-weight: 800;
            text-align: right;
          }

          .party-grid {
            display: grid;
            gap: 28px;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            margin-bottom: 22px;
          }

          section {
            break-inside: avoid;
          }

          table {
            border-collapse: collapse;
            margin-bottom: 22px;
            width: 100%;
          }

          tr {
            break-inside: avoid;
            page-break-inside: avoid;
          }

          td {
            border-bottom: 1px solid #ece6da;
            font-size: 15px;
            padding: 13px 0;
            vertical-align: top;
          }

          td:first-child {
            padding-right: 18px;
          }

          td:last-child {
            font-weight: 800;
            text-align: right;
            white-space: nowrap;
          }

          td span {
            color: #667382;
            display: block;
            font-size: 12px;
            font-weight: 700;
            margin-top: 3px;
          }

          .totals {
            break-inside: avoid;
            margin: 0 0 22px auto;
            max-width: 340px;
          }

          .totals p {
            display: flex;
            gap: 20px;
            justify-content: space-between;
            padding: 5px 0;
          }

          .balance {
            border-top: 1px solid #ece6da;
            font-size: 19px;
            margin-top: 7px;
            padding-top: 12px !important;
          }

          .footer-sections {
            display: grid;
            gap: 22px;
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }

          @media print {
            html,
            body {
              background: #ffffff;
              height: auto;
              min-height: 0;
              width: auto;
            }

            body {
              padding: 0;
            }

            .invoice {
              background: #ffffff;
              border: 0;
              border-radius: 0;
              break-after: auto;
              margin: 0;
              max-width: none;
              padding: 0;
              page-break-after: auto;
              width: 100%;
            }
          }
        </style>
      </head>
      <body>
        <main class="invoice">
          <header>
            <div>
              <h1>Invoice</h1>
              <p class="invoice-meta">${escapeHtml(input.invoiceNumber)} - ${escapeHtml(
                formatInvoiceDate(input.issueDate)
              )}</p>
              ${dueDateLine}
            </div>
            <p class="type">${escapeHtml(input.invoiceType)}</p>
          </header>

          <div class="party-grid">
            <section>
              <h2>From</h2>
              ${input.fromLines.map((line) => `<p>${escapeHtml(line)}</p>`).join('')}
            </section>

            <section>
              <h2>Bill to</h2>
              ${input.billToLines.map((line) => `<p>${escapeHtml(line)}</p>`).join('')}
            </section>
          </div>

          <table aria-label="Invoice items">
            <tbody>${lineRows}</tbody>
          </table>

          <section class="totals">
            <p><span>Subtotal</span><strong>${escapeHtml(formatCurrency(input.subtotal))}</strong></p>
            ${paymentsRow}
            <p class="balance"><span>Balance due</span><strong>${escapeHtml(
              formatCurrency(input.balanceDue)
            )}</strong></p>
          </section>

          <div class="footer-sections">
            ${
              input.note
                ? `<section><h2>Note</h2><p>${escapeHtml(input.note)}</p></section>`
                : ''
            }
            ${
              input.terms
                ? `<section><h2>Terms</h2><p>${escapeHtml(input.terms)}</p></section>`
                : ''
            }
          </div>
        </main>
      </body>
    </html>
  `;
}

export function buildInvoiceDocumentText(input: InvoiceDocumentInput): string {
  return [
    'Invoice',
    `${input.invoiceNumber} - ${formatInvoiceDate(input.issueDate)}`,
    input.dueDate ? `Due ${formatInvoiceDate(input.dueDate)}` : '',
    '',
    'From',
    ...input.fromLines,
    '',
    'Bill to',
    ...input.billToLines,
    '',
    ...input.lines.flatMap((line) => [
      line.label,
      line.meta ? `${line.meta}: ${formatCurrency(line.value)}` : formatCurrency(line.value),
      '',
    ]),
    `Subtotal: ${formatCurrency(input.subtotal)}`,
    input.paymentsReceived > 0
      ? `Payments received: -${formatCurrency(input.paymentsReceived)}`
      : '',
    `Balance due: ${formatCurrency(input.balanceDue)}`,
    '',
    input.note,
    input.terms ? `Terms: ${input.terms}` : '',
  ]
    .filter((line, index, lines) => line || lines[index - 1])
    .join('\n');
}

export function formatCurrency(value: number | null | undefined): string {
  return new Intl.NumberFormat('en-US', {
    currency: 'USD',
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
    style: 'currency',
  }).format(value ?? 0);
}

function formatExpenseType(value: string): string {
  return value
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatDurationMinutes(durationMinutes: number): string {
  const roundedMinutes = Math.max(0, Math.round(durationMinutes));
  const hours = Math.floor(roundedMinutes / 60);
  const minutes = roundedMinutes % 60;
  const parts: string[] = [];

  if (hours > 0) {
    parts.push(`${hours} ${hours === 1 ? 'hr' : 'hrs'}`);
  }

  if (minutes > 0 || hours === 0) {
    parts.push(`${minutes} min`);
  }

  return parts.join(' ');
}

export function formatInvoiceDate(value: string): string {
  const date = parseDateOnly(value);

  return new Intl.DateTimeFormat('en-US', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

export function getInvoiceDueDate(
  issueDate: string,
  explicitDueDate: string | null,
  terms: string | null
): string | null {
  if (explicitDueDate) {
    return explicitDueDate;
  }

  const normalizedTerms = terms?.trim() ?? '';

  if (/^due (on|upon) receipt\.?$/i.test(normalizedTerms)) {
    return issueDate;
  }

  const netDaysMatch = normalizedTerms.match(/\bnet\s*(\d{1,3})\b/i);

  if (!netDaysMatch) {
    return null;
  }

  const days = Number(netDaysMatch[1]);

  if (!Number.isInteger(days) || days < 0 || days > 365) {
    return null;
  }

  const dueDate = parseDateOnly(issueDate);
  dueDate.setDate(dueDate.getDate() + days);

  return toLocalDateString(dueDate);
}

function parseDateOnly(value: string): Date {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T12:00:00`) : new Date(value);
}

function toLocalDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function sanitizeDocumentTitle(value: string): string {
  return (
    value
      .trim()
      .replace(/\.pdf$/i, '')
      .replace(/[^a-zA-Z0-9._ -]/g, '')
      .replace(/\s+/g, ' ') || 'conTRACKtor invoice'
  );
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
