/**
 * The navigation entry point is part of the shell, not a viewport-specific
 * topbar affordance. The rail is a modal drawer at every width: it mounts only
 * while open, has a scrim and an accessible close path, and owns focus while
 * it is present.
 *
 * These are source contracts rather than a browser snapshot. They deliberately
 * describe the current drawer model, so an old desktop rail or a second route
 * opener cannot quietly return.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '../src');
const read = (...p) => readFileSync(join(SRC, ...p), 'utf8');

const LAYOUT = read('components', 'layout.tsx');
const CSS = read('design', 'system.css');

function braceBody(css, at) {
  const open = css.indexOf('{', at);
  assert.notEqual(open, -1, 'unterminated rule');
  let depth = 0;
  for (let i = open; i < css.length; i += 1) {
    if (css[i] === '{') depth += 1;
    else if (css[i] === '}') {
      depth -= 1;
      if (depth === 0) return css.slice(open + 1, i);
    }
  }
  throw new Error('unbalanced braces');
}

function ruleFor(selector) {
  const at = CSS.indexOf(selector);
  assert.notEqual(at, -1, 'no rule mentions ' + selector);
  return braceBody(CSS, at);
}

function mediaBodies(css) {
  const bodies = [];
  const re = /@media[^{]+\{/g;
  let match;
  while ((match = re.exec(css)) !== null) bodies.push(braceBody(css, match.index));
  return bodies;
}

test('the shell owns one opener shared by every signed-in route', () => {
  assert.match(LAYOUT, /className="studio-navigation"/);
  assert.match(LAYOUT, /onClick=\{openRail\}/);
  assert.match(LAYOUT, /aria-label="Open navigation"/);
  assert.match(LAYOUT, /aria-expanded=\{railOpen\}/);

  const main = /<main id="main-content"[\s\S]*?<\/main>/.exec(LAYOUT);
  assert.ok(main, 'could not find the shell main');
  assert.match(main[0], /studio-navigation[\s\S]*<Outlet\s*\/>/, 'the opener must be above the route outlet');
});

test('no route renders a second shell opener', () => {
  const routes = join(SRC, 'routes');
  const offenders = readdirSync(routes)
    .filter((file) => file.endsWith('.tsx'))
    .filter((file) => readFileSync(join(routes, file), 'utf8').includes('studio-navigation'));
  assert.deepEqual(offenders, [], 'routes still draw their own navigation opener: ' + offenders.join(', '));
});

test('the rail is a conditional modal drawer, with a scrim and close path', () => {
  assert.match(LAYOUT, /\{railOpen\s*&&\s*<Rail[\s\S]*?\/>\s*\}/, 'the drawer must not occupy the page while closed');
  assert.match(LAYOUT, /className=\{\s*[\s\S]*?gx-rail[\s\S]*role="dialog"/);
  assert.match(LAYOUT, /aria-modal="true"/);
  assert.match(LAYOUT, /className="gx-icon-btn gx-rail__close"[\s\S]*onClick=\{closeRail\}/);
  assert.match(LAYOUT, /className="gx-scrim"[\s\S]*onClick=\{closeRail\}/);
  assert.match(LAYOUT, /aria-label="Close navigation"/);
});

function assertPointerOnlyScrim(source) {
  const clean = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  const scrim = clean.match(/<button\b[^>]*className="gx-scrim"[^>]*\/>/)?.[0];
  assert.ok(scrim, 'the click-to-dismiss scrim must exist');
  assert.match(scrim, /onClick=\{closeRail\}/);
  assert.match(scrim, /tabIndex=\{-1\}/, 'only the dialog close button belongs in keyboard focus');
  assert.match(scrim, /aria-hidden="true"/, 'scrim must not duplicate the accessible close action');
}

test('the navigation scrim is pointer-only, not a second accessible close button', () => {
  assertPointerOnlyScrim(LAYOUT);
  const oldScrim = LAYOUT.replace(/tabIndex=\{-1\} aria-hidden="true"/, 'aria-label="Close navigation"');
  assert.notEqual(oldScrim, LAYOUT, 'falsification must remove the scrim treatment');
  assert.throws(() => assertPointerOnlyScrim(oldScrim));
});

test('the dock is permanent on desktop and collapses to the opener on phones', () => {
  const dock = ruleFor('.studio-dock {');
  assert.match(dock, /position:\s*fixed/);
  assert.match(dock, /inset-block:\s*0/);
  assert.match(dock, /inset-inline-start:\s*0/);
  assert.match(dock, /width:\s*76px/);
  assert.match(dock, /display:\s*flex/);

  const mediaWithDrawer = mediaBodies(CSS).filter((body) => /\.gx-rail\b/.test(body));
  assert.deepEqual(mediaWithDrawer, [], 'conversation drawer geometry must not fork at a breakpoint');

  const phone = mediaBodies(CSS).find((body) => /\.studio-dock\b/.test(body));
  assert.ok(phone, 'no phone dock rules found');
  assert.match(phone, /\.studio-dock\s*\{[^}]*width:\s*44px/);
  assert.match(phone, /\.studio-dock\s*>\s*button,\.studio-dock\s*>\s*a\s*\{[^}]*display:\s*none/);
  assert.match(phone, /\.studio-dock\s*>\s*\.studio-navigation\s*\{[^}]*display:\s*grid/);
});

test('opening the drawer traps Tab and restores focus when it closes', () => {
  assert.match(LAYOUT, /const focusable = \(\) =>/);
  assert.match(LAYOUT, /event\.key !== 'Tab'/);
  assert.match(LAYOUT, /event\.shiftKey[\s\S]*last\.focus\(\)/);
  assert.match(LAYOUT, /!event\.shiftKey[\s\S]*first\.focus\(\)|else if \(!event\.shiftKey[\s\S]*first\.focus\(\)/);
  assert.match(LAYOUT, /restore\?\.focus\?\.\(\)/);
});

function assertModalIsolation(source) {
  const clean = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  assert.match(clean, /getElementById\('main-content'\)/);
  assert.match(clean, /background\.inert\s*=\s*true/);
  assert.match(clean, /background\.inert\s*=\s*previousInert[\s\S]*restore\?\.focus/,
    'background must become operable before focus is restored');
}

test('the navigation modal isolates the background until it unmounts', () => {
  assertModalIsolation(LAYOUT);
  const broken = LAYOUT.replace('background.inert = true', 'background.inert = false');
  assert.notEqual(broken, LAYOUT);
  assert.throws(() => assertModalIsolation(broken));
});
