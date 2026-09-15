/**
 * ON A PHONE, THE NAVIGATION RAIL IS THE ONLY WAY OUT OF WHERE YOU ARE.
 *
 * Below 861px the rail is translated off-canvas (`transform: translateX(-100%)`) and only
 * `.is-open` brings it back. For a long time the ONLY control that set `is-open` lived in the
 * workspace topbar, which meant that on the dashboard, usage, settings, roadmap and admin at
 * phone width there was no rail, no account menu, and therefore no Sign out. Nothing looked
 * broken — the pages render fine — which is exactly why it survived: the defect is a control
 * that is absent, not one that misbehaves.
 *
 * So the opener belongs to the SHELL, which is mounted on every signed-in route, and not to any
 * one route. These assertions pin both halves of that: the shell has it, and no route has a
 * second copy that would draw on top of the first.
 *
 * A source assertion is weaker than a render. This cannot prove the button is tappable at
 * 390x844; it proves the button exists in the one place that reaches every route, that the CSS
 * shows it exactly where the rail goes off-canvas, and that it is out of flow with the topbar
 * reserving room for it — the three things a tidy-up would undo.
 *
 * Run with:  node --test apps/web/tests/
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '../src');
const read = (...p) => readFileSync(join(SRC, ...p), 'utf8');

const LAYOUT = read('components', 'layout.tsx');
const CSS = read('styles', 'workspace.css');

/** The body of the first rule whose selector list contains `selector`. */
function ruleFor(css, selector) {
  const i = css.indexOf(selector);
  assert.notEqual(i, -1, `no rule mentions ${selector}`);
  const open = css.indexOf('{', i);
  return css.slice(open + 1, css.indexOf('}', open));
}

/** The body of the `@media (max-width: 860px)` block — the one that hides the rail. */
function narrowBlock() {
  const i = CSS.indexOf('@media (max-width: 860px)');
  assert.notEqual(i, -1, 'the 860px breakpoint that takes the rail off-canvas is gone');
  let depth = 0;
  const open = CSS.indexOf('{', i);
  for (let j = open; j < CSS.length; j += 1) {
    if (CSS[j] === '{') depth += 1;
    else if (CSS[j] === '}') {
      depth -= 1;
      if (depth === 0) return CSS.slice(open + 1, j);
    }
  }
  throw new Error('unterminated @media block');
}

test('the shell owns a control that opens the navigation rail', () => {
  assert.match(
    LAYOUT,
    /className="gx-icon-btn gx-rail-toggle"/,
    'layout.tsx must render the .gx-rail-toggle button',
  );
  assert.match(LAYOUT, /onClick=\{openRail\}/, 'the shell button must call openRail');
  assert.match(LAYOUT, /aria-label="Open navigation"/);
});

test('the opener sits beside <Outlet/>, so it is present on every signed-in route', () => {
  // Inside <main id="main-content">, before the route. A button rendered by a route reaches
  // that route only; a button rendered here reaches all of them, because every signed-in route
  // is a child of this shell (see command-palette.test.mjs).
  const main = /<main id="main-content"[\s\S]*?<\/main>/.exec(LAYOUT);
  assert.ok(main, 'could not find the shell <main> — has the shell changed shape?');
  assert.match(main[0], /gx-rail-toggle[\s\S]*<Outlet\s*\/>/, 'the opener must be inside <main>, above <Outlet/>');
});

test('no route renders a second opener that would draw on top of the shell one', () => {
  // The workspace used to own this button. Two copies at the same coordinates is not a
  // cosmetic problem: the stacking order decides which one your thumb actually hits.
  const routes = join(SRC, 'routes');
  const offenders = readdirSync(routes)
    .filter((f) => f.endsWith('.tsx'))
    .filter((f) => readFileSync(join(routes, f), 'utf8').includes('gx-rail-toggle'));
  assert.deepEqual(offenders, [], `these routes still draw their own rail opener: ${offenders.join(', ')}`);
});

test('the opener appears exactly where the rail goes off-canvas, and nowhere else', () => {
  // Hidden at desktop width, where the rail is permanent and a hamburger would be noise.
  assert.match(ruleFor(CSS, '.gx-icon-btn.gx-rail-toggle {'), /display:\s*none/);

  const narrow = narrowBlock();
  assert.match(narrow, /transform:\s*translateX\(-100%\)/, 'this must still be the block that hides the rail');
  assert.match(
    narrow,
    /\.gx-icon-btn\.gx-rail-toggle\s*\{[^}]*display:\s*grid/,
    'the opener must be shown in the same breakpoint that takes the rail off-canvas',
  );
});

test('the opener is out of flow, and the workspace topbar reserves room for it', () => {
  // It is a shell child of a grid <main>; left in flow it would either add a row above every
  // route or land on top of the workspace project title. Fixed keeps one bar on the workspace
  // and keeps the plain routes from scrolling their headings under it.
  const narrow = narrowBlock();
  assert.match(
    narrow,
    /\.gx-icon-btn\.gx-rail-toggle\s*\{[^}]*position:\s*fixed/,
    'the shell opener must be taken out of flow',
  );
  assert.match(
    narrow,
    /\.gx-ws\s+\.gx-top\s*\{[^}]*padding-inline-start/,
    'the workspace topbar must reserve the space the fixed opener occupies',
  );
  assert.match(
    narrow,
    /\.gx-main\s*>\s*\.page\s*\{[^}]*padding-block-start/,
    'the scrolling routes must clear the fixed opener rather than run under it',
  );
});
