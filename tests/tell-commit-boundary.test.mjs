import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const repoRoot = fileURLToPath(new URL('../', import.meta.url));

test('Tell approval is one authenticated, atomic, idempotent database capability', async () => {
  const migration = await readRepoFile(
    'supabase/migrations/20260820092000_atomic_tell_commit.sql'
  );

  assert.match(migration, /create table if not exists public\.tell_contracktor_commits/);
  assert.match(migration, /entry_id uuid primary key/);
  assert.match(migration, /function public\.commit_tell_contracktor_entry/);
  assert.match(migration, /for update;/);
  assert.match(migration, /if v_existing_result is not null then/);
  assert.match(migration, /public\.business_has_feature\(v_entry\.business_id, 'tell\.basic'\)/);
  assert.match(migration, /v_kind not in \('note', 'shopping', 'hours'\)/);
  assert.doesNotMatch(migration, /insert into public\.customer_payments/);
  assert.match(migration, /grant execute on function public\.commit_tell_contracktor_entry/);
});

test('Tell UI sends reviewed proposals through the server commit boundary', async () => {
  const [screen, tellApi, tellFunction] = await Promise.all([
    readRepoFile('src/screens/TellContracktorScreen.tsx'),
    readRepoFile('src/lib/tellContracktor.ts'),
    readRepoFile('supabase/functions/tell-contracktor/index.ts'),
  ]);

  assert.match(tellApi, /rpc\('review_tell_contracktor_proposals'/);
  assert.match(screen, /commitTellContracktorEntry\(result\.entry_id, commitProposals\)/);
  assert.doesNotMatch(screen, /createJobNote|createShoppingNeed|createJobHours|createPayment/);
  assert.doesNotMatch(screen, /proposal\.type === 'payment'/);
  assert.match(tellFunction, /entry_id: tellEntry\.id/);
  assert.match(tellFunction, /Payments are outside the initial Tell workflow/);
});

test('Tell photos are secured before processing and attached deterministically on approval', async () => {
  const [migration, tellFunction] = await Promise.all([
    readRepoFile('supabase/migrations/20260827090000_async_grouped_tell_submissions.sql'),
    readRepoFile('supabase/functions/tell-contracktor/index.ts'),
  ]);

  assert.match(migration, /create table if not exists public\.tell_contracktor_attachments/);
  assert.match(migration, /constraint tell_contracktor_attachments_storage_unique/);
  assert.match(migration, /on conflict \(storage_path\) do update/);
  assert.match(tellFunction, /`\$\{user\.id\}\/tell\/\$\{tellEntry\.id\}\/\$\{index \+ 1\}/);
  assert.match(tellFunction, /upsert: true/);
});

test('Tell submissions are durable, queued, grouped, and reopenable from attention', async () => {
  const [migration, tellApi, tellFunction, worker, screen, activity] = await Promise.all([
    readRepoFile('supabase/migrations/20260827090000_async_grouped_tell_submissions.sql'),
    readRepoFile('src/lib/tellContracktor.ts'),
    readRepoFile('supabase/functions/tell-contracktor/index.ts'),
    readRepoFile('supabase/functions/process-tell-queue/index.ts'),
    readRepoFile('src/screens/TellContracktorScreen.tsx'),
    readRepoFile('src/lib/globalActivity.ts'),
  ]);

  assert.match(migration, /pgmq\.create\('tell_processing'\)/);
  assert.match(migration, /create table if not exists public\.tell_contracktor_proposals/);
  assert.match(migration, /status in \('pending', 'approved', 'dismissed'\)/);
  assert.match(migration, /function public\.review_tell_contracktor_proposals/);
  assert.match(migration, /function public\.dismiss_tell_contracktor_proposal/);
  assert.match(tellFunction, /status: 'queued'/);
  assert.match(tellFunction, /finalize_tell_submission/);
  assert.match(worker, /claim_tell_processing_jobs/);
  assert.match(tellApi, /fetchRecentTellContracktorSubmissions/);
  assert.match(screen, /Recent submissions/);
  assert.match(screen, /conTRACKtor is working on it/);
  assert.match(screen, /handleApproveProposal/);
  assert.match(activity, /tellSubmissionId/);
});

test('Tell queue work is detached from the trigger request and cannot wait forever', async () => {
  const [tellFunction, worker] = await Promise.all([
    readRepoFile('supabase/functions/tell-contracktor/index.ts'),
    readRepoFile('supabase/functions/process-tell-queue/index.ts'),
  ]);

  assert.match(worker, /Promise\.allSettled/);
  assert.match(worker, /EdgeRuntime\.waitUntil\(processing\)/);
  assert.match(worker, /status: 'accepted'/);
  assert.match(worker, /AbortSignal\.timeout\(tellProcessingTimeoutMs\)/);
  assert.match(worker, /Tell processing timed out and will be retried/);
  assert.match(tellFunction, /AbortSignal\.timeout\(openAiProcessingTimeoutMs\)/);
  assert.match(
    tellFunction,
    /const defaultOpenAiModel = 'gpt-5\.4-mini'/
  );
  assert.match(tellFunction, /const defaultOpenAiFallbackModel = 'gpt-4o-mini'/);
  assert.match(tellFunction, /Deno\.env\.get\('OPENAI_COMMAND_FALLBACK_MODEL'\)/);
  assert.match(tellFunction, /shouldUseFallbackModel/);
  assert.match(tellFunction, /Tell primary model was rejected; trying configured fallback/);
  assert.doesNotMatch(tellFunction, /OPENAI_COMMAND_MODEL.*OPENAI_RECEIPT_MODEL/);
  assert.match(tellFunction, /console\.error\('Tell processor failed'/);
});

test('legacy note-photo uploads remain idempotent', async () => {
  const [migration, notes] = await Promise.all([
    readRepoFile('supabase/migrations/20260820092000_atomic_tell_commit.sql'),
    readRepoFile('src/lib/jobNotes.ts'),
  ]);

  assert.match(migration, /attachments_storage_path_unique/);
  assert.match(notes, /idempotencyKey/);
  assert.match(notes, /upsert: Boolean\(options\.idempotencyKey\)/);
  assert.match(notes, /onConflict: 'storage_path'/);
});

test('Tell Undo reverses only unchanged records and preserves an audit trail', async () => {
  const [migration, photoProtection, activityJob, activityBackfill, screen, tellApi] =
    await Promise.all([
    readRepoFile('supabase/migrations/20260820093000_tell_undo.sql'),
    readRepoFile('supabase/migrations/20260820094000_protect_tell_note_additions.sql'),
    readRepoFile('supabase/migrations/20260822010000_tell_undo_activity_job.sql'),
    readRepoFile('supabase/migrations/20260822011000_backfill_tell_undo_activity_jobs.sql'),
    readRepoFile('src/screens/TellContracktorScreen.tsx'),
    readRepoFile('src/lib/tellContracktor.ts'),
  ]);

  assert.match(migration, /function public\.undo_tell_contracktor_entry/);
  assert.match(migration, /if v_entry_status = 'undone' then/);
  assert.match(migration, /revoke all on function public\.commit_tell_contracktor_entry_once/);
  assert.match(migration, /for update;/);
  assert.match(migration, /v_commit\.committed_by_user_id <> v_auth_user/);
  assert.match(migration, /A Tell-created note was edited after approval/);
  assert.match(migration, /shopping need changed after approval/);
  assert.match(migration, /Tell-created hours changed after approval/);
  assert.match(photoProtection, /A photo was added to a Tell-created note after approval/);
  assert.match(photoProtection, /revoke all on function public\.undo_tell_contracktor_entry_once/);
  assert.match(activityJob, /count\(distinct record ->> 'job_id'\)/);
  assert.match(activityJob, /set job_id = v_activity_job_id/);
  assert.match(activityBackfill, /event\.source_id = single_job_commits\.entry_id/);
  assert.match(migration, /'tell_contracktor_undone'/);
  assert.match(migration, /status = 'undone'/);
  assert.match(tellApi, /rpc\('undo_tell_contracktor_entry'/);
  assert.match(tellApi, /remove\(result\.attachment_storage_paths\)/);
  assert.match(screen, /undoTellContracktorEntry\(result\.entry_id\)/);
  assert.match(screen, /isSaving \? 'Undoing\.\.\.' : 'Undo'/);
});

async function readRepoFile(relativePath) {
  return readFile(new URL(relativePath, `file://${repoRoot}/`), 'utf8');
}
