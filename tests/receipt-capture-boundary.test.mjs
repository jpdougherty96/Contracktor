import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const repoRoot = fileURLToPath(new URL('../', import.meta.url));

test('home receipt capture uses direct camera where supported and a Safari chooser', async () => {
  const screen = await readFile(
    new URL('src/screens/AddReceiptScreen.tsx', `file://${repoRoot}/`),
    'utf8'
  );
  const app = await readFile(
    new URL('app/(tabs)/index.tsx', `file://${repoRoot}/`),
    'utf8'
  );

  assert.match(screen, /pickWebReceiptImage\(\{ capture: 'environment' \}\)/);
  assert.match(screen, /options\.capture && shouldApplyWebCaptureHint\(\)/);
  assert.match(screen, /input\.setAttribute\('capture', options\.capture\)/);
  assert.match(screen, /\/Safari\\\/\/i\.test\(userAgent\)/);
  assert.match(screen, /Chrome\|Chromium\|CriOS\|FxiOS\|EdgiOS\|OPiOS/);
  assert.match(screen, /if \(isWeb \|\| !autoStartCamera \|\| didAutoStartCameraRef\.current\)/);
  assert.doesNotMatch(screen, /WebCameraCapture|getUserMedia/);
  assert.match(app, /const webCapture =\s*Platform\.OS === 'web'\s*\? pickWebReceiptImage\(\{ capture: 'environment' \}\)/);
  assert.match(app, /setScreen\('addReceipt'\);\s*\n\s*if \(webCapture\)/);
});
