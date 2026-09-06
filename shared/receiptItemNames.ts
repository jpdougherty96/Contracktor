export type ReceiptItemNameOptions = {
  lineTotal?: number | null;
};

const protectedTerms: ReadonlyArray<readonly [RegExp, string]> = [
  [/\bpex\b/gi, 'PEX'],
  [/\bpvc\b/gi, 'PVC'],
  [/\bdwv\b/gi, 'DWV'],
  [/\bwye\b/gi, 'wye'],
  [/\bpl\b/gi, 'PL'],
  [/\bco\b/gi, 'CO'],
  [/\bst\b/gi, 'ST'],
  [/\bel\b/gi, 'EL'],
];

// Keep these entries phrase-specific. Short receipt abbreviations such as CO,
// EL, and ST have several meanings and must not be expanded on their own.
const phraseReplacements: ReadonlyArray<readonly [RegExp, string]> = [
  [/\bsolid\s+co\b/gi, 'solid core'],
  [/\bsan(?:itary)?\s*tee\b/gi, 'sanitary tee'],
  [/\bsantee\b/gi, 'sanitary tee'],
  [/\bst\s+(?:el|elbo|elbow)\b/gi, 'street elbow'],
  [/\bstreet\s+elbo?w?\b/gi, 'street elbow'],
  [/\belbo\b/gi, 'elbow'],
  [/\bgalv\b/gi, 'galvanized'],
  [/\bpvc\s*(?:pip|ip)\b/gi, 'PVC pipe'],
];

/**
 * Produces a conservative, deterministic item name from the text printed on a
 * receipt. It deliberately does not accept a model-generated cleaned name.
 */
export function canonicalizeReceiptItemName(
  originalText: string | null | undefined,
  options: ReceiptItemNameOptions = {}
): string {
  const preparedText = prepareOriginalText(originalText, options.lineTotal);

  if (!preparedText) {
    return '';
  }

  const letters = preparedText.replace(/[^A-Za-z]+/g, '');
  const wasAllCaps = letters.length > 0 && letters === letters.toUpperCase();
  let canonicalName = wasAllCaps ? preparedText.toLowerCase() : preparedText;

  // Numeric pack sizes are safe even when joined to the abbreviation (100PK).
  canonicalName = canonicalName.replace(/\b(\d+)\s*pk\b/gi, '$1-pack');

  // Product grades and compact manufacturer codes carry meaningful casing.
  // Keep dimension separators such as 2X4 out of the compact-code rules.
  canonicalName = canonicalName
    .replace(/\bpex-?([abc])\b/gi, (_match, grade: string) => `PEX-${grade.toUpperCase()}`)
    .replace(
      /\b(\d+)([a-wyz])(\d+)\b/gi,
      (_match, prefix: string, letter: string, suffix: string) =>
        `${prefix}${letter.toUpperCase()}${suffix}`
    )
    .replace(
      /\b(\d+)([dnp])\b/gi,
      (_match, prefix: string, letter: string) => `${prefix}${letter.toUpperCase()}`
    );

  for (const [pattern, replacement] of phraseReplacements) {
    canonicalName = canonicalName.replace(pattern, replacement);
  }

  for (const [pattern, replacement] of protectedTerms) {
    canonicalName = canonicalName.replace(pattern, replacement);
  }

  canonicalName = canonicalName.replace(/\s+/g, ' ').trim();

  return wasAllCaps && /^[a-z]/i.test(canonicalName)
    ? capitalizeFirstLetter(canonicalName)
    : canonicalName;
}

function prepareOriginalText(
  originalText: string | null | undefined,
  lineTotal: number | null | undefined
): string {
  if (!originalText) {
    return '';
  }

  const amountOnlyPattern = createAmountOnlyPattern(lineTotal);
  const trailingAmountPattern = createTrailingAmountPattern(lineTotal);
  const lines = originalText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !amountOnlyPattern?.test(line));

  const joined = lines.join(' ').replace(/\s+/g, ' ').trim();
  return trailingAmountPattern ? joined.replace(trailingAmountPattern, '').trim() : joined;
}

function createAmountOnlyPattern(lineTotal: number | null | undefined): RegExp | null {
  const alternatives = getAmountAlternatives(lineTotal);
  return alternatives ? new RegExp(`^\\$?(?:${alternatives})-?$`) : null;
}

function createTrailingAmountPattern(lineTotal: number | null | undefined): RegExp | null {
  const alternatives = getAmountAlternatives(lineTotal);
  return alternatives ? new RegExp(`\\s+\\$?(?:${alternatives})-?$`) : null;
}

function getAmountAlternatives(lineTotal: number | null | undefined): string | null {
  if (typeof lineTotal !== 'number' || !Number.isFinite(lineTotal)) {
    return null;
  }

  const absoluteAmount = Math.abs(lineTotal);
  const fixedAmount = escapeRegExp(absoluteAmount.toFixed(2));
  const wholeAmount = Number.isInteger(absoluteAmount) ? String(absoluteAmount) : null;

  return wholeAmount ? `${fixedAmount}|${escapeRegExp(wholeAmount)}` : fixedAmount;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function capitalizeFirstLetter(value: string): string {
  const firstLetterIndex = value.search(/[a-z]/i);

  if (firstLetterIndex < 0) {
    return value;
  }

  return `${value.slice(0, firstLetterIndex)}${value[firstLetterIndex].toUpperCase()}${value.slice(firstLetterIndex + 1)}`;
}
