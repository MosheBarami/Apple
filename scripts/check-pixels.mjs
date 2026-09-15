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
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DEPLOYED = 'https://golem.moshe-barami111.workers.dev';

/* ------------------------------------------------------------------- flags --- */

const argv = process.argv.slice(2);
const flags = { base: null, pass: null, writeBaseline: false, deployed: false, routes: null, tokens: null, baseline: null };
for (let i = 0; i < argv.length; i += 1) {
  const a = argv[i];
  if (a === '--deployed') { flags.deployed = true; continue; }
  if (a === '--write-baseline') { flags.writeBaseline = true; continue; }
  if (a === '--base') { flags.base = argv[i + 1]; i += 1; continue; }
  if (a === '--pass') { flags.pass = argv[i + 1]; i += 1; continue; }
  // `--routes /a,/b` narrows the sweep. It exists so this checker's own tests can exercise a rule
  // against four frames instead of seventy-two, and so an operator can re-check one page without
  // paying for the whole site. It NARROWS and can never widen, so it cannot be used to make a run
  // look clean by pointing it somewhere friendly — the DENOMINATOR line prints what was actually
  // swept, and a narrowed run says so in the same breath as its verdict.
  // `--tokens <path>` points the vocabulary somewhere else. It exists so this checker's own tests
  // can prove the missing-vocabulary GAP is reported — a case that became untestable the moment
  // packages/design/src/tokens.mjs started existing, which is the good outcome making its own
  // guard unobservable.
  if (a === '--tokens') { flags.tokens = argv[i + 1]; i += 1; continue; }
  // `--baseline <dir>` points the comparison at another baseline. Same reason as `--tokens`: the
  // cross-build rule below is unreachable from a test otherwise, because the real baseline is a
  // fixed path in this repository and a test cannot write into it. Pointing it at an empty
  // directory does not buy a clean run — nothing is compared, and the CAPTURED line says
  // "0 compared against a baseline" in the same breath as the verdict.
  if (a === '--baseline') { flags.baseline = argv[i + 1]; i += 1; continue; }
  if (a === '--routes') { flags.routes = (argv[i + 1] ?? '').split(',').map((r) => r.trim()).filter(Boolean); i += 1; continue; }
  console.error(`check-pixels: unrecognised flag ${a}`);
  console.error('check-pixels: known flags — --deployed --base <url> --pass <n> --write-baseline --routes <a,b> --tokens <path> --baseline <dir>');
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
  const p = flags.tokens ? resolve(flags.tokens) : join(ROOT, 'packages', 'design', 'src', 'tokens.mjs');
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
const BASELINE = flags.baseline ?? join(ROOT, 'docs', 'evidence', 'pixels', 'baseline');

//[[ A BASELINE THAT DOES NOT SAY WHERE IT CAME FROM CANNOT ANSWER THE QUESTION IT IS ASKED.
//
//   Run `--deployed` against a baseline captured from a local build and all 72 frames differ by
//   76-99.9%, and every one is reported as "an undeclared regression". They are not. They are two
//   different BUILDS being compared — the deployed site is months of work behind the repository —
//   and a pixel diff cannot tell that apart from someone quietly changing the design.
//
//   Measured: that is exactly what pass 12 produced. 72 findings across 72 frames, while the three
//   intrinsic rules above — one-colour, bare system font, no design token — fired on NONE of them.
//   A rule that fires on 100% of frames is not measuring what its message claims.
//
//   So the baseline records its origin and sha, and a comparison across origins is reported as
//   what it is. Not softened: it still fails, because a deployed site that does not look like the
//   repository IS a finding. It stops being called the wrong finding. ]]
const PROVENANCE = join(BASELINE, 'PROVENANCE.json');
const baselineProvenance = (() => {
  try { return JSON.parse(readFileSync(PROVENANCE, 'utf8')); } catch { return null; }
})();
// Unknown provenance is treated as cross-build, not as same-build. The baseline committed before
// this field existed has none, and assuming it matches would be assuming the answer.
const sameBuild = baselineProvenance !== null && baselineProvenance.origin === BASE;
const crossBuild = [];

const slug = (route, vp, scheme) =>
  `${route.replace(/^\//, '').replace(/\/$/, '') || 'index'}`.replace(/\//g, '_') + `--${vp}--${scheme}.png`;

/* ------------------------------------------------------------------ capture --- */

const ALL_ROUTES = routes();
const ROUTES = flags.routes ? ALL_ROUTES.filter((r) => flags.routes.includes(r)) : ALL_ROUTES;
if (flags.routes && !ROUTES.length) {
  console.error(`check-pixels: --routes matched none of the ${ALL_ROUTES.length} routes that exist`);
  process.exit(2);
}
console.log(
  `DENOMINATOR ${ROUTES.length} route(s) x ${VIEWPORTS.length} viewport(s) x ${SCHEMES.length} scheme(s) ` +
  `= ${ROUTES.length * VIEWPORTS.length * SCHEMES.length} frame(s); base=${BASE}` +
  (flags.routes ? ` — NARROWED from ${ALL_ROUTES.length} routes by --routes` : ''),
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
  // A STATIC SPECIFIER, guarded rather than computed.
  //
  // This was `await import(\`file://${TOKENS}\`)`, a template literal, which no static import graph
  // can resolve — so check-deadends correctly reported packages/design/src/tokens.mjs as imported
  // by nothing in the tree the moment it was created. The module was consumed; the consumption was
  // invisible, which is the same thing as far as every reader and every checker is concerned.
  //
  // The guard above already proved the file exists, so the optionality survives: an absent
  // vocabulary is still a reported gap rather than a crash.
  // A static specifier for the default, so check-deadends can see this dependency — a template
  // literal here made packages/design/src/tokens.mjs look imported by nothing the day it appeared.
  // An overridden path is necessarily dynamic; that is the test seam, not the shipping path.
  const vocabulary = !TOKENS ? null
    : flags.tokens ? await import(pathToFileURL(TOKENS).href)
    : await import('../packages/design/src/tokens.mjs');

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
            if (ratio > 0.02 && !baselineTouchedInHead(baseFile) && !sameBuild) {
              // Recorded, not reported per frame. Seventy-two copies of the same sentence bury the
              // one fact that matters, which is that the two sides are different builds.
              crossBuild.push(`${route} ${vp.name}/${scheme} ${(ratio * 100).toFixed(1)}%`);
            } else if (ratio > 0.02 && !baselineTouchedInHead(baseFile)) {
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

if (flags.writeBaseline) {
  // Written AFTER the sweep, so a baseline that failed part-way through does not claim an origin
  // for frames it never captured.
  let sha = 'unknown';
  try { sha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim(); } catch { /* not a repo */ }
  writeFileSync(PROVENANCE, `${JSON.stringify({ origin: BASE, sha, frames: captured }, null, 2)}\n`);
  console.log(`BASELINE PROVENANCE written — origin ${BASE}, sha ${sha.slice(0, 7)}`);
}

if (crossBuild.length) {
  const from = baselineProvenance === null
    ? 'a baseline that does not record its origin'
    : `a baseline captured from ${baselineProvenance.origin} at ${String(baselineProvenance.sha).slice(0, 7)}`;
  fail(
    `${crossBuild.length} of ${compared} compared frame(s) differ from ${from}`,
    'check-pixels',
    `this capture is from ${BASE}. Comparing two BUILDS cannot distinguish a regression from a deploy that is behind the repository — deploy, or re-baseline with --write-baseline, before reading these as regressions`,
  );
}

console.log(`CAPTURED ${captured} frame(s) into docs/evidence/pixels/${PASS}/; ${compared} compared against a baseline`);

if (!findings.length) {
  console.log(`PIXELS CLEAN — ${captured} frame(s), 0 findings`);
  process.exit(0);
}
for (const f of findings) console.error(`  ${f.where}: ${f.what} — ${f.why}`);
console.log(`PIXELS FAILED — ${findings.length} finding(s) across ${captured} frame(s)`);
process.exit(1);
