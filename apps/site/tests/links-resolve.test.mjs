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
const WORKER_SERVED = new Map([['/showcase', 'infra/deploy-showcase.mjs']]);

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

test('the exempt routes are published by something in this repository', () => {
  // WHAT MAKES THE EXEMPTION HONEST. A route listed above is being excused from the
  // does-it-resolve check on the claim that the Worker serves it. This reads the file that is
  // supposed to do the serving and fails if it does not name the route — so the claim costs
  // something. Without this, `WORKER_SERVED` would be a list of links nobody checks at all, which
  // is strictly worse than the broken-link report it replaced.
  const repo = join(SITE, '..', '..');
  for (const [route, publisher] of WORKER_SERVED) {
    const path = join(repo, publisher);
    assert.ok(existsSync(path), `${route} is exempt on the word of ${publisher}, which does not exist`);
    const source = readFileSync(path, 'utf8');
    assert.ok(
      source.includes(`'${route}'`) || source.includes(`"${route}"`),
      `${publisher} is named as the publisher of ${route} but never mentions that path — the exemption is unearned`,
    );
    // AND THE OPPOSITE DRIFT: the day someone adds apps/site/src/pages/showcase.astro, this entry
    // becomes a lie that silently stops the real check from running on a real page. Self-cleaning.
    assert.equal(
      fileFor(route, built),
      null,
      `${route} is now built by Astro — delete its ${publisher} exemption so the ordinary check covers it`,
    );
  }
});

test('every page reaches the showcase, the landing included', () => {
  // THE FAILURE THIS EXISTS FOR IS ONE DAY OLD. /showcase went live on 2026-09-21 with nothing
  // anywhere linking to it: the best evidence this product has, reachable only by being told the
  // URL. A link that is nobody's test is a link that gets tidied away by the next person who
  // thinks the nav is too long.
  //
  // THE LANDING IS IN THE SET, AND THE FIRST VERSION OF THIS TEST EXEMPTED IT. That version was
  // written from the assumption that Nav.astro is the site's navigation; the landing has its own
  // header and does not import it, so the check passed on nineteen pages and the front door — the
  // one page the owner actually opens — was the single page with no link. The exemption hid
  // exactly the case worth checking. It reaches /showcase from the footer rather than the header
  // because landing.css measured that header row at 320px against 343 available on a phone; where
  // the link lives is that page's business, that it is reachable is this test's.
  assert.ok(html.size >= 10, 'too few pages built for this to mean anything');
  const missing = [...html]
    .filter(([, body]) => !/href="\/showcase"/.test(body))
    .map(([f]) => routeOf(f))
    .sort();
  assert.deepEqual(missing, [], 'pages with no route to the showcase:\n  ' + missing.join('\n  '));
});

test('the navigation reaches every section it names, from every page', () => {
  // The specific case the stale comment got wrong: the nav is shared, so its links have to work
  // from /pricing and /docs, not only from the page that happens to contain the sections.
  const nav = [...html].find(([f]) => f.startsWith('pricing'));
  assert.ok(nav, 'no pricing page in the build — this check would be vacuous');
  const frags = [...nav[1].matchAll(/href="\/#([a-z-]+)"/g)].map((m) => m[1]);
  assert.ok(frags.length > 0, `the shared nav offers no product-section destinations`);
  const landing = ids.get('index.html');
  assert.ok(landing, 'no landing page in the build');
  assert.deepEqual(frags.filter((f) => !landing.has(f)), [], 'the nav points at sections the landing does not have');
});
