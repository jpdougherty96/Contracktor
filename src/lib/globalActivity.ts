import { formatCurrency } from '@/src/lib/financials';
import { fetchJobs } from '@/src/lib/jobs';
import { supabase } from '@/src/lib/supabase';
import type { Job } from '@/src/types/job';

export type GlobalActivityType = 'expense' | 'hours' | 'job' | 'note' | 'payment' | 'receipt';

export type GlobalActivityItem = {
  capturedAt?: string | null;
  date: string | null;
  detail: string;
  hoursId?: string;
  id: string;
  job?: Job | null;
  jobId?: string | null;
  jobName?: string;
  label: string;
  needsReview?: boolean;
  noteId?: string;
  paymentId?: string;
  receiptId?: string;
  receiptIncludesInventoryDestination?: boolean;
  receiptJobs?: Job[];
  reviewReason?: string;
  tone?: 'danger' | 'normal' | 'warning';
  type: GlobalActivityType;
};

export type GlobalActivitySummary = {
  items: GlobalActivityItem[];
  needsReview: GlobalActivityItem[];
  needsReviewCount: number;
};

export async function fetchGlobalActivity(): Promise<GlobalActivitySummary> {
  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError) {
    throw new Error(userError.message);
  }

  if (!userData.user) {
    return { items: [], needsReview: [], needsReviewCount: 0 };
  }

  const userId = userData.user.id;
  const jobs = await fetchJobs();
  const jobsById = new Map(jobs.map((job) => [job.id, job]));

  const [hoursResult, paymentsResult, expensesResult, receiptsResult, notesResult] = await Promise.all([
    supabase
      .from('time_entries')
      .select('id, job_id, duration_minutes, hourly_rate, work_date, worker_name, description, created_at, started_at, stopped_at, status')
      .eq('owner_id', userId)
      .order('created_at', { ascending: false })
      .limit(80),
    supabase
      .from('customer_payments')
      .select('id, job_id, amount, payment_date, note, created_at')
      .eq('owner_id', userId)
      .order('created_at', { ascending: false })
      .limit(80),
    supabase
      .from('expenses')
      .select('id, job_id, receipt_id, description, expense_date, expense_type, source_type, total_amount, status, created_at, receipts(id, vendor, receipt_date, total, status, review_status)')
      .eq('owner_id', userId)
      .neq('status', 'ignored')
      .order('created_at', { ascending: false })
      .limit(120),
    supabase
      .from('receipts')
      .select('id, scan_context_job_id, vendor, total, receipt_date, status, review_status, category, error_message, created_at, updated_at')
      .eq('owner_id', userId)
      .order('created_at', { ascending: false })
      .limit(120),
    supabase
      .from('job_notes')
      .select('id, job_id, note, created_at')
      .eq('owner_id', userId)
      .order('created_at', { ascending: false })
      .limit(80),
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

  const items: GlobalActivityItem[] = [];
  const needsReview: GlobalActivityItem[] = [];

  for (const job of jobs) {
    const hasTrackedActivity =
      (job.actualMaterialCost ?? 0) > 0 || (job.actualLaborHours ?? 0) > 0;
    const missingBudget =
      job.status === 'active' &&
      hasTrackedActivity &&
      job.jobType === 'fixed_bid' &&
      !hasUsableMaterialBudget(job) &&
      !hasUsableLaborBudget(job);

    if (missingBudget) {
      needsReview.push({
        date: job.updatedAt ?? job.createdAt ?? null,
        capturedAt: job.updatedAt ?? job.createdAt ?? null,
        detail: 'This active job has activity but no material or labor budget.',
        id: `job-budget-${job.id}`,
        job,
        jobId: job.id,
        jobName: job.name,
        label: 'Budget missing',
        needsReview: true,
        reviewReason: 'Budget missing',
        tone: 'warning',
        type: 'job',
      });
    }
  }

  for (const entry of hoursResult.data ?? []) {
    const job = getJob(jobsById, entry.job_id);
    const isLongRunningTimer = Boolean(
      entry.status === 'active' &&
      entry.started_at &&
      !entry.stopped_at &&
      Date.now() - new Date(entry.started_at).getTime() > 12 * 60 * 60 * 1000
    );

    const item: GlobalActivityItem = {
      date: entry.work_date ?? entry.created_at,
      capturedAt: entry.created_at,
      detail: `${formatDurationMinutes(entry.duration_minutes)} at ${formatCurrency(entry.hourly_rate, {
        showCents: true,
      })}/hr${entry.description ? ` - ${entry.description}` : ''}`,
      hoursId: entry.id,
      id: `hours-${entry.id}`,
      job,
      jobId: entry.job_id,
      jobName: getJobName(job),
      label: entry.worker_name ? `Hours - ${entry.worker_name}` : 'Hours',
      needsReview: isLongRunningTimer,
      reviewReason: isLongRunningTimer ? 'Timer may still be running' : undefined,
      tone: isLongRunningTimer ? 'warning' : 'normal',
      type: 'hours',
    };

    items.push(item);

    if (item.needsReview) {
      needsReview.push(item);
    }
  }

  for (const payment of paymentsResult.data ?? []) {
    const job = getJob(jobsById, payment.job_id);

    items.push({
      date: payment.payment_date ?? payment.created_at,
      capturedAt: payment.created_at,
      detail: `${formatCurrency(payment.amount, { showCents: true })}${
        payment.note ? ` - ${payment.note}` : ''
      }`,
      id: `payment-${payment.id}`,
      job,
      jobId: payment.job_id,
      jobName: getJobName(job),
      label: 'Payment received',
      paymentId: payment.id,
      tone: 'normal',
      type: 'payment',
    });
  }

  const receiptExpenseGroups = new Map<
    string,
    {
      date: string | null;
      capturedAt: string | null;
      destinations: Map<
        string,
        {
          job: Job | null;
          jobId: string | null;
          label: string;
          total: number;
        }
      >;
      receiptId: string;
      total: number;
      vendor: string;
    }
  >();

  for (const expense of expensesResult.data ?? []) {
    const job = getJob(jobsById, expense.job_id);
    const receipt = Array.isArray(expense.receipts) ? expense.receipts[0] : expense.receipts;

    if (expense.receipt_id) {
      const existing = receiptExpenseGroups.get(expense.receipt_id);
      const destinationKey = expense.job_id ? `job:${expense.job_id}` : 'tools_inventory';
      const destinationLabel = job ? job.name : 'Tools / Inventory';

      if (existing) {
        existing.total += expense.total_amount ?? 0;
        const existingDestination = existing.destinations.get(destinationKey);

        if (existingDestination) {
          existingDestination.total += expense.total_amount ?? 0;
        } else {
          existing.destinations.set(destinationKey, {
            job,
            jobId: expense.job_id,
            label: destinationLabel,
            total: expense.total_amount ?? 0,
          });
        }
      } else {
        receiptExpenseGroups.set(expense.receipt_id, {
          date: receipt?.receipt_date ?? expense.expense_date ?? expense.created_at,
          capturedAt: expense.created_at,
          destinations: new Map([
            [
              destinationKey,
              {
                job,
                jobId: expense.job_id,
                label: destinationLabel,
                total: expense.total_amount ?? 0,
              },
            ],
          ]),
          receiptId: expense.receipt_id,
          total: expense.total_amount ?? 0,
          vendor: receipt?.vendor ?? expense.description ?? 'Receipt',
        });
      }

      continue;
    }

    items.push({
      date: expense.expense_date ?? expense.created_at,
      capturedAt: expense.created_at,
      detail: `${formatExpenseType(expense.expense_type)} - ${formatCurrency(expense.total_amount, {
        showCents: true,
      })}${expense.description ? ` - ${expense.description}` : ''}`,
      id: `manual-expense-${expense.id}`,
      job,
      jobId: expense.job_id,
      jobName: getJobName(job),
      label: expense.job_id ? 'Manual expense' : 'Tools / Inventory expense',
      tone: 'normal',
      type: 'expense',
    });
  }

  for (const receiptGroup of receiptExpenseGroups.values()) {
    const destinations = Array.from(receiptGroup.destinations.values());
    const jobDestinations = destinations
      .map((destination) => destination.job)
      .filter((job): job is Job => Boolean(job));
    const includesInventoryDestination = destinations.some((destination) => !destination.jobId);
    const isMultiDestination = destinations.length > 1;

    items.push({
      date: receiptGroup.date,
      capturedAt: receiptGroup.capturedAt,
      detail: formatReceiptActivityDetail(receiptGroup.vendor, receiptGroup.total, destinations),
      id: `receipt-expense-${receiptGroup.receiptId}`,
      job: isMultiDestination ? null : destinations[0]?.job ?? null,
      jobId: isMultiDestination ? null : destinations[0]?.jobId ?? null,
      jobName: isMultiDestination ? 'Multiple destinations' : destinations[0]?.label ?? 'Tools / Inventory',
      label: 'Receipt saved',
      receiptId: receiptGroup.receiptId,
      receiptIncludesInventoryDestination: includesInventoryDestination,
      receiptJobs: jobDestinations,
      tone: 'normal',
      type: 'receipt',
    });
  }

  for (const receipt of receiptsResult.data ?? []) {
    const reviewReason = getReceiptReviewReason(receipt.status, receipt.review_status, receipt.error_message);

    if (!reviewReason) {
      continue;
    }

    const job = getJob(jobsById, receipt.scan_context_job_id);
    const item: GlobalActivityItem = {
      date: receipt.receipt_date ?? receipt.created_at,
      capturedAt: receipt.created_at,
      detail: `${receipt.vendor ?? 'Receipt'}${
        receipt.total !== null ? ` - ${formatCurrency(receipt.total, { showCents: true })}` : ''
      }${receipt.category ? ` - ${receipt.category}` : ''}`,
      id: `receipt-review-${receipt.id}`,
      job,
      jobId: receipt.scan_context_job_id,
      jobName: getJobName(job),
      label: 'Receipt needs review',
      needsReview: true,
      receiptId: receipt.id,
      reviewReason,
      tone: receipt.status === 'error' ? 'danger' : 'warning',
      type: 'receipt',
    };

    items.push(item);
    needsReview.push(item);
  }

  for (const note of notesResult.data ?? []) {
    const job = getJob(jobsById, note.job_id);

    items.push({
      date: note.created_at,
      capturedAt: note.created_at,
      detail: note.note,
      id: `note-${note.id}`,
      job,
      jobId: note.job_id,
      jobName: getJobName(job),
      label: 'Note added',
      noteId: note.id,
      tone: 'normal',
      type: 'note',
    });
  }

  const sortedItems = items.sort(sortNewestFirst).filter(dedupeGlobalReceiptItems()).slice(0, 80);
  const sortedNeedsReview = needsReview.sort(sortNewestFirst).filter(dedupeNeedsReview()).slice(0, 20);

  return {
    items: sortedItems,
    needsReview: sortedNeedsReview,
    needsReviewCount: sortedNeedsReview.length,
  };
}

function dedupeGlobalReceiptItems() {
  const seenNeedsReviewReceiptIds = new Set<string>();

  return (item: GlobalActivityItem) => {
    if (!item.needsReview || !item.receiptId) {
      return true;
    }

    if (seenNeedsReviewReceiptIds.has(item.receiptId)) {
      return false;
    }

    seenNeedsReviewReceiptIds.add(item.receiptId);
    return true;
  };
}

function dedupeNeedsReview() {
  const seenIds = new Set<string>();

  return (item: GlobalActivityItem) => {
    const key = item.receiptId ? `receipt-${item.receiptId}` : item.id;

    if (seenIds.has(key)) {
      return false;
    }

    seenIds.add(key);
    return true;
  };
}

function sortNewestFirst(a: GlobalActivityItem, b: GlobalActivityItem) {
  return (b.date ?? '').localeCompare(a.date ?? '');
}

function getJob(jobsById: Map<string, Job>, jobId: string | null): Job | null {
  if (!jobId) {
    return null;
  }

  return jobsById.get(jobId) ?? null;
}

function getJobName(job: Job | null): string {
  return job?.name ?? 'Tools / Inventory';
}

function formatReceiptActivityDetail(
  vendor: string,
  total: number,
  destinations: { label: string; total: number }[]
): string {
  const summary = `${vendor} - ${formatCurrency(total, { showCents: true })}`;

  if (destinations.length <= 1) {
    return summary;
  }

  return [
    summary,
    ...destinations.map(
      (destination) =>
        `${destination.label}: ${formatCurrency(destination.total, { showCents: true })}`
    ),
  ].join('\n');
}

function hasUsableMaterialBudget(job: Job): boolean {
  return typeof job.estimatedMaterialCost === 'number' && job.estimatedMaterialCost > 0;
}

function hasUsableLaborBudget(job: Job): boolean {
  return typeof job.estimatedLaborHours === 'number' && job.estimatedLaborHours > 0;
}

function getReceiptReviewReason(
  status: string | null,
  reviewStatus: string | null,
  errorMessage: string | null
): string | null {
  if (status === 'error') {
    return errorMessage || 'Receipt parsing failed';
  }

  if (status === 'needs_review' || reviewStatus === 'needs_review') {
    return 'Receipt needs review';
  }

  if (status === 'processing') {
    return 'Receipt is still processing';
  }

  return null;
}

function formatDurationMinutes(minutes: number | null): string {
  const safeMinutes = minutes ?? 0;

  if (safeMinutes < 60) {
    return `${Math.max(1, Math.round(safeMinutes))} min`;
  }

  const hours = safeMinutes / 60;

  return `${new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 2,
  }).format(hours)} hrs`;
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
