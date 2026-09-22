/**
 * Mobile/public surfaces must not regain the retired cinematic atmosphere stack.
 * This is a source-level guard because those components are intentionally absent from production.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SITE = join(dirname(fileURLToPath(import.meta.url)), '..');
const LANDING = readFileSync(join(SITE, 'src', 'styles', 'landing.css'), 'utf8');
const rulesOnly = (css) => css.replace(/\/\*[\s\S]*?\*\//g, ' ');

test('the landing stylesheet no longer carries the retired atmosphere layers', () => {
  const css = rulesOnly(LANDING);
  assert.doesNotMatch(css, /\.(?:atmosphere|light-column|strata|stratum|flow)\b/,
    'landing.css still contains one of the retired cinematic atmosphere selectors');
  assert.doesNotMatch(css, /(?:stratum-drift|column-breathe|ambient-drift|scan-line|border-travel)/,
    'landing.css still contains a retired ambient/cinematic animation');
});
