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
}): Promise<TellContracktorResult> {
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
      local_date: new Date().toISOString().slice(0, 10),
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

  return responseBody as TellContracktorResult;
}

export async function commitTellContracktorEntry(
  entryId: string,
  proposals: TellContracktorCommitProposal[]
): Promise<TellContracktorCommitResult> {
  const { data, error } = await supabase.rpc('commit_tell_contracktor_entry', {
    p_entry_id: entryId,
    p_proposals: proposals as unknown as Json,
  });

  if (error) {
    throw new Error(error.message);
  }

  return data as unknown as TellContracktorCommitResult;
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
