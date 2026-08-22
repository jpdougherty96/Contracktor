import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const repoRoot = fileURLToPath(new URL('../', import.meta.url));

test('receipt review is one locked and idempotent financial capability', async () => {
  const migration = await readRepoFile(
    'supabase/migrations/20260822012000_atomic_receipt_review.sql'
  );

  assert.match(migration, /create table if not exists public\.receipt_review_commits/);
  assert.match(migration, /receipt_review_commits_receipt_key_unique unique/);
  assert.match(migration, /function public\.commit_receipt_review/);
  assert.match(migration, /from public\.receipts[\s\S]*for update;/);
  assert.match(migration, /v_existing_commit\.request_fingerprint/);
  assert.match(migration, /last_review_commit_key is distinct from/);
  assert.match(migration, /perform set_config\('app\.receipt_financial_commit', 'on', true\)/);
  assert.match(migration, /guard_receipt_derived_expense/);
  assert.match(migration, /grant execute on function public\.commit_receipt_review/);
});

test('server requires complete authoritative line dispositions and validates jobs', async () => {
  const migration = await readRepoFile(
    'supabase/migrations/20260822012000_atomic_receipt_review.sql'
  );

  assert.match(migration, /v_assignment_count <> v_line_count/);
  assert.match(migration, /Every authoritative receipt line requires an explicit disposition/);
  assert.match(migration, /line_item\.receipt_id = p_receipt_id/);
  assert.match(migration, /job\.business_id = v_receipt\.business_id/);
  assert.match(migration, /assignment\.assignment_type not in \('job', 'tools_inventory', 'ignore'\)/);
  assert.match(migration, /line_item\.line_type <> 'item'[\s\S]*assignment\.assignment_type <> 'ignore'/);
  assert.match(migration, /v_allocated_cost > v_total \+ 0\.05/);
});

test('client approval paths no longer write financial rows directly', async () => {
  const receipts = await readRepoFile('src/lib/receipts.ts');
  const commitSection = section(
    receipts,
    'export async function updateReceipt',
    'async function recordReceiptEventSafely'
  );

  assert.match(commitSection, /commitReceiptReview\(receiptId/);
  assert.match(commitSection, /rpc\('commit_receipt_review'/);
  assert.match(commitSection, /mode: 'whole'/);
  assert.match(commitSection, /mode: 'lines'/);
  assert.doesNotMatch(commitSection, /from\('expenses'\)/);
  assert.doesNotMatch(commitSection, /from\('receipt_line_items'\)[\s\S]*\.update\(/);
  assert.doesNotMatch(commitSection, /status: 'accepted'/);
});

test('accepted receipt removal voids cost and preserves durable history', async () => {
  const [migration, receipts] = await Promise.all([
    readRepoFile('supabase/migrations/20260822012000_atomic_receipt_review.sql'),
    readRepoFile('src/lib/receipts.ts'),
  ]);

  assert.match(migration, /if v_receipt\.status = 'accepted' then/);
  assert.match(migration, /set[\s\S]*status = 'voided'/);
  assert.match(migration, /'receipt_voided'/);
  assert.match(migration, /'Receipt voided'/);
  assert.match(receipts, /rpc\('remove_receipt'/);
  assert.doesNotMatch(receipts, /deleteReceiptActivityEvents/);
  assert.match(receipts, /result\?\.action === 'discarded'/);
});

function section(source, start, end) {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex);

  assert.notEqual(startIndex, -1, `Missing section start: ${start}`);
  assert.notEqual(endIndex, -1, `Missing section end: ${end}`);
  return source.slice(startIndex, endIndex);
}

async function readRepoFile(relativePath) {
  return readFile(new URL(relativePath, `file://${repoRoot}/`), 'utf8');
}
