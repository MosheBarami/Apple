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
 * TAILWIND'S RING AND OUTLINE UTILITIES ARE READ TOO (section at the end of this file). The vendored shadcn
 * components draw focus as `focus-visible:ring-ring/50 focus-visible:ring-[3px]`: a ring at HALF of
 * `--color-ring`, which is itself the accent at 75%, so 37.5%, about 1.8:1. Their sheets do not name a focus
 * pseudo-class, so the first version of this file never saw them and called them "drawn with --color-ring, which
 * passes". Every focus utility that takes an opacity modifier is now found in the sources, resolved through the
 * theme, and measured; one that is under 3:1 must be corrected by a rule in a stylesheet (the files are
 * byte-pinned, so they are overridden, not edited) that this file measures like any other focus rule.
 * What a browser actually draws when a control is tabbed to is measured by rendered.test.mjs.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { AA, blend, colourOf, contrastRgb, expandVars, splitTop, stripScriptComments } from './css-tokens.mjs';
import { ROOT, readText, walkText } from './tests/repo-walk.mjs';
import { appSheets, customProperties, declOf, flatRules, focusDrawing, isFocusRule, worldFor } from './tests/sheets.mjs';

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
  // RE-BASED 2026-10-05 (M2 site fix cycle 1): 148 stylesheets are read now, not 150 or more, because the docs rewrite deleted the docs picks' components
  // (each carried a <style> block that counts as a sheet). A vacuity floor (a blind walk reads a handful), not a property: every focus ring drawn is still measured.
  assert.ok(SHEETS.length >= 120, `only ${SHEETS.length} stylesheets read; the walk has drifted`);
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
  // A correction of Tailwind's ring colour is read as a ring: half strength fails, the token itself passes.
  assert.equal(passes('--tw-ring-color: color-mix(in oklab, var(--color-ring) 50%, transparent);'), false, 'a half-strength --tw-ring-color was passed');
  assert.equal(passes('--tw-ring-color: var(--color-ring);'), true, 'the full --color-ring as --tw-ring-color was failed');
});

/* ------------------------------------------------------------------ Tailwind's ring and outline utilities */

const SOURCES = walkText(['apps/web/src', 'apps/site/src']).filter((f) => /\.(?:tsx|ts|jsx|astro)$/.test(f.rel));
/** The shadcn tokens the web sheet maps onto the app's own (`--color-ring`, `--color-destructive`...). */
const THEME_COLOURS = new Set([...readText({ path: join(ROOT, 'apps/web/src/styles/ai-elements.css') }).matchAll(/(?:^|[;{\s])--color-([a-z][a-z0-9-]*)\s*:/g)].map((m) => m[1]));

/** A class token split at its last colon outside brackets: its variants and its utility. */
function splitVariant(token) {
  let depth = 0;
  let at = -1;
  for (let i = 0; i < token.length; i += 1) {
    const c = token[i];
    if (c === '[' || c === '(') depth += 1;
    else if (c === ']' || c === ')') depth -= 1;
    else if (c === ':' && depth === 0) at = i;
  }
  return { variants: at < 0 ? '' : token.slice(0, at), utility: token.slice(at + 1) };
}

/** Every focus-variant `ring-<colour>/<n>` or `outline-<colour>/<n>` class in the sources: { token, variants, kind, name, pct, files }. */
function focusUtilities() {
  const found = new Map();
  for (const f of SOURCES) {
    for (const m of stripScriptComments(readText(f)).matchAll(/[^\s"'`]+/g)) {
      const { variants, utility } = splitVariant(m[0]);
      const u = /^(ring|outline)-([a-z][a-z0-9-]*)\/(\d{1,3})$/.exec(utility);
      if (!u || !/focus/.test(variants)) continue;
      if (!found.has(m[0])) found.set(m[0], { token: m[0], variants, kind: u[1], name: u[2], pct: Number(u[3]), files: new Set() });
      found.get(m[0]).files.add(f.rel);
    }
  }
  return [...found.values()];
}

/** The colour a utility draws: the theme colour at the utility's own opacity, as [r, g, b, a]. */
function utilityColour(u, lookup) {
  const text = expandVars(`var(--color-${u.name})`, lookup);
  const c = text && colourOf(text);
  return c ? [c[0], c[1], c[2], c[3] * (u.pct / 100)] : null;
}

/**
 * The one weak utility that is a HALO beside a border, not the indicator: the composer's input group takes
 * `border-ring` (--color-ring, measured above) on focus and a soft 3px ring around it. Exempt as the composer's
 * own soft ring is above: checked from both ends (the utility must still be weak, and its border must still be there).
 */
const HALO = {
  token: 'has-[[data-slot=input-group-control]:focus-visible]:ring-ring/50',
  file: 'apps/web/src/components/ui/input-group.tsx',
  carrier: /has-\[\[data-slot=input-group-control\]:focus-visible\]:border-ring/,
};

/** The rules that correct a utility: they name it by class (`[class*='focus-visible:ring-ring/']`) in a focus state. */
const correctionsOf = (u) => FOCUS_RULES.filter((r) => splitTop(r.selector).some((part) => (
  [...part.matchAll(/\[class\*='([^']+)'\]/g)].some((m) => u.token.includes(m[1])) && /:focus/.test(part.replace(/\[class\*='[^']*'\]/g, ''))
)));

test('Tailwind ring and outline utilities with an opacity modifier are found, resolved and measured', () => {
  const utilities = focusUtilities();
  assert.ok(THEME_COLOURS.has('ring') && THEME_COLOURS.has('destructive'), 'the @theme colours were not read from ai-elements.css');
  assert.ok(utilities.length >= 3, `only ${utilities.length} focus utilities with an opacity found; the scan is blind`);
  assert.ok(utilities.some((u) => u.token === 'focus-visible:ring-ring/50' && [...u.files].some((f) => f.endsWith('components/ui/button.tsx'))), 'the shadcn Button\'s focus-visible:ring-ring/50 was not found');
  for (const mode of MODES) {
    const { lookup, surfaces } = world(mode);
    const weak = [];
    for (const u of utilities) {
      const colour = utilityColour(u, lookup);
      assert.ok(colour, `${mode}: ${u.token} names --color-${u.name}, which does not resolve to a colour`);
      const worst = Math.min(...surfaces.map(([, bg]) => contrastRgb(blend(bg, colour), bg)));
      if (worst >= AA.ring) continue;
      weak.push({ u, worst });
    }
    assert.ok(weak.length >= 2, `${mode}: no weak utility was found; with the ring at 75% and the utility at 50% this scan should see at least two`);
    const unfixed = [];
    for (const { u, worst } of weak) {
      if (u.token === HALO.token) continue;
      const fixes = correctionsOf(u);
      const drawn = fixes.map((r) => focusDrawing(r, lookup)).filter((d) => d.rings.length);
      const strong = drawn.some((d) => strongest(d, surfaces).ratio >= AA.ring);
      if (!strong) unfixed.push(`${u.token} (${worst.toFixed(2)}:1; in ${[...u.files].join(', ')})`);
    }
    assert.deepEqual(unfixed, [], `${mode}: a Tailwind focus ring is under ${AA.ring}:1 and no rule corrects it. The vendored files are byte-pinned: add a rule such as [class*='focus-visible:ring-ring/']:focus-visible { --tw-ring-color: var(--color-ring); } outside every layer:\n  ${unfixed.join('\n  ')}`);
  }
});

test('the corrections are outside every layer, and the one halo is still weak and still has its border', () => {
  // A rule inside @layer loses to the utility it corrects only by order; outside every layer it wins whatever the specificity.
  const sheet = readText({ path: join(ROOT, 'apps/web/src/styles/ai-elements.css') });
  const top = [];
  let depth = 0;
  let head = '';
  for (const ch of sheet.replace(/\/\*[\s\S]*?\*\//g, ' ')) {
    if (ch === '{') { if (depth === 0) top.push(head.trim()); depth += 1; if (depth === 1) head = ''; else head += ch; continue; }
    if (ch === '}') { depth -= 1; continue; }
    if (depth === 0) head += ch;
  }
  const outside = top.filter((h) => /\[class\*='focus-visible:ring-/.test(h));
  assert.ok(outside.length >= 2, `only ${outside.length} ring corrections sit outside every layer; they are in a layer, or gone`);
  for (const mode of MODES) {
    const { lookup, surfaces } = world(mode);
    const u = { name: 'ring', pct: 50 };
    assert.ok(Math.min(...surfaces.map(([, bg]) => contrastRgb(blend(bg, utilityColour(u, lookup)), bg))) < AA.ring, `${mode}: the composer's halo ring now passes by itself; remove the exemption`);
  }
  assert.ok(focusUtilities().some((u) => u.token === HALO.token), 'the exempt halo utility is gone; delete the exemption');
  assert.match(readFileSync(join(ROOT, HALO.file), 'utf8'), HALO.carrier, `${HALO.file} no longer gives the input group a border-ring on focus`);
});

test('the default outline colour of the AI Elements scope is the ring token at full strength', () => {
  // Every browser-drawn focus outline inside the scope (`outline: auto`) takes this colour: Copy Code, Download file, the reasoning trigger.
  const rules = flatRules(SHEETS).filter((r) => r.file === 'apps/web/src/styles/ai-elements.css' && /\[data-slot\]/.test(r.selector) && /(?:^|[;\s])outline-color\s*:/.test(r.body));
  assert.ok(rules.length >= 1, 'the scope sets no default outline-color; the browser draws its own');
  for (const mode of MODES) {
    const { lookup, surfaces } = world(mode);
    for (const r of rules) {
      const colour = colourOf(expandVars(declOf(r.body, 'outline-color'), lookup) ?? '');
      assert.ok(colour, `${mode}: the scope's outline-color does not resolve to a colour`);
      for (const [name, bg] of surfaces) assert.ok(contrastRgb(blend(bg, colour), bg) >= AA.ring, `${mode}: the scope's default outline is ${contrastRgb(blend(bg, colour), bg).toFixed(2)}:1 on --${name} (needs ${AA.ring})`);
    }
  }
});
