#!/usr/bin/env node
/**
 * Render the brand assets that cannot be authored by hand, from ONE drawing and the design tokens.
 *
 *   packages/design/brand/studpilot-mark.svg   the mark (drawn in this repository, see PROVENANCE.md)
 *   packages/design/src/web/tokens.css         the colours: the base for the tile, the accent for the mark
 *   packages/design/src/web/brand-recipe.mjs   how they are composed (shared with brand.test.mjs)
 *
 * What it writes:
 *   every copy of the favicon: packages/design/brand/favicon.svg, apps/site/public/favicon.svg,
 *     tools/repo-chat/public/favicon.svg, and the inline data: URI of <link rel="icon"> in apps/web/index.html
 *   packages/design/brand/icon-16.png, icon-32.png, icon-180.png, icon-512.png
 *   apps/site/public/apple-touch-icon.png (180), icon-192.png, icon-512.png
 *   apps/site/public/og.png, the Open Graph card, rasterised from apps/site/brand/og.html
 *   packages/design/brand/brand-manifest.json: a hash of every input and of every PNG written
 *
 * Nothing is fetched. The type is the system font stack and the card's stylesheet is the token file
 * on disk; a request to anything but file:// fails the run, which is how "no webfont, no CDN" is
 * enforced rather than hoped for.
 *
 * THE CARD MUST HAVE ITS TOKENS. A page whose stylesheet fails to load is not an error to a browser: it is
 * drawn unstyled (white, serif), and a check of the PNG's pixels passes it, since any anti-aliased text
 * has more distinct colours than a blank-frame check asks for. So the card is checked at its source
 * (every stylesheet it links exists, one is the token file the manifest hashes, every token it spends is
 * declared) and as the browser loaded it (no file request failed, every token it spends resolves to a
 * value, and the page is painted in the dark --paper). A card that fails any of these is reported and its
 * PNG is not written.
 *
 * A PNG is opaque to review, so the sources are the reviewable artefacts and this turns them into the
 * shipped ones. Every step asserts against rendered pixels: a generator is exactly the tool that
 * reports success over a blank frame, a zero-byte file or a mark that never painted.
 *
 * `--check` writes nothing and fails when ANY output is stale:
 *   - every text copy of the favicon is compared byte for byte;
 *   - the manifest must match the sources (a changed mark, token or card) and the PNGs on disk (a
 *     swapped or hand-edited PNG), which is also what packages/design/src/web/brand.test.mjs holds
 *     in `pnpm -r test` without a browser;
 *   - every icon is rendered again and compared with the committed PNG PIXEL BY PIXEL, not byte by
 *     byte: another machine encodes and antialiases a little differently, an old mark does not pass
 *     as a new one. og.png is drawn in the system font of the machine that ran `pnpm brand`, so it
 *     is compared by render only on the platform the manifest names (renderedOn); elsewhere the
 *     manifest hashes are its check, and the report says so.
 *
 * Usage:
 *   node scripts/make-brand-assets.mjs              write the assets
 *   node scripts/make-brand-assets.mjs --check      render and compare, write nothing (CI runs this)
 */
import { chromium } from '@playwright/test';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
// A static import, so the dead-end gate sees a product module behind the recipe (a computed dynamic import is invisible to it).
import { FAVICON_COPIES, MANIFEST_FILE, PNGS, WEB_FAVICON_FILE, brandSources, cardLinks, cardProblems, iconSvg, manifestOf, manifestProblems, sha256, withWebFavicon } from '../packages/design/src/web/brand-recipe.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

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
const sources = brandSources(ROOT);
if (!sources.markPath) {
  console.error(`make-brand-assets: no <path d="..."> in ${relative(ROOT, MARK_SVG)}`);
  process.exit(2);
}
if (!sources.paper || !sources.accent) {
  console.error('make-brand-assets: --paper and --accent of the dark theme must be solid colours in tokens.css');
  process.exit(2);
}

/** Text assets: written verbatim, compared byte for byte. */
const TEXTS = FAVICON_COPIES.map((out) => ({ out, text: iconSvg(sources) }));
{
  // The app's favicon is an inline data: URI inside index.html: the file is rewritten around it.
  const htmlPath = join(ROOT, WEB_FAVICON_FILE);
  const html = existsSync(htmlPath) ? readFileSync(htmlPath, 'utf8') : null;
  const patched = html === null ? null : withWebFavicon(html, iconSvg(sources));
  if (patched === null) {
    console.error(`make-brand-assets: ${WEB_FAVICON_FILE} has no <link rel="icon" href="data:image/svg+xml,..."> to regenerate`);
    process.exit(2);
  }
  TEXTS.push({ out: WEB_FAVICON_FILE, text: patched, what: 'inline favicon' });
}

/** Raster assets: rendered in Chromium and compared pixel for pixel. */
const ASSETS = PNGS.map((p) => p.input === 'og'
  ? {
      name: 'og.png',
      source: p.source,
      out: p.out,
      input: p.input,
      // 1200x630 is the size Open Graph consumers document. deviceScaleFactor 1: the card is displayed at
      // roughly this size and a 2x render triples the bytes for detail nobody sees in a chat preview.
      width: p.width,
      height: p.height,
      scale: 1,
      minColours: 8,
      stride: 7,
    }
  : {
      name: p.out.split('/').pop(),
      inlineHtml:
        `<meta charset="utf-8"><style>html,body{margin:0;width:${p.size}px;height:${p.size}px;overflow:hidden;background:transparent}` +
        `svg{display:block;width:100%;height:100%}</style>` + iconSvg(sources, { square: p.input === 'iconSquare' }),
      out: p.out,
      input: p.input,
      origin: 'packages/design/brand/studpilot-mark.svg',
      width: p.size,
      height: p.size,
      scale: 1,
      // Two flat colours and their antialiased edge: a tile and a mark. Fewer than this is a blank frame.
      minColours: 3,
      stride: p.size <= 64 ? 1 : 7,
      omitBackground: true,
    });

/* ------------------------------------------------------------------ helpers */

const sha = (buf) => sha256(buf).slice(0, 16);
const problems = [];

/**
 * How far a re-render may sit from the committed PNG and still be the same picture: the mean absolute
 * difference per channel (0 to 255) and the share of pixels any channel of which is off by more than
 * 96. Another machine encodes and antialiases the edge of a rounded tile a little differently (the
 * software-GL Chromium measured 2.2 on the mean at 16 px); a different colour or an old icon is off by
 * 17 or more on the mean and by a quarter of the frame. A change of a unit or two to the geometry or
 * the base colour is NOT visible at this tolerance on purpose: the manifest hashes catch those exactly. (Measured for this recipe in planning/proof/M2/DESIGN-SYSTEM.md section 10.4.)
 */
const SAME_PICTURE = { mean: 8, far: 0.05 };
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

// THE CARD'S SOURCE, BEFORE ANY BROWSER: a link to no file, no link to the token file, a token nobody declares.
const cardSourceProblems = cardProblems(ROOT);
for (const c of cardSourceProblems) problems.push(c);

const manifestPath = join(ROOT, MANIFEST_FILE);
const stored = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : null;

const browser = await chromium.launch();

/* ------------------------------------------------------------------ text assets */

for (const t of TEXTS) {
  const outPath = join(ROOT, t.out);
  const existing = existsSync(outPath) ? readFileSync(outPath, 'utf8') : null;
  const same = existing === t.text;
  report.push(`${t.out}  ${t.what ?? 'svg'}  ${t.text.length} B  ${same ? 'unchanged' : existing ? 'CHANGED' : 'NEW'}`);
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

  // A file the page asked for and the disk did not have: the stylesheet of a card whose href is wrong.
  const failedLoads = [];
  page.on('requestfailed', (req) => { if (req.url().startsWith('file://')) failedLoads.push(req.url()); });

  if (src) await page.goto(pathToFileURL(src).href, { waitUntil: 'networkidle' });
  else await page.setContent(asset.inlineHtml, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  if (stray.length) problems.push(`${asset.name}: tried to fetch ${stray.slice(0, 3).join(', ')}; the brand assets use the system font stack and the files on disk`);

  // THE CARD AS THE BROWSER LOADED IT. Every token the card spends must have a value on the page (an unresolved
  // var() falls back without a word), no file may have failed to load, and the page must be painted in --paper.
  let cardBroken = cardSourceProblems.length > 0 && src !== null;
  if (src) {
    const spent = cardLinks(ROOT).spends;
    const drawn = await page.evaluate((names) => {
      const root = getComputedStyle(document.documentElement);
      return { unresolved: names.filter((n) => root.getPropertyValue(n).trim() === ''), background: getComputedStyle(document.body).backgroundColor };
    }, spent);
    const paper = `rgb(${[1, 3, 5].map((i) => parseInt(sources.paper.slice(i, i + 2), 16)).join(', ')})`;
    const seen = [];
    if (failedLoads.length) seen.push(`a file did not load (${failedLoads.slice(0, 2).map((u) => relative(ROOT, fileURLToPath(u))).join(', ')})`);
    if (drawn.unresolved.length) seen.push(`${drawn.unresolved.join(', ')} resolve${drawn.unresolved.length === 1 ? 's' : ''} to nothing on the page`);
    if (drawn.background !== paper) seen.push(`the page is painted ${drawn.background}, not the dark --paper ${paper}`);
    for (const reason of seen) problems.push(`${asset.name}: the card was drawn without its tokens: ${reason}; the PNG was not written`);
    if (seen.length) cardBroken = true;
  }

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
  let verdict = same ? 'unchanged' : existing ? 'CHANGED' : 'NEW';

  if (CHECK) {
    if (!existing) problems.push(`${asset.out} does not exist; run without --check to write it`);
    else if (!same) {
      // Not byte for byte (another machine encodes differently), but the same PICTURE or it is stale.
      if (asset.input === 'og' && stored?.renderedOn !== process.platform) {
        verdict = `not compared by render (drawn on ${stored?.renderedOn ?? 'an unknown platform'}, this is ${process.platform}); the manifest hashes check it`;
      } else {
        const d = await pixelDiff(browser, existing, buf);
        if (d.size) {
          verdict = `STALE: ${d.size[0]}x${d.size[1]} on disk, ${d.size[2]}x${d.size[3]} rendered`;
          problems.push(`${asset.out} is ${d.size[0]}x${d.size[1]} but its sources render ${d.size[2]}x${d.size[3]}; run \`pnpm brand\``);
        } else if (d.mean > SAME_PICTURE.mean || d.far > SAME_PICTURE.far) {
          verdict = `STALE: mean difference ${d.mean.toFixed(2)}, ${(d.far * 100).toFixed(1)}% of pixels far off`;
          problems.push(`${asset.out} is not the picture ${asset.source ?? asset.origin} renders now (mean difference ${d.mean.toFixed(2)} of 255, ${(d.far * 100).toFixed(1)}% of pixels far off); run \`pnpm brand\``);
        } else {
          verdict = `same picture (mean difference ${d.mean.toFixed(2)}, ${(d.far * 100).toFixed(2)}% far off)`;
        }
      }
    }
  } else if (!same && !cardBroken) {
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, buf);
  } else if (cardBroken) {
    verdict = 'NOT WRITTEN (the card was drawn without its tokens)';
  }
  report.push(`${asset.out.split('/').slice(-2).join('/')}  ${asset.width}x${asset.height}  ${(buf.length / 1024).toFixed(1)} kB  sha=${sha(buf)}  colours=${uniq.distinct}  ${verdict}`);
}

/* ------------------------------------------------------------------ the manifest: inputs and outputs, hashed */

// A PNG IS OPAQUE, SO WHAT IT WAS MADE FROM IS RECORDED. The manifest holds a hash of each input and
// of each PNG as written; the test in packages/design recomputes both from the tree on every run.
if (CHECK) {
  if (!stored) {
    problems.push(`${MANIFEST_FILE} does not exist; run without --check to write it`);
  } else {
    const now = manifestOf(ROOT, stored.renderedOn);
    const bad = manifestProblems(stored, now);
    for (const b of bad) problems.push(`${MANIFEST_FILE}: ${b}`);
    report.push(`${MANIFEST_FILE.split('/').slice(-2).join('/')}  ${Object.keys(now.inputs).length} inputs, ${Object.keys(now.outputs).length} outputs hashed  ${bad.length ? 'STALE' : 'current'}`);
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

// THE MANIFEST IS WRITTEN LAST, AND ONLY BY A RUN THAT FOUND NOTHING WRONG. It records what each PNG was made from; a run
// that refused to write a PNG (a card drawn without its tokens) must not also record the broken card as the PNG's source.
if (!CHECK) {
  const text = JSON.stringify(manifestOf(ROOT, process.platform), null, 2) + '\n';
  const had = existsSync(manifestPath) ? readFileSync(manifestPath, 'utf8') : null;
  if (problems.length === 0 && had !== text) writeFileSync(manifestPath, text);
  report.push(`${MANIFEST_FILE.split('/').slice(-2).join('/')}  manifest  ${problems.length ? 'NOT WRITTEN (the run failed)' : had === text ? 'unchanged' : had ? 'CHANGED' : 'NEW'}`);
}

/** Decode two PNGs in a browser context: { size } when their dimensions differ, else { mean, far } (see SAME_PICTURE). */
async function pixelDiff(br, a, b) {
  const page = await br.newPage();
  const out = await page.evaluate(
    async ({ x, y }) => {
      const load = async (b64) => {
        const img = new Image();
        img.src = 'data:image/png;base64,' + b64;
        await img.decode();
        const c = document.createElement('canvas');
        c.width = img.width;
        c.height = img.height;
        const g = c.getContext('2d', { willReadFrequently: true });
        g.drawImage(img, 0, 0);
        return g.getImageData(0, 0, img.width, img.height);
      };
      const [p, q] = [await load(x), await load(y)];
      if (p.width !== q.width || p.height !== q.height) return { size: [p.width, p.height, q.width, q.height] };
      const n = p.width * p.height;
      let sum = 0;
      let far = 0;
      for (let i = 0; i < n; i += 1) {
        let worst = 0;
        for (let k = 0; k < 4; k += 1) {
          const d = Math.abs(p.data[i * 4 + k] - q.data[i * 4 + k]);
          sum += d;
          if (d > worst) worst = d;
        }
        if (worst > 96) far += 1;
      }
      return { mean: sum / (n * 4), far: far / n };
    },
    { x: a.toString('base64'), y: b.toString('base64') },
  );
  await page.close();
  return out;
}

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
