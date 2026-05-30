import { formatCurrency } from '@/src/lib/financials';
import { supabase } from '@/src/lib/supabase';

export type JobActivityItem = {
  date: string | null;
  detail: string;
  hoursId?: string;
  id: string;
  noteId?: string;
  paymentId?: string;
  receiptId?: string;
  label: string;
  type: 'expense' | 'hours' | 'note' | 'payment' | 'receipt';
};

export async function fetchJobActivity(jobId: string): Promise<JobActivityItem[]> {
  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError) {
    throw new Error(userError.message);
  }

  if (!userData.user) {
    return [];
  }

  const [hoursResult, paymentsResult, expensesResult, receiptsResult, notesResult] = await Promise.all([
    supabase
      .from('time_entries')
      .select('id, duration_minutes, hourly_rate, work_date, worker_name, description, created_at')
      .eq('job_id', jobId)
      .eq('owner_id', userData.user.id)
      .eq('status', 'reviewed')
      .order('work_date', { ascending: false }),
    supabase
      .from('customer_payments')
      .select('id, amount, payment_date, note, created_at')
      .eq('job_id', jobId)
      .eq('owner_id', userData.user.id)
      .order('payment_date', { ascending: false }),
    supabase
      .from('expenses')
      .select('id, receipt_id, description, expense_date, expense_type, source_type, total_amount, created_at, receipts(id, vendor, receipt_date, total, status)')
      .eq('job_id', jobId)
      .eq('owner_id', userData.user.id)
      .neq('status', 'ignored')
      .order('expense_date', { ascending: false }),
    supabase
      .from('receipts')
      .select('id, vendor, total, receipt_date, status, category, created_at')
      .eq('scan_context_job_id', jobId)
      .eq('owner_id', userData.user.id)
      .in('status', ['processing', 'needs_review', 'error'])
      .order('created_at', { ascending: false }),
    supabase
      .from('job_notes')
      .select('id, note, created_at')
      .eq('job_id', jobId)
      .eq('owner_id', userData.user.id)
      .order('created_at', { ascending: false }),
  ]);

  if (hoursResult.error) {
    throw new Error(hoursResult.error.message);
  }

  if (paymentsResult.error) {
    throw new Error(paymentsResult.error.message);
  }

  if (expensesResult.error) {
    throw new Error(expensesResult.error.message);
  }

  if (receiptsResult.error) {
    throw new Error(receiptsResult.error.message);
  }

  if (notesResult.error) {
    throw new Error(notesResult.error.message);
  }

  const hourItems: JobActivityItem[] = (hoursResult.data ?? []).map((entry) => ({
    date: entry.work_date,
    detail: `${formatNumber(entry.duration_minutes / 60)} hrs at ${formatCurrency(entry.hourly_rate, {
      showCents: true,
    })}/hr${
      entry.description ? ` - ${entry.description}` : ''
    }`,
    id: `hour-${entry.id}`,
    hoursId: entry.id,
    label: entry.worker_name ? `Hours - ${entry.worker_name}` : 'Hours',
    type: 'hours',
  }));

  const paymentItems: JobActivityItem[] = (paymentsResult.data ?? []).map((payment) => ({
    date: payment.payment_date,
    detail: `${formatCurrency(payment.amount, { showCents: true })}${
      payment.note ? ` - ${payment.note}` : ''
    }`,
    id: `payment-${payment.id}`,
    label: 'Payment',
    paymentId: payment.id,
    type: 'payment',
  }));

  const receiptExpenseGroups = new Map<
    string,
    {
      date: string | null;
      receiptId: string;
      total: number;
      vendor: string;
    }
  >();

  for (const expense of expensesResult.data ?? []) {
    const receipt = Array.isArray(expense.receipts) ? expense.receipts[0] : expense.receipts;
    const receiptId = expense.receipt_id;

    if (!receiptId) {
      continue;
    }

    const existing = receiptExpenseGroups.get(receiptId);

    if (existing) {
      existing.total += expense.total_amount;
      continue;
    }

    receiptExpenseGroups.set(receiptId, {
      date: receipt?.receipt_date ?? expense.expense_date ?? expense.created_at,
      receiptId,
      total: expense.total_amount,
      vendor: receipt?.vendor ?? expense.description,
    });
  }

  const expenseReceiptItems: JobActivityItem[] = Array.from(receiptExpenseGroups.values()).map(
    (receiptGroup) => ({
      date: receiptGroup.date,
      detail: `${receiptGroup.vendor} - ${formatCurrency(receiptGroup.total, {
        showCents: true,
      })}`,
      id: `expense-receipt-${receiptGroup.receiptId}`,
      label: 'Receipt',
      receiptId: receiptGroup.receiptId,
      type: 'receipt',
    })
  );

  const manualExpenseItems: JobActivityItem[] = (expensesResult.data ?? [])
    .filter((expense) => !expense.receipt_id)
    .map((expense) => ({
      date: expense.expense_date ?? expense.created_at,
      detail: `${formatExpenseType(expense.expense_type)} - ${formatCurrency(expense.total_amount, {
        showCents: true,
      })}${expense.description ? ` - ${expense.description}` : ''}`,
      id: `expense-manual-${expense.id}`,
      label: 'Manual expense',
      type: 'expense',
    }));

  const draftReceiptItems: JobActivityItem[] = (receiptsResult.data ?? []).map((receipt) => ({
    date: receipt.receipt_date ?? receipt.created_at,
    detail: `${receipt.vendor ?? 'Receipt'} - ${
      receipt.total !== null
        ? formatCurrency(receipt.total, { showCents: true })
        : receipt.status
    }${receipt.category ? ` - ${receipt.category}` : ''}`,
    id: `receipt-${receipt.id}`,
    label: receipt.status === 'accepted' ? 'Receipt' : `Receipt - ${receipt.status}`,
    receiptId: receipt.id,
    type: 'receipt',
  }));

  const noteItems: JobActivityItem[] = (notesResult.data ?? []).map((note) => ({
    date: note.created_at,
    detail: note.note,
    id: `note-${note.id}`,
    label: 'Note',
    noteId: note.id,
    type: 'note',
  }));

  return [
    ...hourItems,
    ...paymentItems,
    ...expenseReceiptItems,
    ...manualExpenseItems,
    ...draftReceiptItems,
    ...noteItems,
  ]
    .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))
    .filter(dedupeActivityReceiptItems())
    .slice(0, 12);
}

function dedupeActivityReceiptItems() {
  const seenReceiptIds = new Set<string>();

  return (item: JobActivityItem) => {
    if (!item.receiptId) {
      return true;
    }

    if (seenReceiptIds.has(item.receiptId)) {
      return false;
    }

    seenReceiptIds.add(item.receiptId);
    return true;
  };
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 2,
  }).format(value);
}

function formatExpenseType(value: string | null): string {
  if (!value) {
    return 'Expense';
  }

  return value
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}
