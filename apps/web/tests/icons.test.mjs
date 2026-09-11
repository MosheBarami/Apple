/**
 * One icon set, and it stays one.
 *
 * There were two — `PATH` for the workspace and `ICONS` for the nav — overlapping on
 * three names, two of which were drawn DIFFERENTLY. `settings` and `docs` rendered as
 * different glyphs depending which part of the product you were in. Nothing was wrong
 * with either drawing; the defect was that both existed.
 *
 * These guard the property that fixed it: exactly one module defines a path, and every
 * other module gets it from there.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const WEB = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(WEB, 'src');
const ICONS = join(SRC, 'components', 'icons.ts');

/** Every .ts/.tsx under src/, so a new map cannot hide in a new directory. */
function sources(dir = SRC, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) sources(p, out);
    else if (/\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}

test('every icon path is defined in exactly one module', () => {
  // A path map is a top-level object whose values are SVG path data. Anything matching
  // that shape outside icons.ts is a second set starting.
  const offenders = [];
  for (const file of sources()) {
    if (file === ICONS) continue;
    const src = readFileSync(file, 'utf8');
    // Two or more `key: 'M…'` entries at object depth is a map, not a one-off prop.
    const pathish = [...src.matchAll(/^\s{2}[a-zA-Z][a-zA-Z0-9]*:\s*\n?\s*'M[\d.\-\s]/gm)];
    if (pathish.length >= 2) offenders.push(`${relative(WEB, file)} (${pathish.length} entries)`);
  }
  assert.deepEqual(offenders, [],
    'a second icon set is forming. Put the paths in components/icons.ts and re-export, '
    + 'or two parts of the product will draw the same idea differently.');
});

test('the two historical names still resolve, so no call site broke', () => {
  const prim = readFileSync(join(SRC, 'components', 'ws', 'primitives.tsx'), 'utf8');
  const gly = readFileSync(join(SRC, 'components', 'glyphs.tsx'), 'utf8');
  assert.match(prim, /ICON_PATH/, 'primitives no longer sources PATH from icons.ts');
  assert.match(prim, /export const PATH|ICON_PATH as PATH/, 'PATH is no longer exported');
  assert.match(gly, /ICON_PATH as ICONS/, 'glyphs no longer re-exports ICONS from icons.ts');
});

test('the names the two sets used to share are present exactly once each', () => {
  const src = readFileSync(ICONS, 'utf8');
  for (const name of ['plus', 'settings', 'docs']) {
    const hits = [...src.matchAll(new RegExp(`^\\s{2}${name}:`, 'gm'))];
    assert.equal(hits.length, 1, `${name} is defined ${hits.length} times in icons.ts`);
  }
});

test('every path is real SVG path data', () => {
  const src = readFileSync(ICONS, 'utf8');
  const entries = [...src.matchAll(/^\s{2}([a-zA-Z][a-zA-Z0-9]*):\s*\n?\s*'([^']+)'/gm)];
  assert.ok(entries.length >= 30, `expected the merged set, found ${entries.length}`);
  for (const [, name, d] of entries) {
    assert.match(d, /^M/, `${name} does not start with a moveto`);
    assert.ok(!/[^MmLlHhVvCcSsQqTtAaZz0-9.,\-\s]/.test(d), `${name} has a non-path character`);
  }
});
