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
  assert.doesNotMatch(PAGE, /asset[-_]?wall|assetWall|ap[-_]wall|wall__card/i,
    'index.astro still wires the removed asset wall into the landing');
  assert.doesNotMatch(PAGE, /<(?:img|picture|source)\b/i,
    'index.astro contains an image banner/gallery element; the redesigned root has no banner');
  assert.doesNotMatch(PAGE, /https?:\/\//i,
    'index.astro contains a remote URL; the landing must not depend on a remote image/banner');
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
