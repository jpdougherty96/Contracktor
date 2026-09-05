import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

const source = await readFile(
  new URL('../supabase/functions/_shared/receipt-normalization.ts', import.meta.url),
  'utf8'
);
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const normalization = await import(
  `data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`
);

const referenceDate = new Date('2026-09-03T12:00:00Z');

function validLine(overrides = {}) {
  return {
    category: 'material',
    cleaned_name: '2x4 lumber',
    confidence: 0.95,
    line_number: 1,
    line_total: 100,
    line_type: 'item',
    original_text: '2X4 LUMBER',
    quantity: 1,
    unit_price: 100,
    ...overrides,
  };
}

function validExtraction(overrides = {}) {
  return {
    category: 'materials',
    confidence: 0.95,
    line_items: [validLine()],
    receipt_date: '2026-09-02',
    subtotal: 100,
    tax: 7,
    total: 107,
    vendor: 'Hardware Store',
    ...overrides,
  };
}

test('preserves the extracted total and flags a conflicting line-derived total', () => {
  const extraction = normalization.normalizeExtraction(
    validExtraction({
      line_items: [
        validLine({ line_total: 1000 }),
        validLine({
          cleaned_name: 'Instant savings',
          line_number: 2,
          line_total: 100,
          line_type: 'discount',
          original_text: 'INSTANT SAVINGS',
        }),
      ],
      subtotal: 1000,
      tax: 70,
      total: 1070,
    }),
    referenceDate
  );

  assert.equal(extraction.total, 1070);
  assert.equal(extraction.computed_total, 970);
  assert.equal(extraction.total_discrepancy, -100);
  assert.equal(normalization.getReceiptStatus(extraction), 'needs_review');
  assert.match(normalization.getReceiptErrorMessage('needs_review', extraction), /does not match/);
});

test('keeps purchased card products while dropping anchored payment summary lines', () => {
  const lines = normalization.normalizeLineItems([
    validLine({ cleaned_name: 'CARDBOARD', original_text: 'CARDBOARD' }),
    validLine({ cleaned_name: 'Card stock', original_text: 'CARD STOCK' }),
    validLine({ cleaned_name: 'Gift card', original_text: 'GIFT CARD' }),
    validLine({ cleaned_name: 'Placard', original_text: 'PLACARD' }),
    validLine({ cleaned_name: 'Discard bin', original_text: 'DISCARD BIN' }),
    validLine({ cleaned_name: 'VISA 1234', original_text: 'VISA 1234' }),
  ]);

  assert.deepEqual(lines.map((line) => line.cleaned_name), [
    'CARDBOARD',
    'Card stock',
    'Gift card',
    'Placard',
    'Discard bin',
  ]);
});

test('normalizes printed negative formats and never turns a negative item into a charge', () => {
  assert.equal(normalization.toMoney('299.57-'), -299.57);
  assert.equal(normalization.toMoney('(299.57)'), -299.57);
  assert.equal(normalization.toMoney('-$299.57'), -299.57);

  const line = normalization.normalizeLineItem(
    validLine({ line_total: '-50.00', line_type: 'item', quantity: '-1', unit_price: '-50.00' }),
    1
  );

  assert.equal(line.line_type, 'discount');
  assert.equal(line.line_total, 50);
  assert.equal(line.quantity, 1);
  assert.equal(line.unit_price, 50);
});

test('keeps persisted quantity and unit price nonnegative even when the line total is positive', () => {
  const negativeUnitPrice = normalization.normalizeLineItem(
    validLine({ line_total: 50, quantity: 1, unit_price: -25 }),
    1
  );
  const negativeQuantity = normalization.normalizeLineItem(
    validLine({ line_total: 50, quantity: -2, unit_price: 1 }),
    2
  );

  assert.equal(negativeUnitPrice.line_type, 'item');
  assert.equal(negativeUnitPrice.quantity, 1);
  assert.equal(negativeUnitPrice.unit_price, 25);
  assert.equal(negativeQuantity.line_type, 'item');
  assert.equal(negativeQuantity.quantity, 2);
  assert.equal(negativeQuantity.unit_price, 1);
});

test('rejects ambiguous or non-decimal money coercions', () => {
  assert.equal(normalization.toMoney(' '), null);
  assert.equal(normalization.toMoney('1.234,56'), null);
  assert.equal(normalization.toMoney('1e3'), null);
  assert.equal(normalization.toMoney('12,34'), null);
  assert.equal(normalization.toMoney('$1,234.56'), 1234.56);
});

test('missing line confidence fails closed', () => {
  const extraction = normalization.normalizeExtraction(
    validExtraction({ line_items: [validLine({ confidence: null })] }),
    referenceDate
  );

  assert.equal(normalization.getReceiptStatus(extraction), 'needs_review');
});

test('rejects implausible dates but accepts current receipt dates', () => {
  assert.equal(normalization.normalizeReceiptDate('2099-01-01', referenceDate), null);
  assert.equal(normalization.normalizeReceiptDate('1999-01-01', referenceDate), null);
  assert.equal(normalization.normalizeReceiptDate('09/02/2026', referenceDate), '2026-09-02');
});

test('caps line count and produces deterministic unique line numbers', () => {
  const sourceLines = Array.from({ length: 300 }, (_, index) =>
    validLine({ cleaned_name: `Item ${index}`, line_number: 1, original_text: `ITEM ${index}` })
  );
  const extraction = normalization.normalizeExtraction(
    validExtraction({ line_items: sourceLines, subtotal: 30000, total: 32100 }),
    referenceDate
  );

  assert.equal(extraction.line_items.length, normalization.maxReceiptLineItems);
  assert.equal(extraction.line_items_truncated, true);
  assert.deepEqual(
    extraction.line_items.map((line) => line.line_number),
    Array.from({ length: normalization.maxReceiptLineItems }, (_, index) => index + 1)
  );
  assert.equal(normalization.getReceiptStatus(extraction), 'needs_review');
});

test('accepts a clean, reconciling extraction', () => {
  const extraction = normalization.normalizeExtraction(validExtraction(), referenceDate);

  assert.equal(extraction.total, 107);
  assert.equal(extraction.computed_total, 107);
  assert.equal(normalization.getReceiptStatus(extraction), 'accepted');
});

test('rejects discounts that exceed purchased items', () => {
  const extraction = normalization.normalizeExtraction(
    validExtraction({
      line_items: [
        validLine({ line_total: 10 }),
        validLine({ cleaned_name: 'Credit', line_total: 20, line_type: 'discount' }),
      ],
      subtotal: 10,
      tax: 20,
      total: 10,
    }),
    referenceDate
  );

  assert.equal(normalization.receiptMathReconciles(extraction), false);
  assert.equal(normalization.getReceiptStatus(extraction), 'needs_review');
});
