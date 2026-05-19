import { supabase } from '@/src/lib/supabase';
import { ensureProfileForUser } from '@/src/lib/profiles';
import type { Tables } from '@/src/types/database';
import type { Job, JobType } from '@/src/types/job';

type JobSnapshotSummary = Pick<
  Tables<'job_financial_snapshots'>,
  'job_id' | 'receipt_cost' | 'total_hours'
>;

export type CreateJobInput = {
  name: string;
  clientName?: string;
  location?: string;
  jobType?: JobType;
  hourlyRate?: number | null;
  timeClockEnabled?: boolean;
  quoteAmount: number;
  estimatedLaborHours?: number | null;
  estimatedMaterialCost?: number | null;
  estimatedSubCost?: number | null;
  estimatedMiscCost?: number | null;
};

export type UpdateJobInput = CreateJobInput & {
  status: string;
};

const jobFields =
  'id, owner_id, name, client_name, location, job_type, quote_amount, hourly_rate, time_clock_enabled, estimated_labor_hours, estimated_material_cost, estimated_sub_cost, estimated_misc_cost, status, start_date, end_date, created_at, updated_at';

export async function fetchJobs(): Promise<Job[]> {
  const user = await getAuthenticatedUser();

  if (!user) {
    return [];
  }

  const { data, error } = await supabase
    .from('jobs')
    .select(jobFields)
    .eq('owner_id', user.id)
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  const rows = data ?? [];
  const jobIds = rows.map((job) => job.id);
  const snapshotsByJobId = await fetchSnapshotSummaries(user.id, jobIds);

  return rows.map((row) => mapJobRow(row, snapshotsByJobId.get(row.id)));
}

export async function createJob(input: CreateJobInput): Promise<Job> {
  const user = await getAuthenticatedUser();

  if (!user) {
    throw new Error('You must be logged in to create a job.');
  }

  await ensureProfileForUser(user);

  const { data, error } = await supabase
    .from('jobs')
    .insert({
      owner_id: user.id,
      name: input.name,
      client_name: input.clientName?.trim() || null,
      location: input.location?.trim() || null,
      job_type: input.jobType ?? 'fixed_bid',
      quote_amount: input.quoteAmount,
      hourly_rate: input.hourlyRate ?? null,
      time_clock_enabled: input.timeClockEnabled ?? false,
      estimated_labor_hours: input.estimatedLaborHours ?? null,
      estimated_material_cost: input.estimatedMaterialCost ?? null,
      estimated_sub_cost: input.estimatedSubCost ?? null,
      estimated_misc_cost: input.estimatedMiscCost ?? null,
      status: 'active',
    })
    .select(jobFields)
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return mapJobRow(data);
}

export async function updateJob(jobId: string, input: UpdateJobInput): Promise<Job> {
  const user = await getAuthenticatedUser();

  if (!user) {
    throw new Error('You must be logged in to update a job.');
  }

  const { data, error } = await supabase
    .from('jobs')
    .update({
      client_name: input.clientName?.trim() || null,
      estimated_labor_hours: input.estimatedLaborHours ?? null,
      estimated_material_cost: input.estimatedMaterialCost ?? null,
      estimated_misc_cost: input.estimatedMiscCost ?? null,
      estimated_sub_cost: input.estimatedSubCost ?? null,
      location: input.location?.trim() || null,
      job_type: input.jobType ?? 'fixed_bid',
      name: input.name,
      quote_amount: input.quoteAmount,
      hourly_rate: input.hourlyRate ?? null,
      time_clock_enabled: input.timeClockEnabled ?? false,
      status: input.status,
      updated_at: new Date().toISOString(),
    })
    .eq('id', jobId)
    .eq('owner_id', user.id)
    .select(jobFields)
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return mapJobRow(data);
}


async function getAuthenticatedUser() {
  const { data, error } = await supabase.auth.getUser();

  if (error) {
    throw new Error(error.message);
  }

  return data.user;
}

async function fetchSnapshotSummaries(
  ownerId: string,
  jobIds: string[]
): Promise<Map<string, JobSnapshotSummary>> {
  if (jobIds.length === 0) {
    return new Map();
  }

  const { data, error } = await supabase
    .from('job_financial_snapshots')
    .select('job_id, receipt_cost, total_hours')
    .eq('owner_id', ownerId)
    .in('job_id', jobIds);

  if (error) {
    throw new Error(error.message);
  }

  return new Map(
    (data ?? [])
      .filter((snapshot): snapshot is JobSnapshotSummary & { job_id: string } => Boolean(snapshot.job_id))
      .map((snapshot) => [snapshot.job_id, snapshot])
  );
}

function mapJobRow(row: Tables<'jobs'>, snapshot?: JobSnapshotSummary): Job {
  return {
    id: row.id,
    name: row.name,
    clientName: row.client_name ?? 'No client name',
    location: row.location,
    jobType: isJobType(row.job_type) ? row.job_type : 'fixed_bid',
    quoteAmount: row.quote_amount ?? 0,
    hourlyRate: row.hourly_rate,
    timeClockEnabled: row.time_clock_enabled ?? false,
    estimatedLaborHours: row.estimated_labor_hours,
    estimatedMaterialCost: row.estimated_material_cost,
    estimatedSubCost: row.estimated_sub_cost,
    estimatedMiscCost: row.estimated_misc_cost,
    actualMaterialCost: snapshot?.receipt_cost ?? null,
    actualLaborHours: snapshot?.total_hours ?? null,
    status: row.status,
    createdAt: row.created_at ?? undefined,
    updatedAt: row.updated_at ?? undefined,
    receipts: [],
    hours: [],
    payments: [],
    notes: [],
  };
}

function isJobType(value: string | null | undefined): value is JobType {
  return value === 'fixed_bid' || value === 'time_and_materials';
}
