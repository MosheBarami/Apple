/**
 * PRESENCE — the feature that is one `>` against a timestamp, in a repository that has been
 * burned by exactly that.
 *
 * The tests below feed the heartbeats that a comparison alone cannot judge: NaN, a string, a
 * missing field, a clock an hour fast, a role nobody defined. Each one must render as GONE, and
 * each one is asserted to be counted in `dropped` rather than merely absent — "nobody is here"
 * and "I could not read four of the five beats" are different answers and the second one must be
 * visible.
 *
 * Run with:  node --test tests/collab-presence.test.mjs        (from apps/worker)
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  presenceSnapshot,
  makeBeat,
  PRESENCE_TTL_MS,
  PRESENCE_FUTURE_SKEW_MS,
  PRESENCE_ACTIVITIES,
} from '../src/presence.ts';

const NOW = 1_770_000_000_000;
const beat = (over = {}) => ({ userId: 'u-1', role: 'editor', connectionId: 'c-1', lastSeenMs: NOW - 1000, ...over });

test('a heartbeat that is not a finite number is GONE, and is counted as unreadable', () => {
  // `now - NaN <= ttl` is false today. Flip the comparison and every one of these is present
  // forever — which is why they are asserted by name rather than trusted to the arithmetic.
  for (const hostile of [NaN, Infinity, -Infinity, '2026-09-15', null, undefined, {}, [], true]) {
    const snap = presenceSnapshot([beat({ lastSeenMs: hostile })], NOW);
    assert.deepEqual(snap.present, [], `lastSeenMs ${JSON.stringify(String(hostile))} must not put anyone on screen`);
    assert.equal(snap.dropped.unreadable, 1, 'and it must be reported as unreadable, not silently absent');
    assert.equal(snap.dropped.stale, 0, 'unreadable is not the same fact as stale');
  }
});

test('a stale heartbeat is dropped at the TTL boundary, not one tick later', () => {
  assert.equal(presenceSnapshot([beat({ lastSeenMs: NOW - PRESENCE_TTL_MS })], NOW).present.length, 1, 'exactly at the TTL is still here');
  assert.equal(presenceSnapshot([beat({ lastSeenMs: NOW - PRESENCE_TTL_MS - 1 })], NOW).present.length, 0);
  assert.equal(presenceSnapshot([beat({ lastSeenMs: NOW - PRESENCE_TTL_MS - 1 })], NOW).dropped.stale, 1);
});

test('a client clock running fast cannot pin someone to the project forever', () => {
  const future = beat({ lastSeenMs: NOW + PRESENCE_FUTURE_SKEW_MS + 1 });
  const snap = presenceSnapshot([future], NOW);
  assert.deepEqual(snap.present, [], 'a beat from the future is nonsense, not freshness');
  assert.equal(snap.dropped.unreadable, 1);
  // A little skew is normal and must still work.
  assert.equal(presenceSnapshot([beat({ lastSeenMs: NOW + 5_000 })], NOW).present.length, 1);
});

test('a beat carrying a role the product does not have is dropped, never shown as a viewer', () => {
  for (const role of ['superuser', 'Owner', '', null, undefined, 3]) {
    const snap = presenceSnapshot([beat({ role })], NOW);
    assert.deepEqual(snap.present, [], `role ${JSON.stringify(String(role))} must not be rendered beside a name`);
    assert.equal(snap.dropped.unreadable, 1);
  }
});

test('a beat with no user id is dropped', () => {
  for (const userId of ['', '   ', null, undefined, 7]) {
    assert.deepEqual(presenceSnapshot([beat({ userId })], NOW).present, []);
  }
  for (const junk of [null, 'editor', 7, []]) {
    assert.equal(presenceSnapshot([junk], NOW).dropped.unreadable, 1);
  }
});

test('a clock that is not a finite number shows NOBODY as present', () => {
  for (const clock of [NaN, Infinity, -Infinity]) {
    const snap = presenceSnapshot([beat(), beat({ userId: 'u-2' })], clock);
    assert.deepEqual(snap.present, [], 'an unreadable clock must not render everybody present');
    assert.equal(snap.dropped.unreadable, 2);
  }
});

test('two tabs are one person, with the freshest beat and the strongest activity', () => {
  const snap = presenceSnapshot(
    [
      beat({ connectionId: 'c-1', lastSeenMs: NOW - 20_000, activity: 'viewing', displayName: 'Tal' }),
      beat({ connectionId: 'c-2', lastSeenMs: NOW - 500, activity: 'building' }),
      beat({ userId: 'u-2', role: 'commenter', connectionId: 'c-3', activity: 'typing' }),
    ],
    NOW,
  );
  assert.equal(snap.present.length, 2, 'two people, three sockets');
  const [first, second] = snap.present;
  assert.equal(first.userId, 'u-1');
  assert.equal(first.connections, 2);
  assert.equal(first.lastSeenMs, NOW - 500, 'the freshest tab is when this person was last seen');
  assert.equal(first.activity, 'building');
  assert.equal(first.displayName, 'Tal', 'a name from any of their tabs is still their name');
  assert.equal(second.userId, 'u-2');
  assert.equal(second.connections, 1);
  assert.equal(second.activity, 'typing');
});

test('the activity ladder is ordered weakest-first, because the order IS the aggregation rule', () => {
  assert.deepEqual([...PRESENCE_ACTIVITIES], ['viewing', 'typing', 'building']);
  const stronger = (a, b) =>
    presenceSnapshot([beat({ connectionId: 'x', activity: a }), beat({ connectionId: 'y', activity: b })], NOW).present[0].activity;
  assert.equal(stronger('viewing', 'typing'), 'typing');
  assert.equal(stronger('typing', 'viewing'), 'typing', 'order of arrival must not change the answer');
  assert.equal(stronger('building', 'typing'), 'building');
  assert.equal(stronger('typing', 'building'), 'building');
});

test('an unknown activity falls back to viewing rather than being rendered', () => {
  const snap = presenceSnapshot([beat({ activity: 'deleting-everything' })], NOW);
  assert.equal(snap.present.length, 1, 'the person is still here');
  assert.equal(snap.present[0].activity, 'viewing', 'but the product never shows a word it does not own');
});

test('the order is deterministic, so two clients draw the same rows', () => {
  const ids = ['u-c', 'u-a', 'u-b'];
  const snap = presenceSnapshot(ids.map((userId, i) => beat({ userId, connectionId: `c-${i}` })), NOW);
  assert.deepEqual(snap.present.map((p) => p.userId), ['u-a', 'u-b', 'u-c']);
});

test('makeBeat refuses to mint a record for a socket it cannot identify', () => {
  assert.equal(makeBeat({ userId: 'u-1', role: 'superuser', connectionId: 'c', nowMs: NOW }), null);
  assert.equal(makeBeat({ userId: '', role: 'editor', connectionId: 'c', nowMs: NOW }), null);
  assert.equal(makeBeat({ userId: 'u-1', role: 'editor', connectionId: '', nowMs: NOW }), null);
  assert.equal(makeBeat({ userId: 'u-1', role: 'editor', connectionId: 'c', nowMs: NaN }), null);
  const ok = makeBeat({ userId: 'u-1', role: 'editor', connectionId: 'c', nowMs: NOW, activity: 'typing' });
  assert.equal(ok.lastSeenMs, NOW);
  assert.equal(ok.activity, 'typing');
  // and what it mints must survive the snapshot it was minted for
  assert.equal(presenceSnapshot([ok], NOW).present.length, 1);
});

test('an empty project has nobody in it and reports no drops', () => {
  assert.deepEqual(presenceSnapshot([], NOW), { present: [], dropped: { stale: 0, unreadable: 0 } });
  assert.deepEqual(presenceSnapshot(undefined, NOW), { present: [], dropped: { stale: 0, unreadable: 0 } });
});
