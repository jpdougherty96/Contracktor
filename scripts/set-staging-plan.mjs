import { createClient } from '@supabase/supabase-js';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const argumentsByName = readArguments(process.argv.slice(2));
const businessId = argumentsByName.get('business');
const planKey = argumentsByName.get('plan');
const localAdminEnvironment = readLocalEnvironment('.staging-secrets/admin.env');
const productionEnvironment = readLocalEnvironment('.env');
const supabaseUrl =
  process.env.STAGING_SUPABASE_URL ?? localAdminEnvironment.STAGING_SUPABASE_URL;
const serviceRoleKey =
  process.env.STAGING_SUPABASE_SERVICE_ROLE_KEY ??
  localAdminEnvironment.STAGING_SUPABASE_SERVICE_ROLE_KEY;
const confirmation =
  process.env.CONTRACKTOR_PLAN_CHANGE_CONFIRM ??
  localAdminEnvironment.CONTRACKTOR_PLAN_CHANGE_CONFIRM;
const projectRef =
  process.env.STAGING_PROJECT_REF ?? localAdminEnvironment.STAGING_PROJECT_REF;

if (!businessId || !isUuid(businessId)) {
  fail('Pass a valid business UUID with --business BUSINESS_UUID.');
}

if (planKey !== 'free' && planKey !== 'pro') {
  fail('Pass either --plan free or --plan pro.');
}

if (!supabaseUrl || !serviceRoleKey) {
  fail(
    'STAGING_SUPABASE_URL and STAGING_SUPABASE_SERVICE_ROLE_KEY are required. ' +
      'Do not use EXPO_PUBLIC_ variables for administrative credentials.'
  );
}

if (confirmation !== 'staging') {
  fail('Set CONTRACKTOR_PLAN_CHANGE_CONFIRM=staging to confirm this is a staging change.');
}

if (!projectRef || !supabaseUrl.includes(projectRef)) {
  fail('The staging project reference does not match the staging URL.');
}

if (productionEnvironment.EXPO_PUBLIC_SUPABASE_URL === supabaseUrl) {
  fail('The staging Supabase URL matches production. Refusing to change the plan.');
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

const { data: plan, error: planError } = await supabase
  .from('subscription_plans')
  .select('id, plan_key, name')
  .eq('plan_key', planKey)
  .eq('is_active', true)
  .maybeSingle();

if (planError) {
  fail(`Unable to read staging plans: ${planError.message}`);
}

if (!plan) {
  fail(`The ${planKey} plan does not exist in staging. Apply the entitlement migrations first.`);
}

const { data: subscription, error: updateError } = await supabase
  .from('business_subscriptions')
  .update({ plan_id: plan.id, status: 'active' })
  .eq('business_id', businessId)
  .select('business_id')
  .maybeSingle();

if (updateError) {
  fail(`Unable to change the staging subscription: ${updateError.message}`);
}

if (!subscription) {
  fail(
    'No staging subscription was found for that business. Verify the business UUID and run the entitlement seed migration.'
  );
}

console.log(`Staging business ${businessId} now uses ${plan.name} (${plan.plan_key}).`);

function readArguments(values) {
  const result = new Map();

  for (let index = 0; index < values.length; index += 2) {
    const key = values[index];
    const value = values[index + 1];

    if (!key?.startsWith('--') || !value || value.startsWith('--')) {
      fail('Arguments must use --business BUSINESS_UUID --plan free|pro.');
    }

    result.set(key.slice(2), value);
  }

  return result;
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}

function readLocalEnvironment(relativePath) {
  const path = resolve(relativePath);

  if (!existsSync(path)) {
    return {};
  }

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
