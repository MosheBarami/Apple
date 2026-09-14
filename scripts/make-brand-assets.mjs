#!/usr/bin/env node
/**
 * Render the brand assets that cannot be authored by hand.
 *
 * Today that is one file: `apps/site/public/og.png`, the Open Graph share card, rasterised from
 * `apps/site/brand/og.html` so it can use the real Archivo variable font at font-stretch 118%.
 *
 * WHY THIS IS A SCRIPT AND NOT A COMMITTED BINARY SOMEONE MADE ONCE. A PNG is opaque to review: a
 * diff shows "binary files differ" and nothing about what changed, so the moment the palette moves
 * the card silently stops matching the product and no one can see it in a pull request. The HTML
 * is the reviewable artefact; this turns it into the shipped one, and re-running it is how the
 * card follows a design change.
 *
 * EVERY STEP ASSERTS. A generator is exactly the kind of tool that reports success over nothing —
 * a font that never loaded, a page that painted empty, a file written with zero bytes. Each of
 * those is checked against the rendered pixels rather than assumed, because all three produce a
 * valid PNG and a zero exit if you only ask whether the screenshot call threw.
 *
 * Usage:
 *   node scripts/make-brand-assets.mjs              write the assets
 *   node scripts/make-brand-assets.mjs --check      render and compare, write nothing (for CI)
 */
import { chromium } from '@playwright/test';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const ASSETS = [
  {
    name: 'og.png',
    source: 'apps/site/brand/og.html',
    out: 'apps/site/public/og.png',
    width: 1200,
    height: 630,
    // 1200x630 is the size Open Graph consumers document, and the one a 2:1 card is cropped to.
    // deviceScaleFactor 1: the card is displayed at roughly this size, and a 2x render triples the
    // bytes for detail nobody sees in a chat preview.
    scale: 1,
    /** Families the card's design depends on. A substitute here is invisible and total. */
    fonts: ['Archivo', 'Figtree', 'Geist Mono'],
  },
];

const argv = process.argv.slice(2);
const CHECK = argv.includes('--check');
for (const a of argv) {
  if (a !== '--check') {
    console.error(`make-brand-assets: unrecognised flag ${a}`);
    console.error('make-brand-assets: known flags — --check');
    process.exit(2);
  }
}

const sha = (buf) => createHash('sha256').update(buf).digest('hex').slice(0, 16);

const browser = await chromium.launch();
const problems = [];
const report = [];

// EVERY FIELD IS PRESENT BEFORE ANY OF THEM IS USED AS A PATH.
//
// `join(ROOT, undefined)` does not throw — Node stringifies it, so a missing `out` produces a
// confident `<root>/undefined` directory rather than a stop. rbxai-1d found exactly that directory
// at the repo root and read it back to this line; the actual culprit was a throwaway `node -e`
// preview of mine that read process.env.SP before it was exported, but the reasoning was right and
// this file is one `out:` typo away from being the culprit next time.
//
// The general shape is the one worth guarding: a value that is not there becoming a plausible
// answer instead of an error.
for (const [i, asset] of ASSETS.entries()) {
  const missingFields = ['name', 'source', 'out', 'width', 'height', 'scale', 'fonts']
    .filter((k) => asset[k] === undefined || asset[k] === null || asset[k] === '');
  if (missingFields.length) {
    console.error(
      `make-brand-assets: ASSETS[${i}] (${asset.name ?? 'unnamed'}) is missing ${missingFields.join(', ')}. ` +
      'Refusing to build a path out of undefined.',
    );
    process.exit(2);
  }
}

for (const asset of ASSETS) {
  const src = join(ROOT, asset.source);
  if (!existsSync(src)) {
    problems.push(`${asset.source} is missing — nothing to render ${asset.name} from`);
    continue;
  }

  const page = await browser.newPage({
    viewport: { width: asset.width, height: asset.height },
    deviceScaleFactor: asset.scale,
  });

  // `file://` rather than a dev server: the source is a standalone document by design, and a
  // generator that needs the site running is one more thing that can be stale.
  await page.goto(`file://${src}`, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);

  // 1. THE FONTS ACTUALLY ARRIVED. Without this the card renders in a system sans, which looks
  //    deliberate, passes every other check here, and is not the design. `document.fonts` is the
  //    only thing that knows; a CSS declaration is present either way.
  const loaded = new Set(
    await page.evaluate(() =>
      [...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family),
    ),
  );
  const missing = asset.fonts.filter((f) => !loaded.has(f));
  if (missing.length) {
    problems.push(
      `${asset.name}: ${missing.join(', ')} did not load — the card would ship in a substitute face. ` +
      `Loaded: ${[...loaded].join(', ') || 'nothing'}`,
    );
  }

  // 2. THE WIDTH AXIS IS APPLIED. Archivo can load and still render at the default 100% if the
  //    declaration is lost, which is the whole design gone with nothing visibly broken.
  const stretch = await page.evaluate(() => getComputedStyle(document.querySelector('h1')).fontStretch);
  if (stretch !== '118%') {
    problems.push(`${asset.name}: h1 font-stretch is ${stretch}, expected 118%`);
  }

  // 3. NOTHING IS CLIPPED. A headline one word too long silently runs off a fixed-size card.
  const overflow = await page.evaluate(() => ({
    x: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    y: document.documentElement.scrollHeight - document.documentElement.clientHeight,
  }));
  if (overflow.x > 1 || overflow.y > 1) {
    problems.push(`${asset.name}: content overflows the card by ${overflow.x}x${overflow.y}px`);
  }

  const buf = await page.screenshot({ type: 'png' });
  await page.close();

  // 4. THE FRAME IS NOT BLANK. The failure this catches is the one that looks most like success:
  //    a valid PNG of a single flat colour. Sampled from the decoded pixels, not guessed from the
  //    byte length — a 630px field of #080a0f compresses small but is not suspiciously small.
  const uniq = await sampleColours(browser, buf, asset);
  if (uniq.distinct < 200) {
    problems.push(
      `${asset.name}: only ${uniq.distinct} distinct colours across ${uniq.sampled} sampled pixels ` +
      `(dominant ${uniq.dominantShare}% ${uniq.dominant}) — the card did not render`,
    );
  }

  const outPath = join(ROOT, asset.out);
  const existing = existsSync(outPath) ? readFileSync(outPath) : null;
  const same = existing && existing.equals(buf);

  report.push(
    `${asset.name}  ${asset.width}x${asset.height}  ${(buf.length / 1024).toFixed(1)} kB  ` +
    `sha=${sha(buf)}  colours=${uniq.distinct}  ${same ? 'unchanged' : existing ? 'CHANGED' : 'NEW'}`,
  );

  if (CHECK) {
    if (!existing) problems.push(`${asset.out} does not exist; run without --check to write it`);
    else if (!same) problems.push(`${asset.out} is out of date with ${asset.source}`);
  } else if (!same) {
    writeFileSync(outPath, buf);
  }
}

/* ------------------------------------------------- every shipped SVG must actually parse --- */
//
// AN UNPARSEABLE SVG RENDERS AS NOTHING, SILENTLY. No console error, no build failure, no icon —
// the browser simply draws a broken-image glyph or an empty box, and every check in this repository
// that reads the file as TEXT still passes, because the bytes are all there.
//
// Found by rendering the favicon at 16px and seeing a broken-image glyph. The cause was a double
// hyphen inside an XML comment, which XML forbids: the comment named a CSS custom property the
// obvious way. Nothing else would have caught it, and the mark would have been absent from every
// browser tab.
//
// Parsed in the browser rather than with a text scan, because "does a renderer accept this" is the
// actual question and a regex for `--` inside comments answers a narrower one.
{
  const dirs = ['apps/site/public', 'apps/site/src/components'];
  const svgs = [];
  for (const dir of dirs) {
    const abs = join(ROOT, dir);
    if (!existsSync(abs)) continue;
    const walk = (d) => {
      for (const name of readdirSync(d)) {
        const p = join(d, name);
        if (statSync(p).isDirectory()) walk(p);
        else if (name.endsWith('.svg')) svgs.push(p);
      }
    };
    walk(abs);
  }

  if (svgs.length === 0) {
    problems.push('found no SVG files to validate — did apps/site/public move?');
  }

  const page = await browser.newPage();
  for (const file of svgs) {
    const text = readFileSync(file, 'utf8');
    const rel = relative(ROOT, file);
    const verdict = await page.evaluate((src) => {
      const doc = new DOMParser().parseFromString(src, 'image/svg+xml');
      const err = doc.querySelector('parsererror');
      if (err) return err.textContent.replace(/\s+/g, ' ').trim().slice(0, 160);
      if (!doc.documentElement || doc.documentElement.nodeName !== 'svg') {
        return `root element is <${doc.documentElement?.nodeName ?? 'nothing'}>, not <svg>`;
      }
      return null;
    }, text);
    if (verdict) problems.push(`${rel}: does not parse — ${verdict}`);
  }
  await page.close();
  // Count what was CHECKED, not what passed. "1 SVG file(s) parse" printed happily in the same
  // breath as the failure saying one of them did not — a summary line that contradicts the finding
  // three lines below it is the same defect this whole file is built to avoid, in miniature.
  const bad = problems.filter((p) => p.includes('does not parse')).length;
  report.push(`${svgs.length} SVG file(s) checked, ${svgs.length - bad} parse`);
}

await browser.close();

/** Decode the PNG in a browser context and count what is actually in it. */
async function sampleColours(br, buf, asset) {
  const page = await br.newPage();
  const out = await page.evaluate(
    async ({ b64, w, h }) => {
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
      // Every 7th pixel on both axes: dense enough that a gradient shows hundreds of steps, cheap
      // enough to stay instant. A prime stride so it cannot land on a repeating pattern.
      let sampled = 0;
      for (let y = 0; y < img.height; y += 7) {
        for (let x = 0; x < img.width; x += 7) {
          const i = (y * img.width + x) * 4;
          const key = `${data[i]},${data[i + 1]},${data[i + 2]}`;
          counts.set(key, (counts.get(key) ?? 0) + 1);
          sampled += 1;
        }
      }
      let dominant = '';
      let top = 0;
      for (const [k, v] of counts) if (v > top) { top = v; dominant = k; }
      return { distinct: counts.size, sampled, dominant, dominantShare: Math.round((top / sampled) * 100) };
    },
    { b64: buf.toString('base64'), w: asset.width, h: asset.height },
  );
  await page.close();
  return out;
}

for (const line of report) console.log(`  ${line}`);

if (problems.length) {
  console.error(`\nBRAND ASSETS FAILED — ${problems.length} problem(s)`);
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}

console.log(`BRAND ASSETS OK — ${ASSETS.length} asset(s)${CHECK ? ', all current' : ' written'}`);
