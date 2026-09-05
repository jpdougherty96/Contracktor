import { getLocalDateString } from '@/src/lib/localDate';
import { supabase } from '@/src/lib/supabase';
import type { Json } from '@/src/types/database';

export type InvoiceStatus = 'draft' | 'finalized' | 'void';
export type InvoiceBillingModel = 'fixed_bid' | 'time_and_materials';
export type InvoicePaymentRequestType = 'deposit' | 'final' | 'progress' | 'standard';
export type InvoiceLineType =
  | 'change_order'
  | 'fee'
  | 'fixed_scope'
  | 'labor'
  | 'material'
  | 'other';

export type InvoiceRecord = {
  amount_paid: number;
  balance_due: number;
  billing_model: InvoiceBillingModel;
  billing_period_end: string | null;
  billing_period_start: string | null;
  business_id: string;
  contract_amount: number;
  created_at: string;
  created_by_user_id: string;
  creation_idempotency_key: string;
  customer_snapshot: Json;
  due_date: string | null;
  finalized_at: string | null;
  finalized_by_user_id: string | null;
  id: string;
  invoice_number: string;
  issue_date: string;
  job_id: string;
  last_mutation_key: string | null;
  material_markup_percent: number;
  note: string | null;
  owner_id: string;
  payment_request_type: InvoicePaymentRequestType;
  retainage_amount: number;
  seller_snapshot: Json;
  status: InvoiceStatus;
  subtotal: number;
  terms: string | null;
  updated_at: string;
  version: number;
  void_reason: string | null;
  voided_at: string | null;
  voided_by_user_id: string | null;
};

export type InvoiceLineRecord = {
  amount: number;
  business_id: string;
  created_at: string;
  description: string;
  detail: string | null;
  expenseIds: string[];
  id: string;
  invoice_id: string;
  job_id: string;
  line_type: InvoiceLineType;
  metadata: Json;
  owner_id: string;
  position: number;
  quantity: number;
  timeEntryIds: string[];
  unit: string;
  unit_rate: number;
  updated_at: string;
};

export type InvoiceBundle = {
  invoice: InvoiceRecord;
  lines: InvoiceLineRecord[];
};

export type InvoiceDraftLineInput = {
  amount?: number;
  description: string;
  detail?: string | null;
  expenseIds?: string[];
  lineType: InvoiceLineType;
  metadata?: Json;
  position: number;
  quantity: number;
  timeEntryIds?: string[];
  unit: string;
  unitRate: number;
};

export type CreateInvoiceDraftInput = {
  billingPeriodEnd?: string | null;
  billingPeriodStart?: string | null;
  dueDate?: string | null;
  idempotencyKey?: string;
  issueDate?: string;
  jobId: string;
  paymentRequestType?: InvoicePaymentRequestType;
};

export type SaveInvoiceDraftInput = {
  billingPeriodEnd?: string | null;
  billingPeriodStart?: string | null;
  dueDate?: string | null;
  expectedVersion: number;
  idempotencyKey?: string;
  invoiceId: string;
  issueDate: string;
  lines: InvoiceDraftLineInput[];
  materialMarkupPercent?: number;
  note?: string | null;
  retainageAmount?: number;
  terms?: string | null;
};

let invoiceMutationSequence = 0;

export async function fetchJobInvoiceDraft(jobId: string): Promise<InvoiceBundle | null> {
  const { data, error } = await supabase.rpc('get_job_invoice_draft', {
    p_job_id: jobId,
  });

  if (error) {
    throw new Error(error.message);
  }

  return data === null ? null : parseInvoiceBundle(data);
}

export async function fetchAvailableInvoicePaymentCredit(jobId: string): Promise<number> {
  const { data, error } = await supabase.rpc('get_job_invoice_payment_credit', {
    p_job_id: jobId,
  });

  if (error) {
    throw new Error(error.message);
  }

  const amount = Number(data);

  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error('Invoice payment information is unavailable. Refresh and try again.');
  }

  return amount;
}

export async function fetchInvoice(invoiceId: string): Promise<InvoiceBundle> {
  const { data, error } = await supabase.rpc('get_invoice_bundle', {
    p_invoice_id: invoiceId,
  });

  if (error) {
    throw new Error(error.message);
  }

  return parseInvoiceBundle(data);
}

export async function createInvoiceDraft({
  billingPeriodEnd = null,
  billingPeriodStart = null,
  dueDate = null,
  idempotencyKey,
  issueDate = getLocalDateString(),
  jobId,
  paymentRequestType = 'standard',
}: CreateInvoiceDraftInput): Promise<InvoiceBundle> {
  validateDateRange(issueDate, dueDate, billingPeriodStart, billingPeriodEnd);

  const { data, error } = await supabase.rpc('create_invoice_draft', {
    p_billing_period_end: billingPeriodEnd,
    p_billing_period_start: billingPeriodStart,
    p_due_date: dueDate,
    p_idempotency_key: idempotencyKey ?? createInvoiceMutationKey('create'),
    p_issue_date: issueDate,
    p_job_id: jobId,
    p_payment_request_type: paymentRequestType,
  });

  if (error) {
    throw new Error(error.message);
  }

  return parseInvoiceBundle(data);
}

export async function saveInvoiceDraft({
  billingPeriodEnd = null,
  billingPeriodStart = null,
  dueDate = null,
  expectedVersion,
  idempotencyKey,
  invoiceId,
  issueDate,
  lines,
  materialMarkupPercent = 0,
  note = null,
  retainageAmount = 0,
  terms = null,
}: SaveInvoiceDraftInput): Promise<InvoiceBundle> {
  validateDateRange(issueDate, dueDate, billingPeriodStart, billingPeriodEnd);
  validateDraftLines(lines);

  if (!Number.isFinite(materialMarkupPercent) || materialMarkupPercent < 0 || materialMarkupPercent > 500) {
    throw new Error('Materials markup must be between 0 and 500 percent.');
  }

  if (!Number.isFinite(retainageAmount) || retainageAmount < 0) {
    throw new Error('Retainage cannot be negative.');
  }

  const { data, error } = await supabase.rpc('save_invoice_draft', {
    p_billing_period_end: billingPeriodEnd,
    p_billing_period_start: billingPeriodStart,
    p_due_date: dueDate,
    p_expected_version: expectedVersion,
    p_idempotency_key: idempotencyKey ?? createInvoiceMutationKey('save'),
    p_invoice_id: invoiceId,
    p_issue_date: issueDate,
    p_lines: lines as unknown as Json,
    p_material_markup_percent: materialMarkupPercent,
    p_note: note,
    p_retainage_amount: retainageAmount,
    p_terms: terms,
  });

  if (error) {
    throw new Error(error.message);
  }

  return parseInvoiceBundle(data);
}

export async function finalizeInvoice(
  invoiceId: string,
  expectedVersion: number,
  options: { idempotencyKey?: string } = {}
): Promise<InvoiceBundle> {
  const { data, error } = await supabase.rpc('finalize_invoice', {
    p_expected_version: expectedVersion,
    p_idempotency_key: options.idempotencyKey ?? createInvoiceMutationKey('finalize'),
    p_invoice_id: invoiceId,
  });

  if (error) {
    throw new Error(error.message);
  }

  return parseInvoiceBundle(data);
}

export function createInvoiceMutationKey(action: string): string {
  invoiceMutationSequence += 1;
  return `invoice-${action}-${Date.now()}-${invoiceMutationSequence}-${Math.random()
    .toString(36)
    .slice(2, 10)}`;
}

function parseInvoiceBundle(value: Json): InvoiceBundle {
  if (!isObject(value) || !isObject(value.invoice) || !Array.isArray(value.lines)) {
    throw new Error('Invoice data is unavailable. Refresh and try again.');
  }

  const invoice = value.invoice;

  if (
    typeof invoice.id !== 'string' ||
    typeof invoice.invoice_number !== 'string' ||
    typeof invoice.status !== 'string' ||
    typeof invoice.version !== 'number'
  ) {
    throw new Error('Invoice data is incomplete. Refresh and try again.');
  }

  return value as unknown as InvoiceBundle;
}

function isObject(value: Json | undefined): value is { [key: string]: Json | undefined } {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function validateDateRange(
  issueDate: string,
  dueDate: string | null,
  billingPeriodStart: string | null,
  billingPeriodEnd: string | null
): void {
  for (const value of [issueDate, dueDate, billingPeriodStart, billingPeriodEnd]) {
    if (value !== null && !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      throw new Error('Invoice dates must use YYYY-MM-DD format.');
    }
  }

  if (dueDate && issueDate > dueDate) {
    throw new Error('The due date cannot be before the issue date.');
  }

  if (billingPeriodStart && billingPeriodEnd && billingPeriodStart > billingPeriodEnd) {
    throw new Error('The billing period start cannot be after its end.');
  }
}

function validateDraftLines(lines: InvoiceDraftLineInput[]): void {
  if (lines.length === 0) {
    throw new Error('Add at least one invoice line.');
  }

  if (lines.length > 200) {
    throw new Error('An invoice cannot contain more than 200 lines.');
  }

  for (const line of lines) {
    if (!line.description.trim() || line.description.trim().length > 500) {
      throw new Error('Invoice line descriptions must be between 1 and 500 characters.');
    }

    if (
      !Number.isFinite(line.quantity) ||
      !Number.isFinite(line.unitRate) ||
      line.quantity < 0 ||
      line.unitRate < 0
    ) {
      throw new Error('Invoice line quantities and rates cannot be negative.');
    }

    if (line.amount !== undefined && !Number.isFinite(line.amount)) {
      throw new Error('Invoice line amounts must be valid numbers.');
    }
  }
}
