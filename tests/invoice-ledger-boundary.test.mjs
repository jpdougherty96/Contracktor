import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const repoRoot = fileURLToPath(new URL('../', import.meta.url));

test('invoice records and their source attribution are server-owned', async () => {
  const migration = await readRepoFile(
    'supabase/migrations/20260901042000_invoice_ledger.sql'
  );

  for (const table of [
    'invoice_sequences',
    'invoices',
    'invoice_lines',
    'invoice_time_entries',
    'invoice_expenses',
    'invoice_events',
  ]) {
    assert.match(migration, new RegExp(`create table public\\.${table}`));
  }

  assert.match(migration, /grant select on public\.invoices to authenticated/);
  assert.match(migration, /revoke insert, update, delete on public\.invoices from authenticated/);
  assert.match(migration, /create trigger protect_time_entry_invoice_attribution/);
  assert.match(migration, /create trigger protect_expense_invoice_attribution/);
  assert.match(migration, /Invoice attribution can only change through the invoice ledger/);
});

test('invoice draft mutations validate and snapshot billable source records', async () => {
  const migration = await readRepoFile(
    'supabase/migrations/20260901042000_invoice_ledger.sql'
  );

  assert.match(migration, /function public\.create_invoice_draft/);
  assert.match(migration, /function public\.save_invoice_draft/);
  assert.match(migration, /jsonb_array_elements_text\(coalesce\(v_line_json -> 'timeEntryIds'/);
  assert.match(migration, /Only reviewed labor can be invoiced/);
  assert.match(migration, /Only reviewed billable expenses can be invoiced/);
  assert.match(migration, /insert into public\.invoice_time_entries/);
  assert.match(migration, /insert into public\.invoice_expenses/);
  assert.match(migration, /source_snapshot/);
  assert.match(migration, /p_expected_version/);
  assert.match(migration, /idempotency_key/);
});

test('finalization is atomic and refuses duplicate or excessive billing', async () => {
  const migration = await readRepoFile(
    'supabase/migrations/20260901042000_invoice_ledger.sql'
  );

  assert.match(migration, /function public\.finalize_invoice/);
  assert.match(migration, /from public\.invoices\s+where id = p_invoice_id\s+for update/);
  assert.match(migration, /and t\.invoice_id is null/);
  assert.match(migration, /and e\.invoice_id is null/);
  assert.match(migration, /get diagnostics v_updated_count = row_count/);
  assert.match(migration, /if v_updated_count <> v_expected_count/);
  assert.match(migration, /v_fixed_scope_billed > v_invoice\.contract_amount/);
  assert.match(migration, /Use a change order for added scope/);
  assert.match(migration, /status = 'finalized'/);
  assert.match(migration, /'invoice_finalized'/);
});

test('the invoice screen saves through the ledger and builds T&M from unbilled sources', async () => {
  const [invoiceApi, invoiceDocument, invoiceScreen] = await Promise.all([
    readRepoFile('src/lib/invoices.ts'),
    readRepoFile('src/lib/invoiceDocument.ts'),
    readRepoFile('src/screens/InvoiceDraftScreen.tsx'),
  ]);

  assert.match(invoiceApi, /rpc\('create_invoice_draft'/);
  assert.match(invoiceApi, /rpc\('save_invoice_draft'/);
  assert.match(invoiceApi, /rpc\('finalize_invoice'/);
  assert.doesNotMatch(invoiceApi, /from\('invoices'\)/);
  assert.match(invoiceScreen, /fetchJobInvoiceDraft\(job\.id\)/);
  assert.match(invoiceScreen, /saveInvoiceDraft\(/);
  assert.match(invoiceDocument, /filter\(\(entry\) => !entry\.invoice_id\)/);
  assert.match(invoiceDocument, /entry\.billable[\s\S]*?!entry\.invoice_id/);
  assert.match(invoiceDocument, /entry\.hourly_rate/);
  assert.match(invoiceDocument, /Material procurement & handling fee/);
  assert.match(invoiceScreen, /availablePaymentCredit/);
  assert.doesNotMatch(invoiceScreen, /snapshot\?\.payments_received \?\? 0/);
  assert.match(invoiceScreen, /savedDraftFingerprint !== currentDraftFingerprint/);
  assert.match(invoiceScreen, /invoiceDraft !== null[\s\S]*?!hasUnsavedInvoiceChanges/);
  assert.match(invoiceScreen, /Save your changes before exporting/);
  assert.match(invoiceScreen, /invoice\.invoiceNumber/);
});

test('job-assigned receipts become invoice-eligible without including tools inventory', async () => {
  const migration = await readRepoFile(
    'supabase/migrations/20260901043000_billable_job_receipts.sql'
  );

  assert.match(migration, /current_setting\('app\.receipt_financial_commit', true\) = 'on'/);
  assert.match(migration, /new\.job_id is not null/);
  assert.match(migration, /new\.source_type in \('receipt', 'receipt_line_item'\)/);
  assert.match(migration, /new\.billable := true/);
  assert.match(migration, /before insert or update of job_id, source_type on public\.expenses/);
  assert.match(migration, /set_config\('app\.receipt_financial_commit', 'on', true\)/);
  assert.match(migration, /where job_id is not null/);
  assert.match(migration, /and invoice_id is null/);
  assert.match(migration, /and not billable/);
});

test('job payments are allocated once across invoices and stay in sync when edited', async () => {
  const [migration, invoiceApi, invoiceScreen] = await Promise.all([
    readRepoFile('supabase/migrations/20260901044000_invoice_payment_allocations.sql'),
    readRepoFile('src/lib/invoices.ts'),
    readRepoFile('src/screens/InvoiceDraftScreen.tsx'),
  ]);

  assert.match(migration, /create table public\.invoice_payment_allocations/);
  assert.match(migration, /primary key \(invoice_id, payment_id\)/);
  assert.match(migration, /function public\.rebuild_job_invoice_payment_allocations/);
  assert.match(migration, /order by p\.payment_date, p\.created_at nulls first, p\.id/);
  assert.match(migration, /order by i\.created_at, i\.id/);
  assert.match(migration, /least\(p\.payment_end, i\.invoice_end\)/);
  assert.match(migration, /after insert or delete or update of amount, payment_date, job_id/);
  assert.match(migration, /before insert or update of subtotal, retainage_amount, status/);
  assert.match(migration, /amount_paid = coalesce/);
  assert.match(migration, /function public\.get_job_invoice_payment_credit/);
  assert.match(invoiceApi, /rpc\('get_job_invoice_payment_credit'/);
  assert.match(invoiceScreen, /fetchAvailableInvoicePaymentCredit\(job\.id\)/);
  assert.match(invoiceScreen, /Math\.min\(Math\.max\(invoiceAmountPaid, 0\), subtotal\)/);
  assert.match(invoiceScreen, /label="Payments received"/);
});

async function readRepoFile(relativePath) {
  return readFile(new URL(relativePath, `file://${repoRoot}/`), 'utf8');
}
