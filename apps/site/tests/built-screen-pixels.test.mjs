// THE PICTURE A READER RECEIVES IS THE PICTURE THE RENDERER WROTE — CHECKED IN PIXELS, NOT IN CSS.
//
// tests/built-screen-is-evidence.test.mjs proves the FILE served under public/ is byte-identical to
// the file in docs/evidence. That is half the claim. The other half is that the browser draws those
// bytes and nothing else draws on top of them, and no amount of reading source files can establish
// it — which is exactly how the defect this file exists for shipped.
//
// WHAT WAS MEASURED, at the live origin, in a real Chromium, on 2026-09-21. <Horizon />'s canvas is
// `position: fixed; z-index: -1`. That ought to put it behind every in-flow background on the page.
// It did not: its perspective grid and its glow band were painted ACROSS the lower third of the
// screenshot and across the caption bar beneath it, in both themes — most obviously on the light
// one, where green grid lines ran over a white bar. A green grid over a screenshot does not read as
// the page's atmosphere. It reads as the picture being damaged, on the one band whose whole claim is
// that the picture was not touched.
//
// THE PROPERTY, and why it is checkable rather than a matter of taste. Four points in the source
// SVG are flat `#101014` — its root rectangle, with nothing drawn over them. Whatever the page does
// around the picture, those four points must still come back `#101014` in the rendered document. A
// canvas painting over the figure moves them; so would an overlay, a tint, a blend mode or an
// opacity applied to the band. The fix is two declarations in BuiltScreen.astro
// (`position: relative; z-index: 0`), and taking either of them out turns this red.
//
// SAMPLED FROM A SCREENSHOT, NOT FROM getComputedStyle. A composited canvas is invisible to the
// cascade: every computed style on the figure reads exactly the same with the bleed and without it.
// Only the rasterised page knows.
//
// IT RUNS AGAINST THE BUILD AND A LOCAL SERVER, like tests/rendered-typography.test.mjs, so it
// measures what was built here rather than what happens to be deployed. `astro build` first.
//
// Run with:  node --test tests/built-screen-pixels.test.mjs      (from apps/site, after a build)
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, dirname, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BUILT_SCREEN } from '../src/data/showcase-proof.ts';

const SITE = join(dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = join(SITE, '..', '..');
const DIST = join(SITE, 'dist');

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.json': 'application/json',
  '.xml': 'application/xml',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.ico': 'image/x-icon',
};

/** The flat-background points, in the SVG's own 1600x900 coordinates. */
const FLAT = [
  { x: 40, y: 450, why: 'left margin of the frame, beside the panel' },
  { x: 1560, y: 450, why: 'right margin of the frame' },
  { x: 800, y: 40, why: 'above the panel' },
  { x: 800, y: 870, why: 'below the panel — where the horizon grid was drawn' },
];

const svgSource = () => readFileSync(join(SITE, 'public', BUILT_SCREEN.capture.src), 'utf8');

/**
 * WHAT THE FLAT POINTS ARE IN THE FILE — COMPOSITED, NOT READ OFF THE FIRST RECT.
 *
 * This took the `fill` of the opening full-frame rect and expected to find it on the page. It is
 * not what the page shows: the render paints a second full-frame rect over the first at
 * `fill-opacity="0.5"`, so the flat area is the two composited — rgb(16,16,20) under
 * rgb(10,12,18) at a half, which is rgb(13,14,19), and rgb(13,14,19) is exactly what a browser
 * draws. Reading one layer and calling it the picture would have made this file fail on a page with
 * nothing wrong with it, which is the same class of mistake as passing one with something wrong.
 *
 * Every full-frame rect is composited here, in document order, so another layer added to the render
 * changes the expectation rather than breaking the check.
 */
function flatColourFromSvg() {
  const layers = [...svgSource().matchAll(
    /<rect (?:x="0(?:\.0+)?" y="0(?:\.0+)?" )?width="1600(?:\.0+)?" height="900(?:\.0+)?"[^>]*?fill="(#[0-9a-fA-F]{6}|rgb\([^)]*\))"(?:[^>]*?fill-opacity="([\d.]+)")?[^>]*\/>/g,
  )];
  assert.ok(layers.length > 0,
    'the render has no full-frame background rect, so this file does not know which colour its flat'
    + ' points are. That is a broken instrument, not a clean page.');
  const parse = (c) => (c.startsWith('#')
    ? [0, 2, 4].map((i) => parseInt(c.slice(1).slice(i, i + 2), 16))
    : c.match(/[\d.]+/g).slice(0, 3).map(Number));
  let out = [0, 0, 0];
  layers.forEach((m, i) => {
    const colour = parse(m[1]);
    const alpha = m[2] === undefined ? 1 : Number(m[2]);
    out = i === 0 && alpha === 1 ? colour : out.map((c, k) => c * (1 - alpha) + colour[k] * alpha);
  });
  return out.map((c) => Math.round(c));
}

/**
 * THE POSITIVE CONTROL, TAKEN OUT OF THE PICTURE RATHER THAN REMEMBERED.
 *
 * This was a typed pair of coordinates first, aimed at the close button by eye off a screenshot.
 * They were wrong by two hundred pixels and the control read as flat background — a control that
 * fails for its own reasons is as useless as no control. So the saturated rectangle is FOUND in the
 * SVG: the largest one whose red channel dominates by a wide margin, which in this render is the
 * close button in the corner of the screen the model drew. If the render is ever replaced by one
 * with nothing saturated in it, this says so instead of quietly having no control.
 */
function controlPointFromSvg() {
  const rects = [...svgSource().matchAll(
    /<rect x="([\d.]+)" y="([\d.]+)" width="([\d.]+)" height="([\d.]+)"[^>]*fill="rgb\((\d+),\s*(\d+),\s*(\d+)\)"/g,
  )].map((m) => ({
    x: +m[1], y: +m[2], w: +m[3], h: +m[4], r: +m[5], g: +m[6], b: +m[7],
  })).filter((q) => q.w >= 24 && q.h >= 24 && q.r > 140 && q.r > q.g + 50 && q.r > q.b + 50);
  assert.ok(rects.length > 0,
    'no saturated rectangle was found in the render, so this file has no positive control and any'
    + ' clean result below would be unbelievable');
  const best = rects.sort((a, b) => b.w * b.h - a.w * a.h)[0];
  // NOT THE CENTRE. Every one of these rectangles is a button with a white label centred in it, so
  // the middle of the largest red rectangle in this render reads rgb(255,255,255) — measured. An
  // eighth of the way in from its left edge is inside the fill and clear of the glyph.
  return { x: best.x + best.w * 0.12, y: best.y + best.h / 2, rgb: [best.r, best.g, best.b] };
}

function serveDist() {
  const server = createServer((req, res) => {
    const url = (req.url ?? '/').split('?')[0];
    let file = normalize(join(DIST, decodeURIComponent(url)));
    if (!file.startsWith(DIST + sep) && file !== DIST) { res.writeHead(403).end(); return; }
    if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
    if (!existsSync(file)) { res.writeHead(404).end('not found'); return; }
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
    res.end(readFileSync(file));
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port })));
}

function loadChromium() {
  const require_ = createRequire(join(ROOT, 'package.json'));
  try {
    return require_('@playwright/test').chromium;
  } catch (err) {
    assert.fail('this check rasterises the page and cannot find @playwright/test at the repository'
      + ` root: ${err.message}. That is a failure to observe, not a clean picture.`);
  }
  return null;
}

/**
 * Decode the PNG playwright hands back.
 *
 * Playwright bundles pngjs for its own screenshot comparison and re-exports it from
 * `playwright-core/lib/utilsBundle`, so this needs no new dependency — installing is not this
 * lane's to do, and the repository's rule is that CI never runs an install for a test's
 * convenience. It is resolved through @playwright/test's OWN require because playwright-core is
 * its dependency and not the root's.
 */
function pixelReader(png) {
  const require_ = createRequire(join(ROOT, 'package.json'));
  const { PNG } = createRequire(require_.resolve('@playwright/test'))('playwright-core/lib/utilsBundle');
  assert.ok(PNG, 'playwright no longer re-exports PNG, so this file cannot read a pixel and has'
    + ' measured nothing');
  const img = PNG.sync.read(png);
  return (x, y) => {
    const i = (img.width * y + x) << 2;
    return [img.data[i], img.data[i + 1], img.data[i + 2]];
  };
}

test('THE BUILD, THE BROWSER AND THE DECODER ARE ALL HERE, or this file has measured nothing', () => {
  assert.ok(existsSync(join(DIST, 'index.html')),
    'apps/site/dist/index.html is missing — run `npx astro build` in apps/site first. A picture'
    + ' nobody rendered is not a picture nobody found a defect on.');
  assert.ok(existsSync(join(SITE, 'public', BUILT_SCREEN.capture.src)),
    `public${BUILT_SCREEN.capture.src} is missing, so there is nothing to sample`);
  assert.ok(loadChromium(), 'chromium did not load');
  const flat = flatColourFromSvg();
  assert.equal(flat.length, 3, 'the flat colour did not parse out of the render');
});

test('nothing is painted over the render: its flat background is still its flat background', async () => {
  const chromium = loadChromium();
  const want = flatColourFromSvg();
  const { server, port } = await serveDist();
  let browser;
  try {
    browser = await chromium.launch();
  } catch (err) {
    server.close();
    assert.fail(`Chromium would not launch (${err.message}). Run \`npx playwright install chromium\``
      + ' at the repository root.');
  }

  const found = [];
  const control = controlPointFromSvg();
  try {
    // BOTH THEMES. The bleed was visible in both and obvious in light, and the site is dark by
    // default with the header toggle as the only way in — prefers-color-scheme does not move it,
    // which is measured here rather than assumed: the assertion below fails if the click did not
    // change the theme, instead of silently sampling the dark page twice and calling it two themes.
    for (const theme of ['dark', 'light']) {
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 }, deviceScaleFactor: 1 });
      const page = await ctx.newPage();
      const res = await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'load' });
      assert.equal(res?.status(), 200, 'the landing did not serve');

      if (theme === 'light') {
        const before = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
        await page.locator('header button').first().click();
        await page.waitForTimeout(250);
        const after = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
        assert.notEqual(after, before,
          `clicking the header's first button did not change data-theme (${before} -> ${after}), so`
          + ' the light half of this check would have sampled the dark page. Find the toggle.');
      }

      //[[ SCROLL, THEN SETTLE, THEN MEASURE — AND THE FIRST WRITING OF THIS DID NOT.
      //   It scrolled and read getBoundingClientRect() in the same evaluate, which returns the rect
      //   from BEFORE the scroll: the sample points came out at y = 4716 in a 1000px viewport. The
      //   positive control below caught it, which is the whole reason a control is here; without it
      //   this file would have compared four pixels of empty page to a background colour and had a
      //   decent chance of printing green. The measurement is its own step now. ]]
      //[[ SCROLL UNTIL IT IS ACTUALLY THERE, AND THIS TOOK THREE TRIES TO GET HONEST.
      //   One scrollTo plus a wait left the picture at y 701..1290 in a 1000px viewport, twice, at
      //   two different offsets: the landing scrolls smoothly and its reveal pass adds height above
      //   the band while it settles, so a single jump lands somewhere near and then the page moves
      //   under it. Smooth scrolling is turned off and the position is re-aimed until it stops
      //   changing, which is what "wait for it to settle" has to mean when the page is still
      //   growing. If it never settles, the bounds check below says so. ]]
      await page.addStyleTag({ content: 'html, body { scroll-behavior: auto !important; }' });
      let box = null;
      for (let i = 0; i < 12; i += 1) {
        const r = await page.evaluate(() => {
          const img = document.querySelector('#built img');
          if (!img) return null;
          // Centre the PICTURE, not the band: the band's heading and paragraph are ~300px of it.
          const b = img.getBoundingClientRect();
          window.scrollTo({ top: b.top + window.scrollY - (window.innerHeight - b.height) / 2, behavior: 'instant' });
          const a = img.getBoundingClientRect();
          return { x: a.x, y: a.y, w: a.width, h: a.height };
        });
        assert.ok(r, 'the built landing has no #built band, so there is no render on it to sample.'
          + ' A dist that predates this band reads exactly like a landing that lost it — run'
          + ' `npx astro build` in apps/site and try again before believing either.');
        await page.waitForTimeout(250);
        const now = await page.evaluate(() => {
          const a = document.querySelector('#built img').getBoundingClientRect();
          return { x: a.x, y: a.y, w: a.width, h: a.height };
        });
        if (box && Math.abs(now.y - box.y) < 1 && now.y >= 0 && now.y + now.h <= 1000) { box = now; break; }
        box = now;
      }
      assert.ok(box.y >= 0 && box.y + box.h <= 1000,
        `the render sits at y ${Math.round(box.y)}..${Math.round(box.y + box.h)} in a 1000px`
        + ' viewport, so it is not wholly on screen and the samples below would miss it');

      const at = pixelReader(await page.screenshot());

      //[[ POSITIVE CONTROL, EVERY THEME, BEFORE ANY CLEAN RESULT IS BELIEVED.
      //   A decoder that returned zeros, or a coordinate map that pointed at the wrong place, would
      //   make the four samples below agree with each other and with nothing real. `control` is a
      //   saturated rectangle FOUND in the source SVG; if that point does not read as its own
      //   colour on the page, this file is measuring the wrong pixels and says so instead of
      //   reporting a clean picture. It has already caught two bugs in itself: a rect measured
      //   before the scroll, and a control aimed by eye two hundred pixels off the button. ]]
      const cx = Math.round(box.x + (control.x / BUILT_SCREEN.capture.width) * box.w);
      const cy = Math.round(box.y + (control.y / BUILT_SCREEN.capture.height) * box.h);
      const got = at(cx, cy);
      const controlOff = Math.max(...got.map((c, i) => Math.abs(c - control.rgb[i])));
      assert.ok(controlOff <= 12,
        `the positive control at (${cx}, ${cy}) is rgb(${control.rgb}) in the render and reads`
        + ` rgb(${got}) on the page, off by ${controlOff}. The screenshot, the decoder or the`
        + ' coordinate map is wrong, so nothing else in this file measured the picture.');

      for (const p of FLAT) {
        const x = Math.round(box.x + (p.x / BUILT_SCREEN.capture.width) * box.w);
        const y = Math.round(box.y + (p.y / BUILT_SCREEN.capture.height) * box.h);
        assert.ok(y >= 0 && y < 1000 && x >= 0 && x < 1280,
          `the sample for "${p.why}" fell outside the viewport at (${x}, ${y}) — the band moved and`
          + ' this check would have measured the wrong pixels');
        const got = at(x, y);
        const off = Math.max(...got.map((c, i) => Math.abs(c - want[i])));
        found.push({ theme, why: p.why, at: [x, y], got, off });
      }
      await ctx.close();
    }
  } finally {
    await browser.close();
    server.close();
  }

  // 6 of 255 is generous for an exact-colour comparison and deliberately so: the figure has a
  // border-radius, and a sample that landed on an antialiased edge should not fail a check about
  // something being painted across the middle of a picture. The bleed this was written for moved
  // these points by far more than 6.
  const bad = found.filter((f) => f.off > 6);
  assert.deepEqual(bad, [],
    'the render is being painted over. These points are flat '
    + `rgb(${want.join(',')}) in the source SVG and are not that on the page:\n`
    + bad.map((f) => `  ${f.theme}: ${f.why} at (${f.at}) is rgb(${f.got}) — off by ${f.off}`).join('\n')
    + '\n\nSomething is drawn on top of the evidence. .built-shot carries `position: relative;'
    + ' z-index: 0` to sit above <Horizon />\'s negative-z-index canvas; check that first.');

  assert.equal(found.length, FLAT.length * 2,
    `only ${found.length} sample(s) were taken across two themes; the loop did not run`);
});
