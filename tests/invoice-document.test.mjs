import assert from 'node:assert/strict';
import test from 'node:test';
import { PDFDocument } from 'pdf-lib';

import {
  buildFixedBidInvoiceLines,
  buildInvoiceDocumentHtml,
  buildTimeAndMaterialsInvoiceLines,
  formatDurationMinutes,
  getInvoiceDueDate,
} from '../src/lib/invoiceDocument.ts';
import { buildInvoicePdf } from '../src/lib/invoicePdf.ts';

test('fixed-price invoices remain one deliverable-focused contract line', () => {
  assert.deepEqual(buildFixedBidInvoiceLines(4500), [
    {
      label: 'Contract amount',
      lineType: 'fixed_scope',
      quantity: 1,
      unit: 'project',
      unitRate: 4500,
      value: 4500,
    },
  ]);
});

test('T&M invoices use exact labor duration and itemize only eligible expenses', () => {
  const lines = buildTimeAndMaterialsInvoiceLines({
    expenseEntries: [
      expense('third', '2026-09-03', 300),
      expense('first', '2026-09-01', 100),
      expense('not billable', '2026-09-02', 50, { billable: false }),
      expense('already invoiced', '2026-09-02', 75, { invoice_id: 'invoice-1' }),
    ],
    laborEntries: [
      { duration_minutes: 10, hourly_rate: 49.98, id: 'labor-1', invoice_id: null },
    ],
    materialMarkupPercent: 20,
    materialPresentation: 'itemized',
  });

  assert.equal(lines[0].label, 'Labor');
  assert.equal(lines[0].meta, '10 min at $49.98/hr');
  assert.equal(lines[0].value, 8.33);
  assert.deepEqual(
    lines.slice(1, 3).map((line) => [line.label, line.value, line.expenseIds]),
    [
      ['first', 100, ['first']],
      ['third', 300, ['third']],
    ]
  );
  assert.deepEqual(lines.at(-1), {
    label: 'Material procurement & handling fee',
    lineType: 'fee',
    meta: '20% contractual fee',
    quantity: 1,
    unit: 'fee',
    unitRate: 80,
    value: 80,
  });
  assert.doesNotMatch(JSON.stringify(lines), /reviewed billable/i);
});

test('T&M invoice can consolidate materials without losing source attribution', () => {
  const lines = buildTimeAndMaterialsInvoiceLines({
    expenseEntries: [expense('one', '2026-09-01', 100), expense('two', '2026-09-02', 50)],
    laborEntries: [],
    materialMarkupPercent: 10,
    materialPresentation: 'summary',
  });

  assert.deepEqual(lines[0], {
    expenseIds: ['one', 'two'],
    label: 'Materials & supplies',
    lineType: 'material',
    meta: '2 recorded purchases',
    quantity: 1,
    unit: 'item',
    unitRate: 150,
    value: 150,
  });
  assert.equal(lines[1].label, 'Material procurement & handling fee');
  assert.equal(lines[1].value, 15);
});

test('invoice PDF generator creates a named, printable Letter document', async () => {
  const bytes = await buildInvoicePdf({
    balanceDue: 2356.15,
    billToLines: ['Tony Customer', "Tony's Roof", 'Marshall, MN'],
    dueDate: '2026-10-06',
    fileName: "Tony's Roof Invoice",
    fromLines: ['Dougherty Contracting', 'JohnPaul Dougherty', 'Porter, MN 56280'],
    invoiceNumber: 'INV-00002',
    invoiceType: 'Time & materials',
    issueDate: '2026-09-06',
    lines: [
      { label: 'Labor', meta: '18.5 hr at $75.00/hr', value: 1387.5 },
      { label: 'Materials & supplies', meta: '4 recorded purchases', value: 842.3 },
      { label: 'Material procurement & handling fee', meta: '15% contractual fee', value: 126.35 },
    ],
    note: 'Thank you for your business.',
    paymentsReceived: 0,
    subtotal: 2356.15,
    terms: 'Net 30',
  });
  const document = await PDFDocument.load(bytes);

  assert.equal(document.getPageCount(), 1);
  assert.equal(document.getTitle(), "Tony's Roof Invoice");
  assert.deepEqual(document.getPage(0).getSize(), { height: 792, width: 612 });
});

test('invoice terms derive explicit, calendar-safe due dates', () => {
  assert.equal(getInvoiceDueDate('2026-09-01', null, 'Due on Receipt'), '2026-09-01');
  assert.equal(getInvoiceDueDate('2026-08-31', null, 'Net 30'), '2026-09-30');
  assert.equal(getInvoiceDueDate('2026-09-01', '2026-10-15', 'Net 30'), '2026-10-15');
  assert.equal(getInvoiceDueDate('2026-09-01', null, 'Pay when complete'), null);
  assert.equal(formatDurationMinutes(70), '1 hr 10 min');
});

test('the shared Letter template omits zero payments and has stable print pagination', () => {
  const html = buildInvoiceDocumentHtml({
    balanceDue: 4500,
    billToLines: ['Test Client', 'Kitchen Remodel'],
    dueDate: '2026-09-01',
    fileName: 'Kitchen Remodel Invoice',
    fromLines: ['Test Company', '123 Main St', 'Testing, MN 56280'],
    invoiceNumber: 'INV-00001',
    invoiceType: 'Fixed bid',
    issueDate: '2026-09-01',
    lines: buildFixedBidInvoiceLines(4500),
    note: 'Thank you for your business.',
    paymentsReceived: 0,
    subtotal: 4500,
    terms: 'Due on Receipt',
  });

  assert.match(html, /@page\s*{\s*size: Letter/);
  assert.match(html, /Due Sep 1, 2026/);
  assert.match(html, /Fixed bid/);
  assert.doesNotMatch(html, /Payments received/);
  assert.doesNotMatch(html, /-\$0\.00/);
  assert.match(html, /@media print[\s\S]*?\.invoice\s*{[\s\S]*?padding: 0/);
  assert.match(html, /page-break-after: auto/);
});

test('the shared invoice template shows payments as a credit against the balance', () => {
  const html = buildInvoiceDocumentHtml({
    balanceDue: 3500,
    billToLines: ['Test Client', 'Kitchen Remodel'],
    dueDate: '2026-09-01',
    fileName: 'Kitchen Remodel Invoice',
    fromLines: ['Test Company', '123 Main St', 'Testing, MN 56280'],
    invoiceNumber: 'INV-00001',
    invoiceType: 'Fixed bid',
    issueDate: '2026-09-01',
    lines: buildFixedBidInvoiceLines(4500),
    note: 'Thank you for your business.',
    paymentsReceived: 1000,
    subtotal: 4500,
    terms: 'Due on Receipt',
  });

  assert.match(html, /Payments received/);
  assert.match(html, /-\$1,000\.00/);
  assert.match(html, /Balance due[\s\S]*?\$3,500\.00/);
});

function expense(id, expenseDate, totalAmount, overrides = {}) {
  return {
    billable: true,
    description: id,
    expense_date: expenseDate,
    expense_type: 'material',
    id,
    invoice_id: null,
    status: 'reviewed',
    total_amount: totalAmount,
    ...overrides,
  };
}
