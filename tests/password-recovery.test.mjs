import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

const source = await readFile(
  new URL('../src/lib/passwordRecovery.ts', import.meta.url),
  'utf8'
);
const output = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const recovery = await import(
  `data:text/javascript;base64,${Buffer.from(output).toString('base64')}`
);

test('recognizes both dedicated and legacy Supabase recovery callbacks', () => {
  assert.equal(
    recovery.isPasswordRecoveryUrl(
      'https://app.contracktor.app/reset-password?authFlow=password-recovery#access_token=x'
    ),
    true
  );
  assert.equal(
    recovery.isPasswordRecoveryUrl('https://app.contracktor.app/#access_token=x&type=recovery'),
    true
  );
  assert.equal(recovery.isPasswordRecoveryUrl('https://app.contracktor.app/'), false);
});

test('captures recovery intent before Supabase can clean the callback URL', () => {
  const values = new Map();
  const previousWindow = globalThis.window;
  globalThis.window = {
    localStorage: {
      getItem: (key) => values.get(key) ?? null,
      removeItem: (key) => values.delete(key),
      setItem: (key, value) => values.set(key, value),
    },
    location: {
      href: 'https://app.contracktor.app/#access_token=x&type=recovery',
    },
  };

  try {
    assert.equal(recovery.preservePasswordRecoveryRequestFromUrl(), true);
    assert.equal(recovery.hasPendingPasswordRecoveryRequest(), true);
    recovery.clearPasswordRecoveryRequested();
    assert.equal(recovery.hasPendingPasswordRecoveryRequest(), false);
  } finally {
    globalThis.window = previousWindow;
  }
});

test('early recovery capture is safe when a native runtime has no browser location', () => {
  const previousWindow = globalThis.window;
  globalThis.window = {};

  try {
    assert.equal(recovery.preservePasswordRecoveryRequestFromUrl(), false);
  } finally {
    globalThis.window = previousWindow;
  }
});

test('future reset emails target the dedicated route', async () => {
  const [authScreen, layout, route, supabaseClient] = await Promise.all([
    readFile(new URL('../src/screens/AuthScreen.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../app/(tabs)/_layout.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../app/(tabs)/reset-password.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/lib/supabase.ts', import.meta.url), 'utf8'),
  ]);

  assert.match(authScreen, /passwordRecovery' \? '\/reset-password' : '\/'/);
  assert.match(layout, /name="reset-password"/);
  assert.match(route, /<UpdatePasswordScreen/);
  assert.match(route, /authEvent === 'PASSWORD_RECOVERY'/);
  assert.match(route, /authFlow === 'password-recovery'/);
  assert.match(supabaseClient, /preservePasswordRecoveryRequestFromUrl\(\)/);
});
