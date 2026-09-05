import { getLocalDateString } from '@/src/lib/localDate';
import { supabase } from '@/src/lib/supabase';
import type { Json, Tables } from '@/src/types/database';

export type TellContracktorCandidateJob = Pick<
  Tables<'jobs'>,
  'business_id' | 'client_name' | 'id' | 'name' | 'owner_id' | 'status'
>;

export type TellContracktorResult = {
  candidates?: TellContracktorCandidateJob[];
  entry_id: string;
  job?: TellContracktorCandidateJob;
  needs_job: boolean;
  parsed: {
    cleaned_note: string;
    hours: TellContracktorHoursProposal[];
    matched_job_id: string | null;
    payments: TellContracktorPaymentProposal[];
    scope_or_budget_impact: boolean;
    shopping_needs: {
      description: string;
      job_id: string | null;
      normalized_name: string | null;
      quantity: number | null;
      unit: string | null;
    }[];
    summary: string;
  };
};

export type TellContracktorSubmissionStatus =
  | 'uploading'
  | 'queued'
  | 'processing'
  | 'ready_review'
  | 'needs_info'
  | 'approved'
  | 'failed'
  | 'dismissed'
  | 'undone'
  | 'needs_job'
  | 'processed';

export type TellContracktorSubmission = {
  createdAt: string;
  entryId: string;
  lastProcessingError: string | null;
  pendingCount: number;
  proposals: TellContracktorCommitProposal[];
  rawText: string;
  result: TellContracktorResult | null;
  status: TellContracktorSubmissionStatus;
  totalCount: number;
};

export type TellContracktorSubmissionSummary = {
  createdAt: string;
  entryId: string;
  pendingCount: number;
  preview: string;
  status: TellContracktorSubmissionStatus;
  totalCount: number;
};

export type TellContracktorHoursProposal = {
  date: string | null;
  hours: number | null;
  job_id: string | null;
  note: string | null;
  worker_name: string | null;
};

export type TellContracktorPaymentProposal = {
  amount: number | null;
  date: string | null;
  job_id: string | null;
  memo: string | null;
  method: string | null;
};

export type TellContracktorPhotoInput = {
  base64: string;
  mimeType?: string | null;
};

export type TellContracktorCommitProposal =
  | {
      classification?: 'job_update' | 'scope_change';
      id: string;
      job_id: string;
      note: string;
      type: 'note';
    }
  | {
      description: string;
      id: string;
      job_id: string;
      normalized_name: string | null;
      quantity: number | null;
      type: 'shopping';
      unit: string | null;
    }
  | {
      date: string;
      hours: number;
      id: string;
      job_id: string;
      note: string | null;
      type: 'hours';
      worker_name: string | null;
    };

export type TellContracktorCommitResult = {
  created_note_id: string | null;
  entry_id: string;
  records: {
    job_id: string;
    proposal_id: string;
    record_id: string;
    type: TellContracktorCommitProposal['type'];
  }[];
  replayed: boolean;
};

export type TellContracktorUndoResult = {
  attachment_storage_paths: string[];
  entry_id: string;
  records: TellContracktorCommitResult['records'];
  replayed: boolean;
  undone_at: string;
};

export async function submitTellContracktorText({
  jobId,
  photos = [],
  text,
}: {
  jobId?: string | null;
  photos?: TellContracktorPhotoInput[];
  text: string;
}): Promise<{ entry_id: string; status: 'queued' }> {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();

  if (sessionError) {
    throw new Error(sessionError.message);
  }

  if (!sessionData.session) {
    throw new Error('You must be logged in to tell conTRACKtor what happened.');
  }

  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Missing Supabase environment variables.');
  }

  const response = await fetch(`${supabaseUrl}/functions/v1/tell-contracktor`, {
    body: JSON.stringify({
      job_id: jobId ?? null,
      local_date: getLocalDateString(),
      photos: photos.map((photo) => ({
        base64: photo.base64,
        mime_type: photo.mimeType ?? 'image/jpeg',
      })),
      text,
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
    const message =
      responseBody && typeof responseBody === 'object' && 'error' in responseBody
        ? String(responseBody.error)
        : `Tell conTRACKtor failed with status ${response.status}`;

    throw new Error(message);
  }

  return responseBody as { entry_id: string; status: 'queued' };
}

export async function commitTellContracktorEntry(
  entryId: string,
  proposals: TellContracktorCommitProposal[]
): Promise<TellContracktorCommitResult> {
  const { data, error } = await supabase.rpc('review_tell_contracktor_proposals', {
    p_entry_id: entryId,
    p_proposals: proposals as unknown as Json,
  });

  if (error) {
    throw new Error(error.message);
  }

  return data as unknown as TellContracktorCommitResult;
}

export async function dismissTellContracktorProposal(
  entryId: string,
  proposalId: string
): Promise<void> {
  const { error } = await supabase.rpc('dismiss_tell_contracktor_proposal', {
    p_entry_id: entryId,
    p_proposal_id: proposalId,
  });

  if (error) throw new Error(error.message);
}

export async function retryTellContracktorSubmission(entryId: string): Promise<void> {
  const { error } = await supabase.rpc('finalize_tell_submission', {
    p_entry_id: entryId,
  });

  if (error) throw new Error(error.message);
}

export async function fetchTellContracktorSubmission(
  entryId: string
): Promise<TellContracktorSubmission> {
  const [{ data: entry, error: entryError }, { data: proposalRows, error: proposalError }] =
    await Promise.all([
      supabase
        .from('tell_contracktor_entries')
        .select(
          'id, job_id, raw_text, extraction, status, created_at, last_processing_error'
        )
        .eq('id', entryId)
        .single(),
      supabase
        .from('tell_contracktor_proposals')
        .select('proposal_id, proposal_type, payload, status')
        .eq('entry_id', entryId)
        .order('created_at', { ascending: true }),
    ]);

  if (entryError || !entry) throw new Error(entryError?.message ?? 'Tell submission not found.');
  if (proposalError) throw new Error(proposalError.message);

  const extraction = asRecord(entry.extraction);
  const candidateValues = Array.isArray(extraction?.candidates) ? extraction.candidates : [];
  const candidateIds = candidateValues
    .map((candidate) => asRecord(candidate)?.id)
    .filter((id): id is string => typeof id === 'string');
  const requestedJobIds = Array.from(
    new Set([entry.job_id, ...candidateIds].filter((id): id is string => Boolean(id)))
  );
  let jobs: TellContracktorCandidateJob[] = [];

  if (requestedJobIds.length > 0) {
    const { data, error } = await supabase
      .from('jobs')
      .select('id, owner_id, business_id, name, client_name, status')
      .in('id', requestedJobIds);
    if (error) throw new Error(error.message);
    jobs = data ?? [];
  } else if (entry.status === 'needs_info' || entry.status === 'needs_job') {
    const { data, error } = await supabase
      .from('jobs')
      .select('id, owner_id, business_id, name, client_name, status')
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(20);
    if (error) throw new Error(error.message);
    jobs = data ?? [];
  }

  const proposals = (proposalRows ?? [])
    .filter((row) => row.status === 'pending')
    .map((row) => normalizeStoredProposal(row.payload, row.proposal_id, row.proposal_type))
    .filter((proposal): proposal is TellContracktorCommitProposal => Boolean(proposal));
  const pendingCount = (proposalRows ?? []).filter((row) => row.status === 'pending').length;
  const parsed = readParsedTell(extraction);
  const job = jobs.find((candidate) => candidate.id === entry.job_id);
  const candidates = jobs.filter((candidate) => candidate.id !== entry.job_id);
  const result = parsed
    ? {
        candidates,
        entry_id: entry.id,
        job,
        needs_job: !entry.job_id,
        parsed,
      }
    : null;

  return {
    createdAt: entry.created_at ?? new Date().toISOString(),
    entryId: entry.id,
    lastProcessingError: entry.last_processing_error,
    pendingCount,
    proposals,
    rawText: entry.raw_text,
    result,
    status: entry.status as TellContracktorSubmissionStatus,
    totalCount: (proposalRows ?? []).length,
  };
}

export async function fetchRecentTellContracktorSubmissions(): Promise<
  TellContracktorSubmissionSummary[]
> {
  const { data: entries, error } = await supabase
    .from('tell_contracktor_entries')
    .select('id, raw_text, status, created_at')
    .order('created_at', { ascending: false })
    .limit(12);
  if (error) throw new Error(error.message);

  const entryIds = (entries ?? []).map((entry) => entry.id);
  const { data: proposals, error: proposalsError } = entryIds.length
    ? await supabase
        .from('tell_contracktor_proposals')
        .select('entry_id, status')
        .in('entry_id', entryIds)
    : { data: [], error: null };
  if (proposalsError) throw new Error(proposalsError.message);

  return (entries ?? []).map((entry) => {
    const entryProposals = (proposals ?? []).filter((proposal) => proposal.entry_id === entry.id);
    return {
      createdAt: entry.created_at ?? new Date().toISOString(),
      entryId: entry.id,
      pendingCount: entryProposals.filter((proposal) => proposal.status === 'pending').length,
      preview: entry.raw_text === '[Photo update]' ? 'Photo update' : entry.raw_text,
      status: entry.status as TellContracktorSubmissionStatus,
      totalCount: entryProposals.length,
    };
  });
}

export async function undoTellContracktorEntry(entryId: string): Promise<TellContracktorUndoResult> {
  const { data, error } = await supabase.rpc('undo_tell_contracktor_entry', {
    p_entry_id: entryId,
  });

  if (error) {
    throw new Error(error.message);
  }

  const result = data as unknown as TellContracktorUndoResult;

  if (result.attachment_storage_paths.length > 0) {
    const { error: storageError } = await supabase.storage
      .from('attachments')
      .remove(result.attachment_storage_paths);

    if (storageError) {
      console.warn('Tell records were undone, but attachment cleanup failed.', storageError);
    }
  }

  return result;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readParsedTell(value: Record<string, unknown> | null): TellContracktorResult['parsed'] | null {
  if (!value || typeof value.cleaned_note !== 'string' || typeof value.summary !== 'string') {
    return null;
  }
  return value as unknown as TellContracktorResult['parsed'];
}

function normalizeStoredProposal(
  value: unknown,
  proposalId: string,
  proposalType: string
): TellContracktorCommitProposal | null {
  const payload = asRecord(value);
  if (!payload || !['note', 'shopping', 'hours'].includes(proposalType)) return null;
  return { ...payload, id: proposalId, type: proposalType } as TellContracktorCommitProposal;
}
