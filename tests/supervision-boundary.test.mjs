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

test('the app resolves attention state without mutating activity history', async () => {
  const [activityApi, activityFeed, activityScreen, receipts] = await Promise.all([
    readRepoFile('src/lib/activityEvents.ts'),
    readRepoFile('src/lib/globalActivity.ts'),
    readRepoFile('src/screens/ActivityScreen.tsx'),
    readRepoFile('src/lib/receipts.ts'),
  ]);

  assert.match(activityFeed, /from\('attention_items'\)/);
  assert.match(activityFeed, /\.eq\('status', 'open'\)/);
  assert.match(activityApi, /rpc\('resolve_attention_item'/);
  assert.doesNotMatch(activityApi, /from\('activity_events'\)[\s\S]*?\.update\(/);
  assert.match(activityScreen, /item\.attentionItemId/);
  assert.doesNotMatch(activityScreen, /resolveActivityEvent/);
  assert.match(activityApi, /rpc\('resolve_receipt_attention'/);
  assert.match(receipts, /resolveReceiptAttention\(input\.receipt\.id\)/);
  assert.match(receipts, /input\.eventType === 'receipt_saved'/);
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
  const [receiptProcessing, receiptReview] = await Promise.all([
    readRepoFile('supabase/functions/_shared/receipt-processing.ts'),
    readRepoFile('src/screens/ReceiptReviewScreen.tsx'),
  ]);

  assert.match(receiptProcessing, /final out-of-pocket amount paid/);
  assert.match(receiptProcessing, /adjustedLineTotal/);
  assert.match(receiptProcessing, /subtotal - discountTotal \+ extraction\.tax/);
  assert.match(receiptReview, /hasReceiptAdjustments/);
  assert.match(receiptReview, /!hasReceiptAdjustments/);
});

async function readRepoFile(relativePath) {
  return readFile(new URL(relativePath, `file://${repoRoot}/`), 'utf8');
}
