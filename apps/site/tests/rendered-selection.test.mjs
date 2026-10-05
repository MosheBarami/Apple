// WHAT SELECTED TEXT LOOKS LIKE, MEASURED WHERE IT IS LOOKED AT.
//
// tests/contrast.test.mjs reads the sheets: it lays each `::selection` rule over the five surfaces and, since the fifth review cycle,
// over every fill a control draws. That is the right place to check a CLAIM. It cannot tell what the browser DRAWS: which rule wins
// for a given text node, what is really behind it (a fill three ancestors up, a card at 40% opacity), or whether a highlight is painted
// at all. One defect proved the gap: `::selection` was a translucent wash of the accent behind --ink, and the sheet check measured
// it over the five page surfaces (4.5:1 and up) while the accent buttons, whose fill is not a page surface, drew the wash over the
// accent: the accent again, with --ink on it, 2.77:1 in dark and 2.94:1 in light. Nothing in the sheets was wrong in isolation.
//
// SO THIS FILE RENDERS. It serves apps/site/dist, opens every route in both themes in a real Chromium, and for EVERY element that
// owns a text node (nothing is listed) reads the `::selection` style the browser resolved for it, lays it over what is really behind
// the element (its own fill and every ancestor's, opacity included), and requires 4.5:1. It then selects the text of the controls the
// defect hid in and reads the PIXELS the browser painted, because a resolved style is still a model.
//
// IT FAILS RATHER THAN SKIPS: no build, no browser, no server is a failure to observe, and a failure to observe must not render as
// a clean page. AND IT PROVES IT CAN SEE: the scan is first pointed at an accent control it must fail (the page-wide wash, no pair of
// its own) and at one it must pass (the inverted pair), on a real page.
//
// Run with:  npx astro build && node --test tests/rendered-selection.test.mjs   (from apps/site)
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { dirname, extname, join, normalize, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { rgbOfHex, theme, themeBlocks } from '@studpilot/design/css-tokens';

const SITE = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(SITE, 'dist');
const ROOT = join(SITE, '..', '..');
const MODES = ['dark', 'light'];
const THEMES = Object.fromEntries(MODES.map((m) => [m, theme(themeBlocks()[m])]));
const BAR = 4.5;
const NO_MOTION = '*,*::before,*::after{transition:none!important;animation:none!important}.reveal,[data-reveal]{opacity:1!important;transform:none!important}';

/** Every page the build emitted, as a route: derived from dist, never listed (a page added tomorrow is measured tomorrow). */
function routes() {
  const out = [];
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name === 'index.html') { const rel = relative(DIST, dirname(p)).split(sep).join('/'); out.push(rel === '' ? '/' : `/${rel}/`); }
      else if (e.name === '404.html') out.push('/404.html');
    }
  };
  walk(DIST);
  return out.sort();
}

const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2', '.xml': 'application/xml' };

function serveDist() {
  const server = createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    let file = normalize(join(DIST, decodeURIComponent(url.pathname)));
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
    return assert.fail(`this check renders the pages and cannot find @playwright/test at the repository root: ${err.message}. That is a failure to observe, not a clean site.`);
  }
}

/**
 * Runs INSIDE the page (serialised by Playwright: it closes over nothing). For every element that owns a text node, or only those matching
 * `selector`: the `::selection` pair the browser resolved, laid over what is really drawn behind the element, as { sel, label, ratio, ground,
 * highlight, ownFill, dim, default }. `ground` is the colour behind the text with every ancestor's background and opacity composited from the
 * root (white under nothing); `highlight` is the selection background over it (null when the selection sets none: the browser's own colour).
 */
function scanSelection(selector) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 1;
  const g = canvas.getContext('2d', { willReadFrequently: true });
  const rgba = (css) => {
    g.clearRect(0, 0, 1, 1);
    g.fillStyle = '#000';
    g.fillStyle = css;
    g.fillRect(0, 0, 1, 1);
    const d = g.getImageData(0, 0, 1, 1).data;
    return [d[0], d[1], d[2], d[3] / 255];
  };
  const over = (top, bottom, w = 1) => [0, 1, 2].map((i) => top[i] * top[3] * w + bottom[i] * (1 - top[3] * w));
  const lum = (c) => { const f = (v) => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)]; return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  /** What a pixel behind (or inside) `el` shows: every background from the root down, each at the opacity accumulated above it. */
  const ground = (el) => {
    const chain = [];
    for (let n = el; n; n = n.parentElement) chain.unshift(n);
    let out = [255, 255, 255];
    let cum = 1;
    let dim = 1;
    for (const n of chain) {
      const cs = getComputedStyle(n);
      cum *= Number(cs.opacity);
      if (n !== el) dim *= Number(cs.opacity);
      const c = rgba(cs.backgroundColor);
      if (c[3] > 0) out = over(c, out, cum);
    }
    return { colour: out, dim };
  };
  const label = (el) => (el.getAttribute('aria-label') || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 36);
  const name = (el) => `${el.tagName.toLowerCase()}${(el.getAttribute('class') || '').trim().split(/\s+/).filter(Boolean).slice(0, 4).map((c) => `.${c}`).join('')}`;
  const found = [];
  const scope = selector ? document.querySelectorAll(selector) : document.body.querySelectorAll('*');
  for (const el of scope) {
    if (!selector && (el.closest('svg') || ['SCRIPT', 'STYLE', 'NOSCRIPT'].includes(el.tagName))) continue;
    if (!selector && ![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 0)) continue;
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    if (cs.display === 'none' || cs.visibility === 'hidden' || r.width <= 1 || r.height <= 1 || cs.userSelect === 'none') continue;
    const sel = getComputedStyle(el, '::selection');
    const fg = rgba(sel.color);
    const bg = rgba(sel.backgroundColor);
    const behind = ground(el);
    const highlight = bg[3] > 0 ? over(bg, behind.colour) : null;
    const under = highlight ?? behind.colour;
    const text = over(fg, under);
    const own = rgba(cs.backgroundColor);
    found.push({ sel: name(el), label: label(el), ratio: ratio(text, under), ground: behind.colour.map(Math.round), highlight: highlight && highlight.map(Math.round), ownFill: own[3] >= 0.5 ? own.slice(0, 3) : null, dim: behind.dim, default: bg[3] === 0 });
  }
  return found;
}

/** Runs INSIDE the page: the most frequent colour of a PNG (the highlight) and the colour that reads best against it (the glyph). */
async function paintedPair(b64) {
  const img = new Image();
  img.src = `data:image/png;base64,${b64}`;
  await img.decode();
  const c = document.createElement('canvas');
  c.width = img.width;
  c.height = img.height;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(img, 0, 0);
  const d = g.getImageData(0, 0, img.width, img.height).data;
  const freq = new Map();
  for (let k = 0; k < d.length; k += 4) { const key = (d[k] << 16) | (d[k + 1] << 8) | d[k + 2]; freq.set(key, (freq.get(key) || 0) + 1); }
  const lin = (v) => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; };
  const lum = (k) => 0.2126 * lin((k >> 16) & 255) + 0.7152 * lin((k >> 8) & 255) + 0.0722 * lin(k & 255);
  const [ground] = [...freq.entries()].sort((a, b) => b[1] - a[1])[0];
  let glyph = ground;
  let best = 1;
  for (const [k, n] of freq) {
    if (n < 3) continue;
    const r = (Math.max(lum(k), lum(ground)) + 0.05) / (Math.min(lum(k), lum(ground)) + 0.05);
    if (r > best) { best = r; glyph = k; }
  }
  const rgb = (k) => [(k >> 16) & 255, (k >> 8) & 255, k & 255];
  return { ground: rgb(ground), glyph: rgb(glyph), ratio: best };
}

let server;
let browser;
let context;
const SCANS = { dark: [], light: [] };
const ROUTES = [];
/** Routes that draw no text at all (a redirect page): they are allowed to read nothing, and only they. */
const NO_TEXT = new Set();
/** mode -> [{ sel, route, ...paintedPair }] */
const PIXELS = { dark: [], light: [] };
// A SAMPLE of the controls the defect hid in, selected and read as pixels (the style scan above covers every element on every route).
const PIXEL_SUBJECTS = ['span.cta__label', 'span.shiny__label', 'button.composer-send', 'a.btn-primary:not(.shiny)'];

async function open(page, base, route, mode) {
  await page.goto(base + route, { waitUntil: 'load' });
  // The theme is the attribute the stylesheets key on; it is set after the page's own scripts have run, so nothing resets it.
  await page.evaluate((m) => { document.documentElement.dataset.theme = m; }, mode);
  await page.addStyleTag({ content: NO_MOTION });
  await page.waitForTimeout(120);
}

/** Select the text of the first element matching `selector` and read the pixels of the text's own box. Null when none matches. */
async function selectedPixels(page, decoder, selector) {
  const loc = page.locator(selector).first();
  if (!(await loc.count())) return null;
  await loc.scrollIntoViewIfNeeded();
  const rect = await loc.evaluate((el) => {
    const s = getSelection();
    s.removeAllRanges();
    const range = document.createRange();
    range.selectNodeContents(el);
    s.addRange(range);
    const b = range.getBoundingClientRect();
    return { x: b.x, y: b.y, width: b.width, height: b.height };
  });
  const clip = { x: Math.max(0, rect.x + 1), y: Math.max(0, rect.y + 1), width: Math.max(2, Math.min(rect.width - 2, 400)), height: Math.max(2, rect.height - 2) };
  const shot = (await page.screenshot({ clip })).toString('base64');
  await page.evaluate(() => getSelection().removeAllRanges());
  return decoder.evaluate(paintedPair, shot);
}

test.before(async () => {
  assert.ok(existsSync(DIST), 'apps/site/dist is missing: run `npx astro build` in apps/site first');
  ROUTES.push(...routes());
  assert.ok(ROUTES.length >= 15, `only ${ROUTES.length} routes were found in dist; the walk has drifted`);
  const chromium = loadChromium();
  try {
    browser = await chromium.launch();
  } catch (err) {
    assert.fail(`Chromium would not launch (${err.message}). Run \`npx playwright install chromium\` at the repository root. A page nobody rendered is not a page nobody found a defect on.`);
  }
  ({ server } = await serveDist());
  const base = `http://127.0.0.1:${server.address().port}`;
  context = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2, reducedMotion: 'reduce' });
  // The pages are drawn from the build alone.
  await context.route((url) => !['127.0.0.1', 'localhost'].includes(url.hostname), (r) => r.abort());
  const page = await context.newPage();
  const decoder = await context.newPage();
  await decoder.setContent('<canvas></canvas>');
  for (const mode of MODES) {
    for (const route of ROUTES) {
      await open(page, base, route, mode);
      if (!(await page.evaluate(() => document.body.innerText.trim().length))) NO_TEXT.add(route);
      SCANS[mode].push(...(await page.evaluate(scanSelection)).map((r) => ({ ...r, route })));
      for (const selector of PIXEL_SUBJECTS) {
        const read = await selectedPixels(page, decoder, selector);
        if (read) PIXELS[mode].push({ selector, route, ...read });
      }
    }
  }
  server.base = base;
});

test.after(async () => {
  await browser?.close();
  server?.close();
});

const accentRgb = (mode) => ['accent', 'accent-strong'].map((n) => rgbOfHex(THEMES[mode].resolve(n)));
const near = (a, b, tol = 8) => [0, 1, 2].every((i) => Math.abs(a[i] - b[i]) <= tol);

test('the guard has teeth: the page-wide wash over an accent control is reported, and the control that sets its own pair passes', async () => {
  const page = await context.newPage();
  for (const mode of MODES) {
    await open(page, server.base, '/pricing/', mode);
    await page.evaluate(() => {
      const host = document.createElement('div');
      host.id = 'zz-host';
      host.style.cssText = 'position:fixed;left:0;top:0;z-index:99999;padding:12px;background:var(--paper)';
      host.innerHTML = '<span id="zz-bad" style="display:inline-block;padding:8px 14px;background:var(--accent);color:var(--accent-ink)">no pair of its own</span> '
        + '<style>#zz-ok::selection{background:var(--accent-ink);color:var(--accent)}</style><span id="zz-ok" style="display:inline-block;padding:8px 14px;background:var(--accent);color:var(--accent-ink)">its own pair</span>';
      document.body.appendChild(host);
    });
    const [bad] = await page.evaluate(scanSelection, '#zz-bad');
    const [ok] = await page.evaluate(scanSelection, '#zz-ok');
    assert.ok(bad && bad.ratio < BAR, `${mode}: the wash over the accent was not failed (${bad?.ratio})`);
    assert.ok(ok && ok.ratio >= BAR, `${mode}: the inverted pair was failed (${ok?.ratio})`);
    assert.ok(bad.ownFill && near(bad.ground, accentRgb(mode)[0], 2), `${mode}: the ground behind the fixture was not read as the accent (${bad.ground})`);
    // A card at 40% opacity dims what is behind its text: the scan must see the dimming, not the card's nominal colour.
    await page.evaluate(() => { document.getElementById('zz-host').insertAdjacentHTML('beforeend', '<div id="zz-dim" style="opacity:.4;background:var(--accent);padding:6px"><span id="zz-dim-t">dimmed</span></div>'); });
    const [dim] = await page.evaluate(scanSelection, '#zz-dim-t');
    assert.ok(dim && Math.abs(dim.dim - 0.4) < 0.01, `${mode}: the opacity of an ancestor was not read (${dim?.dim})`);
    await page.evaluate(() => document.getElementById('zz-host').remove());
  }
  await page.close();
  // The pixel reader: a painted highlight against its glyph.
  const decoder = await context.newPage();
  await decoder.setContent('<canvas></canvas>');
  const probe = await context.newPage();
  await probe.setContent('<body style="margin:0"><div id="a" style="width:60px;height:30px;background:#0c0816;color:#a67cff;font:20px sans-serif">Ab</div></body>');
  const png = (await probe.locator('#a').screenshot()).toString('base64');
  const pair = await decoder.evaluate(paintedPair, png);
  assert.deepEqual(pair.ground, [12, 8, 22], `the pixel reader did not find the highlight (${pair.ground})`);
  assert.ok(pair.ratio > 4 && pair.ratio < 8, `the pixel reader did not find the glyph against it (${pair.ratio})`);
  await decoder.close();
  await probe.close();
});

for (const mode of MODES) {
  test(`${mode}: every element that owns text, on every route, has selected text at 4.5:1 on what is drawn behind it`, () => {
    const all = SCANS[mode];
    // CANARIES: the scan read the whole site, not a corner of it.
    assert.ok(all.length >= 1500, `${mode}: only ${all.length} text elements were read across ${ROUTES.length} routes; the scan has drifted`);
    const silent = ROUTES.filter((route) => !all.some((r) => r.route === route) && !NO_TEXT.has(route));
    assert.deepEqual(silent, [], `${mode}: a route that draws text read nothing: ${silent.join(', ')}`);
    assert.ok(NO_TEXT.size <= 2, `${mode}: ${NO_TEXT.size} routes draw no text (${[...NO_TEXT].join(', ')}); the scan of what a page draws has drifted`);
    // The controls the defect hid in were found, by their ground, and not by name: text drawn on the accent or on its hover step.
    const onAccent = all.filter((r) => accentRgb(mode).some((a) => near(r.ground, a)));
    assert.ok(onAccent.length >= 8, `${mode}: only ${onAccent.length} text elements are drawn on the accent; the ground reader is blind`);
    const noPair = all.filter((r) => r.default).map((r) => `${r.route} <${r.sel}> "${r.label}"`);
    assert.deepEqual([...new Set(noPair)], [], `${mode}: an element is selected in the browser's own highlight colour (the ::selection rule sets none for it):\n  ${[...new Set(noPair)].join('\n  ')}`);
    const dimmed = all.filter((r) => r.dim < 0.99).map((r) => `${r.route} <${r.sel}> inside opacity ${r.dim.toFixed(2)}`);
    assert.deepEqual([...new Set(dimmed)], [], `${mode}: text is inside a faded ancestor, so its drawn pair is not the one this reads:\n  ${[...new Set(dimmed)].join('\n  ')}`);
    const bad = all.filter((r) => r.ratio < BAR).map((r) => `${r.ratio.toFixed(2)}:1 ${r.route} <${r.sel}> "${r.label}" over rgb(${r.ground.join(', ')})`);
    assert.deepEqual([...new Set(bad)], [], `${mode}: selected text below ${BAR}:1:\n  ${[...new Set(bad)].join('\n  ')}`);
  });

  test(`${mode}: the text of the accent controls, selected, is painted at 4.5:1 (pixels, not styles)`, () => {
    const read = PIXELS[mode];
    // CANARIES: every subject was found on some page and selected.
    for (const selector of PIXEL_SUBJECTS) assert.ok(read.some((r) => r.selector === selector), `${mode}: ${selector} was not found on any route, so its selection was never painted and read`);
    const bad = read.filter((r) => r.ratio < BAR).map((r) => `${r.ratio.toFixed(2)}:1 ${r.route} ${r.selector}: highlight rgb(${r.ground.join(', ')}), glyph rgb(${r.glyph.join(', ')})`);
    assert.deepEqual([...new Set(bad)], [], `${mode}: a selection is painted below ${BAR}:1:\n  ${[...new Set(bad)].join('\n  ')}`);
    // A highlight that is the fill itself shows nothing: what is painted behind the selected glyphs must not be the accent (or its hover step).
    const invisible = read.filter((r) => accentRgb(mode).some((a) => near(r.ground, a))).map((r) => `${r.route} ${r.selector}: the highlight is rgb(${r.ground.join(', ')}), the fill`);
    assert.deepEqual([...new Set(invisible)], [], `${mode}: a selection is painted in the colour of the control it is on, so it does not show:\n  ${[...new Set(invisible)].join('\n  ')}`);
  });
}

