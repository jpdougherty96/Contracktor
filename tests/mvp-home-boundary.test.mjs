import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const repoRoot = fileURLToPath(new URL('../', import.meta.url));

test('Home exposes the three MVP capture methods', async () => {
  const [home, route] = await Promise.all([
    readRepoFile('src/screens/HomeActionsScreen.tsx'),
    readRepoFile('app/(tabs)/index.tsx'),
  ]);

  assert.match(home, />Capture receipt</);
  assert.match(home, />Tell conTRACKtor</);
  assert.match(home, />Start work</);
  assert.match(home, /onPress={onCaptureReceipt}/);
  assert.match(home, /onPress={onTellContracktor}/);
  assert.match(home, /onPress={onStartWork}/);
  assert.equal(route.includes("onStartWork={() => setScreen('addHoursHub')}"), true);
});

test('non-MVP utilities do not compete in the Home action list', async () => {
  const home = await readRepoFile('src/screens/HomeActionsScreen.tsx');
  const actionBlock = home.match(/const primaryActions = \[([\s\S]*?)\] as const;/);

  assert.ok(actionBlock, 'Unable to locate the Home action list.');
  assert.deepEqual(
    [...actionBlock[1].matchAll(/key: '([^']+)'/g)].map((match) => match[1]),
    ['jobs', 'activity', 'job']
  );

  for (const deferredAction of ['expense', 'hours', 'payment', 'toolsInventory']) {
    assert.equal(actionBlock[1].includes(`key: '${deferredAction}'`), false);
  }
});

test('the repository records the MVP finish line and scope test', async () => {
  const mvp = await readRepoFile('docs/mvp-definition.md');

  assert.match(mvp, /What happened\?/);
  assert.match(mvp, /What did I spend\?/);
  assert.match(mvp, /How much labor went into it\?/);
  assert.match(mvp, /Did I make money\?/);
  assert.match(mvp, /capture reality, organize reality, or explain the/);
});

test('new jobs make Start Work available by default', async () => {
  const [createJob, jobs] = await Promise.all([
    readRepoFile('src/screens/CreateJobScreen.tsx'),
    readRepoFile('src/lib/jobs.ts'),
  ]);

  assert.match(createJob, /const \[timeClockEnabled, setTimeClockEnabled\] = useState\(true\)/);
  assert.match(jobs, /time_clock_enabled: input\.timeClockEnabled \?\? true/);
});

async function readRepoFile(relativePath) {
  return readFile(new URL(relativePath, `file://${repoRoot}/`), 'utf8');
}
