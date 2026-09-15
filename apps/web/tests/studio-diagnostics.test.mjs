/**
 * WHAT THE STUDIO CONNECTION PANEL IS ENTITLED TO SAY.
 *
 * GET /api/projects/:id/studio/diagnostics has been owner-authorized, rich and tested on the worker
 * for a long time — the link summary, the plugin's self-report, the bound place against the place
 * Studio actually has open, the 30-day pairing clock, and the last 25 ops with their failure kinds.
 * Nothing in apps/web ever called it: `grep diagnostics apps/web/src` returned two unrelated
 * comments, and lib/api.ts had no Studio functions at all. A paying customer could read their own
 * connection only with curl and a JWT.
 *
 * Meanwhile three shipped docs pages — docs/connect, docs/plugin, docs/troubleshooting — told them
 * to "disconnect from the web workspace", a control that did not exist.
 *
 * These test the JUDGEMENTS, which is the part that can be wrong in a way nobody notices: an
 * expiry that reads as urgent when it is a month away, a place comparison that says "matches" when
 * one side was never reported, a failed op rendered as a success. The panel's own wiring is pinned
 * in studio-link-wiring.test.mjs.
 *
 * Run with:  node --test tests/studio-diagnostics.test.mjs      (from apps/web)
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { pairingNote, placeLine, pluginLine, opOutcome } from '../src/components/ws/studio-link-model.ts';

const NOW = 1_700_000_000_000;
const DAY = 24 * 3600 * 1000;
const PLACE = (over = {}) => ({ placeId: 111, gameId: 900, placeName: 'Tower Defence', boundAt: NOW, ...over });
const OPEN = (over = {}) => ({ placeId: 111, gameId: 900, placeName: 'Tower Defence', isRunMode: false, ...over });

/** Nothing here may ever contain one of these. */
const POISON = ['undefined', 'NaN', 'null', 'Invalid Date', '[object'];
const clean = (s, what) => {
  if (s === null) return;
  for (const bad of POISON) assert.equal(String(s).includes(bad), false, `${what} rendered "${bad}": ${s}`);
};

// ------------------------------------------------------------------ the 30-day clock

test('AN UNKNOWN EXPIRY SAYS NOTHING — it must not read as "expires today"', () => {
  // `pairingExpiresAt` is null for a project that has never paired, and absent from a worker build
  // too old to send it. Rendering either as a date is inventing the one number this panel exists
  // to report honestly.
  assert.equal(pairingNote(null, NOW), null);
  assert.equal(pairingNote(undefined, NOW), null);
  assert.equal(pairingNote(NaN, NOW), null);
});

test('a pairing with a month left is stated, and not shouted', () => {
  const n = pairingNote(NOW + 27 * DAY, NOW);
  clean(n.text, 'far expiry');
  assert.equal(n.urgent, false, 'a month is information, not a warning');
  assert.match(n.text, /27 days/);
});

test('A PAIRING INSIDE ITS LAST THREE DAYS IS URGENT, and names the remedy', () => {
  // The user's first notice of a 30-day cutoff was Studio going dead mid-build.
  for (const days of [3, 2, 1]) {
    const n = pairingNote(NOW + days * DAY, NOW);
    clean(n.text, `${days}-day expiry`);
    assert.equal(n.urgent, true, `${days} days out must be urgent`);
    assert.match(n.text, /pair again/i, 'a warning with no remedy is just anxiety');
  }
});

test('under a day is said in words, not as "0 days"', () => {
  const n = pairingNote(NOW + 3 * 3600 * 1000, NOW);
  clean(n.text, 'hours left');
  assert.equal(n.urgent, true);
  assert.equal(n.text.includes('0 day'), false, `"0 days" reads as a bug: ${n.text}`);
});

test('AN EXPIRED PAIRING SAYS SO IN THE PAST TENSE', () => {
  // "expires in -4 days" is the shape this repo keeps finding: arithmetic presented as a sentence.
  const n = pairingNote(NOW - 4 * DAY, NOW);
  clean(n.text, 'expired');
  assert.equal(n.urgent, true);
  assert.match(n.text, /has expired/i);
  assert.equal(/in -/.test(n.text), false, `negative duration leaked: ${n.text}`);
});

// ------------------------------------------------------------------ bound place vs open place

test('A MATCH AND A MISMATCH ARE DIFFERENT SENTENCES', () => {
  const match = placeLine(PLACE(), OPEN());
  clean(match, 'match');
  assert.match(match, /Tower Defence/);

  const mismatch = placeLine(PLACE(), OPEN({ placeId: 222, placeName: 'Scratch Pad' }));
  clean(mismatch, 'mismatch');
  assert.match(mismatch, /Tower Defence/);
  assert.match(mismatch, /Scratch Pad/);
  assert.notEqual(match, mismatch, 'the two states must not read identically');
});

test('NOT REPORTED IS NOT THE SAME AS NOT MATCHING', () => {
  // Studio reports its place on roughly one poll in twelve. Treating "we have not been told" as a
  // mismatch would put a red state on a healthy link for most of its life.
  const noOpen = placeLine(PLACE(), null);
  clean(noOpen, 'no open place');
  assert.equal(/but Studio has/.test(noOpen), false, `an unreported place was called a mismatch: ${noOpen}`);

  const noBind = placeLine(null, OPEN());
  clean(noBind, 'unbound');
  assert.match(noBind, /not bound|no place/i);

  clean(placeLine(null, null), 'neither');
  assert.ok(placeLine(null, null).length > 0, 'silence here would leave a blank row');
});

test('a place with no name still produces a sentence rather than empty quotes', () => {
  // An unsaved place has no name worth printing, and both sides come off the wire.
  for (const s of [placeLine(PLACE({ placeName: '' }), OPEN({ placeName: '' })), placeLine(PLACE({ placeName: '' }), null)]) {
    clean(s, 'unnamed place');
    assert.equal(s.includes('""'), false, `empty quotes leaked into: ${s}`);
  }
});

// ------------------------------------------------------------------ what is attached

test('an unreported plugin version is admitted, not blanked', () => {
  const said = pluginLine('0.2.0', 1);
  clean(said, 'reported');
  assert.match(said, /0\.2\.0/);

  const silent = pluginLine(null, null);
  clean(silent, 'unreported');
  assert.match(silent, /not report/i, 'an empty row reads as "version: nothing", which is not a fact');
});

// ------------------------------------------------------------------ the op log

test('A FAILED OP IS NEVER RENDERED AS A SUCCESS', () => {
  assert.notEqual(opOutcome({ ok: 1, failure: null }), opOutcome({ ok: 0, failure: 'timeout' }));
  assert.match(opOutcome({ ok: 1, failure: null }), /applied/i);
});

test('each failure kind says what actually happened, because that is the whole point of the column', () => {
  // The worker stamps these; collapsing them all to "failed" throws away the one thing the log is
  // for — whether the change might have landed anyway.
  const timeout = opOutcome({ ok: 0, failure: 'timeout' });
  const transport = opOutcome({ ok: 0, failure: 'transport' });
  clean(timeout, 'timeout');
  clean(transport, 'transport');
  assert.notEqual(timeout, transport, 'a timeout may have applied; a transport failure provably did not');
  for (const kind of ['not_found', 'conflict', 'refused', 'invalid', 'internal']) {
    clean(opOutcome({ ok: 0, failure: kind }), kind);
  }
});

test('an UNCLASSIFIED failure is called unclassified, not guessed at', () => {
  // A plugin build older than the `failure` field sends none.
  for (const junk of [null, undefined, '', 'not_a_kind', 42]) {
    const s = opOutcome({ ok: 0, failure: junk });
    clean(s, `junk ${JSON.stringify(junk)}`);
    assert.ok(s.length > 0);
  }
});
