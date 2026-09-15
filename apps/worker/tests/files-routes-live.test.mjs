/**
 * THE FILE ROUTES, EXECUTED — and the artifact routes, asked by a COLLABORATOR.
 *
 * Two things were true of this product's files before these routes existed. The agent wrote them,
 * and nobody could open them: `workspace_write` parked text in KV, the activity feed said "Listed
 * the project files", and no route in index.ts returned one. And the artifacts a run produced —
 * generated images, generated sound — were owner-only, so a collaborator could read the message
 * announcing an icon and get a 404 for the icon.
 *
 * This file instantiates the real Hono app and issues real requests, for the reason
 * image-route-live.test.mjs records: a route asserted by reading index.ts's source text is
 * satisfied by a comment, and a route registered on a sub-app nobody mounts passes too.
 *
 * The properties, each driven by the case that would break it:
 *
 *   - a stranger gets the same 404 everywhere, and a MEMBER who may read but not build gets 403 on
 *     a write — the two are different answers because the person needs different next steps;
 *   - a download is an attachment and is text/plain EVEN FOR notes/x.js, because the stored bytes
 *     are authored by a model and this origin is authenticated;
 *   - a delete is recoverable and the trash is visible in the listing;
 *   - a rename whose destination escapes the workspace is refused and moves nothing.
 *
 * Run with:  node --test tests/files-routes-live.test.mjs      (from apps/worker)
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
const OUT = join(tmpdir(), `golem-files-live-${process.pid}.mjs`);

await esbuild.build({
  entryPoints: [join(WORKER, 'src', 'index.ts')],
  bundle: true, format: 'esm', target: 'es2022', outfile: OUT,
  plugins: [{
    name: 'stub-boundaries',
    setup(b) {
      // External, not bundled: the stub must be ONE module instance shared with this test, or the
      // ownership set up here is invisible to the app and every request 404s for the wrong reason.
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
const CARLA = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const STRANGER = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const PROJECT = '11111111-1111-4111-8111-111111111111';
const IMAGE = '33333333-3333-4333-8333-333333333333';
const AUDIO = '44444444-4444-4444-8444-444444444444';

PROJECTS.set(PROJECT, ALICE);
// Bob may read but not build; Carla may build. Both are members, so neither is a stranger.
MEMBERS.set(PROJECT, [
  { user_id: BOB, role: 'viewer' },
  { user_id: CARLA, role: 'editor' },
]);

const PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const WAV_B64 = 'UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQAAAAA=';

/** A KV faithful in the ways the routes depend on: metadata, prefix listing, paging, delete. */
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

const env = {
  KV: kv,
  SESSION_DO: { idFromName: (n) => n, get: () => ({ async fetch() { return new Response('{}', { status: 200 }); } }) },
};

const as = (user) => ({ headers: { Authorization: `Bearer ${user}` } });
const post = (user, body) => ({
  method: 'POST',
  headers: { Authorization: `Bearer ${user}`, 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});
const base = `https://x/api/projects/${PROJECT}`;

function seed() {
  rows.clear();
  const now = Date.now();
  const put = (path, content, version = 1) =>
    rows.set(`ws:${PROJECT}:${path}`, { value: content, metadata: { bytes: new TextEncoder().encode(content).length, updatedAt: now, version } });
  put('notes/plan.md', '# the plan\nbuild a lobby\n');
  put('notes/ideas.md', 'a door that remembers');
  put('data/rounds.csv', 'round,score\n1,10\n');
  put('scripts/util.js', 'alert("not a page")');
  rows.set(`image:${PROJECT}:${IMAGE}`, { value: PNG_B64, metadata: { expiresAt: Math.floor(Date.now() / 1000) + 3600 } });
  rows.set(`audio:${PROJECT}:${AUDIO}`, { value: WAV_B64, metadata: { contentType: 'audio/wav', expiresAt: Math.floor(Date.now() / 1000) + 3600 } });
}
seed();

/* ---------------------------------------------------------------- it exists --- */

test('the owner can list the project files, with sizes and a total', async () => {
  seed();
  const res = await app.request(`${base}/files`, as(ALICE), env);
  assert.equal(res.status, 200, 'the listing route is not registered');
  const body = await res.json();
  assert.deepEqual(
    body.files.map((f) => f.path).sort(),
    ['data/rounds.csv', 'notes/ideas.md', 'notes/plan.md', 'scripts/util.js'],
    'a listing that stops at KV\'s first page renders as a complete one',
  );
  assert.equal(body.fileCount, 4);
  assert.ok(body.totalBytes > 0, 'storage use must be reported, not left for the user to add up');
  assert.deepEqual(body.folders.map((f) => f.name).sort(), ['data', 'notes', 'scripts']);
  assert.equal(body.limits.maxFileBytes > 0, true, 'the ceiling must be stated where the usage is');
});

test('the owner can read one file back', async () => {
  seed();
  const res = await app.request(`${base}/files/content?path=notes/plan.md`, as(ALICE), env);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.content, '# the plan\nbuild a lobby\n');
  assert.equal(body.version, 1);
});

/* ----------------------------------------------------------- who may do what --- */

test('a stranger gets 404 from every file route, read or write', async () => {
  seed();
  const listing = await app.request(`${base}/files`, as(STRANGER), env);
  const content = await app.request(`${base}/files/content?path=notes/plan.md`, as(STRANGER), env);
  const history = await app.request(`${base}/files/history?path=notes/plan.md`, as(STRANGER), env);
  const op = await app.request(`${base}/files/op`, post(STRANGER, { op: 'delete', path: 'notes/plan.md' }), env);
  assert.deepEqual([listing.status, content.status, history.status, op.status], [404, 404, 404, 404]);
  assert.ok(rows.has(`ws:${PROJECT}:notes/plan.md`), "a stranger's delete reached the store");
});

test('a member who may read but not build reads the files and is REFUSED the write, by 403', async () => {
  seed();
  const listing = await app.request(`${base}/files`, as(BOB), env);
  assert.equal(listing.status, 200, 'a shared collaborator must be able to see the project files');

  const rename = await app.request(`${base}/files/op`, post(BOB, { op: 'rename', path: 'notes/plan.md', to: 'notes/mine.md' }), env);
  assert.equal(rename.status, 403, 'a viewer who is told 404 goes looking for a missing file instead of at their role');
  assert.ok(rows.has(`ws:${PROJECT}:notes/plan.md`), 'a refused rename moved the file anyway');
});

test('a member who may build can rename, and the file moves', async () => {
  seed();
  const res = await app.request(`${base}/files/op`, post(CARLA, { op: 'rename', path: 'notes/plan.md', to: 'notes/final.md' }), env);
  assert.equal(res.status, 200, await res.text());
  assert.ok(!rows.has(`ws:${PROJECT}:notes/plan.md`));
  assert.ok(rows.has(`ws:${PROJECT}:notes/final.md`));
});

/* ------------------------------------------------------------------ the ops --- */

test('a rename whose destination escapes the workspace is refused, and moves nothing', async () => {
  seed();
  const res = await app.request(`${base}/files/op`, post(ALICE, { op: 'rename', path: 'notes/plan.md', to: '../../other/plan.md' }), env);
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.equal(body.code, 'bad_destination', 'the refusal must name WHICH path was the problem');
  assert.ok(rows.has(`ws:${PROJECT}:notes/plan.md`));
  assert.equal([...rows.keys()].some((k) => k.includes('other/plan.md')), false, 'the traversal wrote a key outside the workspace');
});

test('a delete is recoverable, shows in the trash, and comes back', async () => {
  seed();
  const del = await app.request(`${base}/files/op`, post(ALICE, { op: 'delete', path: 'notes/ideas.md' }), env);
  assert.equal(del.status, 200);
  const delBody = await del.json();
  assert.ok(delBody.expiresAt > delBody.deletedAt, 'a deletion with no deadline is not a retention window');

  const listing = await (await app.request(`${base}/files`, as(ALICE), env)).json();
  assert.equal(listing.files.some((f) => f.path === 'notes/ideas.md'), false);
  assert.deepEqual(listing.trash.map((t) => t.path), ['notes/ideas.md'], 'a listing that hides the trash tells the user their work is gone');
  assert.ok(listing.trashRetentionDays >= 1);

  const back = await app.request(`${base}/files/op`, post(ALICE, { op: 'undelete', path: 'notes/ideas.md' }), env);
  assert.equal(back.status, 200);
  const read = await (await app.request(`${base}/files/content?path=notes/ideas.md`, as(ALICE), env)).json();
  assert.equal(read.content, 'a door that remembers');
});

test('a duplicate gets a free name when none is given, and never lands on a live file', async () => {
  seed();
  const first = await app.request(`${base}/files/op`, post(ALICE, { op: 'copy', path: 'notes/plan.md' }), env);
  assert.equal(first.status, 200);
  assert.equal((await first.json()).to, 'notes/plan-copy.md');
  const second = await app.request(`${base}/files/op`, post(ALICE, { op: 'copy', path: 'notes/plan.md' }), env);
  assert.equal((await second.json()).to, 'notes/plan-copy-2.md', 'the second duplicate overwrote the first');

  const clash = await app.request(`${base}/files/op`, post(ALICE, { op: 'copy', path: 'notes/plan.md', to: 'notes/ideas.md' }), env);
  assert.equal(clash.status, 409);
  const ideas = await (await app.request(`${base}/files/content?path=notes/ideas.md`, as(ALICE), env)).json();
  assert.equal(ideas.content, 'a door that remembers', 'a refused copy destroyed the destination');
});

test('history lists every kept version, and an earlier one can be read and reinstated', async () => {
  seed();
  // Both writes go through the ROUTES, so the history under test is the history a user's own
  // actions produce rather than one a test helper arranged.
  await app.request(`${base}/files/op`, post(ALICE, { op: 'copy', path: 'notes/plan.md', to: 'notes/v.md' }), env);
  await app.request(`${base}/files/op`, post(ALICE, { op: 'revert', path: 'notes/v.md', version: 1 }), env);

  const history = await (await app.request(`${base}/files/history?path=notes/v.md`, as(ALICE), env)).json();
  assert.deepEqual(history.versions.map((v) => v.version), [2, 1], 'a revert must write forward, not erase');
  assert.equal(history.versions[0].current, true);

  const old = await app.request(`${base}/files/content?path=notes/v.md&version=1`, as(ALICE), env);
  assert.equal(old.status, 200);
  assert.equal((await old.json()).version, 1);

  const absent = await app.request(`${base}/files/content?path=notes/v.md&version=99`, as(ALICE), env);
  assert.equal(absent.status, 404, 'a version that is not kept must not fall back to the current text');
});

test('an unknown operation is refused by name rather than treated as one of the others', async () => {
  seed();
  const res = await app.request(`${base}/files/op`, post(ALICE, { op: 'destroy', path: 'notes/plan.md' }), env);
  assert.equal(res.status, 400);
  assert.match((await res.json()).error, /destroy/);
  assert.ok(rows.has(`ws:${PROJECT}:notes/plan.md`), 'an unknown op was executed as a delete');
});

/* ---------------------------------------------------------------- downloads --- */

test('a download is an attachment, and a .js file is still served as text', async () => {
  seed();
  const res = await app.request(`${base}/files/content?path=scripts/util.js&download=1`, as(ALICE), env);
  assert.equal(res.status, 200);
  assert.match(res.headers.get('Content-Disposition'), /^attachment; filename="util.js"$/);
  assert.match(res.headers.get('Content-Type'), /^text\/plain/, 'model-authored bytes must never be served as script from our own origin');
  assert.equal(res.headers.get('X-Content-Type-Options'), 'nosniff');
  assert.equal(await res.text(), 'alert("not a page")');
});

/* --------------------------------------------- the artifacts a run produced --- */

test('a collaborator can fetch the image the run generated, and a stranger cannot', async () => {
  seed();
  const bob = await app.request(`${base}/images/${IMAGE}`, as(BOB), env);
  assert.equal(bob.status, 200, 'a share that hands over the prose and withholds the output is not a share of the work');
  assert.equal(bob.headers.get('Content-Type'), 'image/png');

  const stranger = await app.request(`${base}/images/${IMAGE}`, as(STRANGER), env);
  assert.equal(stranger.status, 404);
});

test('a collaborator can fetch the sound, and it can actually be downloaded', async () => {
  seed();
  const inline = await app.request(`${base}/audio/${AUDIO}`, as(BOB), env);
  assert.equal(inline.status, 200);
  assert.match(inline.headers.get('Content-Disposition'), /^inline; /, 'the existing player must keep working');

  const download = await app.request(`${base}/audio/${AUDIO}?download=1`, as(ALICE), env);
  assert.match(download.headers.get('Content-Disposition'), /^attachment; filename="apple-[0-9a-f-]+\.wav"$/);
  assert.equal(download.headers.get('Content-Type'), 'audio/wav');

  const stranger = await app.request(`${base}/audio/${AUDIO}`, as(STRANGER), env);
  assert.equal(stranger.status, 404);
});
