/**
 * THE EXPORT SAYS HOW BIG IT IS AND WHAT IT HASHES TO — executed, not read.
 *
 * export.test.mjs proves the file is COMPLETE: every message reaches it, a clipped transcript says
 * so at the top, and both formats come from one payload. None of that survives the wire. A transfer
 * cut in half is a Markdown file that ends mid-sentence and a JSON file that will not parse, and
 * the product's answer to both was to save them and say nothing.
 *
 * Two headers close that, and they are the cheap end of the problem rather than the clever one:
 *
 *   Content-Length — the body's byte length is already known at the point the Response is built, so
 *   a client can divide by something real instead of reporting a spinner for an unknown quantity.
 *   X-Golem-Export-SHA256 — the digest of the bytes ACTUALLY SENT, which is the only thing that can
 *   tell a short file from a short conversation.
 *
 * And for JSON, the same hex digest over `data.messages` travels INSIDE the file, so the transcript
 * carries its own check after it has left this origin — a header only exists during the download.
 *
 * This file instantiates the real Hono app and issues real requests, for files-routes-live.test.mjs's
 * reason: a header asserted by reading index.ts's source is satisfied by a comment.
 *
 * Run with:  node --test tests/export-integrity-live.test.mjs      (from apps/worker)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as esbuild from 'esbuild';
import { rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const WORKER = join(HERE, '..');
const OUT = join(tmpdir(), `golem-export-live-${process.pid}.mjs`);

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
const { PROJECTS } = await import(`file://${join(HERE, 'stubs', 'supa.mjs')}`);
process.on('exit', () => rmSync(OUT, { force: true }));

const ALICE = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const STRANGER = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const PROJECT = '11111111-1111-4111-8111-111111111111';
PROJECTS.set(PROJECT, ALICE);

const MESSAGES = [
  { id: 'm1', role: 'user', mode: null, content: 'build a lobby with a spinning portal', toolTrace: null, createdAt: '2026-09-14T10:00:00.000Z' },
  // Deliberately not ASCII: a Content-Length counted in CHARACTERS passes on a transcript of
  // plain English and under-declares this one, which is the transfer that then reports 118%.
  { id: 'm2', role: 'assistant', mode: 'build', content: 'Done — the portal spins 🌀 and teleports to 市场.', toolTrace: null, createdAt: '2026-09-14T10:00:09.000Z' },
];
const PAYLOAD = {
  project: { id: PROJECT, name: 'Tower Defence' },
  exportedAt: '2026-09-14T12:00:00.000Z',
  messageCount: MESSAGES.length,
  totalMessages: MESSAGES.length,
  truncated: false,
  messages: MESSAGES,
};

const env = {
  KV: { async get() { return null; }, async getWithMetadata() { return { value: null, metadata: null }; }, async put() {}, async delete() {}, async list() { return { keys: [], list_complete: true }; } },
  SESSION_DO: {
    idFromName: (n) => n,
    get: () => ({ async fetch() { return new Response(JSON.stringify(PAYLOAD), { status: 200, headers: { 'Content-Type': 'application/json' } }); } }),
  },
};

const as = (user) => ({ headers: { Authorization: `Bearer ${user}` } });
const base = `https://x/api/projects/${PROJECT}/export`;

const sha256Hex = async (text) => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
};

/* ------------------------------------------------------------- the headers --- */

for (const format of ['json', 'md']) {
  test(`the ${format} export declares its own length, in bytes rather than characters`, async () => {
    const res = await app.request(`${base}?format=${format}`, as(ALICE), env);
    assert.equal(res.status, 200);
    const body = await res.text();
    const declared = res.headers.get('Content-Length');
    assert.ok(declared, 'no Content-Length: a progress meter has nothing to divide by');
    // BYTES, NOT CHARACTERS. A transcript is full of em dashes and emoji, and `body.length` would
    // under-count every one of them — a progress bar that reaches 100% with bytes still arriving.
    assert.equal(Number(declared), new TextEncoder().encode(body).byteLength);
  });

  test(`the ${format} export carries the digest of the bytes it actually sent`, async () => {
    const res = await app.request(`${base}?format=${format}`, as(ALICE), env);
    const body = await res.text();
    const declared = res.headers.get('X-Golem-Export-SHA256');
    assert.ok(declared, 'no digest: a truncated transfer is undetectable by the recipient');
    assert.equal(declared, await sha256Hex(body), 'the digest must be of THIS body, not of the payload behind it');
  });
}

test('THE JSON FILE CARRIES ITS OWN CHECK, so it can be verified after it leaves this origin', async () => {
  const res = await app.request(`${base}?format=json`, as(ALICE), env);
  const parsed = JSON.parse(await res.text());
  assert.equal(typeof parsed.sha256, 'string', 'the transcript must carry a digest of its messages');
  assert.equal(parsed.sha256, await sha256Hex(JSON.stringify(MESSAGES)), 'over the messages, which is the part that can be clipped');
  // The completeness fields export.test.mjs pins must still be there: an integrity digest over a
  // transcript that silently dropped 4,000 messages is a checksum of the wrong file.
  assert.equal(parsed.messageCount, MESSAGES.length);
  assert.equal(parsed.truncated, false);
});

test('the markdown export is still markdown, and still an attachment', async () => {
  const res = await app.request(`${base}?format=md`, as(ALICE), env);
  assert.match(res.headers.get('Content-Type') ?? '', /text\/markdown/);
  assert.match(res.headers.get('Content-Disposition') ?? '', /^attachment; filename="/);
  const body = await res.text();
  assert.ok(body.includes('build a lobby with a spinning portal'), 'every message still reaches the file');
  assert.equal(body.includes('sha256'), false, 'the digest is a header here — a hex string in the prose would be part of the transcript');
});

test('a stranger still gets 404 — headers are not a reason to widen a route', async () => {
  const res = await app.request(base, as(STRANGER), env);
  assert.equal(res.status, 404);
  assert.equal(res.headers.get('X-Golem-Export-SHA256'), null, 'a refusal has no digest to give');
});
