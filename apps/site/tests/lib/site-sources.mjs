/**
 * EVERY FILE THE SITE'S WORDS COME FROM, derived from the tree and never listed.
 *
 * Four claim guards (credit-refund-claims, no-live-cost-claim, pre-run-cost-warning, api-surface-claim) walked src/pages for `.astro` files
 * and nothing else. The M2 rebuild moved copy out of the pages: the blog post is a Markdown entry in src/content/blog, the four kinds of
 * piece and their example requests are src/data/pieces.ts, the nav and footer are components, and the docs index and the status page's known
 * issues are modules. A sentence promising a refund, live cost metering, a warning before a run or a published SDK put into the post or
 * into pieces.ts, and present in the built HTML of three pages, left all four guards green (measured, under probes, in the first review of
 * this rebuild). The pages were the denominator of the guards when the pages were where the words lived; this is where they live now.
 *
 * What counts as a source of words: every .astro, .md, .mdx, .ts, .js, .mjs and .json file under apps/site/src (pages, content, data,
 * components, layouts, lib), minus the test-only and generated ones named in SKIP. The guards strip comments (visibleText) before they match,
 * so code and prose can share a file.
 *
 * Not a test file.
 */
import { readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { SITE, walkFiles } from './dist.mjs';

const SRC = join(SITE, 'src');
/** Data that is not the site's words: the owner library's catalogue of pack names. */
const SKIP = new Set(['data/asset-wall.json']);

/** Every source of words as { file (absolute), rel (from apps/site), text }. */
export function copySources() {
  const files = walkFiles(SRC, (p) => /\.(?:astro|md|mdx|ts|js|mjs|json)$/.test(p)).filter((f) => !SKIP.has(f));
  const out = files.map((f) => ({ file: join(SRC, f), rel: relative(SITE, join(SRC, f)), text: readFileSync(join(SRC, f), 'utf8') }));
  if (out.length < 40) throw new Error(`the walk of apps/site/src found only ${out.length} sources of words: it is looking in the wrong place`);
  return out;
}

/** The same set as absolute paths, the shape the four guards' own `pages()` returned. */
export const copyFiles = () => copySources().map((s) => s.file);
