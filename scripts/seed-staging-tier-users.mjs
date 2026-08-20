import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { createClient } from '@supabase/supabase-js';

const adminEnvPath = resolve('.staging-secrets/admin.env');
const clientEnvPath = resolve('.staging-secrets/client.config');
const credentialsPath = resolve('.staging-secrets/test-users.env');
const productionEnvPath = resolve('.env');

if (!existsSync(adminEnvPath) || !existsSync(clientEnvPath)) {
  fail('Missing staging environment files. Configure the staging Supabase project first.');
}

const adminEnvironment = readEnvironmentFile(adminEnvPath);
const clientEnvironment = readEnvironmentFile(clientEnvPath);
const productionEnvironment = existsSync(productionEnvPath)
  ? readEnvironmentFile(productionEnvPath)
  : {};
const stagingUrl = adminEnvironment.STAGING_SUPABASE_URL;
const serviceRoleKey = adminEnvironment.STAGING_SUPABASE_SERVICE_ROLE_KEY;
const projectRef = adminEnvironment.STAGING_PROJECT_REF;

if (!stagingUrl || !serviceRoleKey || !projectRef) {
  fail('The staging admin environment is incomplete.');
}

if (
  adminEnvironment.CONTRACKTOR_PLAN_CHANGE_CONFIRM !== 'staging' ||
  !stagingUrl.includes(projectRef) ||
  clientEnvironment.EXPO_PUBLIC_SUPABASE_URL !== stagingUrl
) {
  fail('The staging safety checks did not match. Refusing to create users.');
}

if (productionEnvironment.EXPO_PUBLIC_SUPABASE_URL === stagingUrl) {
  fail('The staging URL matches production. Refusing to create users.');
}

const supabase = createClient(stagingUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});
const testUsers = [
  {
    companyName: 'conTRACKtor Free Test',
    email: 'free-test@contracktor.app',
    fullName: 'Free Test User',
    planKey: 'free',
    prefix: 'TEST_FREE',
  },
  {
    companyName: 'conTRACKtor Pro Test',
    email: 'pro-test@contracktor.app',
    fullName: 'Pro Test User',
    planKey: 'pro',
    prefix: 'TEST_PRO',
  },
];
const seededUsers = [];

for (const definition of testUsers) {
  const password = createTestPassword();
  const user = await ensureAuthUser(definition, password);
  const businessId = await ensureProfileAndBusiness(user.id, definition);

  await assignPlan(businessId, definition.planKey);
  seededUsers.push({ ...definition, businessId, password, userId: user.id });
}

const credentials = [
  '# Generated staging-only credentials. This file is ignored by git.',
  `STAGING_PROJECT_REF=${projectRef}`,
  ...seededUsers.flatMap((user) => [
    `${user.prefix}_EMAIL=${user.email}`,
    `${user.prefix}_PASSWORD=${user.password}`,
    `${user.prefix}_USER_ID=${user.userId}`,
    `${user.prefix}_BUSINESS_ID=${user.businessId}`,
  ]),
  '',
].join('\n');

writeFileSync(credentialsPath, credentials, { mode: 0o600 });

for (const user of seededUsers) {
  console.log(`${user.planKey.toUpperCase()}: ${user.email} (business ${user.businessId})`);
}

console.log('Passwords were written only to .staging-secrets/test-users.env.');

async function ensureAuthUser(definition, password) {
  const { data: usersPage, error: listError } = await supabase.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });

  if (listError) {
    fail(`Unable to list staging users: ${listError.message}`);
  }

  const existingUser = usersPage.users.find(
    (user) => user.email?.toLowerCase() === definition.email.toLowerCase()
  );

  if (existingUser) {
    const { data, error } = await supabase.auth.admin.updateUserById(existingUser.id, {
      email_confirm: true,
      password,
      user_metadata: {
        company_name: definition.companyName,
        full_name: definition.fullName,
      },
    });

    if (error) {
      fail(`Unable to refresh ${definition.email}: ${error.message}`);
    }

    return data.user;
  }

  const { data, error } = await supabase.auth.admin.createUser({
    email: definition.email,
    email_confirm: true,
    password,
    user_metadata: {
      company_name: definition.companyName,
      full_name: definition.fullName,
    },
  });

  if (error) {
    fail(`Unable to create ${definition.email}: ${error.message}`);
  }

  return data.user;
}

async function ensureProfileAndBusiness(userId, definition) {
  const { error: profileError } = await supabase.from('profiles').upsert({
    company_name: definition.companyName,
    full_name: definition.fullName,
    id: userId,
  });

  if (profileError) {
    fail(`Unable to create the ${definition.planKey} profile: ${profileError.message}`);
  }

  const { data: business, error: businessError } = await supabase
    .from('businesses')
    .select('id')
    .eq('owner_id', userId)
    .order('created_at', { ascending: true })
    .limit(1)
    .single();

  if (businessError) {
    fail(`Unable to find the ${definition.planKey} business: ${businessError.message}`);
  }

  return business.id;
}

async function assignPlan(businessId, planKey) {
  const { data: plan, error: planError } = await supabase
    .from('subscription_plans')
    .select('id')
    .eq('plan_key', planKey)
    .single();

  if (planError) {
    fail(`Unable to find the ${planKey} plan: ${planError.message}`);
  }

  const { error: subscriptionError } = await supabase.from('business_subscriptions').upsert({
    business_id: businessId,
    plan_id: plan.id,
    status: 'active',
  });

  if (subscriptionError) {
    fail(`Unable to assign the ${planKey} plan: ${subscriptionError.message}`);
  }
}

function createTestPassword() {
  return `Ct-${randomBytes(18).toString('base64url')}!9`;
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
