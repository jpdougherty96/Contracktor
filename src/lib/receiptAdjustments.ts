export type ReceiptAdjustmentDecision = {
  adjustmentTotal: number;
  amountPaid: number;
  fullItemCostWithTax: number;
  itemsBeforeAdjustment: number;
  tax: number;
};

type ReceiptAdjustmentLine = {
  line_total: number;
  line_type: string;
};

type ReceiptAdjustmentReceipt = {
  tax: number | null;
  total: number | null;
};

export function getReceiptAdjustmentDecision(
  lineItems: ReceiptAdjustmentLine[],
  receipt: ReceiptAdjustmentReceipt
): ReceiptAdjustmentDecision | null {
  if (receipt.total === null || lineItems.length === 0) {
    return null;
  }

  const itemsBeforeAdjustment = roundMoney(
    lineItems
      .filter((lineItem) => lineItem.line_type === 'item')
      .reduce((sum, lineItem) => sum + lineItem.line_total, 0)
  );
  const adjustmentTotal = roundMoney(
    lineItems
      .filter((lineItem) => lineItem.line_type === 'discount')
      .reduce((sum, lineItem) => sum + lineItem.line_total, 0)
  );
  const tax = roundMoney(receipt.tax ?? 0);

  if (itemsBeforeAdjustment <= 0 || adjustmentTotal <= 0) {
    return null;
  }

  const adjustedTotal = roundMoney(itemsBeforeAdjustment - adjustmentTotal + tax);

  if (Math.abs(adjustedTotal - receipt.total) > 0.05) {
    return null;
  }

  return {
    adjustmentTotal,
    amountPaid: receipt.total,
    fullItemCostWithTax: roundMoney(itemsBeforeAdjustment + tax),
    itemsBeforeAdjustment,
    tax,
  };
}

export function shouldOfferReceiptAdjustmentChoice(
  adjustment: ReceiptAdjustmentDecision | null,
  selectedJobCount: number,
  inventoryMode: boolean,
  includeInventoryDestination: boolean
): boolean {
  return (
    adjustment !== null &&
    selectedJobCount === 1 &&
    !inventoryMode &&
    !includeInventoryDestination
  );
}

type ReceiptAutoFinalizeInput = {
  assignedDestinationCount: number;
  duplicateCheckComplete: boolean;
  duplicateCount: number;
  hasLineItems: boolean;
  hasReceiptAdjustments: boolean;
  hasTrustedLineConfidence: boolean;
  hasUntrustedLineItems: boolean;
  includeInventoryDestination: boolean;
  inventoryMode: boolean;
  isAutoFinalizing: boolean;
  isLoading: boolean;
  isReceiptStillProcessing: boolean;
  isSavedReceipt: boolean;
  isSaving: boolean;
  lineItemsTotal: number;
  needsManualReceiptReview: boolean;
  processingStatus: string | null;
  receiptTotal: number | null;
  requiresReceiptAdjustmentChoice: boolean;
  selectedJobCount: number;
};

export function shouldAutoFinalizeReceipt(input: ReceiptAutoFinalizeInput): boolean {
  return (
    !input.isLoading &&
    !input.isSaving &&
    !input.isAutoFinalizing &&
    !input.isReceiptStillProcessing &&
    !input.isSavedReceipt &&
    !input.inventoryMode &&
    !input.includeInventoryDestination &&
    input.selectedJobCount === 1 &&
    input.hasLineItems &&
    !input.hasReceiptAdjustments &&
    !input.requiresReceiptAdjustmentChoice &&
    !input.hasUntrustedLineItems &&
    !input.needsManualReceiptReview &&
    input.processingStatus === 'complete' &&
    input.duplicateCheckComplete &&
    input.duplicateCount === 0 &&
    input.assignedDestinationCount === 1 &&
    input.hasTrustedLineConfidence &&
    input.receiptTotal !== null &&
    Math.abs(input.lineItemsTotal - input.receiptTotal) <= 0.05
  );
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}
