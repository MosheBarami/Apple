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
 *     component style spends in a `color:` declaration carries text somewhere. A use sits on a FILL
 *     when the element's own rules (any state, any sheet) give it only opaque backgrounds that are
 *     not page surfaces (`--paper` on the docs folder's `--ink`, `--accent-ink` on the accent button):
 *     that use is measured against exactly those fills, found in the CSS. Every other use is measured
 *     on every surface. No token is exempt by name: a `color: var(--paper)` on a rule with no fill
 *     of its own is measured on the surfaces, where paper on paper is 1:1, and fails;
 *   - derives the SURFACES from the sheet: every `--paper*` and `--surface*` step;
 *   - requires 4.5:1 for every text token on every surface: worst case, not typical case, because
 *     a token used for text on one surface today is used on another tomorrow;
 *   - requires 3:1 for the focus ring (--accent) on every surface: non-text contrast, WCAG 1.4.11;
 *   - requires every fill use to clear 4.5:1 on each of its fills, in both themes (the accent button's
 *     --accent-ink on --accent and on its hover step --accent-strong, the folder's --paper on --ink and --ink-2);
 *   - and requires the ink ramp to still descend, so the fix cannot collapse three tiers into one.
 *
 * Every derivation is asserted non-empty: a check that found no tokens reports a perfect page.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { blend, colourOf, contrast, contrastRgb, expandVars, rgbOfHex, splitTop, surfacesOf, theme, themeBlocks } from '@studpilot/design/css-tokens';

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

/** Every rule of every site style source: { selector, body }. */
const rulesOf = (styleSources) => styleSources
  .flatMap((css) => [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ selector: m[1].split(';').pop().trim().replace(/\s+/g, ' '), body: m[2] })))
  .filter((r) => r.selector && !r.selector.startsWith('@'));
const declOf = (body, prop) => {
  const found = [...body.matchAll(new RegExp(`(?:^|[;\\s])${prop}\\s*:\\s*([^;}]+)`, 'g'))];
  return found.length ? found[found.length - 1][1].trim() : null;
};
/** A selector part without its states and structural pseudo-classes: the element it styles, in any state. */
const element = (part) => part
  .replace(/:not\((?:[^()]|\([^)]*\))*\)/g, '')
  .replace(/:(?:hover|focus-visible|focus|active|disabled|checked|nth-child\([^)]*\)|first-child|last-child|first-of-type|last-of-type)/g, '')
  .replace(/\s+/g, ' ').trim();
const SURFACE_TOKEN = /^var\(--(?:paper|surface)(?:-\d)?\)$/;

/**
 * Every spend of a token as text colour (`color: var(--x)`, the `color` property and not
 * `background-color`) as { token, part, grounds }, where `grounds` are the backgrounds the SAME
 * element is given by any rule that styles it, in any state, in any site sheet.
 */
function usesOf(rules) {
  const uses = [];
  for (const r of rules) {
    const m = /(?:^|[;\s])color\s*:\s*var\(--([a-z0-9-]+)\)/.exec(r.body);
    if (!m) continue;
    for (const part of splitTop(r.selector)) {
      const grounds = rules
        .filter((q) => splitTop(q.selector).some((p) => element(p) === element(part)))
        .map((q) => declOf(q.body, 'background') ?? declOf(q.body, 'background-color'))
        .filter((g) => g && g !== 'none' && g !== 'transparent');
      uses.push({ token: m[1], part, grounds: [...new Set(grounds)] });
    }
  }
  return uses;
}

/** Is the use drawn on a fill: it has grounds, and every one is an opaque colour that is not a page surface. */
function onFill(use, lookup) {
  if (use.grounds.length === 0) return false;
  return use.grounds.every((g) => {
    if (SURFACE_TOKEN.test(g)) return false;
    const text = expandVars(g, lookup);
    const c = text && colourOf(text);
    return Boolean(c) && c[3] === 1;
  });
}

const RULES = rulesOf(STYLES);
const USES = usesOf(RULES);
const lookupOf = (name) => { const raw = THEMES[name].raw; return (n) => raw[n.slice(2)]; };
/** The uses drawn on a fill are the same in both themes: a token's SPELLING decides, not its value. */
const FILL_USES = USES.filter((u) => onFill(u, lookupOf('dark')));
/** Tokens spent as text on the surfaces (every use that is not on a fill). */
const TEXT = [...new Set(USES.filter((u) => !FILL_USES.includes(u)).map((u) => u.token))].sort();
const SURFACES = Object.keys(THEMES.dark.raw).filter((n) => /^(paper|surface)(-\d)?$/.test(n)).sort();

/** The measured pair of one fill use: [{ token, ground, ratio }] in one theme, with a note for a translucent fill. */
function fillPairs(uses, mode) {
  const t = THEMES[mode];
  const lookup = lookupOf(mode);
  const out = [];
  for (const u of uses) {
    const fg = t.resolve(u.token);
    for (const g of u.grounds) {
      const c = colourOf(expandVars(g, lookup));
      out.push({ use: u, ground: g, ratio: fg && c && c[3] === 1 ? contrastRgb(rgbOfHex(fg), c.slice(0, 3)) : null });
    }
  }
  return out;
}

/** Every `::selection` rule of the site: selected text is drawn on a translucent background over whatever surface it sits on. */
const SELECTION = RULES.filter((r) => splitTop(r.selector).some((p) => /::(?:-moz-)?selection/.test(p)));

/** The ratios of one selection rule's text on its background over each surface: [{ surface, ratio }], or { missing } when it sets no pair. */
function selectionRatios(rule, mode) {
  const t = THEMES[mode];
  const lookup = lookupOf(mode);
  const bg = declOf(rule.body, 'background') ?? declOf(rule.body, 'background-color');
  const fg = declOf(rule.body, 'color');
  if (!bg || !fg) return { missing: `${rule.selector} sets ${bg ? '' : 'no background'}${!bg && !fg ? ' and ' : ''}${fg ? '' : 'no colour'}` };
  const [bgC, fgC] = [bg, fg].map((v) => { const text = expandVars(v, lookup); return text && colourOf(text); });
  if (!bgC || !fgC) return { missing: `${rule.selector}: "${bg}" or "${fg}" does not resolve to a colour` };
  return SURFACES.map((surface) => {
    const under = rgbOfHex(t.resolve(surface));
    const painted = blend(under, bgC);
    return { surface, ratio: contrastRgb(blend(painted, fgC), painted) };
  });
}

test('the derivations found real tokens, so nothing below is vacuous', () => {
  assert.ok(STYLES.length >= 8, `only ${STYLES.length} style sources read — the walk has drifted`);
  // 4, not 5: --autonomous-ink left with the landing's Autonomous toggle (V3 gate G01, no mode surface).
  assert.ok(TEXT.length >= 4, `only ${TEXT.length} text tokens found (${TEXT.join(', ')}) — the use scan is blind`);
  for (const must of ['ink', 'muted', 'faint']) assert.ok(TEXT.includes(must), `--${must} is not spent as text anywhere; re-check the scan`);
  assert.ok(SURFACES.length >= 5, `only ${SURFACES.length} surfaces found (${SURFACES.join(', ')})`);
  assert.ok(RULES.length > 500, `only ${RULES.length} rules read — the rule parse is blind`);
  // The fills are FOUND in the CSS, not listed: the folder's paper on ink and ink-2, the accent button.
  assert.ok(FILL_USES.length >= 4, `only ${FILL_USES.length} uses of text on a fill were found`);
  const fillTokens = new Set(FILL_USES.map((u) => u.token));
  const grounds = new Set(FILL_USES.flatMap((u) => u.grounds));
  for (const must of ['paper', 'accent-ink']) assert.ok(fillTokens.has(must), `--${must} is not found as text on a fill; the fill scan is blind`);
  for (const must of ['var(--ink)', 'var(--ink-2)', 'var(--accent)', 'var(--accent-strong)']) assert.ok(grounds.has(must), `${must} is not found as a ground of a fill use`);
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
  });

  test(`${name}: every use of text on a fill clears 4.5:1 on every fill the CSS gives that element`, () => {
    const pairs = fillPairs(FILL_USES, name);
    const bad = pairs.filter((p) => p.ratio === null || p.ratio < 4.5).map((p) => `--${p.use.token} on ${p.ground} (${p.use.part}): ${p.ratio === null ? 'not an opaque colour' : p.ratio.toFixed(2) + ':1'}`);
    assert.ok(pairs.length >= 5, `only ${pairs.length} text/fill pairs measured`);
    assert.deepEqual(bad, [], `${name}: text on a fill below 4.5:1:\n  ${bad.join('\n  ')}`);
  });

  test(`${name}: selected text clears 4.5:1 on its selection background over every surface`, () => {
    assert.ok(SELECTION.length >= 1, 'the site has no ::selection rule; the scan is blind or the highlight is the browser\'s own');
    const bad = [];
    for (const rule of SELECTION) {
      const r = selectionRatios(rule, name);
      if (r.missing) { bad.push(r.missing); continue; }
      for (const { surface, ratio } of r) if (ratio < 4.5) bad.push(`${rule.selector} { ${rule.body.trim().replace(/\s+/g, ' ')} } is ${ratio.toFixed(2)}:1 over --${surface}`);
    }
    assert.deepEqual(bad, [], `${name}: selected text below 4.5:1:\n  ${bad.join('\n  ')}`);
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

test('the guard has teeth: no token is exempt by name, a text colour with no fill of its own is measured on the surfaces, and a failing fill is reported', () => {
  const rules = rulesOf([[
    '.free { color: var(--paper); }',
    '.on-surface { color: var(--paper); background: var(--surface); }',
    '.ok { color: var(--paper); background: var(--ink); }',
    '.bad { color: var(--ink); background: var(--accent); }',
    '.wash { color: var(--ink); background: color-mix(in srgb, var(--accent) 12%, transparent); }',
    '.multi { color: var(--accent-ink); background: var(--accent); }',
    '.multi:hover { background: var(--accent-strong); }',
  ].join('\n')]);
  const uses = usesOf(rules);
  const dark = lookupOf('dark');
  assert.deepEqual(Object.fromEntries(uses.map((u) => [u.part, onFill(u, dark)])), {
    '.free': false, '.on-surface': false, '.ok': true, '.bad': true, '.wash': false, '.multi': true,
  }, 'the fill classification drifted');
  assert.deepEqual(uses.find((u) => u.part === '.multi').grounds.sort(), ['var(--accent)', 'var(--accent-strong)'], 'the hover state of an element is not one of its grounds');
  // --paper with no fill of its own lands in the surface measurement, where it is the colour of the page.
  const worst = Math.min(...Object.values(surfacesOf(THEMES.dark)).map((s) => contrast(THEMES.dark.resolve('paper'), s)));
  assert.ok(worst < 4.5, `--paper on the surfaces is ${worst.toFixed(2)}:1; a free use of it would pass`);
  assert.ok(uses.filter((u) => !onFill(u, dark)).some((u) => u.token === 'paper'), 'a free use of --paper did not reach the surface measurement');
  // A fill that fails is reported: ink on the accent is 2.6:1 in dark.
  const bad = fillPairs(uses.filter((u) => u.part === '.bad'), 'dark');
  assert.equal(bad.length, 1);
  assert.ok(bad[0].ratio < 4.5, `the fixture is not a failing fill (${bad[0].ratio})`);
});

test('the guard has teeth: the selection that shipped fails in dark, and a selection with no colour is reported', () => {
  // The rule as it was written: the focus ring's token (the accent at 75%) behind --ink. 4.03:1 over --surface-3 in dark.
  const shipped = rulesOf(['::selection { background: var(--accent-ring); color: var(--ink); }'])[0];
  const dark = selectionRatios(shipped, 'dark');
  assert.ok(Math.min(...dark.map((d) => d.ratio)) < 4.5, `the shipped selection is no longer under 4.5:1 in dark (${Math.min(...dark.map((d) => d.ratio)).toFixed(2)}); the fixture has drifted`);
  assert.ok(Math.min(...selectionRatios(shipped, 'light').map((d) => d.ratio)) >= 4.5, 'the shipped selection was already readable in light; the fixture has drifted');
  const fixed = rulesOf(['::selection { background: color-mix(in srgb, var(--accent) 45%, transparent); color: var(--ink); }'])[0];
  for (const mode of Object.keys(THEMES)) assert.ok(Math.min(...selectionRatios(fixed, mode).map((d) => d.ratio)) >= 4.5, `${mode}: a 45% accent selection behind --ink was failed`);
  assert.ok(selectionRatios(rulesOf(['::selection { background: var(--accent-ring); }'])[0], 'dark').missing, 'a selection with no colour was not reported');
  assert.ok(selectionRatios(rulesOf(['::selection { color: var(--ink); }'])[0], 'dark').missing, 'a selection with no background was not reported');
});
