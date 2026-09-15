/**
 * THE RAIL WAS 320px AND NOTHING COULD CHANGE IT.
 *
 * `--gx-rail-w: 320px`, a fixed token, on every screen and for every person. Nothing in apps/web
 * resized anything — the only `resize:` declarations in the whole app are on textareas. On a 13"
 * laptop the rail takes a quarter of the width whether or not you are reading it, and someone
 * whose project names are long has no way to see them.
 *
 * What is asserted here is the arithmetic, driven directly, because that is where a resize goes
 * wrong: the clamp that stops a drag producing a rail nobody can read, the width a cursor
 * position actually means (including in a right-to-left layout, where the rail is on the other
 * side and the same cursor means the opposite width), and what an arrow key does. The pointer
 * plumbing in the shell is four lines and is checked by reading it.
 *
 * Run with:  node --test apps/web/tests/
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const WEB = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(mkdtempSync(join(tmpdir(), 'railw-')), 'rail.mjs');
execFileSync(join(WEB, '..', 'worker', 'node_modules', '.bin', 'esbuild'),
  [join(WEB, 'src', 'lib', 'rail-width.ts'), '--bundle', '--format=esm', '--platform=neutral',
   '--main-fields=main,module', '--outfile=' + out], { stdio: 'pipe' });
const R = await import(out);

const read = (...p) => readFileSync(join(WEB, 'src', ...p), 'utf8');

test('anything at all normalises to a rail a person can read', () => {
  // This is the normaliser handed to readViewState, so its input really is unknown: an older
  // build's value, a different clamp's value, or something typed into localStorage by hand.
  assert.equal(R.clampRailWidth(null), R.RAIL_DEFAULT, 'nothing stored means the default');
  assert.equal(R.clampRailWidth(undefined), R.RAIL_DEFAULT);
  assert.equal(R.clampRailWidth('wide'), R.RAIL_DEFAULT);
  assert.equal(R.clampRailWidth({}), R.RAIL_DEFAULT);
  assert.equal(R.clampRailWidth(''), R.RAIL_DEFAULT, 'Number(\'\') is 0, which would clamp to the floor');
  assert.equal(R.clampRailWidth('384'), 384, 'a number that came back from JSON as text is still a number');
  assert.equal(R.clampRailWidth(NaN), R.RAIL_DEFAULT);
  assert.equal(R.clampRailWidth(Infinity), R.RAIL_DEFAULT, 'infinity is not a measurement');

  assert.equal(R.clampRailWidth(0), R.RAIL_MIN, 'a drag to the edge must not hide the rail');
  assert.equal(R.clampRailWidth(-4000), R.RAIL_MIN);
  assert.equal(R.clampRailWidth(9000), R.RAIL_MAX, 'nor swallow the conversation');
  assert.equal(R.clampRailWidth(301.6), 302, 'a fractional CSS pixel is not a width anyone asked for');
});

test('a width inside the range survives exactly, so the choice is the user\'s', () => {
  for (const w of [R.RAIL_MIN, 300, 384, R.RAIL_MAX]) {
    assert.equal(R.clampRailWidth(w), w);
  }
  assert.ok(R.RAIL_MIN < R.RAIL_DEFAULT && R.RAIL_DEFAULT < R.RAIL_MAX, 'the default has to be reachable from both sides');
});

test('the default here and the CSS token are the same number', () => {
  // They are two declarations of one fact. Drift means the first drag of a fresh session jumps
  // the rail to a width nobody asked for, and it looks like the handle is broken.
  const css = read('styles', 'workspace.css');
  const token = /--gx-rail-w:\s*(\d+)px/.exec(css);
  assert.ok(token, '--gx-rail-w is gone from workspace.css');
  assert.equal(Number(token[1]), R.RAIL_DEFAULT, 'RAIL_DEFAULT and --gx-rail-w must agree');
});

test('the cursor means the distance from the rail\'s own edge, on either side', () => {
  const rail = { left: 0, right: 320 };
  assert.equal(R.widthFromPointer(300, rail, false), 300, 'left-to-right: from the left edge');
  // In a right-to-left layout the rail sits on the right, so the same cursor is asking for the
  // opposite width. Getting this wrong makes the handle run away from the hand.
  const rtlRail = { left: 1000, right: 1320 };
  assert.equal(R.widthFromPointer(1020, rtlRail, true), 300, 'right-to-left: from the right edge');
  // Measured, not accumulated: a drag past the floor pins to the floor and comes straight back,
  // rather than banking the overshoot and waiting for the cursor to catch up.
  assert.equal(R.widthFromPointer(-500, rail, false), R.RAIL_MIN);
  assert.equal(R.widthFromPointer(5000, rail, false), R.RAIL_MAX);
});

test('the arrows point, rather than meaning grow and shrink', () => {
  const start = 320;
  assert.equal(R.nudgeRailWidth(start, 'ArrowRight', false), start + R.RAIL_STEP);
  assert.equal(R.nudgeRailWidth(start, 'ArrowLeft', false), start - R.RAIL_STEP);
  // The rail is on the right in RTL, so the key that widens it is the one pointing inward.
  assert.equal(R.nudgeRailWidth(start, 'ArrowRight', true), start - R.RAIL_STEP);
  assert.equal(R.nudgeRailWidth(start, 'ArrowLeft', true), start + R.RAIL_STEP);

  assert.equal(R.nudgeRailWidth(start, 'Home', false), R.RAIL_MIN);
  assert.equal(R.nudgeRailWidth(start, 'End', false), R.RAIL_MAX);
  assert.equal(R.nudgeRailWidth(R.RAIL_MAX, 'ArrowRight', false), R.RAIL_MAX, 'the ceiling holds under the keyboard too');

  // Null, not the unchanged width: the caller preventDefault()s only what it consumed, and
  // swallowing Tab on a focused separator would trap a keyboard user on the handle.
  for (const key of ['Tab', 'Enter', ' ', 'a', 'ArrowUp']) {
    assert.equal(R.nudgeRailWidth(start, key, false), null, `${key} is not this control's to eat`);
  }
});

test('the handle exists, is announced as one, and is reachable without a mouse', () => {
  const layout = read('components', 'layout.tsx');
  const sep = /<div[^>]*role="separator"[\s\S]*?\n      \/>/.exec(layout);
  assert.ok(sep, 'the rail needs a separator element to drag');
  assert.match(sep[0], /aria-orientation="vertical"/);
  assert.match(sep[0], /aria-label=/, 'an unlabelled separator is an unexplained control');
  assert.match(sep[0], /tabIndex=\{0\}/, 'a drag handle nobody can focus is a mouse-only feature');
  assert.match(sep[0], /aria-valuenow=/, 'a separator with no value announces nothing as it moves');
  assert.match(sep[0], /aria-valuemin=/);
  assert.match(sep[0], /aria-valuemax=/);
  assert.match(sep[0], /onPointerDown=/);
  assert.match(sep[0], /onKeyDown=/);
});

test('the chosen width is remembered, through the validating reader', () => {
  const layout = read('components', 'layout.tsx');
  assert.match(layout, /readViewState\('rail\.width', clampRailWidth\)/,
    'the stored width must come back through the clamp, not raw');
  assert.match(layout, /writeViewState\('rail\.width'/, 'a width that resets on reload is a toy');
});

test('the handle is not offered where the rail is an overlay', () => {
  // Below 861px the rail is fixed and translated off-canvas; a width handle there resizes
  // something that is not part of the layout, which is a control wired to nothing.
  const css = read('styles', 'workspace.css');
  const i = css.indexOf('@media (max-width: 860px)');
  assert.notEqual(i, -1);
  const narrow = css.slice(i, css.indexOf('\n}\n', i));
  assert.match(narrow, /\.gx-rail__resize\s*\{[^}]*display:\s*none/);
});
