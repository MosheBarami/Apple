/**
 * /models AND THE LANDING'S "ON YOUR OWN KEY" ROW — WHAT THEY MAY CLAIM, AND HOW THEY LOOK.
 *
 * The page lists models a young creator can pick. Three ways it can lie, each guarded below:
 *
 *   1. A MODEL THAT IS NOT ON OFFER. The rows must be exactly what the worker's catalogue would
 *      give: its curated paid ids, and the free, tool-capable rows of the snapshot it embeds. This
 *      file does NOT reuse the page's own path to get there (lib/model-catalogue.ts calls the
 *      worker's function); it re-derives the expected lists from the worker's SOURCE TEXT, so a
 *      page that stopped asking — or asked something else — disagrees with it.
 *   2. A FREE LIST PRESENTED AS TODAY'S. Free promotions end (owner decision D-FREE-1). Every free
 *      row must say Free, and the page must say, beside it, that free is time-limited, that the
 *      app reads the list live, and the date this list was read — the snapshot's own date.
 *   3. AN INSTALL PROMISE. The Studio plugin cannot be installed right now; nothing here may say it
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

// ------------------------------------------------------------------ the worker's facts, re-derived

const SNAPSHOT_SRC = read('apps/worker/src/openrouter-snapshot.ts');
const CATALOGUE_SRC = read('apps/worker/src/model-catalogue.ts');
const SNAPSHOT = [...SNAPSHOT_SRC.matchAll(/\{ id: "([^"]+)", name: "([^"]+)", free: (true|false), tools: (true|false) \}/g)].map(
  (m) => ({ id: m[1], name: m[2], free: m[3] === 'true', tools: m[4] === 'true' }),
);
const READ_AT = /OPENROUTER_SNAPSHOT_READ_AT = "([^"]+)"/.exec(SNAPSHOT_SRC)?.[1];
const CURATED = [...(/CURATED_PAID_IDS[^=]*=\s*\[([\s\S]*?)\];/.exec(CATALOGUE_SRC)?.[1] ?? '').matchAll(/'([^']+)'/g)].map((m) => m[1]);
const expectedPaid = CURATED.filter((id) => SNAPSHOT.find((r) => r.id === id)?.tools);
const expectedFree = SNAPSHOT.filter((r) => r.free && r.tools && !r.id.startsWith('openrouter/') && !expectedPaid.includes(r.id)).map((r) => r.id);

const idsIn = (s) => [...s.matchAll(/<li class="mrow"[^>]*data-model-id="([^"]+)"/g)].map((m) => m[1]);

test('the build and the worker facts are both here, so nothing below is vacuous', () => {
  assert.ok(html, 'dist/models/index.html is missing — run `npx astro build` in apps/site first');
  assert.ok(landing, 'dist/index.html is missing — run `npx astro build` in apps/site first');
  assert.ok(SNAPSHOT.length >= 10, `only ${SNAPSHOT.length} snapshot rows parsed — the row pattern has drifted`);
  assert.ok(READ_AT, 'OPENROUTER_SNAPSHOT_READ_AT not found in the worker snapshot');
  assert.ok(expectedPaid.length >= 5, `only ${expectedPaid.length} curated paid ids derived`);
  assert.ok(expectedFree.length >= 1, 'no free rows derived from the snapshot');
});

test('THE ROWS ARE THE CATALOGUE: every paid and free model the worker offers, in its order, and nothing else', () => {
  assert.deepEqual(idsIn(section('your-key')), expectedPaid, 'the own-key list is not the worker\'s curated paid list');
  assert.deepEqual(idsIn(section('free')), expectedFree, 'the free list is not the snapshot\'s free, tool-capable rows');
  const known = new Set(SNAPSHOT.map((r) => r.id));
  const invented = idsIn(html).filter((id) => !known.has(id));
  assert.deepEqual(invented, [], `ids on /models that OpenRouter's snapshot does not have: ${invented.join(', ')}`);
  for (const id of [...expectedPaid, ...expectedFree]) {
    const row = SNAPSHOT.find((r) => r.id === id);
    const label = row.name.slice(row.name.indexOf(': ') + 2).replace(/\s*\(free\)\s*$/i, '');
    assert.ok(text(html).includes(label), `/models does not print ${id}'s own name "${label}"`);
  }
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

test('EVERY FREE ROW SAYS FREE, NO PAID ROW DOES, and the page dates the list and says it is read live', () => {
  const rows = (s) => [...s.matchAll(/<li class="mrow"[\s\S]*?<\/li>/g)].map((m) => m[0]);
  const freeRows = rows(section('free'));
  assert.equal(freeRows.length, expectedFree.length);
  for (const r of freeRows) assert.match(text(r), /\bFree$/, `a free row does not end on its Free badge: ${text(r)}`);
  for (const r of rows(section('your-key'))) assert.doesNotMatch(text(r), /\bFree\b/i, `a paid row says Free: ${text(r)}`);

  const notice = /data-free-notice[^>]*>([\s\S]*?)<\/p>/.exec(section('free'))?.[1] ?? '';
  assert.match(text(notice), /limited time/i, 'the free notice does not say free is time-limited');
  assert.match(text(notice), /reads the current list live/i, 'the free notice does not say the app reads the list live');
  const d = new Date(READ_AT);
  const day = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
  assert.ok(notice.includes(`datetime="${READ_AT}"`), `the notice's <time> is not the snapshot's read time ${READ_AT}`);
  assert.ok(text(notice).includes(day), `the notice does not print the date the list was read (${day})`);
});

test('BRING-YOUR-OWN-KEY IS TWO PLAIN SENTENCES', () => {
  const p = /data-byok-explainer[^>]*>([\s\S]*?)<\/p>/.exec(html)?.[1];
  assert.ok(p, 'the key explainer paragraph is missing');
  const sentences = text(p).split(/(?<=[.!?])\s+/).filter(Boolean);
  assert.equal(sentences.length, 2, `the explainer is ${sentences.length} sentences: ${text(p)}`);
  assert.doesNotMatch(text(p), /\b(API|BYOK|encrypt\w*|token|endpoint|OAuth|provider)\b/i, 'the explainer uses a technical word');
});

test('NOTHING ON /models OR IN THE LANDING ROW SAYS THE PLUGIN CAN BE INSTALLED while the store is not live', () => {
  const live = /export const STUDIO_PLUGIN_STORE_LIVE:\s*boolean\s*=\s*true/.test(read('packages/shared/src/index.ts'));
  if (live) return;
  const main = html.slice(html.indexOf('<main'), html.indexOf('</main>'));
  assert.ok(main.length > 1000, '/models has no <main> to read');
  assert.doesNotMatch(text(main), /install|Creator Store|download the plugin/i, '/models promises an install');
  const strip = /class="byok-strip"[\s\S]*?<\/ul>/.exec(landing)?.[0];
  assert.ok(strip, 'the landing has no "On your own key" row');
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
  assert.doesNotMatch(css, /\boutline\s*:|box-shadow\s*:|text-shadow\s*:|filter\s*:/, '/models draws its own ring, shadow or glow');
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
      for (const [route, scope] of [['/models/', 'main'], ['/', '.byok-strip']]) {
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
      assert.ok(seen >= 40, `${theme}: only ${seen} text runs measured`);
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
