/**
 * THE STUDIO LINK DETAIL IS REACHABLE — it was four finished answers with no caller.
 *
 * `lib/studio-connection.ts` implements lastSeenLabel, latencyLabel, queueLabel and linkDetail,
 * and studio-link.test.mjs covers all fourteen branches of them. The worker already sends every
 * fact they need: `studio_status` carries lastSeenAt, queuedOps, place and placeMismatch, and the
 * socket pongs with the ping's own timestamp. And the browser threw all of it away — the message
 * handler copied `connected` and `state` off the status and nothing else, `case 'pong': break;`
 * discarded the round trip, and the ping did not even carry a `t` for the worker to echo. So the
 * one sentence that separates "Studio closed ten seconds ago" from "Studio was never here", and
 * the one that explains a green pill above a build that will never start, were unreachable.
 *
 * TWO KINDS OF ASSERTION HERE, and the split is deliberate:
 *
 *   THE REDUCERS ARE REAL FUNCTIONS, tested by calling them. They are where the honesty lives: an
 *   unmeasurable round trip must leave the previous measurement alone rather than inventing one,
 *   and a status message that omits a field must not erase what was already known.
 *
 *   THE WIRING IS READ FROM THE SOURCE, in the style of files-drawer-wiring.test.mjs, because this
 *   app has no DOM renderer and the defect being guarded is precisely "nothing calls it". A test
 *   that only exercised the reducers would have passed for the whole time the feature was dead.
 *
 * Run with:  node --test tests/studio-link-wiring.test.mjs      (from apps/web)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NO_LINK_FACTS, factsFromStatus, factsFromPong } from '../src/lib/studio-connection.ts';

const WEB = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (...p) => readFileSync(join(WEB, 'src', ...p), 'utf8');
/** Source with comments stripped, so a name discussed in prose is not mistaken for one in use. */
const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const socket = code(read('lib', 'use-project-socket.ts'));
const workspace = code(read('routes', 'workspace.tsx'));
const connect = code(read('components', 'ws', 'connect-studio.tsx'));

const PLACE = { placeId: 7, placeName: 'Tower', universeId: 3 };

// ------------------------------------------------------------------------------ the reducers

test('a status message keeps every fact the worker sent', () => {
  const facts = factsFromStatus(NO_LINK_FACTS, {
    type: 'studio_status',
    connected: true,
    lastSeenAt: 1_700_000_000_000,
    queuedOps: 3,
    place: PLACE,
    placeMismatch: null,
  });
  assert.equal(facts.lastSeenAt, 1_700_000_000_000);
  assert.equal(facts.queuedOps, 3);
  assert.deepEqual(facts.place, PLACE);
  assert.equal(facts.placeMismatch, null);
});

test('A FIELD THE MESSAGE OMITS IS NOT A FIELD SET TO NOTHING', () => {
  // Every one of these is optional on the wire. Spreading an absent key over a known value would
  // turn "the server did not mention the queue this time" into "the queue is empty", which is the
  // reassuring answer and the wrong one.
  const known = factsFromStatus(NO_LINK_FACTS, {
    type: 'studio_status', connected: true, lastSeenAt: 111, queuedOps: 4, place: PLACE,
  });
  const after = factsFromStatus(known, { type: 'studio_status', connected: true });
  assert.equal(after.lastSeenAt, 111, 'a silent status must not erase when Studio was last seen');
  assert.equal(after.queuedOps, 4);
  assert.deepEqual(after.place, PLACE);
});

test('A PLACE MISMATCH SURVIVES UNTIL IT IS EXPLICITLY CLEARED', () => {
  // The state where the pill is green and nothing will ever build. Losing it on the next heartbeat
  // would leave the user staring at a healthy connection with no explanation at all.
  const mismatch = { expectedPlaceName: 'Tower', openPlaceName: 'Baseplate', openPlaceId: 9 };
  const a = factsFromStatus(NO_LINK_FACTS, { type: 'studio_status', connected: true, placeMismatch: mismatch });
  assert.deepEqual(a.placeMismatch, mismatch);
  const b = factsFromStatus(a, { type: 'studio_status', connected: true });
  assert.deepEqual(b.placeMismatch, mismatch, 'an omitted mismatch is silence, not a resolution');
  const c = factsFromStatus(b, { type: 'studio_status', connected: true, placeMismatch: null });
  assert.equal(c.placeMismatch, null, 'and an explicit null is the resolution');
});

test('a disconnection keeps the timestamp — it is the whole point of the timestamp', () => {
  const seen = factsFromStatus(NO_LINK_FACTS, { type: 'studio_status', connected: true, lastSeenAt: 999, queuedOps: 2 });
  const gone = factsFromStatus(seen, { type: 'studio_status', connected: false });
  assert.equal(gone.lastSeenAt, 999, '"last connected 4 minutes ago" is only sayable if this survives');
});

test('A PONG THAT CANNOT BE TIMED LEAVES THE LAST MEASUREMENT ALONE', () => {
  // The hazard named in studio-connection.ts: a round trip nobody timed rendered as a number, and
  // the number available here is 0 — the most reassuring value the field can hold.
  const measured = factsFromPong(NO_LINK_FACTS, { type: 'pong', t: 1000 }, 1120);
  assert.equal(measured.rttMs, 120);
  assert.equal(factsFromPong(measured, { type: 'pong' }, 2000).rttMs, 120, 'a pong with no echo measures nothing');
  assert.equal(factsFromPong(NO_LINK_FACTS, { type: 'pong' }, 2000).rttMs, null, 'and with nothing before it, stays null');
  assert.equal(factsFromPong(NO_LINK_FACTS, { type: 'pong', t: 'soon' }, 2000).rttMs, null);
  assert.equal(
    factsFromPong(measured, { type: 'pong', t: 3000 }, 2000).rttMs,
    120,
    'a pong from the future is a broken clock, not a negative round trip',
  );
});

// -------------------------------------------------------------------------------- the wiring

test('THE SOCKET KEEPS THE FACTS INSTEAD OF DROPPING THEM', () => {
  assert.match(socket, /factsFromStatus/, 'studio_status must go through the reducer');
  assert.match(socket, /factsFromPong/, 'and so must the pong');
  assert.doesNotMatch(socket, /case 'pong':\s*\n\s*break;/, 'the pong may no longer be discarded');
});

test('and the ping carries a timestamp, or there is nothing for the worker to echo', () => {
  // The worker only puts `t` on the pong when the ping had one. Without this the round trip is
  // unmeasurable no matter how carefully the pong is handled.
  assert.match(socket, /type: 'ping', t: Date\.now\(\)/, 'the ping must carry the moment it was sent');
});

test('the facts are exposed on the socket so a component can read them', () => {
  assert.match(socket, /link: StudioLinkFacts/, 'the hook must publish them under a named type');
});

test('AND SOMETHING RENDERS THE SENTENCE — the defect was never in the formatting', () => {
  assert.match(connect, /linkDetail/, 'the connection copy must call the function that produces it');
  assert.match(connect, /export function StudioLink/, 'as a component the workspace can place');
  assert.match(workspace, /<StudioLink/, 'and the workspace must place it');
  assert.match(workspace, /studio\.link/, 'fed from the live socket facts, not from a placeholder');
});

test('it is rendered for a CONNECTED Studio too, which is where the worst case lives', () => {
  // `ConnectStudio` returns null while connected, by design and with a test on it. A place
  // mismatch happens only while connected, so a link sentence that lived inside it would be
  // invisible in exactly the state it was written for.
  assert.match(connect, /export function ConnectStudio/, 'the setup card still exists');
  // Just the component's own body: both live in this file, and slicing to the end of the file
  // would read the setup card's deliberate `return null` as this one's.
  const from = connect.indexOf('export function StudioLink');
  const to = connect.indexOf('export function ConnectStudio');
  const link = from < to ? connect.slice(from, to) : connect.slice(from);
  assert.ok(from >= 0 && link.length > 100, 'the slice found nothing — this assertion would be vacuous');
  assert.match(link, /linkDetail\(status, facts/, 'the state is handed to the decider, which covers all four');
  assert.doesNotMatch(
    link,
    /=== 'connected'/,
    'and the line must not opt out of the connected state the way the setup card deliberately does',
  );
  // The card returns null while connected — checked here so the two are not accidentally merged
  // later by somebody who reads the line above as "ConnectStudio handles it".
  assert.match(
    connect.slice(connect.indexOf('export function ConnectStudio')),
    /status === 'connected'\) return null/,
    'the setup card still disappears on connection',
  );
});
