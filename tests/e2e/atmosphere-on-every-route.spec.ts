import { expect, test } from '@playwright/test';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

/**
 * THE SITE IS CALM ON EVERY ROUTE — IN A REAL BROWSER.
 *
 * RESTATED 2026-10-05 (M2 site rebuild, handoff 2.2). This file proved the calm of the old site through the owner's picks: a <canvas>
 * only inside a pick's own host (read from components/picks/ by ./owner-picks.ts), loops that stop off screen, and a stagger of reveals
 * that had to finish before a card could be measured. The picks and the reveals are deleted (planning/proof/M2/DECISIONS.md section 12),
 * and ./owner-picks.ts went with them. The rebuilt pages draw no canvas at all and move nothing on their own, so the properties are
 * held in their plainest form, in a real browser, on every route the build emits:
 *   - no <canvas> and no ambient layer anywhere;
 *   - under prefers-reduced-motion nothing moves: two screenshots a second apart are the same picture, no animation frame is requested
 *     at idle and no animation loops;
 *   - off screen nothing draws or loops (the status orb is the only loop left, and it idles off screen);
 *   - one header design and the one accent of the design tokens, never green;
 *   - reduced motion stops everything and leaves no content invisible;
 *   - /pricing's one table holds the three plans as columns on a desk and stacks them on a phone, and its Free panel is beside its figures.
 * The routes are DERIVED from the build, never listed: a page added tomorrow is held tomorrow.
 *
 * HISTORY KEPT. The method is the 2026-09-22 file's: assert on PIXELS, because "the element exists" and "the script runs" say nothing
 * about what a reader sees (a canvas once ran, drew and was painted over with every check green). The pixel-diff helper is unchanged.
 */

/** Every real route of the built site (redirect stubs and the Discord hop left out), as the preview serves it. */
function routesFromBuild(): string[] {
  const dist = join(__dirname, '..', '..', 'apps', 'site', 'dist');
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
const ROUTES = routesFromBuild();

/** Settle the page: fonts done, one full frame painted. (Nothing reveals on scroll any more, so there is no stagger to wait out.) */
async function settle(page: import('@playwright/test').Page) {
  await page.evaluate(() => document.fonts?.ready);
  await page.waitForTimeout(500);
  await page.evaluate(
    () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(null)))),
  );
}

/**
 * How many PIXELS differ between two screenshots — NOT how many bytes. PNG encoding is not byte
 * deterministic, so a byte comparison reports two identical pictures as different (the old file
 * found that out through a false pass). Decoded and compared pixel by pixel instead.
 */
async function pixelsDiffering(
  page: import('@playwright/test').Page,
  a: Buffer,
  b: Buffer,
): Promise<number> {
  return page.evaluate(
    async ([b64a, b64b]) => {
      const load = (b64: string) =>
        new Promise<HTMLImageElement>((res, rej) => {
          const img = new Image();
          img.onload = () => res(img);
          img.onerror = () => rej(new Error('screenshot did not decode'));
          img.src = `data:image/png;base64,${b64}`;
        });
      const [ia, ib] = await Promise.all([load(b64a), load(b64b)]);
      if (ia.width !== ib.width || ia.height !== ib.height) return Number.MAX_SAFE_INTEGER;
      const data = (img: HTMLImageElement) => {
        const c = document.createElement('canvas');
        c.width = img.width;
        c.height = img.height;
        const x = c.getContext('2d')!;
        x.drawImage(img, 0, 0);
        return x.getImageData(0, 0, img.width, img.height).data;
      };
      const A = data(ia);
      const B = data(ib);
      let n = 0;
      for (let i = 0; i < A.length; i += 4) {
        if (A[i] !== B[i] || A[i + 1] !== B[i + 1] || A[i + 2] !== B[i + 2]) n++;
      }
      return n;
    },
    [a.toString('base64'), b.toString('base64')] as const,
  );
}

/**
 * Installed before any page script: every 2D-canvas draw and every style or class write is stamped,
 * per element, with the 100ms slot it happened in — so a test can ask what was drawn, and where.
 */
function recordDrawing() {
  const drawn = new Map<Element, Set<number>>();
  (window as unknown as { __drawn: typeof drawn }).__drawn = drawn;
  const stamp = (el: Element | null) => {
    if (!el) return;
    if (!drawn.has(el)) drawn.set(el, new Set());
    drawn.get(el)!.add(Math.floor(performance.now() / 100));
  };
  const ctx = CanvasRenderingContext2D.prototype as unknown as Record<string, (...args: unknown[]) => unknown>;
  for (const name of ['clearRect', 'fillRect', 'strokeRect', 'fill', 'stroke', 'fillText', 'drawImage', 'putImageData']) {
    const real = ctx[name];
    ctx[name] = function (this: CanvasRenderingContext2D, ...args: unknown[]) { stamp(this.canvas); return real.apply(this, args); };
  }
  new MutationObserver((records) => { for (const r of records) stamp(r.target as Element); })
    .observe(document, { subtree: true, attributes: true, attributeFilter: ['style', 'class'] });
}

test.describe('the calm site', () => {
  for (const route of ROUTES) {
    test(`${route} draws no canvas and no ambient scene`, async ({ page }) => {
      await page.goto(route);
      expect(await page.locator('canvas').count(), `${route} renders a <canvas>`).toBe(0);
      const ambient = await page.evaluate(() =>
        [...document.querySelectorAll('[class]')]
          .map((el) => String((el as HTMLElement).className))
          .filter((c) => /\b(?:horizon|atmosphere|flow-field|particles?|starfield|light-column|strata|ridge|sound-dock|cursor-ring)\b/i.test(c)),
      );
      expect(ambient, `${route} carries an ambient/decorative layer`).toEqual([]);
    });

    test(`${route} is still under reduced motion: two screenshots a second apart are the same picture`, async ({ page }) => {
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.goto(route);
      await settle(page);
      // Masked: /status's live readouts (a countdown is information, not decor). Nothing else is.
      const mask = [page.locator('#status-checked'), page.locator('#status-next')];
      const a = await page.screenshot({ mask });
      await page.waitForTimeout(1200);
      const b = await page.screenshot({ mask });
      const n = await pixelsDiffering(page, a, b);
      expect(n, `${route}: ${n} pixels changed in 1.2s under reduced motion with nobody touching the page`).toBe(0);
    });

    test(`${route} requests no animation frame at idle under reduced motion, and loops nothing`, async ({ page }) => {
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.addInitScript(() => {
        const w = window as unknown as { __raf: number };
        w.__raf = 0;
        const raf = window.requestAnimationFrame.bind(window);
        window.requestAnimationFrame = (cb) => { w.__raf += 1; return raf(cb); };
      });
      await page.goto(route);
      await settle(page);
      const before = await page.evaluate(() => (window as unknown as { __raf: number }).__raf);
      await page.waitForTimeout(1500);
      const after = await page.evaluate(() => (window as unknown as { __raf: number }).__raf);
      expect(after - before, `${route} requested ${after - before} animation frames while idle under reduced motion`).toBe(0);

      const looping = await page.evaluate(() =>
        document.getAnimations()
          .filter((a) => a.playState === 'running' && a.effect?.getTiming().iterations === Infinity)
          .map((a) => ((a.effect as KeyframeEffect | null)?.target as Element | null)?.getAttribute('class') ?? '?'));
      expect(looping, `${route} loops an animation forever under reduced motion`).toEqual([]);
    });

    test(`${route} draws nothing off screen: a loop idles while its element is out of view`, async ({ page }) => {
      await page.addInitScript(recordDrawing);
      await page.goto(route);
      await settle(page);
      const moving: string[] = [];
      for (const end of ['top', 'bottom'] as const) {
        await page.evaluate((e) => window.scrollTo({ top: e === 'top' ? 0 : document.documentElement.scrollHeight, behavior: 'instant' }), end);
        await page.waitForTimeout(600); // the visibility observers report, and every "off" has run
        const from = await page.evaluate(() => Math.floor(performance.now() / 100));
        await page.waitForTimeout(1500);
        moving.push(...await page.evaluate(([from, end]) => {
          // Out of view by more than the widest margin a pick's observer uses (120px, motion.ts).
          const out = (el: Element) => { const r = el.getBoundingClientRect(); return r.bottom < -120 || r.top > innerHeight + 120; };
          const name = (el: Element) => `${end}: <${el.tagName.toLowerCase()} class="${el.getAttribute('class') ?? ''}">`;
          const found: string[] = [];
          // A loop writes every frame; five of the fifteen slots rules out a one-off (a reveal, a
          // loop's last still frame) and still catches anything that runs.
          for (const [el, slots] of (window as unknown as { __drawn: Map<Element, Set<number>> }).__drawn) {
            const n = [...slots].filter((s) => s >= from).length;
            if (n >= 5 && el.isConnected && out(el)) found.push(`${name(el)} was drawn in ${n} of 15 slots`);
          }
          for (const a of document.getAnimations()) {
            const target = (a.effect as KeyframeEffect | null)?.target;
            if (a.playState === 'running' && a.effect?.getTiming().iterations === Infinity && target && out(target)) {
              found.push(`${name(target)} runs ${(a as CSSAnimation).animationName ?? 'an animation'} forever`);
            }
          }
          return found;
        }, [from, end] as const));
      }
      // The docs' Terminal demo (a caret that blinked forever, named here as a debt) was deleted with build-from-source by the docs rewrite (M2 site
      // fix cycle 1), so nothing is excused any more: every mover off screen fails.
      expect(moving, `${route} moves where nobody can see it`).toEqual([]);
    });

    test(`${route} has one header design and the one accent of the design tokens, not green`, async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(route);
      const header = page.locator('header#site-nav');
      await expect(header, `${route} does not render the shared header`).toHaveCount(1);
      // A page-level header, not a section's or a card's own <header>.
      const pageHeaders = await page.evaluate(() =>
        [...document.querySelectorAll('header')].filter((h) => !h.closest('main, article, section, li')).length);
      expect(pageHeaders, `${route} renders a second page header`).toBe(1);
      const h = await header.first().evaluate((el) => el.getBoundingClientRect().height);
      expect(h, `${route}: the phone header is ${h}px tall — one row is the design`).toBeLessThanOrEqual(72);

      const accent = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim());
      const m = /^#([0-9a-f]{6})$/i.exec(accent);
      expect(m, `--accent is not a solid hex: ${accent}`).not.toBeNull();
      const [r, g, b] = [0, 2, 4].map((i) => parseInt(m![1].slice(i, i + 2), 16) / 255);
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const d = max - min;
      const hue = d === 0 ? 0 : max === r ? (60 * ((g - b) / d) + 360) % 360 : max === g ? 60 * ((b - r) / d) + 120 : 60 * ((r - g) / d) + 240;
      expect(hue >= 75 && hue <= 175, `${route}: the accent ${accent} is green (hue ${Math.round(hue)})`).toBe(false);
      // RESTATED 2026-10-05 (M2 step 2.1). This asserted a blue (hue 200-250). The accent is one token
      // now, the default candidate of packages/design/src/web/accents.json, and the property is that
      // the page paints exactly THAT: whichever candidate the owner picks, every route shows it, and
      // never green (green is for status) nor the ember or azure the owner rejected.
      const accents = JSON.parse(readFileSync(join(process.cwd(), 'packages/design/src/web/accents.json'), 'utf8'));
      const want = accents.candidates.find((c: { name: string }) => c.name === accents.default).dark.accent;
      expect(accent.toLowerCase(), `${route}: the page does not paint the default accent candidate`).toBe(want.toLowerCase());
      expect(hue >= 10 && hue <= 50, `${route}: the accent ${accent} is ember orange (hue ${Math.round(hue)})`).toBe(false);
      expect(hue >= 200 && hue <= 250, `${route}: the accent ${accent} is azure blue (hue ${Math.round(hue)})`).toBe(false);
    });
  }

  test('reduced motion stops everything and still shows every section', async ({ page }) => {
    // Every route in one test: the default 30s is a budget for one page, and a loaded machine ran
    // out of it mid-sweep. The property is per route; the time is not.
    test.setTimeout(120_000);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    for (const route of ROUTES) {
      await page.goto(route);
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(null)))));
      const running = await page.evaluate(() =>
        document.getAnimations().filter((a) => a.playState === 'running' && a.effect?.getTiming().iterations === Infinity).length,
      );
      expect(running, `${route}: ${running} endless animation(s) still running under reduced motion`).toBe(0);
      const hidden = await page.evaluate(() =>
        [...document.querySelectorAll('main *')].filter((el) => (el.textContent ?? '').trim() && Number(getComputedStyle(el).opacity) === 0 && !el.closest('[hidden], .visually-hidden')).length,
      );
      expect(hidden, `${route}: ${hidden} element(s) left invisible under reduced motion`).toBe(0);
    }
  });

  // RESTATED 2026-10-05 (M2 site fix cycle 1): /pricing is a new layout. The three plan cards (`.plan-rail > .plan`) are gone: every plan is a COLUMN of
  // one table, and the decision a visitor came with is one panel. The property is the same (side by side on a desk, no sideways scroll on a phone),
  // read off the new structure: on a desk the table's three plan header cells share a row, in three columns; on a phone the table stacks and the page
  // does not scroll sideways at 320 or 390; the Free panel puts its copy beside its figures on a desk and above them on a phone.
  test('pricing holds its three plans as columns on a desk and stacks on a phone', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/pricing');
    const heads = await page.locator('table.compare thead th[scope="col"]').evaluateAll((els) => els.map((e) => {
      const r = e.getBoundingClientRect();
      return { top: Math.round(r.top), left: Math.round(r.left), w: Math.round(r.width) };
    }));
    expect(heads.length, 'the comparison table has no plan columns: capability plus three plans is four headers').toBe(4);
    expect(new Set(heads.map((c) => c.top)).size, `the headers do not share a row at 1440: ${JSON.stringify(heads)}`).toBe(1);
    expect(new Set(heads.map((c) => c.left)).size, 'two headers overlap in one column').toBe(4);
    expect(Math.min(...heads.slice(1).map((c) => c.w)), 'a plan column is too narrow to read').toBeGreaterThan(120);
    const panel = await page.locator('.now').evaluate((el) => {
      const copy = el.querySelector('.now__copy')!.getBoundingClientRect();
      const stats = el.querySelector('.now__stats')!.getBoundingClientRect();
      return { copyLeft: copy.left, statsLeft: stats.left };
    });
    expect(panel.statsLeft, 'on a desk the Free figures sit beside its copy, not under it').toBeGreaterThan(panel.copyLeft + 300);

    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 844 });
      await page.goto('/pricing');
      const rows = await page.locator('table.compare tbody tr').first().evaluate((tr) => getComputedStyle(tr).display);
      expect(rows, `on a ${width}px phone the table rows should stack as blocks, not scroll sideways`).toBe('grid');
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `/pricing scrolls sideways at ${width}px`).toBeLessThanOrEqual(1);
    }
  });
});
