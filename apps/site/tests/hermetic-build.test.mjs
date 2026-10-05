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

/** The module specifiers a source imports: static `import … from 'x'`, `import 'x'`, `export … from 'x'` and `import('x')` with a literal. */
function specifiersOf(code) {
  const out = [];
  for (const m of code.matchAll(/\b(?:import|export)\s+(?:[^'"`;]*?\s+from\s+)?['"]([^'"]+)['"]/g)) out.push(m[1]);
  for (const m of code.matchAll(/\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g)) out.push(m[1]);
  return out;
}

/** Where a relative specifier from `from` (a path under src, posix) lands among the files read, or null (a package, or a file outside src). */
function resolveInSrc(from, spec, known) {
  if (!spec.startsWith('.')) return null;
  const base = join('/', from, '..', spec).slice(1);
  for (const c of [base, `${base}.ts`, `${base}.js`, `${base}.mjs`, `${base}/index.ts`, `${base}/index.js`]) if (known.has(c)) return c;
  return null;
}

/**
 * Every module that runs at build time. A page's frontmatter runs at build time, and so does every module it imports, however deep. A plain
 * .ts under components/ is a BROWSER script when only a <script> block imports it (the copy button) and a BUILD-TIME module when a frontmatter
 * imports it. The first version skipped every components/*.ts on the strength of a comment saying an imported one "is judged through the .astro
 * file's own imports", and nothing followed an import, so a build-time fetch( in a component module (a probe imported from 404.astro's
 * frontmatter, measured in review) built cleanly with this test green. This follows them.
 */
function buildTimeModules(files) {
  const known = new Map(files.map((f) => [f.file, f]));
  const keep = new Set();
  const visit = (rel) => {
    if (keep.has(rel)) return;
    keep.add(rel);
    for (const spec of specifiersOf(stripComments(known.get(rel).text))) {
      const next = resolveInSrc(rel, spec, known);
      if (next && !next.endsWith('.astro')) visit(next);
    }
  };
  for (const f of files) {
    if (f.file.endsWith('.astro')) {
      for (const spec of specifiersOf(stripComments(buildTimePart(f.text)))) {
        const next = resolveInSrc(f.file, spec, known);
        if (next && !next.endsWith('.astro')) visit(next);
      }
    } else if (!/^components\/.*\.(?:ts|js)$/.test(f.file)) {
      visit(f.file);
    }
  }
  return files.filter((f) => f.file.endsWith('.astro') || keep.has(f.file));
}

test('the import follower can see: a component module imported from a frontmatter is build time, one imported only from a <script> is not', () => {
  const files = [
    { file: 'pages/a.astro', text: "---\nimport { v } from '../components/net.ts';\n---\n<p>x</p>" },
    { file: 'pages/b.astro', text: "---\n---\n<script>import { w } from '../components/browser.ts';</script>" },
    { file: 'components/net.ts', text: "import { h } from './deep';\nexport const v = 1;" },
    { file: 'components/deep.ts', text: 'export const h = 2;' },
    { file: 'components/browser.ts', text: 'export const w = fetch(1);' },
  ];
  const names = buildTimeModules(files).map((f) => f.file).sort();
  assert.deepEqual(names, ['components/deep.ts', 'components/net.ts', 'pages/a.astro', 'pages/b.astro']);
});

test('no build-time code in apps/site/src calls fetch( or any other network API (a browser <script> may), including a module a frontmatter imports', () => {
  const files = sources();
  const judged = buildTimeModules(files);
  assert.ok(judged.length > 25, `only ${judged.length} build-time sources were judged`);
  for (const { file, text } of judged) {
    const visible = stripComments(file.endsWith('.astro') ? buildTimePart(text) : text);
    assert.doesNotMatch(visible, NETWORK, `${file} reaches the network at build time: ${visible.match(NETWORK)?.[0]}`);
  }
  // Modules outside src (the shared package's pricing config, the worker's pricing constants) are imported at build time too; each has its own
  // tests, and this guard judges the site's own code.
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
