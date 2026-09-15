/**
 * Searching Apple's own help, which was not possible anywhere in the product.
 *
 * The docs nav is a hand-maintained list of twelve links. There was no input, no form, no search
 * script, and no index: finding "what happens if I close Studio mid-build" meant opening pages
 * until you hit the right one. The app has two search boxes and neither looks at help — the command
 * palette searches commands, the workspace panel searches the conversation.
 *
 * AND THE ENDPOINT THAT LOOKS LIKE THE ANSWER IS NOT ONE. GET /api/docs/search exists in the
 * worker, but it queries the vendored ROBLOX creator-docs corpus, it requires a signed-in user and
 * it bills a Credit per query. Pointing the docs nav at it would charge a visitor money to find out
 * how to install the plugin. This is a separate, free, static index over Apple's own pages.
 *
 * WHAT THIS GUARDS. The index is derived from the page sources at build time, so its failure mode
 * is silent and total: a stripper that swallows the body produces an index of twelve titles and
 * zero text, and the box still looks like it works — it just never finds anything. Every test below
 * runs the real extractor over the real pages and asserts it found prose, headings and hits for
 * questions a person would actually type.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DOCS_DIR = join(ROOT, 'apps', 'site', 'src', 'pages', 'docs');
const D = await import(join(ROOT, 'apps', 'site', 'src', 'data', 'docs-index.ts'));

/** The same shape Vite's `?raw` glob hands the endpoint: absolute-ish path -> file text. */
const sources = Object.fromEntries(
  readdirSync(DOCS_DIR)
    .filter((f) => f.endsWith('.astro'))
    .map((f) => [`./docs/${f}`, readFileSync(join(DOCS_DIR, f), 'utf8')]),
);
const index = D.buildDocsIndex(sources);

test('every docs page is in the index, under the URL it is actually served at', () => {
  const paths = new Set(index.map((e) => e.path));
  assert.equal(paths.has('/docs'), true, 'the overview page is missing or mis-pathed');
  for (const f of Object.keys(sources)) {
    const slug = f.replace('./docs/', '').replace('.astro', '');
    const expected = slug === 'index' ? '/docs' : `/docs/${slug}`;
    assert.equal(paths.has(expected), true, `${expected} is not in the index`);
  }
  assert.ok(index.length >= 10, `only ${index.length} pages indexed`);
});

test('every entry carries a real title and real prose, not just a filename', () => {
  for (const e of index) {
    assert.ok(e.title && e.title.length > 3, `${e.path} has no title`);
    // The silent failure this exists for: a stripper that eats the body leaves titles and nothing
    // to match on, and the search box then finds nothing while looking fine.
    assert.ok(e.text.length > 200, `${e.path} indexed only ${e.text.length} characters of text`);
    assert.equal(/[<>]/.test(e.text), false, `${e.path} still contains markup: ${e.text.slice(0, 80)}`);
    assert.equal(e.text.includes('import '), false, `${e.path} still contains its frontmatter`);
  }
});

test('headings are kept, because they are what a person is scanning for', () => {
  const trouble = index.find((e) => e.path === '/docs/troubleshooting');
  assert.ok(trouble, 'the troubleshooting page is not indexed');
  assert.ok(trouble.headings.length >= 4, `only ${trouble.headings.length} headings from troubleshooting`);
  assert.equal(
    trouble.headings.some((h) => /[<>]/.test(h)),
    false,
    'a heading came through with markup in it',
  );
});

test('questions a person would actually type find the page written for them', () => {
  const cases = [
    ['install the plugin', '/docs/plugin'],
    ['invoice', '/docs/billing'],
    ['troubleshooting', '/docs/troubleshooting'],
  ];
  for (const [query, expected] of cases) {
    const hits = D.searchDocs(index, query);
    assert.ok(hits.length > 0, `"${query}" found nothing`);
    assert.ok(
      hits.slice(0, 3).some((h) => h.path === expected),
      `"${query}" did not surface ${expected} in the top three (got ${hits.slice(0, 3).map((h) => h.path).join(', ')})`,
    );
  }
});

test('a hit carries the matching words, not just a page name', () => {
  // A result list of twelve titles is the nav again. The snippet is the reason to build this.
  const [hit] = D.searchDocs(index, 'checkpoint');
  assert.ok(hit, '"checkpoint" found nothing');
  assert.ok(hit.snippet && hit.snippet.length > 30, 'the hit has no snippet');
  assert.match(hit.snippet.toLowerCase(), /checkpoint/, 'the snippet does not contain the match');
});

test('an empty or junk query returns nothing rather than everything', () => {
  for (const q of ['', '   ', 'zzzzqqqx']) {
    assert.deepEqual(D.searchDocs(index, q), [], `"${q}" returned results`);
  }
});

test('the index is published as a static file, not fetched from the billed API', () => {
  // `.js`, not `.ts`: Astro names a JSON endpoint `<route>.json.<ext>` and the repository's
  // file-naming hook rejects a `.ts` basename with a dot in it. The extractor it calls is typed.
  const endpoint = join(ROOT, 'apps', 'site', 'src', 'pages', 'docs-index.json.js');
  assert.ok(existsSync(endpoint), 'there is no build-time endpoint emitting the index');
  const src = readFileSync(endpoint, 'utf8');
  assert.match(src, /buildDocsIndex/, 'the endpoint does not use the shared extractor');
  assert.match(src, /import\.meta\.glob/, 'the endpoint does not read the pages at build time');
});

test('the docs nav has a search box, and it does not call the worker', () => {
  const layout = readFileSync(join(ROOT, 'apps', 'site', 'src', 'layouts', 'DocsLayout.astro'), 'utf8');
  assert.match(layout, /type="search"/, 'there is no search input in the docs layout');
  assert.match(layout, /docs-index\.json/, 'the layout does not load the static index');
  assert.match(layout, /searchDocs/, 'the layout does not use the shared search');
  // /api/docs/search bills a Credit per query and indexes Roblox's docs, not ours. The check is on
  // what the page FETCHES: the first version of this assertion matched the string anywhere and was
  // tripped by the comment explaining why the route is not used.
  assert.equal(
    /fetch\(\s*['"`][^'"`]*\/api\/docs\/search/.test(layout),
    false,
    'the docs nav must not call the billed Roblox search',
  );
});
