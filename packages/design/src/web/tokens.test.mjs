/**
 * THE DESIGN TOKENS: one file, spent by both apps, with one accent that passes WCAG AA.
 *
 * packages/design/src/web/tokens.css is the only place a colour, radius, space, type or motion value
 * is declared. These tests hold the properties that make that true and keep it true:
 *
 *   1. both apps import it, first, and depend on the package that carries it;
 *   2. it declares exactly one --accent per theme, and no other sheet in either app declares one;
 *   3. no retired accent colour is left anywhere outside this package, and no accent value of any
 *      candidate is typed into an app or a script (an app reads the token). Both are compared as COLOURS, in any
 *      syntax: `rgba(139, 92, 246, .2)` and `hsl(228 93% 66%)` are the retired violet and azure the guards were
 *      first written to ban, and the first versions matched the hex spelling only;
 *   4. the accent family is candidate 1 of accents.json, and every candidate in that file clears AA in
 *      both themes, MEASURED from the files at the moment the test runs (the ratios recorded in
 *      accents.json must equal them);
 *   5. every text token clears 4.5:1 on every surface, in both themes;
 *   6. the type is the system stack, and nothing downloads a font.
 *
 * Every derivation asserts a floor, because a scan that read nothing reports a clean repository.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  AA, ACCENTS_JSON_PATH, OLD_ACCENT_HEX, OLD_ACCENT_LITERALS, SURFACES, STATUS_INKS, TEXT_INKS, TOKENS_CSS_PATH,
  aaFailures, accentRingOf, coloursIn, contrast, customPropertyWrites, declarations, listedColoursIn, measureAccentExact, readTokensCss, roundRatios,
  stripComments, stripScriptComments, surfacesOf, theme, themeBlocks, topLevelRules,
} from './css-tokens.mjs';
import { ROOT, readText, walkNames, walkText } from './tests/repo-walk.mjs';

const CSS = readTokensCss();
const BLOCKS = themeBlocks(CSS);
const THEMES = { dark: theme(BLOCKS.dark), light: theme(BLOCKS.light) };
const ACCENTS = JSON.parse(readFileSync(ACCENTS_JSON_PATH, 'utf8'));
const FAMILY = ['accent', 'accent-strong', 'accent-ink', 'accent-wash'];

const norm = (v) => v.toLowerCase().replace(/\s+/g, '').replace(/(\D)0\./g, '$1.');

/* ------------------------------------------------------------------ 1. both apps import it */

test('the token file is exported by the package and both apps depend on it', () => {
  const pkg = JSON.parse(readFileSync(join(ROOT, 'packages/design/package.json'), 'utf8'));
  assert.equal(pkg.exports['./tokens.css'], './src/web/tokens.css', 'package.json does not export ./tokens.css');
  assert.ok(existsSync(TOKENS_CSS_PATH), 'the exported token file does not exist');
  for (const app of ['apps/site', 'apps/web']) {
    const a = JSON.parse(readFileSync(join(ROOT, app, 'package.json'), 'utf8'));
    assert.equal(a.dependencies?.['@studpilot/design'], 'workspace:*', `${app} does not depend on @studpilot/design`);
  }
});

test('every document layout of the site imports the tokens, and the app imports them before any other sheet', () => {
  const layouts = walkText(['apps/site/src/layouts']).filter((f) => /<html\b/.test(readText(f)));
  assert.ok(layouts.length >= 2, `only ${layouts.length} document layout(s) found; the walk has drifted`);
  for (const f of layouts) {
    assert.match(readText(f), /import\s+['"]@studpilot\/design\/tokens\.css['"]/, `${f.rel} does not import the design tokens`);
    // Before every sheet of the site's own, so the cascade needs no `!important` to settle.
    const src = readText(f);
    const at = src.search(/import\s+['"]@studpilot\/design\/tokens\.css['"]/);
    for (const m of src.matchAll(/import\s+['"][^'"]*\.css['"]/g)) {
      if (!/@studpilot\/design\/tokens\.css/.test(m[0])) assert.ok(at < m.index, `${f.rel}: ${m[0]} is imported before the tokens`);
    }
  }
  const main = readFileSync(join(ROOT, 'apps/web/src/main.tsx'), 'utf8');
  const imports = [...main.matchAll(/^import\s+['"]([^'"]+\.css)['"];?$/gm)].map((m) => m[1]);
  assert.ok(imports.length >= 3, 'main.tsx imports fewer than three sheets; the scan has drifted');
  assert.equal(imports[0], '@studpilot/design/tokens.css', `main.tsx imports ${imports[0]} before the design tokens`);
});

/* ------------------------------------------------------------------ 2. one accent per theme */

test('the token file declares exactly one --accent per theme, and has exactly two theme blocks', () => {
  assert.equal(BLOCKS.dark.filter((d) => d.name === '--accent').length, 1, 'the dark block must declare --accent exactly once');
  assert.equal(BLOCKS.light.filter((d) => d.name === '--accent').length, 1, 'the light block must declare --accent exactly once');
  // The whole file: no third place (a media query, a component scope) that could declare another.
  const all = [...stripComments(CSS).matchAll(/(?:^|[;{\s])--accent\s*:/g)];
  assert.equal(all.length, 2, `--accent is declared ${all.length} times in tokens.css; it must be exactly twice, once per theme`);
  assert.doesNotMatch(stripComments(CSS), /@media[^{]*prefers-color-scheme/, 'a prefers-color-scheme block would give --accent a third home');
  const selectors = topLevelRules(CSS).map((r) => r.selector);
  assert.equal(selectors.filter((s) => /data-theme/.test(s) || s === ':root, :root[data-theme=\'dark\']').length, 2, 'expected exactly the dark and the light theme blocks');
});

const ACCENT_FAMILY = /^--accent(?:-strong|-ink|-wash|-ring)?$/;
/** Every write of an accent-family token in one source: CSS, a style object, or setProperty. */
const accentWrites = (src, isScript) => customPropertyWrites(isScript ? stripScriptComments(src) : stripComments(src)).filter((w) => ACCENT_FAMILY.test(w.name));

test('no other stylesheet, component style or script in either app writes a token of the accent family', () => {
  const files = walkText(['apps/site/src', 'apps/web/src']).concat([{ path: join(ROOT, 'apps/web/index.html'), rel: 'apps/web/index.html' }]);
  assert.ok(files.length > 300, `only ${files.length} app files scanned; the walk has drifted`);
  assert.ok(files.filter((f) => /\.tsx?$/.test(f.rel)).length > 100, 'the walk found almost no scripts; the style-object and setProperty forms are not being looked for');
  const stray = [];
  for (const f of files) {
    // The vendored AI Elements CSS (Tailwind's own `--accent` for shadcn) is third-party and byte-pinned.
    if (f.rel.startsWith('apps/web/src/components/ai-elements/') || f.rel.startsWith('apps/web/src/components/aicss/') || f.rel.startsWith('apps/web/src/components/ui/')) continue;
    for (const w of accentWrites(readText(f), /\.(?:tsx?|jsx?|mjs)$/.test(f.rel))) stray.push(`${f.rel}: ${w.name} (${w.form})`);
  }
  assert.deepEqual(stray, [], `the accent family is written outside tokens.css:\n  ${stray.join('\n  ')}`);
});

test('the guard has teeth: a stylesheet, a style object and a setProperty call that write the accent are all seen', () => {
  const names = (src, isScript = true) => accentWrites(src, isScript).map((w) => `${w.name} ${w.form}`);
  assert.deepEqual(names('.a { --accent: red; }', false), ['--accent declaration']);
  assert.deepEqual(names('<div style="--accent-ink: #000">', false), ['--accent-ink declaration']);
  assert.deepEqual(names(`<div style={{ '--accent': c }} />`), ['--accent object key']);
  assert.deepEqual(names('const style = { "--accent-strong": c };'), ['--accent-strong object key']);
  assert.deepEqual(names(`el.style.setProperty('--accent-wash', c);`), ['--accent-wash setProperty']);
  assert.deepEqual(names('el.style.setProperty(`--accent-ring`, c);'), ['--accent-ring setProperty']);
  // Reads are not writes, other names are not the family, and a comment is not code.
  assert.deepEqual(names(`const c = getComputedStyle(el).getPropertyValue('--accent'); a.style.color = 'var(--accent)';`), []);
  assert.deepEqual(names(`el.style.setProperty('--accent-x', c); el.style.setProperty('--chip-accent', c);`), []);
  assert.deepEqual(names('// el.style.setProperty(\'--accent\', c)\n/* { \'--accent\': c } */\nconst x = 1;'), []);
});

/* ------------------------------------------------------------------ 3. no accent literals in the apps */

/** The retired accent COLOURS a source still carries, in any syntax (hex, rgb(), rgba(), hsl(), hwb(), color(srgb), oklab(), oklch()): the hexes found. */
const retiredIn = (text) => listedColoursIn(text, OLD_ACCENT_HEX);

test('no retired accent colour exists in any tracked source outside packages/design, in any colour syntax', () => {
  const files = walkText(['apps', 'packages', 'scripts', 'tools', 'infra', 'tests', '.github', 'supabase'], { skipPaths: [
    'packages/asset-library', 'packages/corpus', 'packages/training', 'packages/owner-corpus', 'packages/design',
  ] });
  assert.ok(files.length > 1500, `only ${files.length} files scanned; the walk has drifted`);
  assert.ok(files.some((f) => f.rel.startsWith('scripts/')) && files.some((f) => f.rel.startsWith('apps/web/')), 'the walk misses scripts/ or the app');
  // Third-party brand skins of the owner dashboards carry their vendors' own colours: Sentry's purple (#7553ff) is 4/255 from a
  // retired violet of ours. They are left out by path and held from both ends below (the exemption goes when the skin stops needing it).
  const THIRD_PARTY = /^scripts\/owner-dashboard\/control\/skins\/(?!studpilot\.css$)/;
  const hits = [];
  const exempt = [];
  for (const f of files) {
    const found = retiredIn(readText(f));
    if (THIRD_PARTY.test(f.rel)) { if (found.length) exempt.push(f.rel); continue; }
    for (const hex of found) hits.push(`${f.rel}: ${hex}`);
  }
  assert.deepEqual(hits, [], `a retired accent colour is still in the tree (in some syntax):\n  ${hits.join('\n  ')}`);
  assert.ok(exempt.length >= 1, 'no third-party brand skin carries a colour near a retired accent any more: delete the THIRD_PARTY exemption');
  assert.ok(exempt.every((rel) => /sentry\.css$/.test(rel)), `a third-party skin other than Sentry's is exempt only by being near a retired accent: ${exempt.join(', ')}; check it is a vendor colour`);
});

test('the ban names every retired accent, including the three violets, the blue and the dashboards\' azure', () => {
  // Spelled out here on purpose: a ban that is a list is only as good as the list, so the list is held.
  for (const lit of ['#5b7cfa', '#4568e8', '#8ca4ff', '#4264e8', '#3155d4', '#8b5cf6', '#7550de', '#7657ff', '#4f7cff', '#8aa2ff', '#3454d1', '#b9c6ff']) {
    assert.ok(OLD_ACCENT_LITERALS.includes(lit) && OLD_ACCENT_HEX.includes(lit), `${lit} is not banned`);
  }
});

/** A colour written in each syntax a page can use, from its channels. */
const spellings = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const [rf, gf, bf] = [r, g, b].map((v) => v / 255);
  const max = Math.max(rf, gf, bf);
  const min = Math.min(rf, gf, bf);
  const l = (max + min) / 2;
  const d = max - min;
  const sat = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  const hue = d === 0 ? 0 : (max === rf ? ((gf - bf) / d + 6) % 6 : max === gf ? (bf - rf) / d + 2 : (rf - gf) / d + 4) * 60;
  return {
    upper: hex.toUpperCase(),
    'hex with alpha': `${hex}33`,
    'rgb() commas': `rgb(${r}, ${g}, ${b})`,
    'rgb() spaces': `rgb(${r} ${g} ${b})`,
    'rgba()': `rgba(${r}, ${g}, ${b}, .2)`,
    'rgba() tight': `rgba(${r},${g},${b},0.2)`,
    'rgb() with a slash alpha': `rgb(${r} ${g} ${b} / 20%)`,
    'rgb() percentages': `rgb(${(rf * 100).toFixed(1)}% ${(gf * 100).toFixed(1)}% ${(bf * 100).toFixed(1)}%)`,
    'hsl() whole numbers': `hsl(${Math.round(hue)} ${Math.round(sat * 100)}% ${Math.round(l * 100)}%)`,
    'hsla()': `hsla(${Math.round(hue)}, ${Math.round(sat * 100)}%, ${Math.round(l * 100)}%, .3)`,
    'color(srgb)': `color(srgb ${rf.toFixed(4)} ${gf.toFixed(4)} ${bf.toFixed(4)})`,
  };
};

test('the guard has teeth: each retired colour is found in every syntax it can be written, and today\'s accent is not', () => {
  for (const hex of OLD_ACCENT_HEX) {
    for (const [name, text] of Object.entries(spellings(hex))) {
      assert.ok(retiredIn(`a { color: ${text}; }`).includes(hex), `${hex} was not found written as ${name}: ${text}`);
    }
  }
  // The forms the first guard let through, as the review wrote them.
  assert.deepEqual(retiredIn('a { background: rgba( 91 , 124 , 250 , .2 ); }'), ['#5b7cfa'], 'a spaced rgba of the old azure was not found');
  assert.ok(retiredIn('a { background: rgba(139, 92, 246, 0.2); }').includes('#8b5cf6'), 'the retired violet as rgba() was not found');
  assert.ok(retiredIn('a { outline-color: rgb(91 124 250 / 20%); }').includes('#5b7cfa'), 'the retired azure as rgb() with a slash alpha was not found');
  assert.ok(retiredIn('a { color: hsl(228 93% 66%); }').includes('#5b7cfa'), 'the retired azure as a loosely rounded hsl() (4/255 off, as the review wrote it) was not found');
  // Today's accent is not one of them, in any syntax, and a colour that is merely near is not either.
  for (const [name, text] of Object.entries(spellings(ACCENTS.candidates[0].dark.accent))) assert.deepEqual(retiredIn(`a { color: ${text}; }`), [], `the shipping accent written as ${name} trips the retired guard`);
  // A colour that is merely near IS found (Sentry's purple, 4/255 from a retired violet): the guard cannot tell a vendor's colour from ours, so the skin is exempt by path above.
  assert.deepEqual(retiredIn('a { color: #7553FF; }'), ['#7657ff'], 'the near colour the exemption exists for is no longer near');
  assert.deepEqual(retiredIn('a { color: #7a60ff; }'), [], 'a colour 7/255 from a retired violet was found');
  // The reader itself: hex of every length, the functional syntaxes, and what is not a literal.
  assert.deepEqual(coloursIn('#abc #aabbcc #aabbccdd #abcd').map((c) => c.rgb.join(',')), ['170,187,204', '170,187,204', '170,187,204', '170,187,204']);
  assert.deepEqual(coloursIn('color: var(--accent); background: red; --x: calc(1px + 2px); id="#fab-1"').map((c) => c.literal), [], 'a var(), a named colour, a length or an anchor with a suffix was read as a colour literal');
});

test('no accent value of any candidate is typed into an app or a script: an app reads the token', () => {
  const values = ACCENTS.candidates.flatMap((c) => ['dark', 'light'].flatMap((m) => [c[m].accent, c[m]['accent-strong']])).map((v) => v.toLowerCase());
  assert.equal(new Set(values).size, values.length, 'two candidates share an accent value');
  // The dashboards in scripts/owner-dashboard are the owner's separate local tool: its own palette, webfonts, glass and aurora, with
  // service skins that carry third-party brand colours (a cyan that is also a candidate). They hand-copy the default accent; that is the
  // one place this guard does not read, and it is held from both ends below.
  const OWNER_TOOL = 'scripts/owner-dashboard/';
  const files = walkText(['apps/site/src', 'apps/web/src', 'apps/web/scripts', 'scripts']);
  const hits = [];
  let read = 0;
  for (const f of files) {
    if (f.rel.startsWith(OWNER_TOOL)) continue;
    read += 1;
    for (const hex of listedColoursIn(readText(f), values)) hits.push(`${f.rel}: ${hex}`);
  }
  assert.ok(read > 300, `only ${read} files scanned; the walk has drifted`);
  assert.ok(files.some((f) => f.rel.startsWith('scripts/') && !f.rel.startsWith(OWNER_TOOL)), 'scripts/ is not in the walk');
  assert.deepEqual(hits, [], `an accent colour is hard-coded (in some syntax); use var(--accent) or var(--accent-strong):\n  ${hits.join('\n  ')}`);
  // From the other end: the exemption is needed while the dashboards still copy the shipping accent, and goes when they stop.
  const dashboards = files.filter((f) => f.rel.startsWith(OWNER_TOOL));
  assert.ok(dashboards.length > 20, `only ${dashboards.length} dashboard files; ${OWNER_TOOL} moved: delete the exemption`);
  assert.ok(dashboards.some((f) => listedColoursIn(readText(f), [ACCENTS.candidates[0].dark.accent]).length > 0), `${OWNER_TOOL} no longer copies the accent: delete the exemption`);
});

test('the guard has teeth: every syntax of an accent value is found in an app, and a var() is not', () => {
  const values = ACCENTS.candidates.flatMap((c) => ['dark', 'light'].flatMap((m) => [c[m].accent, c[m]['accent-strong']]));
  for (const hex of values) for (const [name, text] of Object.entries(spellings(hex))) assert.ok(listedColoursIn(`a { border-color: ${text}; }`, values).includes(hex), `${hex} written as ${name} was not found: ${text}`);
  assert.deepEqual(listedColoursIn('a { color: var(--accent); background: var(--accent-wash); }', values), []);
  assert.ok(listedColoursIn('a { background: rgba(166,124,255,.2); }', values).includes('#a67cff'), 'the shipping accent as rgba() passed (the finding)');
});

/* ------------------------------------------------------------------ 4. accents.json: three candidates, AA, default in the file */

const HUE = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  if (d === 0) return 0;
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return Math.round(((h * 60) + 360) % 360);
};
// The families the owner rejected as the product accent (planning/sections/10-web-brand-design.md):
// ember orange, green (green is for status only) and azure blue.
const REJECTED = [['ember orange', 10, 50], ['green', 70, 165], ['azure blue', 200, 250]];
const rejectedFamily = (hex) => REJECTED.find(([, lo, hi]) => HUE(hex) >= lo && HUE(hex) <= hi)?.[0] ?? null;

test('accents.json holds three distinct candidates, none of them a hue the owner rejected', () => {
  assert.equal(ACCENTS.candidates.length, 3, 'expected exactly three accent candidates');
  assert.equal(new Set(ACCENTS.candidates.map((c) => c.name)).size, 3, 'candidate names must be distinct');
  assert.equal(ACCENTS.default, ACCENTS.candidates[0].name, 'candidate 1 is the default');
  for (const c of ACCENTS.candidates) {
    for (const mode of ['dark', 'light']) {
      assert.deepEqual(Object.keys(c[mode]).sort(), [...FAMILY].sort(), `${c.name}/${mode} must carry exactly the four accent values`);
      assert.equal(rejectedFamily(c[mode].accent), null, `${c.name}/${mode}: ${c[mode].accent} (hue ${HUE(c[mode].accent)}) is ${rejectedFamily(c[mode].accent)}, which the owner rejected`);
    }
  }
  const hues = ACCENTS.candidates.map((c) => HUE(c.dark.accent));
  for (let i = 0; i < hues.length; i += 1) for (let j = i + 1; j < hues.length; j += 1) {
    assert.ok(Math.abs(hues[i] - hues[j]) >= 30, `${ACCENTS.candidates[i].name} and ${ACCENTS.candidates[j].name} are within 30 degrees of hue; they are one candidate`);
  }
});

test('every candidate clears AA in both themes, and the ratios recorded in accents.json are the measured ones', () => {
  const surfaces = { dark: surfacesOf(THEMES.dark), light: surfacesOf(THEMES.light) };
  let measured = 0;
  for (const c of ACCENTS.candidates) {
    for (const mode of ['dark', 'light']) {
      // The verdict is on the EXACT ratios; the record is those ratios to two places.
      const exact = measureAccentExact(c[mode], surfaces[mode], accentRingOf(BLOCKS[mode]));
      measured += Object.keys(exact).length;
      assert.deepEqual(aaFailures(exact), [], `${c.name}/${mode} is below WCAG AA`);
      assert.deepEqual(c.measured?.[mode], roundRatios(exact), `${c.name}/${mode}: the recorded ratios are stale; run \`node packages/design/src/web/measure-accents.mjs --write\``);
    }
  }
  assert.equal(measured, 3 * 2 * 6, 'the measurement count drifted; a ratio is not being measured');
});

test('the guard has teeth: a candidate that is too dim, too bright for its label, or one hundredth short is reported', () => {
  const dark = surfacesOf(THEMES.dark);
  const light = surfacesOf(THEMES.light);
  const ringD = accentRingOf(BLOCKS.dark);
  const ringL = accentRingOf(BLOCKS.light);
  const dim = measureAccentExact({ accent: '#4a3a90', 'accent-strong': '#5a4aa0', 'accent-ink': '#0c0816', 'accent-wash': 'rgba(74, 58, 144, 0.14)' }, dark, ringD);
  const failures = aaFailures(dim);
  assert.ok(failures.some((f) => /accent as text on the base/.test(f)), 'a dim accent was not reported as unreadable text');
  assert.ok(failures.some((f) => /label on the accent button/.test(f)), 'a dim accent with a dark label was not reported');
  const white = measureAccentExact({ accent: '#ffe08a', 'accent-strong': '#fff0b8', 'accent-ink': '#ffffff', 'accent-wash': 'rgba(255, 224, 138, 0.14)' }, dark, ringD);
  assert.ok(aaFailures(white).some((f) => /label on the accent button/.test(f)), 'a white label on a pale accent was not reported');
  // THE RING CAN FIRE ON ITS OWN. This accent is readable text on every surface of the light theme
  // (4.5:1 or more), and the ring the token file draws from it is not (2.99:1 at 75%). While the ring
  // was measured as the solid accent, no candidate could fail the ring without failing the text.
  const ringOnly = measureAccentExact({ accent: '#1070a8', 'accent-strong': '#0b5a85', 'accent-ink': '#ffffff', 'accent-wash': 'rgba(16, 112, 168, 0.1)' }, light, ringL);
  assert.deepEqual(aaFailures(ringOnly).map((f) => f.replace(/ is .*/, '')), ['focus ring on its worst surface'], 'a readable accent whose ring is under 3:1 must fail on the ring alone');
  assert.ok(ringOnly.textWorst >= AA.text && ringOnly.ringWorst < AA.ring, 'the fixture is not the case it claims to be');
  // ONE HUNDREDTH SHORT IS SHORT. #4878c8 on --paper is 4.4967:1, which rounds to 4.50 and used to pass.
  const near = measureAccentExact({ accent: '#4878c8', 'accent-strong': '#6b94dc', 'accent-ink': '#ffffff', 'accent-wash': 'rgba(72, 120, 200, 0.14)' }, dark, ringD);
  assert.equal(roundRatios(near).textOnBase, 4.5, 'the fixture no longer rounds up to the threshold');
  assert.ok(aaFailures(near).some((f) => /accent as text on the base is 4\.496/.test(f)), 'a ratio of 4.4967 passed because it rounds to 4.50');
  assert.equal(rejectedFamily('#ff8a4c'), 'ember orange', 'the retired ember is not recognised as rejected');
  assert.equal(rejectedFamily('#2f7df6'), 'azure blue', 'azure is not recognised as rejected');
  assert.equal(rejectedFamily('#34d399'), 'green', 'green is not recognised as rejected');
});

test('the token file uses candidate 1: the four accent values match accents.json in both themes', () => {
  const candidate = ACCENTS.candidates.find((c) => c.name === ACCENTS.default);
  assert.ok(candidate, 'accents.json default names no candidate');
  for (const mode of ['dark', 'light']) {
    const decls = Object.fromEntries(BLOCKS[mode].map((d) => [d.name.slice(2), d.value]));
    for (const name of FAMILY) {
      assert.ok(decls[name], `${mode}: --${name} is missing from tokens.css`);
      assert.equal(norm(decls[name]), norm(candidate[mode][name]), `${mode}: --${name} is ${decls[name]} but candidate "${candidate.name}" says ${candidate[mode][name]}`);
    }
  }
});

/* ------------------------------------------------------------------ 5. text tokens on every surface */

for (const mode of ['dark', 'light']) {
  test(`${mode}: every ink and status colour clears 4.5:1 on every surface`, () => {
    const t = THEMES[mode];
    const names = [...TEXT_INKS, ...STATUS_INKS, ...BLOCKS[mode].map((d) => d.name.slice(2)).filter((n) => n.startsWith('syntax-')), 'accent', 'accent-strong'];
    let pairs = 0;
    const bad = [];
    for (const n of names) {
      const fg = t.resolve(n);
      assert.ok(fg, `${mode}: --${n} does not resolve to a solid colour`);
      for (const s of SURFACES) {
        pairs += 1;
        const r = contrast(fg, t.resolve(s));
        if (r < AA.text) bad.push(`--${n} on --${s}: ${r.toFixed(2)}:1`);
      }
    }
    assert.ok(pairs >= 60, `only ${pairs} pairs measured`);
    assert.deepEqual(bad, [], `${mode}: text below ${AA.text}:1:\n  ${bad.join('\n  ')}`);
  });

  test(`${mode}: the surfaces rise in steps and the hairlines are visible against them`, () => {
    const t = THEMES[mode];
    const S = SURFACES.map((s) => t.resolve(s));
    // paper, paper-2, surface, surface-2, surface-3: each step a visible change, none a jump.
    for (let i = 0; i < S.length - 1; i += 1) {
      const step = contrast(S[i], S[i + 1]);
      assert.ok(step > 1.01 && step < 1.5, `${mode}: --${SURFACES[i]} to --${SURFACES[i + 1]} is ${step.toFixed(3)}:1; a surface step must be small but visible`);
    }
    for (const edge of ['line', 'line-strong']) {
      assert.ok(contrast(t.resolve(edge), t.resolve('surface')) > 1.1, `${mode}: --${edge} cannot be seen on --surface`);
    }
  });
}

/* ------------------------------------------------------------------ 6. the system font, nothing downloaded */

/**
 * Everything that would make a page wait for, or phone out for, a font: a declared face, a hosted
 * font service, a font package (Fontsource and its predecessors), and a font FILE named from a
 * stylesheet or an import (woff, woff2, ttf, otf, eot).
 */
const WEBFONT = /@font-face|fonts\.googleapis|fonts\.gstatic|use\.typekit|fonts\.bunny|@fontsource|fontsource\.org|typeface-[a-z]|\.(?:woff2?|ttf|otf|eot)\b/i;
const FONT_PACKAGE = /^(?:@fontsource(?:-variable)?\/|typeface-|@expo-google-fonts\/|fontsource-)/i;

test('the type tokens are the system stack, and no webfont is requested anywhere', () => {
  const body = Object.fromEntries(topLevelRules(CSS).flatMap((r) => declarations(r.body)).map((d) => [d.name, d.value]));
  for (const name of ['--font-body', '--font-display', '--font-sans', '--font-mono']) assert.ok(body[name], `${name} is missing`);
  assert.match(body['--font-body'], /-apple-system/, 'the body stack starts from the system face');
  const SYSTEM = new Set(['-apple-system', 'blinkmacsystemfont', 'segoe ui', 'roboto', 'helvetica neue', 'arial', 'sans-serif', 'ui-monospace', 'sfmono-regular', 'sf mono', 'menlo', 'consolas', 'monospace', 'system-ui', 'ui-sans-serif']);
  for (const name of ['--font-body', '--font-mono']) {
    for (const fam of body[name].split(',').map((x) => x.trim().replace(/^['"]|['"]$/g, '').toLowerCase())) {
      assert.ok(SYSTEM.has(fam), `${name} names "${fam}", which is not a system face`);
    }
  }
  const dirs = ['apps/site/src', 'apps/site/brand', 'apps/site/public', 'apps/web/src', 'packages/design/src/web', 'packages/design/brand'];
  const files = walkText(dirs).concat(['apps/web/index.html'].map((rel) => ({ path: join(ROOT, rel), rel })));
  assert.ok(files.length > 300, `only ${files.length} files scanned; the walk has drifted`);
  const hits = [];
  for (const f of files) {
    if (f.rel.endsWith('tokens.test.mjs') || f.rel.endsWith('flat.test.mjs') || f.rel.endsWith('brand.test.mjs')) continue;
    if (WEBFONT.test(readText(f))) hits.push(f.rel);
  }
  // A font file on disk is a webfont even when nothing names it yet: the next stylesheet will.
  for (const rel of walkNames([...dirs, 'apps/web/public'].filter((d) => existsSync(join(ROOT, d))), /\.(?:woff2?|ttf|otf|eot)$/i)) hits.push(`${rel} (a font file)`);
  // And a font package in a dependency list of either app or of this one.
  for (const pkg of ['apps/site/package.json', 'apps/web/package.json', 'packages/design/package.json']) {
    const json = JSON.parse(readFileSync(join(ROOT, pkg), 'utf8'));
    for (const name of Object.keys({ ...json.dependencies, ...json.devDependencies, ...json.peerDependencies, ...json.optionalDependencies })) if (FONT_PACKAGE.test(name)) hits.push(`${pkg} depends on ${name}`);
  }
  assert.deepEqual(hits, [], `a webfont is requested, declared, packaged or shipped:\n  ${hits.join('\n  ')}`);
});

test('the guard has teeth: every way a font could be pulled in is seen, and the system stack is not', () => {
  for (const src of [
    '@font-face { font-family: X; src: url(x.woff2); }',
    '@import url("https://fonts.googleapis.com/css2?family=Inter");',
    '<link href="https://fonts.bunny.net/css?family=inter">',
    "import '@fontsource/inter/400.css';",
    "import '@fontsource-variable/inter';",
    "import 'typeface-roboto';",
    'a { src: url(../fonts/Inter.woff); }',
    "import inter from './fonts/inter.ttf?url';",
    'src: url(x.otf), url(y.eot);',
  ]) assert.ok(WEBFONT.test(src), `a font request was not seen: ${src}`);
  for (const src of ['font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;', 'font-family: ui-monospace, Menlo, monospace;', '.fontsize { font-size: 14px }']) {
    assert.equal(WEBFONT.test(src), false, `the system stack was reported as a webfont: ${src}`);
  }
  for (const name of ['@fontsource/inter', '@fontsource-variable/inter', 'typeface-inter', '@expo-google-fonts/inter']) assert.ok(FONT_PACKAGE.test(name), `${name} is not recognised as a font package`);
  assert.equal(FONT_PACKAGE.test('react'), false, 'an ordinary package was reported as a font package');
});

test('the hand-written vocabulary the pixel checker reads names only tokens this file declares', async () => {
  const { TOKEN_NAMES } = await import('../tokens.mjs');
  const declared = new Set(topLevelRules(CSS).flatMap((r) => declarations(r.body).map((d) => d.name)));
  assert.ok(TOKEN_NAMES.site.length >= 15, 'the site vocabulary is suspiciously short');
  const missing = TOKEN_NAMES.site.filter((n) => !declared.has(n));
  assert.deepEqual(missing, [], `packages/design/src/tokens.mjs TOKEN_NAMES.site names tokens tokens.css does not declare: ${missing.join(', ')}`);
});

test('the scale tokens exist and are sane: radii tight, space on a 4px grid, motion fast and ordered', () => {
  const v = Object.fromEntries(topLevelRules(CSS).flatMap((r) => declarations(r.body)).map((d) => [d.name, d.value]));
  const px = (n) => { assert.ok(v[n], `${n} is missing`); return parseFloat(v[n]); };
  for (const n of ['--r-xs', '--r-sm', '--r-md', '--r-lg', '--r-xl']) assert.ok(px(n) <= 16, `${n} is not tight`);
  assert.ok(px('--r-xs') < px('--r-sm') && px('--r-sm') < px('--r-md') && px('--r-md') < px('--r-lg') && px('--r-lg') < px('--r-xl'), 'the radii do not ascend');
  for (let i = 1; i <= 8; i += 1) assert.equal(px(`--space-${i}`) % 4, 0, `--space-${i} is off the 4px grid`);
  const ms = (n) => { assert.match(v[n], /^\d+ms$/, `${n} is not a duration in ms`); return parseFloat(v[n]); };
  assert.ok(ms('--t-fast') < ms('--t-color') && ms('--t-color') < ms('--t-base') && ms('--t-base') < ms('--t-slow'), 'the durations do not ascend');
  assert.ok(ms('--t-slow') <= 400, 'a transition longer than 400ms is not under a finger');
  assert.doesNotMatch(Object.values(v).join(' '), /cubic-bezier\([^)]*,\s*1\.[1-9]/, 'an easing overshoots (a y-value above 1.1); nothing in this language springs');
});
