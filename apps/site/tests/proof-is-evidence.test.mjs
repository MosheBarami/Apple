// A PICTURE AND A TRANSCRIPT ON A MARKETING PAGE ARE WORTH EXACTLY AS MUCH AS THEIR PROVENANCE.
//
// On 2026-09-21 the deployed landing carried `<img>` 0 and `<video>` 0, so every sentence on it was
// a claim. The fix for that is not "add a picture" — it is the harder thing, which is to add only
// pictures and sentences that something in this repository can be made to answer for. This file is
// what makes that binding, and it is the reason the band is allowed to exist at all.
//
// FOUR PROPERTIES, and each one is here because the failure it catches is cheap and silent:
//
//   1. EVERY QUOTE IS IN THE FILE IT NAMES. The band prints eleven strings. Each carries a `from`
//      pointing at either the shipped plugin's source or the record of the run, and this file
//      re-reads that file and looks for the string. Retype one word of the plugin's disclosure and
//      it goes red. This is the anti-fabrication property; everything else here supports it.
//
//   2. NO QUOTE IS TYPED INTO THE MARKUP. If the component held the sentences as literals, property
//      1 would check a copy nobody renders while the page drifted beside it. So the strings must
//      live only in the data module, and the component must reference each one by name — which also
//      means deleting a line from the band is a red test rather than a quieter page.
//
//   3. THE IMAGE IS THE EVIDENCE FILE. The served .webp is a crop of a PNG in docs/evidence, and
//      the data module pins that PNG's sha256. This file re-hashes it. Swap the evidence for a
//      mock-up, a re-render or a prettier shot and the test fails, which is the only way a
//      screenshot's provenance stays true after the person who took it has gone.
//
//   4. NO UNDECLARED IMAGE. Any other `<img>` anywhere on the landing — a stock photo, a logo wall,
//      a gallery — is a picture with no provenance at all, which is what the old blanket ban in
//      asset-wall.test.mjs was really protecting against. See the note there.
//
// WHITESPACE IS NORMALISED ON BOTH SIDES BEFORE COMPARING, and that is not a loosening.
// The evidence document hard-wraps its prose at 100 columns, and two of these sentences are split
// across a newline inside it: the plugin's disclosure at :19-20 and the record's own limitation at
// :129-130. A raw substring check reported both as fabrications when the words are there in order.
// Collapsing runs of whitespace preserves the words and their order — which is the property — and
// gives up only the column the document happens to wrap at, which is not.
//
// Run with:  node --test tests/proof-is-evidence.test.mjs     (from apps/site)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CONSENT_PROOF, CONSENT_PROOF_QUOTES } from '../src/data/consent-proof.ts';
import { visibleCopy } from './lib/visible-copy.mjs';

const SITE = join(dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = join(SITE, '..', '..');
const BAND = join(SITE, 'src', 'components', 'ConsentProof.astro');
const PAGE = join(SITE, 'src', 'pages', 'index.astro');

const band = readFileSync(BAND, 'utf8');
const page = readFileSync(PAGE, 'utf8');

/** One space for every run of whitespace, so a hard-wrapped source still contains its own sentence. */
const flat = (s) => s.replace(/\s+/g, ' ').trim();

/** `from` is a repo-relative path on the quotes and a bare tag on nothing — resolve it either way. */
function sourceFileOf(quote) {
  const path = quote.from === 'plugin' ? CONSENT_PROOF.plugin
    : quote.from === 'record' ? CONSENT_PROOF.record
      : quote.from;
  return join(ROOT, path);
}

test('THE BAND HAS QUOTES TO CHECK — an empty list would make every loop below vacuous', () => {
  assert.ok(CONSENT_PROOF_QUOTES.length >= 10,
    `only ${CONSENT_PROOF_QUOTES.length} quote(s) declared; the band prints more than that, so the`
    + ' flattened list has fallen out of step with the object it is meant to mirror');
});

test('every quoted string on the landing is verbatim in the file it names', () => {
  for (const [name, quote] of CONSENT_PROOF_QUOTES) {
    const file = sourceFileOf(quote);
    assert.ok(existsSync(file),
      `${name} cites ${quote.from}, which resolves to ${file} — a file that is not there. A quote`
      + ' whose source has been moved or deleted is an unsourced quote, not a passing one.');
    const haystack = flat(readFileSync(file, 'utf8'));
    assert.ok(haystack.includes(flat(quote.text)),
      `${name} is printed on the landing page but does not appear in ${quote.from}:\n\n`
      + `  ${flat(quote.text)}\n\n`
      + 'Either it was retyped and has drifted from the product, or the product changed and the page'
      + ' was not updated. Do not fix this by editing the quote to match nothing — read the source'
      + ' file and take the sentence it actually contains.');
  }
});

test('the plugin quotes come from the plugin and the transcript from the record', () => {
  // The distinction is the point of having two sources: UI wording must be answerable by the code
  // that renders it, and observations must be answerable by the record of the run. A band that
  // sourced everything from the prose document would pass test one while proving nothing about the
  // shipped panel.
  const bySource = new Map();
  for (const [name, quote] of CONSENT_PROOF_QUOTES) {
    bySource.set(quote.from, [...(bySource.get(quote.from) ?? []), name]);
  }
  assert.ok((bySource.get(CONSENT_PROOF.plugin) ?? []).length >= 3,
    'fewer than three strings are quoted from the shipped plugin source; the two access lines and'
    + ' the standing disclosure are panel wording and must be answerable by the panel');
  assert.ok((bySource.get(CONSENT_PROOF.record) ?? []).length >= 5,
    'fewer than five strings are quoted from the record of the run');
});

test('no quoted sentence is typed into the markup, so the page cannot drift from the data', () => {
  for (const [name, quote] of CONSENT_PROOF_QUOTES) {
    assert.ok(!flat(band).includes(flat(quote.text)),
      `${name} is written out as a literal inside ConsentProof.astro. Every sentence in that band`
      + ' must be rendered from src/data/consent-proof.ts, because a literal in the markup is a'
      + ' second copy that the provenance check above cannot see.');
  }
});

test('the band renders every declared quote, so none can be dropped quietly', () => {
  // Read the markup rather than the build: apps/site's CI job runs `pnpm -r test` with no site
  // build before it (see the same reasoning in withdrawn-modes.test.mjs), so a guard that only has
  // teeth after `astro build` is half a guard. The names come from the flattened list, so a quote
  // added to the data and forgotten in the markup fails here.
  for (const [name] of CONSENT_PROOF_QUOTES) {
    assert.ok(band.includes(`CONSENT_PROOF.${name}.text`),
      `the band declares ${name} but never renders {CONSENT_PROOF.${name}.text}. A quote in the`
      + ' data module that no reader sees is evidence this page is not showing.');
  }
});

test('the served capture is a crop of the evidence file, and that file still hashes to its pin', () => {
  const { from, sha256, src, width, height, alt } = CONSENT_PROOF.capture;

  const evidence = join(ROOT, from);
  assert.ok(existsSync(evidence),
    `the capture cites ${from}, which is not on disk. The picture on the front page would then have`
    + ' no source at all.');
  const observed = createHash('sha256').update(readFileSync(evidence)).digest('hex');
  assert.equal(observed, sha256,
    `${from} no longer hashes to the value pinned beside it.\n  pinned:   ${sha256}\n  observed: ${observed}\n`
    + 'Either the evidence was replaced, or the page is showing a crop of something else. Re-crop'
    + ' from the real file and update the pin together; do not update the pin on its own.');

  const served = join(SITE, 'public', src);
  assert.ok(existsSync(served),
    `${src} is referenced by the landing but is not bundled at public${src}`);

  assert.ok(width > 0 && height > 0,
    'the capture has no intrinsic size, so the band reflows when the image lands');
  assert.ok(alt.trim().length > 20,
    'the capture has no useful alt text; a screenshot that is the page\'s only evidence must be'
    + ' described to a reader who cannot see it');
});

test('every image on the landing is a declared capture — nothing undeclared, nothing remote', () => {
  // Property 4. The old rule in asset-wall.test.mjs was "no <img> at all", which was the right
  // shape for a page that had no evidence to show and the wrong shape once it did. This is the
  // narrower rule that survives: an image is allowed exactly when something can answer for it.
  //[[ COMMENTS COME OUT FIRST, AND THIS GUARD LEARNED THAT ABOUT ITSELF ON ITS FIRST RUN.
  //   The band's own header comment explains why the picture is there, and it does so by writing
  //   the words `<img>` and `<video>` — so the scan matched its own explanation and reported a
  //   bare, source-less image tag that no reader will ever receive. That is this repository's
  //   recurring failure in miniature: the instrument could not tell the page from the note beside
  //   it, and rendered that inability as a finding. tests/lib/visible-copy.mjs is the shared
  //   stripper six other guards in this directory already use for exactly this. ]]
  const declared = new Set([CONSENT_PROOF.capture.src]);
  for (const source of [visibleCopy(page), visibleCopy(band)]) {
    for (const tag of source.matchAll(/<img\b[^>]*>/gi)) {
      const literal = tag[0].match(/\bsrc\s*=\s*["']([^"']+)["']/i);
      assert.ok(!literal,
        `an <img> on the landing hard-codes src="${literal?.[1]}". Every image must come from`
        + ' src/data/consent-proof.ts so its provenance is checkable.');
      const bound = tag[0].match(/\bsrc\s*=\s*\{([^}]+)\}/);
      assert.ok(bound, `an <img> on the landing has no src at all:\n  ${tag[0]}`);
      assert.match(bound[1], /CONSENT_PROOF\.capture\.src/,
        `an <img> on the landing takes its src from \`${bound[1].trim()}\`, which is not a declared`
        + ' capture');
      assert.match(tag[0], /\balt=/, `an <img> on the landing has no alt attribute:\n  ${tag[0]}`);
      assert.match(tag[0], /\bwidth=/, `an <img> on the landing has no width, so it reflows the page on load`);
      assert.match(tag[0], /\bheight=/, `an <img> on the landing has no height, so it reflows the page on load`);
    }
  }
  assert.equal(declared.size, 1, 'more captures are declared than this guard enumerates');
});

test('the record names the day the capture claims, so the two cannot drift apart', () => {
  assert.ok(CONSENT_PROOF.record.includes(CONSENT_PROOF.captured),
    `the band is captioned ${CONSENT_PROOF.capturedLabel} but its record is ${CONSENT_PROOF.record},`
    + ' which names a different day');
  assert.ok(CONSENT_PROOF.capture.from.includes(CONSENT_PROOF.captured),
    `the capture is captioned ${CONSENT_PROOF.capturedLabel} but was taken from`
    + ` ${CONSENT_PROOF.capture.from}, which names a different day`);
});
