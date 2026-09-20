// THE ONE PICTURE OF OUTPUT ON THE FRONT PAGE, AND EVERY NUMBER BESIDE IT, ANSWERED BY THE RUN.
//
// tests/proof-is-evidence.test.mjs binds the consent band to the plugin's source and to a hand-
// written record of a run. This file binds the band below the demos to a MACHINE-WRITTEN one:
// docs/evidence/ui-showcase/manifest.json, which the showcase run emitted about itself. That
// difference is why the checks here resolve fields rather than search for sentences — a number in a
// manifest has an address, and a figure on a marketing page that names its address can be made to
// prove itself.
//
// SIX PROPERTIES, each one because the failure it catches is cheap and silent:
//
//   1. EVERY FIGURE RESOLVES TO ITS FIELD. Nine numbers are printed. Each carries a dotted path
//      into a manifest, and this file walks the path and compares. Retype one digit, or let the run
//      be re-run with different results, and it goes red rather than drifting.
//
//   2. EVERY POINTER POINTS SOMEWHERE. A figure whose path resolves to undefined fails by name.
//      The failure this catches is a renamed manifest field turning a checked number into an
//      unchecked one while the test still prints green over the ones that survived.
//
//   3. THE CAVEATS ARE VERBATIM. The two sentences that say what the picture is not are quoted out
//      of the manifest, whitespace-normalised on both sides for the reason proof-is-evidence gives.
//      A page that softened "geometry, not a Studio screenshot" into something friendlier would be
//      making the exact claim the band exists to avoid.
//
//   4. NOTHING IS TYPED INTO THE MARKUP. If the component held the numbers or the sentences as
//      literals, properties 1 and 3 would be checking a copy nobody renders. So the values live
//      only in the data module and the component must reference each by name — which also means
//      dropping a figure from the band is a red test rather than a quieter page.
//
//   5. THE SERVED FILE IS THE EVIDENCE FILE, BYTE FOR BYTE. Not a hash of an original that was then
//      cropped — the same bytes. `cmp` in an assertion. A re-render, a clean-up pass or a prettier
//      screenshot all fail here, which is the only way a picture's provenance survives the person
//      who took it.
//
//   6. THE SCREEN NEEDED NO FORCING. The manifest records `asScripted.hidden` per screen, and half
//      the set is hidden behind a button and has to be forced open to be photographed. The band
//      says in words that this is the screen the script leaves behind, so the guard checks that the
//      screen it ships is one for which that is true. Swap in `screen-shop` and this goes red.
//
// Run with:  node --test tests/built-screen-is-evidence.test.mjs     (from apps/site)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BUILT_SCREEN, BUILT_SCREEN_FIGURES, BUILT_SCREEN_CAVEATS } from '../src/data/showcase-proof.ts';
import { visibleCopy } from './lib/visible-copy.mjs';

const SITE = join(dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = join(SITE, '..', '..');
const BAND = join(SITE, 'src', 'components', 'BuiltScreen.astro');
const PAGE = join(SITE, 'src', 'pages', 'index.astro');

const band = readFileSync(BAND, 'utf8');
const page = readFileSync(PAGE, 'utf8');

/** One space for every run of whitespace, so a hard-wrapped source still contains its own sentence. */
const flat = (s) => s.replace(/\s+/g, ' ').trim();

const readManifest = (rel) => {
  const file = join(ROOT, rel);
  assert.ok(existsSync(file), `${rel} is not on disk, so nothing on this band has a source at all`);
  return JSON.parse(readFileSync(file, 'utf8'));
};

const ui = readManifest(BUILT_SCREEN.manifest);
const maps = readManifest(BUILT_SCREEN.mapManifest);

/** The manifest row this band's screen was written by. */
const row = (ui.results ?? []).find((r) => r.id === BUILT_SCREEN.screenId);

/** Walk a dotted path. `undefined` is the answer for a path that does not exist, and is a failure. */
const at = (obj, path) => path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);

/** Where a figure's `in` says to resolve its path. */
const scopeOf = (figure) => (figure.in === 'ui' ? ui : figure.in === 'maps' ? maps : row);

test('THERE IS A ROW TO CHECK AGAINST — a manifest without this screen makes every check below vacuous', () => {
  assert.ok(row,
    `${BUILT_SCREEN.manifest} has no result with id "${BUILT_SCREEN.screenId}". Every figure on the`
    + ' band resolves against that row, so its absence is not a pass — it is this file having read'
    + ' nothing. Ids present: ' + (ui.results ?? []).map((r) => r.id).join(', '));
  assert.ok(BUILT_SCREEN_FIGURES.length >= 8,
    `only ${BUILT_SCREEN_FIGURES.length} figure(s) declared; the band prints more than that, so the`
    + ' flattened list has fallen out of step with the object it mirrors');
  assert.ok(BUILT_SCREEN_CAVEATS.length >= 2,
    'fewer than two caveats declared; the band prints what the picture is not, and both sentences'
    + ' are load-bearing');
});

test('every figure on the band is the number its manifest field holds', () => {
  for (const [name, figure] of BUILT_SCREEN_FIGURES) {
    const actual = at(scopeOf(figure), figure.from);
    assert.notEqual(actual, undefined,
      `${name} points at \`${figure.from}\` in ${figure.in ?? 'the screen row'}, which resolves to`
      + ' nothing. A figure whose field has been renamed is an unchecked figure, not a passing one.');
    assert.equal(actual, figure.value,
      `${name} is printed as ${figure.value} but \`${figure.from}\` is ${actual}.\n`
      + 'Either the page was typed from memory, or the run was repeated and its numbers moved. Read'
      + ' the manifest and take the value it holds; do not edit the manifest to match the page.');
  }
});

test('every caveat on the band is verbatim in the manifest field it names', () => {
  for (const [name, caveat] of BUILT_SCREEN_CAVEATS) {
    const source = at(ui, caveat.from);
    assert.equal(typeof source, 'string',
      `${name} cites \`${caveat.from}\`, which is not a string in ${BUILT_SCREEN.manifest}`);
    assert.ok(flat(source).includes(flat(caveat.text)),
      `${name} is printed on the landing page but does not appear in \`${caveat.from}\`:\n\n`
      + `  ${flat(caveat.text)}\n\nfield holds:\n\n  ${flat(source)}\n\n`
      + 'These two sentences say what the picture is NOT. Softening one is the failure this band was'
      + ' written to avoid, so fix the page, never the quote.');
  }
});

test('no figure and no caveat is typed into the markup, so the page cannot drift from the data', () => {
  const visible = visibleCopy(band);
  for (const [name, caveat] of BUILT_SCREEN_CAVEATS) {
    assert.ok(!flat(visible).includes(flat(caveat.text)),
      `${name} is written out as a literal inside BuiltScreen.astro. Every sentence on that band`
      + ' must render from src/data/showcase-proof.ts, because a literal in the markup is a second'
      + ' copy the provenance check above cannot see.');
  }
  for (const [name, figure] of BUILT_SCREEN_FIGURES) {
    if (figure.value < 10) continue; // a bare 0 or 6 appears in class names, radii and viewBoxes
    const formatted = figure.value.toLocaleString('en-GB');
    for (const spelling of new Set([String(figure.value), formatted])) {
      assert.ok(!visible.includes(spelling),
        `${name} is typed into BuiltScreen.astro as "${spelling}". Render it from the data module so`
        + ' the manifest can answer for it.');
    }
  }
});

test('the band renders every declared figure and caveat, so none can be dropped quietly', () => {
  // Read the markup rather than the build, for the reason proof-is-evidence.test.mjs states: the
  // site's CI job runs the tests with no `astro build` before them, so a guard with teeth only
  // after a build is half a guard.
  for (const [name] of BUILT_SCREEN_CAVEATS) {
    assert.ok(band.includes(`BUILT_SCREEN.${name}.text`),
      `the band declares the ${name} caveat but never renders {BUILT_SCREEN.${name}.text}`);
  }
  // The four in `figures` are rendered by one `.map`, so the loop is what is checked for them.
  assert.match(band, /BUILT_SCREEN\.figures\.map\s*\(/,
    'the band no longer maps over BUILT_SCREEN.figures, so the four tiles are not coming from the data');
  for (const name of ['ms', 'hidden', 'galleryScreens', 'galleryMaps']) {
    assert.ok(band.includes(`BUILT_SCREEN.${name}.value`),
      `the band declares ${name} but never renders {BUILT_SCREEN.${name}.value}. A figure in the`
      + ' data module that no reader sees is evidence this page is not showing.');
  }
});

test('the served picture is the evidence file, byte for byte', () => {
  const { from, sha256, src, width, height, alt } = BUILT_SCREEN.capture;

  const evidence = join(ROOT, from);
  assert.ok(existsSync(evidence),
    `the capture cites ${from}, which is not on disk. The only picture of output on the front page`
    + ' would then have no source at all.');
  const evidenceBytes = readFileSync(evidence);

  const observed = createHash('sha256').update(evidenceBytes).digest('hex');
  assert.equal(observed, sha256,
    `${from} no longer hashes to the value pinned beside it.\n  pinned:   ${sha256}\n  observed: ${observed}\n`
    + 'Either the evidence was replaced or the run was repeated. Re-copy and update the pin'
    + ' together; do not update the pin on its own.');

  const served = join(SITE, 'public', src);
  assert.ok(existsSync(served), `${src} is referenced by the landing but is not bundled at public${src}`);
  assert.ok(evidenceBytes.equals(readFileSync(served)),
    `public${src} is not byte-identical to ${from}.\nThis band's whole claim is that the file a`
    + ' reader receives is the file the renderer wrote — no crop, no resample, no clean-up. A copy'
    + ' that has diverged is a picture nobody can answer for.');

  // The filename carries the head of that hash, so replaced evidence cannot keep the served URL
  // out of a reader's cache.
  assert.ok(src.includes(sha256.slice(0, 10)),
    `${src} does not carry the first ten characters of its own sha256, so a replaced file would be`
    + ' served from the same URL');

  assert.ok(width > 0 && height > 0, 'the capture has no intrinsic size, so the band reflows when it lands');
  assert.ok(alt.trim().length > 40,
    'the capture has no useful alt text; the page\'s only picture of output must be described to a'
    + ' reader who cannot see it');
  assert.ok(!/<script/i.test(evidenceBytes.toString('utf8')),
    'the served SVG contains a <script> element. An <img> will not execute it, but an evidence file'
    + ' that carries code is not an evidence file.');
});

test('the screen on the front page is one the script leaves on screen, not one forced open', () => {
  // Property 6. The band states in words that nothing was hidden; the manifest is what knows.
  assert.equal(row.asScripted?.hidden, 0,
    `${BUILT_SCREEN.screenId} has ${row.asScripted?.hidden} hidden object(s) as scripted, so the`
    + ' picture on the landing is a screen forced open. /showcase labels those; a front page has no'
    + ' room for that footnote, so ship one that does not need it.');
  assert.equal(row.opened, null,
    `${BUILT_SCREEN.screenId} has a separate "opened" render, which means it starts hidden`);
  assert.equal(row.outcome, 'built',
    `${BUILT_SCREEN.screenId} did not build; its outcome is "${row.outcome}"`);
});

test('the manifest names the day the caption claims, so the two cannot drift apart', () => {
  assert.ok(String(ui.generatedAt).startsWith(BUILT_SCREEN.captured),
    `the band is captioned ${BUILT_SCREEN.capturedLabel} but the manifest was generated`
    + ` ${ui.generatedAt}`);
});

test('the landing renders this band, and the gallery it opens is a route something publishes', () => {
  assert.match(visibleCopy(page), /<BuiltScreen\s*\/>/,
    'index.astro imports BuiltScreen but does not render it, so none of the above reaches a reader');

  // /showcase is not an Astro route — it is an object in the worker's D1 static store. The claim
  // that it exists is only as good as the publisher, so the publisher has to be here.
  const publisher = join(ROOT, 'infra', 'deploy-showcase.mjs');
  assert.ok(existsSync(publisher),
    `the band links to ${BUILT_SCREEN.gallery}, which no page in this site builds. The script that`
    + ` publishes it (${publisher}) is not in the repository, so the link is a 404 waiting to happen.`);
  assert.match(readFileSync(publisher, 'utf8'), /showcase/,
    'infra/deploy-showcase.mjs no longer mentions the showcase prefix it is cited for');
});
