export const categories = ['materials', 'tools', 'fuel', 'subcontractor', 'permit', 'other'] as const;
export const lineItemCategories = [
  'material',
  'tool',
  'inventory',
  'rental',
  'permit',
  'subcontractor',
  'fuel',
  'other',
] as const;
export const lineTypes = ['item', 'tax', 'fee', 'discount'] as const;

export const confidenceThreshold = 0.75;
export const lineItemConfidenceThreshold = 0.6;
export const maxReceiptLineItems = 250;
export const receiptMathTolerance = 0.05;

export type NormalizedReceiptLineItem = {
  category: typeof lineItemCategories[number] | null;
  cleaned_name: string;
  confidence: number | null;
  line_number: number;
  line_total: number;
  line_type: 'discount' | 'item';
  original_text: string;
  quantity: number | null;
  unit_price: number | null;
};

export type NormalizedReceiptExtraction = {
  category: typeof categories[number] | null;
  computed_total: number | null;
  confidence: number;
  line_items: NormalizedReceiptLineItem[];
  line_items_truncated: boolean;
  notes: string | null;
  receipt_date: string | null;
  subtotal: number | null;
  tax: number | null;
  total: number | null;
  total_discrepancy: number | null;
  vendor: string | null;
};

export function normalizeExtraction(
  extraction: unknown,
  referenceDate = new Date()
): NormalizedReceiptExtraction {
  const value = extraction && typeof extraction === 'object'
    ? extraction as Record<string, unknown>
    : {};
  const category = typeof value.category === 'string' && isCategory(value.category)
    ? value.category
    : null;
  const notes = typeof value.notes === 'string' ? value.notes : null;
  const receiptDate = normalizeReceiptDate(value.receipt_date, referenceDate);
  const parsedTotal = toMoney(value.total);
  const parsedTax = toMoney(value.tax);
  const taxFromLines = sumRawLineTotals(value.line_items, ['tax', 'fee']);
  const tax = parsedTax ?? taxFromLines;
  const parsedSubtotal = toMoney(value.subtotal);
  const rawLineCount = Array.isArray(value.line_items) ? value.line_items.length : 0;
  const lineItems = normalizeLineItems(value.line_items);
  const itemTotal = sumNormalizedLineTotals(lineItems, 'item');
  const discountTotal = sumNormalizedLineTotals(lineItems, 'discount');
  const computedTotal = itemTotal > 0
    ? roundMoney(itemTotal - discountTotal + (tax ?? 0))
    : null;
  const totalDiscrepancy = parsedTotal !== null && computedTotal !== null
    ? roundMoney(computedTotal - parsedTotal)
    : null;
  const subtotal = parsedSubtotal ?? (
    parsedTotal !== null && tax !== null
      ? roundMoney(parsedTotal - tax)
      : null
  );

  return {
    category,
    computed_total: computedTotal,
    confidence: typeof value.confidence === 'number' && Number.isFinite(value.confidence)
      ? clamp(value.confidence, 0, 1)
      : 0,
    line_items: lineItems,
    line_items_truncated: rawLineCount > maxReceiptLineItems,
    notes,
    receipt_date: receiptDate,
    subtotal,
    tax,
    total: parsedTotal,
    total_discrepancy: totalDiscrepancy,
    vendor: typeof value.vendor === 'string' ? value.vendor.trim() || null : null,
  };
}

export function getReceiptStatus(extraction: NormalizedReceiptExtraction) {
  const hasUsableReceiptIdentity =
    Boolean(extraction.vendor) &&
    Boolean(extraction.receipt_date) &&
    typeof extraction.total === 'number' &&
    extraction.total > 0;

  if (!hasUsableReceiptIdentity) {
    return 'error';
  }

  const hasRequiredFields =
    Boolean(extraction.category) &&
    extraction.line_items.length > 0 &&
    !extraction.line_items_truncated &&
    extraction.line_items.every(
      (lineItem) =>
        typeof lineItem.confidence === 'number' &&
        lineItem.confidence >= lineItemConfidenceThreshold
    ) &&
    receiptMathReconciles(extraction) &&
    lineItemsDoNotExceedReceiptTotal(extraction);

  return hasRequiredFields && extraction.confidence >= confidenceThreshold
    ? 'accepted'
    : 'needs_review';
}

export function getReceiptErrorMessage(
  status: string,
  extraction?: NormalizedReceiptExtraction
): string | null {
  if (status === 'accepted') {
    return null;
  }

  if (status === 'error') {
    const missingFields = extraction ? getMissingReceiptIdentityFields(extraction) : [];

    if (missingFields.length > 0) {
      return `Missing or invalid data: ${formatList(missingFields)}. Enter ${
        missingFields.length === 1 ? 'it' : 'the missing values'
      } from the receipt to continue.`;
    }

    return 'Missing required receipt data. Enter the missing values from the receipt to continue.';
  }

  if (extraction?.line_items_truncated) {
    return `This receipt contains more than ${maxReceiptLineItems} lines. Review it before saving.`;
  }

  if (extraction && hasReceiptTotalDiscrepancy(extraction)) {
    return `The extracted receipt total (${formatMoney(extraction.total)}) does not match the line-derived total (${formatMoney(extraction.computed_total)}). Review the printed amount before saving.`;
  }

  if (extraction && !lineItemsDoNotExceedReceiptTotal(extraction)) {
    return 'Parsed line items add up to more than the receipt total. Review the receipt lines before saving.';
  }

  return 'Some receipt details need review before this can be accepted.';
}

export function getMissingReceiptIdentityFields(
  extraction: NormalizedReceiptExtraction
): string[] {
  const missingFields: string[] = [];

  if (!extraction.vendor) {
    missingFields.push('vendor');
  }

  if (!extraction.receipt_date) {
    missingFields.push('receipt date');
  }

  if (typeof extraction.total !== 'number' || extraction.total <= 0) {
    missingFields.push('total');
  }

  return missingFields;
}

export function normalizeReceiptDate(value: unknown, referenceDate = new Date()): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const usMatch = trimmed.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2}|\d{4})$/);
  let year: number;
  let month: number;
  let day: number;

  if (isoMatch) {
    year = Number(isoMatch[1]);
    month = Number(isoMatch[2]);
    day = Number(isoMatch[3]);
  } else if (usMatch) {
    month = Number(usMatch[1]);
    day = Number(usMatch[2]);
    const rawYear = Number(usMatch[3]);
    year = usMatch[3].length === 2 ? 2000 + rawYear : rawYear;
  } else {
    return null;
  }

  if (!isCalendarDate(year, month, day)) {
    return null;
  }

  const candidate = new Date(Date.UTC(year, month - 1, day));
  const today = new Date(Date.UTC(
    referenceDate.getUTCFullYear(),
    referenceDate.getUTCMonth(),
    referenceDate.getUTCDate()
  ));
  const earliest = new Date(today);
  earliest.setUTCFullYear(earliest.getUTCFullYear() - 3);
  const latest = new Date(today);
  latest.setUTCDate(latest.getUTCDate() + 1);

  if (candidate < earliest || candidate > latest) {
    return null;
  }

  return `${year.toString().padStart(4, '0')}-${month.toString().padStart(2, '0')}-${day
    .toString()
    .padStart(2, '0')}`;
}

export function receiptMathReconciles(extraction: NormalizedReceiptExtraction): boolean {
  const itemTotal = sumNormalizedLineTotals(extraction.line_items, 'item');
  const discountTotal = sumNormalizedLineTotals(extraction.line_items, 'discount');

  if (discountTotal > itemTotal + receiptMathTolerance) {
    return false;
  }

  if (hasReceiptTotalDiscrepancy(extraction)) {
    return false;
  }

  if (
    typeof extraction.subtotal !== 'number' ||
    typeof extraction.tax !== 'number' ||
    typeof extraction.total !== 'number'
  ) {
    return true;
  }

  const grossSubtotalDifference = Math.abs(
    extraction.subtotal - discountTotal + extraction.tax - extraction.total
  );
  const netSubtotalDifference = Math.abs(
    extraction.subtotal + extraction.tax - extraction.total
  );

  return Math.min(grossSubtotalDifference, netSubtotalDifference) <= receiptMathTolerance;
}

export function lineItemsDoNotExceedReceiptTotal(
  extraction: NormalizedReceiptExtraction
): boolean {
  if (typeof extraction.total !== 'number' || extraction.line_items.length === 0) {
    return true;
  }

  const computedTotal = extraction.computed_total;

  return computedTotal === null || computedTotal <= extraction.total + receiptMathTolerance;
}

export function hasReceiptTotalDiscrepancy(extraction: NormalizedReceiptExtraction): boolean {
  return typeof extraction.total_discrepancy === 'number' &&
    Math.abs(extraction.total_discrepancy) > receiptMathTolerance;
}

export function toMoney(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return roundMoney(value);
  }

  if (typeof value !== 'string') {
    return null;
  }

  let normalized = value.trim();

  if (!normalized) {
    return null;
  }

  let negative = false;

  if (/^\(.*\)$/.test(normalized)) {
    negative = true;
    normalized = normalized.slice(1, -1).trim();
  }

  if (normalized.endsWith('-')) {
    if (negative) return null;
    negative = true;
    normalized = normalized.slice(0, -1).trim();
  }

  if (normalized.startsWith('-')) {
    if (negative) return null;
    negative = true;
    normalized = normalized.slice(1).trim();
  }

  if (normalized.startsWith('$')) {
    normalized = normalized.slice(1).trim();
  }

  if (normalized.startsWith('-')) {
    if (negative) return null;
    negative = true;
    normalized = normalized.slice(1).trim();
  }

  if (!/^(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,2})?$/.test(normalized)) {
    return null;
  }

  const parsed = Number(normalized.replace(/,/g, ''));

  if (!Number.isFinite(parsed)) {
    return null;
  }

  return roundMoney(negative ? -parsed : parsed);
}

export function normalizeLineItems(value: unknown): NormalizedReceiptLineItem[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .slice(0, maxReceiptLineItems)
    .map((item, index) => normalizeLineItem(item, index + 1))
    .filter((item): item is NormalizedReceiptLineItem => item !== null)
    .map((item, index) => ({ ...item, line_number: index + 1 }));
}

export function normalizeLineItem(
  value: unknown,
  fallbackLineNumber: number
): NormalizedReceiptLineItem | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const item = value as Record<string, unknown>;
  const parsedLineTotal = toMoney(item.line_total);
  const originalText = typeof item.original_text === 'string' ? item.original_text.trim() : '';
  const cleanedName = typeof item.cleaned_name === 'string' ? item.cleaned_name.trim() : '';

  if (!cleanedName || parsedLineTotal === null || parsedLineTotal === 0) {
    return null;
  }

  const requestedLineType = typeof item.line_type === 'string' && isLineType(item.line_type)
    ? item.line_type
    : 'item';

  if (requestedLineType !== 'item' && requestedLineType !== 'discount') {
    return null;
  }

  const lineType = parsedLineTotal < 0 ? 'discount' : requestedLineType;

  if (lineType === 'item' && (isReceiptSummaryLine(cleanedName) || isReceiptSummaryLine(originalText))) {
    return null;
  }

  const category = typeof item.category === 'string' && isLineItemCategory(item.category)
    ? item.category
    : null;
  const confidence = typeof item.confidence === 'number' && Number.isFinite(item.confidence)
    ? clamp(item.confidence, 0, 1)
    : null;
  const quantity = toMoney(item.quantity);
  const unitPrice = toMoney(item.unit_price);

  return {
    category,
    cleaned_name: cleanedName,
    confidence,
    line_number: fallbackLineNumber,
    line_total: lineType === 'discount' ? Math.abs(parsedLineTotal) : parsedLineTotal,
    line_type: lineType,
    original_text: originalText || cleanedName,
    quantity: quantity === null ? null : Math.abs(quantity),
    unit_price: unitPrice === null ? null : Math.abs(unitPrice),
  };
}

export function isReceiptSummaryLine(value: string): boolean {
  const normalized = value.toLowerCase().replace(/[^a-z0-9*#]+/g, ' ').trim();

  if (
    ['subtotal', 'total', 'tax', 'taxes', 'taxes and fees', 'taxes fees and charges',
      'fees', 'ticket amount', 'method of payment'].includes(normalized) ||
    normalized.startsWith('payment method') ||
    normalized.startsWith('payment methods')
  ) {
    return true;
  }

  return /^(?:menard(?:s)? card|card)(?:\s+(?:ending(?: in)?|acct|account)?\s*[x*#]*\d{2,})?$/.test(normalized) ||
    /^(?:visa|mastercard|mc|amex|american express|discover|debit|credit)(?:\s+card)?(?:\s+(?:ending(?: in)?|acct|account)?\s*[x*#]*\d{2,})?$/.test(normalized) ||
    /^(?:visa|mastercard|mc|amex|american express|discover|debit|credit)\s+(?:payment|tender|purchase|sale|approved|authorization|auth)(?:\s+.*)?$/.test(normalized);
}

function sumRawLineTotals(value: unknown, types: string[]): number | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const total = value.reduce((sum, item) => {
    if (!item || typeof item !== 'object') {
      return sum;
    }

    const rawLine = item as Record<string, unknown>;
    const lineType = typeof rawLine.line_type === 'string' ? rawLine.line_type : null;
    const lineTotal = toMoney(rawLine.line_total);

    if (!lineType || !types.includes(lineType) || lineTotal === null) {
      return sum;
    }

    return sum + Math.abs(lineTotal);
  }, 0);

  return total > 0 ? roundMoney(total) : null;
}

function sumNormalizedLineTotals(
  lineItems: NormalizedReceiptLineItem[],
  lineType: 'discount' | 'item'
): number {
  return roundMoney(
    lineItems
      .filter((lineItem) => lineItem.line_type === lineType)
      .reduce((sum, lineItem) => sum + lineItem.line_total, 0)
  );
}

function isCategory(value: string): value is typeof categories[number] {
  return categories.includes(value as typeof categories[number]);
}

function isLineItemCategory(value: string): value is typeof lineItemCategories[number] {
  return lineItemCategories.includes(value as typeof lineItemCategories[number]);
}

function isLineType(value: string): value is typeof lineTypes[number] {
  return lineTypes.includes(value as typeof lineTypes[number]);
}

function isCalendarDate(year: number, month: number, day: number): boolean {
  const candidate = new Date(Date.UTC(year, month - 1, day));

  return candidate.getUTCFullYear() === year &&
    candidate.getUTCMonth() === month - 1 &&
    candidate.getUTCDate() === day;
}

function formatList(values: string[]): string {
  if (values.length <= 1) {
    return values[0] ?? 'required receipt details';
  }

  if (values.length === 2) {
    return `${values[0]} and ${values[1]}`;
  }

  return `${values.slice(0, -1).join(', ')}, and ${values.at(-1)}`;
}

function formatMoney(value: number | null): string {
  return typeof value === 'number' ? `$${value.toFixed(2)}` : 'unavailable';
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}
