import type { ImagePickerAsset } from 'expo-image-picker';

import {
  recordReceiptActivityEvent,
} from '@/src/lib/activityEvents';
import {
  fulfillShoppingNeedsFromReceipt,
} from '@/src/lib/shoppingNeeds';
import { supabase } from '@/src/lib/supabase';
import type { Json, Tables } from '@/src/types/database';

export type ReceiptExtractionResult = {
  line_items?: Tables<'receipt_line_items'>[];
  receipt: Tables<'receipts'>;
};

export type ReceiptCategory = 'materials' | 'tools' | 'fuel' | 'subcontractor' | 'permit' | 'other';
export type ReceiptLineAssignmentType = 'job' | 'tools_inventory' | 'ignore';

export type ReceiptLineAssignmentInput = {
  assignedJobId: string | null;
  assignmentType: ReceiptLineAssignmentType;
  lineItemId: string;
};

export type PotentialDuplicateReceipt = Pick<
  Tables<'receipts'>,
  | 'id'
  | 'vendor'
  | 'receipt_date'
  | 'total'
  | 'status'
  | 'review_status'
  | 'storage_path'
  | 'created_at'
> & {
  expenseId?: string;
  matchReason: string;
  source: 'receipt' | 'expense';
};

export const receiptCategories: ReceiptCategory[] = [
  'materials',
  'tools',
  'fuel',
  'subcontractor',
  'permit',
  'other',
];

const duplicateAmountTolerance = 0.05;
const receiptTotalTolerance = 0.05;
const receiptFields =
  'id, scan_context_job_id, owner_id, business_id, created_by_user_id, storage_path, original_filename, vendor, receipt_date, subtotal, tax, total, category, ai_confidence, extracted_json, status, review_status, processing_status, processing_started_at, processing_attempts, last_processing_error, error_message, allocated_cost, cost_basis, review_version, last_review_commit_key, voided_at, voided_by_user_id, created_at, updated_at';

export type UpdateReceiptInput = {
  category: ReceiptCategory;
  destinationJobId?: string | null;
  ignoreLineItems?: boolean;
  jobCostAmount: number;
  receiptDate: string;
  subtotal?: number | null;
  tax?: number | null;
  total: number;
  vendor: string;
};

export async function createReceiptImageSignedUrl(storagePath: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from('receipts')
    .createSignedUrl(storagePath, 60 * 10);

  if (error) {
    throw new Error(error.message);
  }

  return data.signedUrl;
}

export async function uploadReceiptPhoto(
  receiptId: string,
  jobId: string | null,
  imageAsset: ImagePickerAsset
): Promise<{
  originalFilename: string;
  storagePath: string;
}> {
  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError) {
    throw new Error(userError.message);
  }

  if (!userData.user) {
    throw new Error('You must be logged in to upload a receipt.');
  }

  if (!imageAsset.base64) {
    throw new Error('Receipt photo data was not available. Please retake the photo.');
  }

  const contentType = imageAsset.mimeType ?? 'image/jpeg';
  const extension = getFileExtension(contentType);
  const originalFilename = imageAsset.fileName ?? `receipt-${Date.now()}.${extension}`;
  const storageScope = jobId ?? 'tools-inventory';
  const storagePath = `${userData.user.id}/${storageScope}/${receiptId}/${sanitizeFilename(
    originalFilename
  )}`;
  const fileBody = base64ToArrayBuffer(imageAsset.base64);

  const { error } = await supabase.storage.from('receipts').upload(storagePath, fileBody, {
    contentType,
    upsert: false,
  });

  if (error) {
    throw new Error(error.message);
  }

  return {
    originalFilename,
    storagePath,
  };
}

export async function createUploadingReceipt(jobId: string | null): Promise<Tables<'receipts'>> {
  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError) {
    throw new Error(userError.message);
  }

  if (!userData.user) {
    throw new Error('You must be logged in to create a receipt.');
  }

  const { data, error } = await supabase
    .from('receipts')
    .insert({
      owner_id: userData.user.id,
      processing_status: 'uploading',
      review_status: 'none',
      scan_context_job_id: jobId,
      status: 'processing',
    })
    .select(receiptFields)
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

export async function attachReceiptPhoto(
  receiptId: string,
  storagePath: string,
  originalFilename?: string
): Promise<Tables<'receipts'>> {
  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError) {
    throw new Error(userError.message);
  }

  if (!userData.user) {
    throw new Error('You must be logged in to attach a receipt photo.');
  }

  const { data, error } = await supabase
    .from('receipts')
    .update({
      original_filename: originalFilename ?? null,
      storage_path: storagePath,
      updated_at: new Date().toISOString(),
    })
    .eq('id', receiptId)
    .eq('owner_id', userData.user.id)
    .select(receiptFields)
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

export async function setReceiptDraftDestination(
  receiptId: string,
  jobId: string | null
): Promise<Tables<'receipts'>> {
  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError) {
    throw new Error(userError.message);
  }

  if (!userData.user) {
    throw new Error('You must be logged in to update a receipt destination.');
  }

  const { data, error } = await supabase
    .from('receipts')
    .update({
      scan_context_job_id: jobId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', receiptId)
    .eq('owner_id', userData.user.id)
    .select(receiptFields)
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

export async function finalizeReceiptCapture(receiptId: string): Promise<Tables<'receipts'>> {
  const { data, error } = await supabase.rpc('finalize_receipt_capture', {
    p_receipt_id: receiptId,
  });

  if (error) {
    throw new Error(error.message);
  }

  await recordReceiptEventSafely({
    detail: 'Queued for background processing.',
    eventType: 'receipt_secured',
    receipt: data,
    title: 'Receipt uploaded',
  });

  return data;
}

export async function extractReceipt(receiptId: string): Promise<ReceiptExtractionResult> {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();

  if (sessionError) {
    throw new Error(sessionError.message);
  }

  if (!sessionData.session) {
    throw new Error('You must be logged in to extract a receipt.');
  }

  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Missing Supabase environment variables.');
  }

  const response = await fetch(`${supabaseUrl}/functions/v1/extract-receipt`, {
    body: JSON.stringify({
      receipt_id: receiptId,
    }),
    headers: {
      Authorization: `Bearer ${sessionData.session.access_token}`,
      'Content-Type': 'application/json',
      apikey: supabaseAnonKey,
    },
    method: 'POST',
  });

  const responseBody = await response.json().catch(() => null);

  if (!response.ok) {
    const edgeError =
      responseBody && typeof responseBody === 'object' && 'error' in responseBody
        ? String(responseBody.error)
        : `Edge Function failed with status ${response.status}`;

    throw new Error(edgeError);
  }

  if (!responseBody) {
    throw new Error('Receipt extraction returned no data.');
  }

  return responseBody as ReceiptExtractionResult;
}

export async function fetchReceipt(receiptId: string): Promise<Tables<'receipts'>> {
  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError) {
    throw new Error(userError.message);
  }

  if (!userData.user) {
    throw new Error('You must be logged in to view a receipt.');
  }

  const { data, error } = await supabase
    .from('receipts')
    .select(receiptFields)
    .eq('id', receiptId)
    .eq('owner_id', userData.user.id)
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

export async function fetchReceiptLineItems(
  receiptId: string
): Promise<Tables<'receipt_line_items'>[]> {
  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError) {
    throw new Error(userError.message);
  }

  if (!userData.user) {
    throw new Error('You must be logged in to view receipt line items.');
  }

  const { data, error } = await supabase
    .from('receipt_line_items')
    .select('*')
    .eq('receipt_id', receiptId)
    .eq('owner_id', userData.user.id)
    .order('line_number', { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return data ?? [];
}

export async function fetchPotentialDuplicateReceipts(
  receipt: Tables<'receipts'>
): Promise<PotentialDuplicateReceipt[]> {
  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError) {
    throw new Error(userError.message);
  }

  if (!userData.user) {
    throw new Error('You must be logged in to check for duplicate receipts.');
  }

  if (receipt.total === null) {
    return [];
  }

  const receiptQuery = supabase
    .from('receipts')
    .select(
      'id, scan_context_job_id, vendor, receipt_date, total, status, review_status, storage_path, created_at'
    )
    .eq('owner_id', userData.user.id)
    .neq('id', receipt.id)
    .neq('status', 'voided')
    .gte('total', receipt.total - duplicateAmountTolerance)
    .lte('total', receipt.total + duplicateAmountTolerance)
    .order('created_at', { ascending: false })
    .limit(24);

  const expensesQuery = receipt.scan_context_job_id
    ? supabase
        .from('expenses')
        .select(
          'id, receipt_id, description, expense_date, total_amount, status, created_at, receipts(id, vendor, receipt_date, total, status, review_status, storage_path, created_at)'
        )
        .eq('owner_id', userData.user.id)
        .eq('job_id', receipt.scan_context_job_id)
        .gte('total_amount', receipt.total - duplicateAmountTolerance)
        .lte('total_amount', receipt.total + duplicateAmountTolerance)
        .order('created_at', { ascending: false })
        .limit(24)
    : null;

  const [receiptsResult, expensesResult] = await Promise.all([
    receiptQuery,
    expensesQuery ?? Promise.resolve({ data: [], error: null }),
  ]);

  if (receiptsResult.error) {
    throw new Error(receiptsResult.error.message);
  }

  if (expensesResult.error) {
    throw new Error(expensesResult.error.message);
  }

  const currentVendor = normalizeVendor(receipt.vendor);
  const duplicateReceipts: PotentialDuplicateReceipt[] = (receiptsResult.data ?? [])
    .map((candidate) => {
      const matchReason = getReceiptDuplicateReason({
        candidateDate: candidate.receipt_date,
        candidateJobId: candidate.scan_context_job_id,
        candidateVendor: candidate.vendor,
        currentDate: receipt.receipt_date,
        currentJobId: receipt.scan_context_job_id,
        currentVendor,
      });

      return matchReason
        ? {
            created_at: candidate.created_at,
            id: candidate.id,
            matchReason,
            receipt_date: candidate.receipt_date,
            review_status: candidate.review_status,
            source: 'receipt' as const,
            status: candidate.status,
            storage_path: candidate.storage_path,
            total: candidate.total,
            vendor: candidate.vendor,
          }
        : null;
    })
    .filter(isPresent);

  const duplicateExpenses: PotentialDuplicateReceipt[] = (expensesResult.data ?? [])
    .map((expense) => {
      if (expense.receipt_id === receipt.id) {
        return null;
      }

      const receiptCandidate = Array.isArray(expense.receipts)
        ? expense.receipts[0]
        : expense.receipts;

      if (!receiptCandidate) {
        return null;
      }

      const candidateVendor = receiptCandidate?.vendor ?? expense.description;
      const candidateDate = receiptCandidate?.receipt_date ?? expense.expense_date;
      const matchReason = getReceiptDuplicateReason({
        candidateDate,
        candidateJobId: receipt.scan_context_job_id,
        candidateVendor,
        currentDate: receipt.receipt_date,
        currentJobId: receipt.scan_context_job_id,
        currentVendor,
        expenseBacked: true,
      });

      if (!matchReason) {
        return null;
      }

      return {
        created_at: receiptCandidate?.created_at ?? expense.created_at,
        expenseId: expense.id,
        id: receiptCandidate?.id ?? expense.id,
        matchReason,
        receipt_date: candidateDate,
        review_status: receiptCandidate?.review_status ?? 'reviewed',
        source: 'expense' as const,
        status: receiptCandidate?.status ?? expense.status,
        storage_path: receiptCandidate?.storage_path ?? null,
        total: receiptCandidate?.total ?? expense.total_amount,
        vendor: candidateVendor,
      };
    })
    .filter(isPresent);

  const seen = new Set<string>();

  return [...duplicateReceipts, ...duplicateExpenses].filter((candidate) => {
    const key = `${candidate.source}-${candidate.id}-${candidate.expenseId ?? ''}`;

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function getReceiptDuplicateReason({
  candidateDate,
  candidateJobId,
  candidateVendor,
  currentDate,
  currentJobId,
  currentVendor,
  expenseBacked = false,
}: {
  candidateDate: string | null;
  candidateJobId: string | null;
  candidateVendor: string | null;
  currentDate: string | null;
  currentJobId: string | null;
  currentVendor: string;
  expenseBacked?: boolean;
}): string | null {
  const normalizedCandidateVendor = normalizeVendor(candidateVendor);
  const vendorMatches =
    currentVendor.length > 0 &&
    normalizedCandidateVendor.length > 0 &&
    currentVendor === normalizedCandidateVendor;
  const dateMatches = Boolean(currentDate) && candidateDate === currentDate;

  if (!dateMatches) {
    return null;
  }

  if (vendorMatches) {
    return expenseBacked
      ? 'Existing job expense with the same vendor, date, and amount'
      : 'Same vendor, date, and amount';
  }

  return expenseBacked
    ? 'Existing job expense with the same date and amount'
    : 'Same date and amount';
}

export async function updateReceipt(
  receiptId: string,
  input: UpdateReceiptInput
): Promise<Tables<'receipts'>> {
  const existingReceipt = await fetchReceipt(receiptId);
  const destinationJobId =
    input.destinationJobId === undefined
      ? existingReceipt.scan_context_job_id
      : input.destinationJobId;

  await commitReceiptReview(receiptId, existingReceipt.updated_at, {
    category: input.category,
    destinationJobId,
    ignoreLineItems: input.ignoreLineItems ?? false,
    jobCostAmount: input.jobCostAmount,
    mode: 'whole',
    receiptDate: input.receiptDate,
    subtotal: input.subtotal ?? null,
    tax: input.tax ?? null,
    total: input.total,
    vendor: input.vendor,
  });

  const savedReceipt = await fetchReceipt(receiptId);
  await fulfillShoppingNeedsFromReceiptSafely(savedReceipt);
  return savedReceipt;
}

export async function acceptExtractedReceipt(receipt: Tables<'receipts'>): Promise<Tables<'receipts'>> {
  if (!receipt.vendor?.trim()) {
    throw new Error('Receipt vendor is required before accepting.');
  }

  if (!receipt.receipt_date) {
    throw new Error('Receipt date is required before accepting.');
  }

  if (receipt.total === null || receipt.total <= 0) {
    throw new Error('Receipt total is required before accepting.');
  }

  return updateReceipt(receipt.id, {
    category: isReceiptCategory(receipt.category) ? receipt.category : 'other',
    jobCostAmount: receipt.total,
    receiptDate: receipt.receipt_date,
    subtotal: receipt.subtotal,
    tax: receipt.tax,
    total: receipt.total,
    vendor: receipt.vendor.trim(),
  });
}

export async function confirmReceiptLineAssignments(
  receiptId: string,
  assignments: ReceiptLineAssignmentInput[]
): Promise<Tables<'receipts'>> {
  return confirmReceiptLineAssignmentsWithCostBasis(receiptId, assignments, false);
}

export async function confirmReceiptLineAssignmentsUsingGrossItemCost(
  receiptId: string,
  assignments: ReceiptLineAssignmentInput[]
): Promise<Tables<'receipts'>> {
  return confirmReceiptLineAssignmentsWithCostBasis(receiptId, assignments, true);
}

async function confirmReceiptLineAssignmentsWithCostBasis(
  receiptId: string,
  assignments: ReceiptLineAssignmentInput[],
  allowGrossLineCost: boolean
): Promise<Tables<'receipts'>> {
  const receipt = await fetchReceipt(receiptId);
  const lineItems = await fetchReceiptLineItems(receiptId);
  const lineItemsById = new Map(lineItems.map((lineItem) => [lineItem.id, lineItem]));

  if (lineItems.length === 0) {
    return acceptExtractedReceipt(receipt);
  }

  for (const assignment of assignments) {
    if (!lineItemsById.has(assignment.lineItemId)) {
      throw new Error('A receipt line item was not found.');
    }

    if (assignment.assignmentType === 'job' && !assignment.assignedJobId) {
      throw new Error('Every job line needs an assigned job.');
    }
  }

  const assignedTotal = calculateAssignedReceiptTotal(receipt, lineItems, assignments);

  if (
    !allowGrossLineCost &&
    typeof receipt.total === 'number' &&
    assignedTotal > receipt.total + receiptTotalTolerance
  ) {
    throw new Error(
      `Assigned receipt lines add up to ${formatMoney(assignedTotal)}, which is more than the receipt total of ${formatMoney(receipt.total)}. Review the parsed line items before saving.`
    );
  }

  await commitReceiptReview(receiptId, receipt.updated_at, {
    allowGrossLineCost,
    assignments: assignments.map((assignment) => ({
      assigned_job_id: assignment.assignedJobId,
      assignment_type: assignment.assignmentType,
      line_item_id: assignment.lineItemId,
    })),
    category: isReceiptCategory(receipt.category) ? receipt.category : 'other',
    mode: 'lines',
    receiptDate: receipt.receipt_date,
    subtotal: receipt.subtotal,
    tax: receipt.tax,
    total: receipt.total,
    vendor: receipt.vendor,
  });

  const [savedReceipt, savedLineItems] = await Promise.all([
    fetchReceipt(receiptId),
    fetchReceiptLineItems(receiptId),
  ]);
  await fulfillShoppingNeedsFromReceiptSafely(savedReceipt, savedLineItems);
  return savedReceipt;
}

async function commitReceiptReview(
  receiptId: string,
  expectedUpdatedAt: string | null,
  review: Json
): Promise<void> {
  const args = {
    p_expected_updated_at: expectedUpdatedAt,
    p_idempotency_key: createReceiptCommitKey(receiptId),
    p_receipt_id: receiptId,
    p_review: review,
  };
  let { error } = await supabase.rpc('commit_receipt_review', args);

  if (error && isRetryableReceiptCommitError(error.message)) {
    ({ error } = await supabase.rpc('commit_receipt_review', args));
  }

  if (error) {
    throw new Error(error.message);
  }
}

function createReceiptCommitKey(receiptId: string): string {
  const randomPart = Math.random().toString(36).slice(2);
  return `${receiptId}:${Date.now()}:${randomPart}`;
}

function isRetryableReceiptCommitError(message: string): boolean {
  return /failed to fetch|network request failed|load failed|connection.*closed/i.test(message);
}

async function recordReceiptEventSafely(
  input: Parameters<typeof recordReceiptActivityEvent>[0]
): Promise<void> {
  try {
    await recordReceiptActivityEvent(input);
  } catch {
    // Activity is an audit aid, not the source of truth for receipt completion.
  }
}

async function fulfillShoppingNeedsFromReceiptSafely(
  receipt: Tables<'receipts'>,
  lineItems?: Tables<'receipt_line_items'>[]
): Promise<void> {
  try {
    await fulfillShoppingNeedsFromReceipt(receipt, lineItems);
  } catch {
    // Shopping fulfillment is helpful automation, not part of receipt financial integrity.
  }
}

export async function requireReceiptLineItems(receiptId: string): Promise<Tables<'receipts'>> {
  const { error } = await supabase.rpc('require_receipt_line_review', {
    p_receipt_id: receiptId,
  });

  if (error) {
    throw new Error(error.message);
  }

  return fetchReceipt(receiptId);
}

export async function deleteReceipt(receiptId: string): Promise<void> {
  const { data, error } = await supabase.rpc('remove_receipt', {
    p_receipt_id: receiptId,
  });

  if (error) {
    throw new Error(error.message);
  }

  const result = data as { action?: string; storagePath?: string | null } | null;

  if (result?.action === 'discarded' && result.storagePath) {
    await supabase.storage
      .from('receipts')
      .remove([result.storagePath]);
  }
}

function getFileExtension(contentType: string): string {
  if (contentType.includes('png')) {
    return 'png';
  }

  if (contentType.includes('webp')) {
    return 'webp';
  }

  return 'jpg';
}

function sanitizeFilename(filename: string): string {
  return filename.replace(/[^a-zA-Z0-9._-]/g, '-');
}

function normalizeVendor(value: string | null): string {
  return (value ?? '')
    .toLowerCase()
    .replace(/\breceipt\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function isPresent<T>(value: T | null): value is T {
  return value !== null;
}

function calculateLineAllocatedTax(
  lineItem: Tables<'receipt_line_items'>,
  lineItems: Tables<'receipt_line_items'>[],
  receiptTax: number | null
): number {
  if (!receiptTax || lineItem.line_type !== 'item') {
    return 0;
  }

  const taxableSubtotal = lineItems
    .filter((item) => item.line_type === 'item')
    .reduce((sum, item) => sum + item.line_total, 0);

  if (taxableSubtotal <= 0) {
    return 0;
  }

  return roundMoney(receiptTax * (lineItem.line_total / taxableSubtotal));
}

function calculateAssignedReceiptTotal(
  receipt: Tables<'receipts'>,
  lineItems: Tables<'receipt_line_items'>[],
  assignments: ReceiptLineAssignmentInput[]
): number {
  return roundMoney(
    assignments.reduce((sum, assignment) => {
      if (assignment.assignmentType === 'ignore') {
        return sum;
      }

      const lineItem = lineItems.find((item) => item.id === assignment.lineItemId);

      if (!lineItem || shouldSkipLineExpense(lineItem)) {
        return sum;
      }

      return sum + lineItem.line_total + calculateLineAllocatedTax(lineItem, lineItems, receipt.tax);
    }, 0)
  );
}

function shouldSkipLineExpense(lineItem: Tables<'receipt_line_items'>): boolean {
  return lineItem.line_type === 'tax' || lineItem.line_type === 'fee' || lineItem.line_type === 'discount';
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function formatMoney(value: number): string {
  return `$${roundMoney(value).toFixed(2)}`;
}

function isReceiptCategory(value: string | null): value is ReceiptCategory {
  return receiptCategories.includes(value as ReceiptCategory);
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const cleanBase64 = base64.replace(/[^A-Za-z0-9+/=]/g, '');
  const lookup = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const padding = cleanBase64.endsWith('==') ? 2 : cleanBase64.endsWith('=') ? 1 : 0;
  const byteLength = (cleanBase64.length * 3) / 4 - padding;
  const bytes = new Uint8Array(byteLength);
  let byteIndex = 0;

  for (let index = 0; index < cleanBase64.length; index += 4) {
    const encoded1 = lookup.indexOf(cleanBase64[index]);
    const encoded2 = lookup.indexOf(cleanBase64[index + 1]);
    const encoded3 = lookup.indexOf(cleanBase64[index + 2]);
    const encoded4 = lookup.indexOf(cleanBase64[index + 3]);
    const bitmap = (encoded1 << 18) | (encoded2 << 12) | ((encoded3 & 63) << 6) | (encoded4 & 63);

    if (byteIndex < byteLength) bytes[byteIndex++] = (bitmap >> 16) & 255;
    if (byteIndex < byteLength) bytes[byteIndex++] = (bitmap >> 8) & 255;
    if (byteIndex < byteLength) bytes[byteIndex++] = bitmap & 255;
  }

  return bytes.buffer;
}
