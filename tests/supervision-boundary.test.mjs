import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const repoRoot = fileURLToPath(new URL('../', import.meta.url));

test('attention items are separate, server-owned actionable state', async () => {
  const migration = await readRepoFile(
    'supabase/migrations/20260820090000_attention_items.sql'
  );

  assert.match(migration, /create table if not exists public\.attention_items/);
  assert.match(migration, /activity_event_id uuid references public\.activity_events/);
  assert.match(migration, /status in \('open', 'resolved', 'dismissed'\)/);
  assert.match(migration, /grant select on public\.attention_items to authenticated/);
  assert.doesNotMatch(
    migration,
    /grant[^;]*(?:insert|update|delete)[^;]*public\.attention_items to authenticated/
  );
  assert.match(migration, /public\.user_can_manage_business\(v_item\.business_id\)/);
  assert.match(migration, /public\.business_has_feature\(v_item\.business_id, 'activity\.feed'\)/);
  assert.match(migration, /function public\.resolve_receipt_attention/);
  assert.match(migration, /v_receipt_status <> 'accepted'/);
  assert.match(migration, /where ae\.status in \('needs_attention', 'review_recommended'\)/);
});

test('the app resolves attention state without mutating accepted-receipt history', async () => {
  const [activityApi, activityFeed, activityScreen, receipts, receiptCommit] = await Promise.all([
    readRepoFile('src/lib/activityEvents.ts'),
    readRepoFile('src/lib/globalActivity.ts'),
    readRepoFile('src/screens/ActivityScreen.tsx'),
    readRepoFile('src/lib/receipts.ts'),
    readRepoFile('supabase/migrations/20260822012000_atomic_receipt_review.sql'),
  ]);

  assert.match(activityFeed, /from\('attention_items'\)/);
  assert.match(activityFeed, /const durableAttentionEventIds = new Set<string>\(\)/);
  assert.match(activityFeed, /if \(attention\.status !== 'open'\) \{\s*continue;/);
  assert.match(activityFeed, /!durableAttentionEventIds\.has\(event\.id\)/);
  assert.match(activityFeed, /!durableAttentionSourceKeys\.has\(/);
  assert.match(activityApi, /rpc\('resolve_attention_item'/);
  assert.doesNotMatch(activityApi, /from\('activity_events'\)[\s\S]*?\.update\(/);
  assert.match(activityScreen, /item\.attentionItemId/);
  assert.doesNotMatch(activityScreen, /resolveActivityEvent/);
  assert.match(activityApi, /rpc\('resolve_receipt_attention'/);
  assert.doesNotMatch(receipts, /deleteReceiptActivityEvents/);
  assert.match(receiptCommit, /update public\.attention_items[\s\S]*status = 'resolved'/);
  assert.match(receiptCommit, /'receipt_voided'/);
  assert.match(receiptCommit, /If v_receipt\.status = 'accepted'/i);
});

test('receipt processing opens and resolves the durable attention lifecycle', async () => {
  const worker = await readRepoFile('supabase/functions/process-receipt-queue/index.ts');

  assert.match(worker, /syncReceiptAttentionItem/);
  assert.match(worker, /from\('attention_items'\)\s*\n\s*\.update/);
  assert.match(worker, /from\('attention_items'\)\.upsert/);
  assert.match(worker, /status: 'open'/);
  assert.match(worker, /status: 'resolved'/);
  assert.match(worker, /onConflict: 'business_id,item_type,source_table,source_id'/);
});

test('receipt truth preserves credits and the final amount paid', async () => {
  const [receiptProcessing, receiptNormalization, receiptReview] = await Promise.all([
    readRepoFile('supabase/functions/_shared/receipt-processing.ts'),
    readRepoFile('supabase/functions/_shared/receipt-normalization.ts'),
    readRepoFile('src/screens/ReceiptReviewScreen.tsx'),
  ]);

  assert.match(receiptProcessing, /final out-of-pocket amount paid/);
  assert.match(receiptNormalization, /computed_total/);
  assert.match(receiptNormalization, /total_discrepancy/);
  assert.match(receiptNormalization, /hasReceiptTotalDiscrepancy/);
  assert.match(receiptReview, /itemTotal - discountTotal/);
  assert.match(receiptReview, /canAutoFinalizeSingleJobReceipt/);
  assert.match(receiptReview, /hasCompletedDuplicateCheck/);
});

test('receipt processing retries missing identity fields and reports only the missing data', async () => {
  const [receiptProcessing, receiptNormalization] = await Promise.all([
    readRepoFile('supabase/functions/_shared/receipt-processing.ts'),
    readRepoFile('supabase/functions/_shared/receipt-normalization.ts'),
  ]);

  assert.match(receiptProcessing, /recoverMissingReceiptIdentity/);
  assert.match(receiptProcessing, /The first pass missed:/);
  assert.match(receiptProcessing, /bottom\/footer/);
  assert.match(receiptProcessing, /Ignore return-policy deadlines/);
  assert.match(receiptProcessing, /receipt_identity_recovery/);
  assert.match(receiptNormalization, /Missing or invalid data: \$\{formatList\(missingFields\)\}/);
  assert.doesNotMatch(receiptProcessing, /Please retake a clearer photo/);
});

test('Activity collapses every approved Tell into one parent row', async () => {
  const activityFeed = await readRepoFile('src/lib/globalActivity.ts');

  assert.match(activityFeed, /const tellActivityGroups = new Map/);
  assert.match(activityFeed, /getTellSubmissionId\(event\.metadata\)/);
  assert.match(activityFeed, /id: `tell-approved-\$\{tellSubmissionId\}`/);
  assert.match(activityFeed, /label: 'Tell update approved'/);
  assert.match(activityFeed, /if \(entry\.source === 'tell_contracktor'\)/);
  assert.match(activityFeed, /tellCreatedNoteIds\.has\(note\.id\)/);
  assert.match(activityFeed, /openTellAttentionIds\.has\(tellSubmissionId\)/);
});

test('Activity collapses receipt commit audit and expense rows into one receipt item', async () => {
  const activityFeed = await readRepoFile('src/lib/globalActivity.ts');

  assert.match(activityFeed, /getActivityEventReceiptId\(/);
  assert.match(activityFeed, /Record<string, unknown>\)\.receiptId/);
  assert.match(activityFeed, /collapseReceiptActivityItems\(items\)/);
  assert.match(activityFeed, /bestReceiptItems\.set\(item\.receiptId, item\)/);
  assert.match(activityFeed, /item\.id\.startsWith\('receipt-expense-'\)/);
});

async function readRepoFile(relativePath) {
  return readFile(new URL(relativePath, `file://${repoRoot}/`), 'utf8');
}
