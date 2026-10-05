/**
 * TEXT CONTRAST ON THE PUBLIC SITE, DERIVED FROM THE SHEET THAT ACTUALLY WINS.
 *
 * WHY THIS FILE EXISTS. apps/web/tests/contrast.test.mjs once carried the site's contrast check and
 * read global.css and landing.css, while another sheet imported after both overrode every colour
 * token they declared. It passed 15/15 over a page with 39 measured AA failures: `.micro` labels at
 * 4.42:1 in dark and 3.86:1 in light, all spending a `--faint` it never looked at, because its ink
 * filter was `^(ink|muted|text)`. A check aimed at a sheet that loses the cascade measures a page
 * nobody sees.
 *
 * Since M2 the site's ONE token source is packages/design/src/web/tokens.css, imported first by both
 * layouts, and no other sheet declares a colour token (theme-on-every-route.test.mjs holds that). So
 * this reads that file, in both themes, and:
 *
 *   - derives the TEXT tokens from use, not from a list: every token any site stylesheet or
 *     component style spends in a `color:` declaration carries text somewhere;
 *   - derives the SURFACES from the sheet: every `--paper*` and `--surface*` step;
 *   - requires 4.5:1 for every text token on every surface: worst case, not typical case, because
 *     a token used for text on one surface today is used on another tomorrow;
 *   - requires 3:1 for the focus ring (--accent) on every surface: non-text contrast, WCAG 1.4.11;
 *   - requires the accent button's own pair (--accent-ink on --accent, and on its hover step
 *     --accent-strong) to clear 4.5:1;
 *   - and requires the ink ramp to still descend, so the fix cannot collapse three tiers into one.
 *
 * Every derivation is asserted non-empty: a check that found no tokens reports a perfect page.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { contrast, theme, themeBlocks } from '@studpilot/design/css-tokens';

const SITE = join(dirname(fileURLToPath(import.meta.url)), '..');
const strip = (css) => css.replace(/\/\*[\s\S]*?\*\//g, ' ');

const BLOCKS = themeBlocks();
const THEMES = {
  dark: theme(BLOCKS.dark),
  light: theme(BLOCKS.light),
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
  // Spent only ON a fill: --accent-ink on the accent, --paper on the inverse --ink fill of the docs
  // folder. Each is checked as its own pair below, not against surfaces it is never drawn on.
  .filter((n) => n !== 'accent-ink' && n !== 'paper')
  .sort();
const SURFACES = Object.keys(THEMES.dark.raw).filter((n) => /^(paper|surface)(-\d)?$/.test(n)).sort();

test('the derivations found real tokens, so nothing below is vacuous', () => {
  assert.ok(STYLES.length >= 8, `only ${STYLES.length} style sources read — the walk has drifted`);
  // 4, not 5: --autonomous-ink left with the landing's Autonomous toggle (V3 gate G01, no mode surface).
  assert.ok(TEXT.length >= 4, `only ${TEXT.length} text tokens found (${TEXT.join(', ')}) — the use scan is blind`);
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
    assert.ok(pairs >= 20, `only ${pairs} pairs measured`);
    assert.deepEqual(bad, [], `${name}: text below 4.5:1:\n  ${bad.join('\n  ')}`);
  });

  test(`${name}: the focus ring clears 3:1 on every surface, and the accent button reads`, () => {
    const ring = t.resolve('accent');
    assert.ok(ring, `${name}: --accent does not resolve`);
    for (const surface of SURFACES) {
      const r = contrast(ring, t.resolve(surface));
      assert.ok(r >= 3, `${name}: the focus ring --accent on --${surface} is ${r.toFixed(2)}:1, needs 3:1`);
    }
    // The accent is the one primary fill on both apps: its label, at rest and on hover.
    for (const fill of ['accent', 'accent-strong']) {
      const on = contrast(t.resolve('accent-ink'), t.resolve(fill));
      assert.ok(on >= 4.5, `${name}: --accent-ink on --${fill} is ${on.toFixed(2)}:1, needs 4.5:1`);
    }
    // And the inverse fills: the page colour drawn as text on --ink and --ink-2 (the docs folder).
    for (const fill of ['ink', 'ink-2']) {
      const on = contrast(t.resolve('paper'), t.resolve(fill));
      assert.ok(on >= 4.5, `${name}: --paper on --${fill} is ${on.toFixed(2)}:1, needs 4.5:1`);
    }
  });

  test(`${name}: the accent is legible as text on every surface, because links and active labels spend it`, () => {
    for (const surface of SURFACES) {
      const r = contrast(t.resolve('accent'), t.resolve(surface));
      assert.ok(r >= 4.5, `${name}: --accent as text on --${surface} is ${r.toFixed(2)}:1, needs 4.5:1`);
    }
  });

  test(`${name}: the ink ramp still descends, so the fix did not collapse the tiers`, () => {
    const paper = t.resolve('paper');
    const [ink, muted, faint] = ['ink', 'muted', 'faint'].map((n) => contrast(t.resolve(n), paper));
    assert.ok(ink > muted && muted > faint,
      `${name}: ink ${ink.toFixed(2)} / muted ${muted.toFixed(2)} / faint ${faint.toFixed(2)} on --paper no longer descend`);
  });
}

test('the guard has teeth: the --faint that shipped fails it', () => {
  // #777777 was the site's dark --faint when this file was written: 4.42:1 on its then --surface.
  assert.ok(contrast('#777777', THEMES.dark.resolve('surface')) < 4.5);
  // #818791 is the app's light --faint: under 4.5:1 on the light raised surface.
  assert.ok(contrast('#818791', THEMES.light.resolve('surface-3')) < 4.5);
});
