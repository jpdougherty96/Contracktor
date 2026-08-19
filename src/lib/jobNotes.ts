import type { ImagePickerAsset } from 'expo-image-picker';

import { recordActivityEvent } from '@/src/lib/activityEvents';
import { supabase } from '@/src/lib/supabase';
import type { Tables } from '@/src/types/database';

export type CreateJobNoteInput = {
  note: string;
};

export type UpdateJobNoteInput = CreateJobNoteInput;

export type JobNoteAttachment = Tables<'attachments'> & {
  signedUrl: string | null;
};

export async function createJobNote(
  jobId: string,
  input: CreateJobNoteInput
): Promise<Tables<'job_notes'>> {
  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError) {
    throw new Error(userError.message);
  }

  if (!userData.user) {
    throw new Error('You must be logged in to add a note.');
  }

  const { data, error } = await supabase
    .from('job_notes')
    .insert({
      job_id: jobId,
      note: input.note.trim(),
      note_type: 'general',
      owner_id: userData.user.id,
    })
    .select('id, job_id, owner_id, business_id, created_by_user_id, note, note_type, created_at')
    .single();

  if (error) {
    throw new Error(error.message);
  }

  await recordActivityEventSafely({
    businessId: data.business_id,
    createdByUserId: data.created_by_user_id ?? data.owner_id,
    detail: truncateActivityDetail(data.note),
    eventType: 'note_added',
    jobId: data.job_id,
    metadata: {
      noteType: data.note_type,
    },
    ownerId: data.owner_id,
    sourceId: data.id,
    sourceTable: 'job_notes',
    title: 'Note added',
  });

  return data;
}

export async function fetchJobNote(noteId: string): Promise<Tables<'job_notes'>> {
  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError) {
    throw new Error(userError.message);
  }

  if (!userData.user) {
    throw new Error('You must be logged in to view a note.');
  }

  const { data, error } = await supabase
    .from('job_notes')
    .select('id, job_id, owner_id, business_id, created_by_user_id, note, note_type, created_at')
    .eq('id', noteId)
    .eq('owner_id', userData.user.id)
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

export async function updateJobNote(
  noteId: string,
  input: UpdateJobNoteInput
): Promise<Tables<'job_notes'>> {
  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError) {
    throw new Error(userError.message);
  }

  if (!userData.user) {
    throw new Error('You must be logged in to update a note.');
  }

  const { data, error } = await supabase
    .from('job_notes')
    .update({
      note: input.note.trim(),
    })
    .eq('id', noteId)
    .eq('owner_id', userData.user.id)
    .select('id, job_id, owner_id, business_id, created_by_user_id, note, note_type, created_at')
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

export async function uploadJobNotePhoto(
  jobId: string,
  noteId: string,
  imageAsset: ImagePickerAsset
): Promise<Tables<'attachments'>> {
  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError) {
    throw new Error(userError.message);
  }

  if (!userData.user) {
    throw new Error('You must be logged in to upload note photos.');
  }

  if (!imageAsset.base64) {
    throw new Error('Photo data was not available. Please choose the photo again.');
  }

  const contentType = imageAsset.mimeType ?? 'image/jpeg';
  const extension = getFileExtension(contentType);
  const originalFilename = imageAsset.fileName ?? `note-photo-${Date.now()}.${extension}`;
  const storagePath = `${userData.user.id}/notes/${noteId}/${Date.now()}-${sanitizeFilename(
    originalFilename
  )}`;

  const { error: uploadError } = await supabase.storage
    .from('attachments')
    .upload(storagePath, base64ToArrayBuffer(imageAsset.base64), {
      contentType,
      upsert: false,
    });

  if (uploadError) {
    throw new Error(uploadError.message);
  }

  const { data, error } = await supabase
    .from('attachments')
    .insert({
      file_type: contentType,
      job_id: jobId,
      note_id: noteId,
      original_filename: originalFilename,
      owner_id: userData.user.id,
      storage_path: storagePath,
    })
    .select(
      'id, owner_id, business_id, created_by_user_id, job_id, note_id, storage_path, original_filename, file_type, description, created_at'
    )
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

export async function fetchJobNoteAttachments(noteId: string): Promise<JobNoteAttachment[]> {
  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError) {
    throw new Error(userError.message);
  }

  if (!userData.user) {
    throw new Error('You must be logged in to view note photos.');
  }

  const { data, error } = await supabase
    .from('attachments')
    .select(
      'id, owner_id, business_id, created_by_user_id, job_id, note_id, storage_path, original_filename, file_type, description, created_at'
    )
    .eq('note_id', noteId)
    .eq('owner_id', userData.user.id)
    .order('created_at', { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return Promise.all(
    (data ?? []).map(async (attachment) => ({
      ...attachment,
      signedUrl: await createAttachmentSignedUrl(attachment.storage_path),
    }))
  );
}

async function createAttachmentSignedUrl(storagePath: string): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from('attachments')
    .createSignedUrl(storagePath, 60 * 10);

  if (error) {
    return null;
  }

  return data.signedUrl;
}

function getFileExtension(contentType: string): string {
  if (contentType.includes('png')) {
    return 'png';
  }

  if (contentType.includes('webp')) {
    return 'webp';
  }

  return 'jpg';
}

function sanitizeFilename(filename: string): string {
  return filename.replace(/[^a-zA-Z0-9._-]/g, '-');
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const cleanBase64 = base64.replace(/[^A-Za-z0-9+/=]/g, '');
  const lookup = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const padding = cleanBase64.endsWith('==') ? 2 : cleanBase64.endsWith('=') ? 1 : 0;
  const byteLength = (cleanBase64.length * 3) / 4 - padding;
  const bytes = new Uint8Array(byteLength);
  let byteIndex = 0;

  for (let index = 0; index < cleanBase64.length; index += 4) {
    const encoded1 = lookup.indexOf(cleanBase64[index]);
    const encoded2 = lookup.indexOf(cleanBase64[index + 1]);
    const encoded3 = lookup.indexOf(cleanBase64[index + 2]);
    const encoded4 = lookup.indexOf(cleanBase64[index + 3]);
    const bitmap = (encoded1 << 18) | (encoded2 << 12) | ((encoded3 & 63) << 6) | (encoded4 & 63);

    if (byteIndex < byteLength) bytes[byteIndex++] = (bitmap >> 16) & 255;
    if (byteIndex < byteLength) bytes[byteIndex++] = (bitmap >> 8) & 255;
    if (byteIndex < byteLength) bytes[byteIndex++] = bitmap & 255;
  }

  return bytes.buffer;
}

async function recordActivityEventSafely(
  input: Parameters<typeof recordActivityEvent>[0]
): Promise<void> {
  try {
    await recordActivityEvent(input);
  } catch {
    // Activity is an audit aid; the note is the source of truth.
  }
}

function truncateActivityDetail(value: string): string {
  return value.length > 180 ? `${value.slice(0, 177)}...` : value;
}
