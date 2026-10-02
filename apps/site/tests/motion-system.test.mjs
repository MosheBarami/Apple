/**
 * THE MOTION SYSTEM IS ONE SYSTEM: the same scale on the site and in the app, and every piece of it has an
 * off switch (2026-10-02, "Ember Rail" round 2, track C).
 *
 * What it holds, each as something a stylesheet can be checked for, and one thing a browser can:
 *
 *   * the durations, the easings, the rise and the stagger are declared once in the site's token
 *     sheet and carry the SAME values in the app's, so a card that lifts on the landing lifts at the
 *     same speed in the dashboard;
 *   * a page change is a cross-document view transition behind prefers-reduced-motion: no-preference,
 *     with the sticky header named so it stays put, and no browser default is left running under
 *     reduce;
 *   * buttons, cards and examples answer a press and a hover (the `.lift` card, `.btn:active`);
 *   * the skeleton is one primitive in both sheets, sized by its caller, and holds still under reduce;
 *   * the skip link is hidden by clipping, never by being moved off-screen (a full-page capture
 *     painted it mid-page);
 *   * every animation that loops or moves is either inside a no-preference guard or killed by the
 *     shared reduce rule.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SITE = join(dirname(fileURLToPath(import.meta.url)), '..');
const strip = (css) => css.replace(/\/\*[\s\S]*?\*\//g, ' ');
const SITE_CSS = strip(readFileSync(join(SITE, 'src', 'styles', 'apple-minimal.css'), 'utf8'));
const APP_CSS = strip(readFileSync(join(SITE, '..', 'web', 'src', 'design', 'apple-minimal.css'), 'utf8'));
const NAV = readFileSync(join(SITE, 'src', 'components', 'Nav.astro'), 'utf8');

const token = (css, name) => {
  const m = new RegExp(`--${name}\\s*:\\s*([^;]+);`).exec(css);
  return m ? m[1].replace(/\s+/g, '').toLowerCase().replace(/\b0\./g, '.') : null;
};

test('the motion scale is declared on the site and carries the same values in the app', () => {
  for (const name of ['dur-1', 'dur-2', 'dur-3', 'dur-4', 'ease-out', 'ease-in-out', 'ease-snap', 'ease-enter', 'rise', 'stagger']) {
    const site = token(SITE_CSS, name);
    const app = token(APP_CSS, name);
    assert.ok(site, `--${name} is not declared on the site`);
    assert.ok(app, `--${name} is not declared in the app`);
    assert.equal(app, site, `--${name} is ${site} on the site and ${app} in the app`);
  }
  assert.equal(token(SITE_CSS, 'dur-1'), '90ms');
  assert.equal(token(SITE_CSS, 'dur-4'), '420ms');
  assert.equal(token(SITE_CSS, 'rise'), '8px');
});

test('page changes are cross-document view transitions, guarded by no-preference, with the header named', () => {
  const at = SITE_CSS.search(/@media\s*\(prefers-reduced-motion:\s*no-preference\)\s*\{\s*@view-transition\s*\{\s*navigation:\s*auto/);
  assert.ok(at > -1, '@view-transition { navigation: auto } is missing or not inside a no-preference guard');
  assert.match(SITE_CSS, /::view-transition-old\(root\)\s*\{[^}]*animation:\s*vt-out/);
  assert.match(SITE_CSS, /::view-transition-new\(root\)\s*\{[^}]*animation:\s*vt-in/);
  assert.match(NAV, /view-transition-name:\s*site-nav/, 'the sticky header is not named, so it cross-fades with the page under it');
});

test('the app\'s same-document transitions are guarded both ways, and its links ask for them', () => {
  assert.match(APP_CSS, /@media\s*\(prefers-reduced-motion:\s*no-preference\)\s*\{[^@]*::view-transition-old\(root\)/);
  assert.match(APP_CSS, /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{[^@]*::view-transition-group\(\*\)[^@]*animation:\s*none\s*!important/,
    'the browser\'s default 250ms view-transition cross-fade is not switched off under reduce');
  const layout = readFileSync(join(SITE, '..', 'web', 'src', 'components', 'layout.tsx'), 'utf8');
  assert.ok((layout.match(/viewTransition/g) ?? []).length >= 4, 'the dock links do not ask for view transitions');
});

test('buttons, cards and examples answer a press and a hover', () => {
  assert.match(SITE_CSS, /\.btn:not\(\.btn-primary\):active:not\([^)]*\)\s*\{[^}]*transform:\s*translateY\(1px\)/);
  assert.match(SITE_CSS, /\.btn-primary:active\s*\{[^}]*translateY\(2px\)/);
  assert.match(SITE_CSS, /@media\s*\(hover:\s*hover\)\s*\{\s*\.lift:hover\s*\{[^}]*translateY\(-2px\)[^}]*box-shadow:\s*0 2px 0/);
  const page = readFileSync(join(SITE, 'src', 'pages', 'index.astro'), 'utf8');
  assert.ok((page.match(/class="[^"]*\blift\b/g) ?? []).length >= 3, 'the landing\'s cards do not use the lift');
});

test('the skeleton is one primitive on both sides, and holds still under reduced motion', () => {
  assert.match(SITE_CSS, /\.skeleton\s*\{[^}]*animation:\s*skeleton-breathe/);
  assert.match(APP_CSS, /\.skeleton\s*\{[^}]*animation:\s*skeleton-breathe/);
  assert.match(SITE_CSS, /prefers-reduced-motion:\s*reduce\)\s*\{[^@]*animation:\s*none\s*!important/);
  assert.match(APP_CSS, /prefers-reduced-motion:reduce\)\s*\{[^@]*\.skeleton[^@]*animation:none\s*!important/);
  // Opacity only, and no gradient: a shimmer sweep is not part of this language.
  assert.doesNotMatch(/@keyframes skeleton-breathe\s*\{[^}]*\}/.exec(SITE_CSS)?.[0] ?? '', /gradient|background/);
});

test('the skip link is hidden by clipping, not by being moved above the viewport', () => {
  const rule = /\.skip-link\s*\{([^}]*)\}/.exec(SITE_CSS)?.[1] ?? '';
  assert.match(rule, /clip-path:\s*inset\(50%\)/);
  assert.doesNotMatch(rule, /translateY\(-/, 'the skip link is hidden by a negative translate, which a taller-than-window capture paints');
  assert.match(SITE_CSS, /\.skip-link:focus\s*\{[^}]*clip-path:\s*none/);
});

test('reduced motion: the shared rule still kills every animation and transition, and the reveal is behind no-preference', () => {
  assert.match(SITE_CSS, /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{[\s\S]*animation:\s*none\s*!important[\s\S]*transition:\s*none\s*!important/);
  const reveal = /@supports\s*\(animation-timeline:\s*view\(\)\)\s*\{\s*@media\s*\(prefers-reduced-motion:\s*no-preference\)/.test(SITE_CSS);
  assert.ok(reveal, 'the scroll-driven reveal is not inside @supports and a no-preference guard');
});
