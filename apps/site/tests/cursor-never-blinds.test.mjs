/**
 * THE READER'S OWN POINTER IS NEVER HIDDEN.
 *
 * RESTATED 2026-09-22, WHEN THE CUSTOM CURSOR WAS REMOVED.
 *
 * This file used to guard components/Cursor.astro: a glowing ring that trailed the pointer and hid
 * the real one with `cursor: none`. Its property was "`cursor: none` is reachable ONLY under a class
 * the script adds after it has painted a frame", because a static `cursor: none` turns every
 * failure of the component that draws the replacement into a site where nobody can see what they
 * are aiming at. The owner's final direction removes the decoration outright ("no glowing cursor
 * rings"), so the component is gone.
 *
 * The danger it guarded is still the danger: a `cursor: none` anywhere, by anyone, blinds a reader.
 * With no replacement cursor on the site there is no legitimate place left for one at all, so the
 * property is now the strictest form of the old one — NO stylesheet and NO component style the site
 * ships hides the pointer, and no layout mounts a pointer-following overlay. The walk is derived
 * from the directory and asserted non-empty, as before, and the scanner is proven to fire on the
 * rule that used to ship.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const SITE = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(SITE, 'src');

/** Comments first: a scanner that reads prose finds the account of a defect before the defect. */
const strip = (css) => css.replace(/\/\*[\s\S]*?\*\//g, ' ');

function walk(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === 'dist') continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

/** Every piece of CSS the site ships: the sheets and every <style> in a component, layout or page. */
function sheets() {
  const out = [];
  for (const file of walk(SRC)) {
    if (file.endsWith('.css')) out.push({ file, css: strip(readFileSync(file, 'utf8')) });
    else if (file.endsWith('.astro')) {
      const body = readFileSync(file, 'utf8').replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '');
      for (const m of body.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)) out.push({ file, css: strip(m[1]) });
    }
  }
  return out;
}

/** `cursor: none` in any form, in any sheet. */
function hidesPointer(list) {
  const bad = [];
  for (const { file, css } of list) {
    for (const m of css.matchAll(/cursor\s*:\s*none\b/gi)) {
      const line = css.slice(0, m.index).split('\n').length;
      bad.push(`${relative(SITE, file)}:${line}`);
    }
  }
  return bad;
}

const SHEETS = sheets();

test('the harness found real sheets with real cursor rules, so nothing below is vacuous', () => {
  assert.ok(SHEETS.length >= 8, `only ${SHEETS.length} style sources under src — the walk has drifted`);
  const declared = SHEETS.reduce((n, s) => n + (s.css.match(/cursor\s*:/g) ?? []).length, 0);
  assert.ok(declared >= 5, `only ${declared} cursor declarations found — the scan is not reading the styles`);
});

test('NO STYLESHEET ON THIS SITE HIDES THE POINTER', () => {
  assert.deepEqual(hidesPointer(SHEETS), [],
    'a `cursor: none` is back. With no replacement cursor on the site, it can only blind a reader.');
});

test('no layout or page mounts a pointer-following overlay', () => {
  assert.ok(!existsSync(join(SRC, 'components', 'Cursor.astro')),
    'components/Cursor.astro is back — the owner removed the custom cursor ("no glowing cursor rings")');
  const pages = walk(SRC).filter((f) => f.endsWith('.astro')).map((f) => [relative(SITE, f), readFileSync(f, 'utf8')]);
  assert.ok(pages.length >= 20, `only ${pages.length} .astro files read — the walk has drifted`);
  const found = pages.filter(([, src]) => /import\s+Cursor\b|<Cursor\b|data-cursor(?:-label)?=|has-cursor/.test(src.replace(/\{\/\*[\s\S]*?\*\/\}|\/\*[\s\S]*?\*\/|\/\/.*$/gm, ' ')))
    .map(([f]) => f);
  assert.deepEqual(found, [], `these still wire a custom cursor: ${found.join(', ')}`);
});

test('the guard has teeth: it fires on the rule that shipped', () => {
  const shipped = [{ file: join(SRC, 'components', 'Cursor.astro'), css: ':root.has-cursor * { cursor: none !important; }' }];
  assert.equal(hidesPointer(shipped).length, 1, 'the scanner did not see the exact rule the old cursor shipped');
  assert.equal(hidesPointer([{ file: 'x.css', css: strip('/* cursor: none */ .btn { cursor: pointer; }') }]).length, 0,
    'the scanner fires on a comment or on an ordinary cursor rule, so it would be deleted rather than kept');
});
