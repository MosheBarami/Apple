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
 * So this file builds apps/web (tests/built-web.mjs), opens it in Chromium on the fixture data, and for
 * every element the browser paints with the accent (or its hover step) reads what the browser drew for its
 * text and its icons (`currentColor` strokes included), at rest and under the pointer, in both themes:
 *
 *   - text is 4.5:1 or better on the fill it sits on (WCAG 1.4.3), an icon 3:1 (1.4.11);
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
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { rgbOfHex, splitTop, theme, themeBlocks, surfacesOf } from './css-tokens.mjs';
import { buildMockWeb, launchChromium, serveApp } from './tests/built-web.mjs';
import { BAR, drawnRatio, failuresOf, inPageFilledElements } from './tests/probes.mjs';
import { ROOT } from './tests/repo-walk.mjs';
import { appSheets, flatRules } from './tests/sheets.mjs';

const MODES = ['dark', 'light'];
const THEMES = Object.fromEntries(MODES.map((m) => [m, theme(themeBlocks()[m])]));
/** What the browser must find painted with the accent: the accent, its hover step, and a 90% mix over a surface (Tailwind's `hover:bg-primary/90`). */
const TARGETS = (mode) => ['accent', 'accent-strong'].map((n) => ({ name: n, rgb: rgbOfHex(THEMES[mode].resolve(n)) }));
const TOLERANCE = 24;

/** The mock project's routes. Each setup puts the page in the state in which its accent control is drawn. */
const ROUTES = [
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
/** mode -> [{ route, state, elements }] */
const DRAWN = { dark: [], light: [] };
const VARIANTS = { dark: [], light: [] };

const NO_MOTION = '*,*::before,*::after{transition:none!important;animation:none!important}';
const setTheme = (page, mode) => page.evaluate((m) => { document.documentElement.dataset.theme = m; }, mode);

before(async () => {
  built = buildMockWeb();
  server = await serveApp(built.dir);
  browser = await launchChromium();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  for (const route of ROUTES) {
    await page.goto(server.url + route.path, { waitUntil: 'networkidle', timeout: 60_000 });
    await page.addStyleTag({ content: NO_MOTION });
    await page.waitForTimeout(700);
    if (route.setup) await route.setup(page);
    for (const mode of MODES) {
      await setTheme(page, mode);
      await page.waitForTimeout(150);
      const targets = TARGETS(mode);
      const rest = await page.evaluate(inPageFilledElements, { targets, tolerance: TOLERANCE });
      DRAWN[mode].push({ route: route.name, state: 'rest', elements: rest });
      // Under the pointer: the hover step of the same elements (one per distinct control).
      const seen = new Set();
      const hovered = [];
      for (const e of rest) {
        const key = `${e.tag}|${e.cls}|${e.name}`;
        if (seen.has(key) || seen.size >= 24) continue;
        seen.add(key);
        try {
          await page.locator(`[data-probe="${e.id}"]`).hover({ timeout: 1500 });
        } catch { continue; }
        hovered.push(...await page.evaluate(inPageFilledElements, { targets, tolerance: TOLERANCE, only: e.id }));
      }
      await page.mouse.move(0, 0);
      DRAWN[mode].push({ route: route.name, state: 'hover', elements: hovered });
    }
  }
  // The shadcn Button, every variant, drawn on each surface: at rest and hovered.
  await page.goto(server.url + '/app/?mock=1', { waitUntil: 'networkidle', timeout: 60_000 });
  await page.addStyleTag({ content: NO_MOTION });
  const { base, variants, size } = buttonVariants(readFileSync(join(ROOT, 'apps/web/src/components/ui/button.tsx'), 'utf8'));
  const surfaces = Object.keys(surfacesOf(THEMES.dark));
  await page.evaluate(({ base: b, variants: v, size: sz, surfaces: s }) => {
    const host = document.createElement('div');
    host.id = 'fx-host';
    host.style.cssText = 'position:fixed;inset:0;z-index:99999;overflow:auto;background:var(--paper)';
    const icon = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>';
    for (const [name, classes] of Object.entries(v)) {
      for (const surface of s) {
        const cell = document.createElement('div');
        cell.style.cssText = `background:var(--${surface});padding:12px;display:inline-block`;
        cell.innerHTML = `<button type="button" data-slot="button" data-fx="${name}|${surface}" class="${b} ${classes} ${sz}">${icon}Label</button>`;
        host.appendChild(cell);
      }
    }
    document.body.appendChild(host);
  }, { base, variants, size, surfaces });
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
  }
  await context.close();
});

after(async () => {
  await browser?.close();
  await server?.close();
  built?.remove();
});

/** { base, variants: { name: classes }, size } from the cva() call of components/ui/button.tsx: derived, not listed. */
function buttonVariants(src) {
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
  const variants = entries(block('variant'));
  const size = entries(block('size')).default;
  assert.ok(base && Object.keys(variants).length >= 5 && size, 'components/ui/button.tsx no longer reads as a cva() with a base, variants and a default size');
  return { base, variants, size };
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
  await context.close();
  // The arithmetic: black text at half alpha on white is a mid grey, not black.
  assert.ok(drawnRatio([0, 0, 0, 0.5], [255, 255, 255]) < 5.5 && drawnRatio([0, 0, 0, 1], [255, 255, 255]) > 20, 'the alpha of a drawn foreground is not laid over its fill');
});

/* ------------------------------------------------------------------ 1. every accent fill, as drawn */

for (const mode of MODES) {
  test(`${mode}: every control the browser paints with the accent draws its text at 4.5:1 and its icons at 3:1, at rest and under the pointer`, () => {
    const elements = DRAWN[mode].flatMap((v) => v.elements);
    const rest = DRAWN[mode].filter((v) => v.state === 'rest').flatMap((v) => v.elements);
    const hovered = DRAWN[mode].filter((v) => v.state === 'hover').flatMap((v) => v.elements);
    // The floors: a scan that found nothing reports a perfect app. These are CANARIES, named because each is a control
    // this defect hid in: the composer's Send arrow, and the roadmap map's Build button.
    assert.ok(rest.length >= 10, `${mode}: only ${rest.length} accent-filled elements were drawn across ${ROUTES.length} routes; the scan has drifted`);
    assert.ok(hovered.length >= 4, `${mode}: only ${hovered.length} accent-filled elements were measured under the pointer`);
    for (const route of ROUTES) assert.ok(DRAWN[mode].filter((v) => v.route === route.name).length === 2, `${route.name} was not drawn`);
    assert.ok(rest.some((e) => e.name === 'Send' && e.foreground.some((f) => f.kind === 'icon')), `${mode}: the composer's Send button (with its arrow) was not found filled with the accent`);
    assert.ok(DRAWN[mode].find((v) => v.route === 'roadmap map' && v.state === 'rest').elements.some((e) => e.name === 'Build'), `${mode}: the roadmap map's Build button was not found filled with the accent`);
    assert.ok(elements.filter((e) => e.foreground.some((f) => f.kind === 'text')).length >= 8, `${mode}: too few accent-filled elements carry text`);
    assert.ok(elements.filter((e) => e.foreground.some((f) => f.kind === 'icon')).length >= 3, `${mode}: too few accent-filled elements carry an icon`);
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
}

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
