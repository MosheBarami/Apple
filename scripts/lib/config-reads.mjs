/**
 * Which of `names` a source never USES.
 *
 * check-credit-figures asks "does pricing.astro still read PLAN_TABLE, BUILD_COSTS, CREDIT_USD and
 * TYPICAL_BUILD_CREDITS?", because a page that stops reading them has typed a number. It answered by
 * looking for the name anywhere in the source, so the import line alone satisfied it: delete every use,
 * leave `import { PLAN_TABLE, ... } from '@studpilot/shared'`, and the guard counted four config reads.
 *
 * A USE is a mention in what is left after comments and import statements are taken out. Pure, so
 * tests/check-credit-figures.test.mjs can hand it a page that only imports.
 *
 * @param {string} src
 * @param {string[]} names
 * @returns {string[]} the names with no use
 */
import { stripComments } from './offer-rules.mjs';

export function unusedNames(src, names) {
  const code = stripComments(src).replace(/import\s+(?:type\s+)?\{[^}]*\}\s*from\s*['"][^'"]+['"]\s*;?/g, '');
  return names.filter((name) => !new RegExp(`\\b${name}\\b`).test(code));
}
