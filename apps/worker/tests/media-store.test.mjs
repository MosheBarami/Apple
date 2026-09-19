/**
 * The media store, and specifically the two things that make it safe to move bytes out of KV.
 *
 * Generated images and audio lived in KV with `expirationTtl: 3600` — a picture the product made
 * for someone was gone an hour later. R2 has no expiry, which fixes that and creates a different
 * obligation: `erasure.ts` deletes a user's data by listing KV BY PREFIX, so media moving to R2
 * without the erasure path learning R2 would mean account deletion silently stopped covering every
 * image, audio file and attachment. That is a legal hole rather than a bug, so the sweep is tested
 * here beside the writer rather than in a follow-up.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const WORKER = join(HERE, '..');
const out = join(mkdtempSync(join(tmpdir(), 'media-store-')), 'media-store.mjs');
execFileSync(join(WORKER, 'node_modules', '.bin', 'esbuild'),
  [join(WORKER, 'src', 'media-store.ts'), '--bundle', '--format=esm', '--platform=neutral', '--outfile=' + out],
  { stdio: 'pipe' });
const M = await import(pathToFileURL(out).href);

/** A bucket that behaves like R2 in the ways this module depends on, and records what it was told. */
function fakeBucket() {
  const objects = new Map();
  return {
    objects,
    puts: [],
    deletes: [],
    lists: 0,
    async put(key, bytes, opts) {
      this.puts.push({ key, opts });
      objects.set(key, { bytes, contentType: opts?.httpMetadata?.contentType ?? null });
    },
    async get(key) {
      const o = objects.get(key);
      if (!o) return null;
      return { httpMetadata: { contentType: o.contentType }, arrayBuffer: async () => o.bytes.buffer ?? o.bytes };
    },
    async list({ prefix, limit = 1000 }) {
      this.lists += 1;
      const keys = [...objects.keys()].filter((k) => k.startsWith(prefix)).slice(0, limit);
      return { objects: keys.map((key) => ({ key })) };
    },
    async delete(keys) {
      const list = Array.isArray(keys) ? keys : [keys];
      this.deletes.push(list);
      for (const k of list) objects.delete(k);
    },
  };
}

const bytes = (s) => new TextEncoder().encode(s);

test('the key puts the project SECOND, which is what makes a project sweepable', () => {
  assert.equal(M.mediaKey('image', 'p1', 'abc'), 'image/p1/abc');
  // If the id ever came before the project, erasure could not list a project's objects at all, and
  // the failure would look like "deletion worked" rather than like an error.
  for (const kind of M.MEDIA_KINDS) {
    assert.ok(M.mediaKey(kind, 'p1', 'x').startsWith(`${kind}/p1/`), `${kind} key is not project-prefixed`);
  }
});

test('with no bucket bound, every call answers null instead of throwing', async () => {
  const env = {};
  assert.equal(M.mediaStore(env), null);
  assert.equal(await M.putMedia(env, 'image', 'p1', 'a', bytes('x'), 'image/png'), null);
  assert.equal(await M.getMedia(env, 'image', 'p1', 'a'), null);
  // A deployment that never had the binding must degrade to its old path, not fail its first write.
  const erased = await M.eraseProjectMedia(env, 'p1');
  assert.equal(erased.status, 'unavailable');
  assert.match(erased.detail, /no media bucket/);
});

test('a write records its content type on the object, so a reader needs no sidecar', async () => {
  const MEDIA = fakeBucket();
  const stored = await M.putMedia({ MEDIA }, 'image', 'p1', 'a', bytes('hello'), 'image/png');
  assert.equal(stored.key, 'image/p1/a');
  assert.equal(stored.size, 5);
  assert.equal(MEDIA.puts[0].opts.httpMetadata.contentType, 'image/png');
  // The project id is on the object as well as in the key, so an object in hand is auditable.
  assert.equal(MEDIA.puts[0].opts.customMetadata.projectId, 'p1');
  const read = await M.getMedia({ MEDIA }, 'image', 'p1', 'a');
  assert.equal(read.contentType, 'image/png');
});

test('a missing object reads as null — the same answer as no bucket, because the caller does the same thing', async () => {
  const MEDIA = fakeBucket();
  assert.equal(await M.getMedia({ MEDIA }, 'image', 'p1', 'nope'), null);
});

test('ERASURE TAKES EVERY KIND, AND NOTHING FROM ANOTHER PROJECT', async () => {
  const MEDIA = fakeBucket();
  const env = { MEDIA };
  await M.putMedia(env, 'image', 'p1', 'a', bytes('1'), 'image/png');
  await M.putMedia(env, 'audio', 'p1', 'b', bytes('2'), 'audio/mpeg');
  await M.putMedia(env, 'attachment', 'p1', 'c', bytes('3'), 'text/plain');
  await M.putMedia(env, 'image', 'p2', 'd', bytes('4'), 'image/png');

  const erased = await M.eraseProjectMedia(env, 'p1');
  assert.equal(erased.status, 'erased');
  assert.equal(erased.objects, 3, 'a kind was missed — erasure must cover images, audio AND attachments');
  assert.deepEqual([...MEDIA.objects.keys()], ['image/p2/d'], "another project's media was deleted, or p1's survived");
});

test('the sweep re-lists rather than paging, because a cursor taken before a delete is stale', async () => {
  const MEDIA = fakeBucket();
  const env = { MEDIA };
  for (let i = 0; i < 2500; i += 1) await M.putMedia(env, 'image', 'p1', `i${i}`, bytes('x'), 'image/png');
  const erased = await M.eraseProjectMedia(env, 'p1');
  assert.equal(erased.status, 'erased');
  assert.equal(erased.objects, 2500);
  assert.equal(MEDIA.objects.size, 0);
  // More than one list per kind: it went back to the start after deleting, rather than trusting a
  // cursor into a listing that no longer existed.
  assert.ok(MEDIA.lists > M.MEDIA_KINDS.length, 'the sweep listed once per kind — it is paging, not re-listing');
});

test('a sweep that runs out of budget says PARTIAL rather than reporting a clean erasure', async () => {
  const MEDIA = fakeBucket();
  const env = { MEDIA };
  for (let i = 0; i < M.MEDIA_SWEEP_MAX + 10; i += 1) {
    await M.putMedia(env, 'image', 'p1', `i${i}`, bytes('x'), 'image/png');
  }
  const erased = await M.eraseProjectMedia(env, 'p1');
  // The worst answer this function can give is "erased" over an incomplete sweep.
  assert.equal(erased.status, 'partial');
  assert.equal(erased.objects, M.MEDIA_SWEEP_MAX);
  assert.match(erased.detail, /run it again/);
  assert.ok(MEDIA.objects.size > 0, 'the fixture did not actually exceed the limit — this check is vacuous');
});

test('the guard fails if erasure stops covering a kind', async () => {
  // Falsification: the shape of the hole is one kind being forgotten, which a test that only writes
  // images would never see.
  const MEDIA = fakeBucket();
  const env = { MEDIA };
  await M.putMedia(env, 'audio', 'p1', 'b', bytes('2'), 'audio/mpeg');
  const onlyImages = async (projectId) => {
    const listed = await MEDIA.list({ prefix: `image/${projectId}/` });
    await MEDIA.delete(listed.objects.map((o) => o.key));
    return { status: 'erased', objects: listed.objects.length };
  };
  const bad = await onlyImages('p1');
  assert.equal(bad.status, 'erased', 'the mutation did not run');
  assert.equal(MEDIA.objects.size, 1, 'the audio object should have survived the broken sweep');
  // The real one takes it.
  const good = await M.eraseProjectMedia(env, 'p1');
  assert.equal(good.objects, 1);
  assert.equal(MEDIA.objects.size, 0);
});
