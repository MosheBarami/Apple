// The library wall says where every asset came from — or it does not ship.
//
// THE CLAIM THE SECTION MAKES: "each one arrives carrying its pack, its author and its licence, so
// a credit line can be written without anybody reconstructing it later." That sentence is a
// promise about EVERY card, and a wall with one anonymous tile breaks it silently — the tile looks
// like the others and nobody counts.
//
// It also states a number in its own heading. A heading that says "24 of them below" over
// twenty-three cards is the shape this repository keeps finding: a figure that agreed with the data
// on the day it was typed.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SITE = join(dirname(fileURLToPath(import.meta.url)), '..');
const wall = JSON.parse(readFileSync(join(SITE, 'src', 'data', 'asset-wall.json'), 'utf8'));
const PAGE = readFileSync(join(SITE, 'src', 'pages', 'index.astro'), 'utf8');

test('the wall is not empty, and an empty one is a failure rather than a quiet page', () => {
  // scripts/pick-asset-wall.mjs refuses to write a file when every source fails, so an empty
  // wall here means something else emptied it — and a section whose grid renders nothing reads as
  // a library with nothing in it.
  assert.ok(wall.assets.length >= 12, `only ${wall.assets.length} assets — the wall has been emptied`);
});

test('every card carries a pack, an author and a licence', () => {
  //[[ THE PROVENANCE IS THE FEATURE. CC-BY obliges a credit by NAME — game-icons.net is 4,239
  //   icons by dozens of people, and crediting the site would discharge nothing. A row without an
  //   author is a row whose obligation cannot be met, and it must not be on a page that claims
  //   every one can. ]]
  for (const a of wall.assets) {
    for (const field of ['pack', 'author', 'licence', 'licenceUrl', 'source', 'img', 'name']) {
      assert.ok(typeof a[field] === 'string' && a[field].trim(), `${a.id} has no ${field}`);
    }
    assert.match(a.licenceUrl, /^https:\/\//, `${a.id}: the licence must be reachable, not asserted`);
  }
});

test('the pictures are OURS, not hot-linked', () => {
  //[[ THE FAILURE THIS IS WRITTEN FROM. The first version pointed every card at the pack's own CDN.
  //   Every URL answered 200 to curl and NOT ONE rendered: 24 cards in the DOM, 24 <img> elements,
  //   `loaded: 0`. A cross-origin image is at the mercy of the other site's referrer policy, its
  //   hotlink protection and its CORS headers, and none of that is visible from a shell — so
  //   verifying the bytes exist on their server said nothing about whether a browser would draw
  //   them on ours.
  //
  //   `remote` keeps the provenance, `img` is what the page loads, and conflating the two is how a
  //   local copy quietly becomes a hot-link again. ]]
  const { existsSync } = require('node:fs');
  for (const a of wall.assets) {
    assert.match(a.img, /^\/assets\/wall\//, `${a.id} loads from ${a.img} — that is somebody else's server`);
    assert.ok(existsSync(join(SITE, 'public', a.img)), `${a.id}: ${a.img} is not on disk`);
    assert.match(a.remote ?? '', /^https:\/\//, `${a.id} must still record where the picture came from`);
  }
});

test('no licence that cannot be discharged inside a customer’s game', () => {
  // Share-alike would oblige the customer's whole place; non-commercial forbids the product's
  // entire purpose. Neither can be satisfied by a credit line, so neither may appear here.
  for (const a of wall.assets) {
    assert.doesNotMatch(a.licence, /share.?alike|-SA\b|NonCommercial|-NC\b/i,
      `${a.id} carries ${a.licence}, which a customer's Roblox place cannot satisfy`);
  }
});

test('the wall draws on more than one pack', () => {
  // Three packs is the claim the section makes. Twenty-four icons from one source would be a wall
  // that says nothing about the breadth of the library, and it is what a round-robin bug produces.
  const packs = new Set(wall.assets.map((a) => a.pack));
  assert.ok(packs.size >= 3, `only ${packs.size} pack(s): ${[...packs].join(', ')}`);
});

test('the count in the heading is the count that renders', () => {
  // The section prints `{assetWall.count}` and maps `assetWall.assets`. If those two ever come from
  // different places, the page states a number about a list it is not showing.
  assert.equal(wall.count, wall.assets.length, 'the recorded count disagrees with the rows');
  assert.match(PAGE, /\{assetWall\.count\}/, 'the heading must read the count, never a literal');
  assert.match(PAGE, /assetWall\.assets\.map/, 'the grid must render the same array the count came from');
});

test('the pictures are sized in the markup', () => {
  // Without width/height every card is zero-height until its image arrives and the whole section
  // reflows under someone who is reading it.
  const wallBlock = PAGE.slice(PAGE.indexOf('class="ap-wall"'), PAGE.indexOf('</section>', PAGE.indexOf('class="ap-wall"')));
  //[[ AND THE SIZE MUST BE THE PICTURE'S OWN, NOT A CONSTANT.
  //
  //   It was width="256" height="256" on every card, because that is what the CDN query string
  //   asked for. The files that came back are 193x255, 512x512, 137x256 and seven other shapes.
  //   An attribute whose entire job is to reserve the right box was reserving the wrong one — a
  //   guess dressed as a measurement, doing the opposite of what it is for.
  assert.match(wallBlock, /width=\{a\.w\}/, 'the width must come from the file, not a literal');
  assert.match(wallBlock, /height=\{a\.h\}/, 'the height must come from the file, not a literal');
  for (const a of wall.assets) {
    assert.ok(Number.isInteger(a.w) && a.w > 0, `${a.id} has no real width`);
    assert.ok(Number.isInteger(a.h) && a.h > 0, `${a.id} has no real height`);
  }
  assert.match(wallBlock, /loading="lazy"/, '24 off-screen images must not be fetched eagerly');
  assert.match(wallBlock, /alt=""/, 'the name is in the card text; an alt repeating it is noise to a screen reader');
});
