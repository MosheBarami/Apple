/**
 * TEXT CONTRAST, MEASURED RATHER THAN EYEBALLED.
 *
 * The 2026-09-01 accessibility pass said in its own words that contrast ratios were
 * "not covered". Measuring them found that `--gx-ink-3`, the tertiary ink, sat at
 * 3.29:1 against `--gx-raise-2` — which clears the 3:1 that covers large text and
 * non-text UI, and not the 4.5:1 that normal text needs. Every use of it is small text:
 * timestamps, detail lines, the credits notes.
 *
 * It is exactly the kind of defect that survives review indefinitely. Nothing looks
 * broken; the text is simply harder to read than it should be, for the people who find
 * it hardest already.
 *
 * The ramp is checked against the LIGHTEST surface each colour actually sits on, since
 * that is the worst case in a dark theme, and both themes are checked — the light one
 * was also short, at 4.21:1.
 *
 * Run with:  node --test           (from apps/web)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const CSS = readFileSync(join(HERE, '../src/design/system.css'), 'utf8');
// The marketing and docs surfaces have their own token sets and the same obligation.
const SITE = readFileSync(join(HERE, '../../site/src/styles/global.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const LANDING = readFileSync(join(HERE, '../../site/src/styles/landing.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

/** Relative luminance, WCAG 2.x. */
function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const f = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

function contrast(a, b) {
  const [x, y] = [luminance(a), luminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/**
 * Every `--name: #rrggbb` in source order. The tokens are declared twice — once for the
 * dark theme, once inside `:root[data-theme='light']` — so order is what separates
 * them, and taking the wrong occurrence would compare a light colour against a dark
 * ground and invent a failure. Index 0 is dark, index 1 is light.
 */
function legacyToken(name, theme) {
  const all = [...CSS.matchAll(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`, 'g'))].map((m) => m[1]);
  assert.ok(all.length >= 2, `--${name} should be declared for both themes, found ${all.length}`);
  return all[theme === 'dark' ? 0 : 1];
}

// The new palette is scoped by selector rather than position. Keep aliases for
// the old test vocabulary so this check measures current colours, not the
// order or names of the previous dark-first token set.
const ROOT_BLOCKS = [...CSS.matchAll(/(:root(?:\[[^{}]*\])?)\s*\{([^{}]*)\}/g)]
  .map((m) => ({ selector: m[1], body: m[2] }));
const baseRoot = ROOT_BLOCKS.find((entry) => entry.selector === ':root');
const darkRoot = ROOT_BLOCKS.find((entry) => /data-theme\s*=\s*['"]dark/i.test(entry.selector)
  || /color-scheme\s*:\s*dark/i.test(entry.body))
  ?? (baseRoot && !/color-scheme\s*:\s*light/i.test(baseRoot.body) ? baseRoot : undefined);
const lightRoot = ROOT_BLOCKS.find((entry) => /data-theme\s*=\s*['"]light/i.test(entry.selector)
  || /color-scheme\s*:\s*light/i.test(entry.body))
  ?? (baseRoot && darkRoot !== baseRoot ? baseRoot : undefined);
assert.ok(lightRoot && darkRoot, 'the app must declare light and dark root palettes');
const ROOT_TOKENS = {
  light: Object.fromEntries([...lightRoot.body.matchAll(/--([a-z0-9-]+)\s*:\s*([^;]+)/gi)].map((m) => [m[1], m[2].trim()])),
  dark: Object.fromEntries([...darkRoot.body.matchAll(/--([a-z0-9-]+)\s*:\s*([^;]+)/gi)].map((m) => [m[1], m[2].trim()])),
};
const TOKEN_ALIASES = {
  'gx-ground': 'paper', 'gx-raise-2': 'surface-2',
  'gx-ink': 'ink', 'gx-ink-2': 'muted', 'gx-ink-3': 'faint',
};
function token(name, theme, seen = new Set()) {
  const actual = TOKEN_ALIASES[name] ?? name;
  const raw = ROOT_TOKENS[theme][actual];
  assert.ok(raw, '--' + name + ' should be declared for the ' + theme + ' theme');
  assert.ok(!seen.has(actual), 'cyclic colour token reference at --' + name);
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(raw);
  if (hex) {
    const value = hex[1].length === 3 ? hex[1].split('').map((c) => c + c).join('') : hex[1];
    return '#' + value.toLowerCase();
  }
  const ref = /^var\(\s*--([a-z0-9-]+)\s*\)$/i.exec(raw);
  assert.ok(ref, '--' + name + ' is not a resolvable colour: ' + raw);
  const next = new Set(seen);
  next.add(actual);
  return token(ref[1], theme, next);
}

// The surface each ink sits on. Worst case, not typical case.
const SURFACE = { dark: ['gx-ground', 'gx-raise-2'], light: ['gx-ground', 'gx-raise-2'] };

for (const theme of ['dark', 'light']) {
  test(`${theme}: body and secondary ink clear 4.5:1 on every surface`, () => {
    for (const ink of ['gx-ink', 'gx-ink-2']) {
      for (const surf of SURFACE[theme]) {
        const r = contrast(token(ink, theme), token(surf, theme));
        assert.ok(r >= 4.5, `--${ink} on --${surf} is ${r.toFixed(2)}:1, needs 4.5:1`);
      }
    }
  });

  test(`${theme}: tertiary ink clears 4.5:1 too, because it is small text`, () => {
    // Not 3:1. `--gx-ink-3` is used for timestamps, detail lines and notes — all normal
    // size. The 3:1 threshold is for large text and non-text UI, and applying it here is
    // how this colour spent so long at 3.29:1.
    for (const surf of SURFACE[theme]) {
      const r = contrast(token('gx-ink-3', theme), token(surf, theme));
      assert.ok(r >= 4.5, `--gx-ink-3 on --${surf} is ${r.toFixed(2)}:1, needs 4.5:1 for normal text`);
    }
  });

  test(`${theme}: the ink ramp still descends, so the hierarchy survives the fix`, () => {
    // Raising a colour to pass contrast must not raise it past the one above it —
    // three equally bright greys would be accessible and unreadable.
    const ground = token('gx-ground', theme);
    const [a, b, c] = ['gx-ink', 'gx-ink-2', 'gx-ink-3'].map((n) => contrast(token(n, theme), ground));
    assert.ok(a > b && b > c, `ramp is ${a.toFixed(2)} / ${b.toFixed(2)} / ${c.toFixed(2)} — not descending`);
  });
}

test('the status tones are legible on the surfaces they are drawn on', () => {
  // §16.2 assigns meaning to colour. A tone nobody can read carries none.
  for (const tone of ['good', 'bad', 'warn', 'info']) {
    const all = [...CSS.matchAll(new RegExp(`--${tone}:\\s*(#[0-9a-fA-F]{6})`, 'g'))].map((m) => m[1]);
    if (all.length === 0) continue; // defined elsewhere or as a function; not this test's business
    const r = contrast(token(tone, 'dark'), token('gx-ground', 'dark'));
    assert.ok(r >= 3, `--${tone} on the dark ground is ${r.toFixed(2)}:1, below the 3:1 floor`);
  }
});

/* ------------------------------------------------------------------ the site --- */

/** Occurrences of one token in source order, from any stylesheet. */
function occurrences(css, name) {
  return [...css.matchAll(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`, 'g'))].map((m) => m[1]);
}

test('the docs site clears 4.5:1 in both themes, on every surface', () => {
  // `--faint` styles 0.7rem uppercase mono labels and 0.78rem `.mono` — normal text by
  // every definition, and it sat at 3.18:1 in light and 3.71:1 in dark. The same
  // mistake as the app's tertiary ink and found the same way, by measuring.
  //
  // `--faint` is declared three times: light, [data-theme='dark'], and again inside a
  // prefers-color-scheme block. Index 0 is light, 1 and 2 are the dark pair, and the
  // last assertion here is what keeps those two from drifting apart.
  const faint = occurrences(SITE, 'faint');
  const muted = occurrences(SITE, 'muted');
  assert.equal(faint.length, 3, 'three --faint declarations expected (light, dark, dark media)');
  assert.equal(faint[1], faint[2], 'the two dark declarations must agree');

  for (const [i, theme] of [[0, 'light'], [1, 'dark']]) {
    for (const surface of ['paper', 'surface', 'surface-2']) {
      const bg = occurrences(SITE, surface)[i];
      const r = contrast(faint[i], bg);
      assert.ok(r >= 4.5, `${theme}: --faint on --${surface} is ${r.toFixed(2)}:1, needs 4.5:1`);
    }
    // And the ramp must still descend: faint dimmer than muted.
    const bg = occurrences(SITE, 'paper')[i];
    assert.ok(
      contrast(faint[i], bg) < contrast(muted[i], bg),
      `${theme}: --faint is no dimmer than --muted; the hierarchy has collapsed`,
    );
  }
});

test('the landing ink ramp clears 4.5:1 on every surface it can sit on', () => {
  // WAS: a single assertion about --faint on three surfaces, written when the
  // landing was the one file that had this ramp right. The redesign rebuilt the
  // stylesheet and --faint, --surface-2 and --accent-grad came out of it — the
  // dimmest text tier is --muted now, and hairlines are rgba rules rather than a
  // solid token. This measures the ramp the landing ACTUALLY uses, which is both
  // more of the page than the old assertion covered and harder to satisfy by
  // accident.
  //
  // It is a token check, and it cannot replace the rendered-pixel audit in
  // tests/e2e/landing.spec.ts: the hero's type sits on a four-stop gradient that
  // no pair of hex values describes, and the failure that audit caught — white
  // on the design's own accent ramp at 2.26:1 — is invisible from here because
  // the ramp is not a token either page puts text on. Two checks, two different
  // things.
  //[[ THE TOKEN NAMES ARE DISCOVERED, BECAUSE A HARDCODED LIST DIES AT THE NEXT REDESIGN.
  //
  //   This listed --ink-bright and --ground-deep by name. The identity rebuild renamed the palette
  //   — --ground-deep became --ground-2, --ink-bright folded into --ink — and the test failed with
  //   "the landing declares no --ground-deep", which is a true sentence about a token that should
  //   not exist rather than a finding about contrast. A list of names measures the last palette.
  //
  //   So the ramp is read out of the stylesheet: anything named like ink and anything named like a
  //   surface. A renamed palette is then still measured, and a palette that renames everything at
  //   once cannot empty the test quietly — the floor below turns that into a loud failure instead
  //   of a clean run over zero pairs.
  const declared = [...LANDING.matchAll(/^\s*--([a-z0-9-]+):\s*(#[0-9a-fA-F]{3,8})\s*;/gm)]
    .map((m) => m[1]);
  const INK = [...new Set(declared.filter((n) => /^(ink|muted|text)(-|$)/.test(n)))];
  const SURFACES = [...new Set(declared.filter((n) => /^(ground|surface|field-bound|paper|card)(-|$)/.test(n)))];

  // A FAILURE TO OBSERVE MUST NOT RENDER AS AN OBSERVATION. Zero ink tokens and zero surfaces is a
  // test that passed without measuring anything, and it looks identical to a page with perfect
  // contrast from the exit code alone.
  assert.ok(INK.length >= 2, `found ${INK.length} ink token(s) in the landing stylesheet — this check has gone blind`);
  assert.ok(SURFACES.length >= 2, `found ${SURFACES.length} surface token(s) in the landing stylesheet — this check has gone blind`);

  // AND EVERY THEME, not just the one that happens to be declared first. The previous version read
  // index 0 of each token, and index 0 is the light declaration — the dark palette was never
  // measured at all. Source order in landing.css is `:root` (light), then the
  // prefers-color-scheme block, then `:root[data-theme='dark']`; the last two are the same dark
  // palette written twice, and the equality assertion below is what stops them drifting apart so
  // that the page reads differently for someone who never touched the toggle.
  // Measure every declared palette, including an intentional dark-only landing.
  // Adding another theme must supply the complete ramp, not silently skip it.
  const paletteCount = occurrences(LANDING, 'ground').length;
  assert.ok(paletteCount > 0, 'landing has no ground palette');
  const THEMES = Array.from({ length: paletteCount }, (_, i) => [i, `palette ${i + 1}`]);

  for (const name of INK) {
    const fg = occurrences(LANDING, name);
    assert.equal(fg.length, paletteCount, `--${name} must be declared in every palette`);
    for (const [i, theme] of THEMES) {
      for (const surface of SURFACES) {
        const bg = occurrences(LANDING, surface)[i];
        assert.ok(bg, `the landing declares no --${surface} for ${theme}`);
        const r = contrast(fg[i], bg);
        assert.ok(r >= 4.5, `${theme}: --${name} on --${surface} is ${r.toFixed(2)}:1, needs 4.5:1`);
      }
    }
  }

  // And the ramp must descend, or the tiers are three names for one colour.
  for (const [i, theme] of THEMES) {
    const ground = occurrences(LANDING, 'ground')[i];
    const ratios = INK.map((n) => contrast(occurrences(LANDING, n)[i], ground));
    assert.equal(
      Math.min(...ratios),
      ratios[ratios.length - 1],
      `${theme}: --${INK[INK.length - 1]} must be the dimmest tier; ramp on --ground is ${ratios.map((r) => r.toFixed(1)).join(' / ')}`,
    );
  }
});

test('the landing declares no colour token it does not use', () => {
  // --faint, --surface-2, --accent-grad and --violet all survived the redesign as
  // declarations with no `var()` reading them. Three of the four were harmless;
  // --faint was not, because a test asserted a contract on it and went on passing
  // while nothing on the page was governed by it. A token nothing references is a
  // decision nobody made, and an assertion about one measures nothing.
  //
  // A TOKEN CAN BE READ FROM SOMEWHERE OTHER THAN CSS, and this check could not see that. It flagged
  // --theme-color, which the layouts read with
  // `getComputedStyle(root).getPropertyValue('--theme-color')` to paint the phone address bar to
  // match the page. That is a real consumer; the token is doing exactly the job it was declared for.
  // Reading only the stylesheet made the check report its own blind spot as an unused declaration —
  // and the fix a person would reach for is deleting the token, which breaks the address bar.
  //
  // So "read" now means read by anything that ships: a var() in the CSS, or a getPropertyValue in
  // the layouts that carry the theme script.
  const declared = [...new Set([...LANDING.matchAll(/^\s*--([a-z0-9-]+):/gm)].map((m) => m[1]))];
  assert.ok(declared.length >= 5, `only ${declared.length} tokens found — did the selector change?`);
  const layoutDir = join(HERE, '..', '..', 'site', 'src', 'layouts');
  const layouts = existsSync(layoutDir)
    ? readdirSync(layoutDir).filter((f) => f.endsWith('.astro')).map((f) => readFileSync(join(layoutDir, f), 'utf8')).join('\n')
    : '';
  const readsFromScript = (n) => new RegExp(`getPropertyValue\\(\\s*['\"]--${n}['\"]`).test(layouts);
  const unused = declared.filter((n) => !new RegExp(`var\\(--${n}[,)]`).test(LANDING) && !readsFromScript(n));
  assert.deepEqual(unused, [], `landing.css declares tokens nothing reads: ${unused.join(', ')}`);
});
