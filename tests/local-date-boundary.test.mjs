import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const repoRoot = fileURLToPath(new URL('../', import.meta.url));

test('local calendar dates do not roll forward at UTC midnight', async () => {
  const originalTimeZone = process.env.TZ;

  try {
    process.env.TZ = 'America/Chicago';
    const localDateModule = await readRepoFile('src/lib/localDate.ts');
    const executableModule = localDateModule.replace('value: string', 'value');
    const { getLocalDateString, parseDateForDisplay } = await import(
      `data:text/javascript;base64,${Buffer.from(executableModule).toString('base64')}`
    );
    const lateAugustEvening = new Date('2026-09-01T03:20:00.000Z');

    assert.equal(getLocalDateString(lateAugustEvening), '2026-08-31');
    assert.equal(parseDateForDisplay('2026-08-31').getDate(), 31);

    process.env.TZ = 'America/Los_Angeles';
    assert.equal(getLocalDateString(lateAugustEvening), '2026-08-31');

    process.env.TZ = 'Asia/Tokyo';
    assert.equal(getLocalDateString(lateAugustEvening), '2026-09-01');
  } finally {
    process.env.TZ = originalTimeZone;
  }
});

test('business-date entry paths use the shared local-date helper', async () => {
  const paths = [
    'src/lib/tellContracktor.ts',
    'src/lib/timeClock.ts',
    'src/screens/AddHoursScreen.tsx',
    'src/screens/AddManualExpenseScreen.tsx',
    'src/screens/AddPaymentScreen.tsx',
    'src/screens/TellContracktorScreen.tsx',
  ];
  const contents = await Promise.all(paths.map(readRepoFile));

  for (const [index, content] of contents.entries()) {
    assert.match(content, /getLocalDateString/, `${paths[index]} must use local calendar dates`);
    assert.doesNotMatch(
      content,
      /toISOString\(\)\.slice\(0, 10\)/,
      `${paths[index]} must not derive business dates from UTC`
    );
  }
});

test('date-only report values are parsed in local time', async () => {
  const paths = [
    'src/screens/JobReportScreen.tsx',
    'src/screens/ToolsInventoryScreen.tsx',
  ];
  const contents = await Promise.all(paths.map(readRepoFile));

  for (const [index, content] of contents.entries()) {
    assert.match(content, /parseDateForDisplay/, `${paths[index]} must preserve date-only values`);
    assert.doesNotMatch(content, /new Date\((date|value)\)/);
  }
});

test('atomic timer switches receive and preserve the client work date', async () => {
  const [timeClock, migration] = await Promise.all([
    readRepoFile('src/lib/timeClock.ts'),
    readRepoFile('supabase/migrations/20260901040000_local_timer_work_dates.sql'),
  ]);

  assert.match(timeClock, /p_work_date: getLocalDateString\(\)/);
  assert.match(migration, /p_work_date date default null/);
  assert.match(migration, /v_work_date date := coalesce\(p_work_date, v_now::date\)/);
  assert.match(migration, /work_date = v_work_date/);
  assert.match(migration, /'active',\s+v_work_date,/);
  assert.doesNotMatch(migration, /work_date = v_now::date/);
});

async function readRepoFile(relativePath) {
  return readFile(new URL(relativePath, `file://${repoRoot}/`), 'utf8');
}
