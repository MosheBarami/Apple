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
import { contrast, readTokensCss, theme, themeBlocks } from '@studpilot/design/css-tokens';

const HERE = dirname(fileURLToPath(import.meta.url));
// RESTATED 2026-10-05 (M2 step 2.1): the palette of the app AND of the marketing site is one file,
// packages/design/src/web/tokens.css, so every section below reads that file in both themes. The
// token NAMES differ from the app's earlier sheets (a `--gx-ink` ladder, then `--ink`), which is why
// TOKEN_ALIASES below keeps the old test vocabulary pointing at the current names.
const CSS = readTokensCss();
// The marketing and docs surfaces have the same obligation and, since M2, the same file.
const SITE = CSS;
const LANDING = CSS;
const BLOCKS = themeBlocks(CSS);
const THEME = { dark: theme(BLOCKS.dark), light: theme(BLOCKS.light) };
const ROOT_TOKENS = { dark: THEME.dark.raw, light: THEME.light.raw };
const TOKEN_ALIASES = {
  'gx-ground': 'paper', 'gx-raise-2': 'surface-2',
  'gx-ink': 'ink', 'gx-ink-2': 'muted', 'gx-ink-3': 'faint',
};
function token(name, themeName) {
  const actual = TOKEN_ALIASES[name] ?? name;
  assert.ok(ROOT_TOKENS[themeName][actual], '--' + name + ' should be declared for the ' + themeName + ' theme');
  const hex = THEME[themeName].resolve(actual);
  assert.ok(hex, '--' + name + ' is not a resolvable colour: ' + ROOT_TOKENS[themeName][actual]);
  return hex;
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

/* ------------------------------------------------- the non-workspace surfaces --- */

/**
 * The auth, shelf, usage and settings pages carry their OWN token set — `--nm-*` — in
 * routes/nonworkspace-minimal.css, and this file never read it.
 *
 * That is how `--nm-faint` sat at 3.94:1 on the dark panel and 3.28:1 on the light one while every
 * test in this file passed. The guard was not wrong about the colours it measured; it was measuring
 * a different stylesheet from the one those four screens render with. A contrast check that reads
 * one of the app's two palettes is a contrast check with a hole the shape of the app.
 *
 * The token NAMES are discovered rather than listed, for the reason the landing check above
 * records: a hardcoded list measures the last palette. The floors below turn a renamed palette into
 * a loud failure instead of a clean run over zero pairs.
 */
const NM = readFileSync(join(HERE, '../src/routes/nonworkspace-minimal.css'), 'utf8');

//[[ RESTATED 2026-10-05 (M2 step 2.1). This layer used to carry a dark and a light block of literal
//   greys, which is why it needed its own contrast check. It now declares ONE block of `--nm-*` names,
//   each a `var()` of a design token, and the two themes come from the token file. So the check is:
//   the layer declares exactly one block, every ink and panel name in it resolves to a solid colour
//   through the tokens, in each theme, and the measurements below run on those resolved colours. A
//   literal colour sneaking back into the block resolves to itself and is measured the same way. ]]
/** The scoped `--nm-*` block(s). */
const NM_BLOCKS = [...NM.replace(/\/\*[\s\S]*?\*\//g, ' ').matchAll(/([^{}]*)\{([^{}]*)\}/g)]
  .filter((m) => /--nm-ink\s*:/.test(m[2]))
  .map((m) => ({ selector: m[1].trim(), body: m[2] }));

test('the non-workspace surfaces declare one palette block, themed by the tokens', () => {
  assert.equal(NM_BLOCKS.length, 1, `expected one --nm-* block, found ${NM_BLOCKS.length}`);
  assert.doesNotMatch(NM_BLOCKS[0].selector, /data-theme/i, 'the --nm-* block must not fork by theme; the tokens do');
});

for (const theme of ['dark', 'light']) {
  // name -> resolved solid colour, following var(--nm-*) and var(--token) chains in this theme.
  const raw = Object.fromEntries(
    [...NM_BLOCKS[0].body.matchAll(/--([a-z0-9-]+)\s*:\s*([^;]+)/gi)].map((m) => [m[1], m[2].trim()]),
  );
  const tokens = {};
  for (const [name, value] of Object.entries(raw)) {
    const ref = /^var\(--([a-z0-9-]+)\)$/i.exec(value);
    const hex = /^#[0-9a-f]{6}$/i.exec(value);
    const resolved = ref ? THEME[theme].resolve(ref[1]) : hex ? value.toLowerCase() : null;
    if (resolved) tokens[name] = resolved;
  }

  test(`${theme}: the --nm-* ink ramp clears 4.5:1 on every panel it is drawn on`, () => {
    // Worst case, not typical case: every panel colour, not the one the screenshot happened to
    // catch. `--nm-faint` carries timestamps, card meta, counts and placeholders — 10-13px, all
    // normal text, so the 3:1 large-text floor is not available to it.
    const INK = Object.keys(tokens).filter((n) => /^nm-(ink|muted|faint)$/.test(n));
    const PANELS = Object.keys(tokens).filter((n) => /^nm-(bg|panel|panel-hover|panel-soft)$/.test(n));
    assert.equal(INK.length, 3, `found ${INK.length} --nm-* ink token(s) — this check has gone blind`);
    assert.ok(PANELS.length >= 3, `found ${PANELS.length} --nm-* panel token(s) — this check has gone blind`);

    for (const ink of INK) {
      for (const panel of PANELS) {
        const r = contrast(tokens[ink], tokens[panel]);
        assert.ok(r >= 4.5, `${theme}: --${ink} on --${panel} is ${r.toFixed(2)}:1, needs 4.5:1 for normal text`);
      }
    }
  });

  test(`${theme}: the --nm-* ramp still descends, so the three tiers stay three tiers`, () => {
    const ground = tokens['nm-panel'];
    const [a, b, c] = ['nm-ink', 'nm-muted', 'nm-faint'].map((n) => contrast(tokens[n], ground));
    assert.ok(a > b && b > c, `${theme}: ramp is ${a.toFixed(2)} / ${b.toFixed(2)} / ${c.toFixed(2)} — not descending`);
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
  // One declaration per palette. Restated 2026-09-22: the old stylesheet declared --faint three times
  // (light, dark, dark again under a media query); the new one declares each palette once, with the
  // dark block serving both :root and [data-theme='dark'].
  const faint = occurrences(SITE, 'faint');
  const muted = occurrences(SITE, 'muted');
  const palettes = occurrences(SITE, 'paper').length;
  assert.ok(palettes >= 2, `found ${palettes} palette(s) — both themes must be measured`);
  assert.equal(faint.length, palettes, '--faint must be declared in every palette');

  for (const [i, theme] of Array.from({ length: palettes }, (_, k) => [k, `palette ${k + 1}`])) {
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
  // The base surface is --ground in the old palette and --paper in the current one.
  const BASE = occurrences(LANDING, 'ground').length ? 'ground' : 'paper';
  const paletteCount = occurrences(LANDING, BASE).length;
  assert.ok(paletteCount > 0, 'landing has no base palette');
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
    const ground = occurrences(LANDING, BASE)[i];
    const ratios = INK.map((n) => contrast(occurrences(LANDING, n)[i], ground));
    assert.equal(
      Math.min(...ratios),
      ratios[ratios.length - 1],
      `${theme}: --${INK[INK.length - 1]} must be the dimmest tier; ramp on --ground is ${ratios.map((r) => r.toFixed(1)).join(' / ')}`,
    );
  }
});

test('the token file declares no colour token nothing reads', () => {
  // RESTATED 2026-10-05 (M2 step 2.1). The subject was "the landing's colour tokens"; the colour
  // tokens of both apps are one file now, so the question is whether anything in EITHER app reads
  // each one. The reasoning that built this test still holds and is the reason for its shape:
  //
  //   - a token nothing references is a decision nobody made, and an assertion about one measures
  //     nothing (--faint once had a contract asserted on it while no rule on the page read it);
  //   - "read" means read by anything that ships: a var() in the CSS, a quoted '--name' in a script
  //     (the layouts read --theme-color with getPropertyValue, and a checker that only looked at
  //     var() reported it as dead, whose fix is deleting the token and breaking the address bar);
  //   - the walk is asserted non-empty, because a consumer scan that read nothing would report every
  //     token as dead, and 49 findings reads as a redesign rather than as a broken instrument.
  //
  // Only COLOUR tokens are in question: the file also carries space, type-scale and weight tokens
  // that exist for the page rebuild, and a token for a thing not built yet is not an unread colour.
  const colour = /^(#[0-9a-f]{3,8}|rgba?\(|color-mix\()/i;
  const declared = [...new Set(
    [...BLOCKS.dark, ...BLOCKS.light].filter((d) => colour.test(d.value)).map((d) => d.name.slice(2)),
  )];
  assert.ok(declared.length >= 20, `only ${declared.length} colour tokens found; did the file's shape change?`);

  const shipped = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === 'dist') continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(css|astro|ts|js|tsx|jsx|html)$/.test(entry.name)) shipped.push(readFileSync(full, 'utf8'));
    }
  };
  for (const root of [join(HERE, '..', 'src'), join(HERE, '..', 'index.html'), join(HERE, '..', '..', 'site', 'src')]) {
    if (!existsSync(root)) continue;
    if (root.endsWith('.html')) shipped.push(readFileSync(root, 'utf8'));
    else walk(root);
  }
  assert.ok(shipped.length >= 100, `only ${shipped.length} shipped file(s) scanned for consumers; the walk is broken, not the page`);
  const consumers = shipped.join('\n');

  const unused = declared.filter(
    (n) => !new RegExp(`var\\(--${n}[,)]`).test(consumers) && !new RegExp(`['"]--${n}['"]`).test(consumers),
  );
  assert.deepEqual(unused, [], `tokens.css declares colour tokens nothing reads: ${unused.join(', ')}`);
});
