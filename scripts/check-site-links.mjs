#!/usr/bin/env node
// Every internal link on the marketing site points at something that exists.
//
// WHY THIS EXISTS. index.astro's header records the rule it was written under: links
// "point at real routes, never at /#anchor, because the sections those anchors named do
// not exist". That rule was enforced by whoever remembered it. Nineteen pages later,
// the docs cross-reference each other constantly and a renamed page leaves a 404 that
// nothing reports — the build still succeeds, because a dead href is valid HTML.
//
// WHAT IS NOT A BROKEN LINK, and this is the part worth writing down: `/app` and
// everything under it is served by the WORKER, not by this static site, so those paths
// are absent from `dist` and present in production. A checker that did not know that
// would report 22 broken links across every page and be ignored within a day.
//
// AND IT CANNOT VALIDATE THEM. `/app/*` is a single-page app: the worker returns the
// same shell for ANY path beneath it and React Router resolves the route in the
// browser. Measured — `/app/nonexistent-route-xyz` returns 200 exactly like
// `/app/usage`. So a typo in an app link is invisible to any request-based check, here
// or anywhere; what catches it is apps/web's own route table. This file validates the
// SITE, and says so rather than implying more.
//
// Verified live 2026-09-01: / /app /app/usage /app/settings /docs
// /docs/getting-started /pricing /status all 200.
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'apps', 'site', 'dist');

/** Path PREFIXES this site links to that something else serves. Each needs a reason.
 *  A prefix rather than an exact path because /app is a SPA — see the header. */
const SERVED_ELSEWHERE = {
  '/app': 'the web app and every route under it, served by apps/worker — see index.ts',
};

const servedElsewhere = (p) =>
  Object.keys(SERVED_ELSEWHERE).some((prefix) => p === prefix || p.startsWith(prefix + '/'));

if (!existsSync(DIST)) {
  console.error('check-site-links: apps/site/dist is missing. Build the site first.');
  process.exit(1);
}

const pages = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (name.endsWith('.html')) pages.push(p);
  }
})(DIST);

if (pages.length === 0) {
  console.error('check-site-links: no pages in dist — the build produced nothing.');
  process.exit(1);
}

const routes = new Set(pages.map((p) => {
  const r = '/' + relative(DIST, p).replace(/index\.html$/, '').replace(/\.html$/, '');
  return r.replace(/\/$/, '') || '/';
}));

const broken = [];
let checked = 0;

for (const page of pages) {
  const html = readFileSync(page, 'utf8');
  for (const m of html.matchAll(/href="([^"]+)"/g)) {
    const href = m[1];
    if (href.startsWith('http') || href.startsWith('#') || href.startsWith('mailto:')) continue;
    if (!href.startsWith('/')) continue;
    checked += 1;
    const clean = (href.split('#')[0] ?? '').split('?')[0]?.replace(/\/$/, '') || '/';
    if (routes.has(clean)) continue;
    if (servedElsewhere(clean)) continue;
    // A static asset shipped in dist is a legitimate target too.
    if (existsSync(join(DIST, clean))) continue;
    broken.push(`${relative(DIST, page)}  ->  ${href}`);
  }
}

// An exemption for a path nothing links to any more is a comment pretending to be a
// rule, so it fails like a stale entry anywhere else in this repo.
const linked = new Set();
for (const page of pages) {
  for (const m of readFileSync(page, 'utf8').matchAll(/href="([^"]+)"/g)) {
    linked.add((m[1].split('#')[0] ?? '').split('?')[0]?.replace(/\/$/, '') || '/');
  }
}
const staleExemptions = Object.keys(SERVED_ELSEWHERE).filter(
  (prefix) => ![...linked].some((l) => l === prefix || l.startsWith(prefix + '/')),
);

if (broken.length > 0) {
  console.error(`check-site-links: ${broken.length} broken internal link(s)`);
  for (const b of [...new Set(broken)]) console.error(`  ${b}`);
  process.exit(1);
}
if (staleExemptions.length > 0) {
  console.error('check-site-links: SERVED_ELSEWHERE names paths nothing links to any more:');
  for (const p of staleExemptions) console.error(`  ${p}`);
  process.exit(1);
}
console.log(`check-site-links: ${checked} internal link(s) across ${pages.length} page(s), all resolve`);
console.log(`  served elsewhere: ${Object.keys(SERVED_ELSEWHERE).join(', ')}`);
