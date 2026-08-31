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
  const cta = page.getByRole('link', { name: 'Start building' });
  await expect(cta).toBeVisible();
  await expect(cta).toHaveAttribute('href', '/app');
});

test('"How it works" is a real route, not a dead anchor', async ({ page }) => {
  await page.goto('/');
  const link = page.getByRole('link', { name: /How it works/ });
  const href = await link.getAttribute('href');
  expect(href).toBeTruthy();
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
  await page.getByRole('link', { name: 'Start building' }).focus();
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
  await expect(page.getByRole('link', { name: 'Start building' })).toBeVisible();
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
