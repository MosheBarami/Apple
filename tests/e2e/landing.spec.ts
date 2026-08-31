import { expect, test } from '@playwright/test';

/**
 * The landing page's invariants.
 *
 * These are not "does it render" tests. Each one encodes a decision that is
 * expensive to re-litigate and easy to lose by accident: one viewport, no
 * JavaScript, no mascot, and no model-provider branding on a public marketing
 * page. If someone reintroduces any of them, this suite is where they find out.
 */

test('renders the proposition', async ({ page }) => {
  await page.goto('/');
  const h1 = page.getByRole('heading', { level: 1 });
  await expect(h1).toBeVisible();
  await expect(h1).toContainText('Describe it.');
  await expect(h1).toContainText('Golem builds it.');
  // Exactly one h1: the page has one thing to say.
  await expect(page.locator('h1')).toHaveCount(1);
});

test('is one viewport with nothing below the fold', async ({ page }) => {
  await page.goto('/');
  const overflow = await page.evaluate(
    () => document.documentElement.scrollHeight - window.innerHeight,
  );
  // A pixel or two of rounding is fine; a second section is not.
  expect(overflow).toBeLessThanOrEqual(2);
});

test('is one viewport at every supported size', async ({ page }) => {
  // The three Playwright projects only cover three of these. The composition
  // has to hold at all of them, and the failure mode — a strip pushed just
  // under the fold on a 768px-tall laptop — is invisible until someone opens
  // the page on one.
  const sizes = [
    { width: 1920, height: 1080 },
    { width: 1728, height: 1117 },
    { width: 1440, height: 900 },
    { width: 1366, height: 768 },
    { width: 1024, height: 768 },
    { width: 390, height: 844 },
  ];
  const bad: string[] = [];

  for (const size of sizes) {
    await page.setViewportSize(size);
    await page.goto('/');
    const { overflowY, overflowX } = await page.evaluate(() => ({
      overflowY: document.documentElement.scrollHeight - window.innerHeight,
      overflowX:
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    }));
    if (overflowY > 2) bad.push(`${size.width}x${size.height}: ${overflowY}px below the fold`);
    if (overflowX > 1) bad.push(`${size.width}x${size.height}: ${overflowX}px of horizontal scroll`);
  }

  expect(bad, `one-viewport promise broken:\n${bad.join('\n')}`).toEqual([]);
});

test('holds the approved composition', async ({ page }) => {
  await page.goto('/');

  // Centred, not left-aligned. The whole point of the rebuild.
  await expect(page.locator('.hero')).toHaveCSS('text-align', 'center');

  // Two calls to action, not one.
  await expect(page.getByRole('link', { name: 'Start building — free' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Install Studio plugin' })).toBeVisible();

  // The mono micro-line under them.
  await expect(page.locator('.micro')).toContainText('Free to start');
  await expect(page.locator('.micro')).toContainText('No card required');

  // Three strip cells, each icon + title + subtitle.
  await expect(page.locator('.strip__cell')).toHaveCount(3);
  await expect(page.locator('.strip__title')).toHaveCount(3);
  await expect(page.locator('.strip__icon')).toHaveCount(3);

  // A grotesque display face at 600, not a serif. Fraunces is superseded.
  const display = await page.locator('h1').evaluate((el) => {
    const s = getComputedStyle(el);
    return { family: s.fontFamily.toLowerCase(), weight: s.fontWeight };
  });
  expect(display.family).not.toContain('fraunces');
  expect(display.family).not.toContain('georgia');
  // The generic at the end of the stack decides what a reader without Inter
  // sees. It has to be sans-serif, not serif.
  expect(display.family.split(',').pop()!.trim()).toBe('sans-serif');
  expect(display.weight).toBe('600');

  // The mark is a hexagon containing a cube, not the old monolith.
  await expect(page.locator('.brand .gm__hex')).toHaveCount(1);
  await expect(page.locator('.brand .gm__cube')).toHaveCount(1);
  await expect(page.locator('.brand .gm__eye')).toHaveCount(0);
});

test('every nav destination is a real route, never an anchor', async ({ page }) => {
  // Dead `/#how`-style anchors have shipped here before. They land the reader
  // at the top of a page with nothing to see and no explanation.
  await page.goto('/');
  const links = await page.$$eval('.nav a', (as) =>
    as.map((a) => ({
      label: (a.textContent ?? '').trim(),
      href: a.getAttribute('href') ?? '',
    })),
  );

  expect(links.length).toBeGreaterThanOrEqual(6);
  for (const { label, href } of links) {
    expect(href, `${label} has no href`).toBeTruthy();
    expect(href.startsWith('#'), `${label} must not be a scroll anchor`).toBe(false);
    expect(href.includes('/#'), `${label} must not be a scroll anchor`).toBe(false);
  }

  // Both routes the spec names explicitly, plus the second CTA's target.
  for (const route of ['/docs/getting-started', '/docs/modes', '/docs/plugin']) {
    const res = await page.request.get(route);
    expect(res.status(), `${route} should resolve`).toBe(200);
  }
});

test('never scrolls horizontally', async ({ page }) => {
  await page.goto('/');
  const overflowX = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflowX).toBeLessThanOrEqual(1);
});

test('ships no JavaScript and no 3D', async ({ page }) => {
  const scripts: string[] = [];
  page.on('request', (r) => {
    if (r.resourceType() === 'script') scripts.push(r.url());
  });
  await page.goto('/', { waitUntil: 'networkidle' });
  expect(scripts, `unexpected scripts: ${scripts.join(', ')}`).toHaveLength(0);
  // The mascot was a <canvas> driven by three.js. Neither may come back.
  await expect(page.locator('canvas')).toHaveCount(0);
});

test('shows no model-provider branding', async ({ page }) => {
  await page.goto('/');
  const text = ((await page.locator('body').textContent()) ?? '').toLowerCase();
  // Provider identity is a product control, not marketing decoration.
  for (const brand of ['glm', 'gpt', 'openai', 'gemini', 'deepseek', 'anthropic', 'claude']) {
    expect(text, `landing must not mention "${brand}"`).not.toContain(brand);
  }
});

test('the primary call to action reaches the app', async ({ page }) => {
  await page.goto('/');
  const cta = page.getByRole('link', { name: 'Start building — free' });
  await expect(cta).toBeVisible();
  await expect(cta).toHaveAttribute('href', '/app');
});

test('the secondary call to action reaches the plugin doc', async ({ page }) => {
  await page.goto('/');
  const cta = page.getByRole('link', { name: 'Install Studio plugin' });
  await expect(cta).toBeVisible();
  await expect(cta).toHaveAttribute('href', '/docs/plugin');
});

test('"How it works" is a real route, not a dead anchor', async ({ page }) => {
  await page.goto('/');
  // Queried out of the DOM rather than by role: below 900px the nav sheds its
  // middle links, so at mobile widths this one is deliberately not in the
  // accessibility tree. Where it points still has to be real.
  const href = await page.$$eval('.nav a', (as) => {
    const el = as.find((a) => (a.textContent ?? '').trim() === 'How it works');
    return el?.getAttribute('href') ?? null;
  });
  expect(href, 'the nav must offer "How it works"').toBeTruthy();
  expect(href!.startsWith('#'), 'must not be a scroll anchor').toBe(false);
  const res = await page.request.get(href!);
  expect(res.status(), `${href} should resolve`).toBe(200);
});

test('is keyboard reachable and keeps a visible focus ring', async ({ page }) => {
  await page.goto('/');
  await page.keyboard.press('Tab');
  const skip = page.locator('.skip-link');
  await expect(skip).toBeFocused();

  // Tab to the primary CTA and confirm focus is actually drawn.
  await page.getByRole('link', { name: 'Start building — free' }).focus();
  const outline = await page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    if (!el) return null;
    const s = getComputedStyle(el);
    return { width: s.outlineWidth, style: s.outlineStyle };
  });
  expect(outline).not.toBeNull();
  expect(outline!.style).not.toBe('none');
  expect(parseFloat(outline!.width)).toBeGreaterThan(0);
});

test('text enlargement scrolls rather than clipping', async ({ page }) => {
  await page.goto('/');
  // 200% text: the one-screen promise must yield to legibility, and content
  // must remain reachable rather than being cut off by an overflow rule.
  await page.addStyleTag({ content: 'html { font-size: 32px !important; }' });
  const clipped = await page.evaluate(() => {
    const frame = document.querySelector('.frame') as HTMLElement;
    return getComputedStyle(frame).overflow === 'hidden';
  });
  expect(clipped, 'the frame must not clip its own content').toBe(false);
  await expect(page.getByRole('link', { name: 'Start building — free' })).toBeVisible();
});

test('every text element clears WCAG AA against what is actually behind it', async ({ page }) => {
  // Not a token audit. The stage paints an amber glow and three matte planes
  // under the type, so the only honest backdrop is the rendered pixel. The
  // first cut of this page had a glow bright enough to drop the 12px mono
  // micro-line to 4.4:1, which no palette table would have caught.
  await page.goto('/');
  // The entrance runs 620ms with delays out to 320ms. Measuring boxes before
  // it lands records positions the elements have already left.
  await page.waitForTimeout(1200);

  const boxes = await page.evaluate(() => {
    const out: {
      label: string;
      color: string;
      size: number;
      bold: boolean;
      rect: { x: number; y: number; w: number; h: number };
      holes: { x: number; y: number; w: number; h: number }[];
    }[] = [];
    const seen = new Set<Element>();
    for (const el of document.querySelectorAll<HTMLElement>('.frame *')) {
      // Leaf elements carrying their own visible text.
      const text = [...el.childNodes]
        .filter((n) => n.nodeType === 3)
        .map((n) => n.textContent ?? '')
        .join('')
        .trim();
      if (!text || seen.has(el)) continue;
      const s = getComputedStyle(el);
      if (s.visibility === 'hidden' || s.display === 'none' || s.opacity === '0') continue;
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2 || r.bottom < 0 || r.top > innerHeight) continue;
      seen.add(el);
      out.push({
        label: `${el.className || el.tagName} "${text.slice(0, 28)}"`,
        color: s.color,
        size: parseFloat(s.fontSize),
        bold: parseInt(s.fontWeight, 10) >= 600,
        rect: { x: r.x, y: r.y, w: r.width, h: r.height },
        // An element's own text never sits on top of its element children, so
        // their boxes are excluded from the sample. Without this the eyebrow
        // is "measured" against its 28px amber dash, which carries no text.
        holes: [...el.children].map((ch) => {
          const cr = ch.getBoundingClientRect();
          return { x: cr.x, y: cr.y, w: cr.width, h: cr.height };
        }),
      });
    }
    return out;
  });

  expect(boxes.length, 'found no text to audit').toBeGreaterThan(6);

  // Make the glyphs transparent and shoot again. Element backgrounds and
  // borders still paint, so a label inside the cream CTA is measured against
  // the cream — not against the stage two layers below it — while no glyph
  // pixel is left to pollute the sample.
  await page.addStyleTag({ content: '.frame, .frame * { color: transparent !important }' });
  // addStyleTag resolves when the sheet is applied, not when the next frame is
  // painted. Shooting immediately captures the glyphs still on screen, which
  // reads back as a catastrophic contrast failure on every label.
  await page.waitForTimeout(400);
  const backdrop = (await page.screenshot()).toString('base64');

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
      const dpr = img.width / innerWidth;

      const lin = (v: number) =>
        v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
      const lum = (r: number, gg: number, b: number) =>
        0.2126 * lin(r / 255) + 0.7152 * lin(gg / 255) + 0.0722 * lin(b / 255);

      const bad: string[] = [];
      for (const box of boxes) {
        const { x, y, w, h } = box.rect;
        const x0 = Math.max(0, Math.round(x * dpr));
        const y0 = Math.max(0, Math.round(y * dpr));
        const bw = Math.max(1, Math.round(w * dpr));
        const bh = Math.max(1, Math.round(h * dpr));
        const px = g.getImageData(x0, y0, bw, bh).data;
        // Grown by 2px: a 1.5px amber rule at a fractional offset antialiases
        // a pixel past its own bounding box, and that stray pixel is bright
        // enough to look like a contrast failure.
        const PAD = 2;
        const holes = box.holes.map((hl) => ({
          x0: hl.x * dpr - PAD,
          y0: hl.y * dpr - PAD,
          x1: (hl.x + hl.w) * dpr + PAD,
          y1: (hl.y + hl.h) * dpr + PAD,
        }));

        // Worst case: the brightest backdrop pixel under the element, since
        // all type on this page is light on dark.
        let worst = 0;
        let sampled = 0;
        for (let row = 0; row < bh; row++) {
          for (let col = 0; col < bw; col++) {
            const ax = x0 + col;
            const ay = y0 + row;
            if (
              holes.some((hl) => ax >= hl.x0 && ax < hl.x1 && ay >= hl.y0 && ay < hl.y1)
            ) {
              continue;
            }
            const i = (row * bw + col) * 4;
            const l = lum(px[i], px[i + 1], px[i + 2]);
            if (l > worst) worst = l;
            sampled++;
          }
        }
        if (!sampled) continue; // wholly covered by children; audited via them

        const m = box.color.match(/[\d.]+/g)!.map(Number);
        const fg = lum(m[0], m[1], m[2]);
        const ratio =
          (Math.max(fg, worst) + 0.05) / (Math.min(fg, worst) + 0.05);
        // "Large" per WCAG: >=24px, or >=18.66px when bold.
        const large = box.size >= 24 || (box.bold && box.size >= 18.66);
        const need = large ? 3 : 4.5;
        if (ratio < need) {
          bad.push(
            `${box.label} — ${ratio.toFixed(2)}:1 at ${box.size}px, needs ${need}:1`,
          );
        }
      }
      return bad;
    },
    { boxes, backdrop },
  );

  expect(failures, `contrast failures:\n${failures.join('\n')}`).toEqual([]);
});

test('supporting routes resolve', async ({ page }) => {
  for (const route of ['/pricing', '/docs', '/changelog', '/privacy', '/terms']) {
    const res = await page.request.get(route);
    expect(res.status(), `${route} should resolve`).toBe(200);
  }
});

test('no link anywhere on the site points at a section that no longer exists', async ({ page }) => {
  // Cutting the landing down to one viewport deleted /#how, /#modes and
  // /#proof. Links to them survived in the shared nav and footer, which put a
  // dead anchor on every other page — the reader lands at the top of the
  // landing with nothing to see and no explanation. This asserts every
  // internal link resolves to something real.
  const routes = ['/', '/pricing', '/docs', '/changelog', '/privacy', '/terms'];
  const bad: string[] = [];

  for (const route of routes) {
    await page.goto(route);
    const hrefs = await page.$$eval('a[href]', (as) =>
      as.map((a) => a.getAttribute('href') ?? '').filter((h) => h.startsWith('/')),
    );
    for (const href of new Set(hrefs)) {
      const [path, hash] = href.split('#');
      // /app is the React workspace, served by the worker out of D1. The
      // static preview this suite runs against does not have it, so a 404
      // here says nothing about production. Its own links are covered by the
      // app's tests, not this one.
      if (path.startsWith('/app')) continue;
      const target = path || route;
      const res = await page.request.get(target);
      if (res.status() !== 200) {
        bad.push(`${route} -> ${href} (HTTP ${res.status()})`);
        continue;
      }
      if (hash) {
        // An anchor has to exist on the page it claims to be on.
        const body = await res.text();
        const present = new RegExp(`id=["']${hash}["']`).test(body);
        if (!present) bad.push(`${route} -> ${href} (no #${hash} on ${target})`);
      }
    }
  }

  expect(bad, `dead links:\n${bad.join('\n')}`).toEqual([]);
});
