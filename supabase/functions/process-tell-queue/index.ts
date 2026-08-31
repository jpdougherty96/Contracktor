import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const maxJobsPerRun = 3;
const maxProcessingAttempts = 3;
const tellProcessingTimeoutMs = 60_000;

Deno.serve(async (req) => {
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  const workerSecret = Deno.env.get('TELL_WORKER_SECRET') ?? Deno.env.get('RECEIPT_WORKER_SECRET');
  if (!workerSecret || req.headers.get('x-worker-secret') !== workerSecret) {
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ error: 'Missing Tell worker secrets' }, 500);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: jobs, error: claimError } = await supabase.rpc('claim_tell_processing_jobs', {
    p_limit: maxJobsPerRun,
    p_visibility_timeout: 180,
  });
  if (claimError) return jsonResponse({ error: claimError.message }, 500);

  const claimedJobs = jobs ?? [];
  const processing = Promise.allSettled(
    claimedJobs.map((job) =>
      processClaimedJob({
        entryId: String(job.entry_id),
        msgId: Number(job.msg_id),
        serviceRoleKey,
        supabase,
        supabaseUrl,
        workerSecret,
      })
    )
  );
  const runtime = globalThis as unknown as {
    EdgeRuntime?: { waitUntil(promise: Promise<unknown>): void };
  };

  if (runtime.EdgeRuntime) {
    runtime.EdgeRuntime.waitUntil(processing);
  } else {
    await processing;
  }

  return jsonResponse({ claimed: claimedJobs.length, status: 'accepted' }, 202);
});

async function processClaimedJob({
  entryId,
  msgId,
  serviceRoleKey,
  supabase,
  supabaseUrl,
  workerSecret,
}: {
  entryId: string;
  msgId: number;
  serviceRoleKey: string;
  supabase: ReturnType<typeof createClient>;
  supabaseUrl: string;
  workerSecret: string;
}) {
  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/tell-contracktor`, {
      body: JSON.stringify({ process_entry_id: entryId }),
      headers: {
        Authorization: `Bearer ${serviceRoleKey}`,
        'Content-Type': 'application/json',
        apikey: serviceRoleKey,
        'x-worker-secret': workerSecret,
      },
      method: 'POST',
      signal: AbortSignal.timeout(tellProcessingTimeoutMs),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(
        typeof body?.error === 'string' ? body.error : `Tell worker failed (${response.status}).`
      );
    }

    const { error: deleteError } = await supabase.rpc('delete_tell_processing_job', {
      p_msg_id: msgId,
    });
    if (deleteError) throw new Error(deleteError.message);
  } catch (error) {
    const message =
      error instanceof DOMException && error.name === 'TimeoutError'
        ? 'Tell processing timed out and will be retried.'
        : error instanceof Error
          ? error.message
          : 'Tell processing failed.';
    const { data: entry } = await supabase
      .from('tell_contracktor_entries')
      .select('id, business_id, owner_id, job_id, processing_attempts')
      .eq('id', entryId)
      .maybeSingle();

    if (!entry) {
      const { error: deleteError } = await supabase.rpc('delete_tell_processing_job', {
        p_msg_id: msgId,
      });
      if (deleteError) {
        console.error('Unable to discard orphaned Tell queue message', {
          entry_id: entryId,
          error: deleteError.message,
          msg_id: msgId,
        });
      } else {
        console.warn('Discarded orphaned Tell queue message', {
          entry_id: entryId,
          msg_id: msgId,
        });
      }
      return;
    }

    const attempts = entry?.processing_attempts ?? 0;

    const { error: updateError } = await supabase
      .from('tell_contracktor_entries')
      .update({
        last_processing_error: message,
        status: attempts >= maxProcessingAttempts ? 'failed' : 'queued',
      })
      .eq('id', entryId);
    if (updateError) {
      console.error('Unable to record Tell processing failure', {
        entry_id: entryId,
        error: updateError.message,
      });
    }

    if (attempts >= maxProcessingAttempts) {
      const { data: activityEvent } = await supabase
        .from('activity_events')
        .upsert(
          {
            actor_user_id: entry.owner_id,
            business_id: entry.business_id,
            created_by_user_id: entry.owner_id,
            detail: 'Open this Tell to retry or edit the original update.',
            event_type: 'tell_contracktor_processed',
            job_id: entry.job_id,
            metadata: { processing_failed: true },
            owner_id: entry.owner_id,
            severity: 'danger',
            source_id: entry.id,
            source_table: 'tell_contracktor_entries',
            status: 'needs_attention',
            title: "Tell couldn't be processed",
          },
          { onConflict: 'business_id,event_type,source_table,source_id' }
        )
        .select('id')
        .single();
      await supabase.from('attention_items').upsert(
        {
          activity_event_id: activityEvent?.id ?? null,
          business_id: entry.business_id,
          detail: 'Retry or edit the original update.',
          item_type: 'tell_submission',
          job_id: entry.job_id,
          metadata: { processing_failed: true },
          owner_id: entry.owner_id,
          severity: 'danger',
          source_id: entry.id,
          source_table: 'tell_contracktor_entries',
          status: 'open',
          title: "Tell couldn't be processed",
        },
        { onConflict: 'business_id,item_type,source_table,source_id' }
      );
      await supabase.rpc('delete_tell_processing_job', { p_msg_id: msgId });
    }

    console.error('Tell queue job failed', {
      attempts,
      entry_id: entryId,
      error: message,
      status: attempts >= maxProcessingAttempts ? 'failed' : 'will_retry',
    });
  }
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json' },
    status,
  });
}
