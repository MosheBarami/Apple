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
