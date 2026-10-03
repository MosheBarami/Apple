/**
 * THE LANDING PICKS THAT SURVIVED THE EMBER RAIL REBUILD ARE STILL MOUNTED, AND THE RETIRED ONES ARE GONE.
 *
 * RESTATED 2026-10-02 (phase 6). This file used to hold 541 lines about twenty picks of the owner's
 * landing lane: four noise grounds, a particle wordmark, a pointer rim, the beams, a tilting tablet,
 * a ticker, a liquid button and a scramble-text nav, with a section that EXECUTED each canvas loop
 * against a recording DOM to prove it stopped off screen and under reduced motion.
 *
 * The owner's 2026-10-02 brief rebuilt the design from zero around one flat, hairline language with
 * no ambient motion (docs/DESIGN-LOCK.md is superseded by it). The canvas kit, the ticker, the tablet
 * and the scramble were removed from the site, together with their sheets and scripts, so there is
 * nothing left to execute. Deleting those assertions with the code is the retirement, not a weakening:
 * a test of a component that no longer exists cannot fail for any reason that matters. What the
 * retirement DOES need is the reverse guarantee, and that is here: none of the retired pieces may
 * come back by import, and no canvas, WebGL context or pointer-following layer may be mounted on a
 * public page. The new contract (the Baseplate toy, the Rail, the Snap) is in ember-landing.test.mjs.
 *
 * WHAT STAYS FROM THE OLD FILE, in its old shape: the mount map for the picks that still render
 * (ArrowLink on three components), the "a mount removed turns this red" mutation check that proves
 * the scan is not vacuous, and the sheet rules (no glow, no gradient fill, no violet, no hidden
 * cursor, no green) for every pick sheet that is left.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SITE = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(SITE, 'src');
const PICKS = join(SRC, 'components', 'picks');
const read = (...p) => readFileSync(join(SRC, ...p), 'utf8');

/** Comments of every kind this site writes, removed. Scripts and frontmatter stay: imports live there. */
const strip = (s) => s
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ')
  .replace(/<!--[\s\S]*?-->/g, ' ')
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/(^|[^:])\/\/.*$/gm, '$1');

const frontmatter = (s) => (/^---\r?\n([\s\S]*?)\r?\n---/.exec(s) ?? [, ''])[1];
const markup = (s) => s.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '');

/* ============================================================================ 1. the mounts === */

const INDEX = ['pages', 'index.astro'];
const MOUNTS = [
  { name: 'ArrowLink', file: INDEX, from: 'picks/ArrowLink.astro', use: /<ArrowLink\b[^>]*href=/ },
  { name: 'ArrowLink', file: ['components', 'ConsentProof.astro'], from: 'picks/ArrowLink.astro', use: /<ArrowLink\b[^>]*href="\/proof"/ },
  { name: 'ArrowLink', file: ['components', 'BuiltScreen.astro'], from: 'picks/ArrowLink.astro', use: /<ArrowLink\b[^>]*href=/ },
  { name: 'Baseplate', file: INDEX, from: 'components/Baseplate.astro', use: /<Baseplate\s*\/>/ },
];

/** Why a mount is missing, or null when it is there. Pure, so the mutation test below can use it. */
function missing(mount, source) {
  const s = strip(source);
  const importRe = new RegExp(`import\\s+${mount.name}\\s+from\\s+['"][^'"]*${mount.from.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}['"]`);
  if (!importRe.test(frontmatter(s))) return `${mount.file.join('/')} does not import ${mount.name}`;
  if (!mount.use.test(markup(s))) return `${mount.file.join('/')} imports ${mount.name} but does not mount it where it belongs (${mount.use})`;
  return null;
}

for (const mount of MOUNTS) {
  test(`${mount.name} is mounted in ${mount.file.join('/')}`, () => {
    assert.equal(missing(mount, read(...mount.file)), null);
  });
}

test('the Nav and Footer are on the home page', () => {
  const page = strip(read(...INDEX));
  for (const name of ['Nav', 'Footer']) {
    assert.match(frontmatter(page), new RegExp(`import\\s+${name}\\s+from`), `index.astro does not import ${name}`);
    assert.match(markup(page), new RegExp(`<${name}\\b`), `index.astro does not render <${name}>`);
  }
});

test('removing a mount turns this file red (the checker is not vacuous)', () => {
  for (const mount of MOUNTS) {
    const source = read(...mount.file);
    const tagless = source.replace(new RegExp(`<${mount.name}\\b[\\s\\S]*?(?:\\/>|<\\/${mount.name}>)`, 'g'), '');
    assert.notEqual(missing(mount, tagless), null, `${mount.name} still "passes" with every <${mount.name}> removed from ${mount.file.join('/')}`);
    const commented = source.replace(new RegExp(`(<${mount.name}\\b[\\s\\S]*?(?:\\/>|<\\/${mount.name}>))`, 'g'), '{/* $1 */}');
    assert.notEqual(missing(mount, commented), null, `${mount.name} still "passes" when it is only commented in`);
  }
});

/* ===================================================================== 2. the retired kit stays gone === */

const RETIRED = [
  'NoiseField', 'ParticleWord', 'BeamFlow', 'Aura', 'PointerRim', 'DeviceFrame', 'CtaButton', 'Marquee',
  'noise-field', 'particle-word', 'beam-flow', 'pointer-rim', 'device-frame', 'cta-button', 'ticker', 'scramble',
];

function walk(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

test('the retired canvas, ticker and tablet kit is not imported by anything under src', () => {
  const files = walk(SRC).filter((f) => /\.(astro|ts|js|mjs)$/.test(f));
  assert.ok(files.length > 30, `only ${files.length} source files walked; the scan has drifted`);
  const back = [];
  for (const f of files) {
    const code = strip(readFileSync(f, 'utf8'));
    for (const name of RETIRED) {
      if (new RegExp(`from\\s+['"][^'"]*\\b${name}(?:\\.astro|\\.ts)?['"]|import\\s+['"][^'"]*\\b${name}\\b`).test(code)) {
        back.push(`${f.replace(SITE, '')} imports ${name}`);
      }
    }
  }
  assert.deepEqual(back, [], `a retired pick came back:\n  ${back.join('\n  ')}`);
});

test('nothing the front page, the layouts, the Nav or the Footer reaches mounts a canvas or a WebGL context', () => {
  // The roots, and everything they import. The pricing and docs components (picks-docs) are not part
  // of this slice of the rebuild: BeamBorder still draws a card border on a canvas on /pricing, and
  // that is on the list of what remains, not something this test pretends is gone.
  const roots = [
    join(SRC, 'pages', 'index.astro'), join(SRC, 'layouts', 'Landing.astro'), join(SRC, 'layouts', 'Base.astro'),
    join(SRC, 'components', 'Nav.astro'), join(SRC, 'components', 'Footer.astro'),
  ];
  const seen = new Set();
  const queue = [...roots];
  while (queue.length) {
    const f = queue.pop();
    if (seen.has(f) || !existsSync(f)) continue;
    seen.add(f);
    for (const m of readFileSync(f, 'utf8').matchAll(/from\s+['"](\.[^'"]+?\.(?:astro|ts))['"]|import\s+['"](\.[^'"]+?\.(?:astro|ts))['"]/g)) {
      queue.push(join(dirname(f), m[1] ?? m[2]));
    }
  }
  assert.ok(seen.size >= 10, `only ${seen.size} files reached from the front page; the walk has drifted`);
  const files = [...seen].filter((f) => /\.(astro|ts)$/.test(f));
  const bad = [];
  for (const f of files) {
    const code = strip(readFileSync(f, 'utf8'));
    if (/<canvas\b|getContext\(\s*['"](?:webgl2?|experimental-webgl)['"]\s*\)|\bnew\s+OffscreenCanvas\b/.test(code)) bad.push(f.replace(SITE, ''));
  }
  assert.deepEqual(bad, [], `the design has no canvas or WebGL (docs/DESIGN-LOCK.md, phase 6): ${bad.join(', ')}`);
});

/* ============================================================== 3. the sheets that are left obey === */

test('no pick sheet brings in a glow, a gradient fill, violet, a hidden cursor or green', () => {
  const sheets = readdirSync(PICKS).filter((f) => f.endsWith('.css'));
  assert.ok(sheets.length >= 1, 'no pick sheet was found; the scan has drifted');
  for (const name of sheets) {
    const css = strip(readFileSync(join(PICKS, name), 'utf8'));
    assert.doesNotMatch(css, /background(?:-image)?\s*:[^;]*gradient\(/, `${name} paints a gradient background (masks are fine, fills are not)`);
    assert.doesNotMatch(css, /box-shadow\s*:[^;]*\b0\s+0\s+\d+px/, `${name} draws a glow`);
    assert.doesNotMatch(css, /var\(--autonomous/, `${name} uses the Autonomous violet`);
    assert.doesNotMatch(css, /cursor\s*:\s*none/, `${name} hides the cursor`);
    assert.doesNotMatch(css, /var\(--(?:green|success)|#(?:0f0|00ff00|22c55e|16a34a)\b/i, `${name} uses green`);
  }
});

test('the picks folder holds exactly what the page mounts, so nothing is a demo nobody imports', () => {
  const files = readdirSync(PICKS).sort();
  // motion.ts is shared with picks-docs/ShinyButton; ArrowLink is the one mounted pick.
  assert.deepEqual(files, ['ArrowLink.astro', 'arrow-link.css', 'motion.ts'],
    'a file appeared in components/picks that this file does not account for: mount it and list it here, or remove it');
  assert.ok(existsSync(join(PICKS, 'motion.ts')));
});
