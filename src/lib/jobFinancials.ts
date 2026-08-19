import { supabase } from '@/src/lib/supabase';
import type { Tables } from '@/src/types/database';

export type JobFinancialSnapshotRow = Tables<'job_financial_snapshots'>;
export type JobLaborCostEntry = Pick<
  Tables<'time_entries'>,
  'id' | 'work_date' | 'worker_name' | 'duration_minutes' | 'hourly_rate' | 'description'
>;
export type JobMaterialCostEntry = Pick<
  Tables<'expenses'>,
  | 'id'
  | 'description'
  | 'expense_date'
  | 'expense_type'
  | 'pre_tax_amount'
  | 'tax_amount'
  | 'total_amount'
  | 'receipt_id'
  | 'receipt_line_item_id'
>;

export async function fetchJobFinancialSnapshot(
  jobId: string
): Promise<JobFinancialSnapshotRow | null> {
  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError) {
    throw new Error(userError.message);
  }

  if (!userData.user) {
    return null;
  }

  const { data, error } = await supabase
    .from('job_financial_snapshots')
    .select(
      'job_id, owner_id, business_id, name, client_name, quote_amount, payments_received, labor_cost, receipt_cost, total_cost, projected_profit, projected_margin_percent, total_hours'
    )
    .eq('job_id', jobId)
    .eq('owner_id', userData.user.id)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

export async function fetchJobLaborCostEntries(jobId: string): Promise<JobLaborCostEntry[]> {
  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError) {
    throw new Error(userError.message);
  }

  if (!userData.user) {
    return [];
  }

  const { data, error } = await supabase
    .from('time_entries')
    .select('id, work_date, worker_name, duration_minutes, hourly_rate, description')
    .eq('job_id', jobId)
    .eq('owner_id', userData.user.id)
    .eq('status', 'reviewed')
    .order('work_date', { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return data ?? [];
}

export async function fetchJobMaterialCostEntries(jobId: string): Promise<JobMaterialCostEntry[]> {
  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError) {
    throw new Error(userError.message);
  }

  if (!userData.user) {
    return [];
  }

  const { data, error } = await supabase
    .from('expenses')
    .select(
      'id, description, expense_date, expense_type, pre_tax_amount, tax_amount, total_amount, receipt_id, receipt_line_item_id'
    )
    .eq('job_id', jobId)
    .eq('owner_id', userData.user.id)
    .neq('status', 'ignored')
    .order('expense_date', { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return data ?? [];
}
