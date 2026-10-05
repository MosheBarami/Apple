// THE BUILD IS HERMETIC AND CANONICAL (handoff M2, plan section 6).
//
// A site build must give the same pages from the same source, with the network unplugged. Three pages used to ask the live
// deployment a question at build time (`fetch('.../api/billing/config')` in lib/billing-probe.ts, terms.astro and
// docs/billing.astro), so a build on a bad day printed a different terms page and a different billing page. Checkout is off
// and paid plans start later (DECISIONS.md section 3), so the answer is a fact, not a probe.
//
// And the site is studpilot.app and nothing else: `site` in astro.config.mjs, the robots.txt Sitemap line, every canonical
// link and every sitemap URL. The former workers.dev hosts only redirect to it and appear nowhere in apps/site/src.
//
// WHAT COUNTS AS BUILD TIME: the frontmatter of every .astro file and every module under src/ that is not a browser script.
// A `fetch(` inside a <script> block runs in the visitor's browser (the docs search reads /docs-index.json; /status asks
// /api/health), is allowed, and is the one place it is allowed.
//
// Run with:  pnpm --filter @studpilot/site build && node --test tests/hermetic-build.test.mjs   (from apps/site)
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DIST, SITE, distPages, stripComments, walkFiles } from './lib/dist.mjs';

const SRC = join(SITE, 'src');
const sources = () => {
  const files = walkFiles(SRC, (p) => /\.(?:astro|ts|js|mjs)$/.test(p));
  assert.ok(files.length > 0, 'the walk of apps/site/src found no source file');
  return files.map((f) => ({ file: f, text: readFileSync(join(SRC, f), 'utf8') }));
};

/** The part of an .astro file that runs at build time: everything except <script> blocks (those run in the browser). */
const buildTimePart = (text) => text.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ');

/** The remote-call shapes that make a build depend on the network. */
const NETWORK = /\bfetch\s*\(|\bXMLHttpRequest\b|\bnew\s+WebSocket\b|\bhttps?\.(?:get|request)\s*\(|\bawait\s+import\s*\(\s*['"`]https?:/;

test('the network scanner can see: it catches fetch( in frontmatter and ignores a browser script and a comment', () => {
  const astro = "---\nconst x = await fetch('https://studpilot.app/api/billing/config');\n---\n<p>hi</p>\n<script>fetch('/docs-index.json')</script>";
  assert.match(stripComments(buildTimePart(astro)), NETWORK);
  assert.doesNotMatch(stripComments(buildTimePart('---\n// we used to fetch(\n---\n<script>fetch("/x")</script>')), NETWORK);
  assert.match(stripComments('const r = await fetch(url);'), NETWORK);
});

test('no build-time code in apps/site/src calls fetch( or any other network API (a browser <script> may)', () => {
  const files = sources();
  for (const { file, text } of files) {
    const visible = stripComments(file.endsWith('.astro') ? buildTimePart(text) : text);
    // A plain .ts module under components/ is a browser script (rolling numbers, the copy button): it is judged as one only
    // when a page imports it from frontmatter, which would put it on this list through the .astro file's own imports.
    if (/^components\/.*\.(?:ts|js)$/.test(file)) continue;
    assert.doesNotMatch(visible, NETWORK, `${file} reaches the network at build time: ${visible.match(NETWORK)?.[0]}`);
  }
});

test('billing-probe.ts is gone and nothing asks whether a plan can be bought', () => {
  assert.ok(!existsSync(join(SRC, 'lib', 'billing-probe.ts')), 'src/lib/billing-probe.ts still exists');
  for (const { file, text } of sources()) {
    const code = stripComments(text);
    assert.doesNotMatch(code, /paidPlansOnSale|billing-probe|api\/billing\/config/, `${file} still probes the live billing configuration`);
  }
});

test('the former workers.dev hosts appear nowhere in apps/site/src, the Astro config or robots.txt', () => {
  const all = [...sources(), { file: '../astro.config.mjs', text: readFileSync(join(SITE, 'astro.config.mjs'), 'utf8') }, { file: '../public/robots.txt', text: readFileSync(join(SITE, 'public', 'robots.txt'), 'utf8') }];
  for (const { file, text } of all) assert.doesNotMatch(text, /workers\.dev/i, `${file} names a workers.dev host`);
});

test('the canonical site is https://studpilot.app in the config and in robots.txt', () => {
  const config = stripComments(readFileSync(join(SITE, 'astro.config.mjs'), 'utf8'));
  assert.match(config, /\bsite\s*:\s*'https:\/\/studpilot\.app'/, "astro.config.mjs `site` is not 'https://studpilot.app'");
  const robots = readFileSync(join(SITE, 'public', 'robots.txt'), 'utf8');
  assert.match(robots, /^Sitemap: https:\/\/studpilot\.app\/sitemap-index\.xml\s*$/m, 'robots.txt does not point at the studpilot.app sitemap');
  assert.equal([...robots.matchAll(/^Sitemap:/gim)].length, 1, 'robots.txt names more than one sitemap');
});

test('every sitemap file in dist lists only https://studpilot.app URLs, and lists the main pages', () => {
  const sitemaps = walkFiles(DIST, (p) => /sitemap[^/]*\.xml$/.test(p));
  assert.ok(sitemaps.length > 0, 'the build wrote no sitemap');
  const locs = sitemaps.flatMap((f) => [...readFileSync(join(DIST, f), 'utf8').matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]));
  assert.ok(locs.length > 0, 'the sitemap files hold no <loc>');
  for (const loc of locs) assert.match(loc, /^https:\/\/studpilot\.app(?:\/|$)/, `a sitemap lists ${loc}`);
  const pages = locs.filter((l) => !/sitemap/.test(l));
  for (const path of ['/', '/pricing/', '/how-it-works/', '/catalog/', '/blog/']) {
    assert.ok(pages.includes(`https://studpilot.app${path}`), `the sitemap does not list ${path}`);
  }
});

test('every built page nominates a studpilot.app canonical (or is marked noindex)', () => {
  const pages = distPages();
  for (const { route, html } of pages) {
    if (/<meta name="robots" content="noindex/.test(html)) continue;
    // A redirect stub carries a canonical to its target; that too must be on the site.
    const canonical = html.match(/<link rel="canonical" href="([^"]+)"/);
    assert.ok(canonical, `${route} nominates no canonical`);
    assert.match(canonical[1], /^https:\/\/studpilot\.app\//, `${route} nominates ${canonical[1]}`);
  }
});
