/**
 * WHAT MAY BE ATTACHED, AND WHAT THE MODEL IS TOLD WHEN IT CANNOT BE READ.
 *
 * `ChatAttachment` sat in packages/shared/src/index.ts with a `kind`, a `mime` and a `size` and
 * nothing anywhere that ever set, checked or read one of them — a declaration standing in for a
 * feature. So there was no ceiling on an attachment's size, no allowlist for its type, and no
 * answer to the question the type field implies: what happens when the bytes say one thing and
 * the Content-Type header says another.
 *
 * The rules live in @golem/shared because both ends enforce them, and both ends enforcing two
 * different copies of a limit is how a browser accepts a file the server then refuses without
 * saying why. The same single-source rule MESSAGE_MAX_CHARS already carries.
 *
 * Four properties, each written against the case that breaks it:
 *
 *   1. SIZE IS A NUMBER, NOT A FEELING. One byte over the ceiling is refused, and the refusal
 *      names the ceiling in the units a person reads.
 *
 *   2. THE HEADER IS NOT EVIDENCE. A PNG renamed to notes.txt and posted as text/plain is
 *      refused on its leading bytes. Trusting the declared type is how an "allowlist" becomes a
 *      naming convention.
 *
 *   3. AN IMAGE IS REFUSED BY NAME. Apple cannot see images on this build, and an image accepted
 *      into a message that silently drops it is worse than one that says so — the person spends
 *      the run believing it was looked at.
 *
 *   4. AN ATTACHMENT THAT COULD NOT BE READ IS SAID TO BE UNREADABLE. When the stored bytes are
 *      gone the fold must put that in the prompt in words. Omitting the block is the
 *      observation-failure shape: the model would see a message that never mentioned a file, and
 *      answer as though none had been sent.
 *
 * Run with:  node --test tests/attachment-policy.test.mjs      (from apps/worker)
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ATTACHMENT_ACCEPT,
  ATTACHMENT_MIME_ALLOWLIST,
  ATTACHMENT_PROMPT_BUDGET_CHARS,
  MAX_ATTACHMENTS_PER_MESSAGE,
  MAX_ATTACHMENT_BYTES,
  attachmentMimeFor,
  decodeAttachmentText,
  foldAttachmentsIntoPrompt,
  sniffAttachmentFormat,
  validateAttachment,
} from '@golem/shared';

const enc = new TextEncoder();
const bytes = (s) => enc.encode(s);
const filled = (n, ch = 'a') => bytes(ch.repeat(n));

/* --------------------------------------------------------------- the ceiling ---- */

test('the ceiling is one number, stated in the shared package, and it is not zero', () => {
  // A limit of 0 or Infinity would pass every "is it enforced" test below while enforcing nothing.
  assert.equal(typeof MAX_ATTACHMENT_BYTES, 'number');
  assert.ok(MAX_ATTACHMENT_BYTES > 1024, 'a ceiling under a kilobyte would refuse every real file');
  assert.ok(MAX_ATTACHMENT_BYTES <= 1024 * 1024, 'the whole file is folded into a prompt; a megabyte is not a prompt');
  assert.ok(MAX_ATTACHMENTS_PER_MESSAGE >= 1 && MAX_ATTACHMENTS_PER_MESSAGE <= 10);
});

test('a file exactly at the ceiling is accepted and one byte over is refused by name', () => {
  const at = validateAttachment({ name: 'notes.txt', declaredMime: 'text/plain', bytes: filled(MAX_ATTACHMENT_BYTES) });
  assert.equal(at.ok, true, 'the boundary itself must be inside the limit, or the number printed to the user is a lie');

  const over = validateAttachment({ name: 'notes.txt', declaredMime: 'text/plain', bytes: filled(MAX_ATTACHMENT_BYTES + 1) });
  assert.equal(over.ok, false);
  assert.equal(over.reason, 'too_large');
  // The sentence has to carry the ceiling. "Too large" without a number is a refusal the person
  // cannot act on: they do not know whether to trim a line or a chapter.
  assert.match(over.message, /32 KB/);
});

test('an empty file is refused rather than uploaded as a nothing', () => {
  const v = validateAttachment({ name: 'empty.txt', declaredMime: 'text/plain', bytes: new Uint8Array(0) });
  assert.equal(v.ok, false);
  assert.equal(v.reason, 'empty');
});

/* --------------------------------------------------------------- the type ---- */

test('the allowlist is text-bearing types only, and the accept string is built from it', () => {
  assert.ok(ATTACHMENT_MIME_ALLOWLIST.includes('text/plain'));
  assert.ok(ATTACHMENT_MIME_ALLOWLIST.includes('text/markdown'));
  assert.ok(ATTACHMENT_MIME_ALLOWLIST.includes('application/json'));
  // Nothing in the allowlist may be a format this build cannot read back as text.
  for (const mime of ATTACHMENT_MIME_ALLOWLIST) {
    assert.ok(!mime.startsWith('image/'), `${mime} is an image, and images are refused by name`);
    assert.ok(!mime.startsWith('audio/'), `${mime} is audio, and audio is refused by name`);
  }
  // The file picker must offer exactly what the server will take, or the dialog is a lie.
  for (const mime of ATTACHMENT_MIME_ALLOWLIST) assert.ok(ATTACHMENT_ACCEPT.includes(mime), `${mime} missing from accept`);
});

test('an extension resolves the type when the browser declares nothing', () => {
  // Chrome sends an empty string for .luau and .md on most platforms; a bare '' must not be read
  // as "the user attached an unknown binary".
  assert.equal(attachmentMimeFor('Door.luau', ''), 'text/x-lua');
  assert.equal(attachmentMimeFor('README.md', ''), 'text/markdown');
  assert.equal(attachmentMimeFor('data.json', 'application/octet-stream'), 'application/json');
  assert.equal(attachmentMimeFor('cover.png', 'image/png'), null, 'an image resolves to no admissible type');
});

test('an image is refused by name, not swallowed', () => {
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
  const v = validateAttachment({ name: 'screenshot.png', declaredMime: 'image/png', bytes: png });
  assert.equal(v.ok, false);
  assert.equal(v.reason, 'image_unsupported');
  assert.match(v.message, /image/i);
});

test('a PNG renamed to .txt and declared text/plain is refused on its bytes', () => {
  // THE HEADER IS NOT EVIDENCE. This is the whole reason sniffing exists: an allowlist checked
  // against a value the uploader chose is a naming convention with a security-sounding name.
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
  const v = validateAttachment({ name: 'notes.txt', declaredMime: 'text/plain', bytes: png });
  assert.equal(v.ok, false);
  assert.equal(v.reason, 'not_text');
  assert.match(v.message, /PNG/);
});

test('the sniffer names the formats it knows, and calls real text text', () => {
  assert.equal(sniffAttachmentFormat(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), 'PNG');
  assert.equal(sniffAttachmentFormat(new Uint8Array([0xff, 0xd8, 0xff, 0xe0])), 'JPEG');
  assert.equal(sniffAttachmentFormat(bytes('GIF89a....')), 'GIF');
  assert.equal(sniffAttachmentFormat(bytes('%PDF-1.7')), 'PDF');
  assert.equal(sniffAttachmentFormat(new Uint8Array([0x50, 0x4b, 0x03, 0x04])), 'ZIP');
  assert.equal(sniffAttachmentFormat(new Uint8Array([0x1f, 0x8b, 0x08])), 'GZIP');
  assert.equal(sniffAttachmentFormat(bytes('local part = Instance.new("Part")')), null);
});

test('a file with a NUL byte in it is not text, whatever it is called', () => {
  const v = validateAttachment({ name: 'thing.txt', declaredMime: 'text/plain', bytes: new Uint8Array([0x68, 0x69, 0x00, 0x68, 0x69]) });
  assert.equal(v.ok, false);
  assert.equal(v.reason, 'not_text');
});

test('invalid UTF-8 is refused rather than decoded into replacement characters', () => {
  // A lone 0xC3 is a truncated two-byte sequence. Decoding it leniently produces U+FFFD, and a
  // prompt full of  is a file the model was handed and cannot read.
  const v = validateAttachment({ name: 'broken.txt', declaredMime: 'text/plain', bytes: new Uint8Array([0x68, 0x69, 0xc3]) });
  assert.equal(v.ok, false);
  assert.equal(v.reason, 'not_text');
});

test('a well-formed text file is accepted, its name cleaned and its type resolved', () => {
  const v = validateAttachment({ name: '  ../../etc/notes.md  ', declaredMime: '', bytes: bytes('# hello\n') });
  assert.equal(v.ok, true);
  assert.equal(v.mime, 'text/markdown');
  assert.equal(v.kind, 'file');
  // A path is not a filename. Anything with a separator in it is the caller's directory layout,
  // and it has no business being echoed back into a prompt or a Content-Disposition header.
  assert.equal(v.name, 'notes.md');
});

test('a UTF-8 BOM does not make a text file binary', () => {
  const withBom = new Uint8Array([0xef, 0xbb, 0xbf, ...bytes('hello')]);
  const v = validateAttachment({ name: 'bom.txt', declaredMime: 'text/plain', bytes: withBom });
  assert.equal(v.ok, true);
  assert.equal(decodeAttachmentText(withBom), 'hello', 'the BOM is stripped rather than carried into the prompt');
});

/* --------------------------------------------------------------- the fold ---- */

test('an attached file reaches the model as a named, delimited block after the message', () => {
  const out = foldAttachmentsIntoPrompt('what is wrong with this?', [
    { name: 'Door.luau', mime: 'text/x-lua', text: 'local x = 1' },
  ]);
  assert.match(out, /^what is wrong with this\?/);
  assert.match(out, /Door\.luau/);
  assert.ok(out.includes('local x = 1'), 'the content is what makes this an attachment rather than a filename');
  // The end marker is what stops a file that itself contains dashes from swallowing the rest.
  assert.ok(out.indexOf('local x = 1') < out.lastIndexOf('Door.luau'), 'the block must be closed after its content');
});

test('a message with no attachments is returned byte-identical', () => {
  assert.equal(foldAttachmentsIntoPrompt('just a question', []), 'just a question');
});

test('the fold is bounded, and says so where it cut', () => {
  const long = 'x'.repeat(ATTACHMENT_PROMPT_BUDGET_CHARS * 2);
  const out = foldAttachmentsIntoPrompt('read this', [{ name: 'big.txt', mime: 'text/plain', text: long }]);
  assert.ok(out.length < ATTACHMENT_PROMPT_BUDGET_CHARS + 2000, 'an unbounded fold is an unbounded bill');
  assert.match(out, /truncated/i, 'a cut the model is not told about is a file it believes it read in full');
});

test('an attachment whose bytes are gone is declared unreadable, never omitted', () => {
  // THE OBSERVATION-FAILURE SHAPE. Dropping the block hands the model a message that never
  // mentions a file, and it answers the question as though nothing had been attached.
  const out = foldAttachmentsIntoPrompt('check the log', [{ name: 'run.log', mime: 'text/plain', text: null }]);
  assert.match(out, /run\.log/);
  assert.match(out, /could not be read|unreadable/i);
});

test('the budget is shared across attachments, not granted to each one', () => {
  const half = 'y'.repeat(ATTACHMENT_PROMPT_BUDGET_CHARS);
  const out = foldAttachmentsIntoPrompt('two files', [
    { name: 'a.txt', mime: 'text/plain', text: half },
    { name: 'b.txt', mime: 'text/plain', text: half },
  ]);
  assert.ok(out.length < ATTACHMENT_PROMPT_BUDGET_CHARS * 2, 'two files must not buy two budgets');
  // The second file still has to APPEAR, or the person who attached it is never told it was dropped.
  assert.match(out, /b\.txt/);
});
