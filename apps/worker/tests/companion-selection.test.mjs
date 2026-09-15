/**
 * SELECTION SYNC AND COMPANION OP ADMISSION — the two decisions in companion.ts.
 *
 * Both are pure functions of their input, which is the whole reason they were written as
 * separate functions: the violating input comes from the test rather than from a live
 * plugin, so "it refuses a NaN count" is something a test can actually demonstrate
 * instead of something a comment can claim.
 *
 * The selection half is about NOT BELIEVING THE SENDER. `/api/studio/poll` is
 * unauthenticated at the edge and token-authenticated at the Durable Object, so the poll
 * body is written by a client. Every field of the event the worker forwards is
 * re-derived; these tests feed events whose own fields contradict each other and assert
 * that what comes out is coherent.
 *
 * The admission half is about DEFAULT NO. `StudioOp` is a compile-time promise about
 * what the worker's own code can construct; this route is handed JSON from a browser.
 *
 *   node --test apps/worker/tests/companion-selection.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  readSelectionEvent,
  latestSelection,
  sameSelection,
  companionOpAccess,
  sanitizeCompanionOp,
  companionRefusal,
  COMPANION_READ_OPS,
  COMPANION_BUILD_OPS,
  MAX_SELECTION_ITEMS,
} from '../src/companion.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');

const item = (n) => ({ path: `game.Workspace.P${n}`, class: 'Part' });
const selectionEvent = (items, extra = {}) => ({ kind: 'selection', items, count: items.length, truncated: false, clock: 1, ...extra });

// ===================================================================== selection shape

test('a log or state event is not a selection event', () => {
  assert.equal(readSelectionEvent({ kind: 'log', message: 'hi', level: 'output', clock: 1 }), null);
  assert.equal(readSelectionEvent({ kind: 'state', placeName: 'X' }), null);
  assert.equal(readSelectionEvent(null), null);
  assert.equal(readSelectionEvent('selection'), null);
});

test('an event with no items array is refused rather than read as an empty selection', () => {
  // "Nothing is selected" and "this payload was not a selection" are different facts, and
  // the second one must not be broadcast as the first.
  assert.equal(readSelectionEvent({ kind: 'selection', count: 3 }), null);
  assert.equal(readSelectionEvent({ kind: 'selection', items: 'game.Workspace.P1' }), null);
});

test('TRUNCATED IS COMPUTED, never taken on the sender\'s word', () => {
  // A sender that says "truncated" while handing over the whole selection.
  const overclaimed = readSelectionEvent(selectionEvent([item(1), item(2)], { truncated: true }));
  assert.equal(overclaimed.truncated, false, 'two of two items is not a truncated list');

  // And a sender that hands over one item while claiming nine were selected.
  const underclaimed = readSelectionEvent({ kind: 'selection', items: [item(1)], count: 9, truncated: false, clock: 1 });
  assert.equal(underclaimed.truncated, true, 'one of nine IS a truncated list, whatever the flag said');
  assert.equal(underclaimed.count, 9, 'and the real size survives');
});

test('a count that contradicts the list it arrived with is raised, not believed', () => {
  const ev = readSelectionEvent({ kind: 'selection', items: [item(1), item(2), item(3)], count: 0, clock: 1 });
  assert.equal(ev.count, 3, 'three items cannot be a selection of zero');
  assert.equal(ev.truncated, false);
});

test('a non-finite or negative count falls back to what was actually received', () => {
  // NaN and Infinity cannot ride in JSON, but a string, a float and a negative can — and
  // `count ?? items.length` would let every one of them through, because none is null.
  for (const bogus of ['50', -1, 2.5, true, null, undefined, {}]) {
    const ev = readSelectionEvent({ kind: 'selection', items: [item(1), item(2)], count: bogus, clock: 1 });
    assert.equal(ev.count, 2, `count ${JSON.stringify(bogus)} must not survive`);
  }
});

test('a huge selection is capped in ITEMS and honest in COUNT', () => {
  const many = Array.from({ length: MAX_SELECTION_ITEMS + 500 }, (_, i) => item(i));
  const ev = readSelectionEvent({ kind: 'selection', items: many, count: many.length, clock: 1 });
  assert.equal(ev.items.length, MAX_SELECTION_ITEMS, 'the list is capped');
  assert.equal(ev.count, many.length, 'the count is not');
  assert.equal(ev.truncated, true);
  // The relationship, stated as a relationship: a truncated event is exactly one whose
  // real size exceeds the list it carries.
  assert.equal(ev.truncated, ev.count > ev.items.length);
});

test('malformed items are dropped from the list without inflating the count', () => {
  const ev = readSelectionEvent({
    kind: 'selection',
    items: [item(1), { path: 42 }, null, { class: 'Part' }, { path: '' }, item(2)],
    count: 6,
    clock: 1,
  });
  assert.deepEqual(
    ev.items.map((i) => i.path),
    ['game.Workspace.P1', 'game.Workspace.P2'],
  );
  assert.equal(ev.count, 6, 'six instances really were selected; four of them were unreadable');
});

test('an item with no class is given one rather than being dropped', () => {
  const ev = readSelectionEvent({ kind: 'selection', items: [{ path: 'game.Workspace.P1' }], count: 1, clock: 1 });
  assert.equal(ev.items[0].class, 'Instance');
});

test('an absurdly long path is dropped — it cannot resolve and it is not free to carry', () => {
  const ev = readSelectionEvent({ kind: 'selection', items: [{ path: 'g'.repeat(600) }, item(1)], count: 2, clock: 1 });
  assert.equal(ev.items.length, 1);
  assert.equal(ev.items[0].path, 'game.Workspace.P1');
});

// =================================================================== latest / sameness

test('the LAST selection in a poll body wins, because it is the one that describes now', () => {
  const events = [
    { kind: 'log', message: 'a', level: 'output', clock: 1 },
    selectionEvent([item(1)]),
    { kind: 'log', message: 'b', level: 'output', clock: 2 },
    selectionEvent([item(7), item(8)]),
  ];
  const ev = latestSelection(events);
  assert.equal(ev.items.length, 2);
  assert.equal(ev.items[0].path, 'game.Workspace.P7');
});

test('a poll body with no selection event yields null, not an empty selection', () => {
  assert.equal(latestSelection([{ kind: 'log', message: 'a', level: 'output', clock: 1 }]), null);
  assert.equal(latestSelection([]), null);
  assert.equal(latestSelection(undefined), null);
  assert.equal(latestSelection('events'), null);
});

test('an EMPTY selection is still a selection and still travels', () => {
  // "The user deselected everything" has to reach the panel, or it keeps showing the last
  // thing that was selected forever.
  const ev = latestSelection([selectionEvent([])]);
  assert.ok(ev);
  assert.equal(ev.count, 0);
  assert.equal(ev.items.length, 0);
});

test('sameSelection distinguishes order and class, not just membership', () => {
  const a = readSelectionEvent(selectionEvent([item(1), item(2)]));
  const b = readSelectionEvent(selectionEvent([item(2), item(1)]));
  const c = readSelectionEvent({ kind: 'selection', items: [{ path: 'game.Workspace.P1', class: 'Model' }, item(2)], count: 2, clock: 1 });
  assert.equal(sameSelection(a, readSelectionEvent(selectionEvent([item(1), item(2)]))), true);
  assert.equal(sameSelection(a, b), false, 'a reordered selection is a different selection to anything that lists it');
  assert.equal(sameSelection(a, c), false, 'and so is the same path with a different class');
  assert.equal(sameSelection(a, null), false, 'so the first report after a restart is always sent');
});

// ==================================================================== op admission

test('the allowlists are disjoint, so no op has two answers', () => {
  const overlap = COMPANION_READ_OPS.filter((op) => COMPANION_BUILD_OPS.includes(op));
  assert.deepEqual(overlap, []);
});

test('a read op needs read, a build op needs build', () => {
  for (const op of COMPANION_READ_OPS) assert.equal(companionOpAccess({ op }), 'read', op);
  for (const op of COMPANION_BUILD_OPS) assert.equal(companionOpAccess({ op }), 'build', op);
});

test('THE GATED OPS ARE NOT REACHABLE FROM THE COMPANION, one by one', () => {
  //[[ Each of these has a gate somewhere else that the companion route does not run:
  //   `refuseLuauIngress` for the two that carry source, and the plugin's asset policy
  //   for the four that can name an asset id. A second door with no filter is not a
  //   feature. ]]
  for (const op of [
    'run_code',
    'edit_script',
    'create_instances',
    'set_props',
    'insert_asset',
    'generate_model',
    'inspect_model',
    'restore',
    'snapshot',
    'render_view',
    'screenshot',
    'search_scripts',
  ]) {
    assert.equal(companionOpAccess({ op }), null, `${op} must not be reachable from the companion route`);
  }
});

test('an unknown op is refused, and so is a prototype key pretending to be one', () => {
  // A Record<Union, T> keyed by op name would answer TRUE for '__proto__' and for
  // 'hasOwnProperty'. The allowlists are Sets for exactly this reason.
  assert.equal(companionOpAccess({ op: 'definitely_not_an_op' }), null);
  assert.equal(companionOpAccess({ op: '__proto__' }), null);
  assert.equal(companionOpAccess({ op: 'hasOwnProperty' }), null);
  assert.equal(companionOpAccess({ op: 'constructor' }), null);
  assert.equal(companionOpAccess({ op: 'toString' }), null);
});

test('a non-object, a missing op and a non-string op are all refused', () => {
  assert.equal(companionOpAccess(null), null);
  assert.equal(companionOpAccess(undefined), null);
  assert.equal(companionOpAccess('get_tree'), null);
  assert.equal(companionOpAccess({}), null);
  assert.equal(companionOpAccess({ op: 7 }), null);
  assert.equal(companionOpAccess({ op: ['get_tree'] }), null);
});

test('the refusal names the op that was asked for and where the gated work goes', () => {
  const message = companionRefusal({ op: 'run_code', code: 'print(1)' });
  assert.match(message, /run_code/);
  assert.match(message, /agent/, 'a refusal an operator cannot act on is indistinguishable from a bug');
});

test('verifiedAssetIds never survives the companion route', () => {
  //[[ The plugin reads `op.verifiedAssetIds` off the ENVELOPE as proof an id already
  //   passed the licence gate. None of the companion ops assigns a typed property today,
  //   so the field would currently do nothing — which is not a security property, it is
  //   a coincidence. The admin route has already been fixed once for exactly this. ]]
  const out = sanitizeCompanionOp({ op: 'set_locked', paths: ['game.Workspace.P'], locked: true, verifiedAssetIds: [12345] });
  assert.equal('verifiedAssetIds' in out, false);
  // Non-vacuity: the rest has to arrive intact, or this would pass for an empty object.
  assert.equal(out.op, 'set_locked');
  assert.deepEqual(out.paths, ['game.Workspace.P']);
  assert.equal(out.locked, true);
});

// ============================================== the allowlist against the real contract

/** The `op: '...'` literals in the shared StudioOp union. */
function wireOps() {
  const src = readFileSync(join(ROOT, 'packages/shared/src/index.ts'), 'utf8');
  const start = src.indexOf('export type StudioOp');
  const union = src.slice(start, src.indexOf('\n\n', start));
  return new Set([...union.matchAll(/\bop:\s*'([a-z_]+)'/g)].map((m) => m[1]));
}

/** The handlers hung off the `handlers` table in the plugin. */
function pluginHandlers() {
  const src = readFileSync(join(ROOT, 'apps/plugin/src/Ops.luau'), 'utf8');
  return new Set([...src.matchAll(/^\s*handlers\.(\w+)\s*=\s*function/gm)].map((m) => m[1]));
}

test('both sides parsed, so the comparisons below are not vacuous', () => {
  assert.ok(wireOps().size >= 25, `parsed ${wireOps().size} ops from StudioOp`);
  assert.ok(pluginHandlers().size >= 25, `parsed ${pluginHandlers().size} handlers from Ops.luau`);
  assert.ok(wireOps().has('transform_instances'), 'a companion op must be among them');
  assert.ok(pluginHandlers().has('transform_instances'), 'and among the handlers');
});

test('every allowlisted companion op EXISTS — in the wire type and in the plugin', () => {
  //[[ An allowlist entry naming an op that does not exist is a door onto nothing, and it
  //   reads as capability. One that the wire type carries but the plugin does not handle
  //   is worse: it fails at runtime inside a user's open place, which is the furthest
  //   possible point from where the mistake was made. ]]
  const wire = wireOps();
  const handlers = pluginHandlers();
  for (const op of [...COMPANION_READ_OPS, ...COMPANION_BUILD_OPS]) {
    assert.equal(wire.has(op), true, `${op} is allowlisted but is not in StudioOp`);
    assert.equal(handlers.has(op), true, `${op} is allowlisted but the plugin has no handler for it`);
  }
});

test('the companion allowlist is a STRICT subset of the wire type', () => {
  // If it ever equalled it, the allowlist would have stopped being a decision.
  const wire = wireOps();
  const allowed = new Set([...COMPANION_READ_OPS, ...COMPANION_BUILD_OPS]);
  assert.ok(allowed.size < wire.size, `${allowed.size} allowed of ${wire.size} — the route must not carry everything`);
});
