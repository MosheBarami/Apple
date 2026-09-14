#!/usr/bin/env node
// What the deployed pages actually LOOK like, measured rather than described.
//
// WHY THIS EXISTS (§6.9). Every other checker in this repository reads source. A page can satisfy
// all of them and still render as a blank rectangle, a wall of unstyled Times New Roman, or a
// layout that only holds together at the one width somebody happened to look at. The suite cannot
// see any of that, and neither can a reviewer reading a diff.
//
// It captures every route at two viewports in both colour schemes, writes the frames to
// docs/evidence/pixels/<pass>/ so a human can look at them, and FAILS on four things that are
// each invisible to source review:
//
//   1. a frame that is >92% one colour — the page did not render, or rendered empty
//   2. a <body> font-family that is a bare system stack — the typography never loaded
//   3. a route using none of the design system's tokens — styled by accident, not by system
//   4. a frame differing from its committed baseline by >2% with no baseline update in the
//      same commit — a visual regression nobody declared
//
// THE DECODER IS THE BROWSER. Comparing frames needs raw pixels, and decoding a PNG in Node means
// either a dependency this repository does not declare or eighty lines of zlib and scanline
// filters. The browser already decodes PNGs correctly, so the frames go back through a canvas.
// No new dependency, and no decoder of mine to be wrong.
//
//   node scripts/check-pixels.mjs --deployed
//   node scripts/check-pixels.mjs --base http://localhost:4322 --pass 9
//   node scripts/check-pixels.mjs --base ... --write-baseline
// From @playwright/test, which is what this repository declares. Importing bare 'playwright'
// resolves only when the standalone package happens to be hoisted, which is an accident of the
// lockfile rather than a dependency.
import { chromium } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DEPLOYED = 'https://golem.moshe-barami111.workers.dev';

/* ------------------------------------------------------------------- flags --- */

const argv = process.argv.slice(2);
const flags = { base: null, pass: null, writeBaseline: false, deployed: false };
for (let i = 0; i < argv.length; i += 1) {
  const a = argv[i];
  if (a === '--deployed') { flags.deployed = true; continue; }
  if (a === '--write-baseline') { flags.writeBaseline = true; continue; }
  if (a === '--base') { flags.base = argv[i + 1]; i += 1; continue; }
  if (a === '--pass') { flags.pass = argv[i + 1]; i += 1; continue; }
  console.error(`check-pixels: unrecognised flag ${a}`);
  console.error('check-pixels: known flags — --deployed --base <url> --pass <n> --write-baseline');
  process.exit(2);
}
if (!flags.deployed && !flags.base) {
  console.error('check-pixels: pass --deployed, or --base <url> to capture something else');
  process.exit(2);
}
const BASE = (flags.base ?? DEPLOYED).replace(/\/$/, '');

/* ------------------------------------------------------- what gets captured --- */

/**
 * The routes, DERIVED from the pages that exist rather than listed here.
 *
 * A hard-coded list is a denominator that silently stops growing: the day someone adds a page,
 * this checker reports clean over a route it has never seen. §6.3.
 */
function routes() {
  const dir = join(ROOT, 'apps', 'site', 'src', 'pages');
  const out = [];
  const walk = (d, prefix) => {
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      if (entry.isDirectory()) { walk(join(d, entry.name), `${prefix}${entry.name}/`); continue; }
      if (!entry.name.endsWith('.astro')) continue;
      const name = entry.name.replace(/\.astro$/, '');
      // 404 is reached by being wrong, not by being linked; capturing it needs a bad URL.
      if (name === '404') { out.push('/__not_found_probe__'); continue; }
      out.push(name === 'index' ? (prefix || '/') : `${prefix}${name}`);
    }
  };
  walk(dir, '/');
  return [...new Set(out)].sort();
}

const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'phone', width: 390, height: 844 },
];
const SCHEMES = ['light', 'dark'];

/* -------------------------------------------------------- the design system --- */

/**
 * The approved typography and token vocabulary.
 *
 * Read from `packages/design`, NOT from the site's own CSS. Reading it from the site would make
 * rules 2 and 3 circular — the page would be checked against itself and could never fail.
 */
function designSystem() {
  const p = join(ROOT, 'packages', 'design', 'src', 'tokens.mjs');
  if (!existsSync(p)) return null;
  return p;
}

const SYSTEM_STACKS = [
  /^-?apple-system/i, /^system-ui/i, /^BlinkMacSystemFont/i,
  /^Times/i, /^serif$/i, /^sans-serif$/i, /^Arial/i, /^Helvetica$/i,
];

/* ------------------------------------------------------------------- report --- */

const findings = [];
const fail = (what, where, why) => findings.push({ what, where, why });

const PASS = flags.pass ?? 'unpassed';
const OUT = join(ROOT, 'docs', 'evidence', 'pixels', String(PASS));
const BASELINE = join(ROOT, 'docs', 'evidence', 'pixels', 'baseline');

const slug = (route, vp, scheme) =>
  `${route.replace(/^\//, '').replace(/\/$/, '') || 'index'}`.replace(/\//g, '_') + `--${vp}--${scheme}.png`;

/* ------------------------------------------------------------------ capture --- */

const ROUTES = routes();
console.log(
  `DENOMINATOR ${ROUTES.length} route(s) x ${VIEWPORTS.length} viewport(s) x ${SCHEMES.length} scheme(s) ` +
  `= ${ROUTES.length * VIEWPORTS.length * SCHEMES.length} frame(s); base=${BASE}`,
);

mkdirSync(OUT, { recursive: true });
if (flags.writeBaseline) mkdirSync(BASELINE, { recursive: true });

const browser = await chromium.launch();
let captured = 0;
let compared = 0;

/** Decode a PNG to {w,h,data} using the browser, which already has a correct decoder. */
async function decode(page, buf) {
  return page.evaluate(async (b64) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, c.width, c.height);
    return { w: c.width, h: c.height, data: Array.from(d.data) };
  }, buf.toString('base64'));
}

try {
  const TOKENS = designSystem();
  if (!TOKENS) {
    fail(
      'packages/design declares no token vocabulary',
      'packages/design/src/tokens.mjs',
      'rules 2 and 3 have no non-circular source of truth, so they are NOT being checked — this is a gap, not a pass',
    );
  }
  const vocabulary = TOKENS ? (await import(`file://${TOKENS}`)) : null;

  for (const vp of VIEWPORTS) {
    for (const scheme of SCHEMES) {
      const ctx = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        colorScheme: scheme,
      });
      const page = await ctx.newPage();
      const decoder = await ctx.newPage();
      await decoder.setContent('<html><body></body></html>');

      for (const route of ROUTES) {
        const url = `${BASE}${route === '/__not_found_probe__' ? '/__not_found_probe__' : route}`;
        let res;
        try {
          res = await page.goto(url, { waitUntil: 'networkidle', timeout: 30_000 });
        } catch (err) {
          fail(`${route} did not load`, url, String(err).slice(0, 120));
          continue;
        }
        if (!res) { fail(`${route} returned no response`, url, 'navigation produced nothing'); continue; }

        const buf = await page.screenshot({ fullPage: false });
        const file = join(OUT, slug(route, vp.name, scheme));
        writeFileSync(file, buf);
        captured += 1;

        const img = await decode(decoder, buf);

        // RULE 1 — a frame that is overwhelmingly one colour did not render.
        const counts = new Map();
        for (let i = 0; i < img.data.length; i += 4) {
          const k = (img.data[i] << 16) | (img.data[i + 1] << 8) | img.data[i + 2];
          counts.set(k, (counts.get(k) ?? 0) + 1);
        }
        const total = img.w * img.h;
        const top = Math.max(...counts.values());
        const share = top / total;
        if (share > 0.92) {
          fail(`${route} is ${(share * 100).toFixed(1)}% one colour at ${vp.name}/${scheme}`, file, 'the page did not render, or rendered empty');
        }

        // RULE 2 — the typography actually loaded.
        if (vocabulary?.APPROVED_FONT_STACKS) {
          const family = await page.evaluate(() => getComputedStyle(document.body).fontFamily);
          const first = family.split(',')[0].replace(/["']/g, '').trim();
          const approved = vocabulary.APPROVED_FONT_STACKS.some((f) => first.toLowerCase() === f.toLowerCase());
          if (!approved && SYSTEM_STACKS.some((re) => re.test(first))) {
            fail(`${route} falls back to a bare system font at ${vp.name}/${scheme}`, file, `body font-family resolves to ${first}`);
          }
        }

        // RULE 3 — the page is styled BY the system, not beside it.
        if (vocabulary?.TOKEN_PREFIXES) {
          const used = await page.evaluate((prefixes) => {
            const sheets = [...document.styleSheets];
            let hits = 0;
            for (const s of sheets) {
              let rules;
              try { rules = [...s.cssRules]; } catch { continue; }  // cross-origin sheet
              for (const r of rules) {
                const t = r.cssText ?? '';
                if (prefixes.some((p) => t.includes(p))) hits += 1;
              }
            }
            return hits;
          }, vocabulary.TOKEN_PREFIXES);
          if (used === 0) {
            fail(`${route} uses no design token at ${vp.name}/${scheme}`, file, `no rule mentions any of ${vocabulary.TOKEN_PREFIXES.join(', ')}`);
          }
        }

        // RULE 4 — a regression nobody declared.
        const baseFile = join(BASELINE, slug(route, vp.name, scheme));
        if (flags.writeBaseline) {
          writeFileSync(baseFile, buf);
        } else if (existsSync(baseFile)) {
          const before = await decode(decoder, readFileSync(baseFile));
          if (before.w !== img.w || before.h !== img.h) {
            fail(`${route} changed size at ${vp.name}/${scheme}`, file, `${before.w}x${before.h} -> ${img.w}x${img.h}`);
          } else {
            let diff = 0;
            for (let i = 0; i < img.data.length; i += 4) {
              if (Math.abs(img.data[i] - before.data[i]) > 8
                || Math.abs(img.data[i + 1] - before.data[i + 1]) > 8
                || Math.abs(img.data[i + 2] - before.data[i + 2]) > 8) diff += 1;
            }
            compared += 1;
            const ratio = diff / total;
            if (ratio > 0.02 && !baselineTouchedInHead(baseFile)) {
              fail(
                `${route} differs from its baseline by ${(ratio * 100).toFixed(1)}% at ${vp.name}/${scheme}`,
                file,
                'a visual change with no baseline update in the same commit is an undeclared regression',
              );
            }
          }
        }
      }
      await ctx.close();
    }
  }
} finally {
  await browser.close();
}

/** Whether this baseline was updated in HEAD — a declared change rather than a regression. */
function baselineTouchedInHead(file) {
  try {
    const rel = file.slice(ROOT.length + 1);
    return execFileSync('git', ['show', '--name-only', '--format=', 'HEAD'], { cwd: ROOT, encoding: 'utf8' })
      .split('\n').map((l) => l.trim()).includes(rel);
  } catch { return false; }
}

console.log(`CAPTURED ${captured} frame(s) into docs/evidence/pixels/${PASS}/; ${compared} compared against a baseline`);

if (!findings.length) {
  console.log(`PIXELS CLEAN — ${captured} frame(s), 0 findings`);
  process.exit(0);
}
for (const f of findings) console.error(`  ${f.where}: ${f.what} — ${f.why}`);
console.log(`PIXELS FAILED — ${findings.length} finding(s) across ${captured} frame(s)`);
process.exit(1);
