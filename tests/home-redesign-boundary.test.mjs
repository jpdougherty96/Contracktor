import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const repoRoot = fileURLToPath(new URL('../', import.meta.url));

test('Home keeps the three capture actions together before secondary status content', async () => {
  const home = await readRepoFile('src/screens/HomeActionsScreen.tsx');
  const reflexZoneIndex = home.indexOf('<View style={styles.reflexZone}>');
  const captureIndex = home.indexOf('Capture receipt', reflexZoneIndex);
  const tellIndex = home.indexOf('Tell conTRACKtor', reflexZoneIndex);
  const workIndex = home.indexOf('activeTimer && elapsed', reflexZoneIndex);
  const attentionIndex = home.indexOf('styles.attentionLine');

  assert.doesNotMatch(home, /styles\.heading|>Capture what happened<\/Text>/);
  assert.match(home, /<View style=\{styles\.reflexZone\}>/);
  assert.ok(captureIndex > reflexZoneIndex);
  assert.ok(tellIndex > captureIndex);
  assert.ok(workIndex > tellIndex);
  assert.ok(attentionIndex > workIndex);
});

test('Home renders one needs-attention signal instead of duplicating the activity badge', async () => {
  const home = await readRepoFile('src/screens/HomeActionsScreen.tsx');

  assert.match(home, /needsReviewCount > 0 \? \(/);
  assert.match(home, /name="alert-triangle"/);
  assert.match(home, /things need'} your attention/);
  assert.match(home, /onPress=\{onGoToActivity\}/);
  assert.doesNotMatch(home, /reviewBadge|reviewBadgeText/);
});

test('Home timer state is live, accessible, stoppable, and motion-safe', async () => {
  const [home, timeClock, serverState, route] = await Promise.all([
    readRepoFile('src/screens/HomeActionsScreen.tsx'),
    readRepoFile('src/lib/timeClock.ts'),
    readRepoFile('src/lib/serverState.tsx'),
    readRepoFile('app/(tabs)/index.tsx'),
  ]);

  assert.match(home, /useQuery\(activeTimerQueryOptions\(\)\)/);
  assert.match(home, /prefetchQuery\(startWorkJobsQueryOptions\(\)\)/);
  assert.match(home, /name="clock"/);
  assert.match(home, /name="play"/);
  assert.match(home, /styles\.iconLiveDot/);
  assert.match(home, /Running · \{elapsed\}/);
  assert.match(home, /numberOfLines=\{1\}/);
  assert.match(home, /stopTimerMutation\.mutateAsync\(timerToStop\.entry\)/);
  assert.match(home, /event\.stopPropagation\(\)/);
  assert.match(home, /Stop timer for \$\{activeTimer\.jobName\}/);
  assert.match(home, /isStoppingTimer \? 'Stopping…' : 'Stop'/);
  assert.match(home, /AccessibilityInfo\.isReduceMotionEnabled\(\)/);
  assert.match(home, /30_000/);
  assert.match(timeClock, /\.from\('jobs'\)\s*\.select\('name'\)/);
  assert.doesNotMatch(timeClock, /fetchJobs\(\)/);
  assert.match(serverState, /queryFn: fetchActiveTimerState/);
  assert.match(serverState, /queryFn: fetchStartWorkJobs/);
  assert.match(route, /onTimerStopped=\{\(jobName\) => \{/);
});

async function readRepoFile(relativePath) {
  return readFile(new URL(relativePath, `file://${repoRoot}/`), 'utf8');
}
