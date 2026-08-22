import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const repoRoot = fileURLToPath(new URL('../', import.meta.url));

test('job summaries expose authoritative financial snapshots instead of fake record arrays', async () => {
  const [jobTypes, jobs, picker, list] = await Promise.all([
    readRepoFile('src/types/job.ts'),
    readRepoFile('src/lib/jobs.ts'),
    readRepoFile('src/screens/JobPickerScreen.tsx'),
    readRepoFile('src/screens/JobsListScreen.tsx'),
  ]);

  assert.doesNotMatch(jobTypes, /\b(receipts|hours|payments|notes):\s*\w+\[\]/);
  assert.match(jobTypes, /financialSnapshot\?: JobFinancialSnapshot \| null/);
  assert.match(jobs, /financialSnapshot: snapshot/);
  assert.match(jobs, /projected_margin_percent/);
  assert.doesNotMatch(jobs, /receipts:\s*\[\]|hours:\s*\[\]|payments:\s*\[\]|notes:\s*\[\]/);
  assert.match(picker, /job\.financialSnapshot/);
  assert.doesNotMatch(picker, /job\.(receipts|hours|payments)(?![A-Za-z])/);
  assert.match(list, /\(job\.paymentsReceived \?\? 0\) > 0/);
  assert.doesNotMatch(list, /job\.(receipts|hours|payments)(?![A-Za-z])/);
});

test('dashboard never renders local fallback financial facts after a snapshot failure', async () => {
  const dashboard = await readRepoFile('src/screens/JobDashboardScreen.tsx');

  assert.match(dashboard, /setDatabaseSnapshot\(null\)/);
  assert.match(dashboard, /!isSnapshotLoading && !snapshotError && databaseSnapshot/);
  assert.match(dashboard, /Financial totals are current, but supporting job details are unavailable/);
  assert.doesNotMatch(
    dashboard,
    /calculateJobFinancialSnapshot|totalLocalHours|job\.(receipts|hours|payments)(?![A-Za-z])/
  );
  assert.doesNotMatch(dashboard, /databaseSnapshot\?\.[a-z_]+ \?\? snapshot/);
});

async function readRepoFile(relativePath) {
  return readFile(new URL(relativePath, `file://${repoRoot}/`), 'utf8');
}
