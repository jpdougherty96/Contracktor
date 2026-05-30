import type { ImagePickerAsset } from 'expo-image-picker';

import { supabase } from '@/src/lib/supabase';
import type { Tables } from '@/src/types/database';

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

export type UpdateReceiptInput = {
  category: ReceiptCategory;
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
  const storagePath = `${userData.user.id}/${storageScope}/${Date.now()}-${sanitizeFilename(
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

export async function createProcessingReceipt(
  jobId: string | null,
  storagePath: string,
  originalFilename?: string
): Promise<Tables<'receipts'>> {
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
      original_filename: originalFilename ?? null,
      owner_id: userData.user.id,
      review_status: 'processing',
      scan_context_job_id: jobId,
      status: 'processing',
      storage_path: storagePath,
    })
    .select(
      'id, scan_context_job_id, owner_id, storage_path, original_filename, vendor, receipt_date, subtotal, tax, total, category, ai_confidence, extracted_json, status, review_status, error_message, created_at, updated_at'
    )
    .single();

  if (error) {
    throw new Error(error.message);
  }

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
    .select(
      'id, scan_context_job_id, owner_id, storage_path, original_filename, vendor, receipt_date, subtotal, tax, total, category, ai_confidence, extracted_json, status, review_status, error_message, created_at, updated_at'
    )
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

async function upsertReceiptExpense({
  jobCostAmount,
  receipt,
  receiptDate,
  subtotal,
  tax,
  total,
  userId,
  vendor,
  category,
}: {
  category: ReceiptCategory;
  jobCostAmount: number;
  receipt: Tables<'receipts'>;
  receiptDate: string;
  subtotal: number | null;
  tax: number | null;
  total: number;
  userId: string;
  vendor: string;
}) {
  const { data: existingExpense, error: existingExpenseError } = await supabase
    .from('expenses')
    .select('id')
    .eq('owner_id', userId)
    .eq('receipt_id', receipt.id)
    .is('receipt_line_item_id', null)
    .maybeSingle();

  if (existingExpenseError) {
    throw new Error(existingExpenseError.message);
  }

  if (jobCostAmount === 0) {
    if (existingExpense) {
      const { error } = await supabase
        .from('expenses')
        .delete()
        .eq('id', existingExpense.id)
        .eq('owner_id', userId);

      if (error) {
        throw new Error(error.message);
      }
    }

    return;
  }

  const allocationRatio = total > 0 ? Math.min(jobCostAmount / total, 1) : 1;
  const preTaxAmount =
    subtotal !== null ? roundMoney(subtotal * allocationRatio) : roundMoney(jobCostAmount);
  const taxAmount = tax !== null ? roundMoney(tax * allocationRatio) : 0;
  const expensePayload = {
    billable: false,
    description: `${vendor} receipt`,
    expense_date: receiptDate,
    expense_type: mapReceiptCategoryToExpenseType(category),
    job_id: receipt.scan_context_job_id,
    notes: jobCostAmount < total ? `Partial receipt amount from ${formatMoney(total)} total.` : null,
    owner_id: userId,
    pre_tax_amount: preTaxAmount,
    receipt_id: receipt.id,
    receipt_line_item_id: null,
    source_type: 'receipt',
    status: 'reviewed',
    tax_amount: taxAmount,
    total_amount: roundMoney(jobCostAmount),
    updated_at: new Date().toISOString(),
  };

  if (existingExpense) {
    const { error } = await supabase
      .from('expenses')
      .update(expensePayload)
      .eq('id', existingExpense.id)
      .eq('owner_id', userId);

    if (error) {
      throw new Error(error.message);
    }

    return;
  }

  const { error } = await supabase.from('expenses').insert(expensePayload);

  if (error) {
    throw new Error(error.message);
  }
}

export async function updateReceipt(
  receiptId: string,
  input: UpdateReceiptInput
): Promise<Tables<'receipts'>> {
  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError) {
    throw new Error(userError.message);
  }

  if (!userData.user) {
    throw new Error('You must be logged in to update a receipt.');
  }

  const existingReceipt = await fetchReceipt(receiptId);

  const { data, error } = await supabase
    .from('receipts')
    .update({
      category: input.category,
      error_message: null,
      receipt_date: input.receiptDate,
      review_status: 'reviewed',
      status: 'accepted',
      subtotal: input.subtotal ?? null,
      tax: input.tax ?? null,
      total: input.total,
      updated_at: new Date().toISOString(),
      vendor: input.vendor,
    })
    .eq('id', receiptId)
    .eq('owner_id', userData.user.id)
    .select(
      'id, scan_context_job_id, owner_id, storage_path, original_filename, vendor, receipt_date, subtotal, tax, total, category, ai_confidence, extracted_json, status, review_status, error_message, created_at, updated_at'
    )
    .single();

  if (error) {
    throw new Error(error.message);
  }

  await upsertReceiptExpense({
    category: input.category,
    jobCostAmount: input.jobCostAmount,
    receipt: existingReceipt,
    receiptDate: input.receiptDate,
    subtotal: input.subtotal ?? null,
    tax: input.tax ?? null,
    total: input.total,
    userId: userData.user.id,
    vendor: input.vendor,
  });

  return data;
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
  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError) {
    throw new Error(userError.message);
  }

  if (!userData.user) {
    throw new Error('You must be logged in to confirm receipt lines.');
  }

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

  if (typeof receipt.total === 'number' && assignedTotal > receipt.total + receiptTotalTolerance) {
    throw new Error(
      `Assigned receipt lines add up to ${formatMoney(assignedTotal)}, which is more than the receipt total of ${formatMoney(receipt.total)}. Review the parsed line items before saving.`
    );
  }

  await deleteReceiptExpenses(receiptId, userData.user.id, lineItems.map((lineItem) => lineItem.id));

  for (const assignment of assignments) {
    const lineItem = lineItemsById.get(assignment.lineItemId);

    if (!lineItem) {
      continue;
    }

    const reviewStatus =
      assignment.assignmentType === 'ignore' || shouldSkipLineExpense(lineItem)
        ? 'ignored'
        : 'confirmed';
    const { error: updateLineError } = await supabase
      .from('receipt_line_items')
      .update({
        assigned_job_id: assignment.assignmentType === 'job' ? assignment.assignedJobId : null,
        assignment_type: assignment.assignmentType,
        review_status: reviewStatus,
        updated_at: new Date().toISOString(),
      })
      .eq('id', lineItem.id)
      .eq('owner_id', userData.user.id);

    if (updateLineError) {
      throw new Error(updateLineError.message);
    }
  }

  const expenseRows = assignments
    .map((assignment) => {
      const lineItem = lineItemsById.get(assignment.lineItemId);

      if (!lineItem || assignment.assignmentType === 'ignore' || shouldSkipLineExpense(lineItem)) {
        return null;
      }

      const allocatedTax = calculateLineAllocatedTax(lineItem, lineItems, receipt.tax);
      const lineTotal = roundMoney(lineItem.line_total + allocatedTax);

      return {
        billable: false,
        description: lineItem.cleaned_name,
        expense_date: receipt.receipt_date ?? new Date().toISOString().slice(0, 10),
        expense_type: getLineExpenseType(lineItem, assignment.assignmentType),
        job_id: assignment.assignmentType === 'job' ? assignment.assignedJobId : null,
        notes: lineItem.original_text && lineItem.original_text !== lineItem.cleaned_name
          ? `Receipt text: ${lineItem.original_text}`
          : null,
        owner_id: userData.user.id,
        pre_tax_amount: roundMoney(lineItem.line_total),
        receipt_id: receipt.id,
        receipt_line_item_id: lineItem.id,
        source_type: 'receipt_line_item',
        status: 'reviewed',
        tax_amount: allocatedTax,
        total_amount: lineTotal,
      };
    })
    .filter(isPresent);

  if (expenseRows.length > 0) {
    const { error: insertExpenseError } = await supabase.from('expenses').insert(expenseRows);

    if (insertExpenseError) {
      throw new Error(insertExpenseError.message);
    }
  }

  const { data, error } = await supabase
    .from('receipts')
    .update({
      error_message: null,
      review_status: 'reviewed',
      status: 'accepted',
      updated_at: new Date().toISOString(),
    })
    .eq('id', receiptId)
    .eq('owner_id', userData.user.id)
    .select(
      'id, scan_context_job_id, owner_id, storage_path, original_filename, vendor, receipt_date, subtotal, tax, total, category, ai_confidence, extracted_json, status, review_status, error_message, created_at, updated_at'
    )
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

export async function requireReceiptLineItems(receiptId: string): Promise<Tables<'receipts'>> {
  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError) {
    throw new Error(userError.message);
  }

  if (!userData.user) {
    throw new Error('You must be logged in to update a receipt.');
  }

  await deleteReceiptExpenses(receiptId, userData.user.id, []);

  const { data, error } = await supabase
    .from('receipts')
    .update({
      error_message:
        'This receipt was selected for multiple jobs and needs line items before it can be saved.',
      review_status: 'needs_review',
      status: 'needs_review',
      updated_at: new Date().toISOString(),
    })
    .eq('id', receiptId)
    .eq('owner_id', userData.user.id)
    .select(
      'id, scan_context_job_id, owner_id, storage_path, original_filename, vendor, receipt_date, subtotal, tax, total, category, ai_confidence, extracted_json, status, review_status, error_message, created_at, updated_at'
    )
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

export async function deleteReceipt(receiptId: string): Promise<void> {
  const receipt = await fetchReceipt(receiptId);

  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError) {
    throw new Error(userError.message);
  }

  if (!userData.user) {
    throw new Error('You must be logged in to delete a receipt.');
  }

  const { data: lineItems, error: lineItemsError } = await supabase
    .from('receipt_line_items')
    .select('id')
    .eq('receipt_id', receiptId)
    .eq('owner_id', userData.user.id);

  if (lineItemsError) {
    throw new Error(lineItemsError.message);
  }

  const lineItemIds = (lineItems ?? []).map((lineItem) => lineItem.id);
  await deleteReceiptExpenses(receiptId, userData.user.id, lineItemIds);

  const { error } = await supabase
    .from('receipts')
    .delete()
    .eq('id', receiptId)
    .eq('owner_id', userData.user.id);

  if (error) {
    throw new Error(error.message);
  }

  if (receipt.storage_path) {
    const { error: storageError } = await supabase.storage
      .from('receipts')
      .remove([receipt.storage_path]);

    if (storageError) {
      throw new Error(storageError.message);
    }
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

async function deleteReceiptExpenses(
  receiptId: string,
  ownerId: string,
  lineItemIds: string[]
): Promise<void> {
  const { error: expensesError } = await supabase
    .from('expenses')
    .delete()
    .eq('receipt_id', receiptId)
    .eq('owner_id', ownerId);

  if (expensesError) {
    throw new Error(expensesError.message);
  }

  if (lineItemIds.length > 0) {
    const { error: lineItemExpensesError } = await supabase
      .from('expenses')
      .delete()
      .eq('owner_id', ownerId)
      .in('receipt_line_item_id', lineItemIds);

    if (lineItemExpensesError) {
      throw new Error(lineItemExpensesError.message);
    }
  }
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

function getLineExpenseType(
  lineItem: Tables<'receipt_line_items'>,
  assignmentType: ReceiptLineAssignmentType
): Tables<'expenses'>['expense_type'] {
  if (assignmentType === 'tools_inventory') {
    return lineItem.category === 'inventory' ? 'inventory' : 'tool';
  }

  if (lineItem.category === 'material') return 'material';
  if (lineItem.category === 'tool') return 'tool';
  if (lineItem.category === 'inventory') return 'inventory';
  if (lineItem.category === 'rental') return 'rental';
  if (lineItem.category === 'permit') return 'permit';
  if (lineItem.category === 'subcontractor') return 'subcontractor';
  if (lineItem.category === 'fuel') return 'fuel';

  return 'other';
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function formatMoney(value: number): string {
  return `$${roundMoney(value).toFixed(2)}`;
}

function mapReceiptCategoryToExpenseType(category: ReceiptCategory): Tables<'expenses'>['expense_type'] {
  if (category === 'materials') {
    return 'material';
  }

  if (category === 'tools') {
    return 'tool';
  }

  return category;
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
