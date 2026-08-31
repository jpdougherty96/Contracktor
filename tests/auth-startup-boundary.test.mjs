import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const auth = await readFile(new URL('../src/lib/auth.ts', import.meta.url), 'utf8');
const entitlements = await readFile(
  new URL('../src/contexts/EntitlementsContext.tsx', import.meta.url),
  'utf8'
);
const authenticatedRoute = await readFile(
  new URL('../src/components/AuthenticatedRoute.tsx', import.meta.url),
  'utf8'
);
const homeRoute = await readFile(new URL('../app/(tabs)/index.tsx', import.meta.url), 'utf8');

test('session restoration has a bounded wait instead of an infinite loading screen', () => {
  assert.match(auth, /AUTH_SESSION_TIMEOUT_MS = 10_000/);
  assert.match(auth, /Promise\.race\(\[supabase\.auth\.getSession\(\), timeout\]\)/);
  assert.match(authenticatedRoute, /We couldn&apos;t finish loading your account\./);
  assert.match(authenticatedRoute, />Try again</);
});

test('authenticated routes and Home share one session source', () => {
  assert.match(entitlements, /session: Session \| null/);
  assert.match(entitlements, /refreshAuth: \(\) => Promise<void>/);
  assert.doesNotMatch(authenticatedRoute, /supabase\.auth\.getSession/);
  assert.doesNotMatch(authenticatedRoute, /onAuthStateChange/);
  assert.doesNotMatch(homeRoute, /getCurrentAuthState/);
  assert.doesNotMatch(homeRoute, /onAuthStateChange/);
});
