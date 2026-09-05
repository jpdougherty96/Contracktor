import assert from 'node:assert/strict';
import test from 'node:test';

import { createClient } from '@supabase/supabase-js';

const testUrl = process.env.SUPABASE_TEST_URL;
const testAnonKey = process.env.SUPABASE_TEST_ANON_KEY;
const testServiceRoleKey = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;
const canRun = Boolean(
  testUrl && testAnonKey && testServiceRoleKey && process.env.SUPABASE_TEST_ALLOW_MUTATION === 'true'
);

test(
  'Tell review keeps grouped proposals durable through partial approval and dismissal',
  { skip: canRun ? false : 'Set dedicated SUPABASE_TEST_* credentials and allow mutation.' },
  async (t) => {
    const admin = createClient(testUrl, testServiceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const password = `Tell-Test-${suffix}!`;
    const users = [];

    t.after(async () => {
      for (const userId of users.reverse()) await admin.auth.admin.deleteUser(userId);
    });

    const owner = await createAccount(admin, `tell-owner-${suffix}@example.test`, password);
    const outsider = await createAccount(admin, `tell-outsider-${suffix}@example.test`, password);
    users.push(owner.userId, outsider.userId);
    const ownerClient = await signIn(owner.email, password);
    const outsiderClient = await signIn(outsider.email, password);
    await required(ownerClient.from('profiles').insert({ id: owner.userId }).select('id'));
    await required(outsiderClient.from('profiles').insert({ id: outsider.userId }).select('id'));

    const businesses = await required(
      ownerClient.from('businesses').select('id').eq('owner_id', owner.userId).limit(1)
    );
    const businessId = businesses[0].id;
    const jobs = await required(
      ownerClient
        .from('jobs')
        .insert({ business_id: businessId, name: `Miller Deck ${suffix}`, owner_id: owner.userId })
        .select('id')
    );
    const jobId = jobs[0].id;
    const queuedEntries = await required(
      ownerClient
        .from('tell_contracktor_entries')
        .insert({
          business_id: businessId,
          extraction: {},
          job_id: jobId,
          owner_id: owner.userId,
          raw_text: 'Queue this Tell source first.',
          status: 'uploading',
        })
        .select('id')
    );
    const queuedEntryId = queuedEntries[0].id;
    const finalized = await rpc(ownerClient, 'finalize_tell_submission', {
      p_entry_id: queuedEntryId,
    });
    assert.equal(finalized.status, 'queued');
    const claimed = await rpc(admin, 'claim_tell_processing_jobs', {
      p_limit: 1,
      p_visibility_timeout: 30,
    });
    assert.equal(claimed[0].entry_id, queuedEntryId);
    await rpc(admin, 'delete_tell_processing_job', { p_msg_id: claimed[0].msg_id });

    // The production Edge worker uses a service-role PostgREST client. RLS
    // bypass alone is insufficient when the role lacks table-level grants.
    const workerEntries = await required(
      admin
        .from('tell_contracktor_entries')
        .update({ last_processing_error: null })
        .eq('id', queuedEntryId)
        .select('id, status')
    );
    assert.equal(workerEntries[0].id, queuedEntryId);
    const workerJobs = await required(
      admin.from('jobs').select('id').eq('id', jobId)
    );
    assert.equal(workerJobs[0].id, jobId);
    const workerActivity = await required(
      admin
        .from('activity_events')
        .upsert(
          {
            actor_user_id: owner.userId,
            business_id: businessId,
            created_by_user_id: owner.userId,
            event_type: 'tell_worker_permission_test',
            job_id: jobId,
            owner_id: owner.userId,
            source_id: queuedEntryId,
            source_table: 'tell_contracktor_entries',
            status: 'completed',
            title: 'Tell worker permission test',
          },
          { onConflict: 'business_id,event_type,source_table,source_id' }
        )
        .select('id')
    );
    assert.equal(workerActivity.length, 1);

    const entries = await required(
      ownerClient
        .from('tell_contracktor_entries')
        .insert({
          business_id: businessId,
          extraction: { cleaned_note: 'Customer added stairs.', hours: [], matched_job_id: jobId, payments: [], scope_or_budget_impact: true, shopping_needs: [], summary: 'Miller update' },
          job_id: jobId,
          owner_id: owner.userId,
          raw_text: 'Worked 7 hours. Need four deck boards. Customer added stairs.',
          status: 'ready_review',
        })
        .select('id')
    );
    const entryId = entries[0].id;
    const sourceStoragePath = `${owner.userId}/tell/${entryId}/1.jpg`;
    await required(
      admin
        .from('tell_contracktor_attachments')
        .insert({
          business_id: businessId,
          entry_id: entryId,
          file_type: 'image/jpeg',
          original_filename: 'tell-photo-1.jpg',
          owner_id: owner.userId,
          storage_path: sourceStoragePath,
        })
        .select('id')
    );
    const proposals = [
      { entry_id: entryId, proposal_id: 'hours-1', business_id: businessId, owner_id: owner.userId, proposal_type: 'hours', payload: { id: 'hours-1', type: 'hours', job_id: jobId, hours: 7, date: '2026-08-27', note: null, worker_name: null } },
      { entry_id: entryId, proposal_id: 'shopping-1', business_id: businessId, owner_id: owner.userId, proposal_type: 'shopping', payload: { id: 'shopping-1', type: 'shopping', job_id: jobId, description: '12-foot deck boards', normalized_name: 'deck board', quantity: 4, unit: null } },
      { entry_id: entryId, proposal_id: 'note-1', business_id: businessId, owner_id: owner.userId, proposal_type: 'note', payload: { id: 'note-1', type: 'note', classification: 'scope_change', job_id: jobId, note: 'Customer added stairs.' } },
    ];
    await required(admin.from('tell_contracktor_proposals').insert(proposals).select('proposal_id'));
    await required(
      admin
        .from('attention_items')
        .insert({ business_id: businessId, owner_id: owner.userId, job_id: jobId, item_type: 'tell_submission', source_table: 'tell_contracktor_entries', source_id: entryId, title: 'Miller Deck update', detail: '3 suggestions are ready to review.' })
        .select('id')
    );

    const outsiderRows = await required(
      outsiderClient.from('tell_contracktor_proposals').select('proposal_id').eq('entry_id', entryId)
    );
    assert.equal(outsiderRows.length, 0);

    const firstResult = await rpc(ownerClient, 'review_tell_contracktor_proposals', {
      p_entry_id: entryId,
      p_proposals: [proposals[0].payload],
    });
    assert.equal(firstResult.records.length, 1);
    let state = await fetchState(ownerClient, entryId);
    assert.equal(state.entry.status, 'ready_review');
    assert.equal(state.proposals.filter((proposal) => proposal.status === 'pending').length, 2);
    assert.equal(state.attention.status, 'open');
    assert.match(state.attention.detail, /2 suggestions remain/);

    await rpc(ownerClient, 'dismiss_tell_contracktor_proposal', {
      p_entry_id: entryId,
      p_proposal_id: 'shopping-1',
    });
    state = await fetchState(ownerClient, entryId);
    assert.equal(state.proposals.filter((proposal) => proposal.status === 'pending').length, 1);

    await rpc(ownerClient, 'review_tell_contracktor_proposals', {
      p_entry_id: entryId,
      p_proposals: [proposals[2].payload],
    });
    state = await fetchState(ownerClient, entryId);
    assert.equal(state.entry.status, 'approved');
    assert.equal(state.attention.status, 'resolved');
    assert.equal(state.proposals.filter((proposal) => proposal.status === 'approved').length, 2);
    assert.equal(state.proposals.filter((proposal) => proposal.status === 'dismissed').length, 1);

    const attentionRows = await required(
      ownerClient
        .from('attention_items')
        .select('id')
        .eq('source_table', 'tell_contracktor_entries')
        .eq('source_id', entryId)
    );
    assert.equal(attentionRows.length, 1);

    const noteAttachments = await required(
      ownerClient.from('attachments').select('storage_path').eq('storage_path', sourceStoragePath)
    );
    assert.equal(noteAttachments.length, 1);

    const undoResult = await rpc(ownerClient, 'undo_tell_contracktor_entry', {
      p_entry_id: entryId,
    });
    assert.deepEqual(undoResult.attachment_storage_paths, []);
    const preservedSources = await required(
      ownerClient
        .from('tell_contracktor_attachments')
        .select('storage_path')
        .eq('entry_id', entryId)
    );
    assert.equal(preservedSources.length, 1);
    assert.equal(preservedSources[0].storage_path, sourceStoragePath);

    const undoActivity = await required(
      admin
        .from('activity_events')
        .select('job_id')
        .eq('event_type', 'tell_contracktor_undone')
        .eq('source_table', 'tell_contracktor_entries')
        .eq('source_id', entryId)
    );
    assert.equal(undoActivity.length, 1);
    assert.equal(undoActivity[0].job_id, jobId);
  }
);

async function createAccount(admin, email, password) {
  const { data, error } = await admin.auth.admin.createUser({ email, email_confirm: true, password });
  if (error) throw error;
  return { email, userId: data.user.id };
}

async function signIn(email, password) {
  const client = createClient(testUrl, testAnonKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return client;
}

async function fetchState(client, entryId) {
  const [entries, proposals, attention] = await Promise.all([
    required(client.from('tell_contracktor_entries').select('status').eq('id', entryId)),
    required(client.from('tell_contracktor_proposals').select('proposal_id, status').eq('entry_id', entryId)),
    required(client.from('attention_items').select('status, detail').eq('source_id', entryId)),
  ]);
  return { attention: attention[0], entry: entries[0], proposals };
}

async function rpc(client, name, args) {
  const { data, error } = await client.rpc(name, args);
  if (error) throw error;
  return data;
}

async function required(query) {
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}
