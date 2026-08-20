import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const repoRoot = fileURLToPath(new URL('../', import.meta.url));
const freeBaseline = [
  'core.expenses',
  'core.hours',
  'core.invoices_reports',
  'core.job_financials',
  'core.jobs',
  'core.notes_photos',
  'core.payments',
  'core.receipt_extraction',
  'core.receipts',
  'core.time_clock',
].sort();
const proFeatures = [
  'activity.feed',
  'core.shopping',
  'receipt.smart_allocation',
  'tell.basic',
];

test('client fallback exactly preserves the production Free baseline', async () => {
  const source = await readRepoFile('src/contexts/EntitlementsContext.tsx');
  const featureBlock = source.match(/const freeBaselineFeatures[^=]*= new Set[^[]*\[([\s\S]*?)\]\);/);

  assert.ok(featureBlock, 'Unable to locate the client Free baseline feature set.');
  assert.deepEqual(readQuotedFeatureKeys(featureBlock[1]).sort(), freeBaseline);

  for (const feature of proFeatures) {
    assert.equal(featureBlock[1].includes(`'${feature}'`), false, `${feature} leaked into Free.`);
  }
});

test('database Free plan matches the client fallback', async () => {
  const migration = await readRepoFile(
    'supabase/migrations/20260608107000_pro_tier_boundary.sql'
  );
  const freePlanBlock = migration.match(
    /p\.plan_key = 'free'[\s\S]*?f\.feature_key in \(([\s\S]*?)\n  \);/
  );

  assert.ok(freePlanBlock, 'Unable to locate the Free plan allowlist in the migration.');
  assert.deepEqual(readQuotedFeatureKeys(freePlanBlock[1]).sort(), freeBaseline);
});

test('Pro entry points and paid operations have entitlement boundaries', async () => {
  const [homeRoute, migration, tellFunction] = await Promise.all([
    readRepoFile('app/(tabs)/index.tsx'),
    readRepoFile('supabase/migrations/20260608107000_pro_tier_boundary.sql'),
    readRepoFile('supabase/functions/tell-contracktor/index.ts'),
  ]);

  for (const feature of [
    'activity.feed',
    'core.shopping',
    'receipt.smart_allocation',
    'tell.basic',
  ]) {
    assert.match(homeRoute, new RegExp(`hasFeature\\('${escapeRegex(feature)}'\\)`));
  }

  assert.match(migration, /business_has_feature\(business_id, 'core\.shopping'\)/);
  assert.match(
    migration,
    /business_has_feature\(business_id, 'receipt\.smart_allocation'\)/
  );
  assert.match(migration, /business_has_feature\(business_id, 'activity\.feed'\)/);
  assert.match(migration, /business_has_feature\(business_id, 'tell\.basic'\)/);
  assert.match(tellFunction, /rpc\(\s*'get_my_entitlements'/);
  assert.match(tellFunction, /snapshotHasFeature\(entitlementSnapshot, 'tell\.basic'\)/);
  assert.match(tellFunction, /Tell conTRACKtor requires conTRACKtor Pro/);
  assert.match(tellFunction, /}, 403\);/);
});

async function readRepoFile(relativePath) {
  return readFile(new URL(relativePath, `file://${repoRoot}/`), 'utf8');
}

function readQuotedFeatureKeys(value) {
  return [...value.matchAll(/'([a-z][a-z0-9_.]*)'/g)].map((match) => match[1]);
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
