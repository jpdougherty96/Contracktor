import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildFixedBidInvoiceLines,
  buildInvoiceDocumentHtml,
  buildTimeAndMaterialsInvoiceLines,
  formatDurationMinutes,
  getInvoiceDueDate,
} from '../src/lib/invoiceDocument.ts';

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
