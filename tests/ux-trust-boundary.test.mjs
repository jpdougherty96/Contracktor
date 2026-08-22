import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const repoRoot = fileURLToPath(new URL('../', import.meta.url));

test('invoice, activity, password, and template-route defects stay fixed', async () => {
  const [invoice, activity, password] = await Promise.all([
    readRepoFile('src/screens/InvoiceDraftScreen.tsx'),
    readRepoFile('src/screens/ActivityScreen.tsx'),
    readRepoFile('src/screens/UpdatePasswordScreen.tsx'),
  ]);

  assert.doesNotMatch(invoice, /PDF ready: \$\{sharedUri\}/);
  assert.match(invoice, /result\.didOpen \? 'Invoice PDF opened for sharing\.'/);
  assert.doesNotMatch(activity, /\.slice\(0, 10\)/);
  assert.match(password, /onBack: \(\) => void/);
  await assert.rejects(access(repoPath('app/(tabs)/explore.tsx')));
  await assert.rejects(access(repoPath('app/modal.tsx')));
});

test('guarded drafts protect high-value and simple entry screens', async () => {
  const guardedScreens = [
    'src/screens/AccountSettingsScreen.tsx',
    'src/screens/TellContracktorScreen.tsx',
    'src/screens/ReceiptReviewScreen.tsx',
    'src/screens/AddManualExpenseScreen.tsx',
    'src/screens/AddHoursScreen.tsx',
    'src/screens/AddPaymentScreen.tsx',
    'src/screens/AddNoteScreen.tsx',
    'src/screens/EditHoursScreen.tsx',
    'src/screens/EditPaymentScreen.tsx',
    'src/screens/EditNoteScreen.tsx',
  ];
  const contents = await Promise.all(guardedScreens.map(readRepoFile));

  for (const [index, content] of contents.entries()) {
    assert.match(content, /useGuardedBack/, `${guardedScreens[index]} must guard Back`);
  }

  assert.match(contents[1], /AsyncStorage\.setItem\(draftKey, text\)/);
  assert.match(contents[2], /baselineDraftSignatureRef/);
});

test('native and browser Back requests use the current screen guard', async () => {
  const [provider, index] = await Promise.all([
    readRepoFile('src/contexts/BackNavigationContext.tsx'),
    readRepoFile('app/(tabs)/index.tsx'),
  ]);

  assert.match(provider, /BackHandler\.addEventListener\('hardwareBackPress'/);
  assert.match(provider, /window\.addEventListener\('popstate'/);
  assert.match(provider, /activeHandlerRef\.current/);
  assert.match(index, /<ScreenBackProvider/);
  assert.match(index, /setDashboardBackScreen\('activity'\)/);
  assert.match(index, /getAddScreenForPicker\(createBackScreen\)/);
});

test('timer switches are explicit in the UI and atomic in the database', async () => {
  const [hub, timeClock, migration] = await Promise.all([
    readRepoFile('src/screens/AddHoursHubScreen.tsx'),
    readRepoFile('src/lib/timeClock.ts'),
    readRepoFile('supabase/migrations/20260822013000_atomic_timer_switch.sql'),
  ]);

  assert.match(hub, /title: 'Switch active timer\?'/);
  assert.match(hub, /confirmLabel: 'Switch timer'/);
  assert.match(timeClock, /rpc\('start_job_timer_atomic'/);
  assert.doesNotMatch(timeClock, /for \(const activeEntry of activeEntries\)/);
  assert.match(migration, /where owner_id = v_auth_user\s+and status = 'active'\s+for update/i);
  assert.match(migration, /insert into public\.time_entries/);
  assert.match(migration, /perform public\.upsert_activity_event/);
});

test('screens do not expose arbitrary backend error messages', async () => {
  const screenPaths = [
    'app/(tabs)/index.tsx',
    'src/screens/ActivityScreen.tsx',
    'src/screens/AddHoursHubScreen.tsx',
    'src/screens/AddHoursScreen.tsx',
    'src/screens/AddManualExpenseScreen.tsx',
    'src/screens/AddNoteScreen.tsx',
    'src/screens/AddPaymentScreen.tsx',
    'src/screens/AddReceiptScreen.tsx',
    'src/screens/AccountSettingsScreen.tsx',
    'src/screens/CreateJobScreen.tsx',
    'src/screens/EditHoursScreen.tsx',
    'src/screens/EditJobScreen.tsx',
    'src/screens/EditNoteScreen.tsx',
    'src/screens/EditPaymentScreen.tsx',
    'src/screens/InvoiceDraftScreen.tsx',
    'src/screens/JobDashboardScreen.tsx',
    'src/screens/JobPickerScreen.tsx',
    'src/screens/JobReportScreen.tsx',
    'src/screens/JobsListScreen.tsx',
    'src/screens/ReceiptReviewScreen.tsx',
    'src/screens/ShoppingListScreen.tsx',
    'src/screens/TellContracktorScreen.tsx',
    'src/screens/ToolsInventoryScreen.tsx',
    'src/screens/UpdatePasswordScreen.tsx',
  ];
  const contents = await Promise.all(screenPaths.map(readRepoFile));

  for (const [index, content] of contents.entries()) {
    assert.doesNotMatch(
      content,
      /instanceof Error\s*\?\s*[A-Za-z]+\.message/,
      `${screenPaths[index]} must use curated user-facing errors`
    );
  }
});

async function readRepoFile(relativePath) {
  return readFile(repoPath(relativePath), 'utf8');
}

function repoPath(relativePath) {
  return fileURLToPath(new URL(relativePath, `file://${repoRoot}/`));
}
