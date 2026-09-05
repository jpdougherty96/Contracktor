import { recordActivityEvent } from '@/src/lib/activityEvents';
import { formatCurrency } from '@/src/lib/financials';
import { supabase } from '@/src/lib/supabase';
import type { Tables } from '@/src/types/database';

export const expenseTypes = [
  'material',
  'tool',
  'inventory',
  'rental',
  'mileage',
  'permit',
  'subcontractor',
  'fuel',
  'other',
] as const;

export type ExpenseType = (typeof expenseTypes)[number];

type CreateManualExpenseInput = {
  amount: number;
  billable: boolean;
  description: string;
  expenseDate: string;
  expenseType: ExpenseType;
  jobId: string | null;
  notes?: string;
};

export async function createManualExpense({
  amount,
  billable,
  description,
  expenseDate,
  expenseType,
  jobId,
  notes,
}: CreateManualExpenseInput): Promise<Tables<'expenses'>> {
  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError) {
    throw new Error(userError.message);
  }

  if (!userData.user) {
    throw new Error('You must be logged in to add an expense.');
  }

  const { data, error } = await supabase
    .from('expenses')
    .insert({
      billable,
      description,
      expense_date: expenseDate,
      expense_type: expenseType,
      job_id: jobId,
      notes: notes?.trim() || null,
      owner_id: userData.user.id,
      pre_tax_amount: amount,
      receipt_id: null,
      receipt_line_item_id: null,
      source_type: 'manual',
      status: 'reviewed',
      tax_amount: 0,
      total_amount: amount,
    })
    .select(
      'id, job_id, owner_id, business_id, created_by_user_id, receipt_id, receipt_line_item_id, description, expense_date, expense_type, source_type, pre_tax_amount, tax_amount, total_amount, billable, status, invoice_id, invoiced_at, notes, created_at, updated_at'
    )
    .single();

  if (error) {
    throw new Error(error.message);
  }

  await recordActivityEventSafely({
    businessId: data.business_id,
    createdByUserId: data.created_by_user_id ?? data.owner_id,
    detail: `${description} - ${formatCurrency(amount, { showCents: true })}`,
    eventType: 'manual_expense_created',
    jobId: data.job_id,
    metadata: {
      expenseDate,
      expenseType,
      sourceType: data.source_type,
      totalAmount: amount,
    },
    ownerId: data.owner_id,
    sourceId: data.id,
    sourceTable: 'expenses',
    title: jobId ? 'Manual expense added' : 'Tools / Inventory expense added',
  });

  return data;
}

async function recordActivityEventSafely(
  input: Parameters<typeof recordActivityEvent>[0]
): Promise<void> {
  try {
    await recordActivityEvent(input);
  } catch {
    // Activity is an audit aid; the expense is the source of truth.
  }
}
