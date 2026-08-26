import { recordActivityEvent } from '@/src/lib/activityEvents';
import { fetchCurrentProfile } from '@/src/lib/profiles';
import { supabase } from '@/src/lib/supabase';
import type { Tables } from '@/src/types/database';
import type { Job } from '@/src/types/job';

export type ActiveTimeEntry = Tables<'time_entries'>;

export type ActiveTimerState = {
  entry: ActiveTimeEntry;
  jobName: string;
};

export type TimeClockDefaults = {
  hourlyRate: number | null;
  workerName: string | null;
};

type TimerJob = Pick<Job, 'hourlyRate' | 'id'>;

const timeEntryFields =
  'id, job_id, owner_id, business_id, created_by_user_id, started_at, stopped_at, work_date, duration_minutes, hourly_rate, worker_name, description, billable, source, status, created_at, updated_at';

export async function fetchActiveTimeEntries(): Promise<ActiveTimeEntry[]> {
  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError) {
    throw new Error(userError.message);
  }

  if (!userData.user) {
    throw new Error('You must be logged in to view active timers.');
  }

  const { data, error } = await supabase
    .from('time_entries')
    .select(timeEntryFields)
    .eq('owner_id', userData.user.id)
    .eq('status', 'active')
    .order('started_at', { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return data ?? [];
}

export async function fetchActiveTimerState(): Promise<ActiveTimerState | null> {
  const entries = await fetchActiveTimeEntries();
  const entry = entries[0];

  if (!entry) {
    return null;
  }

  if (!entry.job_id) {
    return {
      entry,
      jobName: 'Active job',
    };
  }

  const { data, error } = await supabase
    .from('jobs')
    .select('name')
    .eq('id', entry.job_id)
    .eq('owner_id', entry.owner_id)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return {
    entry,
    jobName: data?.name?.trim() || 'Active job',
  };
}

export async function fetchTimeClockDefaults(job: TimerJob): Promise<TimeClockDefaults> {
  const profile = await fetchCurrentProfile().catch(() => ({
    defaultHourlyRate: null,
    displayName: null,
  }));
  const profileName = profile.displayName?.trim() ?? '';

  return {
    hourlyRate: firstPositiveRate(job.hourlyRate, profile.defaultHourlyRate),
    workerName: profileName || null,
  };
}

export async function startJobTimer(
  job: TimerJob,
  defaults?: TimeClockDefaults
): Promise<ActiveTimeEntry> {
  const timerDefaults = defaults ?? (await fetchTimeClockDefaults(job));

  if (!timerDefaults.hourlyRate || timerDefaults.hourlyRate <= 0) {
    throw new Error('Set the hourly rate for this job before starting a timer.');
  }

  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError) {
    throw new Error(userError.message);
  }

  if (!userData.user) {
    throw new Error('You must be logged in to start a timer.');
  }

  const { data, error } = await supabase.rpc('start_job_timer_atomic', {
    p_hourly_rate: timerDefaults.hourlyRate,
    p_job_id: job.id,
    p_worker_name: timerDefaults.workerName ?? undefined,
  });

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

function firstPositiveRate(...rates: (number | null | undefined)[]): number | null {
  return (
    rates.find((rate) => typeof rate === 'number' && Number.isFinite(rate) && rate > 0) ?? null
  );
}

export async function stopJobTimer(entry: ActiveTimeEntry): Promise<void> {
  await stopActiveTimer(entry);
}

async function stopActiveTimer(entry: ActiveTimeEntry): Promise<void> {
  if (!entry.started_at) {
    throw new Error('Timer entry is missing a start time.');
  }

  const stoppedAt = new Date();
  const startedAt = new Date(entry.started_at);
  const elapsedSeconds = Math.max(0, (stoppedAt.getTime() - startedAt.getTime()) / 1000);
  const durationMinutes = Math.round(elapsedSeconds / 60);

  if (!Number.isFinite(durationMinutes)) {
    throw new Error('Timer duration must be valid.');
  }

  if (durationMinutes <= 0) {
    const { error } = await supabase
      .from('time_entries')
      .delete()
      .eq('id', entry.id)
      .eq('owner_id', entry.owner_id);

    if (error) {
      throw new Error(error.message);
    }

    return;
  }

  const { data, error } = await supabase
    .from('time_entries')
    .update({
      duration_minutes: durationMinutes,
      stopped_at: stoppedAt.toISOString(),
      status: 'reviewed',
      updated_at: stoppedAt.toISOString(),
      work_date: stoppedAt.toISOString().slice(0, 10),
    })
    .eq('id', entry.id)
    .eq('owner_id', entry.owner_id)
    .select(timeEntryFields)
    .single();

  if (error) {
    throw new Error(error.message);
  }

  await recordActivityEventSafely({
    businessId: data.business_id,
    createdByUserId: data.created_by_user_id ?? data.owner_id,
    detail: `${formatHours(data.duration_minutes)} hrs${
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

function formatHours(minutes: number | null): string {
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 2,
  }).format((minutes ?? 0) / 60);
}
