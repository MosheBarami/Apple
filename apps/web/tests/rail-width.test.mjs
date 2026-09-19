/**
 * The old rail-width suite described a permanent, user-resizable sidebar.
 * Navigation now has a fixed desktop dock plus an overlay conversation drawer;
 * width arithmetic and persisted rail dimensions are no longer page-layout
 * contracts.
 *
 * This file keeps the useful part of the old coverage — the drawer's explicit
 * geometry and keyboard-accessible modal behavior — and checks that the hidden
 * resize affordance cannot reintroduce a layout column.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const WEB = join(dirname(fileURLToPath(import.meta.url)), '..');
const LAYOUT = readFileSync(join(WEB, 'src', 'components', 'layout.tsx'), 'utf8');
const CSS = readFileSync(join(WEB, 'src', 'design', 'system.css'), 'utf8');

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

function mediaBodies(css) {
  const bodies = [];
  const re = /@media[^{]+\{/g;
  let match;
  while ((match = re.exec(css)) !== null) bodies.push(braceBody(css, match.index));
  return bodies;
}

test('the drawer has bounded geometry without becoming a page column', () => {
  const at = CSS.indexOf('.gx-rail {');
  assert.notEqual(at, -1, 'the navigation drawer has no style rule');
  const rail = braceBody(CSS, at);
  assert.match(rail, /position:\s*fixed/);
  assert.match(rail, /inset-block:\s*0/);
  assert.match(rail, /inset-inline-start:\s*0/);
  assert.match(rail, /width:\s*min\(/);
  assert.doesNotMatch(CSS, /--gx-rail-w\s*:/, 'the old persistent width token must not return');
  assert.deepEqual(
    mediaBodies(CSS).filter((body) => /\.gx-rail\b/.test(body)),
    [],
    'drawer geometry must not fork into desktop and mobile sidebar modes',
  );
});

test('the drawer is mounted only while open and exposes modal semantics', () => {
  assert.match(LAYOUT, /\{railOpen\s*&&\s*<Rail[\s\S]*?\/>\s*\}/);
  assert.match(LAYOUT, /role="dialog"/);
  assert.match(LAYOUT, /aria-modal="true"/);
  assert.match(LAYOUT, /aria-label="Conversations"/);
});

test('the drawer has an explicit close action and scrim', () => {
  assert.match(LAYOUT, /className="gx-icon-btn gx-rail__close"[\s\S]*onClick=\{closeRail\}/);
  assert.match(LAYOUT, /className="gx-scrim"[\s\S]*onClick=\{closeRail\}/);
  assert.match(LAYOUT, /aria-label="Close navigation"/);
});

test('the modal drawer keeps focus inside and restores the opener', () => {
  assert.match(LAYOUT, /const focusable = \(\) =>/);
  assert.match(LAYOUT, /event\.key !== 'Tab'/);
  assert.match(LAYOUT, /event\.shiftKey[\s\S]*last\.focus\(\)/);
  assert.match(LAYOUT, /!event\.shiftKey[\s\S]*first\.focus\(\)|else if \(!event\.shiftKey[\s\S]*first\.focus\(\)/);
  assert.match(LAYOUT, /restore\?\.focus\?\.\(\)/);
});

test('the fixed dock owns page geometry and the hidden resize affordance stays inert', () => {
  const dockAt = CSS.indexOf('.studio-dock {');
  assert.notEqual(dockAt, -1, 'the desktop navigation dock has no style rule');
  const dock = braceBody(CSS, dockAt);
  assert.match(dock, /position:\s*fixed/);
  assert.match(dock, /width:\s*76px/);

  const mainAt = CSS.indexOf('.gx-main {');
  assert.notEqual(mainAt, -1, 'the shell main has no style rule');
  const main = braceBody(CSS, mainAt);
  assert.match(main, /width:\s*calc\(100%\s*-\s*76px\)/);
  assert.match(main, /margin-inline-start:\s*76px/);
  assert.doesNotMatch(CSS, /grid-template-(columns|areas)[^;{}]*var\(--gx-rail-w\)/,
    'the old rail width must not drive page columns');

  const controlsAt = CSS.indexOf('.gx-rail__collapse,.gx-rail__resize');
  assert.notEqual(controlsAt, -1, 'the rail controls need an explicit style rule');
  assert.match(braceBody(CSS, controlsAt), /display:\s*none/);
});
