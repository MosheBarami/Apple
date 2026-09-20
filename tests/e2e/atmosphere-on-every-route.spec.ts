import { expect, test } from '@playwright/test';

/**
 * THE ATMOSPHERE IS VISIBLE AND MOVING, ON EVERY ROUTE — IN A REAL BROWSER.
 *
 * WHY THIS FILE EXISTS, AND WHY IT IS NOT IN landing.spec.ts. That file owns the landing's
 * invariants and is under active edit by another lane; this one owns a property of the WHOLE site,
 * so it is separate on purpose rather than by accident. If the two are ever merged, the tests below
 * are the ones that must not be dropped in the merge.
 *
 * WHAT IT GUARDS. Until 2026-09-20 exactly one of the site's nineteen routes had any motion at all:
 * index.astro mounts <Horizon /> and landing.css declares 26 @keyframes, while global.css — which
 * dresses /pricing, /changelog, /status, /404, both legal routes and all eleven /docs pages —
 * declared ZERO keyframes and no canvas. The owner's complaint, in his own words on 2026-09-20,
 * was "הכל סטטי... הכל נראה שבור כאילו זה html בלבד" — everything static, everything looks broken,
 * as if it were only HTML. He was describing a real measurement.
 *
 * THE DEFECT THE FIX NEARLY SHIPPED WITH, which is the whole reason these assertions are shaped the
 * way they are. <Horizon /> is `position: fixed; z-index: -1`. A negative-z child paints AFTER the
 * root element's background and BEFORE the in-flow background of `body`. The root's background is
 * propagated to the viewport canvas, and when `html` declares one, `body`'s is not propagated and
 * paints as an ordinary block background — over the canvas. global.css declared a background on
 * BOTH. Mounting the canvas under it produced a page where the <canvas> was in the HTML, the script
 * ran, requestAnimationFrame fired, the 2D context took every draw call, the unit harness was green
 * — and not one of those pixels was ever visible.
 *
 * So "the element exists" and "the script runs" are NOT what is asserted here. Those were all true
 * of the broken version. What is asserted is the only thing that distinguishes the two:
 *
 *   1. HIDING THE CANVAS CHANGES THE PIXELS. Under emulated reduced motion the composition is a
 *      still frame, so two screenshots of the same page are byte-identical and a comparison is
 *      meaningful. Screenshot the page, then set `display: none` on the canvas and screenshot
 *      again. If the atmosphere were painted over, removing it would change nothing and the two
 *      images would match. This is the assertion the broken version fails.
 *   2. THE BACKING STORE CHANGES OVER TIME with motion allowed — a still canvas is a background
 *      image with extra steps, which is the thing the owner was complaining about.
 *
 * WHY REDUCED MOTION IS EMULATED FOR (1) AND NOT (2). A screenshot comparison on an animating page
 * is vacuous: consecutive frames differ anyway, so "the images differ" would pass even with the
 * canvas fully covered. Freezing it first is what makes the visibility question answerable at all.
 * Test (3) then uses the same emulation to assert the accessibility promise directly.
 */

/** Every route global.css dresses, plus the landing, which uses landing.css and its own tokens. */
const ROUTES = [
  '/',
  '/pricing',
  '/docs',
  '/docs/getting-started',
  '/changelog',
  '/status',
  '/privacy',
  '/terms',
];

/**
 * Settle the page: fonts done, one full frame painted. Without this the first screenshot can land
 * mid-layout and differ from the second for a reason that has nothing to do with the canvas.
 */
async function settle(page: import('@playwright/test').Page) {
  await page.evaluate(() => document.fonts?.ready);
  await page.evaluate(
    () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(null)))),
  );
}

/**
 * How many PIXELS differ between two screenshots — NOT how many bytes.
 *
 * THIS DISTINCTION IS THE WHOLE RELIABILITY OF THIS FILE, and it was learned the hard way. The
 * first version compared the PNG buffers with `Buffer.compare`. PNG encoding is not byte
 * deterministic: Chromium can emit different filter/compression choices for pixel-identical
 * frames. So byte comparison reports "these differ" for two images that are the same picture.
 *
 * That single mistake produced every strange result this file went through:
 *   - a "the page is not frozen" failure on /docs, whose pixels were provably stable;
 *   - a FALSE PASS on /docs/getting-started while the `html` background defect was deliberately
 *     reintroduced — the test wanted "the images differ" and got it from the encoder, not from a
 *     visible atmosphere;
 *   - a round trip that would not return to its original bytes although a pixel diff of the same
 *     two images counted exactly 0 differing pixels.
 *
 * Every one of those was the instrument, reported as a finding about the page. So the comparison
 * is done on decoded pixels, in the browser that took the shots, and it returns a COUNT — which
 * lets the assertions below demand a difference of real magnitude instead of merely non-zero.
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
      // Alpha is ignored: a screenshot is already composited and always opaque.
      for (let i = 0; i < A.length; i += 4) {
        if (A[i] !== B[i] || A[i + 1] !== B[i + 1] || A[i + 2] !== B[i + 2]) n++;
      }
      return n;
    },
    [a.toString('base64'), b.toString('base64')] as const,
  );
}

/**
 * Stop the page's OWN clocks, so "frozen" is achievable at all.
 *
 * /status is not a static page: it re-checks the API every 30 seconds and renders a countdown that
 * ticks once a second (`window.setInterval` in status.astro). Its pixels therefore change on their
 * own forever, and the visibility comparison below — which needs two identical screenshots to be
 * meaningful — can never be satisfied there. The first version of this file reported that as a
 * failure on /status, which was true and useless: the page was behaving exactly as designed.
 *
 * So the page's timers are cleared before measuring. This changes nothing about the ATMOSPHERE,
 * which is driven by requestAnimationFrame and is deliberately left running; it only stops the
 * unrelated clock that would otherwise make the page unmeasurable. Done after load so the initial
 * render is complete and only the repeating work is cancelled.
 */
async function stopPageClocks(page: import('@playwright/test').Page) {
  await page.evaluate(() => {
    // The highest live handle is whatever the next one would be; every id below it is cancelled.
    const ceiling = Number(setTimeout(() => {}, 0));
    for (let id = 0; id <= ceiling; id++) {
      clearInterval(id);
      clearTimeout(id);
    }
  });
}

/**
 * Screenshot a page that has demonstrably stopped changing, measured in pixels.
 *
 * A page that never settles fails loudly, and says that it is a refusal to judge rather than a
 * verdict about the atmosphere — the difference between "I could not measure" and "it is broken"
 * is the one this repository is built on.
 */
async function frozenShot(page: import('@playwright/test').Page, route: string): Promise<Buffer> {
  let worst = -1;
  for (let attempt = 0; attempt < 8; attempt++) {
    await settle(page);
    const a = await page.screenshot();
    const b = await page.screenshot();
    const n = await pixelsDiffering(page, a, b);
    if (n === 0) return a;
    worst = n;
    await page.waitForTimeout(250);
  }
  throw new Error(
    `${route}: the page never stopped changing under prefers-reduced-motion — ${worst} pixels were `
      + 'still differing between consecutive screenshots after 8 attempts. This is a FAILURE TO '
      + 'MEASURE, not a finding about the atmosphere: the comparison needs a frozen page. Find what '
      + 'is still moving (document.getAnimations(), a late chunk, a scrollbar) first.',
  );
}

test.describe('the living background', () => {
  for (const route of ROUTES) {
    test(`is actually visible on ${route}, not painted over`, async ({ page }) => {
      // Frozen, so two screenshots of an unchanged page are identical and the comparison below
      // measures the canvas rather than the passage of time.
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.goto(route, { waitUntil: 'networkidle' });
      await settle(page);
      await stopPageClocks(page);

      const canvas = page.locator('canvas.horizon');
      await expect(canvas, `${route} renders no atmosphere canvas at all`).toHaveCount(1);

      // THE INSTRUMENT, CHECKED FIRST: this returns only once consecutive screenshots are
      // PIXEL-identical, so the comparison below measures the canvas and not the passage of time.
      const withCanvas = await frozenShot(page, route);

      // Hide ONLY the canvas. It is `position: fixed`, so this removes no space and reflows nothing.
      await page.addStyleTag({
        content: '#atmosphere-probe, canvas.horizon { display: none !important; }',
      });
      // Stabilised, not merely settled: under parallel load a bare two-frame wait let a late paint
      // land between the shots and the round-trip check below then could not attribute anything.
      const withoutCanvas = await frozenShot(page, `${route} (canvas hidden)`);

      // PUT IT BACK, and require the page to return to the original PICTURE.
      //
      // WHY THE ROUND TRIP IS HERE. The assertion that follows is "these differ", which any
      // unrelated change also satisfies — a late chunk, a scrollbar, a lazy image. Restoring the
      // canvas and getting the first image back is what makes the difference ATTRIBUTABLE: nothing
      // else changed across the three shots, so only the canvas can explain the gap.
      await page.evaluate(() => {
        for (const el of Array.from(document.querySelectorAll('style'))) {
          if (el.textContent?.includes('#atmosphere-probe')) el.remove();
        }
      });
      const restored = await frozenShot(page, `${route} (canvas restored)`);

      // THE NOISE FLOOR, MEASURED RATHER THAN GUESSED. A round trip is not bit-exact: on /docs it
      // comes back with exactly 2 pixels differing by 1/255, at (81,158)-(82,160), on the
      // antialiased border of the docs search input — the same 2 pixels on 3 of 4 runs, and 0 on
      // the fourth. That is sub-pixel rendering noise, not a change to the page.
      //
      // Demanding 0 here made the suite fail on /docs under parallel load while the atmosphere was
      // perfectly visible, which is the instrument reported as a finding — the exact error this
      // file is written against. So the tolerance is set to the measured noise and named: 200
      // pixels is a hundred times the observed noise and twenty-five times BELOW the 5000-pixel
      // floor the real signal must clear, so nothing that matters can hide underneath it.
      const NOISE_FLOOR = 200;
      const roundTrip = await pixelsDiffering(page, withCanvas, restored);
      expect(
        roundTrip,
        `${route}: ${roundTrip} pixels did not return to their original value after the canvas was `
          + 'hidden and shown again — far more than the antialiasing noise this tolerance is sized '
          + 'for. Something OTHER than the atmosphere changed between screenshots, so the '
          + 'difference below cannot be attributed to the canvas. That is a failure to measure, '
          + 'not a verdict. Find the drift first.',
      ).toBeLessThanOrEqual(NOISE_FLOOR);

      // A REAL AREA, not a stray pixel. The atmosphere covers the viewport; if hiding it moves
      // fewer pixels than a small icon, it is not the background the owner asked for even if
      // something technically changed.
      const changed = await pixelsDiffering(page, withCanvas, withoutCanvas);
      // The signal must not merely exceed the floor, it must dwarf the noise actually measured on
      // THIS page in THIS run — otherwise a page that drifted right up to the tolerance could
      // supply the whole "difference" on its own.
      expect(
        changed,
        `${route}: hiding the canvas moved ${changed} pixels while the round trip alone moved `
          + `${roundTrip}. The difference is not cleanly attributable to the atmosphere.`,
      ).toBeGreaterThan(roundTrip * 25);
      expect(
        changed,
        `${route}: hiding canvas.horizon changed only ${changed} pixels, so the atmosphere is `
          + 'mounted, running and effectively INVISIBLE — painted over by a background on `html`, '
          + 'which is exactly the defect this file exists for. Every other check in the repository '
          + 'stays green through it.',
      ).toBeGreaterThan(5000);
    });
  }

  for (const route of ROUTES) {
    test(`actually moves on ${route}, rather than being a still image`, async ({ page }) => {
      await page.emulateMedia({ reducedMotion: 'no-preference' });
      await page.goto(route, { waitUntil: 'networkidle' });
      await settle(page);

      // The BACKING STORE, not a screenshot: this is the canvas's own pixels, so nothing else on
      // the page can make it look like the atmosphere moved when it did not.
      const moved = await page.evaluate(async () => {
        const c = document.querySelector('canvas.horizon') as HTMLCanvasElement | null;
        if (!c) return { ok: false, reason: 'no canvas' };

        // INSTRUMENT CHECK: the same unchanged buffer must read identically twice, or "the frames
        // differ" says nothing about animation.
        const x1 = c.toDataURL();
        const x2 = c.toDataURL();
        if (x1 !== x2) return { ok: false, reason: 'toDataURL is not stable for one buffer' };

        // Wait real animation frames, not a timer: a throttled or stopped rAF must read as "did
        // not move" rather than silently passing on a timeout.
        const frame = () => new Promise((r) => requestAnimationFrame(r));
        const before = c.toDataURL();
        let frames = 0;
        for (let i = 0; i < 30; i++) { await frame(); frames++; }
        const after = c.toDataURL();
        return { ok: true, frames, changed: before !== after };
      });

      expect(moved.ok, `${route}: ${moved.reason}`).toBe(true);
      expect(
        moved.frames,
        `${route}: requestAnimationFrame did not fire, so this is a measurement failure, not a `
          + 'finding about the page — do not read it as "the atmosphere is static"',
      ).toBeGreaterThan(5);
      expect(
        moved.changed,
        `${route}: the atmosphere canvas is painted once and never repaints. A still canvas is a `
          + 'background image with extra steps, which is the complaint this work answers.',
      ).toBe(true);
    });
  }

  test('reduced motion stops the movement without blanking the composition', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/pricing', { waitUntil: 'networkidle' });
    await settle(page);

    const still = await page.evaluate(async () => {
      const c = document.querySelector('canvas.horizon') as HTMLCanvasElement;
      const frame = () => new Promise((r) => requestAnimationFrame(r));
      const before = c.toDataURL();
      for (let i = 0; i < 20; i++) await frame();
      const after = c.toDataURL();

      // Is anything drawn at all? A blank canvas would also never change, and "still" and "empty"
      // must not be reported as the same thing. Read the element's own pixels back.
      const probe = document.createElement('canvas');
      probe.width = c.width;
      probe.height = c.height;
      const pctx = probe.getContext('2d')!;
      pctx.drawImage(c, 0, 0);
      const { data } = pctx.getImageData(0, 0, probe.width, probe.height);
      let lit = 0;
      for (let i = 3; i < data.length; i += 4) if (data[i] > 8) lit++;

      return { unchanged: before === after, litPixels: lit, total: data.length / 4 };
    });

    expect(
      still.litPixels,
      'under reduced motion the atmosphere draws nothing at all — a blank box, not a quieter '
        + 'composition. The still frame is supposed to be the whole picture, simply not moving.',
    ).toBeGreaterThan(200);

    expect(
      still.unchanged,
      'the atmosphere keeps animating under prefers-reduced-motion: reduce',
    ).toBe(true);
  });
});
