/**
 * THE IMAGES THIS PRODUCT ALREADY PAID FOR.
 *
 * `generate_image` reserves neurons against BudgetDO, runs the model, settles the spend, and
 * called `storeImage`, which put the PNG in KV under `image:<uuid>` with a one-hour TTL. Nothing
 * anywhere read that key — not the worker, not the web app. So every image the product generated
 * was billed, stored and expired unseen. A dead code path costs nothing; this one was live and
 * discarded its output, which is the worse shape because nothing about it looks broken.
 *
 * THE SECURITY PROPERTY, which is the reason the key changed and not just the reader.
 * A bare UUID is UNGUESSABLE. It is not SCOPED. Those differ exactly when a key leaks — a shared
 * transcript, a log line, a screenshot of devtools — and at that moment an unguessable key is a
 * bearer token for an object nobody decided you could see. Putting the project in the key lets the
 * serving route re-derive authority from the thing it was asked for, instead of trusting that the
 * asker could only have arrived legitimately. The tool result carries only the id half, so a leaked
 * transcript does not carry a fetchable handle either.
 *
 * Run with:  node --test           (from apps/worker)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const WORKER = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(mkdtempSync(join(tmpdir(), 'img-')), 'img.mjs');
execFileSync(join(WORKER, 'node_modules', '.bin', 'esbuild'),
  [join(WORKER, 'src', 'imagegen.ts'), '--bundle', '--format=esm', '--target=es2022', '--outfile=' + out],
  { cwd: WORKER, stdio: 'pipe' });
const IG = await import(`file://${out}`);

function kvStub() {
  const store = new Map();
  return { store, env: { KV: { put: async (k, v, o) => store.set(k, { v, o }) } } };
}

test('the stored key carries the project, so the reader can re-derive authority', async () => {
  const { store, env } = kvStub();
  const { imageId } = await IG.storeImage(env, 'proj_abc', 'BASE64PNG');
  const key = [...store.keys()][0];
  assert.equal(key, `image:proj_abc:${imageId}`);
  assert.equal(key, IG.imageKeyFor('proj_abc', imageId), 'writer and reader must spell the key once');
});

test('only the id is returned — the namespace-qualified key never leaves the worker', async () => {
  const { env } = kvStub();
  const res = await IG.storeImage(env, 'proj_abc', 'BASE64PNG');
  assert.deepEqual(Object.keys(res), ['imageId']);
  assert.doesNotMatch(res.imageId, /proj_abc/, 'the id must not embed the project either');
  assert.doesNotMatch(res.imageId, /^image:/);
});

test('an image is still given a TTL, so a forgotten image is not stored forever', async () => {
  const { store, env } = kvStub();
  await IG.storeImage(env, 'p', 'X');
  const { o } = [...store.values()][0];
  assert.ok(o.expirationTtl > 0, 'the TTL was dropped');
  assert.equal(o.expirationTtl, IG.IMAGE_TTL_SECONDS);
});

test('two images under one project do not collide', async () => {
  const { store, env } = kvStub();
  await IG.storeImage(env, 'p', 'A');
  await IG.storeImage(env, 'p', 'B');
  assert.equal(store.size, 2);
});

test('the panel points at a path, never at the bytes', () => {
  const panel = IG.imagePanel('proj_abc', 'img_1', 'a brass lantern icon', { width: 1024, height: 1024 });
  const asset = panel.blocks[0].assets[0];
  assert.equal(panel.v, 1);
  assert.equal(panel.blocks[0].type, 'asset_picker');
  assert.equal(asset.kind, 'image');
  assert.equal(asset.thumbnail.src, '/api/projects/proj_abc/image/img_1');
  assert.doesNotMatch(asset.thumbnail.src, /^data:/, 'a 1024px PNG as a data URL blows the detail cap');
  assert.equal(asset.thumbnail.width, 1024);
  assert.ok(asset.thumbnail.alt.length > 0, 'an image with no alt text is an image a screen reader drops');
});

test('the path is built with the same helper the route will use, and is URL-encoded', () => {
  assert.equal(IG.imagePathFor('a/b', 'c d'), '/api/projects/a%2Fb/image/c%20d');
});

test('an empty subject still yields a name and alt text rather than a blank card', () => {
  const p = IG.imagePanel('p', 'i', '   ', { width: 8, height: 8 });
  const a = p.blocks[0].assets[0];
  assert.ok(a.name.length > 0);
  assert.ok(a.thumbnail.alt.length > 0);
});

test('a flatness complaint reaches the card, and its absence leaves no empty note', () => {
  const withNote = IG.imagePanel('p', 'i', 's', { width: 1, height: 1, note: 'came back photoreal' });
  assert.equal(withNote.blocks[0].assets[0].note, 'came back photoreal');
  const without = IG.imagePanel('p', 'i', 's', { width: 1, height: 1 });
  assert.equal('note' in without.blocks[0].assets[0], false, 'an absent note must be absent, not empty');
});
