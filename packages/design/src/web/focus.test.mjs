/**
 * FOCUS RINGS: measured as drawn, not as a token.
 *
 * The design file used to be held to "the focus ring clears 3:1" by measuring the SOLID accent,
 * which is the same number as the accent's text contrast (so the check could never fail on its own),
 * while the apps drew their rings with `--accent-ring`, the accent at 45% alpha: about 2.1:1 on the
 * surfaces it sits on, in both themes. This file measures what the stylesheets draw.
 *
 * WHAT IS MEASURED. Every rule of both apps whose selector names a focus pseudo-class
 * (:focus, :focus-visible, :focus-within, also inside :has()) and that draws a ring: an `outline`
 * or `outline-color`, or a ring-shaped `box-shadow` layer (`0 0 0 3px X`, `inset 0 0 0 1px X`).
 * Each colour is resolved through the token file for the theme (var() chains, color-mix, rgba),
 * composited over each of the five surfaces the apps draw on, and compared with that surface.
 * A rule passes when its strongest indicator (a ring, or the border colour it sets) reaches 3:1
 * on every surface, in both themes (WCAG 2.2 non-text contrast, 1.4.11).
 *
 * Not measured here: the Tailwind utility classes of the vendored shadcn components, which are
 * byte-pinned. They draw with `--color-ring`, which is asserted below to be the passing ring token.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { AA, blend, colourOf, contrastRgb, expandVars } from './css-tokens.mjs';
import { ROOT } from './tests/repo-walk.mjs';
import { appSheets, customProperties, flatRules, focusDrawing, isFocusRule, worldFor } from './tests/sheets.mjs';

const SHEETS = appSheets();
const PROPS = customProperties(SHEETS);
const FOCUS_RULES = flatRules(SHEETS).filter(isFocusRule);
const MODES = ['dark', 'light'];
const world = (mode) => worldFor(mode, PROPS);

/** The worst, over the surfaces, of the best indicator of one drawn rule: { ratio, surface }. */
function strongest(drawing, surfaces) {
  const indicators = [...drawing.rings, ...(drawing.border ? [drawing.border] : [])];
  let worst = { ratio: Infinity, surface: null };
  for (const [name, bg] of surfaces) {
    const best = Math.max(...indicators.map((i) => contrastRgb(blend(bg, i.colour), bg)));
    if (best < worst.ratio) worst = { ratio: best, surface: name };
  }
  return worst;
}

/**
 * The one rule whose own indicator is deliberately a wash: the composer card's "soft ring of the
 * accent spreads around the card" (an owner pick, composer-fx.css). The card's real indicator is
 * Tailwind's `border-ring` from the input group, which the second test below proves is in place and
 * passes. The exemption is checked from both ends: it must still be needed, and its proof must hold.
 */
const WASH = {
  file: 'apps/web/src/components/picks/composer/composer-fx.css',
  selector: "[data-slot='input-group']:focus-within",
  proofFile: 'apps/web/src/components/ui/input-group.tsx',
  proof: /has-\[\[data-slot=input-group-control\]:focus-visible\]:border-ring/,
};
const isWash = (r) => r.file === WASH.file && r.selector.endsWith(WASH.selector);

test('the walk found both apps and the rings they draw', () => {
  assert.ok(SHEETS.length >= 150, `only ${SHEETS.length} stylesheets read; the walk has drifted`);
  assert.ok(FOCUS_RULES.length >= 100, `only ${FOCUS_RULES.length} focus rules found; the selector match has drifted`);
  for (const mode of MODES) {
    const { lookup } = world(mode);
    const drawn = FOCUS_RULES.map((r) => focusDrawing(r, lookup)).filter((d) => d.rings.length);
    assert.ok(drawn.length >= 40, `${mode}: only ${drawn.length} focus rules draw a ring; the parse has drifted`);
    assert.ok(FOCUS_RULES.some((r) => r.file.startsWith('apps/site/')) && FOCUS_RULES.some((r) => r.file.startsWith('apps/web/')), 'one app is missing from the focus rules');
  }
});

for (const mode of MODES) {
  test(`${mode}: every focus ring either app draws reaches 3:1 on every surface`, () => {
    const { lookup, surfaces } = world(mode);
    const failures = [];
    const unresolved = [];
    let measured = 0;
    for (const rule of FOCUS_RULES) {
      const drawing = focusDrawing(rule, lookup);
      for (const u of drawing.unresolved) unresolved.push(`${rule.file}: ${rule.selector.slice(0, 80)} { ${u.prop}: ${u.text} }`);
      if (!drawing.rings.length || isWash(rule)) continue;
      measured += 1;
      const { ratio, surface } = strongest(drawing, surfaces);
      if (ratio < AA.ring) {
        const what = [...drawing.rings, ...(drawing.border ? [drawing.border] : [])].map((i) => `${i.prop}: ${i.text}`).join('; ');
        failures.push(`${ratio.toFixed(2)}:1 on --${surface}   ${rule.file}\n      ${rule.selector.slice(0, 100)}\n      ${what.slice(0, 140)}`);
      }
    }
    assert.ok(measured >= 40, `only ${measured} rings measured`);
    assert.deepEqual(unresolved, [], 'a focus declaration draws a colour this check could not work out; make it a token or teach the resolver');
    assert.deepEqual(failures, [], `${mode}: a focus ring is under ${AA.ring}:1 (use var(--accent), or --accent-ring which is measured to pass):\n  ${failures.join('\n  ')}`);
  });
}

test('the exempt composer ring is still a wash that needs its proof, and the proof holds in both themes', () => {
  const rule = FOCUS_RULES.find(isWash);
  assert.ok(rule, `${WASH.file} no longer has ${WASH.selector}; delete the exemption`);
  for (const mode of MODES) {
    const { lookup, surfaces } = world(mode);
    // Still needed: on its own it is far under 3:1 (about 1.2:1). When it passes, the exemption must go.
    assert.ok(strongest(focusDrawing(rule, lookup), surfaces).ratio < AA.ring, `${mode}: the composer's soft ring now passes by itself; remove the exemption`);
    // The proof: what actually carries the composer's focus is Tailwind's border-ring, i.e. --color-ring.
    const ring = colourOf(expandVars('var(--color-ring)', lookup) ?? '');
    assert.ok(ring, `${mode}: --color-ring does not resolve to a colour`);
    for (const [name, bg] of surfaces) {
      assert.ok(contrastRgb(blend(bg, ring), bg) >= AA.ring, `${mode}: --color-ring is under ${AA.ring}:1 on --${name}; the composer's focus border would be too`);
    }
  }
  assert.match(readFileSync(join(ROOT, WASH.proofFile), 'utf8'), WASH.proof, `${WASH.proofFile} no longer gives the composer card a border-ring on focus`);
});

test('the guard has teeth: it reads the shapes that shipped, fails the weak ones and passes the strong ones', () => {
  const { lookup, surfaces } = world('dark');
  const draw = (body) => focusDrawing({ file: 'x.css', selector: 'a:focus-visible', body }, lookup);
  const passes = (body) => { const d = draw(body); return d.rings.length > 0 && strongest(d, surfaces).ratio >= AA.ring; };
  // The two outlines the review found, as they were written: the accent at 45% alpha.
  const weak = (alpha) => `outline: 2px solid color-mix(in srgb, var(--accent) ${alpha}%, transparent);`;
  assert.equal(passes(weak(45)), false, 'a 45% accent outline (about 2.1:1) was not failed');
  assert.equal(passes(weak(75)), true, 'a 75% accent outline was not passed');
  assert.equal(passes('outline: 2px solid var(--accent); outline-offset: 4px;'), true, 'the solid accent outline was not passed');
  assert.equal(passes('outline: 2px solid var(--nm-ink,var(--ink));'), true, 'an ink outline with a fallback was not resolved');
  // The halo is a wash: alone it is not a focus indicator, beside a real one it is a supplement.
  assert.equal(passes('box-shadow: var(--halo);'), false, 'the halo alone was passed as a focus indicator');
  assert.equal(passes('outline: 2px solid var(--accent); box-shadow: var(--halo);'), true, 'the halo beside an accent outline was failed');
  // The border carries the focus when the shadow is a wash: the composer and the sign-in fields.
  assert.equal(passes('border-color: var(--accent-ring); box-shadow: var(--halo);'), true, 'a ring border beside the halo was failed');
  assert.equal(passes('border-color: color-mix(in srgb, var(--accent) 45%, transparent); box-shadow: var(--halo);'), false, 'a 45% border beside the halo was passed');
  // A shadow ring and an inset one are rings; a glow and a drop shadow are not.
  assert.equal(draw('box-shadow: inset 0 0 0 1px var(--accent-ring);').rings.length, 1, 'an inset 1px ring was not read');
  assert.equal(draw('box-shadow: 0 0 12px var(--accent-wash);').rings.length, 0, 'a glow was read as a ring');
  assert.equal(draw('box-shadow: 0 12px 30px rgba(0,0,0,.12);').rings.length, 0, 'a drop shadow was read as a ring');
  assert.equal(draw('outline: none; box-shadow: none;').rings.length, 0, 'a removed ring was read as a ring');
  // Something this check cannot work out is reported, never passed.
  assert.equal(draw('outline: 2px solid;').unresolved.length, 1, 'an outline with no colour (currentColor) was not reported as unresolved');
  assert.equal(draw('outline: 2px solid var(--no-such-token);').unresolved.length, 1, 'an undefined token was not reported as unresolved');
});
