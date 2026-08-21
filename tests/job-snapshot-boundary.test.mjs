import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const repoRoot = fileURLToPath(new URL('../', import.meta.url));

test('the basic Job Snapshot is deterministic and built from Free job truth', async () => {
  const [dashboard, financials] = await Promise.all([
    readRepoFile('src/screens/JobDashboardScreen.tsx'),
    readRepoFile('src/lib/jobFinancials.ts'),
  ]);

  assert.match(dashboard, />JOB SNAPSHOT</);
  assert.match(dashboard, />Where this job stands</);
  assert.match(dashboard, /label="Needs attention"/);
  assert.match(dashboard, /label="Open shopping"/);
  assert.match(dashboard, /label="Total hours"/);
  assert.match(dashboard, /label="Job cost"/);
  assert.match(dashboard, /label="Recorded balance"/);
  assert.match(dashboard, /label="Projected profit"/);
  assert.match(dashboard, /Customer balance appears after invoicing/);
  assert.doesNotMatch(dashboard, /snapshot\.ai_insights/);

  assert.match(financials, /from\('job_financial_snapshots'\)/);
  assert.match(financials, /from\('attention_items'\)/);
  assert.match(financials, /from\('shopping_needs'\)/);
  assert.match(financials, /from\('activity_events'\)/);
});

async function readRepoFile(relativePath) {
  return readFile(new URL(relativePath, `file://${repoRoot}/`), 'utf8');
}
