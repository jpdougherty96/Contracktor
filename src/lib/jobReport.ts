import { supabase } from '@/src/lib/supabase';
import type { Tables } from '@/src/types/database';

export type JobReportExpense = Pick<
  Tables<'expenses'>,
  'id' | 'description' | 'expense_date' | 'expense_type' | 'status' | 'total_amount' | 'receipt_id'
> & {
  receiptImageUrl: string | null;
  receiptStatus: string | null;
  vendor: string | null;
};

export type JobReportHours = Pick<
  Tables<'time_entries'>,
  'id' | 'work_date' | 'duration_minutes' | 'hourly_rate' | 'worker_name' | 'description'
>;

export type JobReportPayment = Pick<
  Tables<'customer_payments'>,
  'id' | 'payment_date' | 'amount' | 'method' | 'note'
>;

export type JobReportNote = Pick<Tables<'job_notes'>, 'id' | 'created_at' | 'note'> & {
  photos: {
    filename: string | null;
    id: string;
    url: string | null;
  }[];
};

export type JobReportData = {
  expenses: JobReportExpense[];
  hours: JobReportHours[];
  notes: JobReportNote[];
  payments: JobReportPayment[];
};

type ExpenseRow = Pick<
  Tables<'expenses'>,
  'id' | 'description' | 'expense_date' | 'expense_type' | 'status' | 'total_amount' | 'receipt_id'
> & {
  receipts:
    | Pick<Tables<'receipts'>, 'vendor' | 'status' | 'storage_path'>
    | Pick<Tables<'receipts'>, 'vendor' | 'status' | 'storage_path'>[]
    | null;
};

export async function fetchJobReportData(jobId: string): Promise<JobReportData> {
  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError) {
    throw new Error(userError.message);
  }

  if (!userData.user) {
    return {
      expenses: [],
      hours: [],
      notes: [],
      payments: [],
    };
  }

  const [expensesResult, hoursResult, paymentsResult, notesResult, attachmentsResult] =
    await Promise.all([
      supabase
        .from('expenses')
        .select(
          'id, description, expense_date, expense_type, status, total_amount, receipt_id, receipts(vendor, status, storage_path)'
        )
        .eq('job_id', jobId)
        .eq('owner_id', userData.user.id)
        .neq('status', 'ignored')
        .order('expense_date', { ascending: false }),
      supabase
        .from('time_entries')
        .select('id, work_date, duration_minutes, hourly_rate, worker_name, description')
        .eq('job_id', jobId)
        .eq('owner_id', userData.user.id)
        .eq('status', 'reviewed')
        .order('work_date', { ascending: false }),
      supabase
        .from('customer_payments')
        .select('id, payment_date, amount, method, note')
        .eq('job_id', jobId)
        .eq('owner_id', userData.user.id)
        .order('payment_date', { ascending: false }),
      supabase
        .from('job_notes')
        .select('id, created_at, note')
        .eq('job_id', jobId)
        .eq('owner_id', userData.user.id)
        .order('created_at', { ascending: false }),
      supabase
        .from('attachments')
        .select('id, note_id, original_filename, storage_path')
        .eq('job_id', jobId)
        .eq('owner_id', userData.user.id)
        .order('created_at', { ascending: true }),
    ]);

  if (expensesResult.error) {
    throw new Error(expensesResult.error.message);
  }

  if (hoursResult.error) {
    throw new Error(hoursResult.error.message);
  }

  if (paymentsResult.error) {
    throw new Error(paymentsResult.error.message);
  }

  if (notesResult.error) {
    throw new Error(notesResult.error.message);
  }

  if (attachmentsResult.error) {
    throw new Error(attachmentsResult.error.message);
  }

  const attachmentsByNoteId = new Map<string, JobReportNote['photos']>();

  for (const attachment of attachmentsResult.data ?? []) {
    if (!attachment.note_id) {
      continue;
    }

    const currentAttachments = attachmentsByNoteId.get(attachment.note_id) ?? [];
    currentAttachments.push({
      filename: attachment.original_filename,
      id: attachment.id,
      url: await createSignedUrl('attachments', attachment.storage_path),
    });
    attachmentsByNoteId.set(attachment.note_id, currentAttachments);
  }

  const expenses = await Promise.all(
    ((expensesResult.data ?? []) as ExpenseRow[]).map(async (expense) => {
      const receipt = Array.isArray(expense.receipts) ? expense.receipts[0] : expense.receipts;

      return {
        description: expense.description,
        expense_date: expense.expense_date,
        expense_type: expense.expense_type,
        id: expense.id,
        receipt_id: expense.receipt_id,
        receiptImageUrl: receipt?.storage_path
          ? await createSignedUrl('receipts', receipt.storage_path)
          : null,
        receiptStatus: receipt?.status ?? null,
        status: expense.status,
        total_amount: expense.total_amount,
        vendor: receipt?.vendor ?? null,
      };
    })
  );

  return {
    expenses,
    hours: hoursResult.data ?? [],
    notes: (notesResult.data ?? []).map((note) => ({
      ...note,
      photos: attachmentsByNoteId.get(note.id) ?? [],
    })),
    payments: paymentsResult.data ?? [],
  };
}

async function createSignedUrl(bucket: 'attachments' | 'receipts', storagePath: string) {
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(storagePath, 60 * 60);

  if (error) {
    return null;
  }

  return data.signedUrl;
}
