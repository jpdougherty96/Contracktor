import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const repoRoot = fileURLToPath(new URL('../', import.meta.url));
const freeBaseline = [
  'activity.feed',
  'core.expenses',
  'core.hours',
  'core.invoices_reports',
  'core.job_financials',
  'core.jobs',
  'core.notes_photos',
  'core.payments',
  'core.receipt_extraction',
  'core.receipts',
  'core.shopping',
  'core.time_clock',
  'tell.basic',
].sort();
const proFeatures = [
  'activity.business_feed',
  'job.proactive_insights',
  'receipt.smart_allocation',
  'snapshot.ai_insights',
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
    'supabase/migrations/20260820091000_truth_intelligence_tier_boundary.sql'
  );
  const freePlanBlock = migration.match(
    /p\.plan_key = 'free'[\s\S]*?f\.feature_key in \(([\s\S]*?)\n  \);/
  );

  assert.ok(freePlanBlock, 'Unable to locate the Free plan allowlist in the migration.');
  assert.deepEqual(readQuotedFeatureKeys(freePlanBlock[1]).sort(), freeBaseline);
});

test('truth features are Free while intelligence remains independently gated', async () => {
  const [homeRoute, migration, policyMigration, tellFunction] = await Promise.all([
    readRepoFile('app/(tabs)/index.tsx'),
    readRepoFile('supabase/migrations/20260820091000_truth_intelligence_tier_boundary.sql'),
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

  assert.match(policyMigration, /business_has_feature\(business_id, 'core\.shopping'\)/);
  assert.match(
    policyMigration,
    /business_has_feature\(business_id, 'receipt\.smart_allocation'\)/
  );
  assert.match(migration, /'activity\.feed'/);
  assert.match(migration, /'tell\.basic'/);
  assert.match(migration, /monthly_price_cents = 1900/);
  assert.match(migration, /annual_price_cents = 19000/);
  assert.match(tellFunction, /rpc\(\s*'get_my_entitlements'/);
  assert.match(tellFunction, /snapshotHasFeature\(entitlementSnapshot, 'tell\.basic'\)/);
  assert.doesNotMatch(tellFunction, /requires conTRACKtor Pro/);
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
