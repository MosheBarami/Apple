// The asset library remains a licensed dataset, but the redesigned landing does not pretend to
// be an asset catalogue. Keep the provenance checks here while guarding that the root route does
// not grow a fabricated banner or static result wall again.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SITE = join(dirname(fileURLToPath(import.meta.url)), '..');
const wall = JSON.parse(readFileSync(join(SITE, 'src', 'data', 'asset-wall.json'), 'utf8'));
const PAGE = readFileSync(join(SITE, 'src', 'pages', 'index.astro'), 'utf8');
const CSS = readFileSync(join(SITE, 'src', 'styles', 'landing.css'), 'utf8');

test('the licensed asset dataset still exists even though the landing no longer renders it', () => {
  // The library is still used by the product and its licensing evidence must not disappear just
  // because the root route changed shape. An empty dataset would make every provenance loop below
  // vacuous, so fail loudly before checking any row.
  assert.ok(Array.isArray(wall.assets) && wall.assets.length >= 12,
    `only ${wall.assets?.length ?? 0} assets — the licensing dataset is empty or malformed`);
});

test('every retained asset carries reachable provenance', () => {
  // CC-BY needs an author, and a credit is useful only when the source and licence can be reached.
  // This remains a dataset contract; it makes no claim that these images appear on the landing.
  for (const asset of wall.assets) {
    for (const field of ['pack', 'author', 'licence', 'licenceUrl', 'source', 'img', 'name']) {
      assert.ok(typeof asset[field] === 'string' && asset[field].trim(),
        `${asset.id} has no ${field}`);
    }
    assert.match(asset.licenceUrl, /^https:\/\//,
      `${asset.id}: licenceUrl must be an HTTPS source, not an assertion`);
    assert.match(asset.source, /^https:\/\//,
      `${asset.id}: source must remain an HTTPS provenance link`);
    assert.match(asset.remote ?? '', /^https:\/\//,
      `${asset.id}: remote must retain the original asset location`);
  }
});

test('local asset previews remain local and license-compatible', () => {
  for (const asset of wall.assets) {
    assert.match(asset.img, /^\/assets\/wall\//,
      `${asset.id} points at ${asset.img}, which is not a bundled preview`);
    assert.ok(existsSync(join(SITE, 'public', asset.img)),
      `${asset.id}: bundled preview ${asset.img} is missing`);
    assert.doesNotMatch(asset.licence, /share.?alike|-SA\b|NonCommercial|-NC\b/i,
      `${asset.id} carries ${asset.licence}, which cannot be discharged in a customer's game`);
  }
});

test('the dataset retains breadth across independent packs', () => {
  const packs = new Set(wall.assets.map((asset) => asset.pack));
  assert.ok(packs.size >= 3, `only ${packs.size} pack(s): ${[...packs].join(', ')}`);
});

test('the landing has no asset banner, image wall, or remote image dependency', () => {
  // The new root is a conversation invitation, not a gallery. These are structural tripwires for
  // the old wall/banner returning under a new sentence: a landing image, a wall data import, a
  // wall class, or a remote image URL would all present an asset result the route did not produce.
  //
  //[[ THE BLANKET `<img>` BAN WAS RE-AIMED ON 2026-09-21, AND DELIBERATELY NOT DELETED.
  //
  //   What stood here was `assert.doesNotMatch(PAGE, /<(?:img|picture|source)\b/i)` — no image on
  //   the landing, ever. That was the correct shape for a page with nothing honest to show: the
  //   wall it replaced presented stock thumbnails as if they were an asset result the route had
  //   produced, which is the failure this whole file exists for.
  //
  //   It stopped being the correct shape once the page had real evidence. The owner's standing
  //   instruction for this site is "do not make claims when we can demonstrate them", and measured
  //   against the live origin that morning the deployed landing carried `<img>` 0 and `<video>` 0
  //   — so every sentence on it, including the product's central safety promise, was a claim. The
  //   band that now sits under the hero shows one screenshot of the shipped plugin's own panel
  //   inside a real Roblox Studio, pinned by sha256 to the evidence file it was cropped from.
  //
  //   THE PROPERTY WAS NEVER "NO IMAGES". It was "no image a reader would take for a result that
  //   nothing can answer for", and that is what is enforced now — here, by the two rules below,
  //   and in tests/proof-is-evidence.test.mjs, which checks that every image the landing renders
  //   is declared in src/data/consent-proof.ts, is bundled locally, carries alt and intrinsic
  //   size, and is a crop of a docs/evidence file that still hashes to its pin.
  //
  //   IT READS THE COMPONENTS NOW, WHICH IS THE HALF THAT MATTERS. The old assertion looked only
  //   at index.astro, so the picture would have passed it untouched simply by being rendered from
  //   components/ConsentProof.astro — a guard that goes on printing green because the thing it
  //   watches for moved one file over is worse than no guard, because it looks like coverage. ]]
  assert.doesNotMatch(PAGE, /asset[-_]?wall|assetWall|ap[-_]wall|wall__card/i,
    'index.astro still wires the removed asset wall into the landing');

  // index.astro's OWN markup still carries no image element. A section that earns a picture earns
  // a component and the provenance checks that come with one; a banner dropped straight into the
  // page is how the wall arrived the first time.
  assert.doesNotMatch(PAGE, /<(?:img|picture|source)\b/i,
    'index.astro contains an image element directly. Render it from a component whose images are'
    + ' declared in src/data/consent-proof.ts, so tests/proof-is-evidence.test.mjs can answer for it.');

  // The page's own rule is unchanged and stays absolute: not one http(s) URL anywhere in
  // index.astro, comments included. It has passed that way since the wall was removed and there is
  // no reason for the front page's markup to name a remote host at all.
  assert.doesNotMatch(PAGE, /https?:\/\//i,
    'index.astro contains a remote URL; the landing must not depend on a remote image/banner');

  // The components it pulls in get the narrower, attribute-scoped form of the same rule rather than
  // the absolute one. An SVG namespace URI — `xmlns="http://www.w3.org/2000/svg"`, which
  // components/AppleMark.astro carries — is a constant string the XML spec requires and is fetched
  // by nobody; failing on it would be the guard reporting a namespace as a network dependency.
  // What matters is what the browser actually goes and loads, which is src, srcset and href.
  //[[ THE PATH IS MATCHED, NOT THE IMPORT STATEMENT, AND THAT DIFFERENCE WAS MEASURED.
  //   This was anchored to `^import X from '...'` first. Changing one import's quotes to backticks
  //   dropped that component out of the scan and the whole test still printed green, because the
  //   two survivors cleared the floor below. A finder tied to one spelling of one statement is a
  //   finder that a refactor silently narrows. Any mention of a components/*.astro path in the page
  //   is what gets read now, which survives quote style, named imports and dynamic ones alike. ]]
  const rendered = [];
  for (const rel of new Set([...PAGE.matchAll(/\.\.\/components\/([A-Za-z0-9_-]+\.astro)/g)].map((m) => m[1]))) {
    const file = join(SITE, 'src', 'components', rel);
    assert.ok(existsSync(file), `index.astro names components/${rel}, which is not on disk`);
    rendered.push([`src/components/${rel}`, readFileSync(file, 'utf8')]);
  }
  // A LOOP OVER NOTHING IS NOT A CHECK. If the import syntax on the page ever changes shape — a
  // named import, a different quote style, a components/ path written another way — this regex
  // would quietly match zero files and every assertion below would pass over an unread tree. The
  // landing has imported .astro components since before this rule existed; zero means the finder
  // broke, not that the components went away.
  assert.ok(rendered.length >= 2,
    `only ${rendered.length} component(s) of the landing were found to check — the import scan in`
    + ' this test has stopped matching index.astro, so the rules below have read almost nothing');
  for (const [name, source] of rendered) {
    assert.doesNotMatch(source, /(?:src|srcset|href)\s*=\s*["']https?:\/\//i,
      `${name} loads something over the network; the landing must not depend on a remote image or`
      + ' banner, and an image that can be swapped by whoever hosts it is not evidence');
    for (const tag of source.matchAll(/<(?:img|picture|source)\b[^>]*\bsrc\s*=\s*["']([^"']*)["'][^>]*>/gi)) {
      assert.fail(`${name} hard-codes an image src="${tag[1]}". Every image on the landing must come`
        + ' from src/data/consent-proof.ts so its provenance is checkable.');
    }
  }

  assert.doesNotMatch(CSS, /(?:asset[-_]?wall|ap[-_]wall|wall__|background-image\s*:\s*url\()/i,
    'landing.css still paints the removed asset/banner wall');
});

test('the landing derives visible model choices from the shared list, not a stale asset count', () => {
  const modelImport = /import\s*\{[^}]*\bPRODUCT_MODELS\b[^}]*\}\s*from\s*['"]@golem\/shared['"]/;
  assert.match(PAGE, modelImport,
    'the landing no longer reads the shared product model list');
  assert.match(PAGE, /PRODUCT_MODELS\.map\s*\(/,
    'model cards are not derived from PRODUCT_MODELS');
  assert.doesNotMatch(PAGE, /\{assetWall\.(?:count|assets)\}/,
    'index.astro contains a stale library count with no rendered source of truth');
});
