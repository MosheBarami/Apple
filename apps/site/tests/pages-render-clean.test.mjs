/**
 * EVERY PAGE OF THE REBUILT SITE LOOKS RIGHT WHERE IT IS LOOKED AT, AND CLAIMS NOTHING IT MAY NOT.
 *
 * This is what tests/models-page.test.mjs held for one page, /models, taken to every page of the build (handoff 2.2, M2 bars:
 * WCAG AA, visible focus, no horizontal scroll on a phone). /models is a redirect now, so that file was deleted (see
 * planning/proof/M2/TEST-LEDGER.md) and each of its properties moved here, derived from dist for ALL routes instead of one:
 *
 *   1. NO HORIZONTAL OVERFLOW at 320, 390, 768 and 1440 px, on every route (the owner's phone-first rule: nothing scrolls sideways at 390).
 *   2. EVERY WORD CLEARS 4.5:1 against what is really behind it, dark and light, on every route (the AA bar, measured on the page
 *      the browser draws, not on a token pair: tests/contrast.test.mjs holds the pairs, this holds the result).
 *   3. THE ONE FOCUS RING: tabbing through every page, each control that takes focus draws 2px solid of the accent (never removed).
 *   4. NO ID REPEATS on a page.
 *   5. THE CLAIMS the old page held for itself: no retired model, tier or credit rate; no key of your own offered; no promise that the
 *      plugin can be installed while the store is not live (a page may SAY it is unavailable); the engine named is the registry's.
 *   6. THE STYLES SPEND TOKENS ONLY: no colour literal in any rebuilt page or component style, and the status colours only on a `.status` dot.
 *
 * It renders over loopback in a real Chromium and fails rather than skips: no build, no browser, no server is a failure to observe.
 * Each scan is run on a fixture it must catch first.
 *
 * Run with:  pnpm --filter @studpilot/site build && node --test tests/pages-render-clean.test.mjs   (from apps/site)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { extname, join, normalize, sep } from 'node:path';
import { DIST, SITE, realPages, stripComments, textOf, walkFiles } from './lib/dist.mjs';

const ROOT = join(SITE, '..', '..');
// /discord forwards the browser to the community invite the moment it loads, so it is not a page to measure.
const PAGES = realPages().filter((p) => !/location\.replace\(/.test(p.html));
const ROUTES = PAGES.map((p) => (p.route === '/404' ? '/404.html' : p.route));
assert.ok(ROUTES.length >= 15, `only ${ROUTES.length} routes were derived from dist`);

const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.json': 'application/json', '.xml': 'application/xml' };

function serveDist() {
  const server = createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    let file = normalize(join(DIST, decodeURIComponent(url.pathname)));
    if (!file.startsWith(DIST + sep) && file !== DIST) return void res.writeHead(403).end();
    if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
    if (!existsSync(file)) return void res.writeHead(404).end('not found');
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
    res.end(readFileSync(file));
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port })));
}

function chromium() {
  try {
    return createRequire(join(ROOT, 'package.json'))('@playwright/test').chromium;
  } catch (err) {
    return assert.fail(`cannot load @playwright/test at the repository root (${err.message}): a failure to observe, not a clean page`);
  }
}

async function withPages(fn) {
  const { server, port } = await serveDist();
  const browser = await chromium().launch();
  try {
    await fn(browser, `http://127.0.0.1:${port}`);
  } finally {
    await browser.close();
    server.close();
  }
}

/** Serialised into the page: what pokes past the viewport. */
function overflowing() {
  const out = [];
  const vw = document.documentElement.clientWidth;
  if (document.documentElement.scrollWidth > vw + 1) out.push(`document scrollWidth ${document.documentElement.scrollWidth} > ${vw}`);
  for (const el of document.querySelectorAll('main *, header *, footer *')) {
    if (el.closest('.visually-hidden, .table-scroll')) continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    if (r.right > vw + 1 || r.left < -1) out.push(`${el.tagName.toLowerCase()}.${el.className} spans ${Math.round(r.left)}..${Math.round(r.right)} of ${vw}`);
  }
  return out.slice(0, 8);
}

/** Serialised into the page: every text node's colour against the ground actually behind it. */
function lowContrast() {
  // A computed colour can come back as rgb(), rgba(), `color(srgb ...)` (a color-mix) or `oklab(...)` (a colour mid-transition). Reading it
  // through a one-pixel canvas lets the browser convert any of them to sRGB bytes, so the scan never parses a colour syntax itself.
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 1;
  const g = canvas.getContext('2d', { willReadFrequently: true });
  const rgb = (s) => {
    g.clearRect(0, 0, 1, 1);
    g.fillStyle = '#000';
    g.fillStyle = s;
    g.fillRect(0, 0, 1, 1);
    const [r, gr, b, a] = g.getImageData(0, 0, 1, 1).data;
    return [r, gr, b, a / 255];
  };
  const lum = ([r, g, b]) => {
    const f = (c) => ((c /= 255) <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const ground = (el) => {
    const layers = [];
    for (let n = el; n; n = n.parentElement) {
      const c = rgb(getComputedStyle(n).backgroundColor);
      const a = c.length === 4 ? c[3] : 1;
      if (a > 0) layers.push([c[0], c[1], c[2], a]);
      if (a >= 1) break;
    }
    let out = [0, 0, 0];
    for (const [r, g, b, a] of layers.reverse()) out = [r * a + out[0] * (1 - a), g * a + out[1] * (1 - a), b * a + out[2] * (1 - a)];
    return out;
  };
  const bad = [];
  let seen = 0;
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let t;
  while ((t = walker.nextNode())) {
    const el = t.parentElement;
    if (!t.textContent.trim() || !el || el.closest('.visually-hidden, script, style, noscript')) continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    // A disabled control is exempt from contrast by WCAG 1.4.3 and is dimmed on purpose (the paid plans' "Checkout not open").
    if (el.closest(':disabled')) continue;
    seen += 1;
    const fg = rgb(getComputedStyle(el).color);
    const a = lum(fg.slice(0, 3));
    const b = lum(ground(el));
    const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    if (ratio < 4.5) bad.push(`"${t.textContent.trim().slice(0, 30)}" ${ratio.toFixed(2)}:1 (text rgb(${fg.slice(0, 3).map(Math.round)}) on rgb(${ground(el).map(Math.round)}))`);
  }
  return { seen, bad };
}

test('the scans can see: a fixture 400px wide in a 320px page, and grey text on a near-grey ground, are both caught', async () => {
  await withPages(async (browser) => {
    const page = await (await browser.newContext({ viewport: { width: 320, height: 600 } })).newPage();
    await page.setContent('<body style="margin:0"><main><div id="wide" style="width:400px;height:20px;background:#444"></div><p id="dim" style="color:#777;background:#808080;margin:0">dim words</p></main></body>');
    assert.ok((await page.evaluate(overflowing)).length > 0, 'the overflow scan is blind');
    const { seen, bad } = await page.evaluate(lowContrast);
    assert.ok(seen >= 1 && bad.length >= 1, `the contrast scan is blind (${seen} runs, ${bad.length} bad)`);
  });
});

test('NO HORIZONTAL OVERFLOW at 320, 390, 768 and 1440, on every route', async () => {
  const bad = [];
  let measured = 0;
  await withPages(async (browser, base) => {
    for (const width of [320, 390, 768, 1440]) {
      const page = await (await browser.newContext({ viewport: { width, height: 900 } })).newPage();
      for (const route of ROUTES) {
        await page.goto(base + route, { waitUntil: 'load' });
        measured += 1;
        for (const o of await page.evaluate(overflowing)) bad.push(`${width}px ${route}: ${o}`);
      }
    }
  });
  assert.equal(measured, 4 * ROUTES.length);
  assert.deepEqual(bad, [], bad.join('\n'));
});

test('EVERY WORD CLEARS 4.5:1 against what is behind it, dark and light, on every route', async () => {
  const bad = [];
  await withPages(async (browser, base) => {
    for (const theme of ['dark', 'light']) {
      const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
      await ctx.addInitScript((t) => localStorage.setItem('apple-theme', t), theme);
      const page = await ctx.newPage();
      for (const route of ROUTES) {
        await page.goto(base + route, { waitUntil: 'load' });
        assert.equal(await page.evaluate(() => document.documentElement.getAttribute('data-theme')), theme, `${route} did not take the ${theme} theme`);
        const { seen, bad: low } = await page.evaluate(lowContrast);
        assert.ok(seen >= 8, `${theme} ${route}: only ${seen} text runs measured`);
        for (const l of low) bad.push(`${theme} ${route}: ${l}`);
      }
      await ctx.close();
    }
  });
  assert.deepEqual(bad, [], `text below 4.5:1:\n  ${bad.join('\n  ')}`);
});

test('THE ONE FOCUS RING: tabbing through every route, each control that takes focus draws 2px solid of the accent', async () => {
  const bad = [];
  let focused = 0;
  await withPages(async (browser, base) => {
    const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' })).newPage();
    for (const route of ROUTES) {
      await page.goto(base + route, { waitUntil: 'load' });
      // Measure the SETTLED ring, not a frame of a transition (a ring that is still easing in reads as 3px of currentcolor, the initial value).
      await page.addStyleTag({ content: '*,*::before,*::after{transition:none!important;animation:none!important}' });
      const stops = await page.evaluate(() => document.querySelectorAll('a[href], button:not([disabled]), input:not([type=hidden]), select, textarea, summary, [tabindex]:not([tabindex="-1"])').length);
      assert.ok(stops >= 8, `${route}: only ${stops} focusable controls`);
      for (let i = 0; i < Math.min(stops, 45); i += 1) {
        await page.keyboard.press('Tab');
        const m = await page.evaluate(() => {
          const el = document.activeElement;
          if (!el || el === document.body) return null;
          const cs = getComputedStyle(el);
          const probe = document.createElement('span');
          probe.style.color = 'var(--accent)';
          document.body.appendChild(probe);
          const accent = getComputedStyle(probe).color;
          probe.remove();
          const r = el.getBoundingClientRect();
          return { who: `${el.tagName.toLowerCase()}${el.className ? '.' + String(el.className).split(' ')[0] : ''}${el.getAttribute('href') ? '[' + el.getAttribute('href') + ']' : ''}`, style: cs.outlineStyle, width: cs.outlineWidth, color: cs.outlineColor, accent, shown: r.width > 0 && r.height > 0 };
        });
        if (!m || !m.shown) continue;
        focused += 1;
        if (m.style !== 'solid' || m.width !== '2px' || m.color !== m.accent) bad.push(`${route} ${m.who}: outline ${m.style} ${m.width} ${m.color} (the accent is ${m.accent})`);
      }
    }
  });
  assert.ok(focused >= 15 * 8, `only ${focused} focus stops were measured`);
  assert.deepEqual([...new Set(bad)], [], `a control takes focus without the one ring:\n  ${[...new Set(bad)].join('\n  ')}`);
});

test('no id repeats on any page', () => {
  for (const { route, html } of PAGES) {
    const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
    const dup = ids.filter((id, i) => ids.indexOf(id) !== i);
    assert.deepEqual(dup, [], `${route}: duplicate ids: ${dup.join(', ')}`);
  }
});

// ----------------------------------------------------------------------------------------------------- the claims
const { MODEL_REGISTRY, LEGACY_MODEL_IDS } = await import('../../../packages/shared/src/models.ts');
/** What a retired model was called on this site. "Max" alone is a plan's name, so only "StudPilot MAX". */
const RETIRED = /StudPilot MAX|Gemini|GPT-5\.6|\bLuna\b|other makers|×\s?\d+(\.\d+)? credits/i;
const OWN_KEY = /own key|your key|bring your own|OpenRouter|\bBYOK\b|free for a limited time/i;
/** A PROMISE of an install: the plugin can be had, or is free on the store. (A page may say it is NOT available.) */
const MARKETING_EXEMPT = /^\/(?:docs|privacy|terms|status|404)(?:\/|$|\.)/;
const INSTALL_PROMISE = /\b(?:install|get|download) (?:it|the plugin|StudPilot Studio)\b[^.]{0,40}\b(?:from|on) the Creator Store\b|\bdownload the plugin\b|\bfree on the (?:Roblox )?Creator Store\b/i;

test('the claim scanners can see what they look for', () => {
  assert.match('Gemini 3 is faster', RETIRED);
  assert.match('You can bring your own key.', OWN_KEY);
  assert.match('Get StudPilot Studio from the Creator Store, free.', INSTALL_PROMISE);
  assert.match('The plugin is free on the Creator Store.', INSTALL_PROMISE);
  assert.doesNotMatch('The plugin is not on the Creator Store yet.', INSTALL_PROMISE);
});

test('no page names a retired model, tier or credit rate, offers a key of your own, or gates the engine on a plan; the engine named is the registry\'s', () => {
  assert.deepEqual(MODEL_REGISTRY.map((m) => m.id), ['apple'], 'the registry is not the one engine');
  assert.equal(LEGACY_MODEL_IDS.length, 4);
  // The marketing pages: what /models and the old front page were, now the front page, how it works, the catalog, pricing and the blog.
  // The docs, /privacy, /terms and /status keep their own wording ("under your own key" on /privacy and /docs/privacy-and-data is about the
  // keys of a Roblox account, not a model key) and are not this rule's subject.
  const marketing = PAGES.filter((p) => !MARKETING_EXEMPT.test(p.route));
  assert.ok(marketing.length >= 6, `only ${marketing.length} marketing pages were read`);
  for (const { route, html } of marketing) {
    const main = textOf(html.slice(html.indexOf('<main'), html.indexOf('</main>')));
    assert.match(main, /\S/, `${route} has no <main> to read`);
    assert.doesNotMatch(main, RETIRED, `${route} names a retired model or a rate`);
    assert.doesNotMatch(main, OWN_KEY, `${route} offers a key of your own`);
    assert.doesNotMatch(main, /Included with (Builder|Studio)/, `${route} gates the engine on a plan`);
  }
  const pricing = textOf(PAGES.find((p) => p.route === '/pricing/').html);
  for (const m of MODEL_REGISTRY) assert.ok(pricing.includes(m.displayName), `/pricing does not name ${m.displayName}, the registry's engine`);
  assert.match(pricing, /every plan/i, '/pricing does not say every plan uses the one engine');
});

test('no page promises that the plugin can be installed while the store is not live', () => {
  const live = /export const STUDIO_PLUGIN_STORE_LIVE:\s*boolean\s*=\s*true/.test(readFileSync(join(ROOT, 'packages/shared/src/index.ts'), 'utf8'));
  if (live) return;
  for (const { route, html } of PAGES.filter((p) => !MARKETING_EXEMPT.test(p.route))) {
    assert.doesNotMatch(textOf(html), INSTALL_PROMISE, `${route} promises an install while the store is not live`);
  }
});

// -------------------------------------------------------------------------------------------- the styles are tokens
test('the rebuilt styles spend tokens only: no colour literal, and the status colours only on a .status dot', () => {
  const files = [
    'styles/site.css',
    ...walkFiles(join(SITE, 'src'), (p) => /\/(?:pages\/(?:index|how-it-works|catalog|pricing|404|blog\/[^/]+)|components\/(?:Nav|Footer|ScreenSlot|PieceIcon))\.astro$/.test(p)).map((f) => f),
  ];
  assert.ok(files.length >= 8, `only ${files.length} rebuilt style sources were found`);
  for (const f of files) {
    const text = readFileSync(join(SITE, 'src', f.startsWith('styles/') ? f : f), 'utf8');
    const css = stripComments(f.endsWith('.css') ? text : (text.match(/<style[^>]*>([\s\S]*?)<\/style>/i)?.[1] ?? ''));
    assert.doesNotMatch(css, /#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i, `${f} spends a colour literal`);
    assert.doesNotMatch(css, /var\(--autonomous/, `${f} spends a retired mode colour`);
    for (const m of css.matchAll(/([^{}]+)\{([^{}]*var\(--(?:good|warn|bad|info)\)[^{}]*)\}/g)) {
      assert.match(m[1], /\.status\b/, `${f}: a status colour is spent outside .status: ${m[1].trim().slice(0, 60)}`);
    }
  }
});
