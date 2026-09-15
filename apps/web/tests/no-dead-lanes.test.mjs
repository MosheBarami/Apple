/**
 * THE THREE-LANE WORKSPACE WAS REMOVED. ITS STYLESHEET WAS NOT.
 *
 * routes/workspace.tsx opens with "One lane, not three": the work surface and the context rail
 * stopped being permanent columns and became inline output and drawers. What stayed behind was
 * the whole grid that laid the three lanes out — .ws-body with its has-surface / has-rail
 * permutations, .ws-lane, and a tablet block giving .ws-mobile-tabs a tablist to switch between
 * lanes that no longer exist. Nothing in apps/web has rendered any of those class names since.
 *
 * Dead CSS is not free. It is read as evidence: the next person to look for "how does the
 * workspace do tabs" finds a complete, plausible implementation and builds on a layout that was
 * deleted. This repository has shipped a control wired to nothing before, and a stylesheet for a
 * screen that does not exist is the same defect with the wiring taken out.
 *
 * Asserted in both directions so the deletion cannot creep half-way back: no rule defines these
 * names, and no component renders them.
 *
 * Run with:  node --test apps/web/tests/
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '../src');

/** Every source file under src, by extension. */
function walk(dir, exts, out = []) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walk(p, exts, out);
    else if (exts.some((e) => entry.endsWith(e))) out.push(p);
  }
  return out;
}

const GONE = ['ws-body', 'ws-lane', 'ws-mobile-tabs', 'ws-mobile-tab'];

test('no stylesheet still lays out the three lanes', () => {
  const offenders = [];
  for (const file of walk(SRC, ['.css'])) {
    const css = readFileSync(file, 'utf8');
    for (const name of GONE) {
      if (css.includes(`.${name}`)) offenders.push(`${file.slice(SRC.length + 1)} → .${name}`);
    }
  }
  assert.deepEqual(offenders, [], `dead rules for a layout that was removed: ${offenders.join(', ')}`);
});

test('and nothing renders them, which is what made them dead', () => {
  // The other direction. If a component ever starts using one of these names the assertion above
  // is the wrong one to keep — this one fails first and says so.
  const offenders = [];
  for (const file of walk(SRC, ['.tsx', '.ts'])) {
    const src = readFileSync(file, 'utf8');
    for (const name of GONE) {
      if (src.includes(name)) offenders.push(`${file.slice(SRC.length + 1)} → ${name}`);
    }
  }
  assert.deepEqual(offenders, [], `these names are back in the markup: ${offenders.join(', ')}`);
});

test('the workspace still says it is one lane, so the rules above stay deleted', () => {
  const ws = readFileSync(join(SRC, 'routes', 'workspace.tsx'), 'utf8');
  assert.match(ws, /One lane, not three/, 'if this changes, the layout decision changed with it');
});
