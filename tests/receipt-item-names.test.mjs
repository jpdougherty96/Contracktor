import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

const source = await readFile(
  new URL('../shared/receiptItemNames.ts', import.meta.url),
  'utf8'
);
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const { canonicalizeReceiptItemName } = await import(
  `data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`
);

test('protects trade terms and expands only unambiguous receipt phrases', () => {
  assert.equal(
    canonicalizeReceiptItemName('STRONG ARM TWO PEX BENDS'),
    'Strong arm two PEX bends'
  );
  assert.equal(
    canonicalizeReceiptItemName('2 IN PVC DWV SANTEE'),
    '2 in PVC DWV sanitary tee'
  );
  assert.equal(canonicalizeReceiptItemName('PVC WYE'), 'PVC wye');
  assert.equal(canonicalizeReceiptItemName(`1/2"X250' PEX-A TUBING`), `1/2"x250' PEX-A tubing`);
  assert.equal(canonicalizeReceiptItemName('PEX-B COIL'), 'PEX-B coil');
  assert.equal(canonicalizeReceiptItemName('PEX-C PIPE'), 'PEX-C pipe');
});

test('uses longest phrase matches before preserving ambiguous abbreviations', () => {
  assert.equal(
    canonicalizeReceiptItemName('1-1/2X10 SOLID CO PVCPIP'),
    '1-1/2x10 solid core PVC pipe'
  );
  assert.equal(canonicalizeReceiptItemName('45 DEG ST EL'), '45 deg street elbow');
  assert.equal(canonicalizeReceiptItemName('CO'), 'CO');
  assert.equal(canonicalizeReceiptItemName('ST'), 'ST');
  assert.equal(canonicalizeReceiptItemName('EL'), 'EL');
});

test('normalizes pack sizes and removes a duplicated printed line amount', () => {
  assert.equal(
    canonicalizeReceiptItemName('100PK 1/2" HALF CLAMP 20.97', { lineTotal: 20.97 }),
    '100-pack 1/2" half clamp'
  );
  assert.equal(
    canonicalizeReceiptItemName('100PK 1/2" HALF CLAMP\n$20.97', { lineTotal: 20.97 }),
    '100-pack 1/2" half clamp'
  );
});

test('preserves unknown mixed-case names instead of inventing replacements', () => {
  assert.equal(
    canonicalizeReceiptItemName('SharkBite Max coupling'),
    'SharkBite Max coupling'
  );
  assert.equal(canonicalizeReceiptItemName(''), '');
  assert.equal(canonicalizeReceiptItemName(null), '');
});

test('preserves observed compact product codes without changing dimensions or units', () => {
  assert.equal(canonicalizeReceiptItemName('4N1 GALV PIPE FLASH'), '4N1 galvanized pipe flash');
  assert.equal(canonicalizeReceiptItemName('PL ROOF/FLASHING SEALANT'), 'PL roof/flashing sealant');
  assert.equal(canonicalizeReceiptItemName('8" X 45D ELBOW'), '8" x 45D elbow');
  assert.equal(canonicalizeReceiptItemName('10P FASTENER'), '10P fastener');
  assert.equal(canonicalizeReceiptItemName('2X4 STUD'), '2x4 stud');
  assert.equal(canonicalizeReceiptItemName('2 IN PVC PIPE'), '2 in PVC pipe');
});
