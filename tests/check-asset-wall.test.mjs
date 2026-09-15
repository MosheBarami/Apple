// The test of the checker that reads the asset wall — and of the wall's own baked data.
//
// THE FAILURE THIS GUARDS IS NAMED IN THE TASK THAT ASKED FOR THE WALL: a heading that says
// "from a library of N" while the cards under it come from somewhere else. A count and a set of
// cards that are computed separately will drift, and nobody notices, because both halves look
// fine on their own.
//
// TWO GROUPS, AND THEY SEE DIFFERENT THINGS. Say which, because one of them cannot see the page:
//
//   RENDERED  feeds scripts/check-asset-wall.mjs real HTML — a good wall, and then walls with one
//             specific thing wrong each. This is where "every card carries a licence and an
//             author" and "the heading's number equals the cards rendered" are actually tested,
//             because both are properties of the DOM a reader receives.
//
//   BAKED     reads the `const wall` array out of apps/site/src/pages/index.astro and checks the
//             real page's real data: provenance on every row, and an image file on disk for every
//             row that claims one. It does NOT render the page.
//
// NEITHER GROUP RENDERS THE REAL PAGE, and that is a real limit rather than an oversight, so say
// where the gap is closed instead of leaving the reader to assume it is. `node --test` runs
// without a site build, so making these tests shell out to Astro would put a 6-second build and a
// node_modules dependency inside the unit suite. The built page is checked instead by the same
// script these fixtures exercise, run against dist in CI — see the "Asset wall says what it
// shows" step in .github/workflows/ci.yml, which runs after "Build marketing site". If that step
// is ever removed, the rendered half of this guard is running on fixtures ONLY and no longer sees
// the page a reader receives.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CHECKER = join(ROOT, 'scripts', 'check-asset-wall.mjs');
const PAGE = join(ROOT, 'apps', 'site', 'src', 'pages', 'index.astro');
const PUBLIC = join(ROOT, 'apps', 'site', 'public');

/* ------------------------------------------------------------------ the fixtures --- */

/** One card. Everything the guard looks at is a parameter, so a case can break exactly one. */
function card({ name = 'Chest', kind = 'Prop', pack = 'Pirate Kit · Kenney', licence = 'CC0-1.0', author = 'Kenney', img = '/library/chest.png', placeholder = false } = {}) {
  const shot = placeholder
    ? '<span class="ap-wall__none"><span class="ap-wall__none-kind">' + kind + '</span><span class="ap-wall__none-say">no preview</span></span>'
    : `<img src="${img}" alt="" width="72" height="72" loading="lazy" decoding="async">`;
  return '<li class="ap-wall__card">'
    + `<span class="ap-wall__shot">${shot}</span>`
    + `<span class="ap-wall__name">${name}</span>`
    + `<span class="ap-wall__kind">${kind}</span>`
    + `<span class="ap-wall__pack">${pack}</span>`
    + `<span class="ap-wall__prov"><span class="ap-wall__lic ap-mono">${licence}</span>`
    + `<span class="ap-wall__by">${author}</span></span>`
    + '</li>';
}

/** A page with a wall in it. `claim` is what the heading says; it defaults to the truth. */
function page(cards, { claim = null, echo = true, section = true } = {}) {
  const n = claim ?? cards.length;
  const track = `<ul class="ap-wall__track">${cards.join('')}</ul>`;
  const twin = echo ? `<ul class="ap-wall__track ap-wall__track--echo" aria-hidden="true">${cards.join('')}</ul>` : '';
  const wall = `<div class="ap-wall"><div class="ap-wall__row ap-wall__row--1">${track}${twin}</div></div>`;
  const body = section
    ? `<section class="ap-section" id="library" aria-labelledby="library-title">`
      + `<h2 class="ap-display" id="library-title">${n} assets, with the licence and the author on every one.</h2>`
      + `${wall}</section>`
    : '<section id="product"><h2>Nothing to see</h2></section>';
  return `<!doctype html><html><body><main>${body}</main></body></html>`;
}

/** Write a page plus the image files its cards point at, and run the checker over it. */
function run(html, { images = ['/library/chest.png'], writeImages = true, imageBytes = null } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'wall-'));
  try {
    writeFileSync(join(dir, 'index.html'), html);
    if (writeImages) {
      for (const p of images) {
        const f = join(dir, p);
        mkdirSync(dirname(f), { recursive: true });
        // A real 1x1 PNG unless the case wants something that only looks like one.
        writeFileSync(f, imageBytes ?? Buffer.from(
          'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
          'base64'));
      }
    }
    const p = spawnSync(process.execPath, [CHECKER, '--html', join(dir, 'index.html')], { encoding: 'utf8', timeout: 60_000 });
    return { exit: p.status, out: `${p.stdout ?? ''}${p.stderr ?? ''}` };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/* --------------------------------------------------------------- RENDERED: the guard --- */

test('a wall where every card carries a licence and an author passes', () => {
  const r = run(page([card(), card({ name: 'Cannon', img: '/library/cannon.png' })]),
    { images: ['/library/chest.png', '/library/cannon.png'] });
  assert.equal(r.exit, 0, r.out);
  assert.match(r.out, /ASSET WALL OK/);
  assert.match(r.out, /2 card/);
});

test('a card with no licence fails, and the message names the card', () => {
  const r = run(page([card(), card({ name: 'Cannon', licence: '', img: '/library/cannon.png' })]),
    { images: ['/library/chest.png', '/library/cannon.png'] });
  assert.equal(r.exit, 1, r.out);
  assert.match(r.out, /licence/i);
  assert.match(r.out, /Cannon/);
});

test('a card with no author fails, and the message names the card', () => {
  const r = run(page([card({ name: 'Tractor', author: '', img: '/library/tractor.png' })]),
    { images: ['/library/tractor.png'] });
  assert.equal(r.exit, 1, r.out);
  assert.match(r.out, /author/i);
  assert.match(r.out, /Tractor/);
});

test('a heading that claims more cards than are rendered fails', () => {
  const r = run(page([card(), card({ name: 'Cannon', img: '/library/cannon.png' })], { claim: 81648 }),
    { images: ['/library/chest.png', '/library/cannon.png'] });
  assert.equal(r.exit, 1, r.out);
  assert.match(r.out, /81,?648/);
  assert.match(r.out, /2/);
});

test('the echo track is not counted as cards — it is the same cards again', () => {
  // The seamless loop duplicates the track. If the guard counted both, a heading stating the
  // truth would read as half the cards and every honest page would fail.
  const r = run(page([card()]), { images: ['/library/chest.png'] });
  assert.equal(r.exit, 0, r.out);
  assert.match(r.out, /1 card/);
});

test('a card whose image file is not there fails rather than shipping a broken image', () => {
  const r = run(page([card({ img: '/library/gone.png' })]), { writeImages: false });
  assert.equal(r.exit, 1, r.out);
  assert.match(r.out, /gone\.png/);
});

test('a card whose image is not actually an image fails', () => {
  const r = run(page([card()]), { imageBytes: Buffer.from('<!doctype html><title>404</title>') });
  assert.equal(r.exit, 1, r.out);
  assert.match(r.out, /not an image|magic/i);
});

test('a card with no image and no typed placeholder fails', () => {
  const bare = '<li class="ap-wall__card"><span class="ap-wall__shot"></span>'
    + '<span class="ap-wall__name">Slime</span><span class="ap-wall__kind">UI icon</span>'
    + '<span class="ap-wall__pack">x</span><span class="ap-wall__prov">'
    + '<span class="ap-wall__lic ap-mono">CC0-1.0</span><span class="ap-wall__by">Min</span></span></li>';
  const r = run(page([bare]));
  assert.equal(r.exit, 1, r.out);
  assert.match(r.out, /Slime/);
});

test('a typed placeholder is an acceptable answer to having no preview', () => {
  const r = run(page([card({ name: 'Slime', kind: 'UI icon', author: 'Min', placeholder: true })]), { writeImages: false });
  assert.equal(r.exit, 0, r.out);
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

test('a missing html file is reported, never treated as a clean page', () => {
  const p = spawnSync(process.execPath, [CHECKER, '--html', join(tmpdir(), 'no-such-wall-page.html')], { encoding: 'utf8' });
  assert.notEqual(p.status, 0);
  assert.doesNotMatch(`${p.stdout}${p.stderr}`, /ASSET WALL OK/);
});

/* -------------------------------------------------------------- BAKED: the real page --- */

/**
 * The rows as they are written in the page, parsed strictly.
 *
 * Strictly, because the alternative is a regex that silently matches nothing and hands every
 * assertion below an empty list to pass over. The count is asserted before anything uses it.
 */
function bakedRows() {
  const src = readFileSync(PAGE, 'utf8');
  const begin = src.indexOf('/* wall:begin');
  const end = src.indexOf('/* wall:end');
  assert.ok(begin > -1 && end > begin,
    'apps/site/src/pages/index.astro has no wall:begin / wall:end markers — the baked array could not be found at all');
  const block = src.slice(begin, end);
  const re = /\{\s*id:\s*"([^"]*)",\s*name:\s*"((?:[^"\\]|\\.)*)",\s*kind:\s*"([^"]*)",\s*pack:\s*"((?:[^"\\]|\\.)*)",\s*source:\s*"((?:[^"\\]|\\.)*)",\s*licence:\s*"([^"]*)",\s*author:\s*"((?:[^"\\]|\\.)*)",\s*img:\s*(null|"[^"]*")\s*\}/g;
  const rows = [...block.matchAll(re)].map((m) => ({
    id: m[1], name: m[2], kind: m[3], pack: m[4], source: m[5], licence: m[6], author: m[7],
    img: m[8] === 'null' ? null : m[8].slice(1, -1),
  }));
  assert.ok(rows.length > 0,
    'the baked wall array did not parse. Every row must be { id, name, kind, pack, source, licence, author, img }. '
    + 'This is a dead harness, not a clean page: it has verified nothing.');
  return rows;
}

test('every baked row carries a licence and an author', () => {
  const rows = bakedRows();
  const bad = rows.filter((r) => !r.licence.trim() || !r.author.trim());
  assert.deepEqual(bad.map((r) => r.id), [], 'rows on the wall with no licence or no author');
});

test('every baked row carries a name, a kind and a pack', () => {
  const rows = bakedRows();
  const bad = rows.filter((r) => !r.name.trim() || !r.kind.trim() || !r.pack.trim());
  assert.deepEqual(bad.map((r) => r.id), [], 'rows on the wall missing name, kind or pack');
});

test('every baked image is a file on disk that really is an image', () => {
  const rows = bakedRows();
  const bad = [];
  for (const r of rows) {
    if (!r.img) continue;
    const f = join(PUBLIC, r.img.replace(/^\//, ''));
    if (!existsSync(f)) { bad.push(`${r.id}: ${r.img} is not in apps/site/public`); continue; }
    const head = readFileSync(f).subarray(0, 4);
    const png = head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47;
    if (!png) bad.push(`${r.id}: ${r.img} has no PNG magic bytes`);
  }
  assert.deepEqual(bad, [], 'wall images that are missing or are not images');
});

test('the heading takes its number FROM the array rather than restating it', () => {
  // A SOURCE CHECK, and it is the one thing the rendered group cannot reach without a build.
  // The count in the heading must be the array's own length expression: a literal there is a
  // number that can drift away from the cards under it, which is the whole failure.
  const src = readFileSync(PAGE, 'utf8');
  const h2 = /<h2[^>]*id="library-title"[^>]*>([\s\S]*?)<\/h2>/.exec(src);
  assert.ok(h2, 'the wall section has no <h2 id="library-title"> in index.astro');
  assert.match(h2[1], /\{\s*wall\.length\s*\}/,
    'the wall heading states a count that is not bound to the array it renders');
  assert.doesNotMatch(h2[1].replace(/\{[^}]*\}/g, ''), /\d/,
    'the wall heading carries a hand-written number beside the bound one');
});

/**
 * The deal, written out rather than evaluated out of the page.
 *
 * An earlier version of the test below ran the page's own expression through `new Function`. That
 * reads better and is worse: it executes repository source to check repository source, so the
 * check passes for any expression that happens to run, including a wrong one. Spelling the rule
 * here means the test knows what the page is SUPPOSED to do, and says so when the page stops
 * doing it.
 */
const DEAL_RULE = 'const wallRows = [0, 1, 2].map((r) => wall.filter((_, i) => i % 3 === r));';

test('the wall is dealt across three rows by a rule that loses nothing', () => {
  // A SOURCE CHECK. Two halves: the page uses this exact deal, and this deal is a partition of
  // the real array — every card in exactly one row, no card dropped, no card shown twice.
  const src = readFileSync(PAGE, 'utf8');
  assert.ok(src.includes(DEAL_RULE),
    `index.astro no longer deals the wall with:\n  ${DEAL_RULE}\n`
    + 'If the deal changed on purpose, change it here too and re-check that it is still a partition.');

  const rows = bakedRows();
  const dealt = [0, 1, 2].map((r) => rows.filter((_, i) => i % 3 === r));
  assert.equal(dealt.flat().length, rows.length, 'the rows do not add up to the whole array');
  assert.equal(new Set(dealt.flat().map((r) => r.id)).size, rows.length, 'a card is dealt into more than one row');
  assert.ok(dealt.every((r) => r.length > 0), 'a row of the wall would render empty');
});

/* ------------------------------------------------------- CI: where the gap is closed --- */

/**
 * The header above tells the next reader that the REAL built page is checked in CI, because
 * neither group here renders it. That sentence is a claim about another file, and a claim about
 * another file is exactly the kind of thing that quietly stops being true.
 *
 * So it is checked rather than asserted. If someone drops the CI step this goes red and names
 * what was lost, instead of leaving a comment promising coverage that no longer exists.
 */
test('CI still runs the wall checker against the built page', () => {
  const ci = join(ROOT, '.github', 'workflows', 'ci.yml');
  assert.ok(existsSync(ci), `${ci} is gone — the rendered half of this guard may no longer run anywhere`);
  const yml = readFileSync(ci, 'utf8');

  const build = yml.indexOf('pnpm --filter @golem/site build');
  const check = yml.indexOf('node scripts/check-asset-wall.mjs');
  assert.ok(check > -1,
    'ci.yml no longer runs scripts/check-asset-wall.mjs. The tests above run on FIXTURES and on '
    + 'source; without that step nothing checks the page a reader actually receives, and the '
    + 'header of this file is now telling the next person something false.');
  assert.ok(build > -1, 'ci.yml no longer builds the marketing site');
  assert.ok(build < check,
    'ci.yml runs the wall checker BEFORE it builds the site, so the checker reads a stale dist '
    + '(or none at all) rather than the page this commit produces');
});
