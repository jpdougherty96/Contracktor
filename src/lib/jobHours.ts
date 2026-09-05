import { recordActivityEvent } from '@/src/lib/activityEvents';
import { supabase } from '@/src/lib/supabase';
import type { Tables } from '@/src/types/database';

export type JobHoursEntry = Tables<'time_entries'>;

export type CreateJobHoursInput = {
  hourlyRate: number;
  hours: number;
  note?: string;
  workDate: string;
  workerName?: string;
};

export type UpdateJobHoursInput = {
  hourlyRate: number;
  hours: number;
  note?: string;
  workDate: string;
  workerName?: string;
};

const timeEntryFields =
  'id, job_id, owner_id, business_id, created_by_user_id, started_at, stopped_at, work_date, duration_minutes, hourly_rate, worker_name, description, billable, source, status, invoice_id, invoiced_at, created_at, updated_at';

export async function createJobHours(
  jobId: string,
  input: CreateJobHoursInput
): Promise<JobHoursEntry> {
  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError) {
    throw new Error(userError.message);
  }

  if (!userData.user) {
    throw new Error('You must be logged in to add hours.');
  }

  const { data, error } = await supabase
    .from('time_entries')
    .insert({
      description: input.note?.trim() || null,
      duration_minutes: hoursToMinutes(input.hours),
      hourly_rate: input.hourlyRate,
      job_id: jobId,
      owner_id: userData.user.id,
      source: 'manual',
      status: 'reviewed',
      work_date: input.workDate,
      worker_name: input.workerName?.trim() || null,
    })
    .select(timeEntryFields)
    .single();

  if (error) {
    throw new Error(error.message);
  }

  await recordActivityEventSafely({
    businessId: data.business_id,
    createdByUserId: data.created_by_user_id ?? data.owner_id,
    detail: `${minutesToHours(data.duration_minutes)} hrs${
      data.worker_name ? ` - ${data.worker_name}` : ''
    }${data.description ? ` - ${data.description}` : ''}`,
    eventType: 'hours_logged',
    jobId: data.job_id,
    metadata: {
      durationMinutes: data.duration_minutes,
      hourlyRate: data.hourly_rate,
      source: data.source,
      workDate: data.work_date,
      workerName: data.worker_name,
    },
    ownerId: data.owner_id,
    sourceId: data.id,
    sourceTable: 'time_entries',
    title: 'Hours logged',
  });

  return data;
}

export async function fetchJobHours(hoursId: string): Promise<JobHoursEntry> {
  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError) {
    throw new Error(userError.message);
  }

  if (!userData.user) {
    throw new Error('You must be logged in to view hours.');
  }

  const { data, error } = await supabase
    .from('time_entries')
    .select(timeEntryFields)
    .eq('id', hoursId)
    .eq('owner_id', userData.user.id)
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

export async function updateJobHours(
  hoursId: string,
  input: UpdateJobHoursInput
): Promise<JobHoursEntry> {
  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError) {
    throw new Error(userError.message);
  }

  if (!userData.user) {
    throw new Error('You must be logged in to update hours.');
  }

  const { data, error } = await supabase
    .from('time_entries')
    .update({
      description: input.note?.trim() || null,
      duration_minutes: hoursToMinutes(input.hours),
      hourly_rate: input.hourlyRate,
      status: 'reviewed',
      updated_at: new Date().toISOString(),
      work_date: input.workDate,
      worker_name: input.workerName?.trim() || null,
    })
    .eq('id', hoursId)
    .eq('owner_id', userData.user.id)
    .select(timeEntryFields)
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

export async function deleteJobHours(hoursId: string): Promise<void> {
  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError) {
    throw new Error(userError.message);
  }

  if (!userData.user) {
    throw new Error('You must be logged in to delete hours.');
  }

  const { error } = await supabase
    .from('time_entries')
    .delete()
    .eq('id', hoursId)
    .eq('owner_id', userData.user.id);

  if (error) {
    throw new Error(error.message);
  }
}

export function minutesToHours(minutes: number): number {
  return Math.round((minutes / 60) * 100) / 100;
}

function hoursToMinutes(hours: number): number {
  return Math.round(hours * 60);
}

async function recordActivityEventSafely(
  input: Parameters<typeof recordActivityEvent>[0]
): Promise<void> {
  try {
    await recordActivityEvent(input);
  } catch {
    // Activity is an audit aid; the time entry is the source of truth.
  }
}
