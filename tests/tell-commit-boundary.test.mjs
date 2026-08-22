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

  assert.match(tellApi, /rpc\('commit_tell_contracktor_entry'/);
  assert.match(screen, /commitTellContracktorEntry\(result\.entry_id, commitProposals\)/);
  assert.doesNotMatch(screen, /createJobNote|createShoppingNeed|createJobHours|createPayment/);
  assert.doesNotMatch(screen, /proposal\.type === 'payment'/);
  assert.match(tellFunction, /entry_id: tellEntry\.id/);
  assert.match(tellFunction, /Payments are outside the initial Tell workflow/);
});

test('Tell photo retries use deterministic storage and attachment identities', async () => {
  const [migration, notes, screen] = await Promise.all([
    readRepoFile('supabase/migrations/20260820092000_atomic_tell_commit.sql'),
    readRepoFile('src/lib/jobNotes.ts'),
    readRepoFile('src/screens/TellContracktorScreen.tsx'),
  ]);

  assert.match(migration, /attachments_storage_path_unique/);
  assert.match(notes, /idempotencyKey/);
  assert.match(notes, /upsert: Boolean\(options\.idempotencyKey\)/);
  assert.match(notes, /onConflict: 'storage_path'/);
  assert.match(screen, /idempotencyKey: `\$\{result\.entry_id\}-\$\{photoIndex \+ 1\}`/);
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
