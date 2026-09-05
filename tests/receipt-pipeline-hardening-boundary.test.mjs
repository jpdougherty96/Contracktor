import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

async function readRepoFile(path) {
  return readFile(new URL(`../${path}`, import.meta.url), 'utf8');
}

test('receipt extraction persistence is atomic and protected by a worker lease', async () => {
  const [migration, worker, processor] = await Promise.all([
    readRepoFile('supabase/migrations/20260904013000_atomic_receipt_extraction_persistence.sql'),
    readRepoFile('supabase/functions/process-receipt-queue/index.ts'),
    readRepoFile('supabase/functions/_shared/receipt-processing.ts'),
  ]);

  assert.match(migration, /function public\.persist_receipt_extraction/);
  assert.match(migration, /for update/);
  assert.match(migration, /processing_lease_id is distinct from p_processing_lease_id/);
  assert.match(migration, /delete from public\.receipt_line_items/);
  assert.match(migration, /insert into public\.receipt_line_items/);
  assert.match(migration, /update public\.receipts/);
  assert.match(worker, /processingLeaseId/);
  assert.doesNotMatch(worker, /mark_receipt_processing/);
  assert.match(processor, /rpc\(\s*'persist_receipt_extraction'/);
});

test('queue claims handle poison messages, stale leases, and explicit retries', async () => {
  const [migration, followups, review, worker] = await Promise.all([
    readRepoFile('supabase/migrations/20260904011000_receipt_queue_recovery.sql'),
    readRepoFile('supabase/migrations/20260904015000_receipt_release_followups.sql'),
    readRepoFile('src/screens/ReceiptReviewScreen.tsx'),
    readRepoFile('supabase/functions/process-receipt-queue/index.ts'),
  ]);

  assert.match(migration, /processing_attempts >= 3/);
  assert.match(migration, /processing_started_at > now\(\) - interval '15 minutes'/);
  assert.match(migration, /perform pgmq\.delete/);
  assert.match(migration, /processing_attempts = 0/);
  assert.match(migration, /contracktor-recover-stale-receipts/);
  assert.doesNotMatch(followups, /pgmq\.q_receipt_processing/);
  assert.match(worker, /p_visibility_timeout: 900/);
  assert.match(review, /receiptPollingTimedOut/);
  assert.match(review, /Try reading receipt again/);
});

test('financial commits require completed extraction and prorate discounts', async () => {
  const [migration, followups, receipts, review] = await Promise.all([
    readRepoFile('supabase/migrations/20260904010000_receipt_financial_hardening.sql'),
    readRepoFile('supabase/migrations/20260904015000_receipt_release_followups.sql'),
    readRepoFile('src/lib/receipts.ts'),
    readRepoFile('src/screens/ReceiptReviewScreen.tsx'),
  ]);

  assert.match(migration, /processing_status <> 'complete'/);
  assert.match(migration, /v_discount_total \* line_item\.line_total \/ v_item_total/);
  assert.match(migration, /guard_invoiced_receipt_expense_delete/);
  assert.match(migration, /when v_subtotal is not null and v_component_total > 0/);
  assert.match(followups, /guard_receipt_line_reconciliation/);
  assert.match(followups, /receipts_storage_path_idx/);
  assert.match(receipts, /calculateLineAllocatedDiscount/);
  assert.match(review, /lineItemsDoNotMatchReceiptTotal/);
});

test('only clean receipts auto-finalize and the retired direct extractor stays absent', async () => {
  const [review, config, receipts] = await Promise.all([
    readRepoFile('src/screens/ReceiptReviewScreen.tsx'),
    readRepoFile('supabase/config.toml'),
    readRepoFile('src/lib/receipts.ts'),
  ]);

  assert.match(review, /canAutoFinalizeSingleJobReceipt/);
  assert.match(review, /hasCompletedDuplicateCheck/);
  assert.doesNotMatch(config, /functions\.extract-receipt/);
  assert.doesNotMatch(receipts, /functions\/v1\/extract-receipt/);
});
