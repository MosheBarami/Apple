/**
 * THE FILE THIS MODULE SAID IT HAD.
 *
 * `files-model.ts` opens with "Pure and DOM-free so `tests/files-model.test.mjs` runs it under
 * `node --test`, which is how the rules below get asserted at all" — and that file did not exist
 * anywhere in the tree. Four stated rules, no assertion behind any of them, and a header that read
 * as coverage to anyone auditing the module. That is the observation-failure shape exactly: a
 * claim about verification standing in for the verification.
 *
 * So this file tests the four rules the module names, in the module's own words:
 *
 *   A SIZE THAT WAS NEVER RECORDED IS NOT A SIZE   — -1 never sums as zero, anywhere.
 *   A DELETION IS DESCRIBED BY ITS DEADLINE        — including past it, and at the plural boundary.
 *   A PREVIEW NEVER PRETENDS TO BE THE WHOLE FILE  — it reports the cut and the real total.
 *   A REFUSAL IS TRANSLATED BY ITS CODE            — and an unknown code keeps the server's words.
 *
 * Imported as TypeScript directly, like view-state.test.mjs: the module is type-erasable, so node
 * strips the types and runs the same source the browser gets. No build step to drift.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

const {
  browseRows,
  breadcrumbs,
  parentPrefix,
  deleteConfirm,
  formatFileBytes,
  previewKindFor,
  previewOf,
  refusalCopy,
  revertConfirm,
  storageSummary,
  trashLine,
  MAX_PREVIEW_LINES,
  MAX_TABLE_ROWS,
} = await import('../src/components/ws/files-model.ts');

const file = (path, bytes, updatedAt = 1_700_000_000_000) => ({ path, bytes, updatedAt });

const listing = (over = {}) => ({
  prefix: '',
  files: [],
  folders: [],
  fileCount: 0,
  totalBytes: 0,
  unmeasured: 0,
  limits: { maxFileBytes: 49_152, maxVersions: 20, trashDays: 30, extensions: ['.md'] },
  trash: [],
  trashRetentionDays: 30,
  ...over,
});

/* ------------------------------------------------------------------ browsing --- */

test('A SIZE THAT WAS NEVER RECORDED IS NOT A SIZE — -1 is never summed into a folder total', () => {
  const rows = browseRows([file('notes/a.md', 100), file('notes/b.md', -1), file('notes/c.md', 50)], '');
  const folder = rows.find((r) => r.kind === 'folder' && r.name === 'notes');
  assert.ok(folder, 'the shared prefix must become a folder row');
  assert.equal(folder.bytes, 150, 'the unrecorded file must be skipped, not added as 0');
  assert.equal(folder.fileCount, 3, 'but it is still a file, and is still counted as one');
  // The failure this guards against is a folder that says "150 B" over three files and reads as
  // complete. The count disagreeing with the bytes is the only signal the user gets, so it stays.
});

test('one level at a time: a nested file becomes a folder, not a row with a slash in it', () => {
  const rows = browseRows([file('a.md', 1), file('deep/b.md', 2), file('deep/deeper/c.md', 3)], '');
  assert.deepEqual(
    rows.map((r) => `${r.kind}:${r.name}`),
    ['folder:deep', 'file:a.md'],
    'folders first, then files, and nothing from below the current level',
  );
  const inside = browseRows([file('deep/b.md', 2), file('deep/deeper/c.md', 3)], 'deep');
  assert.deepEqual(inside.map((r) => `${r.kind}:${r.name}`), ['folder:deeper', 'file:b.md']);
});

test('a prefix is accepted with or without its trailing slash, and both mean the same folder', () => {
  const files = [file('deep/b.md', 2)];
  assert.deepEqual(browseRows(files, 'deep'), browseRows(files, 'deep/'));
});

test('the crumbs always start at the root, so there is always a way back out', () => {
  assert.deepEqual(breadcrumbs(''), [{ label: 'Files', prefix: '' }]);
  assert.deepEqual(breadcrumbs('a/b'), [
    { label: 'Files', prefix: '' },
    { label: 'a', prefix: 'a' },
    { label: 'b', prefix: 'a/b' },
  ]);
  assert.equal(parentPrefix('a/b'), 'a');
  assert.equal(parentPrefix('a'), '', 'up from the top level is the root, not undefined');
  assert.equal(parentPrefix(''), '', 'and up from the root stays at the root');
});

/* ------------------------------------------------------------------- storage --- */

test('the summary names what it could not measure rather than folding it into the total', () => {
  const quiet = storageSummary(listing({ fileCount: 3, totalBytes: 2048 }));
  assert.ok(!quiet.lines.some((l) => l.includes('not measured')), 'nothing to say when nothing was missed');

  const loud = storageSummary(listing({ fileCount: 5, totalBytes: 2048, unmeasured: 2 }));
  assert.ok(loud.lines.includes('2 not measured'), `expected the unmeasured line, got ${loud.lines.join(' · ')}`);
});

test('the per-file ceiling is in the summary, so it is not first met as an error', () => {
  const s = storageSummary(listing({ fileCount: 1, totalBytes: 10, limits: { maxFileBytes: 49_152, maxVersions: 20, trashDays: 30, extensions: [] } }));
  assert.ok(s.lines.some((l) => l.endsWith('per file')), 'the limit must be stated before it is hit');
  assert.equal(s.maxFileBytes, 49_152, 'and read from the server rather than written in prose');
});

test('one file is "1 file"; the plural is not welded on', () => {
  assert.ok(storageSummary(listing({ fileCount: 1 })).lines[0] === '1 file');
  assert.ok(storageSummary(listing({ fileCount: 0 })).lines[0] === '0 files');
});

test('bytes are rendered at the scale they are, and never rounded up into a bigger unit', () => {
  assert.equal(formatFileBytes(0), '0 B');
  assert.equal(formatFileBytes(1023), '1023 B');
  assert.equal(formatFileBytes(1024), '1.0 KB');
  assert.equal(formatFileBytes(1024 * 1024), '1.0 MB');
});

/* --------------------------------------------------------------------- trash --- */

const NOW = 1_700_000_000_000;
const trashed = (expiresAt) => ({ path: 'a.md', bytes: 10, deletedAt: NOW - 1000, expiresAt });

test('A DELETION IS DESCRIBED BY ITS DEADLINE — past it, it says so plainly', () => {
  assert.equal(trashLine(trashed(NOW - 1), NOW), 'no longer recoverable');
  assert.equal(trashLine(trashed(NOW), NOW), 'no longer recoverable', 'the deadline itself is past');
  // The alternative — a countdown that reaches "0 more days" and sits there — reads as a live
  // window, and the Bring back button beside it would then be a promise nothing can keep.
});

test('under a day it counts in hours, because "0 more days" is not a deadline', () => {
  assert.equal(trashLine(trashed(NOW + 5 * 3_600_000), NOW), 'recoverable for 5 more hours');
  assert.equal(trashLine(trashed(NOW + 3_600_000), NOW), 'recoverable for 1 more hour');
  assert.equal(trashLine(trashed(NOW + 60_000), NOW), 'recoverable for 1 more hour', 'a minute left still reads as time left, never as none');
});

test('exactly one day reads "day", not "days"', () => {
  assert.equal(trashLine(trashed(NOW + 86_400_000), NOW), 'recoverable for 1 more day');
  assert.equal(trashLine(trashed(NOW + 2 * 86_400_000), NOW), 'recoverable for 2 more days');
});

test('the delete confirmation states the window, which is the whole point of it', () => {
  const said = deleteConfirm('plan.md', 30);
  assert.match(said, /plan\.md/);
  assert.match(said, /30 days/, 'a confirmation that does not name the window is asking for a blind yes');
  assert.match(revertConfirm('plan.md', 3), /version 3 of plan\.md/);
});

/* ------------------------------------------------------------------ previews --- */

test('A PREVIEW NEVER PRETENDS TO BE THE WHOLE FILE — a 60-row CSV says 60', () => {
  const csv = Array.from({ length: 60 }, (_, i) => `${i},row`).join('\n');
  const p = previewOf('data/rows.csv', csv);
  assert.equal(p.kind, 'table');
  assert.equal(p.truncated, true);
  assert.equal(p.totalRows, 60, 'the real total, not the number shown');
  assert.equal(p.rows.length, MAX_TABLE_ROWS, 'and the cut is at the stated cap');
});

test('a CSV that fits is not labelled as cut', () => {
  const p = previewOf('a.csv', 'one,two\nthree,four');
  assert.equal(p.truncated, false);
  assert.equal(p.totalRows, 2);
  assert.equal(p.columns, 2);
});

test('a long text file reports the real line count beside the cut one', () => {
  const text = Array.from({ length: MAX_PREVIEW_LINES + 40 }, (_, i) => `line ${i}`).join('\n');
  const p = previewOf('notes.md', text);
  assert.equal(p.truncated, true);
  assert.equal(p.lines, MAX_PREVIEW_LINES + 40, 'the file’s length, not the preview’s');
  assert.equal(p.text.split('\n').length, MAX_PREVIEW_LINES);
});

test('a .luau file is code, and an unknown extension falls back to prose rather than to nothing', () => {
  assert.equal(previewKindFor('src/Main.luau'), 'code');
  assert.equal(previewKindFor('a.json'), 'data');
  assert.equal(previewKindFor('a.csv'), 'table');
  assert.equal(previewKindFor('a.md'), 'prose');
  assert.equal(previewKindFor('mystery.wat'), 'prose', 'an unknown type is still readable text');
  assert.equal(previewKindFor('LICENSE'), 'prose', 'and so is a file with no extension at all');
  assert.equal(previewOf('mystery.wat', 'hello').kind, 'prose');
});

test('the extension is read from the file name, not from a dot in a folder above it', () => {
  assert.equal(previewKindFor('v1.2/notes.md'), 'prose');
  assert.equal(previewKindFor('v1.2/table.csv'), 'table');
  assert.equal(previewKindFor('.gitignore'), 'prose', 'a leading dot is a name, not an extension');
});

/* --------------------------------------------------------------------- copy --- */

test('A REFUSAL IS TRANSLATED BY ITS CODE — and an unknown code keeps the server’s own sentence', () => {
  const server = 'the workspace is sealed during a migration';
  assert.equal(refusalCopy('something_new', server), server, 'the server knows something this build does not');
  assert.equal(refusalCopy(undefined, server), server, 'and so does a refusal that carried no code');
});

test('the codes this build does know are rewritten for the person who pressed the button', () => {
  for (const code of ['bad_path', 'bad_destination', 'not_found', 'occupied', 'not_in_trash', 'no_such_version', 'same_path', 'too_large']) {
    const said = refusalCopy(code, 'API SENTENCE');
    assert.notEqual(said, 'API SENTENCE', `${code} must have its own copy`);
    assert.ok(said.length > 10 && /[.!]$/.test(said), `${code} must read as a sentence`);
  }
  assert.match(refusalCopy('occupied', ''), /already a file with that name/);
});
