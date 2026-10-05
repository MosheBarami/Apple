/**
 * Mobile/public surfaces must not regain the retired cinematic atmosphere stack.
 * This is a source-level guard because those components are intentionally absent from production.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SITE = join(dirname(fileURLToPath(import.meta.url)), '..');
// RESTATED 2026-10-05 (M2 rebuild). This read landing.css, which is deleted with the old front page. The property (no public stylesheet
// regains the retired cinematic atmosphere layers) is held over every stylesheet and component style the site ships, derived from src.
const rulesOnly = (css) => css.replace(/\/\*[\s\S]*?\*\//g, ' ');
function sheets() {
  const out = [];
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.css')) out.push([p, readFileSync(p, 'utf8')]);
      else if (e.name.endsWith('.astro')) for (const m of readFileSync(p, 'utf8').matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)) out.push([p, m[1]]);
    }
  };
  walk(join(SITE, 'src'));
  return out;
}

test('no public stylesheet carries the retired atmosphere layers', () => {
  const all = sheets();
  assert.ok(all.length >= 8, `only ${all.length} style sources found: the walk has drifted`);
  for (const [file, raw] of all) {
    const css = rulesOnly(raw);
    assert.doesNotMatch(css, /\.(?:atmosphere|light-column|strata|stratum|flow)\b/, `${file.slice(SITE.length)} still contains one of the retired cinematic atmosphere selectors`);
    assert.doesNotMatch(css, /(?:stratum-drift|column-breathe|ambient-drift|scan-line|border-travel)/, `${file.slice(SITE.length)} still contains a retired ambient/cinematic animation`);
  }
});
