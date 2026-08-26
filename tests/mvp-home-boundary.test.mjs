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

  assert.match(home, /\bCapture receipt\b/);
  assert.match(home, /\bTell conTRACKtor\b/);
  assert.match(home, />\s*Start work\s*</);
  assert.match(home, /onPress={onCaptureReceipt}/);
  assert.match(home, /onPress={onTellContracktor}/);
  assert.match(home, /onPress={onStartWork}/);
  assert.equal(route.includes("onStartWork={() => router.push('/start-work')}"), true);
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
  const [createJob, jobs, startWork, timeClock, serverState] = await Promise.all([
    readRepoFile('src/screens/CreateJobScreen.tsx'),
    readRepoFile('src/lib/jobs.ts'),
    readRepoFile('src/screens/AddHoursHubScreen.tsx'),
    readRepoFile('src/lib/timeClock.ts'),
    readRepoFile('src/lib/serverState.tsx'),
  ]);

  assert.match(createJob, /const \[timeClockEnabled, setTimeClockEnabled\] = useState\(true\)/);
  assert.match(jobs, /time_clock_enabled: input\.timeClockEnabled \?\? true/);
  assert.doesNotMatch(timeClock, /fetchJobCrewMembers\(job\.id\)/);
  assert.match(timeClock, /firstPositiveRate\(job\.hourlyRate, profile\.defaultHourlyRate\)/);
  assert.match(startWork, /useQuery\(startWorkJobsQueryOptions\(\)\)/);
  assert.match(serverState, /queryFn: fetchStartWorkJobs/);
  assert.match(startWork, /startJobTimer\(job\)/);
  assert.doesNotMatch(startWork, /nextJobs\.map/);
});

test('time entry defaults never silently choose the first crew member', async () => {
  const [startWork, manualHours] = await Promise.all([
    readRepoFile('src/lib/timeClock.ts'),
    readRepoFile('src/screens/AddHoursScreen.tsx'),
  ]);

  assert.doesNotMatch(startWork, /crewMembers\[0\]/);
  assert.doesNotMatch(manualHours, /\?\? options\[0\]/);
  assert.match(manualHours, /setSelectedCrewOptionId\(null\)/);
});

async function readRepoFile(relativePath) {
  return readFile(new URL(relativePath, `file://${repoRoot}/`), 'utf8');
}
