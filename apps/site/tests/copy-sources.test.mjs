// THE CLAIM GUARDS READ EVERY SOURCE OF WORDS, AND THIS HOLDS THAT DERIVATION (M2 site fix cycle 1).
//
// credit-refund-claims, no-live-cost-claim, pre-run-cost-warning and api-surface-claim used to walk src/pages for `.astro` files. The rebuild moved
// copy into the blog's Markdown (src/content), the data modules (src/data) and the components, and a refund promise or a "live cost" sentence
// placed in any of them left all four green while the sentence was in the built HTML. They now read tests/lib/site-sources.mjs, which walks
// apps/site/src. This file proves that walk: it names the files that carry words today (the post, pieces.ts, the footer, a layout, a docs page),
// agrees with a second, independent count of the tree, and checks that the four guards import it instead of walking pages themselves.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { SITE } from './lib/dist.mjs';
import { copySources } from './lib/site-sources.mjs';

const GUARDS = ['credit-refund-claims', 'no-live-cost-claim', 'pre-run-cost-warning', 'api-surface-claim'];

test('the walk reaches the files the first version missed: the blog post, the data modules, a component, a layout, a docs page', () => {
  const rels = copySources().map((s) => s.rel.split('\\').join('/'));
  for (const must of [
    'src/content/blog/what-works-today.md',
    'src/data/pieces.ts',
    'src/data/known-issues.ts',
    'src/components/Footer.astro',
    'src/layouts/DocsLayout.astro',
    'src/pages/index.astro',
    'src/pages/docs/faq.astro',
  ]) assert.ok(rels.includes(must), `${must} is not among the sources of words`);
});

test('the walk agrees with an independent count of the tree: every .astro, .md, .ts file under src (bar the one named skip) is read', () => {
  const independent = [];
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(?:astro|md|mdx|ts)$/.test(e.name)) independent.push(p);
    }
  };
  walk(join(SITE, 'src'));
  assert.ok(independent.length > 30, 'the independent count found almost nothing');
  const read = new Set(copySources().map((s) => s.file));
  for (const f of independent) assert.ok(read.has(f), `${f} carries words and is not read`);
});

test('each of the four claim guards reads the derived set and no longer walks src/pages for .astro files itself', () => {
  for (const g of GUARDS) {
    const src = readFileSync(join(SITE, 'tests', `${g}.test.mjs`), 'utf8');
    assert.match(src, /from '\.\/lib\/site-sources\.mjs'/, `${g} does not import the derived set of sources`);
    assert.doesNotMatch(src.replace(/\/\/.*$/gm, ''), /name\.endsWith\('\.astro'\)/, `${g} still filters to .astro files`);
  }
});
