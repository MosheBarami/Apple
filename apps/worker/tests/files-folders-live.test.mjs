/**
 * A FOLDER IS A PREFIX, AND UNTIL NOW NOTHING COULD ACT ON ONE.
 *
 * The store is flat: `notes/plan.md` and `notes/ideas.md` share a prefix and the listing derives a
 * folder from it. Every operation the product had — rename, move, copy, delete, revert — took ONE
 * path, so a user who wanted `notes/` called `drafts/` had to rename each file by hand and get the
 * prefix character-perfect every time, and a user who wanted the whole folder gone had to delete
 * the files one at a time and hope they had seen all of them.
 *
 * THE DANGEROUS PART IS THE HALF-DONE BATCH, so that is what these tests are about:
 *
 *   NOTHING MOVES UNTIL EVERYTHING CAN. Every destination is validated and checked for occupancy
 *   BEFORE the first write. A batch that stops in the middle leaves a folder that exists twice,
 *   partly under each name, and no user can tell which half is which.
 *   A FOLDER DELETE IS THE SAME SOFT DELETE, once per file. Each one lands in the same trash with
 *   the same deadline and comes back the same way — a bulk operation that bypassed the recoverable
 *   path would be the one deletion in this product that cannot be undone.
 *   THE PREFIX IS VALIDATED LIKE A PATH. `../../` in a folder rename is the same escape as in a
 *   file rename, and it is refused by the same segment rule rather than by a second one written
 *   for folders.
 *
 * Run with:  node --test tests/files-folders-live.test.mjs      (from apps/worker)
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
const OUT = join(tmpdir(), `golem-files-folders-${process.pid}.mjs`);

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

const ALICE = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const BOB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const PROJECT = '33333333-3333-4333-8333-333333333333';
PROJECTS.set(PROJECT, ALICE);
MEMBERS.set(PROJECT, [{ user_id: BOB, role: 'viewer' }]);

const rows = new Map();
const kv = {
  async get(key) { return rows.get(key)?.value ?? null; },
  async getWithMetadata(key) {
    const row = rows.get(key);
    return row ? { value: row.value, metadata: row.metadata ?? null } : { value: null, metadata: null };
  },
  async put(key, value, opts = {}) { rows.set(key, { value, metadata: opts.metadata ?? null, expirationTtl: opts.expirationTtl ?? null }); },
  async delete(key) { rows.delete(key); },
  async list({ prefix = '', cursor } = {}) {
    const names = [...rows.keys()].filter((k) => k.startsWith(prefix)).sort();
    const start = cursor ? Number(cursor) : 0;
    const page = names.slice(start, start + 2);
    const complete = start + 2 >= names.length;
    return {
      keys: page.map((name) => ({ name, metadata: rows.get(name).metadata })),
      list_complete: complete,
      ...(complete ? {} : { cursor: String(start + 2) }),
    };
  },
};
const env = { KV: kv, SESSION_DO: { idFromName: (n) => n, get: () => ({ async fetch() { return new Response('{}', { status: 200 }); } }) } };

const post = (user, body) => ({
  method: 'POST',
  headers: { Authorization: `Bearer ${user}`, 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});
const as = (user) => ({ headers: { Authorization: `Bearer ${user}` } });
const base = `https://x/api/projects/${PROJECT}`;
const op = (user, body) => app.request(`${base}/files/op`, post(user, body), env);
const has = (path) => rows.has(`ws:${PROJECT}:${path}`);

function seed() {
  rows.clear();
  const put = (path, content) =>
    rows.set(`ws:${PROJECT}:${path}`, { value: content, metadata: { bytes: content.length, updatedAt: Date.now(), version: 1 } });
  put('notes/plan.md', 'the plan');
  put('notes/ideas.md', 'a door that remembers');
  put('notes/old/first.md', 'the first draft');
  put('data/rounds.csv', 'round,score\n1,10\n');
}
seed();

/* -------------------------------------------------------------- moving one --- */

test('renaming a folder moves everything under it, and nothing else', async () => {
  seed();
  const res = await op(ALICE, { op: 'move_folder', path: 'notes', to: 'drafts' });
  const body = await res.json();
  assert.equal(res.status, 200, JSON.stringify(body));
  assert.equal(body.moved, 3, 'every file under the prefix must move, including the nested one');

  assert.ok(has('drafts/plan.md'));
  assert.ok(has('drafts/ideas.md'));
  assert.ok(has('drafts/old/first.md'), 'a folder inside the folder moves with it');
  assert.equal(has('notes/plan.md'), false, 'the old prefix must be empty afterwards');
  assert.ok(has('data/rounds.csv'), 'a sibling folder was touched');
});

test('the files are the same files — a folder move is not a copy', async () => {
  seed();
  await op(ALICE, { op: 'move_folder', path: 'notes', to: 'drafts' });
  const read = await (await app.request(`${base}/files/content?path=drafts/ideas.md`, as(ALICE), env)).json();
  assert.equal(read.content, 'a door that remembers');
});

/* ------------------------------------------------------------ nothing moves --- */

test('NOTHING MOVES WHEN ONE DESTINATION IS OCCUPIED — the whole batch is refused', async () => {
  seed();
  rows.set(`ws:${PROJECT}:drafts/plan.md`, { value: 'someone else’s plan', metadata: { bytes: 20, updatedAt: Date.now(), version: 1 } });

  const res = await op(ALICE, { op: 'move_folder', path: 'notes', to: 'drafts' });
  assert.equal(res.status, 409);
  const body = await res.json();
  assert.equal(body.code, 'occupied');
  assert.match(body.error, /drafts\/plan\.md/, 'the refusal must name the file that stopped it');

  // The half-done batch is the failure this exists to prevent: a folder that exists twice, partly
  // under each name, with no way for a user to tell which half is which.
  assert.ok(has('notes/plan.md') && has('notes/ideas.md') && has('notes/old/first.md'), 'the source folder was disturbed by a refused move');
  const survivor = await (await app.request(`${base}/files/content?path=drafts/plan.md`, as(ALICE), env)).json();
  assert.equal(survivor.content, 'someone else’s plan', 'the file in the way was overwritten');
});

test('a folder rename that escapes the workspace is refused, and writes nothing outside it', async () => {
  seed();
  const res = await op(ALICE, { op: 'move_folder', path: 'notes', to: '../../elsewhere' });
  assert.equal(res.status, 400);
  assert.equal((await res.json()).code, 'bad_destination');
  assert.equal([...rows.keys()].some((k) => k.includes('elsewhere')), false);
  assert.ok(has('notes/plan.md'));
});

test('a folder that does not exist is a 404, not an empty success', async () => {
  seed();
  const res = await op(ALICE, { op: 'move_folder', path: 'nothing-here', to: 'somewhere' });
  assert.equal(res.status, 404, 'reporting "moved 0 files" as success tells the user their folder was handled');
  assert.equal((await res.json()).code, 'not_found');
});

test('a folder cannot be moved inside itself', async () => {
  seed();
  const res = await op(ALICE, { op: 'move_folder', path: 'notes', to: 'notes/archive' });
  assert.equal(res.status, 409, 'the destination is under the source: every file would move into its own new parent');
  assert.ok(has('notes/plan.md'));
});

/* --------------------------------------------------------------- deleting --- */

test('DELETING A FOLDER IS THE SAME RECOVERABLE DELETE, once per file', async () => {
  seed();
  const res = await op(ALICE, { op: 'delete_folder', path: 'notes' });
  const body = await res.json();
  assert.equal(res.status, 200, JSON.stringify(body));
  assert.equal(body.deleted, 3);
  assert.ok(body.expiresAt > body.deletedAt, 'a deletion with no deadline is not a retention window');

  const listing = await (await app.request(`${base}/files`, as(ALICE), env)).json();
  assert.equal(listing.files.some((f) => f.path.startsWith('notes/')), false, 'the folder is gone from the listing');
  const binned = listing.trash.map((t) => t.path).sort();
  assert.deepEqual(binned, ['notes/ideas.md', 'notes/old/first.md', 'notes/plan.md'], 'every file must be in the trash, not merely absent');

  // And each one comes back the ordinary way. A bulk delete that bypassed the recoverable path
  // would be the one deletion in this product that cannot be undone.
  const back = await op(ALICE, { op: 'undelete', path: 'notes/plan.md' });
  assert.equal(back.status, 200);
  const read = await (await app.request(`${base}/files/content?path=notes/plan.md`, as(ALICE), env)).json();
  assert.equal(read.content, 'the plan');
});

test('deleting a folder that does not exist is a 404, and the trash stays empty', async () => {
  seed();
  const res = await op(ALICE, { op: 'delete_folder', path: 'nope' });
  assert.equal(res.status, 404);
  const listing = await (await app.request(`${base}/files`, as(ALICE), env)).json();
  assert.equal(listing.trash.length, 0);
});

/* ------------------------------------------------------------ permissions --- */

test('a member who may read but not build is refused both folder operations, by 403', async () => {
  seed();
  assert.equal((await op(BOB, { op: 'move_folder', path: 'notes', to: 'drafts' })).status, 403);
  assert.equal((await op(BOB, { op: 'delete_folder', path: 'notes' })).status, 403);
  assert.ok(has('notes/plan.md'), 'a refused folder operation moved files anyway');
});
