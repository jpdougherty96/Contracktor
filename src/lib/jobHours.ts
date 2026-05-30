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
  'id, job_id, owner_id, started_at, stopped_at, work_date, duration_minutes, hourly_rate, worker_name, description, billable, source, status, created_at, updated_at';

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

export function minutesToHours(minutes: number): number {
  return Math.round((minutes / 60) * 100) / 100;
}

function hoursToMinutes(hours: number): number {
  return Math.round(hours * 60);
}
