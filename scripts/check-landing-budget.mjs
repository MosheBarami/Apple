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
const BUDGET_GZIP_BYTES = 12_000; // measured 4,662 at the time of writing
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
