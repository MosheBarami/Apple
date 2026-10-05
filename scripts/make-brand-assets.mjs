#!/usr/bin/env node
/**
 * Render the brand assets that cannot be authored by hand, from ONE drawing and the design tokens.
 *
 *   packages/design/brand/studpilot-mark.svg   the mark (drawn in this repository, see PROVENANCE.md)
 *   packages/design/src/web/tokens.css         the colours: the base for the tile, the accent for the mark
 *
 * What it writes:
 *   packages/design/brand/favicon.svg, icon-16.png, icon-32.png, icon-180.png, icon-512.png
 *   apps/site/public/favicon.svg, apple-touch-icon.png (180), icon-192.png, icon-512.png
 *   apps/site/public/og.png, the Open Graph card, rasterised from apps/site/brand/og.html
 *
 * Nothing is fetched. The type is the system font stack and the card's stylesheet is the token file
 * on disk; a request to anything but file:// fails the run, which is how "no webfont, no CDN" is
 * enforced rather than hoped for.
 *
 * A PNG is opaque to review, so the sources are the reviewable artefacts and this turns them into the
 * shipped ones. Every step asserts against rendered pixels: a generator is exactly the tool that
 * reports success over a blank frame, a zero-byte file or a mark that never painted.
 *
 * Usage:
 *   node scripts/make-brand-assets.mjs              write the assets
 *   node scripts/make-brand-assets.mjs --check      render and compare, write nothing (for CI)
 */
import { chromium } from '@playwright/test';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { theme, themeBlocks } = await import(pathToFileURL(join(ROOT, 'packages/design/src/web/css-tokens.mjs')).href);

const argv = process.argv.slice(2);
const CHECK = argv.includes('--check');
for (const a of argv) {
  if (a !== '--check') {
    console.error(`make-brand-assets: unrecognised flag ${a}`);
    console.error('make-brand-assets: known flags: --check');
    process.exit(2);
  }
}

/* ------------------------------------------------------------------ the sources */

const MARK_SVG = join(ROOT, 'packages/design/brand/studpilot-mark.svg');
const markPath = /<path[^>]*\sd="([^"]+)"/.exec(readFileSync(MARK_SVG, 'utf8'))?.[1];
if (!markPath) {
  console.error(`make-brand-assets: no <path d="..."> in ${relative(ROOT, MARK_SVG)}`);
  process.exit(2);
}
const dark = theme(themeBlocks().dark);
const PAPER = dark.resolve('paper');
const ACCENT = dark.resolve('accent');
if (!PAPER || !ACCENT) {
  console.error('make-brand-assets: --paper and --accent of the dark theme must be solid colours in tokens.css');
  process.exit(2);
}

/** The icon: the mark in the accent, centred on a tile in the base colour. `square` drops the radius
 *  for the touch icon, because iOS applies its own mask and a baked-in radius leaves a sliver. */
const SCALE = 0.74;
const OFFSET = ((32 - 32 * SCALE) / 2).toFixed(2);
const icon = ({ square = false } = {}) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" role="img" aria-label="StudPilot">` +
  `<rect width="32" height="32"${square ? '' : ' rx="7"'} fill="${PAPER}"/>` +
  `<path transform="translate(${OFFSET} ${OFFSET}) scale(${SCALE})" fill="${ACCENT}" fill-rule="evenodd" d="${markPath}"/></svg>\n`;

/** Text assets: written verbatim, compared byte for byte. */
const TEXTS = [
  { out: 'packages/design/brand/favicon.svg', text: icon() },
  { out: 'apps/site/public/favicon.svg', text: icon() },
];

/** Raster assets: rendered in Chromium and compared pixel for pixel. */
const ASSETS = [];
for (const [size, out, opts] of [
  [16, 'packages/design/brand/icon-16.png'],
  [32, 'packages/design/brand/icon-32.png'],
  [180, 'packages/design/brand/icon-180.png', { square: true }],
  [512, 'packages/design/brand/icon-512.png'],
  [180, 'apps/site/public/apple-touch-icon.png', { square: true }],
  [192, 'apps/site/public/icon-192.png'],
  [512, 'apps/site/public/icon-512.png'],
]) {
  ASSETS.push({
    name: out.split('/').pop(),
    inlineHtml:
      `<meta charset="utf-8"><style>html,body{margin:0;width:${size}px;height:${size}px;overflow:hidden;background:transparent}` +
      `svg{display:block;width:100%;height:100%}</style>` + icon(opts),
    out,
    origin: 'packages/design/brand/studpilot-mark.svg',
    width: size,
    height: size,
    scale: 1,
    // Two flat colours and their antialiased edge: a tile and a mark. Fewer than this is a blank frame.
    minColours: 3,
    stride: size <= 64 ? 1 : 7,
    omitBackground: true,
  });
}
ASSETS.push({
  name: 'og.png',
  source: 'apps/site/brand/og.html',
  out: 'apps/site/public/og.png',
  // 1200x630 is the size Open Graph consumers document. deviceScaleFactor 1: the card is displayed at
  // roughly this size and a 2x render triples the bytes for detail nobody sees in a chat preview.
  width: 1200,
  height: 630,
  scale: 1,
  minColours: 8,
  stride: 7,
});

/* ------------------------------------------------------------------ helpers */

const sha = (buf) => createHash('sha256').update(buf).digest('hex').slice(0, 16);
const problems = [];
const report = [];

// EVERY FIELD IS PRESENT BEFORE ANY OF THEM IS USED AS A PATH. `join(ROOT, undefined)` does not
// throw: Node stringifies it, so a missing `out` makes a confident `<root>/undefined` directory.
for (const [i, asset] of ASSETS.entries()) {
  const missingFields = ['name', 'out', 'width', 'height', 'scale'].filter((k) => asset[k] === undefined || asset[k] === '');
  if (asset.source === undefined && asset.inlineHtml === undefined) missingFields.push('source or inlineHtml');
  if (missingFields.length) {
    console.error(`make-brand-assets: ASSETS[${i}] (${asset.name ?? 'unnamed'}) is missing ${missingFields.join(', ')}. Refusing to build a path out of undefined.`);
    process.exit(2);
  }
}

const browser = await chromium.launch();

/* ------------------------------------------------------------------ text assets */

for (const t of TEXTS) {
  const outPath = join(ROOT, t.out);
  const existing = existsSync(outPath) ? readFileSync(outPath, 'utf8') : null;
  const same = existing === t.text;
  report.push(`${t.out.split('/').slice(-2).join('/')}  svg  ${t.text.length} B  ${same ? 'unchanged' : existing ? 'CHANGED' : 'NEW'}`);
  if (CHECK) {
    if (existing === null) problems.push(`${t.out} does not exist; run without --check to write it`);
    else if (!same) problems.push(`${t.out} is out of date with its sources (the mark and tokens.css), run \`pnpm brand\``);
  } else if (!same) {
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, t.text);
  }
}

/* ------------------------------------------------------------------ raster assets */

for (const asset of ASSETS) {
  const src = asset.source ? join(ROOT, asset.source) : null;
  if (src && !existsSync(src)) {
    problems.push(`${asset.source} is missing, nothing to render ${asset.name} from`);
    continue;
  }

  const page = await browser.newPage({ viewport: { width: asset.width, height: asset.height }, deviceScaleFactor: asset.scale });

  // NO NETWORK. file:// and data: only; anything else is recorded and aborted, and fails the run.
  const stray = [];
  await page.route('**/*', (route) => {
    const url = route.request().url();
    if (url.startsWith('file://') || url.startsWith('data:') || url === 'about:blank') return route.continue();
    stray.push(url);
    return route.abort();
  });

  if (src) await page.goto(pathToFileURL(src).href, { waitUntil: 'networkidle' });
  else await page.setContent(asset.inlineHtml, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  if (stray.length) problems.push(`${asset.name}: tried to fetch ${stray.slice(0, 3).join(', ')}; the brand assets use the system font stack and the files on disk`);

  // NOTHING IS CLIPPED. A headline one word too long silently runs off a fixed-size card.
  const overflow = await page.evaluate(() => ({
    x: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    y: document.documentElement.scrollHeight - document.documentElement.clientHeight,
  }));
  if (overflow.x > 1 || overflow.y > 1) problems.push(`${asset.name}: content overflows the frame by ${overflow.x}x${overflow.y}px`);

  const buf = await page.screenshot({ type: 'png', omitBackground: asset.omitBackground === true });
  await page.close();

  // THE FRAME IS NOT BLANK. The failure that looks most like success is a valid PNG of one flat
  // colour, so the decoded pixels are counted rather than the byte length trusted.
  const uniq = await sampleColours(browser, buf, asset.stride ?? 7);
  if (uniq.distinct < (asset.minColours ?? 8)) {
    problems.push(`${asset.name}: only ${uniq.distinct} distinct colours across ${uniq.sampled} sampled pixels (dominant ${uniq.dominantShare}% ${uniq.dominant}); it did not render`);
  }

  const outPath = join(ROOT, asset.out);
  const existing = existsSync(outPath) ? readFileSync(outPath) : null;
  const same = existing && existing.equals(buf);
  report.push(`${asset.out.split('/').slice(-2).join('/')}  ${asset.width}x${asset.height}  ${(buf.length / 1024).toFixed(1)} kB  sha=${sha(buf)}  colours=${uniq.distinct}  ${same ? 'unchanged' : existing ? 'CHANGED' : 'NEW'}`);

  if (CHECK) {
    if (!existing) problems.push(`${asset.out} does not exist; run without --check to write it`);
    else if (!same) problems.push(`${asset.out} is out of date with ${asset.source ?? asset.origin ?? 'its generator'}; run \`pnpm brand\``);
  } else if (!same) {
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, buf);
  }
}

/* ------------------------------------------------------------------ every shipped SVG must parse */

// AN UNPARSEABLE SVG RENDERS AS NOTHING, SILENTLY: no console error, no build failure, no icon, and
// every check that reads the file as TEXT still passes. So each one is parsed by a renderer. (XML
// forbids a double hyphen inside a comment; a favicon with one is a favicon that never shows.)
{
  const dirs = ['packages/design/brand', 'apps/site/public', 'apps/site/src/components'];
  const svgs = [];
  const walk = (d) => {
    for (const name of readdirSync(d)) {
      const p = join(d, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (name.endsWith('.svg')) svgs.push(p);
    }
  };
  for (const dir of dirs) if (existsSync(join(ROOT, dir))) walk(join(ROOT, dir));
  if (svgs.length === 0) problems.push('found no SVG files to validate: did packages/design/brand move?');

  const page = await browser.newPage();
  let bad = 0;
  for (const file of svgs) {
    const verdict = await page.evaluate((src) => {
      const doc = new DOMParser().parseFromString(src, 'image/svg+xml');
      const err = doc.querySelector('parsererror');
      if (err) return err.textContent.replace(/\s+/g, ' ').trim().slice(0, 160);
      if (!doc.documentElement || doc.documentElement.nodeName !== 'svg') return `root element is <${doc.documentElement?.nodeName ?? 'nothing'}>, not <svg>`;
      return null;
    }, readFileSync(file, 'utf8'));
    if (verdict) { bad += 1; problems.push(`${relative(ROOT, file)}: does not parse, ${verdict}`); }
  }
  await page.close();
  // Count what was CHECKED, not what passed.
  report.push(`${svgs.length} SVG file(s) checked, ${svgs.length - bad} parse`);
}

await browser.close();

/** Decode the PNG in a browser context and count what is actually in it. */
async function sampleColours(br, buf, stride) {
  const page = await br.newPage();
  const out = await page.evaluate(
    async ({ b64, step }) => {
      const img = new Image();
      img.src = 'data:image/png;base64,' + b64;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = img.width;
      c.height = img.height;
      const g = c.getContext('2d');
      g.drawImage(img, 0, 0);
      const { data } = g.getImageData(0, 0, img.width, img.height);
      const counts = new Map();
      let sampled = 0;
      for (let y = 0; y < img.height; y += step) {
        for (let x = 0; x < img.width; x += step) {
          const i = (y * img.width + x) * 4;
          const key = `${data[i]},${data[i + 1]},${data[i + 2]},${data[i + 3]}`;
          counts.set(key, (counts.get(key) ?? 0) + 1);
          sampled += 1;
        }
      }
      let dominant = '';
      let top = 0;
      for (const [k, v] of counts) if (v > top) { top = v; dominant = k; }
      return { distinct: counts.size, sampled, dominant, dominantShare: Math.round((top / sampled) * 100) };
    },
    { b64: buf.toString('base64'), step: stride },
  );
  await page.close();
  return out;
}

for (const line of report) console.log(`  ${line}`);

if (problems.length) {
  console.error(`\nBRAND ASSETS FAILED: ${problems.length} problem(s)`);
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}

console.log(`BRAND ASSETS OK: ${TEXTS.length + ASSETS.length} asset(s)${CHECK ? ', all current' : ' written'}`);
