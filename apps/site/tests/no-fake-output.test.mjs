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
// An image on the landing, /catalog or /how-it-works that has no record, or whose bytes differ from the recorded
// hash, fails. The list of images is allowed to be empty today (the captures step adds them); then the guard asserts
// that the fixed-size slots exist and hold no <img>.
//
// Run with:  pnpm --filter @studpilot/site build && node --test tests/no-fake-output.test.mjs   (from apps/site)
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DIST, SITE, attrsOf, distPage, distPages, imgsOf, regionsWith, textOf } from './lib/dist.mjs';

const SCREENS_JSON = join(SITE, 'src', 'data', 'screens.json');
const PICTURE_ROUTES = ['/', '/catalog/', '/how-it-works/'];
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

test('the build was read: every page parses, and the three picture routes exist with a <main>', () => {
  const pages = distPages();
  assert.ok(pages.length > 0);
  for (const route of PICTURE_ROUTES) {
    const page = distPage(route);
    assert.match(page.html, /<main\b/, `${route} has no <main>: the page was not parsed as a page`);
  }
});

// ----------------------------------------------------------------------------------------------- the words that are out
const BANNED = [
  [/sample critique/i, 'a critique the site drew (the old "Sample critique" stage)'],
  [/generates real geometry/i, 'the old "Generates real geometry" capability card (text-to-3D is not in the product)'],
  [/renders the scene/i, 'the old "renders the scene" capability (the product has no vision)'],
  [/text[- ]to[- ]3d/i, 'text-to-3D'],
  [/\b(?:whole|entire|complete)\s+(?:roblox\s+)?games?\b/i, 'whole-game framing (the product builds pieces)'],
  [/\bgame from (?:one|a single) (?:line|prompt|sentence)\b/i, 'whole-game framing'],
  [/\b(?:looks?|sees?) at (?:the |your )?screenshots?\b/i, 'a vision claim (the AI does not look at screenshots)'],
  [/\b\d[\d,]* (?:pieces|builds) (?:passed|built|made|shipped)\b/i, 'a results claim'],
];

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
const REQUIRED = ['file', 'sha256', 'source', 'commit', 'date'];

function loadScreens() {
  assert.ok(existsSync(SCREENS_JSON), 'apps/site/src/data/screens.json is missing: every image on the site needs a record there');
  const records = JSON.parse(readFileSync(SCREENS_JSON, 'utf8'));
  assert.ok(Array.isArray(records), 'screens.json must be an array of records');
  return records;
}

test('screens.json: every record is complete, claims no build result, and matches the bytes in public/ and dist/', () => {
  const records = loadScreens();
  for (const r of records) {
    for (const k of REQUIRED) assert.ok(typeof r[k] === 'string' && r[k].length > 0, `screens.json record ${JSON.stringify(r.file)} has no ${k}`);
    assert.equal(r.containsResult, false, `${r.file}: containsResult must be false (only real product UI, never a build result)`);
    assert.match(r.sha256, /^[0-9a-f]{64}$/, `${r.file}: sha256 is not a sha-256`);
    assert.match(r.commit, /^[0-9a-f]{7,40}$/, `${r.file}: commit is not a git commit`);
    assert.match(r.date, /^\d{4}-\d{2}-\d{2}/, `${r.file}: date is not an ISO date`);
    assert.match(r.file, /^\/assets\/screens\/[A-Za-z0-9._-]+\.(?:webp|png|jpg|avif)$/, `${r.file}: screens live in /assets/screens/`);
    for (const base of [join(SITE, 'public'), DIST]) {
      const f = join(base, r.file);
      assert.ok(existsSync(f), `${r.file} is recorded but ${f} does not exist`);
      assert.equal(sha256(readFileSync(f)), r.sha256, `${r.file}: the file's hash differs from the recorded one in ${base}`);
    }
  }
});

test('every <img> on the landing, /catalog and /how-it-works has a record whose hash matches the file it points at', () => {
  const records = loadScreens();
  let seen = 0;
  for (const route of PICTURE_ROUTES) {
    const page = distPage(route);
    for (const { attrs } of imgsOf(page.html)) {
      seen += 1;
      const record = records.find((r) => r.file === attrs.src);
      assert.ok(record, `${route} shows ${attrs.src}, which has no record in screens.json`);
      assert.ok(attrs.alt && attrs.alt.trim().length > 0, `${route}: ${attrs.src} has no alt text`);
      assert.equal(attrs.width, String(record.width), `${route}: ${attrs.src} width differs from the record (a fixed size means no layout shift)`);
      assert.equal(attrs.height, String(record.height), `${route}: ${attrs.src} height differs from the record`);
      assert.equal(sha256(readFileSync(join(DIST, attrs.src))), record.sha256, `${route}: ${attrs.src} is not the recorded file`);
    }
  }
  // An empty list is allowed (the captures step adds the images), but only because the slots are there and hold none.
  if (seen === 0) assert.equal(records.length, 0, 'screens.json holds records but no page shows an image: the slots are not wired to them');
});

test('every picture route has fixed-size screen slots; a slot holds an <img> only when screens.json has a record for it, and no <img> sits outside a slot', () => {
  const records = loadScreens();
  for (const route of PICTURE_ROUTES) {
    const { html } = distPage(route);
    const slots = regionsWith(html, 'data-screen-slot');
    assert.ok(slots.length > 0, `${route} has no data-screen-slot: the place where a real screenshot goes is missing`);
    let inSlots = 0;
    for (const s of slots) {
      const a = attrsOf(s.tag);
      assert.ok(/^[a-z0-9-]+$/.test(a['data-screen-slot']), `${route}: a slot has no name`);
      assert.ok(Number(a['data-width']) > 0 && Number(a['data-height']) > 0, `${route}: slot ${a['data-screen-slot']} has no fixed data-width and data-height (an unsized slot shifts the page when the picture arrives)`);
      assert.match(a.style ?? '', /aspect-ratio\s*:\s*\d+\s*\/\s*\d+/, `${route}: slot ${a['data-screen-slot']} does not reserve its box with an aspect-ratio`);
      const imgs = imgsOf(s.inner);
      inSlots += imgs.length;
      const record = records.find((r) => r.slot === a['data-screen-slot']);
      if (!record) assert.equal(imgs.length, 0, `${route}: slot ${a['data-screen-slot']} holds an image with no record for that slot`);
      else assert.equal(imgs.length, 1, `${route}: slot ${a['data-screen-slot']} has a record but does not show it`);
    }
    assert.equal(imgsOf(html).length, inSlots, `${route} has an <img> outside a screen slot`);
  }
});
