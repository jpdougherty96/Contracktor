import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

const source = await readFile(
  new URL('../src/lib/receiptAdjustments.ts', import.meta.url),
  'utf8'
);
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const adjustments = await import(
  `data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`
);

test('offers a single-job net-versus-gross choice for a reconciled discount', () => {
  const decision = adjustments.getReceiptAdjustmentDecision(
    [
      { line_total: 1000, line_type: 'item' },
      { line_total: 299.57, line_type: 'discount' },
    ],
    { tax: 70, total: 770.43 }
  );

  assert.deepEqual(decision, {
    adjustmentTotal: 299.57,
    amountPaid: 770.43,
    fullItemCostWithTax: 1070,
    itemsBeforeAdjustment: 1000,
    tax: 70,
  });
  assert.equal(
    adjustments.shouldOfferReceiptAdjustmentChoice(decision, 1, false, false),
    true
  );
});

test('does not offer gross costing for unreconciled or multi-destination receipts', () => {
  const unreconciled = adjustments.getReceiptAdjustmentDecision(
    [
      { line_total: 1000, line_type: 'item' },
      { line_total: 100, line_type: 'discount' },
    ],
    { tax: 70, total: 770.43 }
  );
  const decision = adjustments.getReceiptAdjustmentDecision(
    [
      { line_total: 1000, line_type: 'item' },
      { line_total: 299.57, line_type: 'discount' },
    ],
    { tax: 70, total: 770.43 }
  );

  assert.equal(unreconciled, null);
  assert.equal(adjustments.shouldOfferReceiptAdjustmentChoice(decision, 2, false, false), false);
  assert.equal(adjustments.shouldOfferReceiptAdjustmentChoice(decision, 1, true, false), false);
  assert.equal(adjustments.shouldOfferReceiptAdjustmentChoice(decision, 1, false, true), false);
});

test('auto-finalizes only a clean, reconciled, duplicate-free single-job receipt', () => {
  const cleanReceipt = {
    assignedDestinationCount: 1,
    duplicateCheckComplete: true,
    duplicateCount: 0,
    hasLineItems: true,
    hasReceiptAdjustments: false,
    hasTrustedLineConfidence: true,
    hasUntrustedLineItems: false,
    includeInventoryDestination: false,
    inventoryMode: false,
    isAutoFinalizing: false,
    isLoading: false,
    isReceiptStillProcessing: false,
    isSavedReceipt: false,
    isSaving: false,
    lineItemsTotal: 107,
    needsManualReceiptReview: false,
    processingStatus: 'complete',
    receiptTotal: 107,
    requiresReceiptAdjustmentChoice: false,
    selectedJobCount: 1,
  };

  assert.equal(adjustments.shouldAutoFinalizeReceipt(cleanReceipt), true);
  assert.equal(
    adjustments.shouldAutoFinalizeReceipt({ ...cleanReceipt, duplicateCheckComplete: false }),
    false
  );
  assert.equal(adjustments.shouldAutoFinalizeReceipt({ ...cleanReceipt, duplicateCount: 1 }), false);
  assert.equal(
    adjustments.shouldAutoFinalizeReceipt({ ...cleanReceipt, hasReceiptAdjustments: true }),
    false
  );
  assert.equal(
    adjustments.shouldAutoFinalizeReceipt({ ...cleanReceipt, hasTrustedLineConfidence: false }),
    false
  );
  assert.equal(
    adjustments.shouldAutoFinalizeReceipt({ ...cleanReceipt, lineItemsTotal: 90 }),
    false
  );
});
