import { formatCurrency } from '@/src/lib/financials';
import { fetchJobs } from '@/src/lib/jobs';
import { supabase } from '@/src/lib/supabase';
import type { Job } from '@/src/types/job';

export type GlobalActivityType =
  | 'activity_event'
  | 'expense'
  | 'hours'
  | 'job'
  | 'note'
  | 'payment'
  | 'receipt'
  | 'tell_submission';

export type GlobalActivityItem = {
  activityEventId?: string;
  attentionItemId?: string;
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
  tellSubmissionId?: string;
  reviewReason?: string;
  tone?: 'danger' | 'normal' | 'warning';
  type: GlobalActivityType;
};

export type GlobalActivitySummary = {
  hasPendingTellProcessing: boolean;
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
    return { hasPendingTellProcessing: false, items: [], needsReview: [], needsReviewCount: 0 };
  }

  const userId = userData.user.id;
  const jobs = await fetchJobs();
  const jobsById = new Map(jobs.map((job) => [job.id, job]));

  const [attentionResult, eventsResult, hoursResult, paymentsResult, expensesResult, receiptsResult, notesResult, tellsResult] = await Promise.all([
    supabase
      .from('attention_items')
      .select(
        'id, activity_event_id, business_id, owner_id, job_id, item_type, status, severity, source_table, source_id, title, detail, metadata, opened_at, created_at'
      )
      .order('opened_at', { ascending: false })
      .limit(200),
    supabase
      .from('activity_events')
      .select(
        'id, business_id, owner_id, actor_user_id, job_id, event_type, status, severity, source_table, source_id, title, detail, metadata, occurred_at, created_at'
      )
      .order('occurred_at', { ascending: false })
      .limit(80),
    supabase
      .from('time_entries')
      .select('id, job_id, duration_minutes, hourly_rate, work_date, worker_name, description, created_at, started_at, stopped_at, status, source')
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
      .select('id, scan_context_job_id, vendor, total, receipt_date, status, review_status, processing_status, category, error_message, last_processing_error, created_at, updated_at')
      .eq('owner_id', userId)
      .neq('status', 'voided')
      .order('created_at', { ascending: false })
      .limit(120),
    supabase
      .from('job_notes')
      .select('id, job_id, note, created_at')
      .eq('owner_id', userId)
      .order('created_at', { ascending: false })
      .limit(80),
    supabase
      .from('tell_contracktor_entries')
      .select('id, job_id, raw_text, status, created_at')
      .in('status', ['queued', 'processing'])
      .order('created_at', { ascending: false })
      .limit(20),
  ]);

  if (attentionResult.error) {
    throw new Error(attentionResult.error.message);
  }

  if (eventsResult.error) {
    throw new Error(eventsResult.error.message);
  }

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

  if (tellsResult.error) {
    throw new Error(tellsResult.error.message);
  }

  const items: GlobalActivityItem[] = [];
  const needsReview: GlobalActivityItem[] = [];
  const durableAttentionEventIds = new Set<string>();
  const durableAttentionSourceKeys = new Set<string>();
  const explicitAttentionReceiptIds = new Set<string>();
  const openTellAttentionIds = new Set<string>();
  const tellCreatedNoteIds = new Set<string>();
  const tellActivityGroups = new Map<
    string,
    {
      capturedAt: string | null;
      events: { eventType: string; title: string }[];
      jobIds: Set<string>;
      occurredAt: string | null;
    }
  >();

  for (const tell of tellsResult.data ?? []) {
    const job = getJob(jobsById, tell.job_id);
    items.push({
      capturedAt: tell.created_at,
      date: tell.created_at,
      detail: tell.raw_text === '[Photo update]' ? 'Photo update' : tell.raw_text,
      id: `tell-processing-${tell.id}`,
      job,
      jobId: tell.job_id,
      jobName: job ? job.name : 'Tell submission',
      label: 'Tell secured · Processing',
      tellSubmissionId: tell.id,
      tone: 'normal',
      type: 'tell_submission',
    });
  }

  for (const attention of attentionResult.data ?? []) {
    const sourceKey = getAttentionSourceKey(
      attention.item_type,
      attention.source_table,
      attention.source_id
    );
    durableAttentionSourceKeys.add(sourceKey);

    if (attention.activity_event_id) {
      durableAttentionEventIds.add(attention.activity_event_id);
    }

    if (attention.status !== 'open') {
      continue;
    }

    const job = getJob(jobsById, attention.job_id);
    const receiptId =
      attention.source_table === 'receipts' && attention.source_id
        ? attention.source_id
        : undefined;
    const tellSubmissionId =
      attention.source_table === 'tell_contracktor_entries' && attention.source_id
        ? attention.source_id
        : undefined;

    if (receiptId) {
      explicitAttentionReceiptIds.add(receiptId);
    }

    if (tellSubmissionId) {
      openTellAttentionIds.add(tellSubmissionId);
    }

    const reviewReason =
      receiptId && attention.title.toLowerCase().includes('destination')
        ? 'Choose where this receipt belongs'
        : attention.detail ?? (receiptId ? 'Receipt needs attention' : 'Needs attention');
    const item: GlobalActivityItem = {
      activityEventId: attention.activity_event_id ?? undefined,
      attentionItemId: attention.id,
      capturedAt: attention.created_at ?? attention.opened_at,
      date: attention.opened_at,
      detail: attention.detail ?? attention.item_type,
      id: `attention-item-${attention.id}`,
      job,
      jobId: attention.job_id,
      jobName: receiptId && !attention.job_id ? 'Receipt activity' : getJobName(job),
      label: attention.title,
      needsReview: true,
      receiptId,
      reviewReason,
      tellSubmissionId,
      tone: getActivityEventTone(attention.severity),
      type: receiptId ? 'receipt' : tellSubmissionId ? 'tell_submission' : 'activity_event',
    };

    items.push(item);
    needsReview.push(item);
  }

  for (const event of eventsResult.data ?? []) {
    if (event.event_type === 'tell_contracktor_processed') {
      continue;
    }

    const tellSubmissionId = getTellSubmissionId(event.metadata);

    if (tellSubmissionId) {
      const existing = tellActivityGroups.get(tellSubmissionId);
      const eventCapturedAt = event.created_at ?? event.occurred_at;

      if (event.source_table === 'job_notes' && event.source_id) {
        tellCreatedNoteIds.add(event.source_id);
      }

      if (existing) {
        existing.events.push({ eventType: event.event_type, title: event.title });
        if (event.job_id) existing.jobIds.add(event.job_id);
        existing.occurredAt = newestDate(existing.occurredAt, event.occurred_at);
        existing.capturedAt = newestDate(existing.capturedAt, eventCapturedAt);
      } else {
        tellActivityGroups.set(tellSubmissionId, {
          capturedAt: eventCapturedAt,
          events: [{ eventType: event.event_type, title: event.title }],
          jobIds: new Set(event.job_id ? [event.job_id] : []),
          occurredAt: event.occurred_at,
        });
      }

      continue;
    }

    const job = getJob(jobsById, event.job_id);
    const receiptId =
      event.source_table === 'receipts' && event.source_id ? event.source_id : undefined;
    const needsAttention =
      (event.status === 'needs_attention' || event.status === 'review_recommended') &&
      !durableAttentionEventIds.has(event.id) &&
      !durableAttentionSourceKeys.has(
        getAttentionSourceKey(event.event_type, event.source_table, event.source_id)
      );
    const reviewReason =
      receiptId && needsAttention && event.title.toLowerCase().includes('destination')
      ? 'Choose where this receipt belongs'
      : receiptId && needsAttention
          ? event.detail ?? 'Receipt needs attention'
          : needsAttention
            ? event.detail ?? 'Needs attention'
            : undefined;

    const item: GlobalActivityItem = {
      activityEventId: event.id,
      date: event.occurred_at,
      capturedAt: event.created_at ?? event.occurred_at,
      detail: event.detail ?? event.event_type,
      id: `activity-event-${event.id}`,
      job,
      jobId: event.job_id,
      jobName: receiptId && !event.job_id ? 'Receipt activity' : getJobName(job),
      label: event.title,
      needsReview: needsAttention,
      receiptId,
      reviewReason,
      tone: getActivityEventTone(event.severity),
      type: receiptId ? 'receipt' : 'activity_event',
    };

    items.push(item);

    if (item.needsReview) {
      needsReview.push(item);
    }
  }

  for (const [tellSubmissionId, group] of tellActivityGroups) {
    if (openTellAttentionIds.has(tellSubmissionId)) {
      continue;
    }

    const groupJobIds = Array.from(group.jobIds);
    const job = groupJobIds.length === 1 ? getJob(jobsById, groupJobIds[0]) : null;

    items.push({
      capturedAt: group.capturedAt,
      date: group.occurredAt,
      detail: formatTellActivityDetail(group.events),
      id: `tell-approved-${tellSubmissionId}`,
      job,
      jobId: job?.id ?? null,
      jobName: groupJobIds.length > 1 ? 'Multiple jobs' : getJobName(job),
      label: 'Tell update approved',
      tellSubmissionId,
      tone: 'normal',
      type: 'tell_submission',
    });
  }

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
    if (entry.source === 'tell_contracktor') {
      continue;
    }

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
    if (isReceiptProcessing(receipt.processing_status)) {
      const job = getJob(jobsById, receipt.scan_context_job_id);

      items.push({
        date: receipt.created_at,
        capturedAt: receipt.created_at,
        detail: getReceiptProcessingDetail(receipt.processing_status),
        id: `receipt-processing-${receipt.id}`,
        job,
        jobId: receipt.scan_context_job_id,
        jobName: getJobName(job),
        label: 'Receipt secured',
        receiptId: receipt.id,
        tone: 'normal',
        type: 'receipt',
      });
      continue;
    }

    const reviewReason = getReceiptReviewReason(
      receipt.processing_status,
      receipt.status,
      receipt.review_status,
      Boolean(receipt.scan_context_job_id),
      receipt.error_message ?? receipt.last_processing_error
    );

    if (!reviewReason) {
      continue;
    }

    if (explicitAttentionReceiptIds.has(receipt.id)) {
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
      jobName:
        receipt.review_status === 'needs_destination' && !receipt.scan_context_job_id
          ? 'Destination needed'
          : getJobName(job),
      label:
        receipt.review_status === 'needs_destination' && !receipt.scan_context_job_id
          ? 'Receipt needs destination'
          : 'Receipt needs attention',
      needsReview: true,
      receiptId: receipt.id,
      reviewReason,
      tone: receipt.processing_status === 'failed' || receipt.status === 'error' ? 'danger' : 'warning',
      type: 'receipt',
    };

    items.push(item);
    needsReview.push(item);
  }

  for (const note of notesResult.data ?? []) {
    if (tellCreatedNoteIds.has(note.id)) {
      continue;
    }

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

  const sortedItems = collapseReceiptActivityItems(items).sort(sortNewestFirst).slice(0, 80);
  const sortedNeedsReview = needsReview.sort(sortNewestFirst).filter(dedupeNeedsReview()).slice(0, 20);

  return {
    hasPendingTellProcessing: (tellsResult.data ?? []).length > 0,
    items: sortedItems,
    needsReview: sortedNeedsReview,
    needsReviewCount: sortedNeedsReview.length,
  };
}

function getTellSubmissionId(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return null;
  }

  const record = metadata as Record<string, unknown>;
  const entryId = record.tell_entry_id ?? record.source_entry_id;
  return typeof entryId === 'string' && entryId ? entryId : null;
}

function newestDate(left: string | null, right: string | null): string | null {
  if (!left) return right;
  if (!right) return left;
  return left.localeCompare(right) >= 0 ? left : right;
}

function formatTellActivityDetail(
  events: { eventType: string; title: string }[]
): string {
  const counts = new Map<string, number>();

  for (const event of events) {
    const category =
      event.eventType === 'note_added'
        ? 'job update'
        : event.eventType === 'hours_logged'
          ? 'hours entry'
          : event.eventType.startsWith('shopping_need_')
            ? 'shopping item'
            : event.title.toLowerCase();
    counts.set(category, (counts.get(category) ?? 0) + 1);
  }

  const parts = Array.from(counts.entries()).map(([category, count]) =>
    count === 1 ? category : `${count} ${pluralizeTellActivityCategory(category)}`
  );
  const recordLabel = events.length === 1 ? 'record' : 'records';
  return `${events.length} ${recordLabel} added${parts.length > 0 ? ` · ${parts.join(', ')}` : ''}`;
}

function pluralizeTellActivityCategory(category: string): string {
  if (category === 'hours entry') return 'hours entries';
  if (category === 'job update') return 'job updates';
  if (category === 'shopping item') return 'shopping items';
  return `${category}s`;
}

function getAttentionSourceKey(
  itemType: string,
  sourceTable: string | null,
  sourceId: string | null
): string {
  return `${itemType}:${sourceTable ?? ''}:${sourceId ?? ''}`;
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

function collapseReceiptActivityItems(items: GlobalActivityItem[]): GlobalActivityItem[] {
  const bestReceiptItems = new Map<string, GlobalActivityItem>();
  const nonReceiptItems: GlobalActivityItem[] = [];

  for (const item of items) {
    if (!item.receiptId) {
      nonReceiptItems.push(item);
      continue;
    }

    const existing = bestReceiptItems.get(item.receiptId);

    if (!existing || compareReceiptActivityItem(item, existing) > 0) {
      bestReceiptItems.set(item.receiptId, item);
    }
  }

  return [...nonReceiptItems, ...bestReceiptItems.values()];
}

function compareReceiptActivityItem(
  candidate: GlobalActivityItem,
  existing: GlobalActivityItem
): number {
  const priorityDelta = getReceiptActivityPriority(candidate) - getReceiptActivityPriority(existing);

  if (priorityDelta !== 0) {
    return priorityDelta;
  }

  return (candidate.capturedAt ?? candidate.date ?? '').localeCompare(
    existing.capturedAt ?? existing.date ?? ''
  );
}

function getReceiptActivityPriority(item: GlobalActivityItem): number {
  if (item.needsReview) {
    return 100;
  }

  if (item.id.startsWith('receipt-expense-') || item.label === 'Receipt saved') {
    return 80;
  }

  if (item.label === 'Receipt read') {
    return 60;
  }

  if (item.id.startsWith('receipt-processing-')) {
    return 40;
  }

  if (item.label === 'Receipt secured') {
    return 30;
  }

  return 10;
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
  processingStatus: string | null,
  status: string | null,
  reviewStatus: string | null,
  hasKnownDestination: boolean,
  errorMessage: string | null
): string | null {
  if (processingStatus === 'failed' || status === 'error') {
    return errorMessage || 'Receipt parsing failed';
  }

  if (reviewStatus === 'needs_destination') {
    return hasKnownDestination ? 'Review and save this receipt' : 'Choose where this receipt belongs';
  }

  if (status === 'needs_review' || reviewStatus === 'needs_review') {
    return 'Receipt needs attention';
  }

  return null;
}

function isReceiptProcessing(processingStatus: string | null): boolean {
  return (
    processingStatus === 'uploading' ||
    processingStatus === 'queued' ||
    processingStatus === 'processing'
  );
}

function getReceiptProcessingDetail(processingStatus: string | null): string {
  if (processingStatus === 'uploading') {
    return 'Receipt photo upload has not finished.';
  }

  if (processingStatus === 'queued') {
    return 'Receipt is waiting to be read.';
  }

  return 'Receipt is being read in the background.';
}

function getActivityEventTone(severity: string | null): GlobalActivityItem['tone'] {
  if (severity === 'danger') {
    return 'danger';
  }

  if (severity === 'warning') {
    return 'warning';
  }

  return 'normal';
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
