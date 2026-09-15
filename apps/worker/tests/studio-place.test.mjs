/**
 * WHICH PLACE THIS PROJECT'S OPS MAY LAND IN.
 *
 * The plugin's session is a plugin-wide Studio setting. Open a different place in the same Studio
 * and the session follows it: before this module existed, `placeId` and `gameId` arrived on every
 * state event and were compared to nothing, so the project's ops were applied to whatever place
 * happened to be open.
 *
 * The hard half is NOT refusing. `game.PlaceId` is 0 for a place never saved to Roblox and can
 * read 0 transiently while a place loads, and those two are indistinguishable here. A guard that
 * treats 0 as "a different place" breaks a legitimate user, intermittently. So the tests below
 * spend as much effort on what must NOT be refused as on what must.
 *
 * Run with:  node --test tests/studio-place.test.mjs      (from apps/worker)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const out = join(mkdtempSync(join(tmpdir(), 'studioplace-')), 'studio-place.mjs');
execFileSync(join(HERE, '..', 'node_modules', '.bin', 'esbuild'),
  [join(HERE, '..', 'src', 'studio-place.ts'), '--bundle', '--format=esm', '--platform=neutral',
   '--main-fields=main,module', '--outfile=' + out], { stdio: 'pipe' });
const { placeAdmission, readPlaceReport, cleanPlaceName, identifiable, servesOps, mismatchMessage } = await import(out);

const NOW = 1_700_000_000_000;
const report = (over = {}) => ({ placeId: 111, gameId: 900, placeName: 'Tower Defence', ...over });
const bound = (over = {}) => ({ placeId: 111, gameId: 900, placeName: 'Tower Defence', boundAt: NOW - 1000, ...over });

// ------------------------------------------------------------------ the control

test('CONTROL: the same place is admitted and served', () => {
  // Without this every refusal below could pass because the module refuses everything.
  const a = placeAdmission(bound(), report(), NOW);
  assert.equal(a.verdict, 'match');
  assert.equal(a.changed, false, 'an unchanged place must not provoke a storage write');
  assert.equal(servesOps(a), true);
});

test('CONTROL: the first identifiable sighting binds, and binding is what later comparisons use', () => {
  const a = placeAdmission(null, report(), NOW);
  assert.equal(a.verdict, 'bind');
  assert.deepEqual(a.place, { placeId: 111, gameId: 900, placeName: 'Tower Defence', boundAt: NOW });
  assert.equal(servesOps(a), true);
  // and what it bound is what a later poll is judged against
  assert.equal(placeAdmission(a.place, report(), NOW + 5).verdict, 'match');
});

// ------------------------------------------------------------------ the refusal this exists for

test('A DIFFERENT PLACE IS REFUSED, and no ops are served', () => {
  const a = placeAdmission(bound(), report({ placeId: 222, placeName: 'My Other Game' }), NOW);
  assert.equal(a.verdict, 'mismatch');
  assert.equal(servesOps(a), false, 'a mismatched place must be served nothing');
  assert.equal(a.expected.placeId, 111);
  assert.equal(a.open.placeId, 222);
});

test('a different place IN THE SAME UNIVERSE is still a different place', () => {
  // A universe holds many places. Matching on gameId alone would admit the lobby's ops into the
  // dungeon, which is the mistake this guard is for and the one a lazy comparison makes.
  const a = placeAdmission(bound({ gameId: 900 }), report({ placeId: 222, gameId: 900 }), NOW);
  assert.equal(a.verdict, 'mismatch');
});

test('the refusal names BOTH places, because the user has to tell them apart in Studio', () => {
  const msg = mismatchMessage(bound({ placeName: 'Tower Defence' }), report({ placeId: 222, placeName: 'Scratch Pad' }));
  assert.ok(msg.includes('Tower Defence'), msg);
  assert.ok(msg.includes('Scratch Pad'), msg);
  // and it says what to do, in terms of things that exist
  assert.match(msg, /re-pair|Reopen/i);
});

// ------------------------------------------------------------------ what must NOT be refused

test('AN UNSAVED PLACE IS UNVERIFIED, NEVER A MISMATCH', () => {
  // placeId 0 means "cannot tell" — a place never saved to Roblox, or one still loading. Reading
  // that as "a different place" reports a failure to observe as an observation, and does it to a
  // user who has done nothing wrong.
  const a = placeAdmission(bound(), report({ placeId: 0, gameId: 0, placeName: 'Place1' }), NOW);
  assert.equal(a.verdict, 'unverified');
  assert.equal(a.reason, 'unsaved-place');
  assert.equal(servesOps(a), true, 'an unidentifiable place must still be served');
  assert.equal(a.place.placeId, 111, 'and the existing binding is left exactly as it was');
});

test('a poll carrying no state at all is unverified, not a mismatch', () => {
  // The plugin only sends `state` every twelfth poll; the other eleven carry nothing about the
  // place. Refusing those would refuse 11 polls in 12.
  const a = placeAdmission(bound(), null, NOW);
  assert.equal(a.verdict, 'unverified');
  assert.equal(a.reason, 'no-report');
  assert.equal(servesOps(a), true);
});

test('AN UNSAVED PLACE IS NEVER BOUND, so a later real place is not judged against a zero', () => {
  // If 0 were bound, the first published save would look like a mismatch and lock the user out of
  // their own project the moment they published it.
  const a = placeAdmission(null, report({ placeId: 0, gameId: 0 }), NOW);
  assert.equal(a.verdict, 'unverified');
  assert.equal(a.place, null);
  // and publishing it later binds cleanly rather than conflicting
  assert.equal(placeAdmission(null, report({ placeId: 777 }), NOW).verdict, 'bind');
});

test('publishing a bound place fills in its gameId without becoming a mismatch', () => {
  // Same placeId, gameId 0 -> 900. That is one place gaining a universe, not two places.
  const a = placeAdmission(bound({ gameId: 0 }), report({ gameId: 900 }), NOW);
  assert.equal(a.verdict, 'match');
  assert.equal(a.changed, true, 'the refreshed universe is worth persisting');
  assert.equal(a.place.gameId, 900);
});

test('renaming a place is not repairing to a new one', () => {
  const a = placeAdmission(bound(), report({ placeName: 'Tower Defence 2' }), NOW);
  assert.equal(a.verdict, 'match');
  assert.equal(a.changed, true);
  assert.equal(a.place.placeName, 'Tower Defence 2');
  assert.equal(a.place.placeId, 111);
});

// ------------------------------------------------------------------ untrusted input

test('place names are stripped of control characters before they are stored or shown', () => {
  // The name reaches the web UI, the plugin dock AND the model's system prompt.
  const esc = String.fromCharCode(27);
  assert.equal(cleanPlaceName('Tower ' + esc + '[31m Defence\n'), 'Tower [31m Defence');
  assert.equal(cleanPlaceName('  spaced  '), 'spaced');
  assert.equal(cleanPlaceName(42), '');
  assert.equal(cleanPlaceName(undefined), '');
  assert.ok(cleanPlaceName('x'.repeat(500)).length <= 96, 'a name is capped rather than unbounded');
});

test('a hostile id degrades to "cannot tell", not to a comparison against garbage', () => {
  for (const bad of [-1, 1.5, NaN, Infinity, '12; drop', null, {}]) {
    const r = readPlaceReport({ placeId: bad, gameId: bad, placeName: 'x' });
    assert.equal(r.placeId, 0, `${String(bad)} must not survive as an id`);
    assert.equal(identifiable(r), false);
    // and it therefore refuses nothing
    assert.equal(placeAdmission(bound(), r, NOW).verdict, 'unverified');
  }
});

test('a numeric string id IS an id — the wire is not trusted to keep Studio numbers numeric', () => {
  const r = readPlaceReport({ placeId: '222', gameId: '900', placeName: 'Other' });
  assert.equal(r.placeId, 222);
  assert.equal(identifiable(r), true);
  assert.equal(placeAdmission(bound(), r, NOW).verdict, 'mismatch');
});

test('a body that says nothing about a place is not a place report', () => {
  assert.equal(readPlaceReport(null), null);
  assert.equal(readPlaceReport({ kind: 'log', message: 'hi' }), null);
  assert.equal(readPlaceReport('game'), null);
  assert.deepEqual(readPlaceReport({ placeName: 'Only a name' }), { placeId: 0, gameId: 0, placeName: 'Only a name' });
});
