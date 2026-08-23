import assert from 'node:assert/strict';
import test from 'node:test';

import { createClient } from '@supabase/supabase-js';

const testUrl = process.env.SUPABASE_TEST_URL;
const testAnonKey = process.env.SUPABASE_TEST_ANON_KEY;
const testServiceRoleKey = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;
const mutationAllowed = process.env.SUPABASE_TEST_ALLOW_MUTATION === 'true';
const canRun = Boolean(testUrl && testAnonKey && testServiceRoleKey && mutationAllowed);

test(
  'job task capabilities preserve manager permissions, idempotency, and history',
  {
    skip: canRun
      ? false
      : 'Set dedicated SUPABASE_TEST_* credentials and SUPABASE_TEST_ALLOW_MUTATION=true.',
  },
  async (t) => {
    const adminClient = createClient(testUrl, testServiceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const password = `Job-Task-Test-${suffix}!`;
    const users = [];

    t.after(async () => {
      for (const userId of users.reverse()) {
        await adminClient.auth.admin.deleteUser(userId);
      }
    });

    const owner = await createTestAccount(
      adminClient,
      `task-owner-${suffix}@example.test`,
      password
    );
    users.push(owner.userId);
    const manager = await createTestAccount(
      adminClient,
      `task-manager-${suffix}@example.test`,
      password
    );
    users.push(manager.userId);
    const outsider = await createTestAccount(
      adminClient,
      `task-outsider-${suffix}@example.test`,
      password
    );
    users.push(outsider.userId);

    const ownerClient = await signIn(testUrl, testAnonKey, owner.email, password);
    const managerClient = await signIn(testUrl, testAnonKey, manager.email, password);
    const outsiderClient = await signIn(testUrl, testAnonKey, outsider.email, password);
    await Promise.all([
      createProfile(ownerClient, owner.userId),
      createProfile(managerClient, manager.userId),
      createProfile(outsiderClient, outsider.userId),
    ]);

    const businessId = await fetchBusiness(ownerClient, owner.userId);
    await requiredQuery(
      ownerClient
        .from('business_members')
        .insert({ business_id: businessId, role: 'admin', status: 'active', user_id: manager.userId })
        .select('id')
    );
    const jobId = await createJob(ownerClient, owner.userId, businessId, `Task Test ${suffix}`);

    const createKey = `create-${suffix}`;
    const task = await requiredRpc(ownerClient, 'create_job_task', {
      p_idempotency_key: createKey,
      p_job_id: jobId,
      p_title: 'Move outlet to south wall',
    });
    const retriedTask = await requiredRpc(ownerClient, 'create_job_task', {
      p_idempotency_key: createKey,
      p_job_id: jobId,
      p_title: 'Move outlet to south wall',
    });

    assert.equal(retriedTask.id, task.id);
    assert.equal(task.business_id, businessId);
    assert.equal(task.job_id, jobId);
    assert.equal(task.owner_id, owner.userId);
    assert.equal(task.created_by_user_id, owner.userId);
    assert.equal(task.status, 'open');

    const managerVisibleTasks = await requiredQuery(
      managerClient.from('job_tasks').select('*').eq('job_id', jobId)
    );
    assert.equal(managerVisibleTasks.length, 1);

    const directWrite = await managerClient
      .from('job_tasks')
      .update({ title: 'Bypass RPC' })
      .eq('id', task.id);
    assert.ok(directWrite.error);

    const completeKey = `complete-${suffix}`;
    const completed = await requiredRpc(managerClient, 'change_job_task', {
      p_action: 'complete',
      p_expected_updated_at: task.updated_at,
      p_idempotency_key: completeKey,
      p_task_id: task.id,
      p_title: task.title,
    });
    const retriedCompletion = await requiredRpc(managerClient, 'change_job_task', {
      p_action: 'complete',
      p_expected_updated_at: task.updated_at,
      p_idempotency_key: completeKey,
      p_task_id: task.id,
      p_title: task.title,
    });

    assert.equal(retriedCompletion.id, completed.id);
    assert.equal(completed.status, 'completed');
    assert.equal(completed.completed_by_user_id, manager.userId);
    assert.ok(completed.completed_at);

    const staleCompletion = await ownerClient.rpc('change_job_task', {
      p_action: 'complete',
      p_expected_updated_at: task.updated_at,
      p_idempotency_key: `stale-${suffix}`,
      p_task_id: task.id,
      p_title: task.title,
    });
    assert.ok(staleCompletion.error);
    assert.match(staleCompletion.error.message, /changed after you opened it/i);

    const reopened = await requiredRpc(ownerClient, 'change_job_task', {
      p_action: 'reopen',
      p_expected_updated_at: completed.updated_at,
      p_idempotency_key: `reopen-${suffix}`,
      p_task_id: task.id,
      p_title: task.title,
    });
    assert.equal(reopened.status, 'open');
    assert.equal(reopened.completed_at, null);
    assert.equal(reopened.completed_by_user_id, null);

    const events = await requiredQuery(
      ownerClient
        .from('job_task_events')
        .select('actor_user_id, event_type, title_snapshot')
        .eq('task_id', task.id)
        .order('occurred_at')
    );
    assert.deepEqual(
      events.map((event) => event.event_type),
      ['task_created', 'task_completed', 'task_reopened']
    );
    assert.equal(events[1].actor_user_id, manager.userId);
    assert.equal(events[1].title_snapshot, task.title);

    const completionActivity = await requiredQuery(
      ownerClient
        .from('activity_events')
        .select('actor_user_id, event_type, source_table')
        .eq('job_id', jobId)
        .eq('event_type', 'task_completed')
    );
    assert.equal(completionActivity.length, 1);
    assert.equal(completionActivity[0].actor_user_id, manager.userId);
    assert.equal(completionActivity[0].source_table, 'job_task_events');

    const outsiderVisibleTasks = await requiredQuery(
      outsiderClient.from('job_tasks').select('id').eq('job_id', jobId)
    );
    assert.equal(outsiderVisibleTasks.length, 0);

    const outsiderMutation = await outsiderClient.rpc('change_job_task', {
      p_action: 'complete',
      p_expected_updated_at: reopened.updated_at,
      p_idempotency_key: `unauthorized-${suffix}`,
      p_task_id: task.id,
      p_title: task.title,
    });
    assert.ok(outsiderMutation.error);
    assert.match(outsiderMutation.error.message, /owner or admin/i);
  }
);

async function createTestAccount(adminClient, email, password) {
  const { data, error } = await adminClient.auth.admin.createUser({
    email,
    email_confirm: true,
    password,
  });
  if (error) throw error;
  return { email, userId: data.user.id };
}

async function signIn(url, anonKey, email, password) {
  const client = createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return client;
}

async function createProfile(client, userId) {
  await requiredQuery(client.from('profiles').insert({ id: userId }).select('id'));
}

async function fetchBusiness(client, ownerId) {
  const rows = await requiredQuery(
    client.from('businesses').select('id').eq('owner_id', ownerId).limit(1)
  );
  assert.equal(rows.length, 1, 'test user provisioning must create one business');
  return rows[0].id;
}

async function createJob(client, ownerId, businessId, name) {
  const rows = await requiredQuery(
    client
      .from('jobs')
      .insert({ business_id: businessId, name, owner_id: ownerId })
      .select('id')
  );
  return rows[0].id;
}

async function requiredRpc(client, name, args) {
  const { data, error } = await client.rpc(name, args);
  if (error) throw error;
  return data;
}

async function requiredQuery(query) {
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}
