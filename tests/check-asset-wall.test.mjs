// The test of the checker that reads the asset wall out of the BUILT page.
//
// THE FAILURE THIS GUARDS IS NAMED IN THE TASK THAT ASKED FOR THE WALL: a page that says "N of
// them below" while the cards under it come from somewhere else. A count and a set of cards that
// are computed separately will drift, and nobody notices, because both halves look fine on their
// own.
//
// WHAT THIS IS NOT. apps/site/tests/asset-wall.test.mjs checks the DATA and the SOURCE — that
// every row in asset-wall.json carries provenance, and that index.astro binds the count and the
// size attributes to the row rather than typing them. It cannot see what Astro emitted, whether
// the file behind `src` reached dist, or whether the reserved box is the picture's real one. This
// file tests the script that reads dist/index.html and the bytes it points at. Neither subsumes
// the other, and removing either leaves a real gap rather than a duplicate.
//
// THESE TESTS DO NOT RENDER THE REAL PAGE, and that is a real limit rather than an oversight, so
// say where the gap is closed instead of leaving the reader to assume it is. `node --test` runs
// without a site build, so making these tests shell out to Astro would put a 6-second build and a
// node_modules dependency inside the unit suite. The built page is checked instead by the same
// script these fixtures exercise, run against dist in CI — see the "Asset wall says what it shows"
// step in .github/workflows/ci.yml, which runs after "Build marketing site". If that step is ever
// removed, this guard is running on fixtures ONLY and no longer sees the page a reader receives.
// The last test in this file is what says so.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CHECKER = join(ROOT, 'scripts', 'check-asset-wall.mjs');

/* ------------------------------------------------------------------ the fixtures --- */

/** A real 1x1 PNG. Its intrinsic size is 1x1, which is what the cards below reserve. */
const PNG_1x1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64');

/** One card, in the markup apps/site/src/pages/index.astro emits. Everything the guard looks at is
 *  a parameter, so a case can break exactly one thing. */
function card({
  name = 'Arm Chair 01', author = 'Kirill Sannikov', tag = 'Poly Haven · CC0 1.0',
  img = '/assets/wall/armchair.png', w = 1, h = 1, sized = true, placeholder = false,
} = {}) {
  const shot = placeholder
    ? '<span class="ap-wall__none"><span class="ap-wall__none-say">no preview</span></span>'
    : `<img src="${img}" alt=""${sized ? ` width="${w}" height="${h}"` : ''} loading="lazy" decoding="async">`;
  return '<a class="ap-wall__card" role="listitem" href="https://example.invalid/a" rel="noopener nofollow" target="_blank">'
    + `<span class="ap-wall__shot">${shot}</span>`
    + '<span class="ap-wall__meta">'
    + `<span class="ap-wall__name">${name}</span>`
    + `<span class="ap-wall__by">${author}</span>`
    + `<span class="ap-wall__tag">${tag}</span>`
    + '</span></a>';
}

/** A page with a wall in it. `claim` is the number the lede states; it defaults to the truth. */
function page(cards, { claim = null, lede = true, section = true } = {}) {
  const n = claim ?? cards.length;
  const wall = `<div class="ap-wall" role="list">${cards.join('')}</div>`;
  const body = section
    ? '<section class="ap-section" id="library" aria-labelledby="library-title">'
      + '<h2 class="ap-display" id="library-title">Every asset says where it came from.</h2>'
      + (lede ? `<p class="ap-lede">Apple does not invent art. ${n} of them below, picked across three packs.</p>` : '')
      + `${wall}</section>`
    : '<section id="product"><h2>Nothing to see</h2></section>';
  return `<!doctype html><html><body><main>${body}</main></body></html>`;
}

/** Write a page plus the image files its cards point at, and run the checker over it. */
function run(html, { images = ['/assets/wall/armchair.png'], writeImages = true, imageBytes = null } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'wall-'));
  try {
    writeFileSync(join(dir, 'index.html'), html);
    if (writeImages) {
      for (const p of images) {
        const f = join(dir, p);
        mkdirSync(dirname(f), { recursive: true });
        writeFileSync(f, imageBytes ?? PNG_1x1);
      }
    }
    const p = spawnSync(process.execPath, [CHECKER, '--html', join(dir, 'index.html')], { encoding: 'utf8', timeout: 60_000 });
    return { exit: p.status, out: `${p.stdout ?? ''}${p.stderr ?? ''}` };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/* -------------------------------------------------------------------- the guard --- */

test('a wall where every card carries a pack, a licence and an author passes', () => {
  const r = run(page([card(), card({ name: 'Barrel 01', img: '/assets/wall/barrel.png' })]),
    { images: ['/assets/wall/armchair.png', '/assets/wall/barrel.png'] });
  assert.equal(r.exit, 0, r.out);
  assert.match(r.out, /ASSET WALL OK/);
  assert.match(r.out, /2 cards/);
});

test('a card with no licence beside its pack fails, and the message names the card', () => {
  const r = run(page([card(), card({ name: 'Barrel 01', tag: 'Poly Haven', img: '/assets/wall/barrel.png' })]),
    { images: ['/assets/wall/armchair.png', '/assets/wall/barrel.png'] });
  assert.equal(r.exit, 1, r.out);
  assert.match(r.out, /licence/i);
  assert.match(r.out, /Barrel 01/);
});

test('a card with neither pack nor licence fails', () => {
  const r = run(page([card({ name: 'Camera 01', tag: '', img: '/assets/wall/camera.png' })]),
    { images: ['/assets/wall/camera.png'] });
  assert.equal(r.exit, 1, r.out);
  assert.match(r.out, /Camera 01/);
  assert.match(r.out, /pack|licence/i);
});

test('a card with no author fails, and the message names the card', () => {
  const r = run(page([card({ name: 'Chandelier 01', author: '', img: '/assets/wall/chandelier.png' })]),
    { images: ['/assets/wall/chandelier.png'] });
  assert.equal(r.exit, 1, r.out);
  assert.match(r.out, /author/i);
  assert.match(r.out, /Chandelier 01/);
});

test('a lede that claims more cards than are rendered fails', () => {
  const r = run(page([card(), card({ name: 'Barrel 01', img: '/assets/wall/barrel.png' })], { claim: 81648 }),
    { images: ['/assets/wall/armchair.png', '/assets/wall/barrel.png'] });
  assert.equal(r.exit, 1, r.out);
  assert.match(r.out, /81,?648/);
  assert.match(r.out, /2/);
});

test('a section that states no number at all fails rather than passing quietly', () => {
  // A wall nothing binds to a figure is the failure this script is for. Silence is not clean.
  const r = run(page([card()], { lede: false }));
  assert.equal(r.exit, 1, r.out);
  assert.match(r.out, /no count/i);
});

test('an aria-hidden duplicate of the wall is not counted twice', () => {
  // Any decorative echo of the cards is the SAME cards again. Counting it would double every
  // count and make an honest page fail.
  const echo = card().replace('<a class="ap-wall__card"', '<a aria-hidden="true" class="ap-wall__card"');
  // The lede states 1 — the truth — and there are two cards in the DOM. It passes only if the
  // echo is excluded; a guard that counted both would demand the page lie.
  const r = run(page([card(), echo], { claim: 1 }));
  assert.equal(r.exit, 0, r.out);
  assert.match(r.out, /1 cards?/);
});

test('a card whose image file is not there fails rather than shipping a broken image', () => {
  const r = run(page([card({ img: '/assets/wall/gone.png' })]), { writeImages: false });
  assert.equal(r.exit, 1, r.out);
  assert.match(r.out, /gone\.png/);
});

test('a card whose image is not actually an image fails', () => {
  const r = run(page([card()]), { imageBytes: Buffer.from('<!doctype html><title>404</title>') });
  assert.equal(r.exit, 1, r.out);
  assert.match(r.out, /not an image|magic/i);
});

test('a hot-linked picture fails even though the markup is otherwise perfect', () => {
  //[[ THE FAILURE THIS IS WRITTEN FROM. Every URL answered 200 to curl and NOT ONE rendered:
  //   24 cards in the DOM, 24 <img> elements, `loaded: 0`. Referrer policy, hotlink protection
  //   and CORS are invisible from a shell, so "the bytes exist on their server" said nothing
  //   about whether a browser would draw them on ours. ]]
  const r = run(page([card({ img: 'https://cdn.polyhaven.com/asset_img/thumbs/ArmChair_01.png' })]),
    { writeImages: false });
  assert.equal(r.exit, 1, r.out);
  assert.match(r.out, /somebody else's server/);
});

test('a card with no image and no typed placeholder fails', () => {
  const bare = '<a class="ap-wall__card"><span class="ap-wall__shot"></span>'
    + '<span class="ap-wall__meta"><span class="ap-wall__name">Slime</span>'
    + '<span class="ap-wall__by">Min</span>'
    + '<span class="ap-wall__tag">OpenGameArt · CC0 1.0</span></span></a>';
  const r = run(page([bare]));
  assert.equal(r.exit, 1, r.out);
  assert.match(r.out, /Slime/);
});

test('a typed placeholder is an acceptable answer to having no preview', () => {
  const r = run(page([card({ name: 'Slime', author: 'Min', placeholder: true })]), { writeImages: false });
  assert.equal(r.exit, 0, r.out);
});

test('an unsized picture fails, because the section reflows under a reader when it arrives', () => {
  const r = run(page([card({ sized: false })]));
  assert.equal(r.exit, 1, r.out);
  assert.match(r.out, /width and height/i);
});

test('a size attribute that is not the picture’s own size fails', () => {
  //[[ THE ONE apps/site/tests/asset-wall.test.mjs CANNOT REACH. It asserts a.w and a.h are
  //   positive integers, and 256 is a positive integer. `width="256" height="256"` on a 193x255
  //   thumbnail passes there and is exactly the defect — an attribute whose job is to reserve the
  //   right box, reserving the wrong one. Here the file is open, so the box is compared to pixels.
  const r = run(page([card({ w: 256, h: 256 })]));
  assert.equal(r.exit, 1, r.out);
  assert.match(r.out, /256x256/);
  assert.match(r.out, /1x1/);
});

test('a page with no wall at all reports that it verified nothing', () => {
  // THE ONE THAT MATTERS MOST. A guard that cannot find its subject must not print OK.
  const r = run(page([], { section: false }));
  assert.equal(r.exit, 2, r.out);
  assert.doesNotMatch(r.out, /ASSET WALL OK/);
});

test('a wall with zero cards reports that it verified nothing', () => {
  const r = run(page([]));
  assert.equal(r.exit, 2, r.out);
  assert.doesNotMatch(r.out, /ASSET WALL OK/);
});

test('a wall whose cards have been renamed reports that it verified nothing', () => {
  // Restyling must blind the checker loudly rather than emptying it quietly.
  const renamed = card().replace(/ap-wall__card/, 'ap-tile');
  const r = run(page([renamed]));
  assert.equal(r.exit, 2, r.out);
  assert.doesNotMatch(r.out, /ASSET WALL OK/);
});

test('a missing html file is reported, never treated as a clean page', () => {
  const p = spawnSync(process.execPath, [CHECKER, '--html', join(tmpdir(), 'no-such-wall-page.html')], { encoding: 'utf8' });
  assert.notEqual(p.status, 0);
  assert.doesNotMatch(`${p.stdout}${p.stderr}`, /ASSET WALL OK/);
});

/* ------------------------------------------------------- CI: where the gap is closed --- */

/**
 * The header above tells the next reader that the REAL built page is checked in CI, because
 * nothing here renders it. That sentence is a claim about another file, and a claim about another
 * file is exactly the kind of thing that quietly stops being true.
 *
 * So it is checked rather than asserted. If someone drops the CI step this goes red and names what
 * was lost, instead of leaving a comment promising coverage that no longer exists.
 */
test('CI still runs the wall checker against the built page', () => {
  const ci = join(ROOT, '.github', 'workflows', 'ci.yml');
  assert.ok(existsSync(ci), `${ci} is gone — this guard may no longer run against a real page anywhere`);
  const yml = readFileSync(ci, 'utf8');

  const build = yml.indexOf('pnpm --filter @golem/site build');
  const check = yml.indexOf('node scripts/check-asset-wall.mjs');
  assert.ok(check > -1,
    'ci.yml no longer runs scripts/check-asset-wall.mjs. The tests above run on FIXTURES; without '
    + 'that step nothing checks the page a reader actually receives, and the header of this file is '
    + 'now telling the next person something false.');
  assert.ok(build > -1, 'ci.yml no longer builds the marketing site');
  assert.ok(build < check,
    'ci.yml runs the wall checker BEFORE it builds the site, so the checker reads a stale dist '
    + '(or none at all) rather than the page this commit produces');
});
