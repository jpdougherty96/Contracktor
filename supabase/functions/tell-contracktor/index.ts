import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Origin': '*',
};
const openAiProcessingTimeoutMs = 45_000;
const defaultOpenAiModel = 'gpt-5.4-mini';
const defaultOpenAiFallbackModel = 'gpt-4o-mini';

type JobRow = {
  business_id: string;
  client_name: string | null;
  id: string;
  name: string;
  owner_id: string;
  status: string;
};

type ParsedTellInput = {
  cleaned_note: string;
  hours: Array<{
    date: string | null;
    hours: number | null;
    job_id: string | null;
    note: string | null;
    worker_name: string | null;
  }>;
  job_match_confidence: number;
  matched_job_id: string | null;
  needs_job_confirmation: boolean;
  payments: Array<{
    amount: number | null;
    date: string | null;
    job_id: string | null;
    memo: string | null;
    method: string | null;
  }>;
  scope_or_budget_impact: boolean;
  shopping_needs: Array<{
    description: string;
    job_id: string | null;
    normalized_name: string | null;
    quantity: number | null;
    unit: string | null;
  }>;
  summary: string;
};

type TellPhotoInput = {
  base64: string;
  mime_type: string;
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: corsHeaders,
      status: 204,
    });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  const body = await readBody(req);
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseKey = req.headers.get('apikey') ?? Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const openAiApiKey = Deno.env.get('OPENAI_API_KEY');
  const openAiModel = Deno.env.get('OPENAI_COMMAND_MODEL') ?? defaultOpenAiModel;
  const openAiFallbackModel =
    Deno.env.get('OPENAI_COMMAND_FALLBACK_MODEL') ?? defaultOpenAiFallbackModel;
  const workerSecret = Deno.env.get('TELL_WORKER_SECRET') ?? Deno.env.get('RECEIPT_WORKER_SECRET');

  const processEntryId =
    typeof body.process_entry_id === 'string' ? body.process_entry_id.trim() : '';

  if (processEntryId) {
    if (!workerSecret || req.headers.get('x-worker-secret') !== workerSecret) {
      return jsonResponse({ error: 'Unauthorized' }, 401);
    }

    if (!supabaseUrl || !serviceRoleKey || !openAiApiKey) {
      return jsonResponse({ error: 'Missing Tell worker secrets' }, 500);
    }

    try {
      const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
      const result = await processQueuedTellEntry(
        serviceClient,
        processEntryId,
        openAiApiKey,
        openAiModel,
        openAiFallbackModel
      );
      return jsonResponse(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Tell processing failed.';
      console.error('Tell processor failed', {
        entry_id: processEntryId,
        error: message,
      });
      return jsonResponse(
        { error: message },
        500
      );
    }
  }

  if (!supabaseUrl || !supabaseKey) {
    return jsonResponse({ error: 'Missing Edge Function secrets' }, 500);
  }

  const authorization = req.headers.get('Authorization');

  if (!authorization?.startsWith('Bearer ')) {
    return jsonResponse({ error: 'Missing authenticated user token' }, 401);
  }

  const rawText = typeof body.text === 'string' ? body.text.trim() : '';
  const contextJobId = typeof body.job_id === 'string' ? body.job_id : null;
  const localDate = typeof body.local_date === 'string' ? body.local_date : new Date().toISOString().slice(0, 10);
  const photos = readPhotoInputs(body.photos);

  if (!rawText && photos.length === 0) {
    return jsonResponse({ error: 'Tell conTRACKtor text or photos are required.' }, 400);
  }

  if (photos.length > 4) {
    return jsonResponse({ error: 'Tell conTRACKtor can read up to 4 photos at once.' }, 400);
  }

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    global: {
      headers: {
        Authorization: authorization,
      },
    },
  });
  const jwt = authorization.replace('Bearer ', '');
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser(jwt);

  if (userError || !user) {
    return jsonResponse({ error: userError?.message ?? 'Invalid user token' }, 401);
  }

  const { data: entitlementSnapshot, error: entitlementError } = await supabase.rpc(
    'get_my_entitlements',
    {}
  );

  if (entitlementError) {
    return jsonResponse({ error: 'Unable to verify Tell conTRACKtor access.' }, 403);
  }

  const entitlementBusinessId = readEntitlementBusinessId(entitlementSnapshot);

  if (!entitlementBusinessId || !snapshotHasFeature(entitlementSnapshot, 'tell.basic')) {
    return jsonResponse({ error: 'Tell conTRACKtor is not available for this business.' }, 403);
  }

  const { data: jobs, error: jobsError } = await supabase
    .from('jobs')
    .select('id, owner_id, business_id, name, client_name, status')
    .eq('business_id', entitlementBusinessId)
    .order('created_at', { ascending: false })
    .limit(80);

  if (jobsError) {
    return jsonResponse({ error: jobsError.message }, 500);
  }

  const visibleJobs = (jobs ?? []) as JobRow[];
  const contextJob = contextJobId ? visibleJobs.find((job) => job.id === contextJobId) ?? null : null;

  if (contextJobId && !contextJob) {
    return jsonResponse({ error: 'Selected job was not found or is not available.' }, 400);
  }

  const { data: tellEntry, error: entryError } = await supabase
    .from('tell_contracktor_entries')
    .insert({
      business_id: entitlementBusinessId,
      extraction: {},
      job_id: contextJob?.id ?? null,
      local_date: localDate,
      owner_id: user.id,
      raw_text: rawText || '[Photo update]',
      status: 'uploading',
    })
    .select('id, status')
    .single();

  if (entryError || !tellEntry) {
    return jsonResponse({ error: entryError?.message ?? 'Unable to secure this Tell update.' }, 500);
  }

  try {
    for (const [index, photo] of photos.entries()) {
      const extension = getPhotoExtension(photo.mime_type);
      const storagePath = `${user.id}/tell/${tellEntry.id}/${index + 1}.${extension}`;
      const { error: uploadError } = await supabase.storage
        .from('attachments')
        .upload(storagePath, base64ToArrayBuffer(photo.base64), {
          contentType: photo.mime_type,
          upsert: true,
        });

      if (uploadError) {
        throw new Error(uploadError.message);
      }

      const { error: attachmentError } = await supabase
        .from('tell_contracktor_attachments')
        .insert({
          business_id: entitlementBusinessId,
          entry_id: tellEntry.id,
          file_type: photo.mime_type,
          original_filename: `tell-photo-${index + 1}.${extension}`,
          owner_id: user.id,
          storage_path: storagePath,
        });

      if (attachmentError) {
        throw new Error(attachmentError.message);
      }
    }

    const { error: queueError } = await supabase.rpc('finalize_tell_submission', {
      p_entry_id: tellEntry.id,
    });

    if (queueError) {
      throw new Error(queueError.message);
    }
  } catch (error) {
    await supabase
      .from('tell_contracktor_entries')
      .update({
        last_processing_error:
          error instanceof Error ? error.message : 'Unable to secure Tell attachments.',
        status: 'failed',
      })
      .eq('id', tellEntry.id);
    return jsonResponse(
      { error: error instanceof Error ? error.message : 'Unable to secure this Tell update.' },
      500
    );
  }

  if (workerSecret) {
    const immediateRun = fetch(`${supabaseUrl}/functions/v1/process-tell-queue`, {
      body: JSON.stringify({ triggered_by: 'tell-submit' }),
      headers: {
        Authorization: `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
        apikey: supabaseKey,
        'x-worker-secret': workerSecret,
      },
      method: 'POST',
    }).catch(() => undefined);
    const runtime = globalThis as unknown as {
      EdgeRuntime?: { waitUntil(promise: Promise<unknown>): void };
    };
    runtime.EdgeRuntime?.waitUntil(immediateRun);
  }

  return jsonResponse({ entry_id: tellEntry.id, status: 'queued' }, 202);
});

async function processQueuedTellEntry(
  supabase: ReturnType<typeof createClient>,
  entryId: string,
  openAiApiKey: string,
  openAiModel: string,
  openAiFallbackModel: string
): Promise<{ entry_id: string; proposal_count: number; status: string }> {
  const { data: entry, error: entryError } = await supabase
    .from('tell_contracktor_entries')
    .select('id, business_id, owner_id, job_id, raw_text, local_date, status')
    .eq('id', entryId)
    .single();

  if (entryError || !entry) {
    throw new Error(entryError?.message ?? 'Tell submission not found.');
  }

  if (['ready_review', 'needs_info', 'approved', 'dismissed', 'undone'].includes(entry.status)) {
    return { entry_id: entry.id, proposal_count: 0, status: entry.status };
  }

  const { error: processingError } = await supabase.rpc('mark_tell_processing', {
    p_entry_id: entry.id,
  });

  if (processingError) {
    throw new Error(processingError.message);
  }

  const [{ data: jobs, error: jobsError }, { data: attachments, error: attachmentsError }] =
    await Promise.all([
      supabase
        .from('jobs')
        .select('id, owner_id, business_id, name, client_name, status')
        .eq('business_id', entry.business_id)
        .order('created_at', { ascending: false })
        .limit(80),
      supabase
        .from('tell_contracktor_attachments')
        .select('storage_path, file_type')
        .eq('entry_id', entry.id)
        .order('created_at', { ascending: true }),
    ]);

  if (jobsError) throw new Error(jobsError.message);
  if (attachmentsError) throw new Error(attachmentsError.message);

  const visibleJobs = (jobs ?? []) as JobRow[];
  const contextJob = entry.job_id
    ? visibleJobs.find((job) => job.id === entry.job_id) ?? null
    : null;
  const photos: TellPhotoInput[] = [];

  for (const attachment of attachments ?? []) {
    const { data: blob, error: downloadError } = await supabase.storage
      .from('attachments')
      .download(attachment.storage_path);
    if (downloadError || !blob) {
      throw new Error(downloadError?.message ?? 'Unable to read a Tell attachment.');
    }
    photos.push({
      base64: arrayBufferToBase64(await blob.arrayBuffer()),
      mime_type: attachment.file_type || 'image/jpeg',
    });
  }

  const rawText = entry.raw_text === '[Photo update]' ? '' : entry.raw_text;
  const parsed = await parseTellInput(
    openAiApiKey,
    openAiModel,
    openAiFallbackModel,
    rawText,
    photos,
    visibleJobs,
    contextJob,
    entry.local_date
  );
  const matchedJob = contextJob ?? getMatchedJob(visibleJobs, parsed);
  const parsedWithJob = applyDefaultJobToParsedInput(parsed, matchedJob);
  const candidates = getLikelyJobCandidates(visibleJobs, rawText);
  const proposalRows = buildStoredProposalRows({
    businessId: entry.business_id,
    entryId: entry.id,
    jobId: matchedJob?.id ?? null,
    ownerId: entry.owner_id,
    parsed: parsedWithJob,
  });
  const nextStatus = matchedJob && proposalRows.length > 0 ? 'ready_review' : 'needs_info';

  const { error: clearError } = await supabase
    .from('tell_contracktor_proposals')
    .delete()
    .eq('entry_id', entry.id)
    .eq('status', 'pending');
  if (clearError) throw new Error(clearError.message);

  if (proposalRows.length > 0) {
    const { error: proposalError } = await supabase
      .from('tell_contracktor_proposals')
      .upsert(proposalRows, { onConflict: 'entry_id,proposal_id' });
    if (proposalError) throw new Error(proposalError.message);
  }

  const { error: updateError } = await supabase
    .from('tell_contracktor_entries')
    .update({
      cleaned_note: parsedWithJob.cleaned_note,
      extraction: { ...parsedWithJob, candidates },
      job_id: matchedJob?.id ?? null,
      last_processing_error: null,
      processed_at: new Date().toISOString(),
      status: nextStatus,
      updated_at: new Date().toISOString(),
    })
    .eq('id', entry.id);
  if (updateError) throw new Error(updateError.message);

  const suggestionDetail =
    proposalRows.length === 0
      ? 'Open this Tell and add the missing information.'
      : !matchedJob
        ? `${proposalRows.length} ${proposalRows.length === 1 ? 'suggestion needs' : 'suggestions need'} a job.`
        : `${proposalRows.length} ${proposalRows.length === 1 ? 'suggestion is' : 'suggestions are'} ready to review.`;
  const eventTitle = matchedJob ? `${matchedJob.name} update` : 'Tell needs information';
  const { data: activityEvent, error: activityError } = await supabase
    .from('activity_events')
    .upsert(
      {
        actor_user_id: entry.owner_id,
        business_id: entry.business_id,
        created_by_user_id: entry.owner_id,
        detail: suggestionDetail,
        event_type: 'tell_contracktor_processed',
        job_id: matchedJob?.id ?? null,
        metadata: { proposal_count: proposalRows.length, summary: parsedWithJob.summary },
        occurred_at: new Date().toISOString(),
        owner_id: entry.owner_id,
        severity: 'warning',
        source_id: entry.id,
        source_table: 'tell_contracktor_entries',
        status: 'needs_attention',
        title: eventTitle,
      },
      { onConflict: 'business_id,event_type,source_table,source_id' }
    )
    .select('id')
    .single();
  if (activityError) throw new Error(activityError.message);

  const { error: attentionError } = await supabase.from('attention_items').upsert(
    {
      activity_event_id: activityEvent.id,
      business_id: entry.business_id,
      detail: suggestionDetail,
      item_type: 'tell_submission',
      job_id: matchedJob?.id ?? null,
      metadata: { proposal_count: proposalRows.length },
      opened_at: new Date().toISOString(),
      owner_id: entry.owner_id,
      severity: 'warning',
      source_id: entry.id,
      source_table: 'tell_contracktor_entries',
      status: 'open',
      title: eventTitle,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'business_id,item_type,source_table,source_id' }
  );
  if (attentionError) throw new Error(attentionError.message);

  return { entry_id: entry.id, proposal_count: proposalRows.length, status: nextStatus };
}

function buildStoredProposalRows({
  businessId,
  entryId,
  jobId,
  ownerId,
  parsed,
}: {
  businessId: string;
  entryId: string;
  jobId: string | null;
  ownerId: string;
  parsed: ParsedTellInput;
}) {
  const rows: Array<Record<string, unknown>> = [];
  if (parsed.cleaned_note.trim()) {
    rows.push({
      business_id: businessId,
      entry_id: entryId,
      owner_id: ownerId,
      payload: {
        classification: parsed.scope_or_budget_impact ? 'scope_change' : 'job_update',
        id: 'note-1',
        job_id: jobId,
        note: parsed.cleaned_note.trim(),
        type: 'note',
      },
      proposal_id: 'note-1',
      proposal_type: 'note',
      status: 'pending',
    });
  }
  parsed.shopping_needs.forEach((need, index) => {
    const proposalId = `shopping-${index + 1}`;
    rows.push({
      business_id: businessId,
      entry_id: entryId,
      owner_id: ownerId,
      payload: {
        description: need.description,
        id: proposalId,
        job_id: need.job_id ?? jobId,
        normalized_name: need.normalized_name,
        quantity: need.quantity,
        type: 'shopping',
        unit: need.unit,
      },
      proposal_id: proposalId,
      proposal_type: 'shopping',
      status: 'pending',
    });
  });
  parsed.hours.forEach((hours, index) => {
    const proposalId = `hours-${index + 1}`;
    rows.push({
      business_id: businessId,
      entry_id: entryId,
      owner_id: ownerId,
      payload: {
        date: hours.date,
        hours: hours.hours,
        id: proposalId,
        job_id: hours.job_id ?? jobId,
        note: hours.note,
        type: 'hours',
        worker_name: hours.worker_name,
      },
      proposal_id: proposalId,
      proposal_type: 'hours',
      status: 'pending',
    });
  });
  return rows;
}

function getPhotoExtension(contentType: string): string {
  if (contentType.includes('png')) return 'png';
  if (contentType.includes('webp')) return 'webp';
  return 'jpg';
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64.replace(/[^A-Za-z0-9+/=]/g, ''));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes.buffer;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let index = 0; index < bytes.byteLength; index += 1) {
    binary += String.fromCharCode(bytes[index]);
  }
  return btoa(binary);
}

async function parseTellInput(
  apiKey: string,
  model: string,
  fallbackModel: string,
  rawText: string,
  photos: TellPhotoInput[],
  jobs: JobRow[],
  contextJob: JobRow | null,
  localDate: string
): Promise<ParsedTellInput> {
  const jobContext = jobs.map((job) => ({
    client_name: job.client_name,
    id: job.id,
    name: job.name,
    status: job.status,
  }));
  const instructions =
    'You interpret contractor field updates and attached photos. Return only valid JSON. Preserve facts, uncertainty, quantities, dimensions, dates, names, and caveats. Clean filler words, false starts, and dictation artifacts. The cleaned_note is the proposed operational job note, not a transcript. Rewrite it in concise professional field-note language, using neutral third-person or impersonal phrasing when helpful. Do not aggressively summarize away useful context. If attached photos show a handwritten or printed materials list, extract the visible material needs as shopping_needs. If the user provides no meaningful typed note and the photos are only a materials list, return cleaned_note as an empty string and put the useful information in shopping_needs. Do not invent hidden items from a photo; only extract visible/readable material needs. If a job-site photo is attached with useful typed context, use the typed context for cleaned_note, but do not describe visual conditions unless they are clear from the image or text. Do not create or imply labor/time entries from narrative mentions of time or added time unless the user clearly says they worked/logged/add hours. Example: "We had to spend an additional 4 hours redoing framing" is a scope note, not an hours entry. Create hours only for definitive worked/logged time such as "I worked 6.5 hours today" or "log Mike 8 hours". Do not change quotes, invoices, budgets, expenses, or payments. Payments are outside the initial Tell workflow, so always return payments as an empty array. Extract shopping needs when text or photos state materials need to be bought/needed/short or list purchasable materials. Match job only from provided jobs; use null and needs_job_confirmation when ambiguous. If a context job is provided, use it unless the text clearly refers to a different provided job. Use the provided local date for "today". Shopping need descriptions should be checklist item names, not sentences, e.g. description "10-foot 2x4s", quantity 10, unit null. Do not include words like "more", "need", "additional", or "buy" in shopping need descriptions. Use quantity as a number when explicit. Use unit for true count or measurement units like boxes, sheets, gallons, bundles, tubes, feet, linear feet, yards, or rolls. Do not put total order length into the item description. Example: "110 feet of 1.5 inch PVC" should be description "1.5 inch PVC", quantity 110, unit "feet". Keep product dimensions inside the item description when they describe the product, such as "10-foot 2x4s" or "1.5 inch PVC". Use normalized_name as a generic item name such as "2x4 lumber" or "PVC pipe". Flag scope_or_budget_impact when added labor/materials, rotten framing, unexpected damage, change of scope, or cost impact is mentioned. The summary should describe what was interpreted, not claim that conTRACKtor saved records.';
  const content: Array<{ image_url?: string; text?: string; type: 'input_image' | 'input_text' }> = [
    {
      text: `${instructions}\n\nLocal date: ${localDate}\nContext job id: ${contextJob?.id ?? 'none'}\nVisible jobs:\n${JSON.stringify(jobContext)}\n\nRaw input:\n${rawText || '[No typed text provided. Interpret the attached photos.]'}`,
      type: 'input_text',
    },
    ...photos.map((photo) => ({
      image_url: `data:${photo.mime_type};base64,${photo.base64}`,
      type: 'input_image' as const,
    })),
  ];

  const requestBody = {
    input: [
      {
        content,
        role: 'user',
      },
    ],
    text: {
      format: {
          name: 'tell_contracktor_extraction',
          schema: {
            additionalProperties: false,
            properties: {
              cleaned_note: { type: 'string' },
              hours: {
                items: {
                  additionalProperties: false,
                  properties: {
                    date: { anyOf: [{ type: 'string' }, { type: 'null' }] },
                    hours: { anyOf: [{ type: 'number' }, { type: 'null' }] },
                    job_id: { anyOf: [{ type: 'string' }, { type: 'null' }] },
                    note: { anyOf: [{ type: 'string' }, { type: 'null' }] },
                    worker_name: { anyOf: [{ type: 'string' }, { type: 'null' }] },
                  },
                  required: ['date', 'hours', 'job_id', 'note', 'worker_name'],
                  type: 'object',
                },
                type: 'array',
              },
              job_match_confidence: { maximum: 1, minimum: 0, type: 'number' },
              matched_job_id: { anyOf: [{ type: 'string' }, { type: 'null' }] },
              needs_job_confirmation: { type: 'boolean' },
              payments: {
                items: {
                  additionalProperties: false,
                  properties: {
                    amount: { anyOf: [{ type: 'number' }, { type: 'null' }] },
                    date: { anyOf: [{ type: 'string' }, { type: 'null' }] },
                    job_id: { anyOf: [{ type: 'string' }, { type: 'null' }] },
                    memo: { anyOf: [{ type: 'string' }, { type: 'null' }] },
                    method: { anyOf: [{ type: 'string' }, { type: 'null' }] },
                  },
                  required: ['amount', 'date', 'job_id', 'memo', 'method'],
                  type: 'object',
                },
                type: 'array',
              },
              scope_or_budget_impact: { type: 'boolean' },
              shopping_needs: {
                items: {
                  additionalProperties: false,
                  properties: {
                    description: { type: 'string' },
                    job_id: { anyOf: [{ type: 'string' }, { type: 'null' }] },
                    normalized_name: { anyOf: [{ type: 'string' }, { type: 'null' }] },
                    quantity: { anyOf: [{ type: 'number' }, { type: 'null' }] },
                    unit: { anyOf: [{ type: 'string' }, { type: 'null' }] },
                  },
                  required: ['description', 'job_id', 'normalized_name', 'quantity', 'unit'],
                  type: 'object',
                },
                type: 'array',
              },
              summary: { type: 'string' },
            },
            required: [
              'cleaned_note',
              'hours',
              'job_match_confidence',
              'matched_job_id',
              'needs_job_confirmation',
              'payments',
              'scope_or_budget_impact',
              'shopping_needs',
              'summary',
            ],
            type: 'object',
          },
          strict: true,
          type: 'json_schema',
      },
    },
  };
  let response = await requestTellExtraction(apiKey, model, requestBody);
  let data = await response.json();

  if (shouldUseFallbackModel(response.status, data, model, fallbackModel)) {
    console.warn('Tell primary model was rejected; trying configured fallback', {
      fallback_model: fallbackModel,
      primary_model: model,
      status: response.status,
    });
    response = await requestTellExtraction(apiKey, fallbackModel, requestBody);
    data = await response.json();
  }

  if (!response.ok) {
    throw new Error(typeof data?.error?.message === 'string' ? data.error.message : 'OpenAI parsing failed.');
  }

  const text = getResponseOutputText(data);

  if (!text) {
    throw new Error('Tell conTRACKtor returned no parsed text.');
  }

  const parsed = JSON.parse(text) as ParsedTellInput;

  return {
    ...parsed,
    cleaned_note: parsed.cleaned_note.trim() || (photos.length === 0 ? rawText : ''),
    hours: parsed.hours.filter((entry) => entry.hours !== null || entry.note?.trim()),
    payments: parsed.payments.filter((payment) => payment.amount !== null),
    shopping_needs: parsed.shopping_needs.filter((need) => need.description.trim()),
  };
}

async function requestTellExtraction(
  apiKey: string,
  model: string,
  requestBody: Record<string, unknown>
): Promise<Response> {
  return fetch('https://api.openai.com/v1/responses', {
    body: JSON.stringify({ ...requestBody, model }),
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    method: 'POST',
    signal: AbortSignal.timeout(openAiProcessingTimeoutMs),
  });
}

function shouldUseFallbackModel(
  status: number,
  data: unknown,
  primaryModel: string,
  fallbackModel: string
): boolean {
  if (!fallbackModel || fallbackModel === primaryModel || ![400, 403, 404].includes(status)) {
    return false;
  }

  const error =
    data && typeof data === 'object' && 'error' in data
      ? (data as { error?: unknown }).error
      : null;
  const serializedError = JSON.stringify(error ?? '').toLowerCase();

  return [
    'access',
    'does not exist',
    'model',
    'not found',
    'permission',
    'unsupported',
    'verification',
    'verified',
  ].some((marker) => serializedError.includes(marker));
}

function readPhotoInputs(value: unknown): TellPhotoInput[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((photo) => {
      if (!photo || typeof photo !== 'object') {
        return null;
      }

      const record = photo as Record<string, unknown>;
      const base64 = typeof record.base64 === 'string' ? record.base64.trim() : '';
      const mimeType = typeof record.mime_type === 'string' ? record.mime_type.trim() : 'image/jpeg';

      if (!base64) {
        return null;
      }

      return {
        base64,
        mime_type: mimeType || 'image/jpeg',
      };
    })
    .filter((photo): photo is TellPhotoInput => Boolean(photo));
}

function readEntitlementBusinessId(value: unknown): string | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const businessId = (value as Record<string, unknown>).business_id;
  return typeof businessId === 'string' && businessId ? businessId : null;
}

function snapshotHasFeature(value: unknown, featureKey: string): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }

  const features = (value as Record<string, unknown>).features;

  if (!features || typeof features !== 'object' || Array.isArray(features)) {
    return false;
  }

  const feature = (features as Record<string, unknown>)[featureKey];

  return Boolean(
    feature &&
      typeof feature === 'object' &&
      !Array.isArray(feature) &&
      (feature as Record<string, unknown>).enabled === true
  );
}

function applyDefaultJobToParsedInput(
  parsed: ParsedTellInput,
  matchedJob: JobRow | null
): ParsedTellInput {
  if (!matchedJob) {
    return parsed;
  }

  return {
    ...parsed,
    hours: parsed.hours.map((entry) => ({
      ...entry,
      job_id: entry.job_id ?? matchedJob.id,
    })),
    matched_job_id: parsed.matched_job_id ?? matchedJob.id,
    payments: parsed.payments.map((payment) => ({
      ...payment,
      job_id: payment.job_id ?? matchedJob.id,
    })),
    shopping_needs: parsed.shopping_needs.map((need) => ({
      ...need,
      job_id: need.job_id ?? matchedJob.id,
    })),
  };
}

function getMatchedJob(jobs: JobRow[], parsed: ParsedTellInput): JobRow | null {
  if (parsed.needs_job_confirmation || parsed.job_match_confidence < 0.72 || !parsed.matched_job_id) {
    return null;
  }

  return jobs.find((job) => job.id === parsed.matched_job_id) ?? null;
}

function getLikelyJobCandidates(jobs: JobRow[], rawText: string): JobRow[] {
  const normalizedText = rawText.toLowerCase();
  const matches = jobs.filter((job) => {
    const jobName = job.name.toLowerCase();
    const clientName = job.client_name?.toLowerCase() ?? '';

    return jobName.split(/\s+/).some((part) => part.length > 2 && normalizedText.includes(part)) ||
      (clientName.length > 2 && normalizedText.includes(clientName));
  });

  return (matches.length > 0 ? matches : jobs).slice(0, 5);
}

async function createTellEntry(
  supabase: ReturnType<typeof createClient>,
  {
    cleanedNote,
    extraction,
    jobId,
    rawText,
    status,
    userId,
  }: {
    cleanedNote: string;
    extraction: ParsedTellInput;
    jobId: string | null;
    rawText: string;
    status: 'needs_job' | 'processed';
    userId: string;
  }
) {
  const { data, error } = await supabase
    .from('tell_contracktor_entries')
    .insert({
      cleaned_note: cleanedNote,
      extraction,
      job_id: jobId,
      owner_id: userId,
      raw_text: rawText,
      status,
    })
    .select()
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

async function createJobNote(
  supabase: ReturnType<typeof createClient>,
  job: JobRow,
  userId: string,
  cleanedNote: string
) {
  const { data, error } = await supabase
    .from('job_notes')
    .insert({
      job_id: job.id,
      note: cleanedNote,
      note_type: 'general',
      owner_id: userId,
    })
    .select()
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

async function updateTellEntryNote(
  supabase: ReturnType<typeof createClient>,
  entryId: string,
  noteId: string
): Promise<void> {
  const { error } = await supabase
    .from('tell_contracktor_entries')
    .update({
      created_note_id: noteId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', entryId);

  if (error) {
    throw new Error(error.message);
  }
}

async function createShoppingNeed(
  supabase: ReturnType<typeof createClient>,
  job: JobRow,
  userId: string,
  sourceEntryId: string,
  need: ParsedTellInput['shopping_needs'][number]
) {
  const normalizedNeed = normalizeShoppingNeed(need);
  const existingNeed = await findMergeableShoppingNeed(supabase, job.id, normalizedNeed);

  if (existingNeed && normalizedNeed.quantity) {
    const nextQuantity = (existingNeed.quantity ?? 0) + normalizedNeed.quantity;
    const description = chooseBetterDescription(existingNeed.description, normalizedNeed.description);
    const { data, error } = await supabase
      .from('shopping_needs')
      .update({
        description,
        normalized_name: existingNeed.normalized_name ?? normalizedNeed.normalized_name,
        quantity: nextQuantity,
        unit: existingNeed.unit ?? normalizedNeed.unit,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existingNeed.id)
      .select()
      .single();

    if (error) {
      throw new Error(error.message);
    }

    await recordActivityEvent(supabase, {
      business_id: job.business_id,
      detail: formatShoppingNeedDetail(data),
      event_type: 'shopping_need_updated',
      job_id: job.id,
      metadata: {
        added_quantity: normalizedNeed.quantity,
        normalized_name: normalizedNeed.normalized_name,
        previous_quantity: existingNeed.quantity,
        quantity: data.quantity,
        source_entry_id: sourceEntryId,
        unit: data.unit,
      },
      owner_id: userId,
      severity: 'normal',
      source_id: data.id,
      source_table: 'shopping_needs',
      status: 'completed',
      title: 'Shopping need updated',
    });

    return data;
  }

  const { data, error } = await supabase
    .from('shopping_needs')
    .insert({
      description: normalizedNeed.description,
      job_id: job.id,
      normalized_name: normalizedNeed.normalized_name,
      owner_id: userId,
      performed_by_type: 'ai',
      quantity: normalizedNeed.quantity,
      source_id: sourceEntryId,
      source_type: 'tell_contracktor',
      unit: normalizedNeed.unit,
    })
    .select()
    .single();

  if (error) {
    throw new Error(error.message);
  }

  await recordActivityEvent(supabase, {
    business_id: job.business_id,
    detail: formatShoppingNeedDetail(data),
    event_type: 'shopping_need_created',
    job_id: job.id,
    metadata: {
      normalized_name: normalizedNeed.normalized_name,
      quantity: normalizedNeed.quantity,
      source_entry_id: sourceEntryId,
      unit: normalizedNeed.unit,
    },
    owner_id: userId,
    severity: 'normal',
    source_id: data.id,
    source_table: 'shopping_needs',
    status: 'completed',
    title: 'Shopping need added',
  });

  return data;
}

async function findMergeableShoppingNeed(
  supabase: ReturnType<typeof createClient>,
  jobId: string,
  incomingNeed: ParsedTellInput['shopping_needs'][number]
) {
  const { data, error } = await supabase
    .from('shopping_needs')
    .select('id, description, normalized_name, quantity, unit, user_display_text, user_edited_at, user_edited_by_user_id')
    .eq('job_id', jobId)
    .eq('status', 'open');

  if (error) {
    throw new Error(error.message);
  }

  const incomingKey = getShoppingNeedKey(incomingNeed.description, incomingNeed.normalized_name);
  const incomingUnit = normalizeShoppingUnit(incomingNeed.unit);

  return (
    (data ?? []).find((existingNeed) => {
      const existingKey = getShoppingNeedKey(
        String(existingNeed.description ?? ''),
        typeof existingNeed.normalized_name === 'string' ? existingNeed.normalized_name : null
      );
      const existingUnit = normalizeShoppingUnit(
        typeof existingNeed.unit === 'string' ? existingNeed.unit : null
      );

      if (incomingUnit && existingUnit && incomingUnit !== existingUnit) {
        return false;
      }

      return keysAreMergeable(existingKey, incomingKey);
    }) ?? null
  );
}

function normalizeShoppingNeed(
  need: ParsedTellInput['shopping_needs'][number]
): ParsedTellInput['shopping_needs'][number] {
  const parsed = parseCountUnit(need.description);
  const description = normalizeDescription(parsed.description);
  const unit = normalizeShoppingUnit(need.unit ?? parsed.unit);

  return {
    description,
    normalized_name: need.normalized_name?.trim() || getShoppingNeedKey(description, null) || null,
    quantity: need.quantity ?? parsed.quantity,
    unit,
  };
}

// Keep this normalization family in lockstep with src/lib/shoppingNeeds.ts.
// The Deno edge runtime and client cannot share this module directly, so a boundary test compares them.
function parseCountUnit(value: string): { description: string; quantity: number | null; unit: string | null } {
  const trimmed = value.trim().replace(/\s+/g, ' ');
  const unitFirstMatch = trimmed.match(
    /^(\d+(?:\.\d+)?)\s+(boxes?|buckets?|sheets?|bags?|bundles?|tubes?|rolls?|pieces?|feet|foot|ft|linear feet|yards?|yds?|gallons?|gals?)\s+(?:of\s+)?(.+)$/i
  );

  if (unitFirstMatch) {
    return {
      description: unitFirstMatch[3].trim(),
      quantity: Number(unitFirstMatch[1]),
      unit: pluralizeUnit(unitFirstMatch[2]),
    };
  }

  const countMatch = trimmed.match(/^([1-9]\d*)\s+(.+)$/);

  if (countMatch) {
    return {
      description: countMatch[2].trim(),
      quantity: Number(countMatch[1]),
      unit: null,
    };
  }

  return { description: trimmed, quantity: null, unit: null };
}

function chooseBetterDescription(existingDescription: string, incomingDescription: string): string {
  const existing = normalizeDescription(existingDescription);
  const incoming = normalizeDescription(incomingDescription);

  if (incoming.length > existing.length && !incoming.includes(existing)) {
    return capitalizeFirst(incoming);
  }

  return capitalizeFirst(existing);
}

function formatShoppingNeedDetail(need: {
  description: string;
  quantity: number | null;
  unit: string | null;
}): string {
  const quantity = need.quantity
    ? `${new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(need.quantity)}${
        need.unit ? ` ${need.unit}` : ' x'
      } `
    : '';

  return `${quantity}${capitalizeFirst(need.description)}`;
}

function getShoppingNeedKey(description: string, normalizedName: string | null): string {
  const descriptionKey = normalizeKey(description);

  if (descriptionKey) {
    return descriptionKey;
  }

  return normalizeKey(normalizedName || '');
}

function keysAreMergeable(left: string, right: string): boolean {
  if (!left || !right) {
    return false;
  }

  if (left === right) {
    return true;
  }

  return left.includes(right) || right.includes(left);
}

function normalizeDescription(value: string): string {
  return capitalizeFirst(
    value
      .trim()
      .replace(/\s+/g, ' ')
      .replace(/^(more|additional|extra|need|needs|buy|of)\s+/i, '')
      .trim()
  );
}

function normalizeKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\s*(?:×|x)\s*/g, 'x')
    .replace(/"/g, ' inch ')
    .replace(/'/g, ' foot ')
    .replace(/\b(inches|inch|in)\b/g, 'inch')
    .replace(/\b(feet|foot|ft|linear feet|linear foot)\b/g, 'foot')
    .replace(/\b(more|additional|extra|need|needs|buy|of|the|a|an)\b/g, ' ')
    .replace(/\b(box|boxes|bucket|buckets|sheet|sheets|bag|bags|bundle|bundles|tube|tubes|roll|rolls|piece|pieces)\b/g, ' ')
    .replace(/[^a-z0-9.]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeShoppingUnit(value: string | null | undefined): string | null {
  if (!value?.trim()) {
    return null;
  }

  return pluralizeUnit(value.trim()) || null;
}

function pluralizeUnit(value: string): string {
  const unit = normalizeUnitKey(value);
  const unitMap: Record<string, string> = {
    bag: 'bags',
    box: 'boxes',
    bucket: 'buckets',
    bundle: 'bundles',
    piece: 'pieces',
    foot: 'feet',
    ft: 'feet',
    'linear foot': 'feet',
    'linear feet': 'feet',
    yard: 'yards',
    yd: 'yards',
    gallon: 'gallons',
    gal: 'gallons',
    roll: 'rolls',
    sheet: 'sheets',
    tube: 'tubes',
  };

  return unitMap[unit] ?? '';
}

function normalizeUnitKey(value: string): string {
  const unit = value.toLowerCase().trim();

  if (unit === 'boxes') {
    return 'box';
  }

  if (unit.endsWith('s')) {
    return unit.slice(0, -1);
  }

  return unit;
}

function capitalizeFirst(value: string): string {
  const trimmed = value.trim();

  if (!trimmed) {
    return trimmed;
  }

  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

async function recordActivityEvent(
  supabase: ReturnType<typeof createClient>,
  event: {
    business_id: string;
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
  const { error } = await supabase.from('activity_events').upsert(
    {
      ...event,
      actor_user_id: event.owner_id,
      created_by_user_id: event.owner_id,
      occurred_at: new Date().toISOString(),
    },
    {
      onConflict: 'business_id,event_type,source_table,source_id',
    }
  );

  if (error) {
    throw new Error(error.message);
  }
}

async function readBody(req: Request): Promise<Record<string, unknown>> {
  try {
    return (await req.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function getResponseOutputText(data: unknown): string | null {
  if (!data || typeof data !== 'object') {
    return null;
  }

  const response = data as { output_text?: unknown; output?: unknown };

  if (typeof response.output_text === 'string') {
    return response.output_text;
  }

  if (!Array.isArray(response.output)) {
    return null;
  }

  for (const item of response.output) {
    if (!item || typeof item !== 'object' || !Array.isArray((item as { content?: unknown }).content)) {
      continue;
    }

    for (const content of (item as { content: unknown[] }).content) {
      if (!content || typeof content !== 'object') {
        continue;
      }

      const text = (content as { text?: unknown }).text;

      if (typeof text === 'string') {
        return text;
      }
    }
  }

  return null;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
    status,
  });
}
