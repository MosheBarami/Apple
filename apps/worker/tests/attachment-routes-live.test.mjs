/**
 * THE ATTACHMENT ROUTES, EXECUTED.
 *
 * The composer's paperclip was `disabled` with the title "Attachments aren’t supported yet", and
 * that was the honest half of the situation: there was no route to attach anything TO. Every
 * `app.post` in src/index.ts was enumerated and none of them took a file.
 *
 * This file instantiates the real Hono app against a real KV map, for the reason
 * automation-routes-live.test.mjs records: a route asserted by reading index.ts's source text is
 * satisfied by a comment.
 *
 * The properties, each written against the case that breaks it:
 *
 *   - A STRANGER GETS THE SAME 404 AS A PROJECT THAT DOES NOT EXIST, on upload, on read and on
 *     delete. An attachment store reachable by project id is a file-sharing service for whoever
 *     can guess a UUID.
 *
 *   - A READER MAY NOT WRITE. 'read' opens the bytes of an attachment somebody else put on the
 *     conversation they can see; it does not open the door to putting files into that project or
 *     to deleting them.
 *
 *   - THE SERVER SNIFFS. The browser already refuses a PNG named notes.txt, and the server refuses
 *     it again, because the browser is not a security boundary and `curl` is not a browser.
 *
 *   - THE CEILING IS ENFORCED ON THE BYTES THAT ARRIVED, not on Content-Length. A declared length
 *     is another value the uploader chose.
 *
 *   - A 413 AND A 415 ARE DISTINCT FROM A 400, because the browser has to tell "trim this file"
 *     apart from "this kind of file will never work" apart from "that was our bug".
 *
 *   - THE BYTES COME BACK AS THE TYPE THEY WERE STORED AS, with nosniff and as a download. The
 *     pricing page once shipped DOWNLOADING because an upload never sent a content type; the
 *     inverse — user bytes served inline under a type a browser will execute — is the worse half
 *     of the same mistake.
 *
 * Run with:  node --test tests/attachment-routes-live.test.mjs      (from apps/worker)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as esbuild from 'esbuild';
import { rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';
import { d1 } from './stubs/d1.mjs';
import { MAX_ATTACHMENT_BYTES } from '@golem/shared';

const HERE = dirname(fileURLToPath(import.meta.url));
const WORKER = join(HERE, '..');
const OUT = join(tmpdir(), `golem-attachment-live-${process.pid}.mjs`);

await esbuild.build({
  entryPoints: [join(WORKER, 'src', 'index.ts')],
  bundle: true, format: 'esm', target: 'es2022', outfile: OUT,
  plugins: [{
    name: 'stub-boundaries',
    setup(b) {
      b.onResolve({ filter: /^\.\/auth$/ }, () => ({ path: pathToFileURL(join(HERE, 'stubs', 'auth.mjs')).href, external: true }));
      b.onResolve({ filter: /^\.\/supa$/ }, () => ({ path: pathToFileURL(join(HERE, 'stubs', 'supa.mjs')).href, external: true }));
      b.onResolve({ filter: /^cloudflare:workers$/ }, () => ({ path: join(HERE, 'stubs', 'cloudflare-workers.mjs') }));
    },
  }],
});
const app = (await import(`file://${OUT}`)).default;
const { PROJECTS, MEMBERS } = await import(`file://${join(HERE, 'stubs', 'supa.mjs')}`);
process.on('exit', () => rmSync(OUT, { force: true }));

const ctx = { waitUntil() {}, passThroughOnException() {} };
const hit = (url, init, env) => app.request(url, init, env, ctx);

const ALICE = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const BOB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const STRANGER = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const PROJECT = '11111111-1111-4111-8111-111111111111';
PROJECTS.set(PROJECT, ALICE);

/** A KV that actually stores, because "was it written" is half of what is under test here. */
function kv() {
  const map = new Map();
  return {
    map,
    async put(key, value, opts = {}) {
      const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : new Uint8Array(value);
      map.set(key, { bytes, metadata: opts.metadata ?? null, ttl: opts.expirationTtl ?? null });
    },
    async get(key, opts) {
      const row = map.get(key);
      if (!row) return null;
      const type = typeof opts === 'string' ? opts : opts?.type;
      if (type === 'arrayBuffer') return row.bytes.buffer.slice(row.bytes.byteOffset, row.bytes.byteOffset + row.bytes.byteLength);
      return new TextDecoder().decode(row.bytes);
    },
    async getWithMetadata(key, opts) {
      const row = map.get(key);
      if (!row) return { value: null, metadata: null };
      return { value: await this.get(key, opts), metadata: row.metadata };
    },
    async delete(key) { map.delete(key); },
    async list() { return { keys: [...map.keys()].map((name) => ({ name })), list_complete: true }; },
  };
}

function envFor(db, store) {
  return {
    CORPUS: db.CORPUS,
    KV: store,
    SESSION_DO: {
      idFromName: (n) => n,
      get: () => ({ async fetch() { return new Response('{"ok":true}', { status: 200 }); } }),
    },
    ADMIN_DO: { idFromName: (n) => n, get: () => ({ async fetch() { return new Response('{}', { status: 200 }); } }) },
  };
}

function fresh() {
  MEMBERS.set(PROJECT, []);
  return { db: d1(), store: kv() };
}

const url = (p = '') => `https://x/api/projects/${PROJECT}/attachments${p}`;

function upload(user, name, body, type = 'text/plain') {
  return {
    method: 'POST',
    headers: { Authorization: `Bearer ${user}`, 'Content-Type': type },
    body,
  };
}
const as = (user) => ({ headers: { Authorization: `Bearer ${user}` } });

/* ------------------------------------------------------------------ it exists ---- */

test('the owner can attach a text file, and gets back an id, a type and a size', async () => {
  const { db, store } = fresh();
  const env = envFor(db, store);
  const res = await hit(`${url()}?name=notes.md`, upload(ALICE, 'notes.md', '# hello\n', 'text/markdown'), env);
  assert.equal(res.status, 201, 'the upload route is not registered');
  const body = await res.json();
  assert.equal(body.attachment.name, 'notes.md');
  assert.equal(body.attachment.mime, 'text/markdown');
  assert.equal(body.attachment.kind, 'file');
  assert.equal(body.attachment.size, 8);
  assert.match(body.attachment.attachmentId, /^[0-9a-f-]{36}$/);
  assert.equal(store.map.size, 1, 'nothing was actually stored');
});

test('what was uploaded reads back byte-for-byte, as its own type, and as a download', async () => {
  const { db, store } = fresh();
  const env = envFor(db, store);
  const up = await hit(`${url()}?name=Door.luau`, upload(ALICE, 'Door.luau', 'local x = 1', 'text/x-lua'), env);
  const { attachment } = await up.json();

  const res = await hit(`${url()}/${attachment.attachmentId}`, as(ALICE), env);
  assert.equal(res.status, 200);
  assert.equal(await res.text(), 'local x = 1');
  assert.match(res.headers.get('Content-Type') ?? '', /^text\/x-lua/);
  // A user's bytes are never served in a way a browser will render or run in our origin.
  assert.equal(res.headers.get('X-Content-Type-Options'), 'nosniff');
  assert.match(res.headers.get('Content-Disposition') ?? '', /^attachment/);
  assert.match(res.headers.get('Content-Disposition') ?? '', /Door\.luau/);
});

test('an attachment removed before sending is gone from the store, not merely from the screen', async () => {
  const { db, store } = fresh();
  const env = envFor(db, store);
  const up = await hit(`${url()}?name=notes.txt`, upload(ALICE, 'notes.txt', 'hello'), env);
  const { attachment } = await up.json();
  assert.equal(store.map.size, 1);

  const del = await hit(`${url()}/${attachment.attachmentId}`, { method: 'DELETE', ...as(ALICE) }, env);
  assert.equal(del.status, 200);
  assert.equal(store.map.size, 0, 'an orphan left in the store is a file the person believes they removed');

  const gone = await hit(`${url()}/${attachment.attachmentId}`, as(ALICE), env);
  assert.equal(gone.status, 404);
});

/* ------------------------------------------------------------------ who may ---- */

test('a stranger gets the same 404 as a project that does not exist — upload, read and delete', async () => {
  const { db, store } = fresh();
  const env = envFor(db, store);
  const up = await hit(`${url()}?name=notes.txt`, upload(ALICE, 'notes.txt', 'hello'), env);
  const { attachment } = await up.json();

  assert.equal((await hit(`${url()}?name=x.txt`, upload(STRANGER, 'x.txt', 'hi'), env)).status, 404);
  assert.equal((await hit(`${url()}/${attachment.attachmentId}`, as(STRANGER), env)).status, 404);
  assert.equal((await hit(`${url()}/${attachment.attachmentId}`, { method: 'DELETE', ...as(STRANGER) }, env)).status, 404);
  assert.equal(store.map.size, 1, 'a stranger must not be able to delete the owner’s attachment');
});

test('a viewer may read an attachment on the conversation they can see, and may not add or remove one', async () => {
  const { db, store } = fresh();
  const env = envFor(db, store);
  MEMBERS.set(PROJECT, [{ user_id: BOB, role: 'viewer' }]);
  const up = await hit(`${url()}?name=notes.txt`, upload(ALICE, 'notes.txt', 'hello'), env);
  const { attachment } = await up.json();

  assert.equal((await hit(`${url()}/${attachment.attachmentId}`, as(BOB), env)).status, 200);
  assert.equal((await hit(`${url()}?name=x.txt`, upload(BOB, 'x.txt', 'hi'), env)).status, 404);
  assert.equal((await hit(`${url()}/${attachment.attachmentId}`, { method: 'DELETE', ...as(BOB) }, env)).status, 404);
  assert.equal(store.map.size, 1);
});

test('an editor may attach — the role that can build is the role that can hand it a file', async () => {
  const { db, store } = fresh();
  const env = envFor(db, store);
  MEMBERS.set(PROJECT, [{ user_id: BOB, role: 'editor' }]);
  const res = await hit(`${url()}?name=notes.txt`, upload(BOB, 'notes.txt', 'hello'), env);
  assert.equal(res.status, 201);
});

/* ------------------------------------------------------------------ what may ---- */

test('a file one byte over the ceiling is refused with 413 and nothing is stored', async () => {
  const { db, store } = fresh();
  const env = envFor(db, store);
  const res = await hit(`${url()}?name=big.txt`, upload(ALICE, 'big.txt', 'a'.repeat(MAX_ATTACHMENT_BYTES + 1)), env);
  assert.equal(res.status, 413);
  const body = await res.json();
  assert.equal(body.reason, 'too_large');
  assert.match(body.error, /32 KB/);
  assert.equal(store.map.size, 0);
});

test('a lying Content-Length does not get a file past the ceiling', async () => {
  // THE DECLARED LENGTH IS ANOTHER VALUE THE UPLOADER CHOSE. A check against the header alone is
  // a check against the attacker's own arithmetic.
  const { db, store } = fresh();
  const env = envFor(db, store);
  const res = await hit(`${url()}?name=big.txt`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${ALICE}`, 'Content-Type': 'text/plain', 'Content-Length': '10' },
    body: 'a'.repeat(MAX_ATTACHMENT_BYTES + 1),
  }, env);
  assert.equal(res.status, 413);
  assert.equal(store.map.size, 0);
});

test('a PNG posted as text/plain with a .txt name is refused on its bytes', async () => {
  const { db, store } = fresh();
  const env = envFor(db, store);
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
  const res = await hit(`${url()}?name=notes.txt`, upload(ALICE, 'notes.txt', png), env);
  assert.equal(res.status, 415);
  const body = await res.json();
  assert.equal(body.reason, 'not_text');
  assert.match(body.error, /PNG/);
  assert.equal(store.map.size, 0);
});

test('an image is refused by name with the sentence the person needs', async () => {
  const { db, store } = fresh();
  const env = envFor(db, store);
  const res = await hit(`${url()}?name=shot.png`, upload(ALICE, 'shot.png', 'whatever', 'image/png'), env);
  assert.equal(res.status, 415);
  assert.equal((await res.json()).reason, 'image_unsupported');
});

test('an empty upload is refused rather than stored as a nothing', async () => {
  const { db, store } = fresh();
  const env = envFor(db, store);
  const res = await hit(`${url()}?name=empty.txt`, upload(ALICE, 'empty.txt', ''), env);
  assert.equal(res.status, 400);
  assert.equal((await res.json()).reason, 'empty');
  assert.equal(store.map.size, 0);
});

test('a crafted attachment id cannot address another namespace in the same KV store', async () => {
  const { db, store } = fresh();
  const env = envFor(db, store);
  const res = await hit(`${url()}/${encodeURIComponent('..:img:' + PROJECT)}`, as(ALICE), env);
  assert.equal(res.status, 404);
});

test('an attachment is stored under its own project, so the same id in another project is a 404', async () => {
  const OTHER = '22222222-2222-4222-8222-222222222222';
  PROJECTS.set(OTHER, ALICE);
  const { db, store } = fresh();
  const env = envFor(db, store);
  const up = await hit(`${url()}?name=notes.txt`, upload(ALICE, 'notes.txt', 'hello'), env);
  const { attachment } = await up.json();
  const res = await hit(`https://x/api/projects/${OTHER}/attachments/${attachment.attachmentId}`, as(ALICE), env);
  assert.equal(res.status, 404, 'the project half of the key must come from the path, never from the client');
  PROJECTS.delete(OTHER);
});

test('a name is a filename, never a path, by the time it is stored', async () => {
  const { db, store } = fresh();
  const env = envFor(db, store);
  const res = await hit(`${url()}?name=${encodeURIComponent('../../secrets/notes.txt')}`, upload(ALICE, 'x', 'hello'), env);
  assert.equal(res.status, 201);
  assert.equal((await res.json()).attachment.name, 'notes.txt');
});
