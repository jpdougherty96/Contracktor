import { supabase } from '@/src/lib/supabase';
import type { Tables } from '@/src/types/database';

export type JobCrewMember = Tables<'job_crew_members'>;

export type EditableJobCrewMember = {
  hourlyRate: number;
  name: string;
};

const jobCrewFields =
  'id, owner_id, business_id, created_by_user_id, job_id, name, hourly_rate, active, created_at, updated_at';

export async function fetchJobCrewMembers(jobId: string): Promise<JobCrewMember[]> {
  const { data, error } = await supabase
    .from('job_crew_members')
    .select(jobCrewFields)
    .eq('job_id', jobId)
    .eq('active', true)
    .order('name', { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return data ?? [];
}

export async function replaceJobCrewMembers(
  jobId: string,
  members: EditableJobCrewMember[]
): Promise<void> {
  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError) {
    throw new Error(userError.message);
  }

  if (!userData.user) {
    throw new Error('You must be logged in to edit a job crew.');
  }

  const { error: deleteError } = await supabase
    .from('job_crew_members')
    .delete()
    .eq('job_id', jobId)
    .eq('owner_id', userData.user.id);

  if (deleteError) {
    throw new Error(deleteError.message);
  }

  const cleanMembers = members
    .map((member) => ({
      hourly_rate: member.hourlyRate,
      job_id: jobId,
      name: member.name.trim(),
      owner_id: userData.user.id,
    }))
    .filter((member) => member.name);

  if (cleanMembers.length === 0) {
    return;
  }

  const { error: insertError } = await supabase.from('job_crew_members').insert(cleanMembers);

  if (insertError) {
    throw new Error(insertError.message);
  }
}
