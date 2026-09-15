#!/usr/bin/env node
/**
 * Enforce the landing page's payload budget against the BUILT output.
 *
 * The root route is meant to be one viewport of HTML and CSS with no
 * JavaScript at all. That is easy to state and easy to lose: one `client:load`
 * island, one library import, and the page silently starts shipping a bundle.
 *
 * These numbers are measured from dist, gzipped here, not estimated by bundler
 * tooling. Budgets are set with real headroom over the current figures so this
 * fails on a regression, not on a rounding change.
 */
import { gzipSync } from 'node:zlib';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const DIST = 'apps/site/dist';

/**
 * RAISED FROM 12,000 FOR THE LIBRARY WALL, and the arithmetic is written down because a budget
 * that moves without a reason is not a budget.
 *
 *   before the wall   index.html 7,934 + css 3,691 = 11,625   (375 B under the old 12,000)
 *   with the wall     index.html 10,422 + css 4,205 = 14,627
 *
 * The wall costs ~3.0 KB gzip: ~2.5 KB of card text — 42 asset names, packs, licences, authors
 * and image paths, each one a fact rather than markup — and ~0.5 KB of CSS. It could not have
 * been fitted under the old number by trimming: the section's stylesheet alone is +514 B against
 * 375 B of headroom, so a wall with ZERO cards would still have failed. The number had to move
 * for the section to exist at all, so it was moved on purpose rather than by deleting the cards
 * until the guard went quiet.
 *
 * WHAT DID NOT MOVE is the part with teeth: ALLOW_JS_BYTES stays 0 and the three.js sweep below
 * is untouched. Those are what this guard is actually for — the wall is HTML and CSS, it drifts
 * on a keyframe, and it added no JavaScript to the route.
 *
 * Headroom is ~1.4 KB, which absorbs copy edits and would not absorb a bundle.
 */
const BUDGET_GZIP_BYTES = 16_000; // measured 14,627 with the library wall
const ALLOW_JS_BYTES = 0; // the root route ships no JavaScript, full stop

if (!existsSync(DIST)) {
  console.error(`no build found at ${DIST} — run the site build first`);
  process.exit(1);
}

const html = readFileSync(join(DIST, 'index.html'));
const linked = [...html.toString().matchAll(/(?:href|src)="(\/[^"]+\.(?:css|js))"/g)].map((m) => m[1]);

let totalGzip = gzipSync(html, { level: 9 }).length;
let jsBytes = 0;
const rows = [['index.html', gzipSync(html, { level: 9 }).length]];

for (const asset of new Set(linked)) {
  const file = join(DIST, asset);
  if (!existsSync(file)) continue;
  const raw = readFileSync(file);
  const gz = gzipSync(raw, { level: 9 }).length;
  totalGzip += gz;
  rows.push([asset, gz]);
  if (asset.endsWith('.js')) jsBytes += raw.length;
}

for (const [name, gz] of rows) console.log(`  ${name.padEnd(44)} ${String(gz).padStart(7)} B gzip`);
console.log(`  ${'TOTAL'.padEnd(44)} ${String(totalGzip).padStart(7)} B gzip`);
console.log(`  ${'JavaScript (raw)'.padEnd(44)} ${String(jsBytes).padStart(7)} B`);

let failed = false;
if (totalGzip > BUDGET_GZIP_BYTES) {
  console.error(`::error::landing payload ${totalGzip} B gzip exceeds budget ${BUDGET_GZIP_BYTES} B`);
  failed = true;
}
if (jsBytes > ALLOW_JS_BYTES) {
  console.error(`::error::landing route now ships ${jsBytes} B of JavaScript; the budget is ${ALLOW_JS_BYTES}`);
  failed = true;
}

// A three.js chunk anywhere in dist means the mascot came back.
const astroDir = join(DIST, '_astro');
if (existsSync(astroDir)) {
  for (const f of readdirSync(astroDir)) {
    if (!f.endsWith('.js')) continue;
    const body = readFileSync(join(astroDir, f), 'utf8');
    if (/WebGLRenderer|THREE\./.test(body)) {
      console.error(`::error::a three.js chunk is present in the build: _astro/${f}`);
      failed = true;
    }
  }
}

process.exit(failed ? 1 : 0);
