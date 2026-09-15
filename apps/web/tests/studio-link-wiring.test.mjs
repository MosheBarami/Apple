/**
 * THE FACTS ARRIVE, AND THEY REACH THE SCREEN.
 *
 * studio-link.test.mjs proves the SENTENCES are right. It could not prove that anything produces
 * the facts they format, and nothing did: `handleServerMsg` read `studioConnected` and `state` off
 * `hello` and `studio_status` and dropped `studioLastSeenAt`, `queuedOps`, `studioPlace`,
 * `placeMismatch` and the `pong` echo on the floor. Every formatter in studio-connection.ts —
 * `lastSeenLabel`, `latencyLabel`, `queueLabel`, `linkDetail` — had exactly one caller in the
 * repository, that test file. The worker measured all of it, put it on the wire, and no user ever
 * saw a heartbeat, a round trip, a queue depth or the reason their green pill built nothing.
 *
 * TWO KINDS OF TEST HERE, and the split is deliberate.
 *
 *   The reduction is BEHAVIOURAL: `linkFactsFrom` is a pure function and is driven with real
 *   message shapes, including the hostile ones an older worker sends.
 *
 *   The rendering is STRUCTURAL: apps/web has no DOM renderer, so these read workspace.tsx's
 *   source and pin the wiring, in the same style and for the same reason as
 *   usage-page-wiring.test.mjs. Each one failed before the change.
 *
 * Run with:  node --test tests/studio-link-wiring.test.mjs      (from apps/web)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { linkFactsFrom, NO_LINK_FACTS, linkDetail } from '../src/lib/studio-connection.ts';

const WEB = join(dirname(fileURLToPath(import.meta.url)), '..');
/** Source with comments stripped, so a field discussed in prose is not mistaken for one in use. */
const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const socket = code(readFileSync(join(WEB, 'src', 'lib', 'use-project-socket.ts'), 'utf8'));
const workspace = code(readFileSync(join(WEB, 'src', 'routes', 'workspace.tsx'), 'utf8'));
const note = code(readFileSync(join(WEB, 'src', 'components', 'ws', 'studio-link-note.tsx'), 'utf8'));

const PLACE = { placeId: 111, gameId: 900, placeName: 'Tower Defence', boundAt: 1_699_000_000_000 };

// ------------------------------------------------------------------ hello carries the whole picture

test('A TAB OPENED WHILE STUDIO IS ALREADY ATTACHED LEARNS EVERYTHING FROM `hello`', () => {
  // This is the case that was most wrong. `studio_status` is only sent when a plugin transitions
  // from absent to present, so a refresh mid-session got `hello` and nothing else — and `hello`
  // has carried the heartbeat, the depth and the place all along.
  const f = linkFactsFrom(NO_LINK_FACTS, {
    type: 'hello', sessionId: 'p', studioConnected: true, quota: {},
    studioLastSeenAt: 1_700_000_000_000, queuedOps: 3, studioPlace: PLACE,
  });
  assert.equal(f.lastSeenAt, 1_700_000_000_000);
  assert.equal(f.queuedOps, 3);
  assert.equal(f.place.placeName, 'Tower Defence');
});

test('`studio_status` carries the same facts plus the one only it knows', () => {
  const f = linkFactsFrom(NO_LINK_FACTS, {
    type: 'studio_status', connected: true, lastSeenAt: 1_700_000_000_000, queuedOps: 2, place: PLACE,
    placeMismatch: { expectedPlaceName: 'Tower Defence', openPlaceName: 'Scratch Pad', openPlaceId: 222 },
  });
  assert.equal(f.lastSeenAt, 1_700_000_000_000);
  assert.equal(f.queuedOps, 2);
  assert.equal(f.placeMismatch.openPlaceName, 'Scratch Pad');
});

test('A MISMATCH THAT IS RESOLVED IS CLEARED, not remembered', () => {
  // The worker sends `placeMismatch: null` the moment the user switches back. Keeping the previous
  // value would leave "nothing will build" printed over a link that is building.
  const seen = linkFactsFrom(NO_LINK_FACTS, {
    type: 'studio_status', connected: true,
    placeMismatch: { expectedPlaceName: 'A', openPlaceName: 'B', openPlaceId: 2 },
  });
  assert.ok(seen.placeMismatch);
  const cleared = linkFactsFrom(seen, { type: 'studio_status', connected: true, placeMismatch: null });
  assert.equal(cleared.placeMismatch, null);
});

test('a place binding the worker has cleared is cleared here too', () => {
  // `/studio/place/rebind` and `/studio/revoke` both broadcast `place: null`. A remembered place
  // would name a binding that no longer exists.
  const bound = linkFactsFrom(NO_LINK_FACTS, { type: 'studio_status', connected: true, place: PLACE });
  assert.equal(bound.place.placeId, 111);
  assert.equal(linkFactsFrom(bound, { type: 'studio_status', connected: false, place: null }).place, null);
});

// ------------------------------------------------------------------ an absent field is not a value

test('A FIELD AN OLDER WORKER NEVER SENDS MUST NOT OVERWRITE WHAT IS KNOWN', () => {
  // `queuedOps` absent is "this build does not say", and rendering that as 0 is a failure to
  // observe wearing the clothes of an observation — "nothing is waiting" is the reassuring one.
  const known = linkFactsFrom(NO_LINK_FACTS, { type: 'studio_status', connected: true, queuedOps: 4, place: PLACE });
  const quiet = linkFactsFrom(known, { type: 'studio_status', connected: true });
  assert.equal(quiet.queuedOps, 4, 'an absent depth reset a known one to zero');
  assert.equal(quiet.place.placeId, 111, 'and an absent place forgot the binding');
});

test('junk on the wire is refused rather than rendered', () => {
  const f = linkFactsFrom(NO_LINK_FACTS, {
    type: 'hello', sessionId: 'p', studioConnected: true, quota: {},
    studioLastSeenAt: 'yesterday', queuedOps: '3', studioPlace: 'Tower Defence',
  });
  assert.equal(f.lastSeenAt, null);
  assert.equal(f.queuedOps, 0);
  assert.equal(f.place, null);
  // and the formatter it feeds still says nothing rather than something broken
  assert.equal(linkDetail('connected', f, 1_700_000_000_000), null);
});

test('a message that is not about the link leaves the link alone', () => {
  const known = linkFactsFrom(NO_LINK_FACTS, { type: 'studio_status', connected: true, queuedOps: 4 });
  assert.equal(linkFactsFrom(known, { type: 'delta', msgId: 'm', text: 'hi' }), known);
});

// ------------------------------------------------------------------ the round trip is measured

test('THE PING CARRIES THE BROWSER’S OWN CLOCK, and the pong is no longer discarded', () => {
  // The worker echoes `t` back untouched precisely so the whole measurement happens in one clock
  // domain. The browser sent no `t` and answered `case "pong": break;`, so nothing was ever timed.
  assert.match(socket, /type: 'ping', t: Date\.now\(\)/, 'the ping must carry a timestamp to echo');
  assert.match(socket, /case 'pong':[\s\S]{0,400}?msg\.t/, 'the pong must be read, not discarded');
  assert.match(socket, /typeof msg\.t === 'number'/, 'a pong without `t` must leave the rtt unmeasured, not zero');
});

test('the hook actually reduces the link facts instead of reading two fields off hello', () => {
  assert.match(socket, /linkFactsFrom/, 'use-project-socket must call the reducer');
  assert.match(socket, /link: StudioLinkFacts/, 'and expose the facts on the studio state');
});

// ------------------------------------------------------------------ and it is on the screen

test('THE SENTENCE IS RENDERED UNDER THE PILL — every formatter had zero callers in src/', () => {
  // The whole chain, because any broken link in it puts the sentence back in the test file only:
  // the route mounts the note, hands it the facts the socket now keeps, and the note calls the
  // formatter. `linkDetail` had one caller in the repository before this and it was studio-link.test.
  assert.match(workspace, /import \{ StudioLinkNote \} from '\.\.\/components\/ws\/studio-link-note'/);
  assert.match(workspace, /<StudioLinkNote\b/, 'the route must render it');
  assert.match(workspace, /facts=\{studio\.link\}/, 'fed from the facts the socket now keeps');
  assert.match(note, /linkDetail\(/, 'and the note must actually call the formatter');
});

test('the pill names the place even when `state` never arrived', () => {
  // `studio.state` only lands on the transition message. A tab that refreshed while Studio was
  // already attached fell back to the literal word "Studio" with the place sitting unread on hello.
  assert.match(workspace, /studio\.state\?\.placeName \?\? studio\.link\.place\?\.placeName/,
    'prefer the reported place, then the bound one, then the generic word');
});

test('A MISMATCH OFFERS THE ONE BUTTON THAT ENDS IT', () => {
  // The sentence names the problem; without this the user reads "nothing will build" and has
  // nowhere to click. The route has existed since the place guard shipped.
  assert.match(workspace, /rebindPlaceRequest\(projectId\)/, 'the rebind call must be wired');
  assert.ok(/studio\.link\.placeMismatch/.test(workspace), 'and shown only while there IS a mismatch');
});

// ------------------------------------------------------------------ discarding the waiting work

const api = code(readFileSync(join(WEB, 'src', 'lib', 'api.ts'), 'utf8'));
const dialog = code(readFileSync(join(WEB, 'src', 'components', 'pairing-dialog.tsx'), 'utf8'));

test('THE WAITING WORK CAN BE DISCARDED, and only while there is any', () => {
  // Automatic cancellation existed — a run that ends takes its queued ops with it — and explicit
  // cancellation did not: no route and no DO path cleared the queue on request, so a user whose
  // Studio closed mid-build watched the depth climb with no control over it.
  //
  // The control lives on the connection record beside Disconnect and Rebind, which is where the
  // other three Studio routes are already called from; a second Studio surface would be two ways
  // into one subject, which is the duplication this repository keeps finding.
  assert.match(api, /studio\/queue/, 'api.ts must have the call');
  assert.match(api, /discardStudioQueue[\s\S]{0,240}?method: 'DELETE'/, 'and it is a DELETE, which is what the session listens for');
  assert.match(dialog, /discardStudioQueue\(projectId\)/, 'the record must make it');
  assert.match(dialog, /link\.queuedOps > 0 &&/, 'offered only when there is something to discard');
});
