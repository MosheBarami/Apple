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

//[[ IMAGES WERE INVISIBLE TO THIS FILE UNTIL 2026-09-21, AND ON THAT DAY THEY STOPPED BEING ZERO.
//
//   The scan below matches `(href|src)="/….(css|js)"` and nothing else, so the single heaviest
//   class of asset a web page can carry was not merely unbudgeted, it was unmeasured. That was
//   harmless for exactly as long as the landing had no images — `<img>` 0 and `<video>` 0 on the
//   deployed page, measured against the live origin that morning — and it stopped being harmless
//   the moment the proof band under the hero shipped one.
//
//   A budget that cannot see the asset class most likely to blow it is not a loose budget, it is
//   an instrument reporting on something it never looked at. So images are counted now, on their
//   own line and against their own number, because they are not gzip-compressible the way markup
//   is: a .webp is already compressed, gzipping it again buys nothing, and folding its bytes into
//   a gzip total would make both figures meaningless.
//
//   BUDGET_GZIP_BYTES IS DELIBERATELY UNTOUCHED. It has been red since well before this change —
//   21,042 B at the commit this was written against, against a 12,000 B budget and a comment
//   recording 4,662 B when it was set — and raising a failing number to meet the page is how a
//   gate becomes a decoration. The image line is separate so the two can be attributed apart. ]]
const IMAGE_BYTES = /\.(png|jpe?g|webp|avif|gif|svg)$/i;
const BUDGET_IMAGE_BYTES = 40_000; // measured 11,648 (one proof capture) at the time of writing

if (!existsSync(DIST)) {
  console.error(`no build found at ${DIST} — run the site build first`);
  process.exit(1);
}

const html = readFileSync(join(DIST, 'index.html'));
const linked = [...html.toString().matchAll(/(?:href|src)="(\/[^"]+\.(?:css|js))"/g)].map((m) => m[1]);

let totalGzip = gzipSync(html, { level: 9 }).length;
let jsBytes = 0;
const rows = [['index.html', gzipSync(html, { level: 9 }).length, 'B gzip']];

for (const asset of new Set(linked)) {
  const file = join(DIST, asset);
  if (!existsSync(file)) continue;
  const raw = readFileSync(file);
  const gz = gzipSync(raw, { level: 9 }).length;
  totalGzip += gz;
  rows.push([asset, gz, 'B gzip']);
  if (asset.endsWith('.js')) jsBytes += raw.length;
}

// Images the ROOT DOCUMENT asks for. Anything referenced only by a stylesheet or fetched later is
// out of scope here, the same way a script's own imports are: this file budgets what loading `/`
// costs, and the page's own markup is where that is decided.
let imageBytes = 0;
const images = new Set(
  [...html.toString().matchAll(/(?:href|src|srcset)="(\/[^"]+)"/g)]
    .map((m) => m[1].split(/\s|,/)[0])
    .filter((p) => IMAGE_BYTES.test(p)),
);
for (const asset of images) {
  const file = join(DIST, asset);
  if (!existsSync(file)) {
    // A src the build did not produce is a broken picture on the front page, which is worse than
    // a heavy one — and the byte count would silently read zero, i.e. "well within budget".
    console.error(`::error::the landing references ${asset}, which is not in the build`);
    imageBytes = Number.NaN;
    continue;
  }
  const raw = readFileSync(file);
  imageBytes += raw.length;
  rows.push([asset, raw.length, 'B raw']);
}

// The unit travels with the row. Image rows were printed as "B gzip" for one run of this file,
// which is the checker misreporting its own measurement: a .webp is already compressed and is
// counted raw, and a number carrying the wrong unit is how a budget gets argued with.
for (const [name, size, unit] of rows) console.log(`  ${name.padEnd(44)} ${String(size).padStart(7)} ${unit ?? 'B gzip'}`);
console.log(`  ${'TOTAL (markup + stylesheets)'.padEnd(44)} ${String(totalGzip).padStart(7)} B gzip  / ${BUDGET_GZIP_BYTES}`);
console.log(`  ${'JavaScript (raw)'.padEnd(44)} ${String(jsBytes).padStart(7)} B`);
console.log(`  ${'Images (raw)'.padEnd(44)} ${String(imageBytes).padStart(7)} B  / ${BUDGET_IMAGE_BYTES}`);

let failed = false;
if (totalGzip > BUDGET_GZIP_BYTES) {
  console.error(`::error::landing payload ${totalGzip} B gzip exceeds budget ${BUDGET_GZIP_BYTES} B`);
  failed = true;
}
if (jsBytes > ALLOW_JS_BYTES) {
  console.error(`::error::landing route now ships ${jsBytes} B of JavaScript; the budget is ${ALLOW_JS_BYTES}`);
  failed = true;
}
// `NaN > x` is false, so a missing file would sail past this comparison saying nothing. It is
// checked by name rather than by size for that reason.
if (Number.isNaN(imageBytes)) {
  failed = true;
} else if (imageBytes > BUDGET_IMAGE_BYTES) {
  console.error(`::error::landing images total ${imageBytes} B; the budget is ${BUDGET_IMAGE_BYTES} B`);
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
