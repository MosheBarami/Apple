/**
 * TEXT CONTRAST ON THE PUBLIC SITE, DERIVED FROM THE SHEET THAT ACTUALLY WINS.
 *
 * WHY THIS FILE EXISTS. apps/web/tests/contrast.test.mjs carried the site's contrast check, and it
 * read global.css and landing.css — while apple-minimal.css, imported after both, overrode every
 * colour token they declared. It passed 15/15 over a page with 39 measured AA failures: `.micro`
 * labels at 4.42:1 in dark and 3.86:1 in light, all spending a `--faint` it never looked at, because
 * its ink filter was `^(ink|muted|text)`. A check aimed at a sheet that loses the cascade measures
 * a page nobody sees.
 *
 * Since the 2026-09-22 redesign apple-minimal.css is the site's ONE token source, loaded first by
 * both layouts, and no other sheet declares a colour token (theme-on-every-route.test.mjs holds
 * that). So this reads that file, in both themes, and:
 *
 *   - derives the TEXT tokens from use, not from a list: every token any site stylesheet or
 *     component style spends in a `color:` declaration carries text somewhere;
 *   - derives the SURFACES from the sheet: every `--paper*` and `--surface*` step;
 *   - requires 4.5:1 for every text token on every surface — worst case, not typical case, because
 *     a token used for text on one surface today is used on another tomorrow;
 *   - requires 3:1 for the focus ring (--accent) on every surface — non-text contrast, WCAG 1.4.11;
 *   - requires the primary button's own pair to clear 4.5:1;
 *   - and requires the ink ramp to still descend, so the fix cannot collapse three tiers into one.
 *
 * Every derivation is asserted non-empty: a check that found no tokens reports a perfect page.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SITE = join(dirname(fileURLToPath(import.meta.url)), '..');
const strip = (css) => css.replace(/\/\*[\s\S]*?\*\//g, ' ');
const TOKENS = strip(readFileSync(join(SITE, 'src', 'styles', 'apple-minimal.css'), 'utf8'));

/** Relative luminance, WCAG 2.x. */
function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const f = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
const contrast = (a, b) => {
  const [x, y] = [luminance(a), luminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};

/** The declarations of one theme block, `--name: value`, resolving `var()` references. */
function theme(selector) {
  const m = selector.exec(TOKENS);
  assert.ok(m, `apple-minimal.css has no block for ${selector}`);
  const open = TOKENS.indexOf('{', m.index);
  const body = TOKENS.slice(open + 1, TOKENS.indexOf('}', open));
  const raw = Object.fromEntries([...body.matchAll(/--([a-z0-9-]+)\s*:\s*([^;]+);/gi)].map((d) => [d[1], d[2].trim()]));
  const resolve = (name, seen = new Set()) => {
    const v = raw[name];
    if (!v) return null;
    const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(v);
    if (hex) return '#' + (hex[1].length === 3 ? [...hex[1]].map((c) => c + c).join('') : hex[1]).toLowerCase();
    const ref = /^var\(--([a-z0-9-]+)\)$/i.exec(v);
    if (ref && !seen.has(ref[1])) return resolve(ref[1], new Set([...seen, name]));
    return null;                       // rgba() and friends are tints, not text colours
  };
  return { raw, resolve };
}

const THEMES = {
  dark: theme(/:root,\s*:root\[data-theme='dark'\]\s*\{/),
  light: theme(/:root\[data-theme='light'\]\s*\{/),
};

/** Every style source the site ships: the sheets and every <style> block. */
function styles() {
  const out = [];
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.css')) out.push(strip(readFileSync(p, 'utf8')));
      else if (e.name.endsWith('.astro')) {
        for (const m of readFileSync(p, 'utf8').matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)) out.push(strip(m[1]));
      }
    }
  };
  walk(join(SITE, 'src'));
  return out;
}

const STYLES = styles();
/** Tokens spent as a text colour: `color: var(--x)` — the `color` property, not `background-color`. */
const TEXT = [...new Set(STYLES.flatMap((css) => [...css.matchAll(/(?:^|[;{\s])color\s*:\s*var\(--([a-z0-9-]+)\)/g)].map((m) => m[1])))]
  .filter((n) => n !== 'on-primary')   // only ever on --primary; checked as its own pair below
  .sort();
const SURFACES = Object.keys(THEMES.dark.raw).filter((n) => /^(paper|surface)(-\d)?$/.test(n)).sort();

test('the derivations found real tokens, so nothing below is vacuous', () => {
  assert.ok(STYLES.length >= 8, `only ${STYLES.length} style sources read — the walk has drifted`);
  assert.ok(TEXT.length >= 5, `only ${TEXT.length} text tokens found (${TEXT.join(', ')}) — the use scan is blind`);
  for (const must of ['ink', 'muted', 'faint']) assert.ok(TEXT.includes(must), `--${must} is not spent as text anywhere; re-check the scan`);
  assert.ok(SURFACES.length >= 5, `only ${SURFACES.length} surfaces found (${SURFACES.join(', ')})`);
});

for (const [name, t] of Object.entries(THEMES)) {
  test(`${name}: every text token clears 4.5:1 on every surface`, () => {
    const bad = [];
    let pairs = 0;
    for (const ink of TEXT) {
      const fg = t.resolve(ink);
      assert.ok(fg, `${name}: --${ink} is spent as text but does not resolve to a solid colour`);
      for (const surface of SURFACES) {
        const bg = t.resolve(surface);
        assert.ok(bg, `${name}: --${surface} does not resolve to a solid colour`);
        const r = contrast(fg, bg);
        pairs += 1;
        if (r < 4.5) bad.push(`--${ink} ${fg} on --${surface} ${bg} is ${r.toFixed(2)}:1`);
      }
    }
    assert.ok(pairs >= 25, `only ${pairs} pairs measured`);
    assert.deepEqual(bad, [], `${name}: text below 4.5:1:\n  ${bad.join('\n  ')}`);
  });

  test(`${name}: the focus ring clears 3:1 on every surface, and the primary button reads`, () => {
    const ring = t.resolve('accent');
    assert.ok(ring, `${name}: --accent does not resolve`);
    for (const surface of SURFACES) {
      const r = contrast(ring, t.resolve(surface));
      assert.ok(r >= 3, `${name}: the focus ring --accent on --${surface} is ${r.toFixed(2)}:1, needs 3:1`);
    }
    const on = contrast(t.resolve('on-primary'), t.resolve('primary'));
    assert.ok(on >= 4.5, `${name}: --on-primary on --primary is ${on.toFixed(2)}:1`);
  });

  test(`${name}: the ink ramp still descends, so the fix did not collapse the tiers`, () => {
    const paper = t.resolve('paper');
    const [ink, muted, faint] = ['ink', 'muted', 'faint'].map((n) => contrast(t.resolve(n), paper));
    assert.ok(ink > muted && muted > faint,
      `${name}: ink ${ink.toFixed(2)} / muted ${muted.toFixed(2)} / faint ${faint.toFixed(2)} on --paper no longer descend`);
  });
}

test('the guard has teeth: the --faint that shipped fails it', () => {
  // #777777 was the site's dark --faint when this file was written: 4.42:1 on #0a0a0a.
  assert.ok(contrast('#777777', THEMES.dark.resolve('surface')) < 4.5);
  // #818791 is the app's light --faint: under 4.5:1 on the light raised surface.
  assert.ok(contrast('#818791', THEMES.light.resolve('surface-3')) < 4.5);
});
