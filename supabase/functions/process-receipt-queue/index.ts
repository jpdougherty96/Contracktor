import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

import { processReceiptImage } from '../_shared/receipt-processing.ts';

const maxJobsPerRun = 3;
const maxProcessingAttempts = 3;

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  const workerSecret = Deno.env.get('RECEIPT_WORKER_SECRET');
  const requestSecret = req.headers.get('x-worker-secret');

  if (!workerSecret || requestSecret !== workerSecret) {
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const openAiApiKey = Deno.env.get('OPENAI_API_KEY');
  const openAiModel = Deno.env.get('OPENAI_RECEIPT_MODEL') ?? 'gpt-5.4-mini';

  if (!supabaseUrl || !serviceRoleKey || !openAiApiKey) {
    return jsonResponse({ error: 'Missing worker secrets' }, 500);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const { data: jobs, error: claimError } = await supabase.rpc('claim_receipt_processing_jobs', {
    p_limit: maxJobsPerRun,
    p_visibility_timeout: 300,
  });

  if (claimError) {
    return jsonResponse({ error: claimError.message }, 500);
  }

  const results = [];

  for (const job of jobs ?? []) {
    const msgId = Number(job.msg_id);
    const receiptId = String(job.receipt_id);

    try {
      const { data: receipt, error: receiptError } = await supabase
        .from('receipts')
        .select('id, processing_status')
        .eq('id', receiptId)
        .single();

      if (receiptError || !receipt) {
        throw new Error(receiptError?.message ?? 'Receipt not found.');
      }

      if (receipt.processing_status === 'complete') {
        await deleteQueueMessage(supabase, msgId);
        results.push({ receipt_id: receiptId, status: 'already_complete' });
        continue;
      }

      const { error: processingStateError } = await supabase.rpc('mark_receipt_processing', {
        p_receipt_id: receiptId,
      });

      if (processingStateError) {
        throw new Error(processingStateError.message);
      }

      const processingResult = await processReceiptImage(supabase, {
        openAiApiKey,
        openAiModel,
        receiptId,
        throwOnFailure: true,
      });
      await recordReceiptProcessedEvent(supabase, processingResult.receipt);
      await deleteQueueMessage(supabase, msgId);
      results.push({ receipt_id: receiptId, status: 'processed' });
    } catch (error) {
      const attempts = await fetchProcessingAttempts(supabase, receiptId);

      if (attempts >= maxProcessingAttempts) {
        await recordReceiptTerminalFailureEvent(
          supabase,
          receiptId,
          error instanceof Error ? error.message : 'Receipt processing failed.'
        ).catch(() => undefined);
        await deleteQueueMessage(supabase, msgId);
        results.push({
          error: error instanceof Error ? error.message : 'Receipt processing failed.',
          receipt_id: receiptId,
          status: 'failed_terminal',
        });
        continue;
      }

      results.push({
        attempts,
        error: error instanceof Error ? error.message : 'Receipt processing failed.',
        receipt_id: receiptId,
        status: 'will_retry',
      });
    }
  }

  return jsonResponse({ processed: results.length, results });
});

async function deleteQueueMessage(
  supabase: ReturnType<typeof createClient>,
  msgId: number
): Promise<void> {
  const { error } = await supabase.rpc('delete_receipt_processing_job', {
    p_msg_id: msgId,
  });

  if (error) {
    throw new Error(error.message);
  }
}

async function fetchProcessingAttempts(
  supabase: ReturnType<typeof createClient>,
  receiptId: string
): Promise<number> {
  const { data } = await supabase
    .from('receipts')
    .select('processing_attempts')
    .eq('id', receiptId)
    .maybeSingle();

  return typeof data?.processing_attempts === 'number' ? data.processing_attempts : 0;
}

async function recordReceiptProcessedEvent(
  supabase: ReturnType<typeof createClient>,
  receipt: unknown
): Promise<void> {
  if (!receipt || typeof receipt !== 'object') {
    return;
  }

  const row = receipt as {
    business_id?: string;
    category?: string | null;
    created_by_user_id?: string | null;
    id?: string;
    owner_id?: string;
    processing_status?: string | null;
    review_status?: string | null;
    scan_context_job_id?: string | null;
    total?: number | null;
    vendor?: string | null;
  };

  if (!row.id || !row.business_id || !row.owner_id) {
    return;
  }

  const needsAttention =
    row.review_status === 'needs_destination' ||
    row.review_status === 'needs_review' ||
    row.review_status === 'error';

  const title =
    row.review_status === 'needs_destination'
      ? 'Receipt needs destination'
      : row.review_status === 'needs_review' || row.review_status === 'error'
        ? 'Receipt needs review'
        : 'Receipt read';

  const detail = `${row.vendor ?? 'Receipt'}${
    typeof row.total === 'number' ? ` - ${formatMoney(row.total)}` : ''
  }`;

  await upsertActivityEvent(supabase, {
    business_id: row.business_id,
    owner_id: row.owner_id,
    actor_user_id: row.created_by_user_id ?? row.owner_id,
    created_by_user_id: row.created_by_user_id ?? row.owner_id,
    job_id: row.scan_context_job_id ?? null,
    event_type: 'receipt_activity',
    status: needsAttention ? 'needs_attention' : 'completed',
    severity: needsAttention ? 'warning' : 'normal',
    source_table: 'receipts',
    source_id: row.id,
    title,
    detail,
    metadata: {
      category: row.category,
      processing_status: row.processing_status,
      review_status: row.review_status,
    },
  });
}

async function recordReceiptTerminalFailureEvent(
  supabase: ReturnType<typeof createClient>,
  receiptId: string,
  errorMessage: string
): Promise<void> {
  const { data: receipt } = await supabase
    .from('receipts')
    .select('id, owner_id, business_id, created_by_user_id, scan_context_job_id, vendor, total')
    .eq('id', receiptId)
    .maybeSingle();

  if (!receipt) {
    return;
  }

  await upsertActivityEvent(supabase, {
    business_id: receipt.business_id,
    owner_id: receipt.owner_id,
    actor_user_id: receipt.created_by_user_id ?? receipt.owner_id,
    created_by_user_id: receipt.created_by_user_id ?? receipt.owner_id,
    job_id: receipt.scan_context_job_id,
    event_type: 'receipt_activity',
    status: 'needs_attention',
    severity: 'danger',
    source_table: 'receipts',
    source_id: receipt.id,
    title: 'Receipt processing failed',
    detail: errorMessage,
    metadata: {
      vendor: receipt.vendor,
      total: receipt.total,
    },
  });
}

async function upsertActivityEvent(
  supabase: ReturnType<typeof createClient>,
  event: {
    actor_user_id: string | null;
    business_id: string;
    created_by_user_id: string | null;
    detail: string | null;
    event_type: string;
    job_id: string | null;
    metadata: Record<string, unknown>;
    owner_id: string;
    severity: 'danger' | 'normal' | 'warning';
    source_id: string;
    source_table: string;
    status: 'completed' | 'needs_attention' | 'review_recommended' | 'resolved';
    title: string;
  }
): Promise<void> {
  const { error } = await supabase.from('activity_events').upsert(event, {
    onConflict: 'business_id,event_type,source_table,source_id',
  });

  if (error) {
    throw new Error(error.message);
  }
}

function formatMoney(value: number): string {
  return new Intl.NumberFormat('en-US', {
    currency: 'USD',
    style: 'currency',
  }).format(value);
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: {
      'Content-Type': 'application/json',
    },
    status,
  });
}
