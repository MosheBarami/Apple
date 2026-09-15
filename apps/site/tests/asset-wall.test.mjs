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
import { readFileSync } from 'node:fs';
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
    assert.match(a.img, /^https:\/\//, `${a.id}: preview must be https`);
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
  assert.match(wallBlock, /width="256"/);
  assert.match(wallBlock, /height="256"/);
  assert.match(wallBlock, /loading="lazy"/, '24 off-screen images must not be fetched eagerly');
  assert.match(wallBlock, /alt=""/, 'the name is in the card text; an alt repeating it is noise to a screen reader');
});
