/**
 * WHAT IS DRAWN, MEASURED FROM THE SHEETS: two defects that survived the token swap because every
 * token was individually correct and the PAIR they made was not.
 *
 *   1. The two-step-verification QR code. The provider's image is black on transparent. Its ground
 *      was `--accent-ink`, the label ink that sits on the accent button: near-white while the accent
 *      was dark, near-black (#0c0816) once the accent became a light violet. Black on near-black
 *      (1.06:1) cannot be scanned, so a user could start two-step verification and never finish it.
 *   2. The projects page's primary button. Its hover was a mix of two tokens that had both become
 *      `--accent`, so hovering changed nothing.
 *
 * Each colour is resolved through the token file for the theme (var() chains, color-mix, rgba) and
 * measured as a pair, in both themes. A scanner needs far more than the 4.5:1 a reader does: a
 * phone camera binarises the image, so the bar here is 7:1 (WCAG AAA) for the QR.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { blend, colourOf, contrastRgb, expandVars, splitTop } from './css-tokens.mjs';
import { ROOT } from './tests/repo-walk.mjs';
import { appSheets, customProperties, declOf, flatRules, worldFor } from './tests/sheets.mjs';

const SHEETS = appSheets();
const PROPS = customProperties(SHEETS);
const RULES = flatRules(SHEETS);
const MODES = ['dark', 'light'];

/** A declaration's value as a colour in a theme, or throws saying which one could not be worked out. */
function colourIn(mode, value) {
  const text = expandVars(value, worldFor(mode, PROPS).lookup);
  const colour = text && colourOf(text);
  assert.ok(colour, `${mode}: "${value}" does not resolve to a colour`);
  return colour;
}

/* ------------------------------------------------------------------ 1. the QR code */

/** The provider's QR is black on transparent (settings.tsx says so where it draws the image). */
const QR_INK = [0, 0, 0];
const QR_BAR = 7;

test('the settings page still draws the provider QR with the class this sheet grounds', () => {
  const tsx = readFileSync(join(ROOT, 'apps/web/src/routes/settings.tsx'), 'utf8');
  assert.match(tsx, /<img className="mfa-qr" src=\{pending\.qrCode\}/, 'settings.tsx no longer draws the QR with className="mfa-qr"');
  assert.match(tsx, /black on transparent/, 'the claim this guard rests on (the QR is black on transparent) is no longer stated where the image is drawn');
});

for (const mode of MODES) {
  test(`${mode}: the QR ground is opaque and reads against black at ${QR_BAR}:1 or better`, () => {
    const grounds = RULES.filter((r) => splitTop(r.selector).some((s) => /\.mfa-qr$/.test(s))).map((r) => ({ r, bg: declOf(r.body, 'background') ?? declOf(r.body, 'background-color') })).filter((x) => x.bg);
    assert.ok(grounds.length >= 1, 'no rule gives .mfa-qr a background; the QR is drawn on whatever is behind it');
    for (const { r, bg } of grounds) {
      const ground = colourIn(mode, bg);
      assert.equal(ground[3], 1, `${r.file}: the QR ground "${bg}" is translucent, so it is whatever the theme puts behind it`);
      const ratio = contrastRgb(QR_INK, ground.slice(0, 3));
      assert.ok(ratio >= QR_BAR, `${mode}: the provider's black QR on "${bg}" is ${ratio.toFixed(2)}:1; a camera needs ${QR_BAR}:1`);
    }
  });
}

/* ------------------------------------------------------------------ 2. a primary button answers the pointer */

/** A selector part with its state pseudo-classes removed: the resting selector the hover rule modifies. */
const resting = (part) => part.replace(/:(hover|focus-visible|focus)\b/g, '').replace(/:not\((?::disabled|\[aria-disabled=['"]true['"]\])\)/g, '').replace(/\s+/g, ' ').trim();
const bgOf = (r) => declOf(r.body, 'background') ?? declOf(r.body, 'background-color');

/** A selector with every `:not(...)` group removed, so `:not(.btn-primary)` does not make a button primary. */
function withoutNot(sel) {
  let out = '';
  for (let i = 0; i < sel.length; i += 1) {
    if (sel.startsWith(':not(', i)) {
      let depth = 0;
      let j = i + 4;
      for (; j < sel.length; j += 1) { if (sel[j] === '(') depth += 1; else if (sel[j] === ')' && --depth === 0) break; }
      i = j;
    } else out += sel[i];
  }
  return out;
}

/** Every hover rule of a primary button that sets a background, with the resting rules it must differ from. */
function primaryHovers() {
  const out = [];
  for (const r of RULES) {
    for (const part of splitTop(r.selector)) {
      if (!/primary/.test(withoutNot(part)) || !/:hover/.test(part)) continue;
      const bg = bgOf(r);
      if (!bg) continue;
      const base = resting(part);
      const rests = RULES.filter((q) => splitTop(q.selector).some((p) => p.replace(/\s+/g, ' ').trim() === base) && bgOf(q) && !/:hover|:focus/.test(q.selector)).map((q) => ({ q, bg: bgOf(q) }));
      out.push({ r, part, bg, base, rests });
    }
  }
  return out;
}

test('the walk found the primary-button hover rules of both apps', () => {
  const hovers = primaryHovers();
  assert.ok(hovers.length >= 8, `only ${hovers.length} primary hover rules found; the match has drifted`);
  assert.ok(hovers.filter((h) => h.rests.length).length >= 6, 'too few hover rules could be paired with a resting rule; the pairing has drifted');
  assert.ok(hovers.some((h) => h.r.file.endsWith('routes/dashboard.css')), 'the projects page primary hover is not among them');
  assert.ok(hovers.some((h) => h.r.file.startsWith('apps/site/')), 'the site primary hover is not among them');
});

for (const mode of MODES) {
  test(`${mode}: a primary button's hover background differs from its resting background, in every rule that sets both`, () => {
    const same = [];
    let compared = 0;
    for (const h of primaryHovers()) {
      const hover = colourIn(mode, h.bg);
      for (const rest of h.rests) {
        compared += 1;
        const [a, b] = [hover, colourIn(mode, rest.bg)];
        // Equal once drawn over the same ground: the pair a viewer sees.
        const over = [10, 11, 13];
        const [pa, pb] = [blend(over, a), blend(over, b)];
        if (pa.every((c, i) => Math.abs(c - pb[i]) < 0.5)) same.push(`${h.r.file}: ${h.part}  hover "${h.bg}" is the resting "${rest.bg}" of ${rest.q.file}`);
      }
    }
    assert.ok(compared >= 6, `only ${compared} hover/rest pairs compared`);
    assert.deepEqual(same, [], `${mode}: hovering a primary button changes nothing:\n  ${same.join('\n  ')}`);
  });
}

test('the guard has teeth: a hover that mixes two tokens that are the same colour is reported as no change', () => {
  const tokens = { '--a': '#a67cff', '--b': '#a67cff', '--strong': '#bfa2ff' };
  const lookup = (n) => tokens[n];
  const colour = (v) => colourOf(expandVars(v, lookup));
  const differs = (hover, rest) => { const [x, y] = [colour(hover), colour(rest)]; return x.some((c, i) => Math.abs(c - y[i]) > 0.5); };
  assert.equal(differs('color-mix(in srgb, var(--a) 24%, var(--b))', 'var(--b)'), false, 'the shipped no-op hover was not seen as a no-op');
  assert.equal(differs('var(--strong)', 'var(--b)'), true, 'a real hover step was reported as a no-op');
});
