/**
 * A SCRIPT THAT IS ON DISK AND MISSING FROM ITS OWN MANIFEST ROW.
 *
 * THE DEFECT, measured 2026-09-21. `generate-ui-showcase.mjs` wrote `${id}--${genre}.luau` before
 * it branched on the outcome and attached `files` only on the success path. So every failed target
 * left a real script beside the manifest that the manifest did not name — and the manifest is the
 * only index anything downstream reads. The fps_arena HUD's card carried "line 207, col 37" and
 * could not offer the file that line counts into, because `r.files` was undefined on exactly the
 * one row where the line number is the whole point.
 *
 * The generator now records it at the write site. `adoptOrphanSource` repairs the rows already on
 * disk without re-asking the model — which matters, because re-asking would change the answer and
 * a renderer fix and a different answer arriving in the same commit can never be attributed.
 *
 * WHAT IS BEING DEFENDED HERE IS THE REFUSAL, not the adoption. Deriving a filename from a naming
 * convention and writing it into evidence is asserting a link nobody checked; the only thing that
 * makes it legitimate is that the candidate has to prove it is this row's output, and that a
 * candidate which cannot is left alone. Showing him one screen's code under another screen's
 * picture is worse than showing no code at all.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { adoptOrphanSource } from './rerender-showcase.mjs';

/** A directory as a reader: name -> contents, exactly what the real one supplies. */
const disk = (files) => (name) => (name in files ? files[name] : null);

const row = (over = {}) => ({ target: 'screen-hud', id: 'screen-hud', genre: 'fps_arena', outcome: 'does_not_compile', codeChars: 11, ...over });

test('a script whose length matches the row is adopted, and the row now names it', () => {
  const r = row();
  const out = adoptOrphanSource(r, disk({ 'screen-hud--fps_arena.luau': 'local a = 1' }));
  assert.deepEqual(out, { adopted: 'screen-hud--fps_arena.luau' });
  assert.equal(r.files.luau, 'screen-hud--fps_arena.luau');
});

test('THE AIMED CASE — a file of a different length is REFUSED, not adopted on the strength of its name', () => {
  // The naming convention alone is a guess. This is the case where the guess is wrong: a file at
  // the expected path left over from an earlier run, a different answer, a truncated write. Taking
  // it would put one screen's code under another screen's picture, and nothing downstream could
  // tell.
  const r = row({ codeChars: 12466 });
  const out = adoptOrphanSource(r, disk({ 'screen-hud--fps_arena.luau': 'local a = 1' }));
  assert.match(out.refused, /11 chars, the row recorded 12466/);
  assert.equal(r.files, undefined, 'a refused candidate must not be written into the row');
});

test('a row with no codeChars has nothing to check against, so it is refused and says why', () => {
  const r = row({ codeChars: undefined });
  const out = adoptOrphanSource(r, disk({ 'screen-hud--fps_arena.luau': 'local a = 1' }));
  assert.match(out.refused, /records no codeChars/);
  assert.equal(r.files, undefined);
});

test('no file at the expected name is reported, not silently skipped', () => {
  const out = adoptOrphanSource(row(), disk({}));
  assert.match(out.refused, /no screen-hud--fps_arena\.luau on disk/);
});

test('a row that already names its source is left completely alone', () => {
  const r = row({ files: { luau: 'something-else.luau', svg: 'x.svg' } });
  assert.equal(adoptOrphanSource(r, disk({ 'screen-hud--fps_arena.luau': 'local a = 1' })), null);
  assert.equal(r.files.luau, 'something-else.luau', 'an existing source reference was overwritten');
});

test('characters, not bytes — one em dash in a comment must not defeat the check', () => {
  // `codeChars` is `code.length`, a JS string length. Counting bytes would refuse every script
  // carrying a single non-ASCII character, and a refusal nobody reads is a fix that looks applied
  // and is not. 'local a = 1 -- —' is 16 characters and 18 bytes.
  const body = 'local a = 1 -- —';
  assert.notEqual(body.length, Buffer.byteLength(body), 'the fixture must actually differ in the two units');
  const r = row({ codeChars: body.length });
  assert.deepEqual(adoptOrphanSource(r, disk({ 'screen-hud--fps_arena.luau': body })), { adopted: 'screen-hud--fps_arena.luau' });

  // AND THE SAME ANSWER FROM A BUFFER. The caller decides whether it read the file as text or as
  // bytes, and that decision must not reach this comparison — a Buffer's `.length` is 18 here.
  const asBytes = Buffer.from(body, 'utf8');
  assert.equal(asBytes.length, 18, 'the Buffer fixture must carry the byte count, or it proves nothing');
  const r2 = row({ codeChars: body.length });
  assert.deepEqual(adoptOrphanSource(r2, disk({ 'screen-hud--fps_arena.luau': asBytes })), { adopted: 'screen-hud--fps_arena.luau' });
});

test('a row that names neither an id nor a genre cannot build a candidate, and says so', () => {
  const out = adoptOrphanSource({ outcome: 'request_failed', codeChars: 3 }, disk({}));
  assert.match(out.refused, /neither an id nor a genre/);
});
