/**
 * /models — THE ONE ENGINE (V3 gate G01) — WHAT IT MAY CLAIM, AND HOW IT LOOKS.
 *
 * The page used to list the model registry, other makers' models included. StudPilot is now the only
 * engine, on every plan, so the page describes one engine. Four ways it can lie, each guarded below:
 *
 *   1. AN ENGINE THAT IS NOT ON OFFER. What it names is exactly the registry's (StudPilot), read here from
 *      the registry itself, and no retired model (MAX, Gemini, GPT-5.6, Luna) appears on it or on the
 *      landing.
 *   2. A PRICE OR A PLAN GATE. No row is "Included with" one plan and no "×N credits" rate is shown:
 *      every plan uses StudPilot, and the page says so.
 *   3. A KEY OF YOUR OWN. That path is gone; nothing on /models or the landing may offer it.
 *   4. AN INSTALL PROMISE. The Studio plugin cannot be installed right now; nothing here may say it
 *      can while STUDIO_PLUGIN_STORE_LIVE is false.
 *
 * And the look: 4.5:1 text in both themes and no horizontal overflow at 320/390/768/1440, measured
 * in a real Chromium; the one blue focus ring, measured on a focused control.
 *
 * READS THE BUILT OUTPUT. Run `npx astro build` in apps/site first.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { dirname, extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const SITE = join(dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = join(SITE, '..', '..');
const DIST = join(SITE, 'dist');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

const MODELS_HTML = join(DIST, 'models', 'index.html');
const html = existsSync(MODELS_HTML) ? readFileSync(MODELS_HTML, 'utf8') : '';
const landing = existsSync(join(DIST, 'index.html')) ? readFileSync(join(DIST, 'index.html'), 'utf8') : '';
const text = (s) => s.replace(/<svg[\s\S]*?<\/svg>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();

/** One section of the built page, by its id. */
function section(id) {
  const open = html.indexOf(`id="${id}"`);
  assert.ok(open > 0, `/models has no section #${id}`);
  const start = html.lastIndexOf('<section', open);
  return html.slice(start, html.indexOf('</section>', open));
}

// ------------------------------------------------------------------ the registry's facts

const { MODEL_REGISTRY, LEGACY_MODEL_IDS } = await import('../../../packages/shared/src/models.ts');
const main = (h) => text(h.slice(h.indexOf('<main'), h.indexOf('</main>')));
/** What a retired model was called on this site. "Max" alone is a plan's name, so only "StudPilot MAX". */
const RETIRED = /StudPilot MAX|Gemini|GPT-5\.6|\bLuna\b|other makers|×\s?\d+(\.\d+)? credits/i;

test('the build and the registry are both here, so nothing below is vacuous', () => {
  assert.ok(html, 'dist/models/index.html is missing — run `npx astro build` in apps/site first');
  assert.ok(landing, 'dist/index.html is missing — run `npx astro build` in apps/site first');
  assert.deepEqual(MODEL_REGISTRY.map((m) => m.id), ['apple'], 'the registry is not the one engine');
  assert.equal(LEGACY_MODEL_IDS.length, 4);
});

test('THE ENGINE IS THE REGISTRY\'S: StudPilot, named from @studpilot/shared, on every plan', () => {
  const built = text(section('built-in'));
  for (const m of MODEL_REGISTRY) {
    assert.ok(built.includes(m.displayName), `the page does not name ${m.displayName}`);
    assert.ok(built.includes(m.blurb), `the page does not carry ${m.id}'s registry line`);
  }
  assert.match(built, /every plan/i, 'the page does not say every plan uses StudPilot');
  assert.match(built, /StudPilot Credits/, 'the page does not say what a request spends');
  assert.equal(html.includes('id="other-makers"'), false, '/models still has an other-makers section');
});

test('NO RETIRED MODEL, TIER OR CREDIT RATE on /models or the landing (V3 G01)', () => {
  assert.ok(main(html).length > 100 && main(landing).length > 200, 'no <main> to read');
  assert.doesNotMatch(main(html), RETIRED, '/models names a retired model or a rate');
  assert.doesNotMatch(main(landing), RETIRED, 'the landing names a retired model or a rate');
  assert.doesNotMatch(main(html), /Included with (Builder|Studio)/, '/models gates the engine on a plan');
  assert.equal(landing.includes('class="makers-strip"'), false, 'the landing still has the other-makers row');
});

test('NOTHING ON /models OR THE LANDING OFFERS A KEY OF YOUR OWN (D-VISION-1)', () => {
  const words = /own key|your key|bring your own|OpenRouter|\bBYOK\b|free for a limited time/i;
  assert.ok(main(html).length > 100 && main(landing).length > 200, 'no <main> to read');
  assert.doesNotMatch(main(html), words, '/models still offers a key of your own');
  assert.doesNotMatch(main(landing), words, 'the landing still offers a key of your own');
});

test('NOTHING ON /models SAYS THE PLUGIN CAN BE INSTALLED while the store is not live', () => {
  const live = /export const STUDIO_PLUGIN_STORE_LIVE:\s*boolean\s*=\s*true/.test(read('packages/shared/src/index.ts'));
  if (live) return;
  const body = html.slice(html.indexOf('<main'), html.indexOf('</main>'));
  assert.ok(body.length > 500, '/models has no <main> to read');
  assert.doesNotMatch(text(body), /install|Creator Store|download the plugin/i, '/models promises an install');
});

test('no id repeats on /models (an inlined icon\'s gradient ids included)', () => {
  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
  const dup = ids.filter((id, i) => ids.indexOf(id) !== i);
  assert.deepEqual(dup, [], `duplicate ids: ${dup.join(', ')}`);
});

test('THE PAGE SPENDS NO COLOUR OF ITS OWN: tokens only, no status green, no violet, no focus override', () => {
  const src = readFileSync(join(SITE, 'src', 'pages', 'models.astro'), 'utf8');
  const css = (/<style>([\s\S]*?)<\/style>/.exec(src)?.[1] ?? '').replace(/\/\*[\s\S]*?\*\//g, ' ');
  assert.ok(css.length > 500, 'models.astro has no style block to read');
  assert.doesNotMatch(css, /#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i, 'a colour literal in /models');
  assert.doesNotMatch(css, /var\(--(good|autonomous[a-z-]*)\)/, '/models spends the status green or the Autonomous violet');
  // backdrop-filter blurs the shared glass surface; the page must still avoid its own visual
  // effects. A word-boundary on `filter` also matched `backdrop-filter` and rejected that token.
  assert.doesNotMatch(css, /\boutline\s*:|box-shadow\s*:|text-shadow\s*:|(?<![\w-])filter\s*:/, '/models draws its own ring, shadow or glow');
});

// ------------------------------------------------------------------ rendered

const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp' };

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
    return assert.fail(`cannot load @playwright/test at the repository root (${err.message}) — a failure to observe, not a clean page`);
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

/** Serialised into the page: the right edge of anything in `scope` that pokes past the viewport. */
function overflowing(scope) {
  const out = [];
  const vw = document.documentElement.clientWidth;
  if (document.documentElement.scrollWidth > vw + 1) out.push(`document scrollWidth ${document.documentElement.scrollWidth} > ${vw}`);
  for (const root of document.querySelectorAll(scope)) {
    for (const el of [root, ...root.querySelectorAll('*')]) {
      if (el.closest('.visually-hidden')) continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      if (r.right > vw + 1 || r.left < -1) out.push(`${el.tagName.toLowerCase()}.${el.className} spans ${Math.round(r.left)}..${Math.round(r.right)} of ${vw}`);
    }
  }
  return out.slice(0, 8);
}

test('NO HORIZONTAL OVERFLOW at 320, 390, 768 and 1440, on /models', async () => {
  const bad = [];
  let measured = 0;
  await withPages(async (browser, base) => {
    for (const width of [320, 390, 768, 1440]) {
      const page = await (await browser.newContext({ viewport: { width, height: 900 } })).newPage();
      for (const [route, scope] of [['/models/', 'main']]) {
        await page.goto(base + route, { waitUntil: 'load' });
        const count = await page.evaluate((s) => document.querySelectorAll(s).length, scope);
        assert.ok(count > 0, `${route} has no ${scope} at ${width}px, so nothing was measured`);
        measured += 1;
        for (const o of await page.evaluate(overflowing, scope)) bad.push(`${width}px ${route}: ${o}`);
      }
    }
  });
  assert.equal(measured, 4);
  assert.deepEqual(bad, [], bad.join('\n'));
});

/** Serialised into the page: every text node's colour against the ground actually behind it. */
function lowContrast() {
  const rgb = (s) => (s.match(/[\d.]+/g) || []).map(Number);
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
  const walker = document.createTreeWalker(document.querySelector('main'), NodeFilter.SHOW_TEXT);
  let t;
  while ((t = walker.nextNode())) {
    const el = t.parentElement;
    if (!t.textContent.trim() || !el || el.closest('.visually-hidden')) continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    seen += 1;
    const fg = rgb(getComputedStyle(el).color);
    const a = lum(fg.slice(0, 3));
    const b = lum(ground(el));
    const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    if (ratio < 4.5) bad.push(`"${t.textContent.trim().slice(0, 30)}" ${ratio.toFixed(2)}:1`);
  }
  return { seen, bad };
}

test('EVERY WORD ON /models CLEARS 4.5:1 against what is behind it, dark and light', async () => {
  await withPages(async (browser, base) => {
    for (const theme of ['dark', 'light']) {
      const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      await ctx.addInitScript((t) => localStorage.setItem('apple-theme', t), theme);
      const page = await ctx.newPage();
      await page.goto(base + '/models/', { waitUntil: 'load' });
      // The reveal motion fades sections in; measure the settled page, not a frame of the fade.
      await page.evaluate(() => document.querySelectorAll('[data-reveal]').forEach((n) => n.classList.add('is-in')));
      await page.waitForTimeout(700);
      assert.equal(await page.evaluate(() => document.documentElement.getAttribute('data-theme')), theme);
      const { seen, bad } = await page.evaluate(lowContrast);
      // RESTATED (V3 G01): one engine now, so the floor is derived from the registry — at least
      // three runs per engine plus the page's head.
      assert.ok(seen >= 3 * MODEL_REGISTRY.length + 5, `${theme}: only ${seen} text runs measured`);
      assert.deepEqual(bad, [], `${theme}: text below 4.5:1 on /models:\n  ${bad.join('\n  ')}`);
      await ctx.close();
    }
  });
});

test('THE ONE FOCUS RING: a focused control on /models draws 2px of the blue accent', async () => {
  await withPages(async (browser, base) => {
    const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
    await page.goto(base + '/models/', { waitUntil: 'load' });
    const targets = ['main a[href="/pricing"]', 'main a[href="/app/signup"]'];
    for (const sel of targets) {
      await page.focus(sel);
      // :focus-visible after a programmatic focus needs a keyboard origin; one Tab back and forth.
      await page.keyboard.press('Shift+Tab');
      await page.keyboard.press('Tab');
      const m = await page.evaluate((s) => {
        const el = document.querySelector(s);
        const cs = getComputedStyle(el);
        const probe = document.createElement('span');
        probe.style.color = 'var(--accent)';
        document.body.appendChild(probe);
        const accent = getComputedStyle(probe).color;
        probe.remove();
        return { focused: document.activeElement === el, style: cs.outlineStyle, width: cs.outlineWidth, color: cs.outlineColor, accent };
      }, sel);
      assert.ok(m.focused, `${sel} did not take focus`);
      assert.equal(m.style, 'solid', `${sel} has no outline when focused`);
      assert.equal(m.width, '2px', `${sel} ring is ${m.width}`);
      assert.equal(m.color, m.accent, `${sel} ring is ${m.color}, the accent is ${m.accent}`);
    }
  });
});
