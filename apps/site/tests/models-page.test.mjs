/**
 * /models AND THE LANDING'S "FROM OTHER MAKERS" ROW — WHAT THEY MAY CLAIM, AND HOW THEY LOOK.
 *
 * The page lists models a young creator can pick. RESTATED for owner decision D-VISION-1, which
 * replaced the OpenRouter catalogue with the model registry and removed models on a customer's own
 * key. Four ways it can lie, each guarded below:
 *
 *   1. A MODEL THAT IS NOT ON OFFER. The rows must be exactly the registry's, in its order. This
 *      file reads the registry itself rather than the page's own helper, so a page that stopped
 *      asking — or asked something else — disagrees with it.
 *   2. A PRICE OR A PLAN IT DID NOT ASK FOR. Every other maker's row says the plan that includes it
 *      and its "×N credits" rate, both derived here from the registry's tier and multiplier.
 *   3. A KEY OF YOUR OWN. That path is gone; nothing on /models or the landing may offer it.
 *   4. AN INSTALL PROMISE. The Studio plugin cannot be installed right now; nothing here may say it
 *      can while STUDIO_PLUGIN_STORE_LIVE is false.
 *
 * And the look: 4.5:1 text in both themes and no horizontal overflow at 320/390/768/1440, measured
 * in a real Chromium; the one blue focus ring, measured on a focused control; and the vendor icons
 * byte-identical to their NOTICE rows.
 *
 * READS THE BUILT OUTPUT. Run `npx astro build` in apps/site first.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
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

const { MODEL_REGISTRY, TIER_PLAN_NAME } = await import('../../../packages/shared/src/models.ts');
const OTHERS = MODEL_REGISTRY.filter((m) => m.vendor !== 'Apple');

const idsIn = (s) => [...s.matchAll(/<li class="mrow"[^>]*data-model-id="([^"]+)"/g)].map((m) => m[1]);

test('the build and the worker facts are both here, so nothing below is vacuous', () => {
  assert.ok(html, 'dist/models/index.html is missing — run `npx astro build` in apps/site first');
  assert.ok(landing, 'dist/index.html is missing — run `npx astro build` in apps/site first');
  assert.ok(OTHERS.length >= 1, 'the registry has no model from another maker — the rows below would check nothing');
});

test('THE ROWS ARE THE REGISTRY: every other maker\'s model, in registry order, and nothing else', () => {
  assert.deepEqual(idsIn(section('other-makers')), OTHERS.map((m) => m.id), 'the other-makers list is not the registry\'s');
  const known = new Set(MODEL_REGISTRY.map((m) => m.id));
  const invented = idsIn(html).filter((id) => !known.has(id));
  assert.deepEqual(invented, [], `ids on /models that the registry does not have: ${invented.join(', ')}`);
  for (const m of OTHERS) assert.ok(text(section('other-makers')).includes(m.displayName), `/models does not print ${m.id}'s name "${m.displayName}"`);
});

test('THE BUILT-IN MODELS ARE THE PRODUCT\'S OWN, named from @golem/shared', async () => {
  // RESTATED for D-VISION-1: PRODUCT_MODEL_INFO is derived from the model registry now, so the
  // names are read from the registry itself — Apple's own lanes, the ones built into Apple.
  const { MODEL_REGISTRY } = await import('../../../packages/shared/src/models.ts');
  const names = MODEL_REGISTRY.filter((m) => m.vendor === 'Apple').map((m) => m.displayName);
  assert.ok(names.length >= 2, 'the Apple lanes were not found in the model registry');
  const built = text(section('built-in'));
  for (const n of names) assert.ok(built.includes(n), `the built-in section does not name ${n}`);
  assert.match(built, /Apple Credits/, 'the built-in section does not say what the built-in models spend');
});

test('EVERY OTHER MAKER\'S ROW SAYS WHICH PLAN INCLUDES IT AND ITS CREDIT RATE, as the registry has them', () => {
  const rows = [...section('other-makers').matchAll(/<li class="mrow"[\s\S]*?<\/li>/g)].map((m) => m[0]);
  assert.equal(rows.length, OTHERS.length);
  for (const m of OTHERS) {
    const row = text(rows.find((r) => r.includes(`data-model-id="${m.id}"`)) ?? '');
    if (m.tier === 'free') assert.match(row, /every plan/i, `${m.id} is free-tier and its row does not say every plan includes it`);
    else assert.ok(row.includes(`Included with ${TIER_PLAN_NAME[m.tier]}`), `${m.id}'s row does not name the plan that includes it: ${row}`);
    if (m.creditMultiplier > 1) assert.ok(row.endsWith(`×${m.creditMultiplier} credits`), `${m.id}'s row does not end on its ×${m.creditMultiplier} credits badge: ${row}`);
    else assert.doesNotMatch(row, /×\d+ credits/, `${m.id} costs what Apple MAX costs and its row carries a badge`);
  }
  assert.match(text(section('other-makers')), /Apple Credits/, 'the section does not say these models use Apple Credits');
});

test('NOTHING ON /models OR THE LANDING OFFERS A KEY OF YOUR OWN (D-VISION-1)', () => {
  const words = /own key|your key|bring your own|OpenRouter|\bBYOK\b|free for a limited time/i;
  const main = (h) => text(h.slice(h.indexOf('<main'), h.indexOf('</main>')));
  assert.ok(main(html).length > 200 && main(landing).length > 200, 'no <main> to read');
  assert.doesNotMatch(main(html), words, '/models still offers a key of your own');
  assert.doesNotMatch(main(landing), words, 'the landing still offers a key of your own');
});

test('NOTHING ON /models OR IN THE LANDING ROW SAYS THE PLUGIN CAN BE INSTALLED while the store is not live', () => {
  const live = /export const STUDIO_PLUGIN_STORE_LIVE:\s*boolean\s*=\s*true/.test(read('packages/shared/src/index.ts'));
  if (live) return;
  const main = html.slice(html.indexOf('<main'), html.indexOf('</main>'));
  assert.ok(main.length > 1000, '/models has no <main> to read');
  assert.doesNotMatch(text(main), /install|Creator Store|download the plugin/i, '/models promises an install');
  const strip = /class="makers-strip"[\s\S]*?<\/ul>/.exec(landing)?.[0];
  assert.ok(strip, 'the landing has no "From other makers" row');
  assert.doesNotMatch(text(strip), /install|Creator Store/i, 'the landing row promises an install');
  assert.match(strip, /href="\/models"/, 'the landing row does not lead to /models');
});

test('THE VENDOR ICONS ARE THE UPSTREAM BYTES THE NOTICE NAMES, and none carries active content', () => {
  const dir = join(SITE, 'src', 'assets', 'model-logos');
  const notice = readFileSync(join(dir, 'NOTICE'), 'utf8');
  const rows = [...notice.matchAll(/^(\S+)\s+([0-9a-f]{64})\s+(https:\/\/\S+)$/gm)].map((m) => ({ file: m[1], sha: m[2], url: m[3] }));
  const files = readdirSync(dir).filter((f) => f !== 'NOTICE');
  assert.ok(rows.length >= 5 && files.includes('LICENSE'), 'NOTICE rows or LICENSE missing');
  assert.deepEqual(rows.map((r) => r.file).sort(), files.sort(), 'a vendored file has no NOTICE row, or a row has no file');
  for (const r of rows) {
    const sha = createHash('sha256').update(readFileSync(join(dir, r.file))).digest('hex');
    assert.equal(sha, r.sha, `${r.file} is not the bytes its NOTICE row records`);
    assert.match(r.url, /^https:\/\/(cdn\.jsdelivr\.net\/npm\/|raw\.githubusercontent\.com\/)/, `${r.file} came from an unapproved host`);
    if (r.file.endsWith('.svg')) {
      assert.doesNotMatch(readFileSync(join(dir, r.file), 'utf8'), /<script|\son[a-z]+=|href=|<foreignObject/i, `${r.file} carries active content`);
    }
  }
  assert.match(readFileSync(join(dir, 'LICENSE'), 'utf8'), /MIT License/, 'LICENSE is not the MIT text');
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

test('NO HORIZONTAL OVERFLOW at 320, 390, 768 and 1440, on /models and on the landing row', async () => {
  const bad = [];
  let measured = 0;
  await withPages(async (browser, base) => {
    for (const width of [320, 390, 768, 1440]) {
      const page = await (await browser.newContext({ viewport: { width, height: 900 } })).newPage();
      for (const [route, scope] of [['/models/', 'main'], ['/', '.makers-strip']]) {
        await page.goto(base + route, { waitUntil: 'load' });
        const count = await page.evaluate((s) => document.querySelectorAll(s).length, scope);
        assert.ok(count > 0, `${route} has no ${scope} at ${width}px, so nothing was measured`);
        measured += 1;
        for (const o of await page.evaluate(overflowing, scope)) bad.push(`${width}px ${route}: ${o}`);
      }
    }
  });
  assert.equal(measured, 8);
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
      // RESTATED (D-VISION-1): the page is the registry now, a handful of rows rather than dozens,
      // so the floor is derived from it — at least three runs per model plus the page's head.
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
