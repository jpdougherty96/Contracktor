import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { createClient } from '@supabase/supabase-js';

const clientEnvPath = resolve('.staging-secrets/client.config');
const testUsersPath = resolve('.staging-secrets/test-users.env');
const productionEnvPath = resolve('.env');

if (!existsSync(clientEnvPath) || !existsSync(testUsersPath)) {
  fail('Missing staging client or test-user environment files.');
}

const clientEnvironment = readEnvironmentFile(clientEnvPath);
const testEnvironment = readEnvironmentFile(testUsersPath);
const productionEnvironment = existsSync(productionEnvPath)
  ? readEnvironmentFile(productionEnvPath)
  : {};
const stagingUrl = clientEnvironment.EXPO_PUBLIC_SUPABASE_URL;
const stagingKey = clientEnvironment.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!stagingUrl || !stagingKey || productionEnvironment.EXPO_PUBLIC_SUPABASE_URL === stagingUrl) {
  fail('Staging safety verification failed.');
}

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
const proFeatureKeys = [
  'activity.feed',
  'core.shopping',
  'receipt.smart_allocation',
  'tell.basic',
];

await verifyFree();
await verifyPro();

console.log('Staging Free/Pro entitlement and enforcement checks passed.');

async function verifyFree() {
  const { client, session, user } = await signIn(
    testEnvironment.TEST_FREE_EMAIL,
    testEnvironment.TEST_FREE_PASSWORD
  );
  const entitlements = await fetchEntitlements(client);
  const enabledFeatures = Object.entries(entitlements.features)
    .filter(([, feature]) => feature?.enabled === true)
    .map(([featureKey]) => featureKey)
    .sort();

  assert.equal(entitlements.plan.key, 'free');
  assert.deepEqual(enabledFeatures, freeBaseline);

  const { data: job, error: jobError } = await client
    .from('jobs')
    .insert({
      client_name: 'Staging Verification',
      name: 'Free Core Verification',
      owner_id: user.id,
    })
    .select('id')
    .single();

  assert.equal(jobError, null, `Free core job creation failed: ${jobError?.message}`);

  const { error: shoppingError } = await client.from('shopping_needs').insert({
    business_id: testEnvironment.TEST_FREE_BUSINESS_ID,
    description: 'Free entitlement boundary check',
    owner_id: user.id,
  });

  assert.ok(shoppingError, 'Free unexpectedly created a Pro shopping need.');

  const tellResponse = await fetch(`${stagingUrl}/functions/v1/tell-contracktor`, {
    body: JSON.stringify({
      local_date: new Date().toISOString().slice(0, 10),
      text: 'Staging entitlement check',
    }),
    headers: {
      apikey: stagingKey,
      Authorization: `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
    },
    method: 'POST',
  });

  assert.equal(tellResponse.status, 403, 'Free Tell conTRACKtor did not fail closed.');
  await client.from('jobs').delete().eq('id', job.id);
  await client.auth.signOut();
  console.log('FREE: core job write allowed; Shopping and Tell rejected.');
}

async function verifyPro() {
  const { client, user } = await signIn(
    testEnvironment.TEST_PRO_EMAIL,
    testEnvironment.TEST_PRO_PASSWORD
  );
  const entitlements = await fetchEntitlements(client);

  assert.equal(entitlements.plan.key, 'pro');

  for (const featureKey of proFeatureKeys) {
    assert.equal(entitlements.features[featureKey]?.enabled, true, `${featureKey} is not enabled.`);
  }

  const { data: need, error: shoppingError } = await client
    .from('shopping_needs')
    .insert({
      business_id: testEnvironment.TEST_PRO_BUSINESS_ID,
      description: 'Pro entitlement boundary check',
      owner_id: user.id,
    })
    .select('id')
    .single();

  assert.equal(shoppingError, null, `Pro shopping write failed: ${shoppingError?.message}`);
  await client.from('shopping_needs').delete().eq('id', need.id);
  await client.auth.signOut();
  console.log('PRO: Activity, Shopping, smart allocation, and Tell are enabled.');
}

async function signIn(email, password) {
  assert.ok(email && password, 'A staging test credential is missing.');

  const client = createClient(stagingUrl, stagingKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
  const { data, error } = await client.auth.signInWithPassword({ email, password });

  assert.equal(error, null, `Staging sign-in failed for ${email}: ${error?.message}`);
  assert.ok(data.session && data.user, `Staging sign-in returned no session for ${email}.`);
  return { client, session: data.session, user: data.user };
}

async function fetchEntitlements(client) {
  const { data, error } = await client.rpc('get_my_entitlements', {});

  assert.equal(error, null, `Entitlement lookup failed: ${error?.message}`);
  assert.ok(data && typeof data === 'object', 'Entitlement lookup returned no snapshot.');
  return data;
}

function readEnvironmentFile(path) {
  const environment = {};

  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const trimmedLine = line.trim();

    if (!trimmedLine || trimmedLine.startsWith('#')) {
      continue;
    }

    const separatorIndex = trimmedLine.indexOf('=');

    if (separatorIndex <= 0) {
      continue;
    }

    const key = trimmedLine.slice(0, separatorIndex).trim();
    const rawValue = trimmedLine.slice(separatorIndex + 1).trim();
    environment[key] = rawValue.replace(/^(['"])(.*)\1$/, '$2');
  }

  return environment;
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
