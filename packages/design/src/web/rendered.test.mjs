/**
 * WHAT THE WEB APP DRAWS, MEASURED IN A BROWSER: the pairs a person sees, not the tokens somebody remembered.
 *
 * Every other guard in this folder reads a stylesheet and resolves tokens. That is the right place to
 * check a CLAIM and the wrong place to check a LOOK, and one defect proved it: the primary button's
 * label and icon. `--color-primary-foreground` was mapped to `--accent-ink` (6.54:1 on the accent) and the
 * token tests measured that pair and passed, while the stylesheet `button { color: inherit }` (unlayered)
 * outranked Tailwind's `@layer utilities` on every <button>, so the composer's Send arrow was drawn in the
 * muted ink of the toolbar around it: 1.18:1 in dark, 1.10:1 in light. No token was wrong. The cascade was.
 *
 * So this file builds apps/web (tests/built-web.mjs), opens it in Chromium on the fixture data AND on the signed-out
 * pages (sign in, sign up, forgot, recovery, confirm, reset), and for every element the browser paints with the accent
 * (or its hover step) reads what the browser drew for its text and its icons (`currentColor` strokes included), in
 * every state a person puts it in: at rest, under the pointer, pressed, focused from the keyboard, and (where it keeps
 * the fill) disabled, in both themes:
 *
 *   - text is 4.5:1 or better on the fill it sits on (WCAG 1.4.3), an icon 3:1 (1.4.11); that held at REST on the
 *     sign-in pages (6.54:1 dark, 6.10:1 light) while `button:hover { color: var(--ink) }` (0,3,1) outranked the
 *     primary's own hover colour (0,3,0), so the label read 1.96:1 and 2.30:1 the moment anybody pointed at it;
 *   - every variant of the shadcn Button, which is where the primary and destructive buttons come from, is
 *     drawn on each of the five surfaces and measured the same way (the variants are read from
 *     components/ui/button.tsx, not listed here);
 *   - and the cause is held directly: no unscoped bare-element rule gives a form control a colour,
 *     because an unlayered rule beats a layered utility whatever its specificity.
 *
 * IT FAILS RATHER THAN SKIPS: no Vite, no Chromium, a failed build or a route that drew nothing is a failure
 * to observe, and a failure to observe must not render as a clean page. And it proves it can see: the
 * measurement is first pointed at elements this file draws itself, one that must fail and one that must pass.
 */
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { rgbOfHex, splitTop, theme, themeBlocks, surfacesOf } from './css-tokens.mjs';
import { buildMockWeb, launchChromium, serveApp } from './tests/built-web.mjs';
import { BAR, drawnRatio, failuresOf, inPageBackdropFilters, inPageFilledElements, inPageFocusIndicator, inPageRememberRest, inPageRingPixels } from './tests/probes.mjs';
import { ROOT } from './tests/repo-walk.mjs';
import { appSheets, asTheMarkupWritesIt, flatRules, markupClassLists, primaryButtonContexts } from './tests/sheets.mjs';

const MODES = ['dark', 'light'];
const THEMES = Object.fromEntries(MODES.map((m) => [m, theme(themeBlocks()[m])]));
/** What the browser must find painted with the accent: the accent, its hover step, and a 90% mix over a surface (Tailwind's `hover:bg-primary/90`). */
const TARGETS = (mode) => ['accent', 'accent-strong'].map((n) => ({ name: n, rgb: rgbOfHex(THEMES[mode].resolve(n)) }));
const TOLERANCE = 24;

/** Type into every field of a sign-in form: the submit is disabled until the form is valid, and a person enables it by typing. */
async function fillForm(page) {
  for (const field of await page.locator('input:visible, textarea:visible').all()) {
    const type = await field.getAttribute('type');
    if (type === 'checkbox') await field.check();
    else if (type === 'email') await field.fill('person@example.com');
    else if (type === 'password') await field.fill('test-only-Passw0rd!');
    else await field.fill('a note');
  }
}

/**
 * The routes. Each setup puts the page in the state in which its accent control is drawn. The mock project's routes ask for the
 * fixtures with `?mock=1`; a `guest` route asks for nothing, so the app is SIGNED OUT and draws the sign-in pages: it is loaded
 * afresh in each theme, because its submit is disabled until `fill` has typed into the form and the disabled state is read first.
 */
const ROUTES = [
  { name: 'sign in', path: '/app/login', guest: true, fill: fillForm },
  { name: 'sign up', path: '/app/signup', guest: true, fill: fillForm },
  { name: 'forgot', path: '/app/forgot', guest: true, fill: fillForm },
  { name: 'recovery', path: '/app/recovery', guest: true, fill: fillForm },
  { name: 'confirm', path: '/app/confirm', guest: true, fill: fillForm },
  { name: 'reset', path: '/app/reset', guest: true },
  { name: 'projects', path: '/app/?mock=1' },
  {
    name: 'workspace', path: '/app/projects/p-lobby?mock=1',
    async setup(page) {
      const skip = page.getByRole('button', { name: 'Skip the tour' });
      if (await skip.count()) await skip.first().click();
      // The scripted socket stays closed in fixture mode, so Send is disabled: enable it in the page. The styles are what is measured.
      await page.evaluate(() => { for (const b of document.querySelectorAll('button[aria-label="Send"]')) b.removeAttribute('disabled'); });
    },
  },
  { name: 'roadmap list', path: '/app/projects/p-lobby/roadmap?mock=1' },
  {
    name: 'roadmap map', path: '/app/projects/p-lobby/roadmap?mock=1',
    async setup(page) {
      await page.getByRole('button', { name: 'Map', exact: true }).click();
      await page.locator('.react-flow__node').first().waitFor();
      await page.locator('.react-flow__node').first().click({ force: true });
      await page.getByRole('button', { name: 'Build', exact: true }).first().waitFor();
    },
  },
  { name: 'branding', path: '/app/projects/p-lobby/branding?mock=1' },
  { name: 'usage', path: '/app/usage?mock=1' },
  { name: 'settings', path: '/app/settings?mock=1' },
  { name: 'admin', path: '/app/admin?mock=1' },
];

let built;
let server;
let browser;
/** mode -> [{ route, state: 'disabled' | 'rest' | 'hover' | 'press' | 'focus', elements }] */
const DRAWN = { dark: [], light: [] };
const VARIANTS = { dark: [], light: [] };
/** mode -> [{ route, stops: [focus indicator records] }] */
const FOCUS = { dark: [], light: [] };
/** mode -> the focus stops of the Button variant fixtures, one per variant and surface */
const VARIANT_FOCUS = { dark: [], light: [] };
/** mode -> every node button of the roadmap map, focused and read as pixels (see mapNodeRings) */
const NODE_RINGS = { dark: [], light: [] };
/** mode -> [{ state, elements }]: every variant of the shadcn Badge, as a span and as a link, on each surface (rest and hover) */
const BADGES = { dark: [], light: [] };
/** mode -> [{ chain, cls, tag, disabled, rest, hover, press, focus }]: the legacy primary button in every page wrapper the sheets restyle it in */
const FAMILIES = { dark: [], light: [] };
let FAMILY_CONTEXTS = { chains: [], subjects: [] };
const RING = 3;
/** [{ route, blurred: string[] }]: every element drawn with a backdrop filter, route by route (the same in both themes). */
const BLURS = [];
let FIXTURE_BLURS = [];

const NO_MOTION = '*,*::before,*::after{transition:none!important;animation:none!important}';
const setTheme = (page, mode) => page.evaluate((m) => { document.documentElement.dataset.theme = m; }, mode);


/** Press Tab through the page from its top and record the focus indicator at every stop (each element once). */
async function tabThrough(page, limit = 90) {
  await page.evaluate(() => { document.activeElement?.blur(); getSelection()?.collapse(document.body, 0); window.scrollTo(0, 0); });
  const stops = [];
  const seen = new Set();
  let repeats = 0;
  for (let i = 0; i < limit && repeats < 3; i += 1) {
    await page.keyboard.press('Tab');
    const f = await page.evaluate(inPageFocusIndicator);
    if (!f) continue;
    if (seen.has(f.id)) { repeats += 1; continue; }
    repeats = 0;
    seen.add(f.id);
    if (f.visible) stops.push(f);
  }
  return stops;
}

/**
 * One control in each state a person puts it in after the rest: under the pointer, PRESSED (the mouse is held down on it and let go
 * off it, so nothing is clicked), and focused from the keyboard. Each read is of whatever fill the control draws in that state, and
 * carries which states the browser reports (`:hover`, `:active`, `:focus-visible`), so a state that was never reached is a failure
 * and not a clean read. Null when the control cannot be reached with the pointer.
 */
async function readStates(page, id) {
  try { await page.locator(`[data-probe="${id}"]`).hover({ timeout: 1500 }); } catch { return null; }
  const hover = await page.evaluate(inPageFilledElements, { only: id });
  await page.mouse.down();
  const press = await page.evaluate(inPageFilledElements, { only: id });
  await page.mouse.move(0, 0);
  await page.mouse.up();
  await page.evaluate((i) => { document.activeElement?.blur(); document.querySelector(`[data-probe="${i}"]`)?.focus({ focusVisible: true }); }, id);
  const focus = await page.evaluate(inPageFilledElements, { only: id });
  await page.evaluate(() => document.activeElement?.blur());
  return { hover, press, focus };
}

/**
 * Every node button of the roadmap map, focused as a keyboard user focuses it, read AS PIXELS: a clip around the card with nothing
 * focused, the same clip with the button focused, compared (inPageRingPixels). `dimmedAtRest` is whether the card is faded before
 * the focus arrives (the map dims every node that is not linked to the selected one); `moved` is whether the card changed place when
 * focused (a clip that moved compares nothing).
 */
async function mapNodeRings(page, decoder) {
  const buttons = page.locator('.react-flow__node button[aria-pressed]');
  const out = [];
  for (let i = 0; i < await buttons.count(); i += 1) {
    const button = buttons.nth(i);
    const card = button.locator('xpath=..');
    await page.evaluate(() => document.activeElement?.blur());
    await button.scrollIntoViewIfNeeded();
    const box = await card.boundingBox();
    const pad = 10;
    const clip = { x: Math.max(0, Math.floor(box.x - pad)), y: Math.max(0, Math.floor(box.y - pad)), width: Math.ceil(box.width + 2 * pad), height: Math.ceil(box.height + 2 * pad) };
    const shot = async () => (await page.screenshot({ clip })).toString('base64');
    const dimmedAtRest = await card.evaluate((c) => Number(getComputedStyle(c).opacity) < 1);
    const before = await shot();
    const focusVisible = await button.evaluate((b) => { b.focus({ focusVisible: true }); return b.matches(':focus-visible'); });
    const after = await shot();
    const now = await card.boundingBox();
    const moved = Math.abs(now.x - box.x) > 0.5 || Math.abs(now.y - box.y) > 0.5;
    out.push({ who: await button.getAttribute('aria-label'), dimmedAtRest, focusVisible, moved, ...(await decoder.evaluate(inPageRingPixels, { before, after })) });
  }
  await page.evaluate(() => document.activeElement?.blur());
  return out;
}

before(async () => {
  built = buildMockWeb();
  server = await serveApp(built.dir);
  browser = await launchChromium();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  // The pages are drawn from the build alone: nothing may leave the machine (the sign-in pages would reach for the identity provider).
  await context.route((url) => !['127.0.0.1', 'localhost'].includes(url.hostname), (route) => route.abort());
  const page = await context.newPage();
  const decoder = await context.newPage();
  await decoder.setContent('<canvas></canvas>');
  for (const route of ROUTES) {
    for (const mode of MODES) {
      if (route.guest || mode === MODES[0]) {
        await page.goto(server.url + route.path, { waitUntil: 'networkidle', timeout: 60_000 });
        await page.addStyleTag({ content: NO_MOTION });
        await page.waitForTimeout(700);
        if (route.setup) await route.setup(page);
      }
      await setTheme(page, mode);
      await page.waitForTimeout(150);
      const targets = TARGETS(mode);
      if (route.fill) {
        // Before anything is typed the submit is disabled. It keeps the accent fill, and what it keeps on it is its label.
        const off = await page.evaluate(inPageFilledElements, { targets, tolerance: TOLERANCE, includeDisabled: true });
        DRAWN[mode].push({ route: route.name, state: 'disabled', elements: off.filter((e) => e.disabled) });
        await route.fill(page);
        await page.waitForTimeout(100);
      }
      const rest = await page.evaluate(inPageFilledElements, { targets, tolerance: TOLERANCE, includeDisabled: true });
      DRAWN[mode].push({ route: route.name, state: 'rest', elements: rest });
      // Every distinct CONTROL that is filled with the accent (a meter's fill is not one), in each state a person puts it in.
      const seen = new Set();
      const states = { hover: [], press: [], focus: [] };
      for (const e of rest) {
        const key = `${e.tag}|${e.cls}|${e.name}`;
        if (e.disabled || !e.interactive || seen.has(key) || seen.size >= 24) continue;
        seen.add(key);
        const read = await readStates(page, e.id);
        if (read) for (const state of Object.keys(states)) states[state].push(...read[state]);
      }
      for (const state of Object.keys(states)) DRAWN[mode].push({ route: route.name, state, elements: states[state] });
      await page.mouse.move(0, 0);
      if (mode === 'dark') BLURS.push({ route: route.name, blurred: await page.evaluate(inPageBackdropFilters) });
      // From the keyboard: the ring each control draws when it is tabbed to.
      await page.evaluate(inPageRememberRest);
      FOCUS[mode].push({ route: route.name, stops: await tabThrough(page) });
      if (route.name === 'roadmap map') NODE_RINGS[mode] = await mapNodeRings(page, decoder);
    }
  }
  // The shadcn Button, every variant, drawn on each surface: at rest and hovered.
  await page.goto(server.url + '/app/?mock=1', { waitUntil: 'networkidle', timeout: 60_000 });
  await page.addStyleTag({ content: NO_MOTION });
  // The class string the component renders is `cn(buttonVariants(...))`: the three strings merged by tailwind-merge, which drops a
  // utility a later one overrides (the destructive variant's ring colour replaces the base's). Merge them the same way, with the app's own copy.
  const { twMerge } = createRequire(join(ROOT, 'apps/web/package.json'))('tailwind-merge');
  const parts = buttonVariants(readFileSync(join(ROOT, 'apps/web/src/components/ui/button.tsx'), 'utf8'));
  const variants = Object.fromEntries(Object.entries(parts.variants).map(([name, classes]) => [name, twMerge(parts.base, classes, parts.size)]));
  const surfaces = Object.keys(surfacesOf(THEMES.dark));
  await page.evaluate(({ variants: v, surfaces: s }) => {
    const host = document.createElement('div');
    host.id = 'fx-host';
    host.style.cssText = 'position:fixed;inset:0;z-index:99999;overflow:auto;background:var(--paper)';
    const icon = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>';
    for (const [name, classes] of Object.entries(v)) {
      for (const surface of s) {
        const cell = document.createElement('div');
        cell.style.cssText = `background:var(--${surface});padding:12px;display:inline-block`;
        cell.innerHTML = `<button type="button" data-slot="button" data-fx="${name}|${surface}" class="${classes}">${icon}Label</button>`;
        host.appendChild(cell);
      }
    }
    document.body.appendChild(host);
  }, { variants, surfaces });
  // The vendored attachment remove button, as upstream writes it (`bg-background/80 backdrop-blur-sm`), and a bare utility:
  // the stylesheet must take the blur out of an element that carries one.
  await page.evaluate(() => {
    const host = document.getElementById('fx-host');
    host.insertAdjacentHTML('beforeend', '<button id="fx-blur-a" type="button" class="bg-background/80 backdrop-blur-sm">a</button><div id="fx-blur-b" class="backdrop-blur-sm">b</div>');
  });
  FIXTURE_BLURS = await page.evaluate(inPageBackdropFilters, '#fx-blur-a, #fx-blur-b');
  await page.evaluate(() => { document.getElementById('fx-blur-a').remove(); document.getElementById('fx-blur-b').remove(); });
  for (const mode of MODES) {
    await setTheme(page, mode);
    await page.waitForTimeout(150);
    const rest = await page.evaluate(inPageFilledElements, { selector: '[data-fx]' });
    const hovered = [];
    for (const e of rest) {
      await page.locator(`[data-probe="${e.id}"]`).hover();
      hovered.push(...await page.evaluate(inPageFilledElements, { selector: '[data-fx]', only: e.id }).then((r) => r.map((x) => ({ ...x, fx: e.fx }))));
    }
    await page.mouse.move(0, 0);
    VARIANTS[mode] = [{ state: 'rest', elements: rest }, { state: 'hover', elements: hovered }];
    await page.evaluate(inPageRememberRest);
    // Tab through the fixture host only: it is on top and holds nothing else focusable.
    await page.evaluate(() => { document.getElementById('fx-host').insertAdjacentHTML('afterbegin', '<button id="fx-start" type="button" style="position:fixed;top:0;left:0;width:1px;height:1px;opacity:0" aria-hidden="true"></button>'); document.getElementById('fx-start').focus(); });
    const stops = [];
    for (let i = 0; i < 6 * 5 + 2; i += 1) {
      await page.keyboard.press('Tab');
      const f = await page.evaluate(inPageFocusIndicator);
      if (f?.visible) stops.push({ ...f, fx: await page.evaluate(() => document.activeElement.getAttribute('data-fx')) });
    }
    VARIANT_FOCUS[mode] = stops.filter((f) => f.fx);
    await page.evaluate(() => document.getElementById('fx-start')?.remove());
  }
  // The shadcn Badge, every variant, as the span it is and as the link it becomes (`asChild`, `[a&]:hover:` utilities), on each surface.
  const badgeParts = cvaParts(readFileSync(join(ROOT, 'apps/web/src/components/ui/badge.tsx'), 'utf8'));
  assert.ok(badgeParts.base && Object.keys(badgeParts.variants).length >= 4, 'components/ui/badge.tsx no longer reads as a cva() with a base and variants');
  const badgeClasses = Object.fromEntries(Object.entries(badgeParts.variants).map(([name, classes]) => [name, twMerge(badgeParts.base, classes)]));
  await page.evaluate(({ variants: v, surfaces: s }) => {
    const host = document.createElement('div');
    host.id = 'fb-host';
    host.style.cssText = 'position:fixed;inset:0;z-index:99999;overflow:auto;background:var(--paper)';
    for (const [name, classes] of Object.entries(v)) {
      for (const tag of ['span', 'a']) {
        for (const surface of s) {
          const cell = document.createElement('div');
          cell.style.cssText = `background:var(--${surface});padding:12px;display:inline-block`;
          cell.innerHTML = `<${tag} data-slot="badge" data-fb="${name}|${tag}|${surface}" class="${classes}" ${tag === 'a' ? 'href="#fb"' : ''}>Label</${tag}>`;
          host.appendChild(cell);
        }
      }
    }
    document.body.appendChild(host);
  }, { variants: badgeClasses, surfaces });
  for (const mode of MODES) {
    await setTheme(page, mode);
    await page.waitForTimeout(150);
    const rest = await page.evaluate(inPageFilledElements, { selector: '[data-fb]' });
    const hovered = [];
    for (const e of rest) {
      await page.locator(`[data-probe="${e.id}"]`).hover();
      hovered.push(...await page.evaluate(inPageFilledElements, { only: e.id }));
    }
    await page.mouse.move(0, 0);
    BADGES[mode] = [{ state: 'rest', elements: rest }, { state: 'hover', elements: hovered }];
  }
  await page.evaluate(() => document.getElementById('fb-host')?.remove());
  // The legacy primary button (`.btn-primary`, `.gx-btn--primary`) in EVERY page wrapper the stylesheets restyle it in (derived from the
  // rules: sheets.mjs primaryButtonContexts), whether or not the mock data happens to render one there. Every stylesheet the build emitted is
  // loaded, because a route's sheet is only loaded on its route and the wrappers are all drawn here on one page.
  await page.evaluate(() => document.getElementById('fx-host')?.remove());
  const emitted = readdirSync(join(built.dir, 'assets')).filter((n) => n.endsWith('.css'));
  await page.evaluate(async (files) => {
    const have = new Set([...document.styleSheets].map((sheet) => sheet.href).filter(Boolean).map((href) => new URL(href).pathname));
    await Promise.all(files.filter((f) => !have.has(`/app/assets/${f}`)).map((f) => new Promise((resolve, reject) => {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = `/app/assets/${f}`;
      link.onload = resolve;
      link.onerror = () => reject(new Error(`${f} did not load`));
      document.head.appendChild(link);
    })));
  }, emitted);
  FAMILY_CONTEXTS = primaryButtonContexts(flatRules(appSheets()).filter((r) => r.file.startsWith('apps/web/')));
  // `btn` is on every legacy control, `gx-btn` on the workspace's: the class lists a real element carries.
  const classLists = [...new Set(FAMILY_CONTEXTS.subjects.map((cl) => (cl.includes('gx-btn--primary') ? ['gx-btn', ...cl] : cl.includes('btn') ? cl : ['btn', ...cl]).join(' ')))];
  // A wrapper is drawn with the class list the app's own markup gives it (`shelf` is `page shelf`), not the bare name a rule uses.
  const lists = markupClassLists();
  const controls = FAMILY_CONTEXTS.chains.flatMap((chain) => [
    ...classLists.map((cls) => ({ chain, cls, tag: 'button', disabled: false })),
    { chain, cls: 'btn btn-primary', tag: 'a', disabled: false },
    { chain, cls: 'btn btn-primary', tag: 'button', disabled: true },
  ].map((c) => ({ ...c, wrappers: chain.map((classes) => asTheMarkupWritesIt(classes, lists)) })));
  await page.evaluate((list) => {
    const host = document.createElement('div');
    host.id = 'fam-host';
    host.style.cssText = 'position:fixed;inset:0;z-index:99999;overflow:auto;background:var(--paper);display:flex;flex-wrap:wrap;gap:6px;align-content:flex-start';
    list.forEach((c, i) => {
      const inner = `<${c.tag} data-fam="${i}" class="${c.cls}" ${c.tag === 'a' ? 'href="#fam"' : 'type="button"'} ${c.disabled ? 'disabled' : ''}>Label</${c.tag}>`;
      host.insertAdjacentHTML('beforeend', `<div style="padding:4px">${c.wrappers.reduceRight((html, classes) => `<div class="${classes.join(' ')}">${html}</div>`, inner)}</div>`);
    });
    document.body.appendChild(host);
  }, controls);
  for (const mode of MODES) {
    await setTheme(page, mode);
    await page.waitForTimeout(150);
    const rest = await page.evaluate(inPageFilledElements, { selector: '[data-fam]', includeDisabled: true });
    FAMILIES[mode] = [];
    for (const e of rest) {
      const read = e.disabled ? { hover: [], press: [], focus: [] } : await readStates(page, e.id);
      FAMILIES[mode].push({ ...controls[Number(await page.evaluate((id) => document.querySelector(`[data-probe="${id}"]`).getAttribute('data-fam'), e.id))], rest: [e], ...read });
    }
    await page.mouse.move(0, 0);
  }
  await context.close();
});

after(async () => {
  await browser?.close();
  await server?.close();
  built?.remove();
});

/** { base, variants: { name: classes }, size } from the cva() call of a shadcn component (`size` is null where it has none): derived, not listed. */
function cvaParts(src) {
  const base = /cva\(\s*"([^"]+)"/.exec(src)?.[1];
  const block = (key) => {
    const at = src.indexOf(`${key}: {`);
    if (at === -1) return '';
    let depth = 0;
    for (let i = src.indexOf('{', at); i < src.length; i += 1) {
      if (src[i] === '{') depth += 1;
      else if (src[i] === '}' && --depth === 0) return src.slice(src.indexOf('{', at) + 1, i);
    }
    return '';
  };
  const entries = (text) => Object.fromEntries([...text.matchAll(/(?:^|[\s,])["']?([\w-]+)["']?\s*:\s*"([^"]*)"/g)].map((m) => [m[1], m[2]]));
  return { base, variants: entries(block('variant')), size: entries(block('size')).default ?? null };
}

function buttonVariants(src) {
  const parts = cvaParts(src);
  assert.ok(parts.base && Object.keys(parts.variants).length >= 5 && parts.size, 'components/ui/button.tsx no longer reads as a cva() with a base, variants and a default size');
  return parts;
}

/* ------------------------------------------------------------------ the guard can see */

test('the guard has teeth: a label in the wrong ink on the accent is reported, the right one passes, and a currentColor icon is read', async () => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(server.url + '/app/?mock=1', { waitUntil: 'networkidle', timeout: 60_000 });
  await page.addStyleTag({ content: NO_MOTION });
  await page.evaluate(() => {
    const host = document.createElement('div');
    host.style.cssText = 'position:fixed;inset:0;z-index:99999;background:var(--paper)';
    const icon = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14"/></svg>';
    host.innerHTML = [
      `<button id="t-bad" style="background:var(--accent);color:var(--muted)">${icon}Send</button>`,
      `<button id="t-ok" style="background:var(--accent);color:var(--accent-ink)">${icon}Send</button>`,
      `<button id="t-mix" style="background:color-mix(in srgb,var(--accent) 90%,transparent);color:var(--accent-ink)">${icon}Send</button>`,
      '<div id="t-blur" style="backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px)">pane</div><div id="t-clear" style="backdrop-filter:none">pane</div>',
    ].join('');
    document.body.appendChild(host);
  });
  for (const mode of MODES) {
    await setTheme(page, mode);
    await page.waitForTimeout(100);
    const found = await page.evaluate(inPageFilledElements, { targets: TARGETS(mode), tolerance: TOLERANCE, selector: '#t-bad, #t-ok, #t-mix' });
    assert.equal(found.length, 3, `${mode}: the three fixtures were not all found as accent-filled (${found.length})`);
    const lines = failuresOf(found, mode);
    assert.ok(lines.some((l) => /icon path stroke/.test(l)), `${mode}: the icon drawn in --muted on the accent was not reported`);
    assert.ok(lines.some((l) => /text/.test(l)), `${mode}: the label drawn in --muted on the accent was not reported`);
    assert.equal(lines.length, 2, `${mode}: exactly the wrong-ink fixture should fail (its text and its icon), got:\n${lines.join('\n')}`);
  }
  assert.equal((await page.evaluate(inPageBackdropFilters, '#t-blur')).length, 1, 'a frosted pane (backdrop-filter: blur) was not reported');
  assert.equal((await page.evaluate(inPageBackdropFilters, '#t-clear')).length, 0, 'an unfiltered element was reported as frosted');
  await context.close();
  // The arithmetic: black text at half alpha on white is a mid grey, not black.
  assert.ok(drawnRatio([0, 0, 0, 0.5], [255, 255, 255]) < 5.5 && drawnRatio([0, 0, 0, 1], [255, 255, 255]) > 20, 'the alpha of a drawn foreground is not laid over its fill');
});

test('the guard has teeth: a ring at 37% of the accent is reported, a missing ring is reported, and the solid accent passes', async () => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(server.url + '/app/?mock=1', { waitUntil: 'networkidle', timeout: 60_000 });
  await page.addStyleTag({ content: NO_MOTION });
  await page.evaluate(() => {
    const style = document.createElement('style');
    style.textContent = [
      '#k-weak:focus-visible{outline:2px solid color-mix(in srgb,var(--accent) 37.5%,transparent)}',
      '#k-none:focus-visible{outline:none;box-shadow:none}',
      '#k-ok:focus-visible{outline:2px solid var(--accent);outline-offset:2px}',
      '#k-tw:focus-visible{outline:none;box-shadow:0 0 0 3px color-mix(in srgb,var(--accent-ring) 50%,transparent)}',
    ].join('');
    document.head.appendChild(style);
    const host = document.createElement('div');
    host.style.cssText = 'position:fixed;inset:0;z-index:99999;background:var(--surface-2);padding:24px';
    host.innerHTML = ['k-start', 'k-weak', 'k-none', 'k-ok', 'k-tw'].map((id) => `<button id="${id}" type="button" style="margin:12px;background:transparent">${id}</button>`).join('');
    document.body.appendChild(host);
  });
  for (const mode of MODES) {
    await setTheme(page, mode);
    await page.waitForTimeout(100);
    await page.evaluate(inPageRememberRest);
    await page.evaluate(() => document.getElementById('k-start').focus());
    const got = {};
    for (let i = 0; i < 4; i += 1) {
      await page.keyboard.press('Tab');
      const f = await page.evaluate(inPageFocusIndicator);
      got[await page.evaluate(() => document.activeElement.id)] = f;
    }
    assert.ok(got['k-weak'].best && got['k-weak'].best.ratio < RING, `${mode}: a 37.5% accent outline was not reported (${got['k-weak'].best?.ratio})`);
    assert.equal(got['k-none'].best, null, `${mode}: a control with no ring was given one`);
    assert.ok(got['k-ok'].best.ratio >= RING, `${mode}: the solid accent outline was not passed (${got['k-ok'].best.ratio})`);
    assert.ok(got['k-tw'].best && got['k-tw'].best.kind === 'own ring' && got['k-tw'].best.ratio < RING, `${mode}: Tailwind's half-strength ring (a box-shadow) was not read as a ring under ${RING}:1`);
  }
  await context.close();
});

test('the guard has teeth: a ring inside a faded card is reported, by the model of the cascade and by the pixels, and the same ring in a card that is not faded passes', async () => {
  const context = await browser.newContext({ viewport: { width: 900, height: 600 } });
  const page = await context.newPage();
  await page.goto(server.url + '/app/?mock=1', { waitUntil: 'networkidle', timeout: 60_000 });
  await page.addStyleTag({ content: NO_MOTION });
  await page.evaluate(() => {
    const style = document.createElement('style');
    style.textContent = '.d-btn{display:block;width:120px;height:40px;border:0;background:transparent;outline:none;color:var(--ink)} .d-btn:focus-visible{box-shadow:0 0 0 3px var(--accent)}';
    document.head.appendChild(style);
    const host = document.createElement('div');
    host.id = 'd-host';
    host.style.cssText = 'position:fixed;inset:0;z-index:99999;background:var(--surface-2);padding:40px';
    host.innerHTML = [['d-dim', 0.4], ['d-full', 1]].map(([id, o]) => `<div id="${id}" style="opacity:${o};background:var(--surface);padding:16px;margin-bottom:24px;width:160px"><button id="${id}-b" class="d-btn" type="button">${id}</button></div>`).join('');
    document.body.appendChild(host);
  });
  for (const mode of MODES) {
    await setTheme(page, mode);
    await page.waitForTimeout(100);
    await page.evaluate(inPageRememberRest);
    const read = {};
    for (const id of ['d-dim', 'd-full']) {
      const box = await page.locator(`#${id}`).boundingBox();
      const clip = { x: box.x - 10, y: box.y - 10, width: box.width + 20, height: box.height + 20 };
      await page.evaluate(() => document.activeElement?.blur());
      const before = (await page.screenshot({ clip })).toString('base64');
      await page.evaluate((i) => document.getElementById(i).focus({ focusVisible: true }), `${id}-b`);
      const model = await page.evaluate(inPageFocusIndicator);
      const after = (await page.screenshot({ clip })).toString('base64');
      read[id] = { model, pixels: await page.evaluate(inPageRingPixels, { before, after }) };
    }
    assert.ok(read['d-dim'].model.best && read['d-dim'].model.best.ratio < RING, `${mode}: a ring inside a card at opacity .4 was not reported by the model (${read['d-dim'].model.best?.ratio})`);
    assert.ok(Math.abs(read['d-dim'].model.cum - 0.4) < 0.01, `${mode}: the stop does not report the card's opacity (${read['d-dim'].model.cum})`);
    assert.ok(read['d-dim'].pixels.best && read['d-dim'].pixels.best.ratio < RING, `${mode}: a ring inside a card at opacity .4 was not reported by the pixels (${read['d-dim'].pixels.best?.ratio})`);
    assert.ok(read['d-full'].model.best.ratio >= RING && read['d-full'].pixels.best.ratio >= RING, `${mode}: the same ring in a card at full opacity was failed (model ${read['d-full'].model.best?.ratio}, pixels ${read['d-full'].pixels.best?.ratio})`);
    // The model and the pixels agree to within a rounding error, which is what makes the model trustworthy on the stops that are not read as pixels.
    for (const id of ['d-dim', 'd-full']) assert.ok(Math.abs(read[id].model.best.ratio - read[id].pixels.best.ratio) < 0.35, `${mode}: ${id}: the model says ${read[id].model.best.ratio.toFixed(2)}:1 and the pixels say ${read[id].pixels.best.ratio.toFixed(2)}:1`);
  }
  await context.close();
});

test('the guard has teeth: a label that goes wrong only when hovered, only when pressed or only when focused is reported in that state alone, and a control that leaves the accent is read on the fill it moved to', async () => {
  const context = await browser.newContext({ viewport: { width: 900, height: 600 } });
  const page = await context.newPage();
  await page.goto(server.url + '/app/?mock=1', { waitUntil: 'networkidle', timeout: 60_000 });
  await page.addStyleTag({ content: NO_MOTION });
  await page.evaluate(() => {
    const style = document.createElement('style');
    // The ids in front make these outrank the app's own `button:hover` (0,3,1), so what is read is what the fixture says.
    style.textContent = [
      '#s-host .s-btn{display:block;margin:10px;background:var(--accent);color:var(--accent-ink);border:0;padding:10px 16px}',
      '#s-host #s-hov:hover{color:var(--ink)} #s-host #s-act:active{color:var(--ink)} #s-host #s-foc:focus-visible{color:var(--ink)}',
      '#s-host #s-leave:hover{background:var(--surface-3)}',
    ].join('');
    document.head.appendChild(style);
    const host = document.createElement('div');
    host.id = 's-host';
    host.style.cssText = 'position:fixed;inset:0;z-index:99999;background:var(--paper)';
    host.innerHTML = ['s-ok', 's-hov', 's-act', 's-foc', 's-leave'].map((id) => `<button id="${id}" class="s-btn" type="button">Label</button>`).join('');
    document.body.appendChild(host);
  });
  for (const mode of MODES) {
    await setTheme(page, mode);
    await page.waitForTimeout(100);
    const rest = await page.evaluate(inPageFilledElements, { targets: TARGETS(mode), tolerance: TOLERANCE, selector: '.s-btn' });
    assert.equal(rest.length, 5, `${mode}: the five fixtures were not all found as accent-filled`);
    assert.equal(failuresOf(rest, mode).length, 0, `${mode}: a fixture is wrong at rest`);
    const failing = {};
    for (const e of rest) {
      const id = await page.evaluate((probe) => document.querySelector(`[data-probe="${probe}"]`).id, e.id);
      const read = await readStates(page, e.id);
      failing[id] = Object.fromEntries(Object.entries(read).map(([state, els]) => [state, failuresOf(els, state).length > 0]));
      assert.ok(read.hover[0].states.hover && read.press[0].states.active && read.focus[0].states.focus, `${mode}: ${id}: a state was not reached (${JSON.stringify([read.hover[0].states, read.press[0].states, read.focus[0].states])})`);
    }
    assert.deepEqual(failing['s-ok'], { hover: false, press: false, focus: false }, `${mode}: a control that never goes wrong was failed`);
    assert.equal(failing['s-hov'].hover, true, `${mode}: a label that is wrong only under the pointer was not reported`);
    assert.equal(failing['s-act'].press, true, `${mode}: a label that is wrong only while pressed was not reported`);
    assert.equal(failing['s-foc'].focus, true, `${mode}: a label that is wrong only when focused was not reported`);
    assert.equal(failing['s-leave'].hover, true, `${mode}: a control that leaves the accent on hover was dropped instead of being read on its new fill`);
    // And each state is its own: the wrong colour of one state is not reported in the others. (A press holds the pointer on the control,
    // so a defect that is there under the pointer is still there while pressed; that is the one overlap, and it is not asserted.)
    assert.deepEqual([failing['s-hov'].focus, failing['s-act'].hover, failing['s-act'].focus, failing['s-foc'].hover, failing['s-foc'].press], [false, false, false, false, false], `${mode}: a state's defect leaked into another state`);
  }
  await context.close();
});

/* ------------------------------------------------------------------ 1. every accent fill, as drawn */

for (const mode of MODES) {
  test(`${mode}: every control the browser paints with the accent draws its text at 4.5:1 and its icons at 3:1, at rest, disabled, under the pointer, pressed and focused`, () => {
    const drawn = (state) => DRAWN[mode].filter((v) => v.state === state);
    const elements = DRAWN[mode].flatMap((v) => v.elements);
    const rest = drawn('rest').flatMap((v) => v.elements);
    // The floors: a scan that found nothing reports a perfect app. These are CANARIES, named because each is a control
    // this defect hid in: the composer's Send arrow, and the roadmap map's Build button.
    assert.ok(rest.length >= 10, `${mode}: only ${rest.length} accent-filled elements were drawn across ${ROUTES.length} routes; the scan has drifted`);
    for (const state of ['hover', 'press', 'focus']) {
      const n = drawn(state).flatMap((v) => v.elements).length;
      assert.ok(n >= 8, `${mode}: only ${n} accent-filled elements were measured ${state === 'hover' ? 'under the pointer' : state === 'press' ? 'pressed' : 'focused'}`);
    }
    for (const route of ROUTES) assert.ok(DRAWN[mode].filter((v) => v.route === route.name && v.state !== 'disabled').length === 4, `${route.name} was not drawn in every state`);
    assert.ok(rest.some((e) => e.name === 'Send' && e.foreground.some((f) => f.kind === 'icon')), `${mode}: the composer's Send button (with its arrow) was not found filled with the accent`);
    assert.ok(DRAWN[mode].find((v) => v.route === 'roadmap map' && v.state === 'rest').elements.some((e) => e.name === 'Build'), `${mode}: the roadmap map's Build button was not found filled with the accent`);
    assert.ok(elements.filter((e) => e.foreground.some((f) => f.kind === 'text')).length >= 8, `${mode}: too few accent-filled elements carry text`);
    assert.ok(elements.filter((e) => e.foreground.some((f) => f.kind === 'icon')).length >= 3, `${mode}: too few accent-filled elements carry an icon`);
    // THE SIGN-IN PAGES, where the defect was: the submit is found filled with the accent on every signed-out route and measured in EVERY state.
    assert.ok(ROUTES.filter((r) => r.guest).length >= 5, `${mode}: only ${ROUTES.filter((r) => r.guest).length} signed-out routes are drawn; the sign-in pages are the ones this guard exists for`);
    for (const route of ROUTES.filter((r) => r.guest)) {
      for (const state of ['rest', 'hover', 'press', 'focus']) {
        const found = DRAWN[mode].find((v) => v.route === route.name && v.state === state).elements.filter((e) => /\bbtn-primary\b/.test(e.cls) && e.foreground.some((f) => f.kind === 'text'));
        assert.ok(found.length >= 1, `${mode}: the primary button of ${route.name} was not measured ${state}`);
      }
    }
    for (const route of ROUTES.filter((r) => r.fill)) assert.ok(DRAWN[mode].find((v) => v.route === route.name && v.state === 'disabled').elements.length >= 1, `${mode}: the disabled submit of ${route.name} was not measured`);
    // A STATE THAT WAS NEVER REACHED IS NOT A CLEAN READ: each hover read is of a hovered element, each press of an :active one, each focus of a :focus-visible one.
    const unreached = [['hover', 'hover'], ['press', 'active'], ['focus', 'focus']].flatMap(([state, flag]) => drawn(state).flatMap((v) => v.elements.filter((e) => !e.states[flag]).map((e) => `${v.route} ${state} <${e.tag} class="${e.cls}"> "${e.name}"`)));
    assert.deepEqual(unreached, [], `${mode}: a state was read on an element the browser did not report in it:\n  ${unreached.join('\n  ')}`);
    // A pair in a faded card is drawn lighter than the pair these reads see.
    const faded = DRAWN[mode].flatMap((v) => v.elements.filter((e) => e.dimmed < 0.99).map((e) => `${v.route} (${v.state}) <${e.tag} class="${e.cls}"> "${e.name}" inside opacity ${e.dimmed.toFixed(2)}`));
    assert.deepEqual(faded, [], `${mode}: an accent control sits inside a faded ancestor, so its pair is not what is drawn:\n  ${faded.join('\n  ')}`);
    const bad = DRAWN[mode].flatMap((v) => failuresOf(v.elements, `${v.route} (${v.state})`));
    assert.deepEqual([...new Set(bad)], [], `${mode}: a control on the accent draws a pair under the bar:\n  ${[...new Set(bad)].join('\n  ')}`);
  });

  test(`${mode}: every variant of the shadcn Button is readable on each of the five surfaces, at rest and under the pointer`, () => {
    const all = VARIANTS[mode].flatMap((v) => v.elements.map((e) => ({ ...e, state: v.state })));
    const names = new Set(all.map((e) => e.fx.split('|')[0]));
    assert.ok(all.length >= 5 * 6 * 2, `${mode}: only ${all.length} variant fixtures measured`);
    assert.ok(names.size >= 5, `${mode}: only ${names.size} distinct variants were drawn`);
    assert.ok(all.every((e) => e.foreground.some((f) => f.kind === 'text') && e.foreground.some((f) => f.kind === 'icon')), `${mode}: a fixture drew no text or no icon`);
    const bad = all.flatMap((e) => failuresOf([e], `${e.fx} ${e.state}`));
    assert.deepEqual([...new Set(bad)], [], `${mode}: a Button variant draws a pair under the bar:\n  ${[...new Set(bad)].join('\n  ')}`);
  });

  test(`${mode}: every variant of the shadcn Badge, as a span and as a link, is readable on each of the five surfaces, at rest and under the pointer`, () => {
    const all = BADGES[mode].flatMap((v) => v.elements.map((e) => ({ ...e, state: v.state })));
    const variants = new Set(all.map((e) => e.fx.split('|')[0]));
    assert.ok(all.length >= 4 * 2 * 5 * 2, `${mode}: only ${all.length} badge fixtures measured`);
    assert.ok(variants.size >= 4, `${mode}: only ${variants.size} Badge variants were drawn`);
    assert.ok(all.every((e) => e.foreground.some((f) => f.kind === 'text')), `${mode}: a badge fixture drew no text`);
    assert.ok(all.some((e) => e.tag === 'a' && e.state === 'hover') && all.some((e) => e.tag === 'span' && e.state === 'hover'), `${mode}: the link and span forms were not both hovered`);
    const bad = all.flatMap((e) => failuresOf([e], `badge ${e.fx} ${e.state}`));
    assert.deepEqual([...new Set(bad)], [], `${mode}: a Badge variant draws a pair under the bar:\n  ${[...new Set(bad)].join('\n  ')}`);
  });

  test(`${mode}: the legacy primary button reads in every state in every page wrapper the stylesheets restyle it in`, () => {
    const all = FAMILIES[mode];
    const where = (f) => f.chain.map((c) => c.join('.')).join(' ') || '(no wrapper)';
    // CANARIES: the contexts were derived and each was drawn; the wrappers the sign-in, Usage and Settings pages use are among them.
    const chains = new Set(all.map(where));
    assert.ok(chains.size >= 6, `${mode}: only ${chains.size} page wrappers were derived from the stylesheets (${[...chains].join(' | ')}); the derivation has drifted`);
    for (const must of ['auth-page auth-card', 'usage-page', 'settings-page', 'shelf']) assert.ok(chains.has(must), `${mode}: the wrapper ${must} was not derived (${[...chains].join(' | ')})`);
    assert.ok(all.length >= chains.size * 3, `${mode}: only ${all.length} controls were drawn`);
    assert.ok(all.every((f) => f.rest.length === 1), `${mode}: a control was not found drawn (not visible, or no box)`);
    assert.ok(all.some((f) => f.tag === 'a') && all.some((f) => f.disabled) && all.some((f) => /gx-btn--primary/.test(f.cls)) && all.some((f) => /btn-block/.test(f.cls)), `${mode}: a tag, a disabled twin, the workspace class or the block class was not drawn`);
    const live = all.filter((f) => !f.disabled);
    for (const [state, flag] of [['hover', 'hover'], ['press', 'active'], ['focus', 'focus']]) {
      const unreached = live.filter((f) => f[state].length !== 1 || !f[state][0].states[flag]).map((f) => `${where(f)} <${f.tag} class="${f.cls}"> ${state}`);
      assert.deepEqual(unreached, [], `${mode}: a state was not reached:\n  ${unreached.join('\n  ')}`);
    }
    // A disabled control is an inactive one (WCAG 1.4.3 does not ask it to read), but where it KEEPS the accent fill the label it keeps on it is
    // read, undimmed: a disabled button whose label went to the wrong ink would say so. Where the page repaints a disabled primary as an
    // outline (the shelf) it no longer has the fill, and is not read.
    const keepsFill = (e) => TARGETS(mode).some((t) => [0, 1, 2].every((i) => Math.abs(t.rgb[i] - e.fill[i]) <= TOLERANCE));
    const disabledKept = all.filter((f) => f.disabled && f.rest.some(keepsFill));
    assert.ok(disabledKept.length >= 1 && disabledKept.length < all.filter((f) => f.disabled).length, `${mode}: ${disabledKept.length} of ${all.filter((f) => f.disabled).length} disabled primaries keep the fill; the read of the disabled state has drifted`);
    const bad = all.flatMap((f) => ['rest', 'hover', 'press', 'focus'].flatMap((state) => failuresOf(f[state].filter((e) => !e.disabled || keepsFill(e)), `${where(f)} ${state}${f.disabled ? ' (disabled)' : ''}`)));
    assert.deepEqual([...new Set(bad)], [], `${mode}: a legacy primary button draws a pair under the bar:\n  ${[...new Set(bad)].join('\n  ')}`);
  });

  test(`${mode}: tabbing to any control draws a focus indicator that reaches ${RING}:1 against the surface behind it`, () => {
    const stops = FOCUS[mode].flatMap((r) => r.stops.map((s) => ({ ...s, route: r.route })));
    // A tab walk that found a few stops reports a perfect app. These are CANARIES: the composer's Send (a ring-only
    // shadcn Button), and a browser-drawn outline (the code block's Copy Code, which has no ring of its own).
    assert.ok(stops.length >= 80, `${mode}: only ${stops.length} focus stops were reached across ${ROUTES.length} routes; the walk has drifted`);
    assert.ok(stops.some((s) => /"Send"/.test(s.who)), `${mode}: the composer's Send button was never tabbed to`);
    assert.ok(stops.some((s) => /"Copy Code"/.test(s.who) && s.indicators.some((i) => i.kind === 'own outline')), `${mode}: Copy Code (a browser-drawn outline) was never tabbed to`);
    assert.ok(stops.filter((s) => s.indicators.some((i) => i.kind === 'own ring')).length >= 5, `${mode}: too few ring-drawn stops; the ring reader is blind`);
    const bad = stops.filter((s) => !s.best || s.best.ratio < RING).map((s) => `${s.route}: ${s.who}  ${s.best ? `best ${s.best.kind} ${s.best.ratio.toFixed(2)}:1` : 'no indicator'}  [${s.indicators.map((i) => `${i.kind} ${i.width} ${i.ratio.toFixed(2)}`).join('; ')}]`);
    assert.deepEqual([...new Set(bad)], [], `${mode}: a control is tabbed to and draws no ring (or one under ${RING}:1):\n  ${[...new Set(bad)].join('\n  ')}`);
  });

  test(`${mode}: every Button variant draws a focus ring of ${RING}:1 or better on each of the five surfaces`, () => {
    const stops = VARIANT_FOCUS[mode];
    assert.ok(stops.length >= 5 * 5, `${mode}: only ${stops.length} variant fixtures were tabbed to`);
    assert.ok(new Set(stops.map((s) => s.fx.split('|')[1])).size === 5, `${mode}: not all five surfaces were drawn`);
    const bad = stops.filter((s) => !s.best || s.best.ratio < RING).map((s) => `${s.fx}: ${s.best ? `best ${s.best.kind} ${s.best.ratio.toFixed(2)}:1` : 'no indicator'}  [${s.indicators.map((i) => `${i.kind} ${i.width} ${i.ratio.toFixed(2)}`).join('; ')}]`);
    assert.deepEqual(bad, [], `${mode}: a Button variant is tabbed to and draws a ring under ${RING}:1 on its surface:\n  ${bad.join('\n  ')}`);
  });

  test(`${mode}: every node of the roadmap map, faded or not, draws its focus ring as pixels at ${RING}:1 or better`, () => {
    const nodes = NODE_RINGS[mode];
    // CANARIES: the map was drawn, some nodes were faded when the focus arrived (the state this defect lived in), some were not.
    assert.ok(nodes.length >= 5, `${mode}: only ${nodes.length} map nodes were focused; the map has drifted`);
    assert.ok(nodes.some((n) => n.dimmedAtRest), `${mode}: no node was faded before its focus arrived, so this never met a dimmed card`);
    assert.ok(nodes.some((n) => !n.dimmedAtRest), `${mode}: every node was faded; the selected one is not read`);
    const unread = nodes.filter((n) => n.error || n.moved || !n.focusVisible).map((n) => `${n.who}: ${n.error ?? (n.moved ? 'the card moved when focused, so the two clips compare nothing' : 'the focus was not :focus-visible')}`);
    assert.deepEqual(unread, [], `${mode}: a node's ring could not be read:\n  ${unread.join('\n  ')}`);
    const bad = nodes.filter((n) => n.changed < 24 || !n.best || n.best.ratio < RING).map((n) => `${n.who}${n.dimmedAtRest ? ' (faded)' : ''}: ${n.changed} pixels changed, ${n.best ? `the ring reads ${n.best.ratio.toFixed(2)}:1 (rgb(${n.best.ring.join(', ')}) over rgb(${n.best.replaced.join(', ')}))` : 'no ring-shaped group'}`);
    assert.deepEqual(bad, [], `${mode}: a roadmap node is focused and the browser draws a ring under ${RING}:1 (or none):\n  ${bad.join('\n  ')}`);
  });
}

/* ------------------------------------------------------------------ flat: nothing is drawn through a frosted pane */

test('no element on any route is drawn with a backdrop filter, and an element that carries a backdrop-blur utility is not either', () => {
  assert.equal(BLURS.length, ROUTES.length, 'not every route was scanned for a backdrop filter');
  const drawn = BLURS.flatMap((b) => b.blurred.map((x) => `${b.route}: ${x}`));
  assert.deepEqual(drawn, [], `a frosted pane is drawn:\n  ${drawn.join('\n  ')}`);
  // The scan could see one: the fixture carries the utility the vendored attachments file ships, and it must come back unblurred.
  assert.deepEqual(FIXTURE_BLURS, [], `an element with a backdrop-blur utility is drawn blurred:\n  ${FIXTURE_BLURS.join('\n  ')}`);
});

/* ------------------------------------------------------------------ the cause, held directly */

/**
 * An unlayered rule beats a layered one whatever the specificity, and the AI Elements and shadcn components
 * draw with Tailwind utilities in `@layer utilities`. So a rule written for a bare form control
 * (`button { color: inherit }`) must stay OUT of those surfaces, by the zero-specificity scope the rest of
 * the element rules wear (`:where(:not(.aie, .aie *, [data-slot], [data-slot] *))`). The scope is the
 * property; this holds that no bare form-element rule sets a colour without it.
 */
test('no bare form-control rule sets a colour outside the zero-specificity scope that keeps it off the Tailwind surfaces', () => {
  const FORM = /^(?:button|input|select|textarea|a)\b/;
  const rules = flatRules(appSheets()).filter((r) => r.file.startsWith('apps/web/'));
  assert.ok(rules.length > 2000, `only ${rules.length} web rules read; the parse has drifted`);
  const bare = [];
  let scoped = 0;
  for (const r of rules) {
    if (!/(?:^|[;\s])(?:color|background-color|border-color)\s*:/.test(r.body)) continue;
    for (const part of splitTop(r.selector)) {
      const subject = part.trim().split(/[\s>+~]+(?![^()]*\))/).pop();
      const bareSubject = FORM.test(subject) && !/[.#]/.test(subject.replace(/:where\(:not\([^)]*\)\)/g, '').replace(/\([^()]*\)/g, ''));
      if (!bareSubject || part.trim() !== subject) continue;
      if (/:where\(:not\(\.aie,/.test(part)) scoped += 1;
      else bare.push(`${r.file}: ${part.slice(0, 80)}`);
    }
  }
  assert.ok(scoped >= 5, `only ${scoped} scoped element rules found; the scope match has drifted`);
  assert.deepEqual(bare, [], `a bare form-control rule sets a colour and would beat every Tailwind utility on the shadcn surfaces:\n  ${bare.join('\n  ')}`);
});
