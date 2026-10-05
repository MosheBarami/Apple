import { expect, test } from '@playwright/test';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
// The asset id and the install href have exactly one definition in this repository. Asserting the
// rendered href against the constant, rather than against a pasted URL, is what stops the site
// and the shared package drifting apart.
import { MODEL_REGISTRY, STUDIO_PLUGIN_STORE_LIVE, SUPPORT_EMAIL } from '../../packages/shared/src/index';

/**
 * The landing page's invariants, RESTATED 2026-10-05 for the M2 rebuild (handoff 2.2).
 *
 * WHAT CHANGED. The front page is new (a left-aligned headline beside a fixed-size slot for a real screenshot, four kinds of piece, a
 * rail of four steps, the quality bar, a price strip). The old page's composer, its three demo stages, its model cards, its read-order
 * section and the "Product" anchor are deleted (planning/proof/M2/DECISIONS.md section 12), so the tests that pinned them are deleted with
 * them (each in planning/proof/M2/TEST-LEDGER.md) and every property that is still a requirement is kept, re-aimed at the page that exists:
 *   - the proposition is one h1 (the plan's promise, as the bar being built to), and the offer is in the first frame at every size
 *   - no horizontal scroll at any supported size; every header control reachable on a phone, the header one row, the menu opens
 *   - every nav destination resolves, and no link anywhere on the site is dead (routes derived from the build)
 *   - no 3D, no webfont, no canvas; no model maker the product does not offer; Credits capitalised
 *   - the primary actions reach registration and sign-in reaches sign-in; the plugin line is honest while the store is shut
 *   - keyboard reachable with a visible focus ring; text enlargement scrolls rather than clipping; every text element clears WCAG AA
 *     against the pixels behind it, in both themes, on the four marketing pages
 */

const ROOT = join(__dirname, '..', '..');
const AA_ROUTES = ['/', '/how-it-works', '/catalog', '/pricing'];

/** Every real route of the built site, as the preview serves it (redirect stubs and the Discord hop left out). */
function routesFromBuild(): string[] {
  const dist = join(ROOT, 'apps', 'site', 'dist');
  if (!existsSync(dist)) throw new Error('apps/site/dist is missing: build the site first; this spec derives its routes from it');
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (name === 'index.html') {
        const html = readFileSync(p, 'utf8');
        if (/<meta http-equiv="refresh"[^>]*url=/i.test(html) || /location\.replace\(/.test(html)) continue;
        const rel = relative(dist, join(p, '..')).split(sep).join('/');
        out.push(rel === '' ? '/' : `/${rel}`);
      }
    }
  };
  walk(dist);
  if (out.length < 15) throw new Error(`only ${out.length} routes were derived from dist`);
  return out.sort();
}

test('renders the proposition: one h1, the plan\'s promise, under a visible Beta label', async ({ page }) => {
  await page.goto('/');
  const h1 = page.getByRole('heading', { level: 1 });
  await expect(h1).toBeVisible();
  await expect(page.locator('h1')).toHaveCount(1);
  expect(((await h1.textContent()) ?? '').trim()).toBe("Ask for any piece. It looks pro, it works, and we never claim what we didn't prove.");
  await expect(page.locator('.hero .badge')).toContainText('Beta');
  // The line under it says where the product works, in the product's own words, and frames the promise as the bar.
  await expect(page.locator('.hero .lede')).toContainText('Roblox Studio');
  await expect(page.locator('.hero .lede')).toContainText('the bar we are building to');
});

test('opens on the whole proposition', async ({ page }) => {
  // The page scrolls; what may NOT happen is a reader having to scroll to find out what this is or how to start. Measured at the
  // shortest supported height as well as the tallest.
  const sizes = [
    { width: 1440, height: 900 },
    { width: 1366, height: 768 },
    { width: 390, height: 844 },
  ];
  const mustBeVisible = ['h1', '.hero .badge', '.hero .lede', '.hero__cta a.btn-primary'];
  const bad: string[] = [];

  for (const size of sizes) {
    await page.setViewportSize(size);
    await page.goto('/');
    for (const sel of mustBeVisible) {
      const below = await page.locator(sel).first().evaluate((el, h) => Math.round(el.getBoundingClientRect().bottom - h), size.height);
      if (below > 0) bad.push(`${size.width}x${size.height}: ${sel} ends ${below}px below the fold`);
    }
  }

  expect(bad, `the offer is not in the first frame:\n${bad.join('\n')}`).toEqual([]);
});

test('never scrolls horizontally at any supported size', async ({ page }) => {
  const sizes = [
    { width: 1920, height: 1080 },
    { width: 1728, height: 1117 },
    { width: 1440, height: 900 },
    { width: 1366, height: 768 },
    { width: 1024, height: 768 },
    { width: 768, height: 1024 },
    { width: 390, height: 844 },
    { width: 320, height: 568 },
  ];
  const bad: string[] = [];

  for (const size of sizes) {
    await page.setViewportSize(size);
    await page.goto('/');
    await page.waitForTimeout(300);
    const overflowX = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    if (overflowX > 1) bad.push(`${size.width}x${size.height}: ${overflowX}px of horizontal scroll`);
  }

  expect(bad, `horizontal scroll:\n${bad.join('\n')}`).toEqual([]);
});

test('every header control is reachable on a phone, and the header is one row', async ({ page }) => {
  // The property, not the mechanism: every painted control in the header has its whole box inside the viewport. A row that clips
  // INTERNALLY never scrolls the document, which is how "Sign in" once sat 36px past the edge of a 375px phone while the page-level
  // guard stayed green. And the header is ONE row.
  const sizes = [
    { width: 375, height: 812 },
    { width: 390, height: 844 },
    { width: 320, height: 568 },
  ];
  const bad: string[] = [];

  for (const size of sizes) {
    await page.setViewportSize(size);
    await page.goto('/');
    const result = await page.evaluate(() => {
      const vw = document.documentElement.clientWidth;
      const header = document.querySelector('header#site-nav');
      const clipped = [...document.querySelectorAll('header#site-nav a, header#site-nav button')]
        .map((el) => {
          const r = el.getBoundingClientRect();
          return { label: (el.textContent || el.getAttribute('aria-label') || '?').trim().slice(0, 20), w: r.width, past: Math.round(r.right - vw), left: Math.round(r.left) };
        })
        .filter((c) => c.w > 0 && (c.past > 1 || c.left < -1));
      return { clipped, height: header ? Math.round(header.getBoundingClientRect().height) : -1 };
    });
    for (const c of result.clipped) {
      bad.push(`${size.width}x${size.height}: "${c.label}" is ${c.past > 1 ? `${c.past}px past the right edge` : `${-c.left}px past the left edge`}`);
    }
    if (result.height < 0) bad.push(`${size.width}x${size.height}: the shared header is missing`);
    else if (result.height > 72) bad.push(`${size.width}x${size.height}: the header is ${result.height}px tall — one row is the design`);
  }

  expect(bad, `header problems on a phone:\n${bad.join('\n')}`).toEqual([]);

  // The menu opens, and what it reveals is reachable too.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.locator('#menu-toggle')).toHaveAttribute('aria-expanded', 'false');
  await page.locator('#menu-toggle').click();
  await expect(page.locator('#menu-toggle')).toHaveAttribute('aria-expanded', 'true');
  for (const name of ['How it works', 'Catalog', 'Pricing', 'Docs', 'Blog', 'Discord', 'Sign in']) {
    await expect(page.locator('#primary-nav').getByRole('link', { name, exact: true }), `${name} is not reachable in the open menu`).toBeVisible();
  }
  await expect(page.locator('#primary-nav').getByRole('link', { name: 'Start free (beta)' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#menu-toggle')).toHaveAttribute('aria-expanded', 'false');
});

test('holds the composition: the sections, the shared header and footer, a visible mark, a reserved slot', async ({ page }) => {
  await page.goto('/');
  for (const id of ['pieces', 'how', 'bar', 'pricing']) await expect(page.locator(`#${id}`), `#${id} is missing`).toHaveCount(1);
  await expect(page.locator('#pieces .piece')).toHaveCount(4);
  await expect(page.locator('#how .rail > li')).toHaveCount(4);

  // ONE header, the shared one, and one footer carrying the contact address (owner decision D-13: the operator is StudPilot, the contact
  // is support@studpilot.app, read from the shared config).
  await expect(page.locator('header#site-nav')).toHaveCount(1);
  await expect(page.locator('footer[data-site-footer]')).toHaveCount(1);
  await expect(page.locator('footer[data-site-footer]')).toContainText(SUPPORT_EMAIL);
  await expect(page.locator('footer[data-site-footer]')).not.toContainText('Apple Labs');

  // THE MARK IS VISIBLE. A logo's class once collided with a demo's padding and drew nothing at all while every other check passed.
  const mark = await page.locator('header#site-nav .brand svg').evaluate((svg) => {
    const r = svg.getBoundingClientRect();
    const s = getComputedStyle(svg);
    const path = svg.querySelector('path') as SVGGraphicsElement | null;
    const drawn = path ? path.getBoundingClientRect() : { width: 0, height: 0 };
    return { w: r.width, h: r.height, padding: parseFloat(s.paddingLeft) + parseFloat(s.paddingRight), drawnW: drawn.width, drawnH: drawn.height };
  });
  expect(mark.w, 'the header mark has no width').toBeGreaterThanOrEqual(16);
  expect(mark.padding, 'the header mark is padded into nothing').toBe(0);
  expect(mark.drawnW * mark.drawnH, 'the header mark draws no pixels').toBeGreaterThan(100);

  // THE SCREENSHOT SLOT KEEPS ITS BOX WHETHER OR NOT A PICTURE IS IN IT: a fixed size, so nothing shifts when one arrives.
  const slot = page.locator('.hero [data-screen-slot]');
  await expect(slot).toHaveCount(1);
  const box = await slot.evaluate((el) => { const r = el.getBoundingClientRect(); return { w: r.width, h: r.height, ratio: Number(el.getAttribute('data-width')) / Number(el.getAttribute('data-height')) }; });
  expect(box.w, 'the slot has no width').toBeGreaterThan(200);
  expect(Math.abs(box.w / box.h - box.ratio), 'the slot does not hold its aspect ratio').toBeLessThan(0.02);

  // The type: the shared system stack, never bold, sentence case.
  const display = await page.locator('h1').evaluate((el) => {
    const s = getComputedStyle(el);
    return { family: s.fontFamily.toLowerCase(), weight: Number(s.fontWeight), transform: s.textTransform, size: parseFloat(s.fontSize) };
  });
  expect(display.family).toMatch(/-apple-system|system-ui|blinkmacsystemfont/);
  expect(display.family.split(',').pop()!.trim(), 'the generic at the end of the stack must be sans-serif').toBe('sans-serif');
  expect(display.weight, 'the headline is bold; nothing on this site is').toBeLessThan(600);
  expect(display.transform).toBe('none');
  // CALM, not loud: scripts/check-copy.mjs caps display type at 56px.
  expect(display.size, `the headline is ${display.size}px — the hero is oversized again`).toBeLessThanOrEqual(56);
});

test('ships no webfont to fail, no 3D, and no canvas', async ({ page }) => {
  // The design uses the system stack on purpose (the app's own), so there is no webfont whose failure would make every other check in
  // this file pass over a page that looks wrong.
  const fonts: string[] = [];
  const scripts: string[] = [];
  page.on('request', (r) => {
    if (r.resourceType() === 'font') fonts.push(r.url());
    if (r.resourceType() === 'script') scripts.push(r.url());
  });
  await page.goto('/', { waitUntil: 'networkidle' });
  expect(fonts, `unexpected webfont requests: ${fonts.join(', ')}`).toEqual([]);
  expect(scripts.filter((s) => /three|webgl|babylon/i.test(s)), 'a 3D library is loading on the landing').toEqual([]);
  expect(await page.locator('canvas').count(), 'the rebuilt landing draws no canvas').toBe(0);
});

test('every nav destination resolves', async ({ page }) => {
  await page.goto('/');
  const links = await page.$$eval('header#site-nav a', (as) =>
    as.map((a) => ({ label: (a.textContent ?? '').trim(), href: a.getAttribute('href') ?? '' })),
  );
  expect(links.length).toBeGreaterThanOrEqual(8);
  const bad: string[] = [];

  for (const { label, href } of links) {
    if (!href) {
      bad.push(`${label} has no href`);
      continue;
    }
    if (href.startsWith('/app')) continue; // the React workspace, served by the worker, not this preview
    const res = await page.request.get(href);
    if (res.status() !== 200) bad.push(`${label} -> ${href} (HTTP ${res.status()})`);
  }

  expect(bad, `dead nav destinations:\n${bad.join('\n')}`).toEqual([]);
});

test('names no model maker the product does not offer, and never what StudPilot itself runs on', async ({ page }) => {
  // RESTATED 2026-09-24 (D-VISION-1): the names the registry offers may appear, read from MODEL_REGISTRY, not typed here. Two things
  // stay off the page: a maker or model the registry does not offer, and the foundation under StudPilot's own model, which the
  // registry records in providerModelId ('@cf/<org>/<family>-…') and the page never repeats.
  await page.goto('/');
  const text = ((await page.locator('body').textContent()) ?? '').toLowerCase();
  const offered = MODEL_REGISTRY.map((m) => `${m.vendor} ${m.displayName}`).join(' ').toLowerCase();
  const underStudPilot = MODEL_REGISTRY.filter((m) => m.vendor === 'StudPilot').flatMap((m) => {
    const [org, model] = m.providerModelId.split('/').slice(-2);
    return [org.replace(/-org$/, ''), model.split('-')[0]];
  });
  expect(underStudPilot.length, 'the registry has no StudPilot model, so this check would pass over nothing').toBeGreaterThan(0);
  const notOffered = ['glm', 'gpt', 'openai', 'gemini', 'deepseek', 'anthropic', 'claude'].filter((b) => !offered.includes(b));
  for (const brand of new Set([...notOffered, ...underStudPilot])) {
    expect(text, `landing must not mention "${brand}"`).not.toContain(brand);
  }
});

test('counts in Credits, capitalised', async ({ page }) => {
  // The allowance unit is "Credits". A lowercase "credits" on the page that introduces the unit is how a reader ends up thinking there
  // are two different things.
  await page.goto('/');
  const text = (await page.locator('main').textContent()) ?? '';
  expect(text).toContain('Credits');
  expect(text.match(/\bcredits?\b/g) ?? [], 'a lowercase "credit(s)" on the landing').toEqual([]);
});

test('the primary actions reach registration, and sign-in reaches sign-in', async ({ page }) => {
  await page.goto('/');
  // CSS locators, not roles: on a phone these sit inside the collapsed menu or the bar, and the hrefs are what is under test.
  await expect(page.locator('header#site-nav a.nav__cta')).toHaveText('Start free (beta)');
  await expect(page.locator('header#site-nav a.nav__cta')).toHaveAttribute('href', '/app/signup');
  await expect(page.locator('.hero__cta a.btn-primary')).toHaveAttribute('href', '/app/signup');
  await expect(page.locator('.cta a.btn-primary')).toHaveAttribute('href', '/app/signup');
  // The mirrored mistake: a returning user must not be sent to registration.
  await expect(page.locator('header#site-nav .nav__signin a')).toHaveText('Sign in');
  await expect(page.locator('header#site-nav .nav__signin a')).toHaveAttribute('href', '/app/login');
});

test('the plugin line is honest: the plugin page, never a store page that cannot be installed from', async ({ page }) => {
  await page.goto('/');
  const link = page.locator('.cta a[href="/docs/plugin"]');
  await expect(link).toBeVisible();
  // Same-origin: a new tab here would be a lie about where the reader is going.
  await expect(link).not.toHaveAttribute('target', '_blank');
  if (!STUDIO_PLUGIN_STORE_LIVE) {
    const hrefs = await page.locator('a[href]').evaluateAll((as) => as.map((a) => a.getAttribute('href') ?? ''));
    expect(hrefs.filter((h) => h.includes('create.roblox.com/store/asset')), 'the landing links straight to an undistributable store page').toEqual([]);
    // Read by sentence: "Available now" is true of the Free PLAN (the price strip says it), so the phrases are banned only in a sentence that is
    // about the plugin or the store (RESTATED 2026-10-05; the old page had no plan strip, so the phrase was banned page-wide).
    const text = ((await page.locator('body').textContent()) ?? '').toLowerCase().replace(/\s+/g, ' ');
    const aboutPlugin = text.split(/(?<=[.!?])\s+/).filter((t) => /plugin|creator store|studio plugin/.test(t));
    expect(aboutPlugin.length, 'no sentence about the plugin was found, so this would pass over nothing').toBeGreaterThan(0);
    for (const claim of ['available now', 'now on the creator store', 'available on the creator store', 'get it now', 'get studpilot studio']) {
      for (const sentence of aboutPlugin) expect(sentence, `landing must not claim "${claim}" about the plugin`).not.toContain(claim);
    }
  }
});

test('How it works lists the eight steps, each labelled with what is true today', async ({ page }) => {
  await page.goto('/');
  await page.locator('#how').getByRole('link', { name: /All eight steps/ }).click();
  await expect(page).toHaveURL(/\/how-it-works\/?$/);
  await expect(page.locator('.step')).toHaveCount(8);
  await expect(page.locator('.step__status')).toHaveCount(8);
  for (const label of await page.locator('.step__status').allTextContents()) expect(['Works today', 'Partly works today', 'Being built']).toContain(label.trim());
  await expect(page.locator('main')).toContainText('Beta');
});

test('is keyboard reachable and keeps a visible focus ring', async ({ page }) => {
  await page.goto('/');
  await page.keyboard.press('Tab');
  await expect(page.locator('.skip-link')).toBeFocused();

  // A link's own ring, on a link that is painted at every size, and a button's.
  for (const sel of ['.cta a.btn-primary', '.hero__cta a.btn-primary', 'header#site-nav .brand']) {
    await page.locator(sel).first().focus();
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Tab');
    const ring = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement;
      const s = getComputedStyle(el);
      const probe = document.createElement('i');
      probe.style.color = 'var(--accent)';
      document.body.append(probe);
      const want = getComputedStyle(probe).color;
      probe.remove();
      return { style: s.outlineStyle, width: parseFloat(s.outlineWidth), color: s.outlineColor, want };
    });
    expect(ring.style, `${sel} draws no ring when focused`).toBe('solid');
    expect(ring.width).toBeGreaterThanOrEqual(2);
    expect(ring.color, `${sel}: the ring is not the accent`).toBe(ring.want);
  }
});

test('reduced motion stops the landing and hides nothing', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(null)))));
  const running = await page.evaluate(() =>
    document.getAnimations().filter((a) => a.playState === 'running' && a.effect?.getTiming().iterations === Infinity).length,
  );
  expect(running, 'an endless animation still runs under reduced motion').toBe(0);
  const hidden = await page.evaluate(() => [...document.querySelectorAll('main *')].filter((el) => (el.textContent ?? '').trim() && Number(getComputedStyle(el).opacity) === 0 && !el.closest('[hidden], .visually-hidden')).length);
  expect(hidden, 'content left invisible under reduced motion').toBe(0);
});

test('text enlargement scrolls rather than clipping', async ({ page }) => {
  await page.goto('/');
  await page.addStyleTag({ content: 'html { font-size: 32px !important; }' });
  const clipped = await page.evaluate(() => getComputedStyle(document.querySelector('main') as HTMLElement).overflow === 'hidden');
  expect(clipped, 'main must not clip its own content').toBe(false);
  await expect(page.locator('.hero__cta a.btn-primary')).toBeVisible();
});

for (const route of AA_ROUTES) for (const theme of ['dark', 'light'] as const) {
  test(`every text element of ${route} clears WCAG AA against what is actually behind it (${theme})`, async ({ page }) => {
    // Not a token audit: the only honest backdrop is the rendered pixel. apps/site/tests/
    // contrast.test.mjs checks the tokens; this checks what a browser paints, in both themes.
    await page.addInitScript((t) => { try { localStorage.setItem('apple-theme', t); } catch { /* private mode */ } }, theme);
    await page.goto(route);
    // Nothing reveals on scroll any more; let the first frame paint.
    await page.waitForTimeout(300);
    // ONE FRAME, HELD (RESTATED 2026-09-24 to the owner's picks, commit 3940085). The idea row now
    // slides 36px a second and the threads drift, so boxes measured here and pixels shot a second
    // later were two different pictures: a chip's stale box caught the next chip's hairline border
    // (measured: the row had moved 28px), a failure no reader can see. Ending every frame chain and
    // pausing every animation keeps the page on the frame it was just showing, and the letters and
    // what is behind them are then read off the same picture.
    await page.evaluate(async () => {
      window.requestAnimationFrame = () => 0;
      for (const a of document.getAnimations()) a.pause();
      await new Promise((r) => setTimeout(r, 100));
    });
    const boxes = await page.evaluate(() => {
      type Rect = { x: number; y: number; w: number; h: number };
      const out: { label: string; color: string; size: number; bold: boolean; rects: Rect[]; holes: Rect[] }[] = [];
      for (const el of document.querySelectorAll<HTMLElement>('body *')) {
        const nodes = [...el.childNodes].filter((n) => n.nodeType === 3 && (n.textContent ?? '').trim());
        if (!nodes.length) continue;
        const text = nodes.map((n) => n.textContent ?? '').join('').trim();
        const s = getComputedStyle(el);
        if (s.visibility === 'hidden' || s.display === 'none' || s.opacity === '0') continue;
        if (el.closest('[aria-hidden="true"], [hidden]')) continue; // decorative ghosts and hidden stages
        // Text inside a CLOSED disclosure (the pricing limits FAQ) is not painted, whatever box the engine reports for it (added 2026-10-05, when this
        // audit was extended from the front page to /pricing): its summary is measured, its answer is measured once it is opened.
        if (el.closest('details:not([open])') && !el.closest('summary')) continue;
        // THE GLYPHS' OWN LINE BOXES, NOT THE ELEMENT'S BOX. An element box reaches into a rounded
        // button's transparent corners and onto a panel's hairline border — pixels no glyph sits on —
        // and the worse-of-two-extremes verdict below then reports a white-on-black button as 1:1.
        // A Range over the text nodes gives the boxes the letters actually occupy.
        // A line scrolled out of an `overflow` box is not painted where its box says, so each line
        // box is cut to the visible inside of every clipping ancestor first (a wide activity log on
        // a phone otherwise gets "measured" against its panel's border, past the clip).
        let clip = { l: -Infinity, t: -Infinity, r: Infinity, b: Infinity };
        for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
          if (getComputedStyle(a).overflowX === 'visible' && getComputedStyle(a).overflowY === 'visible') continue;
          const ar = a.getBoundingClientRect();
          const l = ar.left + a.clientLeft;
          const t = ar.top + a.clientTop;
          clip = { l: Math.max(clip.l, l), t: Math.max(clip.t, t), r: Math.min(clip.r, l + a.clientWidth), b: Math.min(clip.b, t + a.clientHeight) };
        }
        const rects: Rect[] = [];
        for (const n of nodes) {
          const range = document.createRange();
          range.selectNodeContents(n);
          for (const raw of range.getClientRects()) {
            const l = Math.max(raw.left, clip.l);
            const t = Math.max(raw.top, clip.t);
            const r = Math.min(raw.right, clip.r);
            const b = Math.min(raw.bottom, clip.b);
            if (r - l < 2 || b - t < 2) continue;
            // Parked off-canvas (the skip link waits above the viewport until focused).
            if (b + scrollY < 0 || r < 0 || l > innerWidth) continue;
            rects.push({ x: l + scrollX, y: t + scrollY, w: r - l, h: b - t });
          }
        }
        if (!rects.length) continue;
        out.push({
          label: `${el.className || el.tagName} "${text.slice(0, 28)}"`,
          color: s.color,
          size: parseFloat(s.fontSize),
          bold: parseInt(s.fontWeight, 10) >= 600,
          rects,
          holes: [...el.children].map((ch) => {
            const cr = ch.getBoundingClientRect();
            return { x: cr.x + scrollX, y: cr.y + scrollY, w: cr.width, h: cr.height };
          }),
        });
      }
      return out;
    });

    expect(boxes.length, 'found no text to audit').toBeGreaterThan(30);

    // Make the glyphs transparent and shoot again: backgrounds and borders still paint, so each
    // label is measured against what is really under it.
    await page.addStyleTag({ content: 'body, body * { color: transparent !important; text-shadow: none !important; caret-color: transparent !important; }' });
    await page.waitForTimeout(400);
    const backdrop = (await page.screenshot({ fullPage: true })).toString('base64');

    const failures = await page.evaluate(
      async ({ boxes, backdrop }) => {
        const img = new Image();
        img.src = 'data:image/png;base64,' + backdrop;
        await img.decode();
        const c = document.createElement('canvas');
        c.width = img.width;
        c.height = img.height;
        const g = c.getContext('2d')!;
        g.drawImage(img, 0, 0);
        // The scale is READ, not inferred (a 0.05% error is 2.6 device pixels 5,700px down a phone).
        const dpr = devicePixelRatio;
        if (Math.abs(img.width - innerWidth * dpr) > 2) {
          return [`backdrop is ${img.width}px wide; ${innerWidth} CSS px at ${dpr}x should be ~${innerWidth * dpr}`];
        }
        const lin = (v: number) => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
        const lum = (r: number, gg: number, b: number) => 0.2126 * lin(r / 255) + 0.7152 * lin(gg / 255) + 0.0722 * lin(b / 255);

        const bad: string[] = [];
        for (const box of boxes) {
          const PAD = 2 * dpr;
          const holes = box.holes.map((hl) => ({ x0: hl.x * dpr - PAD, y0: hl.y * dpr - PAD, x1: (hl.x + hl.w) * dpr + PAD, y1: (hl.y + hl.h) * dpr + PAD }));
          // BOTH EXTREMES: the verdict is taken on the worse of the two ratios, so neither a light
          // nor a dark backdrop pixel can be the one that lets an element through.
          let hi = 0;
          let lo = 1;
          let sampled = 0;
          for (const { x, y, w, h } of box.rects) {
            const x0 = Math.max(0, Math.round(x * dpr));
            const y0 = Math.max(0, Math.round(y * dpr));
            const bw = Math.max(1, Math.min(Math.round(w * dpr), c.width - x0));
            const bh = Math.max(1, Math.min(Math.round(h * dpr), c.height - y0));
            const px = g.getImageData(x0, y0, bw, bh).data;
            for (let row = 0; row < bh; row++) {
              for (let col = 0; col < bw; col++) {
                const ax = x0 + col;
                const ay = y0 + row;
                if (holes.some((hl) => ax >= hl.x0 && ax < hl.x1 && ay >= hl.y0 && ay < hl.y1)) continue;
                const i = (row * bw + col) * 4;
                const l = lum(px[i], px[i + 1], px[i + 2]);
                if (l > hi) hi = l;
                if (l < lo) lo = l;
                sampled++;
              }
            }
          }
          if (!sampled) continue;
          const m = box.color.match(/[\d.]+/g)!.map(Number);
          if (m.length > 3 && m[3] === 0) {
            bad.push(`${box.label} — colour is fully transparent and nothing paints it`);
            continue;
          }
          const fg = lum(m[0], m[1], m[2]);
          const against = (bg: number) => (Math.max(fg, bg) + 0.05) / (Math.min(fg, bg) + 0.05);
          const ratio = Math.min(against(hi), against(lo));
          const large = box.size >= 24 || (box.bold && box.size >= 18.66);
          const need = large ? 3 : 4.5;
          if (ratio < need) bad.push(`${box.label} — ${ratio.toFixed(2)}:1 at ${box.size}px, needs ${need}:1`);
        }
        return bad;
      },
      { boxes, backdrop },
    );

    expect(failures, `contrast failures (${theme}):\n${failures.join('\n')}`).toEqual([]);
  });
}

test('supporting routes resolve', async ({ page }) => {
  for (const route of ['/how-it-works', '/catalog', '/pricing', '/blog', '/blog/what-works-today', '/docs', '/docs/plugin', '/status', '/privacy', '/terms']) {
    const res = await page.request.get(route);
    expect(res.status(), `${route} should resolve`).toBe(200);
  }
});

// THE PRICING TABLES ON A PHONE (2026-09-22). Both are 620px wide, and inside a 356px scroll box
// they cut words mid-word at the edge and hid the Studio and Enterprise columns with no cue that
// they existed. The property: at phone widths every cell of every table on /pricing lies inside
// its container and nothing scrolls sideways.
test('on a phone the pricing tables show every value without a sideways scroll', async ({ page }) => {
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/pricing');
    const tables = await page.locator('.table-scroll').evaluateAll((els) =>
      els.map((el) => {
        const box = el.getBoundingClientRect();
        const cells = [...el.querySelectorAll('td, th')];
        const outside = cells.filter((c) => {
          const r = c.getBoundingClientRect();
          return r.width > 0 && (r.right > box.right + 1 || r.left < box.left - 1);
        }).length;
        return { scroll: el.scrollWidth - el.clientWidth, cells: cells.length, outside };
      }));
    expect(tables.length, '/pricing renders no table, so this check would pass over nothing').toBeGreaterThan(0);
    for (const [i, t] of tables.entries()) {
      expect(t.cells, `table ${i} has no cells`).toBeGreaterThan(0);
      expect(t.scroll, `table ${i} scrolls sideways at ${width}px`).toBeLessThanOrEqual(0);
      expect(t.outside, `table ${i}: ${t.outside} cell(s) sit outside the table at ${width}px`).toBe(0);
    }
  }
});

// A FAILURE TO OBSERVE IS NOT AN OBSERVATION (2026-09-22). On an origin with no health endpoint,
// /status read "Degraded — The API responded with an unexpected status (404)": a measurement of the
// API that was never taken. Each answer is staged, so this says what the page concludes from it.
test('/status reports what it measured, and "unknown" when nothing answered for the API', async ({ page }) => {
  const cases: Array<[string, { status: number; body: string; contentType: string }, RegExp, string]> = [
    ['no endpoint', { status: 404, body: 'Not found', contentType: 'text/plain' }, /unknown/i, 'down'],
    ['healthy', { status: 200, body: '{"ok":true,"version":"test"}', contentType: 'application/json' }, /operational/i, 'ok'],
    ['erroring', { status: 503, body: '{"ok":false}', contentType: 'application/json' }, /degraded/i, 'degraded'],
  ];
  for (const [name, reply, headline, state] of cases) {
    await page.route('**/api/health', (route) => route.fulfill(reply));
    await page.goto('/status');
    await expect(page.locator('#status-card'), `${name}: wrong state`).toHaveAttribute('data-state', state);
    await expect(page.locator('#status-headline'), `${name}: wrong headline`).toHaveText(headline);
    await page.unroute('**/api/health');
  }
});

test('no link anywhere on the site points at a section or route that does not exist', async ({ page }) => {
  // Every internal link resolves to something real, INCLUDING anchors: a bare `#x` and a `/page#x` both have to name an element on the page
  // they claim. The routes are derived from the build, so a page added tomorrow is held tomorrow. The removed routes (/models, /proof,
  // /showcase, /changelog) are redirects the build emits; a link to one still resolves, and the nav test names where they go.
  const routes = routesFromBuild();
  const bad: string[] = [];

  for (const route of routes) {
    await page.goto(route);
    const hrefs = await page.$$eval('a[href]', (as) => as.map((a) => a.getAttribute('href') ?? '').filter((h) => h.startsWith('/') || h.startsWith('#')));
    for (const href of new Set(hrefs)) {
      const [path, hash] = href.split('#');
      if (path.startsWith('/app')) continue; // the React workspace, served by the worker
      if (path === '') {
        if (hash && (await page.locator(`#${hash}`).count()) !== 1) bad.push(`${route} -> ${href} (no #${hash} on ${route})`);
        continue;
      }
      const res = await page.request.get(path);
      if (res.status() !== 200) {
        bad.push(`${route} -> ${href} (HTTP ${res.status()})`);
        continue;
      }
      if (hash) {
        const body = await res.text();
        if (!new RegExp(`id=["']${hash}["']`).test(body)) bad.push(`${route} -> ${href} (no #${hash} on ${path})`);
      }
    }
  }

  expect(bad, `dead links:\n${bad.join('\n')}`).toEqual([]);
});
