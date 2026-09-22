import { expect, test } from '@playwright/test';

/**
 * THE SITE IS CALM ON EVERY ROUTE — IN A REAL BROWSER.
 *
 * INVERTED 2026-09-22, AND THE HISTORY IS WHY IT IS STILL HERE RATHER THAN DELETED.
 *
 * This file used to prove the opposite: that a living background — the <Horizon /> canvas, a
 * perspective grid and a glow band — was visible and moving on every route. Its method was the
 * valuable part. It learned, expensively, that "the element exists" and "the script runs" say
 * nothing about what a reader sees (the canvas once ran, drew and was painted over, with every
 * check green), so it asserted on PIXELS: hide the thing, and see whether the screenshot changes.
 *
 * The owner's final direction removes that layer outright — "no wireframe horizon, no glowing grid,
 * no fake AI particles, no ambient sci-fi wallpaper" — and asks for a site that is calm. So the
 * property is inverted and the method is kept: every route is checked in a real browser for the
 * absence of the atmosphere (no canvas, no ambient layer), for stillness measured on pixels (two
 * screenshots apart in time are the same picture, the landing composer's example line excepted),
 * for no animation-frame loop at idle, for one header design, for a blue — not green — accent, and
 * for reduced motion stopping everything. The pixel-diff helper is the old file's, unchanged.
 */

/** Every layout family: the landing, the content routes, docs, legal and status. */
const ROUTES = [
  '/',
  '/pricing',
  '/docs',
  '/docs/getting-started',
  '/docs/plugin',
  '/changelog',
  '/status',
  '/privacy',
  '/terms',
];

/**
 * Settle the page: fonts done, reveals finished, one full frame painted. The reveal failsafe fires
 * at 2.6s and its fade is --t-slow (420ms), so a reveal can still be moving at 3.0s — waiting 2.9s
 * measured a fade, not the page.
 */
async function settle(page: import('@playwright/test').Page) {
  await page.evaluate(() => document.fonts?.ready);
  await page.waitForTimeout(3500);
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
 * What may animate forever on its own. EMPTY since 2026-09-22: the landing composer's example
 * sentences used to cycle endlessly with a blinking caret, and were the one exemption. They now play
 * one pass and stop, so nothing on any route is allowed to loop at idle.
 */
const ALLOWED_MOTION: string[] = [];

test.describe('the calm site', () => {
  for (const route of ROUTES) {
    test(`${route} has no atmosphere layer: no canvas, no ambient scene`, async ({ page }) => {
      await page.goto(route);
      await expect(page.locator('canvas'), `${route} renders a <canvas>`).toHaveCount(0);
      const ambient = await page.evaluate(() =>
        [...document.querySelectorAll('[class]')]
          .map((el) => String((el as HTMLElement).className))
          .filter((c) => /\b(?:horizon|atmosphere|flow-field|particles?|starfield|light-column|strata|ridge|sound-dock|cursor-ring)\b/i.test(c)),
      );
      expect(ambient, `${route} carries an ambient/decorative layer`).toEqual([]);
    });

    test(`${route} is still: two screenshots a second apart are the same picture`, async ({ page }) => {
      await page.goto(route);
      await settle(page);
      // Masked, so that anything ELSE moving is what this measures: the landing's example line (the
      // one sanctioned motion) and /status's live readouts (a countdown is information, not decor).
      // The whole field is masked, not the ghost's own box: each sentence drifts 4px as it fades, so
      // its last faint pixels leave a mask drawn to the box and read as a 1-pixel "change".
      const mask = [page.locator('.composer-field'), page.locator('#status-checked'), page.locator('#status-next')];
      const a = await page.screenshot({ mask });
      await page.waitForTimeout(1200);
      const b = await page.screenshot({ mask });
      const n = await pixelsDiffering(page, a, b);
      expect(n, `${route}: ${n} pixels changed in 1.2s with nobody touching the page`).toBe(0);
    });

    test(`${route} runs no animation-frame loop at idle and loops nothing forever`, async ({ page }) => {
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
      expect(after - before, `${route} requested ${after - before} animation frames while idle`).toBe(0);

      const looping = await page.evaluate((allowed) =>
        document.getAnimations()
          .filter((a) => a.playState === 'running' && a.effect?.getTiming().iterations === Infinity)
          .map((a) => {
            const target = (a.effect as KeyframeEffect | null)?.target as Element | null;
            return target ? String(target.className) : '?';
          })
          .filter((cls) => !allowed.some((ok: string) => cls.includes(ok))),
      ALLOWED_MOTION);
      expect(looping, `${route} loops an animation forever`).toEqual([]);
    });

    test(`${route} has one header design and a blue, not green, accent`, async ({ page }) => {
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
      expect(hue >= 200 && hue <= 250, `${route}: the accent ${accent} is not the restrained blue (hue ${Math.round(hue)})`).toBe(true);
    });
  }

  test('reduced motion stops everything and still shows every section', async ({ page }) => {
    // Nine routes in one test: the default 30s is a budget for one page, and a loaded machine ran
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
        [...document.querySelectorAll('[data-reveal]')].filter((el) => Number(getComputedStyle(el).opacity) < 1).length,
      );
      expect(hidden, `${route}: ${hidden} section(s) left invisible under reduced motion`).toBe(0);
    }
  });

  test('pricing lays its three plans side by side on a desk and stacks them on a phone', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/pricing');
    // The cards reveal with a stagger (8px of travel); measured mid-reveal they are a pixel apart
    // in height and read as two rows. Settle first — the failsafe is 2.6s plus a 420ms fade.
    await page.waitForTimeout(3500);
    const desk = await page.locator('.plan-rail > .plan').evaluateAll((els) => els.map((e) => {
      const r = e.getBoundingClientRect();
      return { top: Math.round(r.top), left: Math.round(r.left), w: Math.round(r.width) };
    }));
    expect(desk.length, 'the plan rail holds no cards').toBe(3);
    expect(new Set(desk.map((c) => c.top)).size, `the cards do not share a row at 1440: ${JSON.stringify(desk)}`).toBe(1);
    expect(new Set(desk.map((c) => c.left)).size, 'the cards overlap in one column').toBe(3);
    expect(Math.min(...desk.map((c) => c.w)), 'a card is too narrow to read').toBeGreaterThan(300);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/pricing');
    const phone = await page.locator('.plan-rail > .plan').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().left)));
    expect(new Set(phone).size, 'on a phone the cards should stack in one column').toBe(1);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, '/pricing scrolls sideways on a phone').toBeLessThanOrEqual(1);
  });
});
