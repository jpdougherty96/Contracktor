import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('marketing CTAs have production app fallbacks and crawler metadata', () => {
  const landing = read('marketing/index.html');

  assert.match(landing, /var APP = 'https:\/\/app\.contracktor\.app'/);
  assert.doesNotMatch(landing, /href="#" data-sign(?:in|up)/);
  assert.match(landing, /rel="canonical" href="https:\/\/contracktor\.app\/"/);
  assert.match(landing, /property="og:image" content="https:\/\/contracktor\.app\/social-card\.png"/);
  assert.match(read('marketing/robots.txt'), /Sitemap: https:\/\/contracktor\.app\/sitemap\.xml/);
});

test('signup, audience cookies, and deep-link restoration are wired for the domain split', () => {
  const signupRoute = read('app/(tabs)/signup.tsx');
  const authScreen = read('src/screens/AuthScreen.tsx');
  const cookies = read('src/lib/audienceCookies.ts');
  const authenticatedRoute = read('src/components/AuthenticatedRoute.tsx');
  const home = read('app/(tabs)/index.tsx');

  assert.match(signupRoute, /initialMode="signup"/);
  assert.match(authScreen, /initialMode \?\? 'login'/);
  assert.match(cookies, /Domain=\.contracktor\.app/);
  assert.match(cookies, /window\.location\.hostname\.endsWith\('\.contracktor\.app'\)/);
  assert.match(authenticatedRoute, /returnTo: buildReturnTo/);
  assert.match(home, /value\.startsWith\('\/\/'\)/);
  assert.match(home, /value\.includes\(':'\)/);
});

test('launch legal pages disclose AI processing and provide a contact path', () => {
  const landing = read('marketing/index.html');
  const privacy = read('marketing/privacy/index.html');
  const terms = read('marketing/terms/index.html');

  assert.match(landing, /href="\.\/privacy\/"/);
  assert.match(landing, /href="\.\/terms\/"/);
  assert.match(privacy, /href="\.\.\/terms\/"/);
  assert.match(privacy, /href="\.\.\/">Back to home<\/a>/);
  assert.match(terms, /href="\.\.\/privacy\/"/);
  assert.match(terms, /href="\.\.\/">Back to home<\/a>/);
  assert.match(privacy, /receipt image to the OpenAI API/i);
  assert.match(privacy, /Tell conTRACKtor/i);
  assert.match(privacy, /We do not sell personal information/i);
  assert.match(terms, /AI-assisted output is a draft/i);
  assert.match(privacy, /mailto:support@contracktor\.app/);
  assert.match(terms, /mailto:support@contracktor\.app/);
});

test('Free pricing is scannable and stays inside the documented truth layer', () => {
  const landing = read('marketing/index.html');

  assert.match(landing, /aria-label="Included in the Free plan"/);
  assert.match(landing, /Hours and job timer/);
  assert.match(landing, /Receipt capture and correction/);
  assert.match(landing, /Invoices, reports and exports/);
  assert.match(landing, /Basic Tell conTRACKtor/);
  assert.doesNotMatch(landing, /Unlimited jobs, hours and receipts/);
});

test('the app export is excluded from search indexing and analytics URLs are redacted', () => {
  assert.match(read('app/+html.tsx'), /noindex, nofollow/);

  const analytics = read('src/components/VercelAnalytics.web.tsx');
  assert.match(analytics, /\/jobs\/\[jobId\]/);
  assert.match(analytics, /url\.search = ''/);
  assert.match(analytics, /url\.hash = ''/);
});
