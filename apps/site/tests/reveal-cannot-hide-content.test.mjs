/**
 * NO PAGE CAN END UP BLANK BECAUSE A REVEAL NEVER FIRED.
 *
 * HISTORY. Until 2026-10-02 the landing, /docs, /changelog and /pricing hid their sections at opacity
 * 0 and waited for an IntersectionObserver to add a class, with a 2.6 second failsafe. That was
 * defended four separate ways (no-js, reduced motion, no observer, a silent observer) and it still
 * produced the defect the owner saw: a full-page capture, a fast scroll and a slow device all showed
 * long near-empty bands, because "hidden until a timer or an observer says otherwise" is a state those
 * cases really reach. A failsafe makes the failure shorter; it does not make it impossible.
 *
 * THE CONTRACT NOW. Nothing hides content. Every `[data-reveal]` block is VISIBLE BY DEFAULT, and where
 * the browser has scroll-driven animations the shared rule in apple-minimal.css eases it in as it
 * crosses the bottom edge of the window, driven by the scroll position itself, with `forwards` fill
 * only (never `both`, which would paint the first frame, opacity 0, on everything below the fold).
 * There is no class to wait for, no observer, no timer, so there is no failsafe to be late.
 *
 * Two halves. The first reads the stylesheets and layouts for the mechanisms that used to hide copy.
 * The second drives the BUILT site in Chromium and asks the only question that matters: what is the
 * computed opacity of everything below the fold with nothing scrolled, with scripting off, with
 * reduced motion, and straight after a jump to the bottom.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const SITE = join(dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = join(SITE, '..', '..');
const DIST = join(SITE, 'dist');
const STYLES = join(SITE, 'src', 'styles');
const LAYOUT_DIR = join(SITE, 'src', 'layouts');

const strip = (css) => css.replace(/\/\*[\s\S]*?\*\//g, ' ');
const read = (...p) => readFileSync(join(SITE, 'src', ...p), 'utf8');
const SHARED = strip(readFileSync(join(STYLES, 'apple-minimal.css'), 'utf8'));
const PAGE = read('pages', 'index.astro');

/** Every stylesheet and every component-scoped <style> the site ships, comments removed. */
function allCss() {
  const out = [];
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.name.endsWith('.css')) out.push({ name: full, css: strip(readFileSync(full, 'utf8')) });
      else if (e.name.endsWith('.astro')) {
        for (const m of readFileSync(full, 'utf8').matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/g)) out.push({ name: full, css: strip(m[1]) });
      }
    }
  };
  walk(join(SITE, 'src'));
  return out;
}

/** The brace-balanced body starting at the `{` at `open`. */
function blockAt(text, open) {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === '{') depth++;
    else if (text[i] === '}') { depth--; if (!depth) return text.slice(open + 1, i); }
  }
  return '';
}

/* ====================================================================== 1. the sources === */

test('no stylesheet hides [data-reveal] at rest, and nothing waits for an `is-in` class', () => {
  for (const { name, css } of allCss()) {
    assert.doesNotMatch(css, /\.is-in\b[^{]*\{[^}]*opacity/, `${name} still styles a revealed state by class`);
    assert.doesNotMatch(css, /html:not\(\.no-js\)\s+\[data-reveal\]/, `${name} hides [data-reveal] behind a class again`);
    for (const m of css.matchAll(/([^{}]*\[data-reveal\][^{}]*)\{([^{}]*)\}/g)) {
      assert.doesNotMatch(m[2], /opacity\s*:\s*0\b/, `${name}: "${m[1].trim()}" sets opacity: 0 at rest`);
      assert.doesNotMatch(m[2], /visibility\s*:\s*hidden/, `${name}: "${m[1].trim()}" hides at rest`);
    }
  }
});

test('the one reveal rule is scroll-driven, behind @supports and no-preference, and fills forwards only', () => {
  const sup = SHARED.search(/@supports\s*\(animation-timeline:\s*view\(\)\)\s*\{/);
  assert.ok(sup > -1, 'apple-minimal.css has no @supports (animation-timeline: view()) reveal');
  const body = blockAt(SHARED, SHARED.indexOf('{', sup));
  assert.match(body, /@media\s*\(prefers-reduced-motion:\s*no-preference\)/, 'the reveal is not limited to no-preference');
  const rule = /\[data-reveal\]\s*\{([^{}]*)\}/.exec(body);
  assert.ok(rule, 'the [data-reveal] rule is not inside the @supports block');
  assert.match(rule[1], /animation-timeline:\s*view\(\)/);
  assert.match(rule[1], /animation:\s*reveal-in\s+linear\s+forwards\s*;/,
    'the reveal must fill FORWARDS only: `both` or `backwards` paints opacity 0 on everything below the fold');
  assert.doesNotMatch(rule[1], /\b(?:both|backwards)\b/);
  // Opacity and the `translate` property only: `transform` belongs to hover and press states, and an
  // animation would beat them on the cascade.
  const frames = /@keyframes\s+reveal-in\s*\{([\s\S]*?)\n\}/.exec(SHARED);
  assert.ok(frames, 'no reveal-in keyframes');
  assert.doesNotMatch(frames[1], /\btransform\s*:/, 'the reveal animates `transform`, which hover states need');
  assert.doesNotMatch(frames[1], /\bto\s*\{/, 'a `to` frame would pin the end state; leave it implicit');
});

test('animation-timeline appears only on the shared reveal', () => {
  for (const { name, css } of allCss()) {
    if (name.endsWith('apple-minimal.css')) continue;
    assert.doesNotMatch(css, /animation-timeline\s*:/,
      `${name} declares an animation-timeline: two mechanisms would own one element's opacity`);
  }
});

test('no layout carries an observer, a timer or a class-adding reveal script any more', () => {
  for (const f of readdirSync(LAYOUT_DIR).filter((n) => n.endsWith('.astro'))) {
    const src = readFileSync(join(LAYOUT_DIR, f), 'utf8');
    const scripts = [...src.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]).join('\n');
    assert.doesNotMatch(strip(scripts.replace(/\/\/.*$/gm, '')), /classList\.add\(['"]is-in['"]\)/, `${f} adds an is-in class`);
    assert.doesNotMatch(scripts.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, ''), /IntersectionObserver[\s\S]*data-reveal|data-reveal[\s\S]*IntersectionObserver/,
      `${f} drives [data-reveal] from an observer again`);
  }
});

test('the landing uses the reveal, so none of the above is theatre', () => {
  const marks = PAGE.match(/data-reveal(?![-\w])/g) ?? [];
  assert.ok(marks.length >= 6, `only ${marks.length} elements on the landing are marked for reveal`);
  assert.match(PAGE, /style="--i:|style=\{`--i:/, 'nothing on the landing staggers its siblings with --i');
});

test('nothing on the landing is hidden to the browser until it is near the screen', () => {
  const landing = strip(readFileSync(join(STYLES, 'landing.css'), 'utf8'));
  assert.doesNotMatch(landing, /content-visibility\s*:\s*auto/,
    '`content-visibility: auto` leaves a band blank in a capture that is taller than the window (#models and .closing did)');
});

/* ====================================================================== 2. the built site, in a browser === */

const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.xml': 'application/xml' };

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

assert.ok(existsSync(join(DIST, 'index.html')), 'apps/site/dist is missing: run `npx astro build` in apps/site first');
const { chromium } = createRequire(join(ROOT, 'package.json'))('@playwright/test');
const { server, port } = await serveDist();
const browser = await chromium.launch();
const BASE = `http://127.0.0.1:${port}`;
test.after(async () => { await browser.close(); server.close(); });

const PAGES = ['/', '/pricing', '/changelog', '/status', '/docs/faq'];

/** Opacity of every [data-reveal] block that starts below the first screen, plus how many there are. */
const below = (page) => page.evaluate(() => {
  const els = [...document.querySelectorAll('[data-reveal]')].filter((e) => e.getBoundingClientRect().top > innerHeight + 4);
  return { n: els.length, hidden: els.filter((e) => Number(getComputedStyle(e).opacity) < 0.99).map((e) => `${e.tagName}.${String(e.className).slice(0, 30)}`) };
});

for (const { label, opts } of [
  { label: 'with scripting and motion on', opts: {} },
  { label: 'with reduced motion', opts: { reducedMotion: 'reduce' } },
  { label: 'with JavaScript switched off', opts: { javaScriptEnabled: false } },
]) {
  test(`${label}: everything below the fold is already fully visible, with nothing scrolled`, async () => {
    for (const path of PAGES) {
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, ...opts });
      const page = await ctx.newPage();
      await page.goto(`${BASE}${path}`, { waitUntil: 'load' });
      await page.waitForTimeout(150);
      const r = await below(page);
      if (path === '/') assert.ok(r.n >= 6 || opts.javaScriptEnabled === false, `${path}: only ${r.n} reveal blocks below the fold, the check would be vacuous`);
      assert.deepEqual(r.hidden, [], `${path} (${label}): ${r.hidden.length} blocks below the fold are not fully opaque`);
      await ctx.close();
    }
  });
}

test('a full-page capture taken with nothing scrolled has no blank band', async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/`, { waitUntil: 'load' });
  await page.waitForTimeout(700);
  // The same thing a screenshot tool does: it does not scroll. Every section must hold its content.
  const empty = await page.evaluate(() => [...document.querySelectorAll('main section')]
    .filter((s) => s.getBoundingClientRect().height > 120 && s.innerText.trim().length < 20).map((s) => s.id || s.className));
  assert.deepEqual(empty, [], 'sections with no readable text');
  const faded = await page.evaluate(() => [...document.querySelectorAll('main section *')]
    .filter((e) => e.children.length === 0 && e.textContent.trim() && e.getBoundingClientRect().top > innerHeight && Number(getComputedStyle(e).opacity) < 0.99).length);
  assert.equal(faded, 0, `${faded} text nodes below the fold are not fully opaque`);
  await ctx.close();
});

test('after a jump straight to the bottom every block has finished revealing', async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/`, { waitUntil: 'load' });
  await page.evaluate(() => { document.documentElement.style.scrollBehavior = 'auto'; window.scrollTo(0, document.documentElement.scrollHeight); });
  await page.waitForTimeout(250);
  const partial = await page.evaluate(() => [...document.querySelectorAll('[data-reveal]')].filter((e) => {
    const r = e.getBoundingClientRect();
    return r.bottom > 0 && r.top < innerHeight && Number(getComputedStyle(e).opacity) < 0.99;
  }).length);
  assert.equal(partial, 0, `${partial} blocks on screen are still part-way through a fade after a fast scroll`);
  await ctx.close();
});
