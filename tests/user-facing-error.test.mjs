import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

const source = await readFile(new URL('../src/lib/userFacingError.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { getUserFacingError } = await import(
  `data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`
);

test('passes through explicitly marked context messages without the marker', () => {
  assert.equal(
    getUserFacingError(
      new Error('CTX:This receipt changed after it was opened. Reload it.\nSQL context'),
      'Fallback'
    ),
    'This receipt changed after it was opened. Reload it.'
  );
});

test('does not expose unmarked database details', () => {
  assert.equal(
    getUserFacingError(
      new Error('update or delete violates foreign key constraint invoice_expenses_expense_id_fkey'),
      'Unable to save receipt.'
    ),
    'Unable to save receipt.'
  );
});
