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
