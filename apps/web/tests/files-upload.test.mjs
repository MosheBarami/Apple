/**
 * THE RULES A FILE PICKER HAS TO KNOW BEFORE IT PICKS.
 *
 * The workspace holds text, in a declared list of extensions, up to 48 KB per file. Those limits
 * were enforced in exactly one place — the worker, at the moment of the write — so the first time a
 * user met any of them was as a refusal after choosing a file, and the sentence they got back was
 * about a path they had not typed.
 *
 * `uploadCheck` is that decision moved in front of the click, and it is pure so the cases can be
 * enumerated here rather than discovered by a customer:
 *
 *   A NAME OFF SOMEBODY'S DISK IS NOT A WORKSPACE PATH. "Level Data (final).csv" contains three
 *   characters the store's own path rule refuses. It is rewritten — and the rewrite is RETURNED, so
 *   the panel can say what the file will be called instead of quietly saving it under another name.
 *   THE CEILING IS STATED, NOT DISCOVERED. Over the limit is refused here, with the number in the
 *   sentence, before anything is read or sent.
 *   BYTES, NOT CHARACTERS, everywhere a size is compared.
 *
 * `refusalCopy` is asserted for the new code alongside them: a body that arrived as something other
 * than text must not be reported as a bad file NAME, which is the one field the user got right.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const WEB = join(dirname(fileURLToPath(import.meta.url)), '..');

const { uploadCheck, looksBinary, refusalCopy, replaceConfirm } = await import('../src/components/ws/files-model.ts');

const LIMITS = { maxFileBytes: 48 * 1024, maxVersions: 20, trashDays: 30, extensions: ['.md', '.txt', '.json', '.csv', '.luau'] };

/* ------------------------------------------------------------------ the name --- */

test('a plain name in the current folder is taken as it is', () => {
  const got = uploadCheck({ name: 'brief.md', size: 400 }, LIMITS, 'notes/');
  assert.equal(got.ok, true);
  assert.equal(got.path, 'notes/brief.md');
  assert.equal(got.renamed, false, 'nothing was changed, so nothing should be announced');
});

test('A NAME THE STORE WOULD REFUSE IS REWRITTEN, and the rewrite is reported', () => {
  const got = uploadCheck({ name: 'Level Data (final).csv', size: 900 }, LIMITS, '');
  assert.equal(got.ok, true);
  assert.match(got.path, /^[A-Za-z0-9][A-Za-z0-9._-]*\.csv$/, 'the result must satisfy the store\'s own segment rule');
  assert.equal(got.renamed, true, 'a silently renamed file is a file the user cannot find again');
});

test('a name with nothing usable in it is refused rather than turned into a guess', () => {
  const got = uploadCheck({ name: '((( ))).md', size: 10 }, LIMITS, '');
  assert.equal(got.ok, false);
  assert.match(got.why, /name/i);
});

test('a path is never built by concatenating a folder that does not end in a slash', () => {
  const got = uploadCheck({ name: 'a.md', size: 10 }, LIMITS, 'notes');
  assert.equal(got.ok, true);
  assert.equal(got.path, 'notes/a.md');
});

/* ----------------------------------------------------------------- the limits --- */

test('AN EXTENSION THE WORKSPACE DOES NOT HOLD IS REFUSED, and the sentence lists what it does', () => {
  const got = uploadCheck({ name: 'logo.png', size: 100 }, LIMITS, '');
  assert.equal(got.ok, false);
  assert.match(got.why, /\.md/, 'telling someone "no" without telling them "yes, these" is half a refusal');
  assert.match(got.why, /\.csv/);
});

test('a file with no extension at all is refused', () => {
  assert.equal(uploadCheck({ name: 'README', size: 100 }, LIMITS, '').ok, false);
});

test('THE CEILING IS STATED BEFORE THE UPLOAD, with the number in it', () => {
  const got = uploadCheck({ name: 'big.md', size: 48 * 1024 + 1 }, LIMITS, '');
  assert.equal(got.ok, false);
  assert.match(got.why, /48/, 'the limit the user just met must be in the sentence');
  // Exactly at the limit is allowed: the worker refuses only what is PAST it, and a client that
  // refused one byte earlier would be a second, stricter limit nobody declared.
  assert.equal(uploadCheck({ name: 'big.md', size: 48 * 1024 }, LIMITS, '').ok, true);
});

/* ----------------------------------------------------------------- the bytes --- */

test('a file that is not text is recognised before it is sent', () => {
  // A .txt containing a NUL is the case the extension allowlist cannot catch: the name is legal
  // and the bytes are not text. Sent as-is it would be stored as replacement characters — a file
  // that uploaded "successfully" and cannot be opened.
  assert.equal(looksBinary('the plan\nis a good one\n'), false);
  assert.equal(looksBinary('PK' + '\u0003\u0004\u0000\u0000' + 'binary'), true);
  assert.equal(looksBinary('\uFFFD'.repeat(6) + 'mostly unreadable'), true, 'a page of replacement characters is a decode that failed');
  assert.equal(looksBinary(''), false, 'an empty file is empty, not binary');
});

/* --------------------------------------------------------------- the refusals --- */

test('a body that was not text is not reported as a bad file name', () => {
  const serverSaid = 'the file has to arrive as text';
  const said = refusalCopy('bad_content', serverSaid);
  assert.notEqual(said, serverSaid, 'the new code must be translated, not fall through to the wire sentence');
  assert.doesNotMatch(said, /name/i, 'the name was the one field they got right');
  assert.match(said, /text/i);
  // And the fallback still holds for a code this build has never heard of.
  assert.equal(refusalCopy('something_new', 'the server sentence'), 'the server sentence');
});

test('replacing an existing file says what happens to the text being replaced', () => {
  const said = replaceConfirm('notes/plan.md');
  assert.match(said, /notes\/plan\.md/);
  assert.match(said, /version|back/i, 'an overwrite the user cannot undo is one they must be warned about, not asked about');
});

/* ---------------------------------------------------------------- the wiring --- */
//
// The rules above are worth nothing if the picker is not on a screen. This repo has shipped a
// finished panel that nothing imported once already — files-panel.tsx itself — so the control, the
// client call and the route are checked to be joined up rather than each assumed from the others.

const panel = readFileSync(join(WEB, 'src', 'components', 'ws', 'files-panel.tsx'), 'utf8');
const api = readFileSync(join(WEB, 'src', 'lib', 'api.ts'), 'utf8');

test('THE PICKER EXISTS, IS GATED ON PERMISSION, AND CALLS THE UPLOAD', () => {
  assert.match(panel, /type="file"/, 'there must be a real file input');
  assert.match(panel, /uploadCheck\(/, 'and the limits must be checked before it is read');
  assert.match(panel, /uploadProjectFile\(/, 'and something must actually send it');
  // canEdit hides Rename, Duplicate and Delete for a viewer; an upload control outside that guard
  // would put a viewer one click from a 403 they cannot do anything about.
  assert.match(panel, /\{canEdit && \(\n\s*<p/, 'the control must sit behind the build permission');
});

test('the occupied path is asked about, not reported as a failure', () => {
  assert.match(panel, /res\.code === 'occupied'/, 'the refusal must be recognised');
  assert.match(panel, /replaceConfirm\(/, 'and turned into a question');
  assert.match(panel, /\{ overwrite: true \}/, 'whose yes carries the overwrite');
});

test('the client posts to the route the worker actually serves', () => {
  const fn = api.slice(api.indexOf('export async function uploadProjectFile'));
  assert.match(fn.slice(0, 1800), /\/files\/content/, 'the path must be the one index.ts registers');
  assert.match(fn.slice(0, 1800), /method: 'POST'/);
  assert.match(fn.slice(0, 1800), /parsed\?\.code/, 'and the machine-readable code must survive, or refusalCopy has nothing to translate');
});
