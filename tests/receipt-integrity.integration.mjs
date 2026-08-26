import assert from 'node:assert/strict';
import test from 'node:test';

import { createClient } from '@supabase/supabase-js';

const testUrl = process.env.SUPABASE_TEST_URL;
const testAnonKey = process.env.SUPABASE_TEST_ANON_KEY;
const testServiceRoleKey = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;
const mutationAllowed = process.env.SUPABASE_TEST_ALLOW_MUTATION === 'true';
const canRun = Boolean(testUrl && testAnonKey && testServiceRoleKey && mutationAllowed);

test(
  'receipt financial commits execute atomically against Supabase',
  { skip: canRun ? false : 'Set dedicated SUPABASE_TEST_* credentials and SUPABASE_TEST_ALLOW_MUTATION=true.' },
  async (t) => {
    const admin = createClient(testUrl, testServiceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const password = `Receipt-Test-${suffix}!`;
    const users = [];

    t.after(async () => {
      for (const userId of users.reverse()) {
        await admin.auth.admin.deleteUser(userId);
      }
    });

    const accountA = await createTestAccount(admin, `receipt-a-${suffix}@example.test`, password);
    users.push(accountA.userId);
    const accountB = await createTestAccount(admin, `receipt-b-${suffix}@example.test`, password);
    users.push(accountB.userId);

    const clientA = await signIn(testUrl, testAnonKey, accountA.email, password);
    const clientB = await signIn(testUrl, testAnonKey, accountB.email, password);
    await Promise.all([
      createProfile(clientA, accountA.userId),
      createProfile(clientB, accountB.userId),
    ]);
    const businessA = await fetchBusiness(clientA, accountA.userId);
    const businessB = await fetchBusiness(clientB, accountB.userId);
    const [jobA1, jobA2, jobB] = await Promise.all([
      createJob(clientA, accountA.userId, businessA, `Receipt Test A1 ${suffix}`),
      createJob(clientA, accountA.userId, businessA, `Receipt Test A2 ${suffix}`),
      createJob(clientB, accountB.userId, businessB, `Receipt Test B ${suffix}`),
    ]);

    await t.test('timer switching is confirmed by one atomic database capability', async () => {
      const compatibilityRows = await requiredQuery(
        clientA
          .from('jobs')
          .update({ time_clock_enabled: false })
          .eq('id', jobA2)
          .select('id, time_clock_enabled')
      );
      assert.equal(compatibilityRows[0].time_clock_enabled, true);

      const startedAt = new Date(Date.now() - 10 * 60 * 1000).toISOString();
      const activeRows = await requiredQuery(
        clientA
          .from('time_entries')
          .insert({
            business_id: businessA,
            hourly_rate: 80,
            job_id: jobA1,
            owner_id: accountA.userId,
            source: 'timer',
            started_at: startedAt,
            status: 'active',
            worker_name: 'Timer Tester',
          })
          .select('id')
      );
      const originalTimerId = activeRows[0].id;

      const newTimer = await requiredRpc(clientA, 'start_job_timer_atomic', {
        p_hourly_rate: 90,
        p_job_id: jobA2,
        p_worker_name: 'Timer Tester',
      });
      assert.equal(newTimer.job_id, jobA2);
      assert.equal(newTimer.status, 'active');

      const stoppedRows = await requiredQuery(
        clientA
          .from('time_entries')
          .select('duration_minutes, status, stopped_at')
          .eq('id', originalTimerId)
      );
      assert.equal(stoppedRows[0].status, 'reviewed');
      assert.ok(stoppedRows[0].duration_minutes >= 9);
      assert.ok(stoppedRows[0].stopped_at);

      const timerEvents = await requiredQuery(
        clientA
          .from('activity_events')
          .select('event_type, source_id')
          .eq('source_table', 'time_entries')
          .eq('source_id', originalTimerId)
      );
      assert.equal(timerEvents[0].event_type, 'hours_logged');

      const failedSwitch = await clientA.rpc('start_job_timer_atomic', {
        p_hourly_rate: 100,
        p_job_id: jobB,
        p_worker_name: 'Timer Tester',
      });
      assert.ok(failedSwitch.error);

      const stillActive = await requiredQuery(
        clientA
          .from('time_entries')
          .select('id, job_id, status')
          .eq('owner_id', accountA.userId)
          .eq('status', 'active')
      );
      assert.equal(stillActive.length, 1);
      assert.equal(stillActive[0].id, newTimer.id);
      assert.equal(stillActive[0].job_id, jobA2);

      await requiredQuery(
        clientA
          .from('jobs')
          .update({ status: 'completed' })
          .eq('id', jobA1)
          .select('id')
      );
      const inactiveSwitch = await clientA.rpc('start_job_timer_atomic', {
        p_hourly_rate: 100,
        p_job_id: jobA1,
        p_worker_name: 'Timer Tester',
      });
      assert.ok(inactiveSwitch.error);
      assert.match(inactiveSwitch.error.message, /Only active jobs can start a timer/i);

      const activeAfterInactiveAttempt = await requiredQuery(
        clientA
          .from('time_entries')
          .select('id, job_id, status')
          .eq('owner_id', accountA.userId)
          .eq('status', 'active')
      );
      assert.equal(activeAfterInactiveAttempt.length, 1);
      assert.equal(activeAfterInactiveAttempt[0].id, newTimer.id);
    });

    await t.test('split happy path, retry, reassignment, and partial rollback', async () => {
      const fixture = await createLineReceipt(clientA, {
        businessId: businessA,
        jobId: jobA1,
        ownerId: accountA.userId,
        receiptDate: '2026-08-22',
        tax: 12,
        total: 162,
        vendor: 'Atomic Test Supply',
        items: [
          { amount: 100, name: 'Lumber' },
          { amount: 50, name: 'Fasteners' },
        ],
      });
      const assignments = [
        assignment(fixture.lineIds[0], 'job', jobA1),
        assignment(fixture.lineIds[1], 'job', jobA2),
      ];
      const review = lineReview(fixture.receipt, assignments);
      const commitKey = `split-${suffix}-1`;

      const first = await commit(clientA, fixture.receipt, commitKey, review);
      assert.equal(first.allocatedCost, 162);
      assert.equal(first.expenseCount, 2);

      const retry = await commit(clientA, fixture.receipt, commitKey, review);
      assert.deepEqual(retry, first);

      let expenses = await fetchReceiptExpenses(clientA, fixture.receipt.id);
      assert.equal(expenses.length, 2);
      assert.equal(sum(expenses.map((expense) => expense.total_amount)), 162);
      assert.deepEqual(new Set(expenses.map((expense) => expense.job_id)), new Set([jobA1, jobA2]));

      const directExpenseDelete = await clientA
        .from('expenses')
        .delete()
        .eq('id', expenses[0].id);
      assert.ok(directExpenseDelete.error);
      assert.match(directExpenseDelete.error.message, /receipt-derived expenses/i);

      const directReceiptMutation = await clientA
        .from('receipts')
        .update({ vendor: 'Bypass attempt' })
        .eq('id', fixture.receipt.id);
      assert.ok(directReceiptMutation.error);
      assert.match(directReceiptMutation.error.message, /receipt capability/i);

      const committedReceipt = await fetchReceipt(clientA, fixture.receipt.id);
      const partialReview = lineReview(committedReceipt, [assignments[0]]);
      const partialResult = await clientA.rpc('commit_receipt_review', {
        p_expected_updated_at: committedReceipt.updated_at,
        p_idempotency_key: `partial-${suffix}`,
        p_receipt_id: committedReceipt.id,
        p_review: partialReview,
      });
      assert.ok(partialResult.error);
      assert.match(partialResult.error.message, /Every receipt line requires an explicit disposition/);

      expenses = await fetchReceiptExpenses(clientA, fixture.receipt.id);
      assert.equal(expenses.length, 2);
      assert.equal(sum(expenses.map((expense) => expense.total_amount)), 162);

      const beforeReassignment = await fetchReceipt(clientA, fixture.receipt.id);
      const reassigned = [
        assignment(fixture.lineIds[0], 'job', jobA2),
        assignment(fixture.lineIds[1], 'job', jobA2),
      ];
      await commit(clientA, beforeReassignment, `reassign-${suffix}`, lineReview(beforeReassignment, reassigned));

      expenses = await fetchReceiptExpenses(clientA, fixture.receipt.id);
      assert.equal(expenses.length, 2);
      assert.ok(expenses.every((expense) => expense.job_id === jobA2));
      assert.equal(sum(expenses.map((expense) => expense.total_amount)), 162);

      const commits = await requiredQuery(
        clientA
          .from('receipt_review_commits')
          .select('id, review_version')
          .eq('receipt_id', fixture.receipt.id)
          .order('review_version')
      );
      assert.equal(commits.length, 2, 'retry must not create a second logical commit');
    });

    await t.test('cross-business jobs and users are rejected without changing prior cost', async () => {
      const fixture = await createLineReceipt(clientA, {
        businessId: businessA,
        jobId: jobA1,
        ownerId: accountA.userId,
        receiptDate: '2026-08-22',
        tax: 0,
        total: 25,
        vendor: 'Isolation Test Supply',
        items: [{ amount: 25, name: 'Business A item' }],
      });

      const crossBusiness = lineReview(fixture.receipt, [assignment(fixture.lineIds[0], 'job', jobB)]);
      const crossJobResult = await clientA.rpc('commit_receipt_review', {
        p_expected_updated_at: fixture.receipt.updated_at,
        p_idempotency_key: `cross-job-${suffix}`,
        p_receipt_id: fixture.receipt.id,
        p_review: crossBusiness,
      });
      assert.ok(crossJobResult.error);
      assert.match(crossJobResult.error.message, /selected job is not available/i);
      assert.equal((await fetchReceiptExpenses(clientA, fixture.receipt.id)).length, 0);

      const otherUserResult = await clientB.rpc('commit_receipt_review', {
        p_expected_updated_at: fixture.receipt.updated_at,
        p_idempotency_key: `cross-user-${suffix}`,
        p_receipt_id: fixture.receipt.id,
        p_review: lineReview(fixture.receipt, [assignment(fixture.lineIds[0], 'job', jobA1)]),
      });
      assert.ok(otherUserResult.error);
      assert.match(otherUserResult.error.message, /permission/i);
      assert.equal((await fetchReceiptExpenses(clientA, fixture.receipt.id)).length, 0);
    });

    await t.test('credit receipt requires explicit gross choice and can return to $420 amount paid', async () => {
      const fixture = await createLineReceipt(clientA, {
        businessId: businessA,
        jobId: jobA1,
        ownerId: accountA.userId,
        receiptDate: '2026-08-22',
        subtotal: 500,
        tax: 20,
        total: 420,
        vendor: 'Acceptance Test Hardware',
        items: [
          { amount: 500, name: 'Merchandise' },
          { amount: 100, lineType: 'discount', name: 'Store credit' },
        ],
      });
      const assignments = [
        assignment(fixture.lineIds[0], 'job', jobA1),
        assignment(fixture.lineIds[1], 'ignore'),
      ];
      const ordinaryLineResult = await clientA.rpc('commit_receipt_review', {
        p_expected_updated_at: fixture.receipt.updated_at,
        p_idempotency_key: `credit-lines-rejected-${suffix}`,
        p_receipt_id: fixture.receipt.id,
        p_review: lineReview(fixture.receipt, assignments),
      });
      assert.ok(ordinaryLineResult.error);
      assert.match(ordinaryLineResult.error.message, /exceeds the amount paid/i);
      assert.equal((await fetchReceiptExpenses(clientA, fixture.receipt.id)).length, 0);

      const grossResult = await commit(
        clientA,
        fixture.receipt,
        `credit-lines-gross-${suffix}`,
        { ...lineReview(fixture.receipt, assignments), allowGrossLineCost: true }
      );
      assert.equal(grossResult.allocatedCost, 520);
      assert.equal(grossResult.costBasis, 'gross_items');

      let expenses = await fetchReceiptExpenses(clientA, fixture.receipt.id);
      assert.equal(expenses.length, 1);
      assert.equal(expenses[0].total_amount, 520);

      const grossReceipt = await fetchReceipt(clientA, fixture.receipt.id);
      const amountPaidReview = {
        category: 'materials',
        destinationJobId: jobA1,
        ignoreLineItems: true,
        jobCostAmount: 420,
        mode: 'whole',
        receiptDate: fixture.receipt.receipt_date,
        subtotal: 500,
        tax: 20,
        total: 420,
        vendor: fixture.receipt.vendor,
      };

      const result = await commit(clientA, grossReceipt, `credit-amount-paid-${suffix}`, amountPaidReview);
      assert.equal(result.allocatedCost, 420);
      assert.equal(result.costBasis, 'amount_paid');

      expenses = await fetchReceiptExpenses(clientA, fixture.receipt.id);
      assert.equal(expenses.length, 1);
      assert.equal(expenses[0].total_amount, 420);
      assert.equal(sum([expenses[0].pre_tax_amount, expenses[0].tax_amount]), 420);

      const receipt = await fetchReceipt(clientA, fixture.receipt.id);
      assert.equal(receipt.total, 420);
      assert.equal(receipt.subtotal, 500);
      assert.equal(receipt.tax, 20);
      assert.equal(receipt.allocated_cost, 420);

      const lines = await requiredQuery(
        clientA
          .from('receipt_line_items')
          .select('cleaned_name, line_total, line_type, review_status')
          .eq('receipt_id', fixture.receipt.id)
      );
      const credit = lines.find((line) => line.line_type === 'discount');
      assert.equal(credit.line_total, 100);
      assert.equal(credit.review_status, 'ignored');
    });

    await t.test('accepted receipt removal voids cost but preserves audit and source row', async () => {
      const fixture = await createLineReceipt(clientA, {
        businessId: businessA,
        jobId: jobA1,
        ownerId: accountA.userId,
        receiptDate: '2026-08-22',
        tax: 0,
        total: 30,
        vendor: 'Void Test Supply',
        items: [{ amount: 30, name: 'Void item' }],
      });
      await commit(
        clientA,
        fixture.receipt,
        `void-save-${suffix}`,
        lineReview(fixture.receipt, [assignment(fixture.lineIds[0], 'job', jobA1)])
      );

      const removal = await requiredRpc(clientA, 'remove_receipt', { p_receipt_id: fixture.receipt.id });
      assert.equal(removal.action, 'voided');
      assert.equal((await fetchReceiptExpenses(clientA, fixture.receipt.id)).length, 0);

      const receipt = await fetchReceipt(clientA, fixture.receipt.id);
      assert.equal(receipt.status, 'voided');
      assert.ok(receipt.voided_at);

      const events = await requiredQuery(
        clientA
          .from('activity_events')
          .select('event_type')
          .eq('source_table', 'receipts')
          .eq('source_id', fixture.receipt.id)
      );
      assert.ok(events.some((event) => event.event_type === 'receipt_voided'));
    });
  }
);

async function createTestAccount(admin, email, password) {
  const { data, error } = await admin.auth.admin.createUser({
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
  await requiredQuery(
    client
      .from('profiles')
      .insert({ id: userId })
      .select('id')
  );
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

async function createLineReceipt(client, input) {
  const receiptRows = await requiredQuery(
    client
      .from('receipts')
      .insert({
        business_id: input.businessId,
        category: 'materials',
        owner_id: input.ownerId,
        processing_status: 'complete',
        receipt_date: input.receiptDate,
        review_status: 'needs_review',
        scan_context_job_id: input.jobId,
        status: 'needs_review',
        subtotal: input.subtotal ?? input.items.filter((item) => !item.lineType).reduce((sum, item) => sum + item.amount, 0),
        tax: input.tax,
        total: input.total,
        vendor: input.vendor,
      })
      .select('*')
  );
  const receipt = receiptRows[0];
  const lineRows = await requiredQuery(
    client
      .from('receipt_line_items')
      .insert(
        input.items.map((item, index) => ({
          assigned_job_id: input.jobId,
          assignment_type: 'job',
          business_id: input.businessId,
          category: item.lineType === 'discount' ? null : 'material',
          cleaned_name: item.name,
          line_number: index + 1,
          line_total: item.amount,
          line_type: item.lineType ?? 'item',
          owner_id: input.ownerId,
          receipt_id: receipt.id,
          review_status: 'needs_review',
        }))
      )
      .select('id, line_number')
      .order('line_number')
  );
  return { lineIds: lineRows.map((line) => line.id), receipt };
}

function assignment(lineItemId, assignmentType, assignedJobId = null) {
  return {
    assigned_job_id: assignedJobId,
    assignment_type: assignmentType,
    line_item_id: lineItemId,
  };
}

function lineReview(receipt, assignments) {
  return {
    allowGrossLineCost: false,
    assignments,
    category: 'materials',
    mode: 'lines',
    receiptDate: receipt.receipt_date,
    subtotal: receipt.subtotal,
    tax: receipt.tax,
    total: receipt.total,
    vendor: receipt.vendor,
  };
}

async function commit(client, receipt, key, review) {
  return requiredRpc(client, 'commit_receipt_review', {
    p_expected_updated_at: receipt.updated_at,
    p_idempotency_key: key,
    p_receipt_id: receipt.id,
    p_review: review,
  });
}

async function fetchReceipt(client, receiptId) {
  const rows = await requiredQuery(client.from('receipts').select('*').eq('id', receiptId));
  assert.equal(rows.length, 1);
  return rows[0];
}

async function fetchReceiptExpenses(client, receiptId) {
  return requiredQuery(
    client
      .from('expenses')
      .select('id, job_id, pre_tax_amount, tax_amount, total_amount')
      .eq('receipt_id', receiptId)
      .order('id')
  );
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

function sum(values) {
  return Math.round(values.reduce((total, value) => total + Number(value), 0) * 100) / 100;
}
