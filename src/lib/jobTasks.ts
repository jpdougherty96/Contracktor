import { supabase } from '@/src/lib/supabase';
import type { Tables } from '@/src/types/database';

export type JobTask = Tables<'job_tasks'>;
export type JobTaskAction = 'cancel' | 'complete' | 'rename' | 'reopen';
export type JobTaskStatus = 'cancelled' | 'completed' | 'open';

const jobTaskFields =
  'id, business_id, owner_id, job_id, title, status, source_type, created_by_user_id, completed_by_user_id, cancelled_by_user_id, creation_idempotency_key, version, created_at, updated_at, completed_at, cancelled_at';

let mutationSequence = 0;

export async function fetchJobTasks(jobId: string): Promise<JobTask[]> {
  const { data, error } = await supabase
    .from('job_tasks')
    .select(jobTaskFields)
    .eq('job_id', jobId)
    .order('created_at', { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).sort(compareTasks);
}

export async function createJobTask(
  jobId: string,
  title: string,
  options: { idempotencyKey?: string } = {}
): Promise<JobTask> {
  const cleanTitle = validateTitle(title);
  const { data, error } = await supabase.rpc('create_job_task', {
    p_idempotency_key: options.idempotencyKey ?? createTaskMutationKey('create'),
    p_job_id: jobId,
    p_title: cleanTitle,
  });

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

export async function changeJobTask(
  task: JobTask,
  action: JobTaskAction,
  options: { idempotencyKey?: string; title?: string } = {}
): Promise<JobTask> {
  const title = action === 'rename' ? validateTitle(options.title ?? '') : task.title;
  const { data, error } = await supabase.rpc('change_job_task', {
    p_action: action,
    p_expected_updated_at: task.updated_at,
    p_idempotency_key: options.idempotencyKey ?? createTaskMutationKey(action),
    p_task_id: task.id,
    p_title: title,
  });

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

export function createTaskMutationKey(action: string): string {
  mutationSequence += 1;
  return `job-task-${action}-${Date.now()}-${mutationSequence}-${Math.random()
    .toString(36)
    .slice(2, 10)}`;
}

function validateTitle(title: string): string {
  const cleanTitle = title.trim().replace(/\s+/g, ' ');

  if (!cleanTitle) {
    throw new Error('Enter what needs to be done.');
  }

  if (cleanTitle.length > 240) {
    throw new Error('Task title must be 240 characters or fewer.');
  }

  return cleanTitle;
}

function compareTasks(left: JobTask, right: JobTask): number {
  const statusOrder: Record<string, number> = { open: 0, completed: 1, cancelled: 2 };
  const statusDifference = (statusOrder[left.status] ?? 3) - (statusOrder[right.status] ?? 3);

  if (statusDifference !== 0) {
    return statusDifference;
  }

  if (left.status === 'open') {
    return left.created_at.localeCompare(right.created_at);
  }

  return right.updated_at.localeCompare(left.updated_at);
}
