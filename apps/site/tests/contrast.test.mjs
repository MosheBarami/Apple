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
 *   - derives the TEXT from use, not from a list: every `color:` any site stylesheet or component style
 *     sets (a token, a token with a fallback, a literal, a color-mix) is text somewhere. It is PAIRED
 *     with the fill that wins in the SAME STATE AND CONTEXT (tests/lib/cascade-pairs.mjs): the colour and the
 *     background of an element at rest, hovered, focused, or inside a modal are each a pair, so text that is only
 *     on a fill when hovered is measured at rest on the page, and a fill that another rule overrides in a
 *     context is measured with the text that sits on it there. Where a pair has an opaque fill that is not a
 *     page surface (`--paper` on the docs folder's `--ink`, `--accent-ink` on the accent button) the text is
 *     measured on exactly that fill; a translucent fill is laid over each surface; and where it has no fill
 *     (or a surface) it is measured on every surface. No token is exempt by name: a `color: var(--paper)`
 *     with no fill of its own is measured on the surfaces, where paper on paper is 1:1, and fails;
 *   - derives the SURFACES from the sheet: every `--paper*` and `--surface*` step;
 *   - requires 4.5:1 for every text token on every surface: worst case, not typical case, because
 *     a token used for text on one surface today is used on another tomorrow;
 *   - requires 4.5:1 for SELECTED text on every surface (the `::selection` rules) AND ON EVERY FILL a control draws: a selection is a
 *     translucent wash, so over the accent button it paints the accent and carries --ink on it (2.77:1 dark, 2.94:1 light, found by selecting
 *     the text and reading the pixels). Each filled control must set its own opaque pair, for its own text and its descendants' (`X::selection`
 *     and `X ::selection`), that reads at 4.5:1 and is visibly not the fill (3:1 against it);
 *   - requires 3:1 for the focus ring (--accent) on every surface: non-text contrast, WCAG 1.4.11;
 *   - requires every pair to clear 4.5:1 in both themes (the accent button's --accent-ink on --accent at rest and on
 *     --accent-strong hovered, the folder's --paper on --ink and --ink-2);
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
import { entriesOf, measure, pairsFor, parsePart, rulesOf, specificityOf } from './lib/cascade-pairs.mjs';

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

const declOf = (body, prop) => {
  const found = [...body.matchAll(new RegExp(`(?:^|[;\\s])${prop}\\s*:\\s*([^;}]+)`, 'g'))];
  return found.length ? found[found.length - 1][1].trim() : null;
};

const RULES = rulesOf(STYLES);
const ENTRIES = entriesOf(RULES);
const lookupOf = (name) => { const raw = THEMES[name].raw; return (n) => raw[n.slice(2)]; };
const SURFACES = Object.keys(THEMES.dark.raw).filter((n) => /^(paper|surface)(-\d)?$/.test(n)).sort();
const surfaceList = (mode) => SURFACES.map((n) => [n, rgbOfHex(THEMES[mode].resolve(n))]);

/** The pairs of each theme, measured: [{ pair, kind: 'fill' | 'surface', ratios, unresolved }]. */
const MEASURED = Object.fromEntries(Object.keys(THEMES).map((mode) => [mode, pairsFor(ENTRIES, mode).map((pair) => ({ pair, ...measure(pair, lookupOf(mode), surfaceList(mode), { contrastRgb, blend }) }))]));
/** The custom properties a list of colour values spends: `var(--ink)` -> ink. */
const tokensIn = (values) => [...new Set(values.flatMap((v) => [...v.matchAll(/var\(--([a-z0-9-]+)/g)].map((m) => m[1])))].sort();
const stateOf = (pair) => [pair.context && `inside ${pair.context}`, pair.states.length ? `:${pair.states.join(':')}` : 'at rest'].filter(Boolean).join(' ');
const describe = (m) => `${m.pair.raw[0]} (${stateOf(m.pair)})`;
const FILLS = MEASURED.dark.filter((m) => m.kind === 'fill');
const FREE = MEASURED.dark.filter((m) => m.kind === 'surface');
/** Text spent on the page surfaces: the tokens, as before, now derived from the pairs. */
const TEXT = tokensIn(FREE.flatMap((m) => m.pair.fgs));

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

/** One `::selection` selector part, read: { own, subject, raw } where subject is the element whose text it styles ('' for the page-wide rule) and own is false for `X ::selection` (its descendants' text). */
function selectionTarget(part) {
  const m = /^(.*?)(\s*)::(?:-moz-)?selection$/.exec(part.trim());
  if (!m) return null;
  const head = m[1].trim();
  return { own: m[2] === '', subject: head === '' ? '' : parsePart(head).subject, raw: part.trim() };
}

/**
 * Selected text on every opaque fill a control draws, in one theme. The fills are DERIVED (the pairs whose ground is an opaque colour that is
 * not a page surface), grouped by the element that carries them; for each, the `::selection` rule that wins for that element's own text and
 * for its descendants' text (the most specific that names it, else the page-wide one) is laid over each of its fills.
 * Returns { subjects: [selector], problems: [string] }.
 */
function selectionOnFills(rules, mode) {
  const lookup = lookupOf(mode);
  const entries = entriesOf(rules);
  const surfaces = surfaceList(mode);
  const byGround = new Map();
  for (const pair of pairsFor(entries, mode)) {
    const m = { pair, ...measure(pair, lookup, surfaces, { contrastRgb, blend }) };
    if (m.kind !== 'fill') continue;
    for (const v of pair.fills) {
      const colour = expandVars(v, lookup) && colourOf(expandVars(v, lookup));
      if (!colour || colour[3] !== 1 || /^var\(--(?:paper|surface)(?:-\d)?\)$/.test(v)) continue;
      if (!byGround.has(pair.subject)) byGround.set(pair.subject, new Map());
      byGround.get(pair.subject).set(v, colour.slice(0, 3));
    }
  }
  const selections = rules.flatMap((r) => splitTop(r.selector).map(selectionTarget).filter(Boolean).map((target) => ({ ...target, specificity: specificityOf(target.raw), bg: declOf(r.body, 'background') ?? declOf(r.body, 'background-color'), fg: declOf(r.body, 'color') })));
  const problems = [];
  for (const [subject, grounds] of byGround) {
    for (const own of [true, false]) {
      const applies = selections.filter((x) => x.subject === subject && x.own === own);
      const heavier = (a, b) => b.specificity[0] - a.specificity[0] || b.specificity[1] - a.specificity[1] || b.specificity[2] - a.specificity[2];
      const winner = applies.length ? applies.reduce((a, b) => (heavier(a, b) >= 0 ? b : a)) : selections.filter((x) => x.subject === '').at(-1);
      const what = `${subject}${own ? '' : ' (descendants)'}`;
      if (!winner) { problems.push(`${what}: no ::selection rule applies`); continue; }
      const [bgC, fgC] = [winner.bg, winner.fg].map((v) => { const text = v && expandVars(v, lookup); return text && colourOf(text); });
      if (!bgC || !fgC) { problems.push(`${what}: the ::selection that applies (${winner.raw}) sets no resolvable background and colour`); continue; }
      for (const [name, fill] of grounds) {
        const painted = blend(fill, bgC);
        const read = contrastRgb(blend(painted, fgC), painted);
        const apart = contrastRgb(painted, fill);
        const how = applies.length ? winner.raw : `the page-wide ${winner.raw}, because ${what} sets none`;
        if (read < 4.5) problems.push(`${what} on ${name}: selected text is ${read.toFixed(2)}:1 (${how})`);
        else if (apart < 3) problems.push(`${what} on ${name}: the selection is ${apart.toFixed(2)}:1 against the fill, so it does not show (${how})`);
      }
    }
  }
  return { subjects: [...byGround.keys()], problems };
}

test('the derivations found real tokens, so nothing below is vacuous', () => {
  assert.ok(STYLES.length >= 8, `only ${STYLES.length} style sources read — the walk has drifted`);
  // 4, not 5: --autonomous-ink left with the landing's Autonomous toggle (V3 gate G01, no mode surface).
  assert.ok(TEXT.length >= 4, `only ${TEXT.length} text tokens found (${TEXT.join(', ')}) — the use scan is blind`);
  for (const must of ['ink', 'muted', 'faint']) assert.ok(TEXT.includes(must), `--${must} is not spent as text anywhere; re-check the scan`);
  assert.ok(SURFACES.length >= 5, `only ${SURFACES.length} surfaces found (${SURFACES.join(', ')})`);
  // RE-BASED 2026-10-05 (M2 rebuild): 473 rules are read now, not 500+, because the 1,139-line landing.css (and the picks components'
  // own sheets) were deleted with the old front page. The floor is a vacuity check (a blind parse reads a handful, not hundreds), so
  // it follows the tree down; every pair measured below is still derived from whatever the sheets say.
  assert.ok(RULES.length > 300, `only ${RULES.length} rules read — the rule parse is blind`);
  for (const mode of Object.keys(THEMES)) {
    // RE-BASED AGAIN 2026-10-05 (M2 site fix cycle 1): 150 pairs are derived now, not 151 or more, because the docs rewrite deleted the docs picks'
    // own sheets (DocsKit's keycaps and line sidebar, the folder, the terminal, the code tabs). Still a vacuity floor (a blind pairing derives a
    // handful), and every pair measured is derived from whatever the sheets say.
    assert.ok(MEASURED[mode].length > 120, `${mode}: only ${MEASURED[mode].length} text/ground pairs were derived; the pairing is blind`);
    // THE STATES AND CONTEXTS ARE READ, not just the resting rules: pairs exist for a hovered element and for one inside a context.
    assert.ok(MEASURED[mode].some((m) => m.pair.states.includes('hover')), `${mode}: no hovered pair was derived`);
    assert.ok(MEASURED[mode].some((m) => m.pair.context !== ''), `${mode}: no pair in a context (a descendant selector) was derived`);
  }
  // The fills are FOUND in the CSS, not listed: the accent button, the skip link. RESTATED 2026-10-05 (M2 site fix cycle 1): the folder's paper on ink
  // and ink-2 (the docs Folder component) was the other source of fills and was deleted by the docs rewrite, so the floor is the accent fills.
  assert.ok(FILLS.length >= 3, `only ${FILLS.length} pairs of text on a fill were found`);
  const fillTokens = new Set(tokensIn(FILLS.flatMap((m) => m.pair.fgs)));
  const grounds = new Set(FILLS.flatMap((m) => m.pair.fills));
  for (const must of ['accent-ink']) assert.ok(fillTokens.has(must), `--${must} is not found as text on a fill; the fill scan is blind`);
  for (const must of ['var(--accent)', 'var(--accent-strong)']) assert.ok(grounds.has(must), `${must} is not found as a ground of a fill pair`);
});

for (const [name, t] of Object.entries(THEMES)) {
  test(`${name}: every colour of text drawn on the page surfaces clears 4.5:1 on every surface`, () => {
    // Text with no fill of its own, or on a page surface, or on a translucent wash (laid over each surface), in the state and context it is drawn in.
    const bad = [];
    let measured = 0;
    for (const m of MEASURED[name].filter((x) => x.kind === 'surface')) {
      for (const u of m.unresolved) bad.push(`${describe(m)}: ${u} does not resolve to a colour (make it a token)`);
      for (const r of m.ratios) { measured += 1; if (r.ratio < 4.5) bad.push(`${describe(m)}: ${r.fg} on ${r.ground} is ${r.ratio.toFixed(2)}:1`); }
    }
    assert.ok(measured >= 500, `only ${measured} text/surface pairs measured`);
    assert.deepEqual([...new Set(bad)], [], `${name}: text below 4.5:1:\n  ${[...new Set(bad)].join('\n  ')}`);
  });

  test(`${name}: the focus ring clears 3:1 on every surface, and the accent button reads`, () => {
    const ring = t.resolve('accent');
    assert.ok(ring, `${name}: --accent does not resolve`);
    for (const surface of SURFACES) {
      const r = contrast(ring, t.resolve(surface));
      assert.ok(r >= 3, `${name}: the focus ring --accent on --${surface} is ${r.toFixed(2)}:1, needs 3:1`);
    }
  });

  test(`${name}: every text colour on a fill clears 4.5:1 on the fill that wins in its own state and context`, () => {
    // Paired by state: the hover step of a button is its own pair, and a fill a descendant rule changes is measured with the text that sits on it there.
    const pairs = MEASURED[name].filter((x) => x.kind === 'fill');
    const bad = [];
    let measured = 0;
    for (const m of pairs) {
      for (const u of m.unresolved) bad.push(`${describe(m)}: ${u} does not resolve to a colour (make it a token)`);
      for (const r of m.ratios) { measured += 1; if (r.ratio < 4.5) bad.push(`${describe(m)}: ${r.fg} on ${r.ground} is ${r.ratio.toFixed(2)}:1`); }
    }
    assert.ok(measured >= 3, `only ${measured} text/fill pairs measured`);
    assert.deepEqual([...new Set(bad)], [], `${name}: text on a fill below 4.5:1:\n  ${[...new Set(bad)].join('\n  ')}`);
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

  test(`${name}: selected text clears 4.5:1 on every fill a control draws, and shows against it`, () => {
    const { subjects, problems } = selectionOnFills(RULES, name);
    // CANARIES: the fills were found in the sheets, not listed here. Each is a control a person selects text on.
    // RESTATED 2026-10-05 (M2 rebuild): `.cta` and `.composer-send` were the old landing's controls (the composer and its merged CTA button)
    // and were deleted with it; `.fold__paper` (the docs Folder's paper on ink) went with the docs picks. The canaries are the fills the sheets
    // still draw on an opaque non-surface fill: the primary button and the skip link.
    for (const must of ['.btn-primary', '.skip-link']) assert.ok(subjects.includes(must), `${must} was not found as a control drawn on an opaque fill (${subjects.join(', ')}); the fill scan is blind`);
    assert.deepEqual(problems, [], `${name}: selected text on a fill:\n  ${problems.join('\n  ')}`);
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

/** Pair and measure a fixture sheet in a theme: the worst ratio and the kind of each pair, keyed `subject[:states][ @ context]`. */
function fixture(css, mode = 'dark') {
  const pairs = pairsFor(entriesOf(rulesOf([css])), mode).map((pair) => ({ pair, ...measure(pair, lookupOf(mode), surfaceList(mode), { contrastRgb, blend }) }));
  const worst = (m) => Math.min(...m.ratios.map((r) => r.ratio));
  const key = (m) => `${m.pair.subject}${m.pair.states.length ? `:${m.pair.states.join(':')}` : ''}${m.pair.context ? ` @ ${m.pair.context}` : ''}`;
  return { pairs, by: Object.fromEntries(pairs.map((m) => [key(m), worst(m)])), kind: Object.fromEntries(pairs.map((m) => [key(m), m.kind])) };
}

test('the guard has teeth: no token is exempt by name, a text colour with no fill of its own is measured on the surfaces, and a failing fill is reported', () => {
  const f = fixture([
    '.free { color: var(--paper); }',
    '.on-surface { color: var(--paper); background: var(--surface); }',
    '.ok { color: var(--paper); background: var(--ink); }',
    '.bad { color: var(--ink); background: var(--accent); }',
    '.wash { color: var(--ink); background: color-mix(in srgb, var(--accent) 12%, transparent); }',
    '.multi { color: var(--accent-ink); background: var(--accent); }',
    '.multi:hover { background: var(--accent-strong); }',
  ].join('\n'));
  assert.deepEqual(f.kind, {
    '.free': 'surface', '.on-surface': 'surface', '.ok': 'fill', '.bad': 'fill', '.wash': 'surface',
    '.multi': 'fill', '.multi:hover': 'fill',
  }, 'the fill classification drifted');
  // --paper with no fill of its own lands in the surface measurement, where it is the colour of the page.
  assert.ok(f.by['.free'] < 1.2, `a free use of --paper is ${f.by['.free']}:1 and was not failed`);
  assert.ok(f.by['.on-surface'] < 1.2, 'paper on a page surface was not failed');
  // A fill that fails is reported: ink on the accent is 2.6:1 in dark.
  assert.ok(f.by['.bad'] < 4.5, `the fixture is not a failing fill (${f.by['.bad']})`);
  // The hover state of an element is its own pair: the accent button's label on the hover step.
  assert.ok(f.by['.multi:hover'] >= 4.5 && f.by['.multi'] >= 4.5, 'the accent button read as failing');
  assert.ok(f.by['.ok'] >= 4.5, 'paper on ink was failed');
});

test('the guard has teeth: text that is only on a fill when HOVERED is measured at rest, on the page', () => {
  // The review\'s first shape, verified green against the old guard: paper text, and a fill that appears on hover. At rest it is paper on paper.
  const f = fixture('.zz-btn { color: var(--paper); } .zz-btn:hover { background: var(--accent); }');
  assert.ok(f.by['.zz-btn'] < 1.2, `paper text with no fill at rest was measured against its hover fill (${f.by['.zz-btn']}:1)`);
  assert.equal(f.kind['.zz-btn'], 'surface');
  assert.ok(f.by['.zz-btn:hover'] >= 4.5, 'the hovered pair (paper on the accent) was failed');
  // A hover that changes only the fill under a resting colour pairs the resting colour with the hover fill.
  const g = fixture('.a { color: var(--accent-ink); background: var(--accent); } .a:hover { background: var(--surface-3); }');
  assert.ok(g.by['.a:hover'] < 4.5, 'a hover fill that takes the label off its ground was not failed');
  assert.ok(g.by['.a'] >= 4.5, 'the resting pair was failed');
});

test('the guard has teeth: a fill that a descendant rule changes is measured with the text that sits on it there', () => {
  // The review\'s second shape: the accent label is on the accent everywhere but inside a modal, where a rule with another selector changes the fill.
  const f = fixture('.zz-b2 { color: var(--accent-ink); background: var(--accent); } .zz-modal .zz-b2 { background: var(--surface-3); }');
  assert.ok(f.by['.zz-b2'] >= 4.5, 'the plain pair was failed');
  const inModal = Object.entries(f.by).find(([k]) => /@ \.zz-modal/.test(k));
  assert.ok(inModal, 'the context the descendant rule names was not paired');
  assert.ok(inModal[1] < 4.5, `the label on the modal's surface-3 fill was not failed (${inModal[1]}:1)`);
  // Specificity decides which fill wins: a descendant fill beats the plain one, and a plain fill declared later does not beat a more specific one.
  const g = fixture('.m .b { background: var(--ink); color: var(--paper); } .b { background: var(--accent); }');
  const inCtx = Object.entries(g.by).find(([k]) => /@ \.m$/.test(k));
  assert.ok(inCtx && inCtx[1] >= 4.5, `the descendant rule's paper-on-ink did not win over the plain accent fill (${inCtx?.[1]})`);
});

test('the guard has teeth: a colour with a fallback, a literal and a color-mix are uses, and a theme-bound rule is read only in its theme', () => {
  // `color: var(--paper, #000)` was not matched as a use at all (the pattern wanted var(--x) with nothing after it).
  const fb = fixture('.fb { color: var(--paper, #000); }');
  assert.ok(fb.by['.fb'] < 1.2, `a use with a fallback was not measured (${fb.by['.fb']})`);
  const lit = fixture('.lit { color: #ffffff; background: var(--ink); } .lit2 { color: color-mix(in srgb, var(--ink) 50%, transparent); }');
  assert.ok(lit.by['.lit'] < 4.5, 'a literal white on --ink (dark) was not measured');
  assert.ok(lit.by['.lit2'] !== undefined, 'a color-mix text colour was not a use');
  // A rule bound to the light theme does not apply in dark: only the light pair is measured in light, and the dark pair in dark.
  const css = ".t { color: var(--ink); } [data-theme='light'] .t { color: var(--paper); }";
  assert.ok(fixture(css, 'light').by['.t'] < 1.2, 'the light-only colour was not read in light');
  assert.ok(fixture(css, 'dark').by['.t'] >= 4.5, 'the light-only colour was read in dark');
});

test('the guard has teeth: a selection that is a wash fails on the accent fill, an inverted opaque pair passes, and each half of it is required', () => {
  const FILL = '.zz-cta { color: var(--accent-ink); background: var(--accent); } .zz-cta:hover { background: var(--accent-strong); }';
  const WASH = '::selection { background: color-mix(in srgb, var(--accent) 45%, transparent); color: var(--ink); }';
  const INVERTED = '.zz-cta::selection, .zz-cta ::selection { background: var(--accent-ink); color: var(--accent); }';
  const run = (css, mode) => selectionOnFills(rulesOf([css]), mode);
  /** Which of the two forms (the element's own text, its descendants' text) a result fails: the fixture's fill has two grounds, so a form can fail twice. */
  const forms = (r) => [...new Set(r.problems.map((p) => (/\(descendants\)/.test(p) ? 'descendants' : 'own')))].sort();
  for (const mode of Object.keys(THEMES)) {
    // As shipped: the page-wide wash over the accent face. The accent painted by the wash IS the accent, and --ink on it was 2.77:1 (dark) and 2.94:1 (light).
    const shipped = run(`${FILL} ${WASH}`, mode);
    assert.deepEqual(shipped.subjects, ['.zz-cta'], `${mode}: the fill was not found`);
    assert.ok(shipped.problems.some((p) => /selected text is [12]\.\d\d:1/.test(p)), `${mode}: the shipped wash over the accent was not failed: ${shipped.problems.join(' | ')}`);
    assert.deepEqual(forms(shipped), ['descendants', 'own'], `${mode}: both the element's own text and its descendants' text should fail (${shipped.problems.join(' | ')})`);
    assert.ok(shipped.problems.some((p) => /on var\(--accent-strong\)/.test(p)) && shipped.problems.some((p) => /on var\(--accent\):/.test(p)), `${mode}: the hover fill and the resting fill were not both read`);
    // The inverted opaque pair reads (the label's pair, swapped) and shows.
    assert.deepEqual(run(`${FILL} ${WASH} ${INVERTED}`, mode).problems, [], `${mode}: the inverted pair was failed`);
    // Each half is required: the descendant form alone leaves the element's own text on the wash, the own form alone leaves the label span on it.
    assert.deepEqual(forms(run(`${FILL} ${WASH} .zz-cta ::selection { background: var(--accent-ink); color: var(--accent); }`, mode)), ['own'], `${mode}: the own-text half was not required`);
    assert.deepEqual(forms(run(`${FILL} ${WASH} .zz-cta::selection { background: var(--accent-ink); color: var(--accent); }`, mode)), ['descendants'], `${mode}: the descendant half was not required`);
    // A pair that reads but is the fill itself (the accent as the highlight, the label ink on it) shows nothing, and a rule for another element is not this one's.
    assert.ok(run(`${FILL} ${WASH} .zz-cta::selection, .zz-cta ::selection { background: var(--accent); color: var(--accent-ink); }`, mode).problems.every((p) => /does not show/.test(p)), `${mode}: a selection that paints the fill was passed`);
    assert.deepEqual(forms(run(`${FILL} ${WASH} .zz-other::selection, .zz-other ::selection { background: var(--accent-ink); color: var(--accent); }`, mode)), ['descendants', 'own'], `${mode}: a rule for another element was counted`);
    // A wash of the accent over the accent fill, under a label that reads, is still not a selection.
    assert.deepEqual(forms(run(`${FILL} ${WASH} .zz-cta::selection, .zz-cta ::selection { background: color-mix(in srgb, var(--accent) 45%, transparent); color: var(--accent-ink); }`, mode)), ['descendants', 'own'], `${mode}: a wash over its own fill was passed`);
  }
  // The paper on ink (the docs folder), derived like the accent button: ink is a fill that is not a page surface.
  const fold = run('.zz-sheet { color: var(--paper); background: var(--ink); } ' + WASH, 'dark');
  assert.deepEqual(fold.subjects, ['.zz-sheet'], 'an ink fill was not found');
  assert.deepEqual(forms(fold), ['descendants', 'own'], `the page wash over an --ink sheet was not failed (${fold.problems.join(' | ')})`);
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
