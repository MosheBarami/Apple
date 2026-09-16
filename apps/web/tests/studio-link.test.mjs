/**
 * WHAT THE BROWSER MAY SAY ABOUT THE STUDIO LINK.
 *
 * `studioConnection` answers "is Studio there". These answer the questions a user actually has
 * when the answer is no — when did it last poll, how much work is waiting, how slow is the round
 * trip, and is it even the right place — every one of which the worker already knew and none of
 * which crossed the wire.
 *
 * THESE ARE HONESTY TESTS. The hazard is not a wrong number, it is a CONFIDENT number that was
 * never measured: a round trip nobody has timed rendered as "0 ms" is a failure to observe dressed
 * as an observation, and 0 ms is the most reassuring value the field can hold. So every assertion
 * reads the whole sentence back rather than checking that a formatter was called — F-65, where
 * template interpolation rendered `undefined` as text and a marker scan saw nothing wrong.
 *
 * Run with:  node --test tests/studio-link.test.mjs      (from apps/web)
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { lastSeenLabel, latencyLabel, queueLabel, linkDetail, NO_LINK_FACTS } from '../src/lib/studio-connection.ts';

const NOW = 1_700_000_000_000;
const facts = (over = {}) => ({ ...NO_LINK_FACTS, ...over });

/** Nothing this module produces may ever contain one of these. */
const POISON = ['undefined', 'NaN', 'null', 'Invalid Date', '[object'];
function clean(s, what) {
  if (s === null) return;
  assert.equal(typeof s, 'string', `${what} must be a string or null, got ${typeof s}`);
  for (const bad of POISON) assert.equal(s.includes(bad), false, `${what} rendered "${bad}": ${s}`);
}

// ------------------------------------------------------------------ never measured is never a number

test('AN UNMEASURED ROUND TRIP IS ABSENT, NOT ZERO', () => {
  // The first ping goes out 25 seconds into a session. For those 25 seconds there is no
  // measurement, and "0 ms" is both a lie and the most reassuring lie available.
  assert.equal(latencyLabel(null), null);
  assert.equal(latencyLabel(undefined), null);
  assert.equal(latencyLabel(NaN), null);
  assert.equal(latencyLabel(-5), null, 'a negative round trip is a broken clock, not a fast link');
});

test('a measured round trip is rendered, in units that suit its size', () => {
  assert.equal(latencyLabel(0), '0 ms', 'a genuinely measured zero is allowed — it is the UNMEASURED one that must be absent');
  assert.equal(latencyLabel(42.4), '42 ms');
  assert.equal(latencyLabel(1500), '1.5 s');
});

test('a plugin that has NEVER polled produces no timestamp at all', () => {
  assert.equal(lastSeenLabel(null, NOW), null);
  assert.equal(lastSeenLabel(0, NOW), null, 'epoch zero is "never", not 1970');
  assert.equal(lastSeenLabel(NaN, NOW), null);
});

test('A FUTURE TIMESTAMP IS CLAMPED, because the two clocks are unrelated', () => {
  // The worker stamps in its own time. A few seconds of skew is normal, and "last seen in 3
  // seconds" makes the entire panel look broken.
  assert.equal(lastSeenLabel(NOW + 3_000, NOW), 'just now');
  assert.equal(lastSeenLabel(NOW + 86_400_000, NOW), 'just now');
});

test('the timestamp separates the states a boolean cannot', () => {
  // "Not connected" reads identically for a Studio that closed ten seconds ago and one that
  // closed in March. Only one of them is worth waiting for.
  assert.equal(lastSeenLabel(NOW - 2_000, NOW), 'just now');
  assert.equal(lastSeenLabel(NOW - 30_000, NOW), '30 seconds ago');
  assert.equal(lastSeenLabel(NOW - 60_000, NOW), '1 minute ago');
  assert.equal(lastSeenLabel(NOW - 5 * 60_000, NOW), '5 minutes ago');
  assert.equal(lastSeenLabel(NOW - 3 * 3_600_000, NOW), '3 hours ago');
  assert.equal(lastSeenLabel(NOW - 9 * 86_400_000, NOW), '9 days ago');
});

test('an empty queue says nothing, and a full one counts correctly', () => {
  assert.equal(queueLabel(0), null, 'an empty queue is not news');
  assert.equal(queueLabel(-1), null);
  assert.equal(queueLabel(NaN), null);
  assert.equal(queueLabel(1), '1 change waiting');
  assert.equal(queueLabel(4), '4 changes waiting');
});

// ------------------------------------------------------------------ the sentence under the pill

test('A PLACE MISMATCH OUTRANKS EVERYTHING ELSE', () => {
  // The only state where the link is healthy, the pill is green, and nothing will ever run. If it
  // did not come first the user would read "42 ms" under a build that never starts.
  const s = linkDetail('connected', facts({
    rttMs: 42,
    queuedOps: 3,
    placeMismatch: { expectedPlaceName: 'Tower Defence', openPlaceName: 'Scratch Pad', openPlaceId: 222 },
  }), NOW);
  clean(s, 'mismatch detail');
  assert.ok(s.includes('Scratch Pad'), s);
  assert.ok(s.includes('Tower Defence'), s);
  assert.ok(s.includes('Nothing will build'), 'it must say the consequence, not just the fact');
  assert.equal(s.includes('42 ms'), false, 'latency must not be the headline while nothing can run');
});

test('a mismatch with unnamed places still produces a sentence, not a hole', () => {
  // Both names come off the wire and either can be empty — an unsaved place has no name worth
  // printing. Interpolating an empty string leaves 'paired to ""', which reads as a bug.
  const s = linkDetail('connected', facts({
    placeMismatch: { expectedPlaceName: '', openPlaceName: '', openPlaceId: 0 },
  }), NOW);
  clean(s, 'unnamed mismatch');
  assert.equal(s.includes('""'), false, `empty quotes leaked into: ${s}`);
});

test('a healthy link reports what it has measured and nothing it has not', () => {
  assert.equal(linkDetail('connected', facts(), NOW), null, 'nothing measured, nothing said');
  //[[ A HEALTHY LINK SAYS NOTHING, INCLUDING ITS LATENCY. This used to assert '42 ms', and that
  //   string was on the owner's screen above his conversation: a number with no noun, changing by
  //   itself every thirty seconds, drawn precisely when there was nothing to report. It is the row
  //   studio-link-note.tsx's own comment forbids — "a row reading 'everything is fine', which is
  //   the kind of chrome that trains people to stop looking".
  //
  //   The queue survives because it is a FINDING: work accepted and not yet landed is something
  //   the user can act on. A round trip is a measurement, and it belongs where someone goes to
  //   look for it. ]]
  assert.equal(linkDetail('connected', facts({ rttMs: 42 }), NOW), null, 'a round trip alone is not worth a strip');
  assert.equal(linkDetail('connected', facts({ rttMs: 9999 }), NOW), null, 'nor is a slow one — slow is not broken');
  assert.equal(linkDetail('connected', facts({ rttMs: 42, queuedOps: 2 }), NOW), '2 changes waiting', 'the queue is the finding; the latency is not');
  assert.equal(linkDetail('connected', facts({ queuedOps: 2 }), NOW), '2 changes waiting', 'and it reads the same with no measurement at all');
});

test('CONNECTING SAYS NOTHING — no answer yet is not a finding', () => {
  // The same reasoning that gives `studioConnection` its 'connecting' state: claiming anything
  // here puts a diagnosis in front of a user whose socket simply has not opened.
  assert.equal(linkDetail('connecting', facts({ lastSeenAt: NOW - 60_000, queuedOps: 3 }), NOW), null);
});

test('a dropped link is DATED, and says what happens to the waiting work', () => {
  const s = linkDetail('disconnected', facts({ lastSeenAt: NOW - 4 * 60_000, queuedOps: 2 }), NOW);
  clean(s, 'disconnected detail');
  assert.ok(s.includes('4 minutes ago'), s);
  assert.ok(s.includes('2 changes waiting'), s);
  assert.ok(s.includes('when it reconnects'), 'queued work must not read as lost');
});

test('a dropped link with no timestamp still says something true', () => {
  const s = linkDetail('disconnected', facts(), NOW);
  clean(s, 'undated disconnect');
  assert.equal(s, 'Studio disconnected.');
});

test('A PROJECT PAIRED ON ANOTHER DAY IS DATED RATHER THAN CALLED NEW', () => {
  // This is the case the boolean got most wrong. A returning user whose laptop is on a different
  // desk saw the same "not connected" as somebody who had never installed the plugin.
  const s = linkDetail('not-connected', facts({ lastSeenAt: NOW - 3 * 86_400_000 }), NOW);
  clean(s, 'returning user');
  assert.ok(s.includes('3 days ago'), s);
});

test('a project that has never paired gets no sentence — the setup card already says it', () => {
  assert.equal(linkDetail('not-connected', facts(), NOW), null);
});

test('every branch survives hostile facts without rendering a hole', () => {
  // The whole record comes off the wire. Any field can be missing from an older worker.
  const hostile = [
    {}, { lastSeenAt: 'yesterday' }, { queuedOps: '3' }, { rttMs: '12' },
    { placeMismatch: {} }, { lastSeenAt: Infinity, rttMs: Infinity, queuedOps: Infinity },
  ];
  for (const over of hostile) {
    for (const state of ['connecting', 'connected', 'disconnected', 'not-connected']) {
      clean(linkDetail(state, { ...NO_LINK_FACTS, ...over }, NOW), `${state} ${JSON.stringify(over)}`);
    }
  }
});
