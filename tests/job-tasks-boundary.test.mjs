import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const repoRoot = fileURLToPath(new URL('../', import.meta.url));

test('Job Tasks use manager-scoped RLS and authoritative mutation capabilities', async () => {
  const migration = await readRepoFile(
    'supabase/migrations/20260823010000_job_tasks.sql'
  );

  assert.match(migration, /create table public\.job_tasks/);
  assert.match(migration, /create table public\.job_task_events/);
  assert.match(migration, /public\.user_can_manage_business\(business_id\)/);
  assert.doesNotMatch(migration, /user_is_business_member\(business_id\).*read job tasks/s);
  assert.match(migration, /revoke insert, update, delete on public\.job_tasks from authenticated/);
  assert.match(migration, /revoke insert, update, delete on public\.job_task_events from authenticated/);
  assert.match(migration, /create or replace function public\.create_job_task/);
  assert.match(migration, /create or replace function public\.change_job_task/);
  assert.match(migration, /Only a business owner or admin can manage job tasks/);
});

test('Task state changes preserve immutable, attributable history', async () => {
  const migration = await readRepoFile(
    'supabase/migrations/20260823010000_job_tasks.sql'
  );

  assert.match(migration, /actor_user_id uuid not null/);
  assert.match(migration, /title_snapshot text not null/);
  assert.match(migration, /'task_created', 'task_renamed', 'task_completed', 'task_reopened', 'task_cancelled'/);
  assert.match(migration, /insert into public\.job_task_events/);
  assert.match(migration, /on conflict \(actor_user_id, idempotency_key\)\s+do nothing/);
  assert.doesNotMatch(migration, /delete from public\.job_task_events/);
  assert.doesNotMatch(migration, /update public\.job_task_events/);
  assert.match(migration, /'job_task_events'/);
  assert.match(migration, /source_id,\s+title,\s+detail,\s+metadata,\s+occurred_at/);
  assert.match(migration, /Only completed or cancelled tasks can be reopened/);
});

test('The app task UI mutates through RPC wrappers and exposes the small lifecycle', async () => {
  const [client, panel, dashboard, activity, truth] = await Promise.all([
    readRepoFile('src/lib/jobTasks.ts'),
    readRepoFile('src/components/JobTasksPanel.tsx'),
    readRepoFile('src/screens/JobDashboardScreen.tsx'),
    readRepoFile('src/lib/jobActivity.ts'),
    readRepoFile('src/lib/jobFinancials.ts'),
  ]);

  assert.match(client, /\.rpc\('create_job_task'/);
  assert.match(client, /\.rpc\('change_job_task'/);
  assert.doesNotMatch(client, /\.from\('job_tasks'\)\s*\.insert/);
  assert.doesNotMatch(client, /\.from\('job_tasks'\)\s*\.update/);
  assert.match(panel, />Tasks<\/Text>/);
  assert.match(panel, />TO DO<\/Text>/);
  assert.match(panel, />COMPLETED<\/Text>/);
  assert.match(panel, /handleChange\(task, 'complete'\)/);
  assert.match(panel, /handleChange\(task, 'reopen'\)/);
  assert.match(panel, /handleChange\(task, 'cancel'\)/);
  assert.match(panel, /handleChange\(task, 'rename'/);
  assert.match(dashboard, /<JobTasksPanel/);
  assert.match(dashboard, /label="Open tasks"/);
  assert.match(activity, /source_table', 'job_task_events'/);
  assert.match(truth, /openTaskCount/);
});

test('Job Tasks v1 explicitly defers crew and Tell until their authoritative boundaries exist', async () => {
  const [migration, tellClient, tellCommit] = await Promise.all([
    readRepoFile('supabase/migrations/20260823010000_job_tasks.sql'),
    readRepoFile('src/lib/tellContracktor.ts'),
    readRepoFile('supabase/migrations/20260820092000_atomic_tell_commit.sql'),
  ]);

  assert.match(migration, /Crew access intentionally waits for an authoritative user-to-job assignment model/);
  assert.doesNotMatch(tellClient, /task_create|task_complete/);
  assert.doesNotMatch(tellCommit, /task_create|task_complete/);
});

async function readRepoFile(relativePath) {
  return readFile(new URL(relativePath, `file://${repoRoot}/`), 'utf8');
}
