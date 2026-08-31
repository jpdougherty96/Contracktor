import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const config = await readFile(new URL('../supabase/config.toml', import.meta.url), 'utf8');
const extractReceipt = await readFile(
  new URL('../supabase/functions/extract-receipt/index.ts', import.meta.url),
  'utf8'
);
const tellContracktor = await readFile(
  new URL('../supabase/functions/tell-contracktor/index.ts', import.meta.url),
  'utf8'
);
const processReceiptQueue = await readFile(
  new URL('../supabase/functions/process-receipt-queue/index.ts', import.meta.url),
  'utf8'
);
const processTellQueue = await readFile(
  new URL('../supabase/functions/process-tell-queue/index.ts', import.meta.url),
  'utf8'
);

function functionConfig(name) {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = config.match(
    new RegExp(`\\[functions\\.${escapedName}\\]([\\s\\S]*?)(?=\\n\\[|$)`)
  );

  assert.ok(match, `Missing explicit config for ${name}`);
  return match[1];
}

test('every deployed Edge Function has an explicit signing-key-safe gateway mode', () => {
  for (const name of [
    'extract-receipt',
    'tell-contracktor',
    'process-receipt-queue',
    'process-tell-queue',
  ]) {
    assert.match(functionConfig(name), /verify_jwt\s*=\s*false/);
  }
});

test('user-facing functions verify the caller after the gateway', () => {
  for (const source of [extractReceipt, tellContracktor]) {
    assert.match(source, /authorization\?\.startsWith\('Bearer '\)/);
    assert.match(source, /supabase\.auth\.getUser\(jwt\)/);
  }
});

test('queue workers require a private worker secret after the gateway', () => {
  assert.match(processReceiptQueue, /Deno\.env\.get\('RECEIPT_WORKER_SECRET'\)/);
  assert.match(processReceiptQueue, /req\.headers\.get\('x-worker-secret'\)/);
  assert.match(processTellQueue, /Deno\.env\.get\('TELL_WORKER_SECRET'\)/);
  assert.match(processTellQueue, /req\.headers\.get\('x-worker-secret'\)/);
});
