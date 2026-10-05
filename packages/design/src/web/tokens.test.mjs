/**
 * THE DESIGN TOKENS: one file, spent by both apps, with one accent that passes WCAG AA.
 *
 * packages/design/src/web/tokens.css is the only place a colour, radius, space, type or motion value
 * is declared. These tests hold the properties that make that true and keep it true:
 *
 *   1. both apps import it, first, and depend on the package that carries it;
 *   2. it declares exactly one --accent per theme, and no other sheet in either app declares one;
 *   3. no retired accent literal is left anywhere outside this package, and no accent value of any
 *      candidate is typed into an app (an app reads the token);
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
  AA, ACCENTS_JSON_PATH, OLD_ACCENT_LITERALS, SURFACES, STATUS_INKS, TEXT_INKS, TOKENS_CSS_PATH,
  aaFailures, contrast, declarations, measureAccent, readTokensCss, stripComments, surfacesOf,
  theme, themeBlocks, topLevelRules,
} from './css-tokens.mjs';
import { ROOT, readText, walkText } from './tests/repo-walk.mjs';

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

test('no other stylesheet or component style in either app declares a token of the accent family', () => {
  const files = walkText(['apps/site/src', 'apps/web/src']).concat([{ path: join(ROOT, 'apps/web/index.html'), rel: 'apps/web/index.html' }]);
  assert.ok(files.length > 300, `only ${files.length} app files scanned; the walk has drifted`);
  const stray = [];
  for (const f of files) {
    // The vendored AI Elements CSS (Tailwind's own `--accent` for shadcn) is third-party and byte-pinned.
    if (f.rel.startsWith('apps/web/src/components/ai-elements/') || f.rel.startsWith('apps/web/src/components/aicss/') || f.rel.startsWith('apps/web/src/components/ui/')) continue;
    for (const m of stripComments(readText(f)).matchAll(/(?:^|[;{\s'"])(--accent(?:-strong|-ink|-wash|-ring)?)\s*:/g)) stray.push(`${f.rel}: ${m[1]}`);
  }
  assert.deepEqual(stray, [], `the accent family is declared outside tokens.css:\n  ${stray.join('\n  ')}`);
});

/* ------------------------------------------------------------------ 3. no accent literals in the apps */

test('no retired accent literal exists in any tracked source outside packages/design', () => {
  const files = walkText(['apps', 'packages', 'scripts', 'tools', 'infra', 'tests', '.github', 'supabase'], { skipPaths: [
    'packages/asset-library', 'packages/corpus', 'packages/training', 'packages/owner-corpus', 'packages/design',
  ] });
  assert.ok(files.length > 1500, `only ${files.length} files scanned; the walk has drifted`);
  const hits = [];
  for (const f of files) {
    const src = readText(f).toLowerCase().replace(/rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/g, 'rgba($1,$2,$3');
    for (const lit of OLD_ACCENT_LITERALS) if (src.includes(lit)) hits.push(`${f.rel}: ${lit}`);
  }
  assert.deepEqual(hits, [], `a retired accent literal is still in the tree:\n  ${hits.join('\n  ')}`);
});

test('no accent value of any candidate is typed into an app: an app reads the token', () => {
  const values = ACCENTS.candidates.flatMap((c) => ['dark', 'light'].flatMap((m) => [c[m].accent, c[m]['accent-strong']])).map((v) => v.toLowerCase());
  assert.equal(new Set(values).size, values.length, 'two candidates share an accent value');
  const files = walkText(['apps/site/src', 'apps/web/src', 'apps/web/scripts']);
  const hits = [];
  for (const f of files) {
    const src = readText(f).toLowerCase();
    for (const v of values) if (src.includes(v)) hits.push(`${f.rel}: ${v}`);
  }
  assert.ok(files.length > 300, `only ${files.length} app files scanned; the walk has drifted`);
  assert.deepEqual(hits, [], `an accent colour is hard-coded in an app; use var(--accent) or var(--accent-strong):\n  ${hits.join('\n  ')}`);
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
      const m = measureAccent(c[mode], surfaces[mode]);
      measured += Object.keys(m).length;
      assert.deepEqual(aaFailures(m), [], `${c.name}/${mode} is below WCAG AA`);
      assert.deepEqual(c.measured?.[mode], m, `${c.name}/${mode}: the recorded ratios are stale; run \`node packages/design/src/web/measure-accents.mjs --write\``);
    }
  }
  assert.equal(measured, 3 * 2 * 6, 'the measurement count drifted; a ratio is not being measured');
});

test('the guard has teeth: a candidate that is too dim, or too bright for its label, is reported', () => {
  const surfaces = surfacesOf(THEMES.dark);
  const dim = measureAccent({ accent: '#4a3a90', 'accent-strong': '#5a4aa0', 'accent-ink': '#0c0816', 'accent-wash': 'rgba(74, 58, 144, 0.14)' }, surfaces);
  const failures = aaFailures(dim);
  assert.ok(failures.some((f) => /accent as text on the base/.test(f)), 'a dim accent was not reported as unreadable text');
  assert.ok(failures.some((f) => /label on the accent button/.test(f)), 'a dim accent with a dark label was not reported');
  const white = measureAccent({ accent: '#ffe08a', 'accent-strong': '#fff0b8', 'accent-ink': '#ffffff', 'accent-wash': 'rgba(255, 224, 138, 0.14)' }, surfaces);
  assert.ok(aaFailures(white).some((f) => /label on the accent button/.test(f)), 'a white label on a pale accent was not reported');
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
  const files = walkText(['apps/site/src', 'apps/site/brand', 'apps/site/public', 'apps/web/src', 'packages/design/src/web', 'packages/design/brand'])
    .concat(['apps/web/index.html'].map((rel) => ({ path: join(ROOT, rel), rel })));
  assert.ok(files.length > 300, `only ${files.length} files scanned; the walk has drifted`);
  const hits = [];
  for (const f of files) {
    if (f.rel.endsWith('tokens.test.mjs') || f.rel.endsWith('flat.test.mjs') || f.rel.endsWith('brand.test.mjs')) continue;
    const src = readText(f);
    if (/@font-face|fonts\.googleapis|fonts\.gstatic|use\.typekit|fonts\.bunny/i.test(src)) hits.push(f.rel);
  }
  assert.deepEqual(hits, [], `a webfont is requested or declared:\n  ${hits.join('\n  ')}`);
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
