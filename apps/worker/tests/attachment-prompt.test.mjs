/**
 * THE HALF THAT MAKES AN ATTACHMENT AN ATTACHMENT: it reaches the model.
 *
 * `ClientMsg` has carried `attachments?: ChatAttachment[]` since the protocol was written, and the
 * session Durable Object's `case 'chat'` read `msg.text` and `msg.mode` and nothing else. A file
 * uploaded, stored and named on the wire, and then dropped on the floor at the one place it
 * mattered, is the worst possible version of this feature: the person pays the upload, watches the
 * chip appear, and gets an answer to a question about a file nobody read.
 *
 * So the ingest is a function with its own tests rather than three lines inside a 4,000-line DO.
 *
 * The properties, each against the case that breaks it:
 *
 *   - A MISSING ATTACHMENT IS DECLARED MISSING. KV drops these bytes after
 *     ATTACHMENT_TTL_SECONDS, and a re-run of an old message must not quietly become a message
 *     with no file in it. Omitting the block is a failure to observe rendered as an observation.
 *
 *   - THE CLIENT'S CLAIMS ABOUT ITS OWN UPLOAD ARE IGNORED. Name, type and size come from the
 *     metadata stored at upload time; the socket frame is a request, not a record.
 *
 *   - A FILE OVER THE PER-MESSAGE LIMIT IS NAMED, NOT SILENTLY DROPPED.
 *
 *   - THE PROJECT COMES FROM THE BINDING. An attachment id from another project must read as
 *     missing, because the key is scoped by the project the socket is bound to and never by
 *     anything in the frame.
 *
 * Run with:  node --test tests/attachment-prompt.test.mjs      (from apps/worker)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { MAX_ATTACHMENTS_PER_MESSAGE } from '@golem/shared';
import { attachmentKvKey, promptWithAttachments } from '../src/attachments.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const SESSION = readFileSync(join(HERE, '..', 'src', 'do', 'session.ts'), 'utf8');

const enc = new TextEncoder();

/** A KV holding whatever the tests put in it, with the metadata the store writes beside the bytes. */
function kv(seed = []) {
  const map = new Map(seed);
  return {
    map,
    async getWithMetadata(key) {
      const row = map.get(key);
      if (!row) return { value: null, metadata: null };
      return { value: row.bytes.buffer.slice(row.bytes.byteOffset, row.bytes.byteOffset + row.bytes.byteLength), metadata: row.meta };
    },
    async put() {},
    async delete() {},
  };
}

const PROJECT = 'p-1';
const OTHER = 'p-2';

function stored(projectId, id, name, mime, text) {
  const bytes = enc.encode(text);
  return [attachmentKvKey(projectId, id), { bytes, meta: { name, mime, size: bytes.byteLength, expiresAt: 2 ** 31 } }];
}

const ID_A = '11111111-1111-4111-8111-111111111111';
const ID_B = '22222222-2222-4222-8222-222222222222';
const ID_C = '33333333-3333-4333-8333-333333333333';
const ID_D = '44444444-4444-4444-8444-444444444444';
const ID_E = '55555555-5555-4555-8555-555555555555';

test('no attachments leaves the message exactly as the person typed it', async () => {
  const env = { KV: kv() };
  assert.equal(await promptWithAttachments(env, PROJECT, 'just a question', undefined), 'just a question');
  assert.equal(await promptWithAttachments(env, PROJECT, 'just a question', []), 'just a question');
});

test('the stored bytes reach the prompt under the stored name', async () => {
  const env = { KV: kv([stored(PROJECT, ID_A, 'Door.luau', 'text/x-lua', 'local door = 1')]) };
  const out = await promptWithAttachments(env, PROJECT, 'why does this not open?', [{ attachmentId: ID_A, name: 'Door.luau' }]);
  assert.match(out, /^why does this not open\?/);
  assert.ok(out.includes('local door = 1'), 'the content is the entire point of an attachment');
  assert.match(out, /Door\.luau/);
});

test('the client’s claimed name is ignored in favour of the one recorded at upload', async () => {
  // A socket frame is a request, not a record. A client that renames somebody else's stored file
  // in the frame must not be able to relabel it inside the model's context.
  const env = { KV: kv([stored(PROJECT, ID_A, 'secrets.txt', 'text/plain', 'the real content')]) };
  const out = await promptWithAttachments(env, PROJECT, 'read it', [{ attachmentId: ID_A, name: 'innocent.md', mime: 'text/markdown', size: 3 }]);
  assert.match(out, /secrets\.txt/);
  assert.ok(!out.includes('innocent.md'));
});

test('an attachment whose bytes have expired is declared unreadable, never omitted', async () => {
  const env = { KV: kv() };
  const out = await promptWithAttachments(env, PROJECT, 'check the log', [{ attachmentId: ID_A, name: 'run.log' }]);
  assert.match(out, /run\.log/);
  assert.match(out, /could not be read/i);
});

test('an attachment id from another project reads as missing', async () => {
  const env = { KV: kv([stored(OTHER, ID_A, 'theirs.txt', 'text/plain', 'not yours')]) };
  const out = await promptWithAttachments(env, PROJECT, 'read it', [{ attachmentId: ID_A, name: 'theirs.txt' }]);
  assert.ok(!out.includes('not yours'), 'the key is scoped by the bound project, never by the frame');
  assert.match(out, /could not be read/i);
});

test('more files than a message may carry are named as dropped rather than silently discarded', async () => {
  const seed = [ID_A, ID_B, ID_C, ID_D, ID_E].map((id, i) => stored(PROJECT, id, `f${i}.txt`, 'text/plain', `body ${i}`));
  const env = { KV: kv(seed) };
  const out = await promptWithAttachments(
    env,
    PROJECT,
    'all of them',
    [ID_A, ID_B, ID_C, ID_D, ID_E].map((id, i) => ({ attachmentId: id, name: `f${i}.txt` })),
  );
  assert.equal(MAX_ATTACHMENTS_PER_MESSAGE, 4);
  assert.ok(out.includes('body 3'), 'the fourth file is inside the limit and must be read');
  assert.ok(!out.includes('body 4'), 'the fifth is over the limit and must not be');
  assert.match(out, /f4\.txt/, 'the dropped file has to be named, or the person never learns it was dropped');
});

test('a hostile attachments field cannot throw inside a socket handler', async () => {
  // Anything can arrive on a socket. A TypeError here takes the whole message frame down and the
  // person sees a build that never started, with no reason given.
  const env = { KV: kv() };
  assert.equal(await promptWithAttachments(env, PROJECT, 'hi', 'not-an-array'), 'hi');
  assert.equal(await promptWithAttachments(env, PROJECT, 'hi', [null, 7, 'x']), 'hi');
  const out = await promptWithAttachments(env, PROJECT, 'hi', [{ attachmentId: 'not-a-uuid', name: '../../x' }]);
  assert.match(out, /could not be read/i);
});

/* ------------------------------------------------------------- the call site ---- */

test('the session Durable Object folds attachments into the message it runs', async () => {
  // Source-level, because the run path below this line goes through quota, the agent loop and a
  // model call. What is asserted is the wiring the unit tests above cannot see: that the function
  // is CALLED, on the chat ingress, with the project id from the binding.
  assert.match(SESSION, /promptWithAttachments\(/, 'the fold has no call site — the upload goes nowhere');
  const call = SESSION.match(/promptWithAttachments\([^)]*\)/s)?.[0] ?? '';
  assert.match(call, /bind\.projectId/, 'the project must come from the binding, never from the frame');
  assert.match(call, /msg\.attachments/);
});

test('the abuse check still reads what the person typed, not the file they attached', () => {
  // Scoring a 24,000-character fold as a submission would flag every attachment as spam, and the
  // duplicate detector would stop reading the prompt the person actually wrote.
  const chat = SESSION.slice(SESSION.indexOf("case 'chat'"), SESSION.indexOf("case 'edit_resend'"));
  const abuse = chat.indexOf('refuseAbusive');
  const fold = chat.indexOf('promptWithAttachments');
  assert.ok(abuse > 0 && fold > 0, 'both calls must be on the chat ingress');
  assert.ok(abuse < fold, 'the abuse check runs on the typed text, before the file is folded in');
});
