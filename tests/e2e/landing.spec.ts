import { expect, test } from '@playwright/test';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
// The asset id and the install href have exactly one definition in this repository. Asserting the
// rendered href against the constant — rather than against a pasted URL — is what stops the landing
// and the shared package drifting apart.
import {
  PLAN_COPY,
  PLAN_IDS,
  PRODUCT_MODELS,
  PRODUCT_MODEL_INFO,
  PRODUCT_MODES,
  PRODUCT_MODE_INFO,
  STUDIO_PLUGIN_INSTALL_HREF,
  STUDIO_PLUGIN_STORE_LIVE,
  STUDIO_PLUGIN_URL,
  canUseProductModel,
} from '../../packages/shared/src/index';

/**
 * The landing page's invariants, restated 2026-09-22 against the calm redesign.
 *
 * WHAT CHANGED AND WHY THIS WAS REWRITTEN RATHER THAN PATCHED. This file had gone stale almost
 * everywhere: it expected an h1 reading "Describe a Roblox game. / Apple builds it.", links called
 * "Start building — free" and "Install for Studio", `.ap-*` classes, sections #top/#product/
 * #library/#modes/#how/#pricing, a Rubik display face and a loaded Archivo webfont — none of which
 * the landing has had for weeks. It also asserted "ships no JavaScript", which the landing stopped
 * doing when its composer and stages became real controls. A spec whose selectors match nothing is
 * a spec that fails for reasons nobody reads.
 *
 * EVERY PROPERTY IT CHECKED THAT IS STILL A REQUIREMENT IS KEPT, re-aimed at the page that exists:
 *   - the proposition is one h1, and the whole offer is in the first frame at every size
 *   - no horizontal scroll at any supported size; every header control reachable on a phone
 *   - every nav destination resolves, and no link anywhere on the site is dead (/showcase is
 *     published by infra/deploy-showcase.mjs, not by Astro, so it is resolved against its
 *     publisher rather than fetched from this preview — see WORKER_SERVED)
 *   - no 3D and no canvas; no model-provider branding; Credits capitalised
 *   - the primary action reaches registration and sign-in reaches sign-in
 *   - the install link is whatever the shared constant says, with external-link attributes when it
 *     leaves the site; no undistributable store link and no install promise while the store is shut
 *   - keyboard reachable, with a visible focus ring — now also on the composer, which had none
 *   - text enlargement scrolls rather than clipping; every text element clears WCAG AA against the
 *     pixels actually behind it, in BOTH themes now
 *
 * ONE ASSERTION IS INVERTED: "claims no second model" forbade the words "apple max". Apple MAX is a
 * real model today (PRODUCT_MODELS), so the property it protected — no capability claim without a
 * capability — is asserted directly: the page names exactly the shared models, and says which plans
 * include each by asking canUseProductModel.
 */

/** Routes this site links to that Astro does not build, and what publishes each. */
const WORKER_SERVED = new Map([['/showcase', 'infra/deploy-showcase.mjs']]);
const ROOT = join(__dirname, '..', '..');

test('renders the proposition', async ({ page }) => {
  await page.goto('/');
  const h1 = page.getByRole('heading', { level: 1 });
  await expect(h1).toBeVisible();
  await expect(page.locator('h1')).toHaveCount(1);
  const text = ((await h1.textContent()) ?? '').trim();
  expect(text.length, 'the headline is empty or a fragment').toBeGreaterThan(20);
  // The line under it says where the product works, in the product's own words.
  await expect(page.locator('.hero .lead')).toContainText('Roblox Studio');
});

test('opens on the whole proposition', async ({ page }) => {
  // The page scrolls; what may NOT happen is a reader having to scroll to find out what this is or
  // how to start. Measured at the shortest supported height as well as the tallest.
  const sizes = [
    { width: 1440, height: 900 },
    { width: 1366, height: 768 },
    { width: 390, height: 844 },
  ];
  const mustBeVisible = ['h1', '.hero .lead', 'form.composer', 'button.composer-send', '.availability'];
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
  // The property, not the mechanism: every painted control in the header has its whole box inside
  // the viewport. A row that clips INTERNALLY never scrolls the document, which is how "Sign in"
  // once sat 36px past the edge of a 375px phone while the page-level guard stayed green.
  // And the header is ONE row: the landing's old inline header wrapped onto three (151px).
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
  await page.locator('#menu-toggle').click();
  await expect(page.locator('#primary-nav')).toBeVisible();
  await expect(page.locator('#primary-nav').getByRole('link', { name: 'Create an account' })).toBeVisible();
});

test('holds the composition: the sections the nav names, the shared header, a visible mark', async ({ page }) => {
  await page.goto('/');
  // The sections the page is built from, plus every one the shared nav names.
  const navFragments = await page.$$eval('header#site-nav a[href^="/#"]', (as) => as.map((a) => a.getAttribute('href')!.slice(2)));
  expect(navFragments.length, 'the shared nav offers no product-section destination').toBeGreaterThan(0);
  for (const id of new Set(['proof', 'inside', 'capabilities', 'built', 'models', ...navFragments])) {
    await expect(page.locator(`#${id}`), `#${id} is missing`).toHaveCount(1);
  }

  // ONE header, the shared one: the landing's own inline header drifted from every other route's.
  await expect(page.locator('header#site-nav')).toHaveCount(1);
  await expect(page.locator('footer.foot')).toHaveCount(1);

  // THE MARK IS VISIBLE. The logo's class once collided with a demo's `.gm { padding: 16px }`, and
  // a 22px box with 16px of padding drew nothing at all while every other check passed.
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

  // Modes from PRODUCT_MODES, models from PRODUCT_MODELS — derived, so a third cannot hide.
  await expect(page.locator('#models .mode-row')).toHaveCount(PRODUCT_MODES.length);
  await expect(page.locator('#models .model-card')).toHaveCount(PRODUCT_MODELS.length);

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

test('ships no webfont to fail, no 3D and no canvas', async ({ page }) => {
  // The design uses the system stack on purpose (the app's own), so there is no webfont whose
  // failure would make every other check in this file pass over a page that looks wrong.
  const fonts: string[] = [];
  const scripts: string[] = [];
  page.on('request', (r) => {
    if (r.resourceType() === 'font') fonts.push(r.url());
    if (r.resourceType() === 'script') scripts.push(r.url());
  });
  await page.goto('/', { waitUntil: 'networkidle' });
  expect(fonts, `unexpected webfont requests: ${fonts.join(', ')}`).toEqual([]);
  expect(scripts.filter((s) => /three|webgl|babylon/i.test(s)), 'a 3D library is loading on the landing').toEqual([]);
  await expect(page.locator('canvas')).toHaveCount(0);
});

test('every nav destination resolves', async ({ page }) => {
  await page.goto('/');
  const links = await page.$$eval('header#site-nav a', (as) =>
    as.map((a) => ({ label: (a.textContent ?? '').trim(), href: a.getAttribute('href') ?? '' })),
  );
  expect(links.length).toBeGreaterThanOrEqual(5);
  const bad: string[] = [];

  for (const { label, href } of links) {
    if (!href) {
      bad.push(`${label} has no href`);
      continue;
    }
    if (href.startsWith('/app')) continue; // the React workspace, served by the worker, not this preview
    const [path, hash] = href.split('#');
    if (hash && (path === '' || path === '/')) {
      const target = page.locator(`#${hash}`);
      if ((await target.count()) !== 1) bad.push(`${label} -> ${href} names no element on this page`);
      continue;
    }
    if (WORKER_SERVED.has(path)) {
      // Not an Astro route, so this preview cannot serve it. Resolved against its publisher instead
      // of skipped: an exemption with no publisher behind it would be a hole.
      if (!existsSync(join(ROOT, WORKER_SERVED.get(path)!))) bad.push(`${label} -> ${href}: its publisher is gone`);
      continue;
    }
    const res = await page.request.get(href);
    if (res.status() !== 200) bad.push(`${label} -> ${href} (HTTP ${res.status()})`);
  }

  expect(bad, `dead nav destinations:\n${bad.join('\n')}`).toEqual([]);

  for (const route of ['/docs/getting-started', '/docs/modes', '/docs/plugin', '/docs/connect', '/docs']) {
    const res = await page.request.get(route);
    expect(res.status(), `${route} should resolve`).toBe(200);
  }
});

test('shows no model-provider branding', async ({ page }) => {
  await page.goto('/');
  const text = ((await page.locator('body').textContent()) ?? '').toLowerCase();
  for (const brand of ['glm', 'gpt', 'openai', 'gemini', 'deepseek', 'anthropic', 'claude']) {
    expect(text, `landing must not mention "${brand}"`).not.toContain(brand);
  }
});

test('names exactly the models the product has, and the plans that include each', async ({ page }) => {
  // INVERTED from "claims no second model". Apple MAX is real (PRODUCT_MODELS); what must not happen
  // is a model named here that the product does not have, or Apple MAX promised to a plan that
  // canUseProductModel refuses — or Apple MAX described as a plan ("the subscription tier").
  await page.goto('/');
  const models = page.locator('#models .model-card');
  for (const [i, model] of PRODUCT_MODELS.entries()) {
    const card = models.nth(i);
    await expect(card).toContainText(PRODUCT_MODEL_INFO[model].name.replace(' MAX', ''));
    const plans = PLAN_IDS.filter((id) => canUseProductModel(model, id)).map((id) => PLAN_COPY[id].name);
    const text = (await card.textContent()) ?? '';
    if (plans.length < PLAN_IDS.length) for (const p of plans) expect(text, `${model} does not name ${p}`).toContain(p);
    else expect(text.toLowerCase()).toContain('every plan');
  }
  const body = ((await page.locator('body').textContent()) ?? '').toLowerCase();
  expect(body).not.toContain('subscription tier');
  for (const mode of PRODUCT_MODES) await expect(page.locator('#models')).toContainText(PRODUCT_MODE_INFO[mode].name);
  await expect(page.locator('#models')).toContainText('Autonomous');
});

test('counts in Credits, capitalised', async ({ page }) => {
  // The allowance unit is "Credits". A lowercase "credits" on the page that introduces the unit is
  // how a reader ends up thinking there are two different things.
  await page.goto('/');
  const text = (await page.locator('main').textContent()) ?? '';
  expect(text).toContain('Credits');
  expect(text.match(/\bcredits?\b/g) ?? [], 'a lowercase "credit(s)" on the landing').toEqual([]);
});

test('the primary actions reach registration, and sign-in reaches sign-in', async ({ page }) => {
  await page.goto('/');
  // The composer IS the primary action: a real form that submits to registration.
  await expect(page.locator('form.composer')).toHaveAttribute('action', '/app/signup');
  await expect(page.locator('form.composer textarea')).toHaveAttribute('name', 'start');
  // CSS locators, not roles: on a phone these two sit inside the collapsed menu, which removes them
  // from the accessibility tree until it opens — the hrefs are what is under test here.
  await expect(page.locator('header#site-nav a.nav__cta')).toHaveText('Create an account');
  await expect(page.locator('header#site-nav a.nav__cta')).toHaveAttribute('href', '/app/signup');
  await expect(page.locator('.closing').getByRole('link', { name: 'Create a free account' })).toHaveAttribute('href', '/app/signup');
  // The mirrored mistake: a returning user must not be sent to registration.
  await expect(page.locator('header#site-nav a.nav__signin')).toHaveText('Sign in');
  await expect(page.locator('header#site-nav a.nav__signin')).toHaveAttribute('href', '/app/login');

  // Typing and submitting carries the sentence to registration.
  await page.locator('form.composer textarea').fill('a lobby with a timer');
  await Promise.all([page.waitForURL(/\/app\/signup\?start=/), page.locator('button.composer-send').click()]);
});

test('the install link goes where the shared constant says, and says so honestly', async ({ page }) => {
  await page.goto('/');
  const link = page.locator('.availability a');
  await expect(link).toBeVisible();
  await expect(link).toHaveAttribute('href', STUDIO_PLUGIN_INSTALL_HREF);

  if (STUDIO_PLUGIN_STORE_LIVE) {
    expect(STUDIO_PLUGIN_INSTALL_HREF, 'the store is live, so the install href must be the store URL').toBe(STUDIO_PLUGIN_URL);
    await expect(link).toHaveAttribute('target', '_blank');
    const rel = (await link.getAttribute('rel')) ?? '';
    expect(rel.split(/\s+/)).toEqual(expect.arrayContaining(['noopener', 'noreferrer']));
    await expect(link).toContainText('Creator Store');
  } else {
    // Same-origin: a new tab here would be a lie about where the reader is going.
    await expect(link).not.toHaveAttribute('target', '_blank');
  }
});

test('the landing never links straight to an undistributable store page', async ({ page }) => {
  test.skip(STUDIO_PLUGIN_STORE_LIVE, 'the store is live; linking it is correct');
  await page.goto('/');
  const hrefs = await page.locator('a[href]').evaluateAll((as) => as.map((a) => a.getAttribute('href') ?? ''));
  expect(hrefs.filter((h) => h.includes('create.roblox.com/store/asset'))).toEqual([]);
});

test('no copy on the landing promises an install path the store does not have', async ({ page }) => {
  test.skip(STUDIO_PLUGIN_STORE_LIVE, 'the store is live; offering the install is the truth');
  await page.goto('/');
  const text = ((await page.locator('body').textContent()) ?? '').toLowerCase();
  for (const claim of ['available now', 'now on the creator store', 'available on the creator store', 'get it now', 'get apple studio']) {
    expect(text, `landing must not claim "${claim}"`).not.toContain(claim);
  }
});

test('the Product link reaches the run section, and it holds three steps', async ({ page }) => {
  await page.goto('/');
  const href = await page.$$eval('header#site-nav a', (as) => as.find((a) => (a.textContent ?? '').trim() === 'Product')?.getAttribute('href') ?? null);
  expect(href, 'the nav must offer "Product"').toBeTruthy();
  const target = page.locator(`#${href!.split('#')[1]}`);
  await expect(target).toHaveCount(1);
  await expect(target.locator('.step')).toHaveCount(3);
});

test('is keyboard reachable and keeps a visible focus ring — the composer included', async ({ page }) => {
  await page.goto('/');
  await page.keyboard.press('Tab');
  await expect(page.locator('.skip-link')).toBeFocused();

  // A link's own ring, on a link that is painted at every size.
  await page.locator('.closing').getByRole('link', { name: 'Create a free account' }).focus();
  const link = await page.evaluate(() => {
    const s = getComputedStyle(document.activeElement as HTMLElement);
    return { width: parseFloat(s.outlineWidth), style: s.outlineStyle, offset: parseFloat(s.outlineOffset) };
  });
  expect(link.style).not.toBe('none');
  expect(link.width).toBeGreaterThanOrEqual(2);

  // THE COMPOSER HAD NO VISIBLE RING (`outline: none` on the textarea won the cascade). The ring
  // now lives on the composer: 2px of the accent at a 4px offset (docs/DESIGN-LOCK.md, rule 6).
  await page.locator('form.composer textarea').focus();
  const ring = await page.locator('form.composer').evaluate((el) => {
    const s = getComputedStyle(el);
    const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
    const probe = document.createElement('i');
    probe.style.color = accent;
    document.body.append(probe);
    const want = getComputedStyle(probe).color;
    probe.remove();
    return { style: s.outlineStyle, width: parseFloat(s.outlineWidth), offset: parseFloat(s.outlineOffset), color: s.outlineColor, want };
  });
  expect(ring.style, 'the focused composer draws no ring').toBe('solid');
  expect(ring.width).toBe(2);
  expect(ring.offset).toBe(4);
  expect(ring.color, 'the ring is not the accent').toBe(ring.want);

  // Every stage tab is reachable and operable from the keyboard.
  await page.locator('.stage-tab').first().focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('.stage-tab').nth(1)).toBeFocused();
  await expect(page.locator('.stage-tab').nth(1)).toHaveAttribute('aria-selected', 'true');
});

// ONE RING AT A TIME (2026-09-22). The composer used `:focus-within` and also turned its rim blue, so
// a focused field drew two concentric rings, and tabbing on to Build left the composer's ring lit
// around the button's own — two nested blue rings. The property: the composer rings only while its
// field has focus, its rim does not change colour, and Build draws its own ring alone.
test('one focus ring at a time: the field rings the composer, Build rings itself alone', async ({ page }) => {
  await page.goto('/');
  const composer = page.locator('form.composer');
  const rim = () => composer.evaluate((el) => getComputedStyle(el).borderTopColor);
  const resting = await rim();

  await page.locator('form.composer textarea').focus();
  expect(await rim(), 'focusing the field recolours the composer rim — a second ring').toBe(resting);

  await page.keyboard.press('Tab');
  await expect(page.locator('button.composer-send')).toBeFocused();
  const outer = await composer.evaluate((el) => getComputedStyle(el).outlineStyle);
  expect(outer, 'the composer keeps its ring while Build has focus: two nested rings').toBe('none');
  const own = await page.locator('button.composer-send').evaluate((el) => {
    const st = getComputedStyle(el);
    return { style: st.outlineStyle, width: parseFloat(st.outlineWidth) };
  });
  expect(own.style, 'Build draws no ring of its own').not.toBe('none');
  expect(own.width).toBeGreaterThanOrEqual(2);
});

// THE GHOST PLAYS ONCE (2026-09-22). It cycled forever with a blinking fake caret. Finishing its
// animations jumps to where the one pass ends, which must be the first example, readable, and
// nothing else — never an empty box.
test('the composer ghost plays one pass and comes to rest on a readable example', async ({ page }) => {
  await page.goto('/');
  const endless = await page.evaluate(() =>
    document.getAnimations().filter((a) => a.effect?.getTiming().iterations === Infinity).length);
  expect(endless, 'an animation on the landing runs forever').toBe(0);
  const ran = await page.evaluate(() => {
    const mine = document.getAnimations().filter((a) =>
      ((a.effect as KeyframeEffect | null)?.target as Element | null)?.classList.contains('composer-line'));
    mine.forEach((a) => a.finish());
    return mine.length;
  });
  expect(ran, 'the ghost does not animate at all, so this check would pass over nothing').toBeGreaterThan(0);
  const opacity = await page.locator('.composer-line').evaluateAll((els) => els.map((el) => Number(getComputedStyle(el).opacity)));
  expect(opacity.length).toBeGreaterThan(1);
  expect(opacity[0], 'the pass ends on an empty field').toBe(1);
  expect(opacity.slice(1), 'the pass ends with more than one sentence showing').toEqual(opacity.slice(1).map(() => 0));
});

test('reduced motion stops the landing and hides nothing', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(null)))));
  const running = await page.evaluate(() =>
    document.getAnimations().filter((a) => a.playState === 'running' && a.effect?.getTiming().iterations === Infinity).length,
  );
  expect(running, 'an endless animation still runs under reduced motion').toBe(0);
  const hidden = await page.evaluate(() => [...document.querySelectorAll('[data-reveal]')].filter((el) => Number(getComputedStyle(el).opacity) < 1).length);
  expect(hidden, 'content left invisible under reduced motion').toBe(0);
  // The still state of the composer is a readable example, not an empty box.
  const first = await page.locator('.composer-line').first().evaluate((el) => Number(getComputedStyle(el).opacity));
  expect(first).toBe(1);
});

test('text enlargement scrolls rather than clipping', async ({ page }) => {
  await page.goto('/');
  await page.addStyleTag({ content: 'html { font-size: 32px !important; }' });
  const clipped = await page.evaluate(() => getComputedStyle(document.querySelector('main') as HTMLElement).overflow === 'hidden');
  expect(clipped, 'main must not clip its own content').toBe(false);
  await expect(page.locator('button.composer-send')).toBeVisible();
});

for (const theme of ['dark', 'light'] as const) {
  test(`every text element clears WCAG AA against what is actually behind it (${theme})`, async ({ page }) => {
    // Not a token audit: the only honest backdrop is the rendered pixel. apps/site/tests/
    // contrast.test.mjs checks the tokens; this checks what a browser paints, in both themes.
    await page.addInitScript((t) => { try { localStorage.setItem('apple-theme', t); } catch { /* private mode */ } }, theme);
    await page.goto('/');
    // Reveals finish (their failsafe is 2.6s) before boxes are measured.
    await page.waitForTimeout(2900);
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
  for (const route of ['/pricing', '/docs', '/docs/plugin', '/changelog', '/status', '/privacy', '/terms']) {
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
  // Every internal link resolves to something real, INCLUDING anchors: a bare `#inside` on the
  // landing and a `/#inside` from any other page both have to name an element on the page they
  // claim. /showcase is resolved against its publisher (WORKER_SERVED), because this preview is an
  // Astro build and /showcase is uploaded to the worker separately — fetching it here would report
  // a 404 that says nothing about production, and skipping it silently would be a hole.
  const routes = ['/', '/pricing', '/docs', '/docs/plugin', '/docs/connect', '/changelog', '/status', '/privacy', '/terms'];
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
      const clean = path.replace(/\/$/, '') || '/';
      if (WORKER_SERVED.has(clean)) {
        if (!existsSync(join(ROOT, WORKER_SERVED.get(clean)!))) bad.push(`${route} -> ${href} (its publisher ${WORKER_SERVED.get(clean)} is gone)`);
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
