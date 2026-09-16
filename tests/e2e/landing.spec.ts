import { expect, test } from '@playwright/test';
// The asset id has exactly one definition in this repository. Asserting the
// rendered href against the constant — rather than against a pasted URL — is
// what stops the landing and the shared package drifting apart.
import { STUDIO_PLUGIN_INSTALL_HREF, STUDIO_PLUGIN_STORE_LIVE } from '../../packages/shared/src/index';

/**
 * The landing page's invariants.
 *
 * These are not "does it render" tests. Each one encodes a decision that is
 * expensive to re-litigate and easy to lose by accident: no JavaScript, no
 * mascot, no model-provider branding on a public marketing page, and no
 * destination that goes nowhere.
 *
 * ONE INVARIANT WAS DELIBERATELY RETIRED, and it is written down here rather
 * than deleted quietly, because it was the load-bearing one for two years of
 * this file's history: **one viewport, nothing below the fold**. The owner's
 * redesign makes the landing a five-section scrolling page — hero, product,
 * modes, how it works, pricing — and docs/DECISIONS.md ADR-020 records that
 * call, the artifact it came from, and the fact that it supersedes
 * docs/DESIGN-SPEC.md §0–§1. Two tests asserted it. They are replaced, not
 * dropped:
 *
 *   - `is one viewport with nothing below the fold` becomes
 *     `opens on the whole proposition`. What that rule was really protecting
 *     is that a reader sees the offer without working for it; the page being
 *     exactly one screen tall was the means, not the end. So the end is
 *     asserted directly — headline, both calls to action and the free-to-start
 *     line are all inside the first frame at every supported size.
 *   - `is one viewport at every supported size` keeps its horizontal half,
 *     which was always a separate promise, and loses its vertical half.
 *
 * A SECOND RULE INVERTED, for the same reason. `never an anchor` existed
 * because the one-viewport rebuild deleted the sections `/#how`, `/#modes` and
 * `/#proof` named, and links to them survived — so a reader landed at the top
 * of a page with nothing to see. The ban was a proxy for "no dead
 * destination". The sections exist again, so the proxy is replaced with the
 * thing itself: every nav destination must resolve, which for a route means
 * HTTP 200 and for an anchor means an element with that id that is actually
 * on the page. That is strictly more than the ban ever checked — the ban
 * could not have caught an anchor pointing at an id that had been renamed.
 */

/** Every section the nav and the design promise, by id.
 *
 *  `library` is the one the design does NOT promise — it answers the separate complaint that the
 *  site claims a library and never shows one — but the nav promises it, which is what this list is
 *  really about. A nav entry whose section is listed nowhere here is an anchor nothing watches. */
const SECTIONS = ['top', 'product', 'library', 'modes', 'how', 'pricing'];

test('renders the proposition', async ({ page }) => {
  await page.goto('/');
  const h1 = page.getByRole('heading', { level: 1 });
  await expect(h1).toBeVisible();
  await expect(h1).toContainText('Describe a Roblox game.');
  await expect(h1).toContainText('Apple builds it.');
  // Exactly one h1: the page has one thing to say.
  await expect(page.locator('h1')).toHaveCount(1);
});

test('opens on the whole proposition', async ({ page }) => {
  // The replacement for "one viewport, nothing below the fold". The page may
  // scroll now; what may NOT happen is a reader having to scroll to find out
  // what this is or how to start. Measured at the shortest supported height as
  // well as the tallest, because the failure mode is a hero that fits on a
  // 27-inch display and pushes its own buttons under the fold on a laptop.
  const sizes = [
    { width: 1440, height: 900 },
    { width: 1366, height: 768 },
    { width: 390, height: 844 },
  ];
  const mustBeVisible = [
    'h1',
    'a:has-text("Start building — free")',
    'a:has-text("Install for Studio")',
    '.ap-hero__note',
  ];
  const bad: string[] = [];

  for (const size of sizes) {
    await page.setViewportSize(size);
    await page.goto('/');
    for (const sel of mustBeVisible) {
      const below = await page.locator(sel).first().evaluate((el, h) => {
        const r = el.getBoundingClientRect();
        return Math.round(r.bottom - h);
      }, size.height);
      if (below > 0) bad.push(`${size.width}x${size.height}: ${sel} ends ${below}px below the fold`);
    }
  }

  expect(bad, `the offer is not in the first frame:\n${bad.join('\n')}`).toEqual([]);
});

test('never scrolls horizontally at any supported size', async ({ page }) => {
  // The three Playwright projects only cover three of these, and the failure —
  // one unbreakable token in a card, a grid column with a min wider than the
  // screen — is invisible until someone opens the page on the size that has it.
  const sizes = [
    { width: 1920, height: 1080 },
    { width: 1728, height: 1117 },
    { width: 1440, height: 900 },
    { width: 1366, height: 768 },
    { width: 1024, height: 768 },
    { width: 390, height: 844 },
    { width: 320, height: 568 },
  ];
  const bad: string[] = [];

  for (const size of sizes) {
    await page.setViewportSize(size);
    await page.goto('/');
    const overflowX = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    if (overflowX > 1) bad.push(`${size.width}x${size.height}: ${overflowX}px of horizontal scroll`);
  }

  expect(bad, `horizontal scroll:\n${bad.join('\n')}`).toEqual([]);
});

test('holds the approved composition', async ({ page }) => {
  await page.goto('/');

  // Six sections, each with an id the nav can reach.
  for (const id of SECTIONS) {
    await expect(page.locator(`#${id}`), `#${id} is missing`).toHaveCount(1);
  }

  // Two calls to action in the hero, not one.
  await expect(page.getByRole('link', { name: 'Start building — free' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Install for Studio' })).toBeVisible();

  // The mono micro-line under them.
  await expect(page.locator('.ap-hero__note')).toContainText('Free to start');
  await expect(page.locator('.ap-hero__note')).toContainText('No card required');

  // TWO mode cards, and three plans. The landing no longer leads with Super
  // Agent — the owner does not want it on the front of the product — and the
  // rest of the site has since caught up: `super` is in PRODUCT_MODES and not in
  // PRODUCT_MODES_OFFERED, so /pricing and /docs/modes derive their lists from
  // the offered one and no longer carry it either. Only /changelog still names
  // it, because a release entry records what shipped on a date.
  // apps/site/tests/withdrawn-modes.test.mjs is the guard on that.
  await expect(page.locator('#modes .ap-card')).toHaveCount(2);
  await expect(page.locator('#pricing .ap-card')).toHaveCount(3);

  // THE DISPLAY FACE. This asserted Archivo at font-stretch 118% in uppercase,
  // and all three are superseded: the identity is Rubik, sentence case, and no
  // width axis at all. The `font-stretch` assertion is DELETED rather than
  // relaxed — Rubik has no `wdth` axis, so a stretch expectation here would
  // either be trivially true or would demand a declaration the stylesheet
  // deliberately removed as a dead one.
  //
  // What the assertion is really for survives intact: a stack that silently
  // falls back still reads as sans-serif and would pass every other check on
  // this page, so the family is named directly.
  const display = await page.locator('h1').evaluate((el) => {
    const s = getComputedStyle(el);
    return {
      family: s.fontFamily.toLowerCase(),
      weight: s.fontWeight,
      transform: s.textTransform,
    };
  });
  expect(display.family).toContain('rubik');
  expect(display.family).not.toContain('archivo');
  expect(display.family).not.toContain('fraunces');
  expect(display.family).not.toContain('georgia');
  // The generic at the end of the stack decides what a reader without the
  // webfont sees. It has to be sans-serif, not serif.
  expect(display.family.split(',').pop()!.trim()).toBe('sans-serif');
  expect(display.weight).toBe('700');
  // SENTENCE CASE. A blanket uppercase on every display line was the single
  // loudest thing this page had in common with revix.tech.
  expect(display.transform).toBe('none');

  // The mark is a hexagon containing a cube, not the old monolith.
  await expect(page.locator('.ap-header .gm__hex')).toHaveCount(1);
  await expect(page.locator('.ap-header .gm__cube')).toHaveCount(1);
  await expect(page.locator('.ap-header .gm__eye')).toHaveCount(0);
});

test('the webfont actually loads, so the width axis is real', async ({ page }) => {
  // `font-stretch: 118%` computes to 118% whether or not Archivo arrived — the
  // declaration is in the stylesheet either way. Only document.fonts knows
  // whether a face that can honour the axis is loaded, and if it is not, every
  // other assertion in this file still passes against a page that looks
  // nothing like the design.
  await page.goto('/');
  await page.evaluate(() => document.fonts.ready);
  const loaded = await page.evaluate(() =>
    [...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family),
  );
  expect(loaded, `families loaded: ${loaded.join(', ') || 'none'}`).toContain('Archivo');
});

test('every nav destination resolves', async ({ page }) => {
  // Replaces `never an anchor`. The old rule banned anchors because the
  // sections they named had been deleted; the sections exist again, so the
  // rule is now the one the ban was standing in for. An anchor has to name an
  // element ON THIS PAGE, and a route has to answer 200.
  await page.goto('/');
  const links = await page.$$eval('.ap-nav a', (as) =>
    as.map((a) => ({
      label: (a.textContent ?? '').trim(),
      href: a.getAttribute('href') ?? '',
    })),
  );

  expect(links.length).toBeGreaterThanOrEqual(5);
  const bad: string[] = [];

  for (const { label, href } of links) {
    if (!href) {
      bad.push(`${label} has no href`);
      continue;
    }
    if (href.startsWith('#')) {
      const target = page.locator(href);
      if ((await target.count()) !== 1) {
        bad.push(`${label} -> ${href} names no element on this page`);
      } else if (!(await target.isVisible())) {
        bad.push(`${label} -> ${href} names an element that is not visible`);
      }
      continue;
    }
    const res = await page.request.get(href);
    if (res.status() !== 200) bad.push(`${label} -> ${href} (HTTP ${res.status()})`);
  }

  expect(bad, `dead nav destinations:\n${bad.join('\n')}`).toEqual([]);

  // The routes the docs and footer still link to, checked whether or not the
  // nav happens to name them today.
  for (const route of ['/docs/getting-started', '/docs/modes', '/docs/plugin', '/docs']) {
    const res = await page.request.get(route);
    expect(res.status(), `${route} should resolve`).toBe(200);
  }
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

test('claims no second model, because there is not one', async ({ page }) => {
  // The design this page implements is titled "Two models", and apps/worker's
  // router sends every authoring mode to the same one. What differs between
  // modes is how much work they do, which is what the design's own lede says.
  // Shipping the heading would have been a capability claim with no capability
  // under it — the exact class of thing the strip cells were rewritten for.
  await page.goto('/');
  const text = ((await page.locator('body').textContent()) ?? '').toLowerCase();
  for (const claim of ['two models', 'both models', 'apple max', 'model only']) {
    expect(text, `landing must not claim "${claim}"`).not.toContain(claim);
  }
});

test('counts in Credits, not credits', async ({ page }) => {
  // "Credits" is already taken here: it is the purchased, non-expiring balance,
  // and the allowance a plan grants is measured in Credits. The design uses
  // "credits" for both. One word with two meanings on the page that introduces
  // the unit is how a reader ends up budgeting against the wrong number.
  await page.goto('/');
  const pricing = ((await page.locator('#pricing').textContent()) ?? '').toLowerCase();
  expect(pricing).toContain('credits');
  expect(pricing, 'the allowance is Credits; "credits" means the purchased balance').not.toContain(
    'credits',
  );
});

test('the primary call to action reaches registration, not the sign-in form', async ({ page }) => {
  // It used to assert `/app`, which looked right and was not: `/app` is the dashboard, the
  // dashboard is inside AuthGuard, and a signed-out visitor is redirected to /login. So the button
  // that says "Start building — free" put someone who has never heard of this product in front of
  // a sign-in form and asked them to spot a small "Create an account" link underneath it.
  //
  // Asserted as the registration route rather than merely "not /app", because the failure this
  // guards against is a destination that is plausible and wrong.
  await page.goto('/');
  const cta = page.getByRole('link', { name: 'Start building — free' });
  await expect(cta).toBeVisible();
  await expect(cta).toHaveAttribute('href', '/app/signup');

  // The other half: a returning user must still be able to say so. Sending them to the
  // registration form is the same defect mirrored, and it is the easy mistake to make while fixing
  // the first one.
  const signIn = page.getByRole('link', { name: 'Sign in', exact: true });
  await expect(signIn).toHaveAttribute('href', '/app/login');
});

test('the secondary call to action reaches the honest install destination', async ({ page }) => {
  // The install destination is whatever the shared config says it is, and while
  // the asset is not distributable that is /docs/plugin rather than the store —
  // a store page with nothing to get is exactly the dead link ADR-017 decision 3
  // forbids. When STUDIO_PLUGIN_STORE_LIVE flips, this test follows it: the href
  // becomes the store URL and the external-link attributes become required.
  await page.goto('/');
  const cta = page.getByRole('link', { name: 'Install for Studio' });
  await expect(cta).toBeVisible();
  await expect(cta).toHaveAttribute('href', STUDIO_PLUGIN_INSTALL_HREF);

  if (STUDIO_PLUGIN_STORE_LIVE) {
    await expect(cta).toHaveAttribute('target', '_blank');
    const rel = (await cta.getAttribute('rel')) ?? '';
    expect(rel.split(/\s+/)).toEqual(expect.arrayContaining(['noopener', 'noreferrer']));
  } else {
    // Same-origin: a new tab here would be a lie about where the reader is going.
    await expect(cta).not.toHaveAttribute('target', '_blank');
  }
});

test('the landing never links straight to an undistributable store page', async ({ page }) => {
  // The failure this guards is subtle and was live once: the CTA label stays
  // honest, no banned phrase appears, and the button still dead-ends because its
  // href skipped the storeLive gate. Assert the absence of the raw store URL
  // anywhere on the page, not just on the CTA.
  test.skip(STUDIO_PLUGIN_STORE_LIVE, 'the store is live; linking it is correct');
  await page.goto('/');
  const hrefs = await page.locator('a[href]').evaluateAll((as) =>
    as.map((a) => a.getAttribute('href') ?? ''),
  );
  expect(hrefs.filter((h) => h.includes('create.roblox.com/store/asset'))).toEqual([]);
});

test('no copy on the landing promises the plugin is installable today', async ({ page }) => {
  // The asset is uploaded but NOT distributed: toolbox-service returns 404 for
  // it, so a "Get Plugin" button may not be there when a reader arrives. The
  // button may point at the store; the page may not claim the trip will work.
  //
  // "One click in Studio" is step 01 of the design's how-it-works section, which
  // is why this list is longer than the phrasing anyone would write by accident.
  await page.goto('/');
  const text = ((await page.locator('body').textContent()) ?? '').toLowerCase();
  for (const claim of [
    'available now',
    'now on the creator store',
    'available on the creator store',
    'get it now',
    'one click',
    'one-click',
    'already installed',
    'plugin installed',
  ]) {
    expect(text, `landing must not claim "${claim}"`).not.toContain(claim);
  }
});

test('"How it works" reaches a section that is really there', async ({ page }) => {
  await page.goto('/');
  // Queried out of the DOM rather than by role: at narrow widths the nav wraps
  // and sheds nothing, but this stays robust to it doing so later. Where it
  // points still has to be real.
  const href = await page.$$eval('.ap-nav a', (as) => {
    const el = as.find((a) => (a.textContent ?? '').trim() === 'How it works');
    return el?.getAttribute('href') ?? null;
  });
  expect(href, 'the nav must offer "How it works"').toBeTruthy();
  const target = page.locator(href!);
  await expect(target).toHaveCount(1);
  await expect(target).toBeVisible();
  // And the section has to say what it claims to: three numbered steps.
  await expect(page.locator('#how .ap-card')).toHaveCount(3);
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
  // 200% text: legibility wins, and content must remain reachable rather than
  // being cut off by an overflow rule.
  await page.addStyleTag({ content: 'html { font-size: 32px !important; }' });
  const clipped = await page.evaluate(() => {
    const main = document.querySelector('main') as HTMLElement;
    return getComputedStyle(main).overflow === 'hidden';
  });
  expect(clipped, 'main must not clip its own content').toBe(false);
  await expect(page.getByRole('link', { name: 'Start building — free' })).toBeVisible();
});

test('every text element clears WCAG AA against what is actually behind it', async ({ page }) => {
  // Not a token audit. The hero paints a four-stop radial gradient under the
  // type and the cards sit on their own surface, so the only honest backdrop is
  // the rendered pixel. An earlier cut of this page had a glow bright enough to
  // drop a 12px mono line to 4.4:1, which no palette table would have caught.
  //
  // NOW AUDITS THE WHOLE DOCUMENT, not the first screen. When this page was one
  // viewport, "visible in the viewport" and "on the page" were the same set.
  // They are not any more, and four of the five sections are below the fold —
  // filtering to the viewport would have quietly reduced this from an audit of
  // the page to an audit of the hero.
  await page.goto('/');
  // The entrance runs 620ms with delays out to 300ms. Measuring boxes before it
  // lands records positions the elements have already left.
  await page.waitForTimeout(1200);

  const boxes = await page.evaluate(() => {
    const out: {
      label: string;
      color: string;
      clip: string | null;
      size: number;
      bold: boolean;
      rect: { x: number; y: number; w: number; h: number };
      holes: { x: number; y: number; w: number; h: number }[];
    }[] = [];
    const seen = new Set<Element>();
    for (const el of document.querySelectorAll<HTMLElement>('body *')) {
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
      if (r.width < 2 || r.height < 2) continue;
      // The skip link parks itself at left:-9999px until focused. Sampling it
      // clamps to x=0 and audits whatever happens to be in the top-left corner.
      if (r.right < 0 || r.left > innerWidth) continue;
      seen.add(el);
      // A heading whose glyphs are painted by a clipped background has a
      // computed `color` of transparent. Measuring that as the foreground
      // reports pure black on a bright gradient — a spectacular false failure
      // on text that is in fact the brightest thing on the page. The honest
      // foreground is the DARKEST stop of the gradient doing the painting.
      const clipped = s.webkitBackgroundClip === 'text' || s.backgroundClip === 'text';
      out.push({
        label: `${el.className || el.tagName} "${text.slice(0, 28)}"`,
        color: s.color,
        clip: clipped ? s.backgroundImage : null,
        size: parseFloat(s.fontSize),
        bold: parseInt(s.fontWeight, 10) >= 600,
        rect: { x: r.x + scrollX, y: r.y + scrollY, w: r.width, h: r.height },
        // An element's own text never sits on top of its element children, so
        // their boxes are excluded from the sample. Without this an eyebrow is
        // "measured" against its own 6px dot, which carries no text.
        holes: [...el.children].map((ch) => {
          const cr = ch.getBoundingClientRect();
          return { x: cr.x + scrollX, y: cr.y + scrollY, w: cr.width, h: cr.height };
        }),
      });
    }
    return out;
  });

  expect(boxes.length, 'found no text to audit').toBeGreaterThan(30);

  // Make the glyphs transparent and shoot again. Element backgrounds and
  // borders still paint, so a label inside the gradient CTA is measured against
  // the gradient — not against the section two layers below it — while no glyph
  // pixel is left to pollute the sample.
  await page.addStyleTag({
    content: 'body, body * { color: transparent !important; text-shadow: none !important }',
  });
  // CLIPPED TEXT DOES NOT GO AWAY WHEN `color` DOES. A heading painted through
  // `background-clip: text` draws its glyphs from its BACKGROUND, so blanking
  // the colour left the gradient letterforms sitting in the backdrop shot — and
  // the audit then measured the headline against its own brightest glyph pixel
  // and reported 1.26:1 on text that is in fact the brightest thing on the
  // page. No CSS selector can reach "elements whose computed background-clip is
  // text", so the background-image is removed element by element, which is also
  // what makes the true backdrop underneath visible for sampling.
  //
  // THE ASSERTION THAT USED TO FOLLOW — `expect(unclipped).toBeGreaterThan(0)`,
  // "is the hero headline still clipped?" — IS DELETED, and deliberately in the
  // same change as the design that made it wrong. The hero's second line is now
  // a solid --accent-ink rather than a gradient clipped to its glyphs, because
  // a clipped headline has no fallback colour and the colour is the argument.
  // Left standing, that assertion would fail a page that is correct, which is
  // the worst kind of red: it teaches the next person to distrust the harness.
  //
  // The SWEEP stays, because it is not about the headline. Any element that
  // paints text through its background must still have that background removed
  // before the backdrop is shot, or the audit measures type against its own
  // glyphs — and it costs nothing to keep looking for one.
  await page.evaluate(() => {
    for (const el of document.querySelectorAll<HTMLElement>('body *')) {
      const s = getComputedStyle(el);
      if (s.webkitBackgroundClip === 'text' || s.backgroundClip === 'text') {
        el.style.setProperty('background-image', 'none', 'important');
      }
    }
  });
  // addStyleTag resolves when the sheet is applied, not when the next frame is
  // painted. Shooting immediately captures the glyphs still on screen, which
  // reads back as a catastrophic contrast failure on every label.
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

      // THE SCALE IS READ, NOT INFERRED. This was `img.width / innerWidth`, and
      // on a device-scale-factor-2.625 phone that is 1082 / 412 = 2.62621 —
      // 0.05% high, because the screenshot's pixel width is the rounded-up
      // product. A 0.05% error is nothing at the top of the page and 2.6 device
      // pixels 5,700 CSS pixels down it, which is how a 6px dot ended up one
      // row outside its own exclusion box and got measured as the backdrop its
      // eyebrow sits on: 1.59:1 reported on type that is really 8.22:1. It
      // failed on the phone project and passed on both desktop ones, which is
      // exactly the shape of an error that scales with distance.
      const dpr = devicePixelRatio;
      if (Math.abs(img.width - innerWidth * dpr) > 2) {
        return [`backdrop is ${img.width}px wide; ${innerWidth} CSS px at ${dpr}x should be ~${innerWidth * dpr}`];
      }

      const lin = (v: number) =>
        v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
      const lum = (r: number, gg: number, b: number) =>
        0.2126 * lin(r / 255) + 0.7152 * lin(gg / 255) + 0.0722 * lin(b / 255);

      const bad: string[] = [];
      for (const box of boxes) {
        const { x, y, w, h } = box.rect;
        const x0 = Math.max(0, Math.round(x * dpr));
        const y0 = Math.max(0, Math.round(y * dpr));
        const bw = Math.max(1, Math.min(Math.round(w * dpr), c.width - x0));
        const bh = Math.max(1, Math.min(Math.round(h * dpr), c.height - y0));
        if (bw < 1 || bh < 1) continue;
        const px = g.getImageData(x0, y0, bw, bh).data;
        // Grown by 2 CSS px — not 2 device px, which is what this was and which
        // is under a pixel of real slack on a 3x screen. A hairline or a small
        // round mark at a fractional offset antialiases past its own bounding
        // box, and one stray bright pixel is all it takes to look like a
        // contrast failure.
        const PAD = 2 * dpr;
        const holes = box.holes.map((hl) => ({
          x0: hl.x * dpr - PAD,
          y0: hl.y * dpr - PAD,
          x1: (hl.x + hl.w) * dpr + PAD,
          y1: (hl.y + hl.h) * dpr + PAD,
        }));

        // BOTH EXTREMES, NOT THE BRIGHT ONE.
        //
        // This tracked only the brightest backdrop pixel, and the comment that
        // justified it — "since all type on this page is light on dark" — was
        // load-bearing rather than descriptive. The landing is light-first now:
        // dark ink on a pale baseplate. Against dark ink the brightest pixel is
        // the FLATTERING one, so the old sampler would have reached for the
        // single most generous pixel under every element and reported clean
        // over a real failure. That is this repository's own named defect — a
        // failure to observe rendering as an observation — sitting inside the
        // instrument that exists to catch it.
        //
        // So both ends are kept and the verdict is taken on the WORSE of the
        // two ratios. That is strictly stronger than either premise alone, and
        // it is direction-agnostic: it stays correct whichever way the page
        // flips next, and it would have caught the old page too.
        let hi = 0;
        let lo = 1;
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
            if (l > hi) hi = l;
            if (l < lo) lo = l;
            sampled++;
          }
        }
        if (!sampled) continue; // wholly covered by children; audited via them

        // The foreground. For clipped text it is the darkest stop of the
        // gradient painting the glyphs; otherwise it is simply the colour.
        let fg: number;
        if (box.clip) {
          const stops = [...box.clip.matchAll(/rgba?\(([^)]+)\)/g)].map((m) => {
            const [r, gg, b] = m[1].split(',').map((v) => parseFloat(v));
            return lum(r, gg, b);
          });
          if (!stops.length) {
            bad.push(`${box.label} — background-clip:text with no readable colour stops`);
            continue;
          }
          fg = Math.min(...stops);
        } else {
          const m = box.color.match(/[\d.]+/g)!.map(Number);
          // A fully transparent colour paints no glyph. If it is not clipped
          // text, that is invisible copy, not a contrast question.
          if (m.length > 3 && m[3] === 0) {
            bad.push(`${box.label} — colour is fully transparent and nothing paints it`);
            continue;
          }
          fg = lum(m[0], m[1], m[2]);
        }

        // The worse of the two, so neither a light nor a dark backdrop pixel
        // can be the one that lets the element through.
        const against = (bg: number) => (Math.max(fg, bg) + 0.05) / (Math.min(fg, bg) + 0.05);
        const ratio = Math.min(against(hi), against(lo));
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
  // landing with nothing to see and no explanation. This asserts every internal
  // link resolves to something real, INCLUDING the anchors the redesign brought
  // back: a bare `#modes` on the landing and a `/#modes` from any other page
  // both have to name an element that is on the page they claim.
  const routes = ['/', '/pricing', '/docs', '/changelog', '/privacy', '/terms'];
  const bad: string[] = [];

  for (const route of routes) {
    await page.goto(route);
    const hrefs = await page.$$eval('a[href]', (as) =>
      as.map((a) => a.getAttribute('href') ?? '').filter((h) => h.startsWith('/') || h.startsWith('#')),
    );
    for (const href of new Set(hrefs)) {
      const [path, hash] = href.split('#');
      // /app is the React workspace, served by the worker out of D1. The static
      // preview this suite runs against does not have it, so a 404 here says
      // nothing about production. Its own links are covered by the app's tests.
      if (path.startsWith('/app')) continue;
      // A bare `#id` is a link into the page we are already on.
      if (path === '') {
        if (hash && (await page.locator(`#${hash}`).count()) !== 1) {
          bad.push(`${route} -> ${href} (no #${hash} on ${route})`);
        }
        continue;
      }
      const target = path;
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
