import { supabase } from '@/src/lib/supabase';
import type { Tables } from '@/src/types/database';

// Deferred Phase 1 code: kept for the old standalone Job Plan workflow, which
// is intentionally not routed in the active app.
export type JobPlan = Tables<'job_plans'>;

export type SaveJobPlanInput = {
  assumptions?: string;
  estimatedLaborHours?: number | null;
  estimatedMaterialCost?: number | null;
  estimatedOtherCost?: number | null;
  exclusions?: string;
  plannedPhases?: string;
  scopeOfWork?: string;
};

const jobPlanFields =
  'id, job_id, owner_id, business_id, created_by_user_id, scope_of_work, assumptions, exclusions, estimated_labor_hours, estimated_material_cost, estimated_other_cost, planned_phases, created_at, updated_at';

export async function fetchJobPlan(jobId: string): Promise<JobPlan | null> {
  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError) {
    throw new Error(userError.message);
  }

  if (!userData.user) {
    return null;
  }

  const { data, error } = await supabase
    .from('job_plans')
    .select(jobPlanFields)
    .eq('job_id', jobId)
    .eq('owner_id', userData.user.id)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

export async function saveJobPlan(jobId: string, input: SaveJobPlanInput): Promise<JobPlan> {
  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError) {
    throw new Error(userError.message);
  }

  if (!userData.user) {
    throw new Error('You must be logged in to save a job plan.');
  }

  const { data, error } = await supabase
    .from('job_plans')
    .upsert(
      {
        assumptions: input.assumptions?.trim() || null,
        estimated_labor_hours: input.estimatedLaborHours ?? null,
        estimated_material_cost: input.estimatedMaterialCost ?? null,
        estimated_other_cost: input.estimatedOtherCost ?? null,
        exclusions: input.exclusions?.trim() || null,
        job_id: jobId,
        owner_id: userData.user.id,
        planned_phases: input.plannedPhases?.trim() || null,
        scope_of_work: input.scopeOfWork?.trim() || null,
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: 'job_id',
      }
    )
    .select(jobPlanFields)
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}
