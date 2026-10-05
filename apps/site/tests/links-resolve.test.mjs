/**
 * EVERY INTERNAL LINK AND EVERY ANCHOR ON THIS SITE GOES SOMEWHERE.
 *
 * THE FAILURE THIS EXISTS FOR IS WRITTEN IN THE REPOSITORY'S OWN HISTORY. `Nav.astro` carried this
 * comment for months:
 *
 *     "The landing is one viewport now, so /#how, /#modes and /#proof no longer exist. Anchors to
 *      sections that were deleted are worse than no links at all — they land the reader at the top
 *      of the page with nothing to see and no explanation."
 *
 * The diagnosis was exactly right and the comment outlived the page it described: the landing was
 * rebuilt, #product, #library, #modes, #how and #pricing all came back, and the site navigation
 * went on offering three links out of six because a sentence about a deleted section was still
 * there. Nobody could see that the reason had expired, because nothing measured it.
 *
 * So this measures it. A fragment that names nothing, and a route that serves nothing, are the two
 * ways a link lies — and both are invisible to a build, a type-check and every other test here.
 *
 * READS THE BUILT OUTPUT, like counted-copy.test.mjs and for the same reason: the customer reads
 * rendered HTML, and a checker that reads source is checking a different document. Run
 * `npx astro build` first.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SITE = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(SITE, 'dist');

function pages(dir = '') {
  const out = [];
  for (const entry of readdirSync(join(DIST, dir)).sort()) {
    const rel = dir ? `${dir}/${entry}` : entry;
    if (statSync(join(DIST, rel)).isDirectory()) out.push(...pages(rel));
    else if (entry === 'index.html' || entry.endsWith('.html')) out.push(rel);
  }
  return out;
}

/** `/pricing/index.html` is reached as `/pricing`; the root one as `/`. */
const routeOf = (file) => '/' + file.replace(/(^|\/)index\.html$/, '').replace(/\.html$/, '');

/** The file a route would serve, in the worker's own lookup order (see apps/worker/src/static.ts). */
function fileFor(route, all) {
  const clean = route.replace(/\/$/, '') || '/';
  for (const candidate of [
    clean.slice(1),
    `${clean.slice(1)}.html`,
    `${clean === '/' ? '' : `${clean.slice(1)}/`}index.html`,
  ]) {
    if (candidate && all.includes(candidate)) return candidate;
  }
  return null;
}

/**
 * ROUTES THIS SITE LINKS TO THAT ASTRO DOES NOT BUILD.
 *
 * RE-AIMED 2026-09-21, and the history matters because the alternative was to weaken this file.
 * `/showcase` is a real, reachable page — sixteen Roblox screens and six playable maps the
 * deployed model built from the product's own library — but it is an object in the Worker's D1
 * static store, uploaded by `infra/deploy-showcase.mjs`, not a file under `apps/site/src/pages`.
 * So `fileFor` cannot see it, and the nav link to it would read as broken to the check below.
 *
 * The property this file defends is "every internal link goes somewhere a reader can reach", NOT
 * "every internal link is an Astro page" — the second was only ever a cheap proxy for the first,
 * and it was correct until the day the site gained a route from somewhere else. Naming the route
 * here re-aims the check at the property.
 *
 * AN EXEMPTION LIST IS A HOLE UNLESS SOMETHING GUARDS IT, which is the whole reason the value is a
 * publisher path and not a comment: `the exempt routes are published by something in this
 * repository` below reads that file and fails if it does not actually ship the route. Adding
 * `/anything` here without a publisher does not buy silence.
 */
//
// RE-AIMED AGAIN 2026-10-05 (M2 rebuild): /showcase is built by Astro now. It is one of the four removed routes (/models, /proof,
// /showcase, /changelog) that astro.config.mjs redirects, so the built file overwrites the old static row and the exemption is gone,
// exactly as the test below said it must be. The map is empty and stays as the mechanism for the next route the Worker serves.
const WORKER_SERVED = new Map();

const built = existsSync(DIST) ? pages() : [];
const html = new Map(built.map((f) => [f, readFileSync(join(DIST, f), 'utf8')]));
const ids = new Map([...html].map(([f, body]) => [f, new Set([...body.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]))]));

test('the built site is there to be read', () => {
  assert.ok(built.length >= 10, `only ${built.length} built pages found — run \`npx astro build\` first; this test would check nothing`);
});

test('every internal link resolves to a page that exists', () => {
  const broken = [];
  for (const [file, body] of html) {
    for (const [, href] of body.matchAll(/href="(\/[^"#?]*)(?:[?#][^"]*)?"/g)) {
      // /app/* is the SPA, served by the worker from a different bundle, and /api/* is the worker.
      if (href.startsWith('/app') || href.startsWith('/api') || href.startsWith('/v1')) continue;
      if (/\.(png|svg|ico|xml|json|webmanifest|txt|webp|jpg|css|js)$/.test(href)) continue;
      if (WORKER_SERVED.has(href.replace(/\/$/, '') || '/')) continue;
      if (!fileFor(href, built)) broken.push(`${routeOf(file)} -> ${href}`);
    }
  }
  assert.deepEqual([...new Set(broken)].sort(), [], 'a link to a route nothing serves:\n  ' + [...new Set(broken)].sort().join('\n  '));
});

test('every anchor names an id that is on the page it points at', () => {
  const dangling = [];
  for (const [file, body] of html) {
    for (const [, href] of body.matchAll(/href="([^"]*#[^"]+)"/g)) {
      if (/^https?:/.test(href)) continue;
      const [path, frag] = href.split('#');
      // Same-document fragments resolve against this page; `/x#y` against that page.
      const targetFile = path === '' ? file : fileFor(path, built);
      if (!targetFile) continue; // the route itself is the other test's finding, not this one's
      if (!ids.get(targetFile)?.has(frag)) dangling.push(`${routeOf(file)} -> ${href}`);
    }
  }
  assert.deepEqual(
    [...new Set(dangling)].sort(),
    [],
    'an anchor to a section that is not there lands the reader at the top of a page with nothing to '
      + 'see and no explanation:\n  ' + [...new Set(dangling)].sort().join('\n  '),
  );
});

test('the exempt routes are published by something in this repository, and no route Astro builds is still exempt', () => {
  // WHAT MAKES THE EXEMPTION HONEST. A route listed above is being excused from the does-it-resolve check on the claim that the
  // Worker serves it. This reads the file that is supposed to do the serving and fails if it does not name the route, so the claim
  // costs something. And the opposite drift: the day Astro builds a route that is exempt, the entry becomes a lie that silently
  // stops the real check from running on a real page.
  const repo = join(SITE, '..', '..');
  for (const [route, publisher] of WORKER_SERVED) {
    const path = join(repo, publisher);
    assert.ok(existsSync(path), `${route} is exempt on the word of ${publisher}, which does not exist`);
    const source = readFileSync(path, 'utf8');
    assert.ok(source.includes(`'${route}'`) || source.includes(`"${route}"`), `${publisher} is named as the publisher of ${route} but never mentions that path`);
    assert.equal(fileFor(route, built), null, `${route} is now built by Astro: delete its ${publisher} exemption so the ordinary check covers it`);
  }
  // The four routes the rebuild removed are BUILT (as redirects), so none of them needs an exemption.
  for (const route of ['/models', '/proof', '/showcase', '/changelog']) {
    assert.ok(fileFor(route, built), `${route} is not in the build: it must be an Astro redirect so it overwrites the old static row`);
    assert.ok(!WORKER_SERVED.has(route), `${route} is built, so it must not be exempt`);
  }
});

// RESTATED 2026-10-05 (M2 rebuild). This asserted that every page links to /showcase, the gallery of screens the model built. The
// gallery is deleted on purpose (no fake output: nothing the site shows may be a build that did not really happen) and /showcase
// redirects to /catalog. The property it protected is "the page that holds the product's evidence is reachable from every page,
// the front page included, and nobody tidies the link away": the evidence page is the catalog now, so that is what is held.
test('every page reaches the catalog, the landing included', () => {
  assert.ok(html.size >= 10, 'too few pages built for this to mean anything');
  const real = [...html].filter(([, body]) => !/<meta http-equiv="refresh"/i.test(body));
  assert.ok(real.length >= 10, 'too few real pages built for this to mean anything');
  const missing = real.filter(([, body]) => !/href="\/catalog\/?"/.test(body)).map(([f]) => routeOf(f)).sort();
  assert.deepEqual(missing, [], 'pages with no route to the catalog:\n  ' + missing.join('\n  '));
  assert.ok(real.some(([f]) => f === 'index.html'), 'the landing is not among the pages checked');
});

// RESTATED 2026-10-05 (M2 rebuild). The old navigation offered `/#section` links, and the question was whether the landing really had
// those ids. The new navigation offers pages, not sections. The property is the same one in its new form: the navigation is SHARED and
// every link in it works from every page, so the primary navigation of every real page offers the same links as the front page's, and
// any fragment among them names an id the landing has.
test('the navigation is the same on every page, and any fragment in it names an id the landing has', () => {
  const primary = (body) => [...(body.match(/<nav\b[^>]*id="primary-nav"[\s\S]*?<\/nav>/)?.[0] ?? '').matchAll(/<a\b[^>]*\shref="([^"]+)"/g)].map((m) => m[1]);
  const landing = html.get('index.html');
  assert.ok(landing, 'no landing page in the build');
  const reference = primary(landing);
  assert.ok(reference.length >= 8, `the landing's navigation offers only ${reference.length} links`);
  const real = [...html].filter(([, body]) => !/<meta http-equiv="refresh"/i.test(body));
  for (const [file, body] of real) assert.deepEqual(primary(body), reference, `${routeOf(file)} has a different navigation from the front page`);
  const landingIds = ids.get('index.html');
  assert.deepEqual(reference.filter((h) => h.startsWith('/#')).map((h) => h.slice(2)).filter((f) => !landingIds.has(f)), [], 'the nav points at sections the landing does not have');
});
