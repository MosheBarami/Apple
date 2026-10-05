// NO FAKE OUTPUT (handoff M2, plan section 6): the site shows no build result that did not really happen.
//
// The owner's top frustration is a false success claim, and the old front page carried five kinds of one: a
// "sample critique" drawn by the site, a score out of ten beside it, "Generates real geometry" and "renders the
// scene" (two capabilities the product's own plan removes), and a model screen (BuiltScreen) shipped as the one
// piece of real output. The M2 rebuild shows none of them. Until a piece has passed the bar (M5, shown at M7) the
// only pictures on the site are REAL product UI (the web app, the plugin in Studio), and each one has a record in
// src/data/screens.json: where it came from, the commit it was taken at, the hash of the file, and that it contains
// no build result.
//
// WHAT THIS READS: the BUILT site (apps/site/dist), every page, derived from the folder. WHAT IT PROVES IT CAN SEE:
// the image extractor and the score scanner are each run on a synthetic page first, one that must be caught and one
// that must pass; a scanner that finds nothing is not a clean site.
//
// EVERY IMAGE ON EVERY BUILT ROUTE is judged, not three of them (the first version read /, /catalog and /how-it-works, and an <img> added
// to /pricing, to the docs or, as Markdown, to the blog post passed every test). An <img> is allowed only inside a screenshot figure
// (components/ScreenSlot.astro, `data-screen="<id>"`), only when screens.json has a record of that id, and only when the file's bytes hash to
// the record's sha256. A remote picture, a picture in the blog's Markdown, a <picture>, a <video> and a CSS background picture are not allowed
// anywhere. There is no empty frame: a figure with no picture, and the words "A real screenshot goes here", fail.
//
// Run with:  pnpm --filter @studpilot/site build && node --test tests/no-fake-output.test.mjs   (from apps/site)
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BANNED } from './lib/banned-copy.mjs';
import { DIST, SITE, attrsOf, distPage, distPages, imgsOf, realPages, regionsWith, textOf, walkFiles } from './lib/dist.mjs';

const SCREENS_JSON = join(SITE, 'src', 'data', 'screens.json');
const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

// ---------------------------------------------------------------------------------------------------- the scanners
/** Every "n/10" or "n out of 10" in what a reader sees, with the region that states the bar taken out first. */
function scoresShown(html) {
  let rest = html;
  for (const r of regionsWith(html, 'data-quality-bar')) rest = rest.replace(r.inner, ' ');
  const text = textOf(rest);
  return [...text.matchAll(/\b\d+(?:\.\d+)?\s*\/\s*10\b|\b\d+(?:\.\d+)?\s+out of\s+10\b/gi)].map((m) => m[0]);
}

/** The bar itself: the only place a "/10" may stand, and only as the one bar figure. */
function barScores(html) {
  return regionsWith(html, 'data-quality-bar').flatMap((r) => [...textOf(r.inner).matchAll(/\b\d+(?:\.\d+)?\s*\/\s*10\b/g)].map((m) => m[0]));
}

// ------------------------------------------------------------------------------------- the scanners can see (controls)
test('the score scanner catches a score shown as a result and passes the stated bar', () => {
  assert.deepEqual(scoresShown('<main><p>Critic score <b>6</b> /10</p></main>'), ['6 /10']);
  assert.deepEqual(scoresShown('<main><p>It got 7 out of 10.</p></main>'), ['7 out of 10']);
  assert.deepEqual(scoresShown('<main><ul data-quality-bar><li>8/10 in every area</li></ul><p>No score here.</p></main>'), []);
  assert.deepEqual(scoresShown('<main><ul data-quality-bar><li><ul><li>8/10</li></ul></li></ul><p>9/10</p></main>'), ['9/10']);
  assert.deepEqual(barScores('<ul data-quality-bar><li>8/10 in every area</li></ul>'), ['8/10']);
});

test('the image extractor sees every <img>, however it is written', () => {
  const doc = '<main><figure data-screen-slot="a"><img src="/a.webp" alt="x" width="10" height="5"></figure><picture><img alt=\'y\' src=\'/b.png\' /></picture></main>';
  const imgs = imgsOf(doc);
  assert.equal(imgs.length, 2);
  assert.deepEqual(imgs.map((i) => i.attrs.src), ['/a.webp', '/b.png']);
  assert.equal(attrsOf(imgs[0].tag).width, '10');
  assert.equal(imgsOf('<main><svg><path d="M0 0"/></svg></main>').length, 0);
  assert.equal(regionsWith(doc, 'data-screen-slot').length, 1);
  assert.equal(imgsOf(regionsWith(doc, 'data-screen-slot')[0].inner).length, 1);
});

test('the build was read: every real page parses with a <main>, and there are enough of them for "every route" to mean something', () => {
  const pages = realPages();
  assert.ok(pages.length >= 15, `only ${pages.length} real pages were found in dist`);
  for (const { route, html } of pages) assert.match(html, /<main\b/, `${route} has no <main>: the page was not parsed as a page`);
  for (const route of ['/', '/catalog/', '/how-it-works/', '/pricing/', '/blog/what-works-today/', '/docs/getting-started/']) distPage(route);
});

// ----------------------------------------------------------------------------------------------- the words that are out

test('no page carries a drawn critique, a removed capability, whole-game framing or a results claim', () => {
  const pages = distPages();
  for (const { route, html } of pages) {
    const text = textOf(html);
    for (const [re, what] of BANNED) {
      assert.doesNotMatch(text, re, `${route} says ${what}: "${text.match(re)?.[0]}"`);
    }
  }
});

test('no page ships the old BuiltScreen: no marker, no recorded model screen, no proof assets', () => {
  const pages = distPages();
  for (const { route, html } of pages) {
    assert.doesNotMatch(html, /built-screen|data-built-screen|id="built"/i, `${route} still carries the BuiltScreen band`);
    assert.doesNotMatch(html, /assets\/proof\//, `${route} still references /assets/proof/, where the BuiltScreen svg and consent panel lived`);
    assert.doesNotMatch(html, /model-screen-inventory/, `${route} still references the recorded model screen`);
  }
  assert.ok(!existsSync(join(DIST, 'assets', 'proof')), 'dist/assets/proof still exists: the BuiltScreen svg is still being shipped');
});

test('a score out of ten is never shown as a result; the one "8/10" is the stated bar, inside the quality-bar region', () => {
  const pages = distPages();
  for (const { route, html } of pages) {
    assert.deepEqual(scoresShown(html), [], `${route} shows a score out of ten outside the stated bar`);
    for (const s of barScores(html)) assert.equal(s.replace(/\s/g, ''), '8/10', `${route} states a bar other than 8/10: ${s}`);
  }
  const landing = distPage('/');
  assert.deepEqual(barScores(landing.html).map((s) => s.replace(/\s/g, '')), ['8/10'], 'the landing states the quality bar (8/10 in every area) inside a data-quality-bar region, exactly once');
});

// ------------------------------------------------------------------------------------------------- the screens record
const REQUIRED = ['id', 'file', 'sha256', 'source', 'commit', 'date', 'alt', 'caption'];
/** The landing's hero picture is held to 25 KB (plan step 2.3); scripts/check-landing-budget.mjs counts it and is not raised. */
const HERO_BYTES = 25_000;

function loadScreens() {
  assert.ok(existsSync(SCREENS_JSON), 'apps/site/src/data/screens.json is missing: every image on the site needs a record there');
  const records = JSON.parse(readFileSync(SCREENS_JSON, 'utf8'));
  assert.ok(Array.isArray(records), 'screens.json must be an array of records');
  return records;
}

test('screens.json: every record is complete, claims no build result, and matches the bytes in public/ and dist/', () => {
  const records = loadScreens();
  assert.ok(records.length >= 1, 'screens.json is empty: the landing hero and the catalog use real product UI, so there must be captures (node scripts/m2-capture-ui.mjs)');
  assert.equal(new Set(records.map((r) => r.id)).size, records.length, 'two records share an id');
  for (const r of records) {
    for (const k of REQUIRED) assert.ok(typeof r[k] === 'string' && r[k].length > 0, `screens.json record ${JSON.stringify(r.id ?? r.file)} has no ${k}`);
    assert.equal(r.containsResult, false, `${r.file}: containsResult must be false (only real product UI, never a build result)`);
    assert.match(r.sha256, /^[0-9a-f]{64}$/, `${r.file}: sha256 is not a sha-256`);
    assert.match(r.commit, /^[0-9a-f]{40}$/, `${r.file}: commit is not a full git commit`);
    assert.match(r.date, /^\d{4}-\d{2}-\d{2}$/, `${r.file}: date is not an ISO date`);
    assert.match(r.file, /^\/assets\/screens\/[A-Za-z0-9._-]+\.webp$/, `${r.file}: screens live in /assets/screens/ as webp`);
    assert.match(r.source, /route \/app\/.+(?:mock mode|plugin)/, `${r.id}: the source names no route and no state it was taken in`);
    assert.ok(Number(r.width) > 0 && Number(r.height) > 0, `${r.id}: no size`);
    assert.ok(r.alt.length >= 20, `${r.id}: the alt text says nothing`);
    for (const base of [join(SITE, 'public'), DIST]) {
      const f = join(base, r.file);
      assert.ok(existsSync(f), `${r.file} is recorded but ${f} does not exist`);
      assert.equal(sha256(readFileSync(f)), r.sha256, `${r.file}: the file's hash differs from the recorded one in ${base}`);
    }
  }
});

test('public/assets/screens holds exactly the recorded pictures: no file without a record, no record without a file', () => {
  const records = loadScreens();
  const files = walkFiles(join(SITE, 'public', 'assets', 'screens'));
  assert.deepEqual(files.sort(), records.map((r) => r.file.replace('/assets/screens/', '')).sort());
});

/** Every <img> of a built page with the figure it sits in (or null): { tag, attrs, figure }. */
function picturesOf(html) {
  const figures = regionsWith(html, 'data-screen');
  return imgsOf(html).map(({ tag, attrs }) => ({
    tag,
    attrs,
    figure: figures.find((f) => f.inner.includes(tag)) ?? null,
  }));
}

test('the picture finder can see: an <img> in a figure, a bare <img>, a remote one and a <picture>', () => {
  const doc = '<main><figure data-screen="a" data-width="10"><div><img src="/assets/screens/a.webp" alt="x"></div></figure><img src="https://example.com/x.png" alt="y"><picture><source srcset="/z.webp"></picture></main>';
  const found = picturesOf(doc);
  assert.equal(found.length, 2);
  assert.ok(found[0].figure && !found[1].figure);
  assert.equal(PICTURE_TAGS.exec('<picture>')?.[0], '<picture');
});

const PICTURE_TAGS = /<(?:picture|video|source|embed|object|iframe)\b/i;

test('every <img> on every built page is a recorded real screenshot: inside a screenshot figure, with the record\'s file, hash, alt and size, and none is remote', () => {
  const records = loadScreens();
  let seen = 0;
  for (const { route, html } of realPages()) {
    for (const { attrs, figure } of picturesOf(html)) {
      seen += 1;
      assert.ok(figure, `${route} has an <img> (${attrs.src}) outside a screenshot figure: the only pictures on the site are recorded product screenshots`);
      assert.doesNotMatch(attrs.src ?? '', /^(?:[a-z]+:)?\/\//i, `${route} shows a remote picture: ${attrs.src}`);
      const record = records.find((r) => r.file === attrs.src);
      assert.ok(record, `${route} shows ${attrs.src}, which has no record in screens.json`);
      assert.equal(attrsOf(figure.tag)['data-screen'], record.id, `${route}: the figure around ${attrs.src} is not named for its record`);
      assert.ok(attrs.alt && attrs.alt.trim().length > 0, `${route}: ${attrs.src} has no alt text`);
      assert.equal(attrs.alt, record.alt, `${route}: ${attrs.src} says something other than its record's alt text`);
      assert.equal(attrs.width, String(record.width), `${route}: ${attrs.src} width differs from the record (a fixed size means no layout shift)`);
      assert.equal(attrs.height, String(record.height), `${route}: ${attrs.src} height differs from the record`);
      assert.equal(sha256(readFileSync(join(DIST, attrs.src))), record.sha256, `${route}: ${attrs.src} is not the recorded file`);
    }
  }
  assert.ok(seen >= 3, `only ${seen} images were found on the built site: the finder is blind, or the pages lost their screenshots`);
});

test('no built page carries any other kind of picture: no <picture>, <video>, <source>, <embed>, <object>, <iframe>, <svg><image>, or CSS background picture', () => {
  for (const { route, html } of realPages()) {
    const body = html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ');
    const m = PICTURE_TAGS.exec(body);
    assert.ok(!m, `${route} carries ${m?.[0]}>: pictures are <img> in a screenshot figure only`);
    assert.doesNotMatch(body, /<image\b/i, `${route} draws an SVG <image>`);
    assert.doesNotMatch(html, /url\(\s*['"]?(?!data:)[^)'"]*\.(?:png|jpe?g|webp|avif|gif)/i, `${route} paints a picture from CSS`);
  }
  for (const f of walkFiles(join(DIST, '_astro'), (p) => p.endsWith('.css'))) {
    const css = readFileSync(join(DIST, '_astro', f), 'utf8');
    assert.doesNotMatch(css, /url\(\s*['"]?(?!data:)[^)'"]*\.(?:png|jpe?g|webp|avif|gif)/i, `${f} paints a picture from CSS`);
  }
});

test('every screenshot figure holds exactly one picture and no placeholder: no empty frame, and none of the words of a to-do note', () => {
  const records = loadScreens();
  let figures = 0;
  for (const { route, html } of realPages()) {
    for (const f of regionsWith(html, 'data-screen')) {
      figures += 1;
      const a = attrsOf(f.tag);
      assert.ok(records.some((r) => r.id === a['data-screen']), `${route}: a figure is named ${a['data-screen']} and screens.json has no such record`);
      assert.equal(imgsOf(f.inner).length, 1, `${route}: figure ${a['data-screen']} does not hold exactly one picture`);
      assert.ok(Number(a['data-width']) > 0 && Number(a['data-height']) > 0, `${route}: ${a['data-screen']} has no fixed data-width and data-height`);
      assert.match(f.inner, /aspect-ratio\s*:\s*\d+\s*\/\s*\d+/, `${route}: ${a['data-screen']} does not reserve its box with an aspect-ratio`);
    }
    assert.doesNotMatch(html, /slot__empty|screen-slot|data-screen-slot/, `${route} still carries an empty-slot frame`);
    assert.doesNotMatch(textOf(html), /screenshot goes here|\bgoes here\b|\bTODO\b|lorem ipsum/i, `${route} shows a developer's placeholder note`);
  }
  assert.ok(figures >= 3, `only ${figures} screenshot figures were found: the finder is blind`);
});

test('the landing hero is one eager, high-priority picture of at most 25 KB, and the rest are lazy', () => {
  const records = loadScreens();
  const landing = distPage('/');
  const pics = picturesOf(landing.html);
  assert.equal(pics.length, 1, `the landing shows ${pics.length} pictures: one hero, nothing else (the landing budget is not raised)`);
  const [hero] = pics;
  assert.notEqual(hero.attrs.loading, 'lazy', 'the hero picture is lazy-loaded: it is the largest thing above the fold');
  assert.equal(hero.attrs.fetchpriority, 'high');
  const record = records.find((r) => r.file === hero.attrs.src);
  assert.ok(record.bytes <= HERO_BYTES && readFileSync(join(DIST, record.file)).length <= HERO_BYTES, `the hero picture is over ${HERO_BYTES} bytes`);
  for (const { route, html } of realPages()) {
    if (route === '/') continue;
    for (const { attrs } of picturesOf(html)) assert.equal(attrs.loading, 'lazy', `${route}: ${attrs.src} is below the fold and should be lazy`);
  }
});
