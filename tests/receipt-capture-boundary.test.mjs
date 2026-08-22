import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const repoRoot = fileURLToPath(new URL('../', import.meta.url));

test('home receipt capture opens the camera first on native and web', async () => {
  const screen = await readFile(
    new URL('src/screens/AddReceiptScreen.tsx', `file://${repoRoot}/`),
    'utf8'
  );

  assert.match(screen, /if \(isWeb\) \{\s*setIsWebCameraOpen\(true\)/);
  assert.match(screen, /if \(!autoStartCamera \|\| didAutoStartCameraRef\.current\)/);
  assert.doesNotMatch(screen, /didAutoStartCameraRef\.current \|\| isWeb/);
  assert.match(screen, /onCancel=\{\(\) => \{\s*setIsWebCameraOpen\(false\);\s*void handleChoosePhoto\(\)/);
  assert.match(screen, /!isWebCameraOpen \? \(\s*<View style=\{styles\.actionStack\}>/);
});
