// THE OLD LAYOUTS ARE GONE, AND NOTHING IMPORTS THEM (handoff 2.2: "Do not reuse old layouts").
//
// The owner's rule is that a redesign which keeps the old layouts fails, and that it is judged side by side against the old
// pages. The cheapest way for a rebuild to keep an old layout is to leave its component in the tree and import it again, so
// the list of what was deliberately replaced is a test: each file below must not exist, and no source file may import one
// by name. Every deletion is recorded, with the owner pick it was, in planning/proof/M2/DECISIONS.md (section 12).
//
// The importer scan is run on a synthetic source first so that a scan that finds nothing cannot pass for a clean tree.
//
// Run with:  node --test tests/old-layouts-gone.test.mjs   (from apps/site; reads source, needs no build)
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { SITE, stripComments, walkFiles } from './lib/dist.mjs';

const SRC = join(SITE, 'src');

/** What the M2 rebuild replaced. Paths are relative to apps/site/src (or apps/site/public where noted). */
const GONE = [
  // The old front-page layout and the page-level furniture around it.
  'layouts/Landing.astro',
  'styles/landing.css',
  'components/BuiltScreen.astro',
  'components/ConsentProof.astro',
  'components/Marquee.astro',
  'components/FAQ.astro',
  'data/showcase-proof.ts',
  'data/consent-proof.ts',
  'data/recorded-run.ts',
  'lib/billing-probe.ts',
  // The owner's picked landing components, each replaced by the rebuild.
  'components/picks/ArrowLink.astro',
  'components/picks/BeamFlow.astro',
  'components/picks/CtaButton.astro',
  'components/picks/DeviceFrame.astro',
  'components/picks/NoiseField.astro',
  'components/picks/ParticleWord.astro',
  'components/picks/PointerRim.astro',
  'components/picks/motion.ts',
  'components/picks/noise.ts',
  'components/picks/scramble.ts',
  'components/picks/ticker.ts',
  // The owner's picked pricing and docs components the new pricing page does not use.
  'components/picks-docs/BeamBorder.astro',
  'components/picks-docs/BuildEstimator.astro',
  'components/picks-docs/PriceSwitch.astro',
  'components/picks-docs/ShinyButton.astro',
  'components/picks-docs/Spotlight.astro',
  'components/picks-docs/rolling-number.ts',
  'components/picks-docs/rolling-number.css',
  // The pages that became redirects.
  'pages/models.astro',
  'pages/proof.astro',
  'pages/changelog.astro',
];

const GONE_DIRS = ['components/picks'];

/** The module names a source file imports, as written. */
function importsOf(text) {
  return [...stripComments(text).matchAll(/(?:^|\n)\s*import\s+(?:[^'"]*?\s+from\s+)?['"]([^'"]+)['"]/g)].map((m) => m[1]);
}

/** Whether `spec` imported from `from` (a path under src) names `gone` (a path under src), with or without an extension. */
function names(spec, from, gone) {
  if (!spec.startsWith('.')) return false;
  const target = resolve(dirname(join(SRC, from)), spec);
  const goneAbs = join(SRC, gone);
  const strip = (p) => p.replace(/\.(?:astro|ts|js|css|json)$/, '');
  return target === goneAbs || strip(target) === strip(goneAbs);
}

test('the import scan can see: it flags an import of a deleted component and a side-effect style import, and passes a live one', () => {
  const src = "import Landing from '../layouts/Landing.astro';\nimport '../styles/landing.css';\nimport Base from '../layouts/Base.astro';\n// import Marquee from '../components/Marquee.astro';";
  const specs = importsOf(src);
  assert.deepEqual(specs, ['../layouts/Landing.astro', '../styles/landing.css', '../layouts/Base.astro']);
  assert.ok(specs.some((s) => names(s, 'pages/index.astro', 'layouts/Landing.astro')));
  assert.ok(specs.some((s) => names(s, 'pages/index.astro', 'styles/landing.css')));
  assert.ok(!specs.some((s) => names(s, 'pages/index.astro', 'components/Marquee.astro')));
});

test('every old layout, component, data file and page the rebuild replaced no longer exists', () => {
  assert.ok(GONE.length > 0);
  for (const rel of GONE) assert.ok(!existsSync(join(SRC, rel)), `src/${rel} still exists: it is an old layout the M2 rebuild replaced`);
  for (const rel of GONE_DIRS) assert.ok(!existsSync(join(SRC, rel)), `src/${rel}/ still exists`);
});

test('the layouts folder holds the one Base layout and the two document layouts that sit on it, and nothing else', () => {
  const layouts = walkFiles(join(SRC, 'layouts'));
  assert.deepEqual(layouts, ['Base.astro', 'DocsLayout.astro', 'LegalLayout.astro']);
  for (const doc of ['DocsLayout.astro', 'LegalLayout.astro']) {
    assert.match(readFileSync(join(SRC, 'layouts', doc), 'utf8'), /import Base from '\.\/Base\.astro'/, `${doc} is not built on Base`);
  }
});

test('no source file imports anything that was deleted, and every page renders through Base (directly or through a layout on it)', () => {
  const files = walkFiles(SRC, (p) => /\.(?:astro|ts|js|mjs)$/.test(p));
  assert.ok(files.length > 0);
  for (const file of files) {
    for (const spec of importsOf(readFileSync(join(SRC, file), 'utf8'))) {
      for (const gone of GONE) assert.ok(!names(spec, file, gone), `${file} imports ${spec}, which the rebuild deleted (${gone})`);
    }
  }
  const pages = files.filter((f) => f.startsWith('pages/') && f.endsWith('.astro'));
  assert.ok(pages.length > 0);
  for (const page of pages) {
    const text = stripComments(readFileSync(join(SRC, page), 'utf8'));
    assert.match(text, /layouts\/(?:Base|DocsLayout|LegalLayout)\.astro/, `${page} does not render through Base, DocsLayout or LegalLayout`);
  }
});

test('index.astro is on Base and carries no copy of the old front page', () => {
  const index = readFileSync(join(SRC, 'pages', 'index.astro'), 'utf8');
  assert.match(index, /layouts\/Base\.astro/);
  assert.doesNotMatch(stripComments(index), /Landing|NoiseField|BuiltScreen|ConsentProof|Marquee|BeamFlow|DeviceFrame|PointerRim/);
});
