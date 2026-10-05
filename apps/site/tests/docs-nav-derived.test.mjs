// THE DOCS NAVIGATION AND THE DOCS INDEX ARE DERIVED FROM THE FILES, and the built pages prove it (M2 site fix cycle 1, plan step 2.6).
//
// The sidebar of DocsLayout.astro and the list on /docs were two hand-written lists, and the layout's own comment said a page added under
// src/pages/docs and not added to both ships as an orphan, which is what happened to /docs/connect, /docs/updating, /docs/troubleshooting and
// /docs/build-from-source. Both are read from the page sources now (docsPages() in src/data/docs-index.ts). This reads the BUILT sidebar of every docs
// page and the BUILT index, and compares them with an independent walk of the directory:
//   - every docs source file is in the sidebar exactly once, and nothing else is (a deleted page is not, a redirect stub is not);
//   - the order is the pages' own `order`, and a page with none (the privacy page, written by another lane) follows the ordered ones;
//   - the index lists the same pages as the sidebar, less itself, each with its summary;
//   - every link resolves to a built page that is not a redirect; the current page is marked aria-current.
// docsPages() is run on fixtures first, so a reader that finds nothing cannot pass for a clean site.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { SITE, distPage, distPages, hrefsOf, isRedirect, regionsWith, textOf } from './lib/dist.mjs';

const D = await import('../src/data/docs-index.ts');
const DOCS = join(SITE, 'src', 'pages', 'docs');

const files = readdirSync(DOCS).filter((f) => f.endsWith('.astro'));
const pathOf = (f) => (f === 'index.astro' ? '/docs' : `/docs/${f.replace(/\.astro$/, '')}`);

test('docsPages can see: it reads heading, order and summary, falls back to a plain description, and puts an unordered page last', () => {
  const src = (heading, extra) => `---\n---\n<DocsLayout\n  title="t"\n  description="A plain description."\n  heading="${heading}"\n${extra}>\n</DocsLayout>`;
  const pages = D.docsPages({
    './docs/zeta.astro': src('Zeta', ''),
    './docs/b.astro': src('B &amp; C', '  order={2}\n  summary="About B."\n'),
    './docs/a.astro': src('A', '  order={1}\n'),
    './docs/index.astro': src('Docs', '  order={0}\n'),
    './docs/alpha.astro': src('Alpha', ''),
  });
  assert.deepEqual(pages.map((p) => p.path), ['/docs', '/docs/a', '/docs/b', '/docs/alpha', '/docs/zeta']);
  assert.equal(pages[2].heading, 'B & C');
  assert.equal(pages[2].summary, 'About B.');
  assert.equal(pages[1].summary, 'A plain description.');
});

test('the derivation is not blind on the real tree: it finds every docs file, each with a heading, and the ordered ones first', () => {
  const sources = Object.fromEntries(files.map((f) => [`./docs/${f}`, readFileSync(join(DOCS, f), 'utf8')]));
  const pages = D.docsPages(sources);
  assert.deepEqual(pages.map((p) => p.path).sort(), files.map(pathOf).sort());
  for (const p of pages) assert.ok(p.heading && p.heading !== p.path, `${p.path} has no heading the reader can see`);
  assert.equal(pages[0].path, '/docs', 'the overview is not first');
  const firstUnordered = pages.findIndex((p) => p.order === Number.POSITIVE_INFINITY);
  assert.ok(firstUnordered > 0, 'every page names an order, or none does: this cannot show that unordered pages follow');
  assert.ok(pages.slice(firstUnordered).every((p) => p.order === Number.POSITIVE_INFINITY), 'an ordered page follows an unordered one');
});

const sidebarOf = (html) => {
  const nav = regionsWith(html, 'id="docs-nav-list"')[0];
  assert.ok(nav, 'no #docs-nav-list in the page');
  return [...nav.inner.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)].map((m) => ({ href: /href="([^"]*)"/.exec(m[1])[1], current: /aria-current="page"/.test(m[1]), label: textOf(m[2]) }));
};

test('every built docs page carries the same sidebar: every docs file once, in the pages\' own order, the page itself marked', () => {
  const expected = files.map(pathOf).sort();
  const docsRoutes = distPages().filter((p) => (p.route === '/docs/' || p.route.startsWith('/docs/')) && !isRedirect(p.html));
  assert.ok(docsRoutes.length >= files.length, `only ${docsRoutes.length} built docs pages for ${files.length} sources`);
  let order = null;
  for (const { route, html } of docsRoutes) {
    const bar = sidebarOf(html);
    const hrefs = bar.map((l) => l.href);
    assert.deepEqual([...hrefs].sort(), expected, `${route}: the sidebar is not the docs files`);
    assert.equal(new Set(hrefs).size, hrefs.length, `${route}: a page is listed twice`);
    order ??= hrefs;
    assert.deepEqual(hrefs, order, `${route}: the sidebar's order differs from another page's`);
    const here = route.replace(/\/$/, '');
    assert.deepEqual(bar.filter((l) => l.current).map((l) => l.href), [here], `${route}: the page itself is not the one marked current`);
  }
  assert.equal(order[0], '/docs');
  assert.equal(order.at(-1), '/docs/privacy-and-data', 'the unordered page (privacy-and-data) does not follow the ordered ones');
  for (const gone of ['/docs/connect', '/docs/updating', '/docs/build-from-source']) assert.ok(!order.includes(gone), `${gone} is a redirect and is still in the sidebar`);
});

test('the /docs index lists the same pages as the sidebar, less itself, each as a link with its summary, and every link resolves to a real page', () => {
  const html = distPage('/docs/').html;
  const list = regionsWith(html, 'data-docs-index')[0];
  assert.ok(list, 'the /docs index has no derived list');
  const items = [...list.inner.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/g)].map((m) => ({ href: /href="([^"]*)"/.exec(m[1])[1], text: textOf(m[1]) }));
  assert.deepEqual(items.map((i) => i.href), sidebarOf(html).map((l) => l.href).filter((h) => h !== '/docs'));
  for (const i of items) assert.ok(i.text.split(' ').length >= 4, `${i.href} is listed with no summary: "${i.text}"`);
  for (const href of [...hrefsOf(list.inner)]) {
    const page = distPage(`${href}/`);
    assert.ok(!isRedirect(page.html), `${href} is a redirect`);
  }
});
