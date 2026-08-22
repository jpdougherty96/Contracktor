import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const repoRoot = fileURLToPath(new URL('../', import.meta.url));
const mirroredFunctions = [
  'parseCountUnit',
  'chooseBetterDescription',
  'getShoppingNeedKey',
  'keysAreMergeable',
  'normalizeDescription',
  'normalizeKey',
  'pluralizeUnit',
  'normalizeUnitKey',
  'capitalizeFirst',
];

test('manual and Tell shopping-need normalization stay in lockstep', async () => {
  const [clientSource, tellSource] = await Promise.all([
    readRepoFile('src/lib/shoppingNeeds.ts'),
    readRepoFile('supabase/functions/tell-contracktor/index.ts'),
  ]);

  for (const functionName of mirroredFunctions) {
    assert.equal(
      normalizeFunction(extractFunction(clientSource, functionName)),
      normalizeFunction(extractFunction(tellSource, functionName)),
      `${functionName} drifted between manual and Tell shopping paths`
    );
  }
});

function extractFunction(source, functionName) {
  const start = source.indexOf(`function ${functionName}(`);
  assert.notEqual(start, -1, `Missing function ${functionName}`);
  const bodyMatch = /\{\r?\n/.exec(source.slice(start));
  assert.ok(bodyMatch, `Missing function body for ${functionName}`);
  const bodyStart = start + bodyMatch.index;
  let depth = 0;

  for (let index = bodyStart; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    if (source[index] === '}') depth -= 1;
    if (depth === 0) return source.slice(start, index + 1);
  }

  assert.fail(`Unclosed function ${functionName}`);
}

function normalizeFunction(source) {
  return source.replace(/\s+/g, ' ').trim();
}

async function readRepoFile(relativePath) {
  return readFile(new URL(relativePath, `file://${repoRoot}/`), 'utf8');
}
