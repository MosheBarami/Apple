/**
 * EVERY FILE AT ONCE — and read back with this repo's own ZIP reader, not with a claim.
 *
 * The workspace could be downloaded one file per request. A project with thirty notes in it was
 * thirty clicks, and the only way to keep a copy of the whole thing was to make all of them.
 *
 * WHY A HAND-WRITTEN, STORED ZIP. There is no zip WRITER in this tree and adding a dependency to
 * Workers has a measured cost — unzip.ts's header records resvg adding 2.4 MB to every cold start
 * and being taken back out. A stored (method 0) archive is a documented fixed-layout structure and
 * about a hundred lines, and compression buys little on a workspace of small text files.
 *
 * WHAT THIS FILE PROVES, and it is the reason it is worth the space: the archive is parsed by
 * `listZip` and `extractFromZip` — the reader this repo already ships and already trusts for
 * third-party archives, which reads the CENTRAL DIRECTORY rather than the local headers and refuses
 * anything it cannot account for. A writer checked only by its own reader proves nothing; this one
 * is checked by a reader that was written for somebody else's files.
 *
 * Run with:  node --test tests/files-archive-live.test.mjs      (from apps/worker)
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
const OUT = join(tmpdir(), `golem-files-archive-${process.pid}.mjs`);
const UNZIP_OUT = join(tmpdir(), `golem-unzip-${process.pid}.mjs`);

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
await esbuild.build({ entryPoints: [join(WORKER, 'src', 'unzip.ts')], bundle: true, format: 'esm', target: 'es2022', outfile: UNZIP_OUT });
const app = (await import(`file://${OUT}`)).default;
const { listZip, extractFromZip } = await import(`file://${UNZIP_OUT}`);
const { PROJECTS, MEMBERS } = await import(`file://${join(HERE, 'stubs', 'supa.mjs')}`);
process.on('exit', () => { rmSync(OUT, { force: true }); rmSync(UNZIP_OUT, { force: true }); });

const ALICE = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const BOB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const STRANGER = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const PROJECT = '44444444-4444-4444-8444-444444444444';
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

const as = (user) => ({ headers: { Authorization: `Bearer ${user}` } });
const base = `https://x/api/projects/${PROJECT}`;

const FILES = {
  'notes/plan.md': '# the plan\nbuild a lobby — and a portal that spins 🌀\n',
  'notes/ideas.md': 'a door that remembers',
  'data/rounds.csv': 'round,score\n1,10\n2,40\n',
  'scripts/util.luau': 'local function ping() return "pong" end\nreturn ping\n',
};

function seed() {
  rows.clear();
  for (const [path, content] of Object.entries(FILES)) {
    rows.set(`ws:${PROJECT}:${path}`, {
      value: content,
      metadata: { bytes: new TextEncoder().encode(content).length, updatedAt: Date.now(), version: 1 },
    });
  }
}
seed();

const archive = async (user) => {
  const res = await app.request(`${base}/files/archive`, as(user), env);
  return { res, bytes: res.status === 200 ? await res.arrayBuffer() : null };
};

/* ------------------------------------------------------------- the archive --- */

test('THE ARCHIVE HOLDS EVERY FILE, and this repo\'s own reader can read it', async () => {
  seed();
  const { res, bytes } = await archive(ALICE);
  assert.equal(res.status, 200, 'the archive route is not registered');
  assert.match(res.headers.get('Content-Type') ?? '', /application\/zip/);

  const listing = listZip(bytes);
  assert.equal(listing.ok, true, listing.error ?? '');
  assert.deepEqual(listing.entries.map((e) => e.name).sort(), Object.keys(FILES).sort(), 'the entry names must be the workspace paths');

  for (const [path, content] of Object.entries(FILES)) {
    const got = await extractFromZip(bytes, (entries) => entries.find((e) => e.name === path));
    assert.equal(got.ok, true, `${path}: ${got.error ?? ''}`);
    assert.equal(new TextDecoder().decode(got.bytes), content, `${path} came out of the archive changed`);
  }
});

test('the sizes in the directory are the real byte lengths, not character counts', async () => {
  seed();
  const { bytes } = await archive(ALICE);
  const listing = listZip(bytes);
  for (const entry of listing.entries) {
    const expected = new TextEncoder().encode(FILES[entry.name]).byteLength;
    assert.equal(entry.uncompressedSize, expected, `${entry.name} declares the wrong size`);
    // Stored, so the two are equal — and a reader that inflated a stored entry would get nonsense.
    assert.equal(entry.compressedSize, expected);
    assert.equal(entry.method, 0, 'stored: nothing here is worth deflating and a wrong method is unreadable');
  }
});

test('the download is an attachment named after the project', async () => {
  seed();
  const { res } = await archive(ALICE);
  const disposition = res.headers.get('Content-Disposition') ?? '';
  assert.match(disposition, /^attachment; filename="[a-z0-9-]+\.zip"$/, 'the filename must be a slug, since the project name is user-controlled');
});

test('a deleted file is not in the archive — the trash is not part of the workspace', async () => {
  seed();
  await app.request(`${base}/files/op`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${ALICE}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ op: 'delete', path: 'notes/ideas.md' }),
  }, env);
  const { bytes } = await archive(ALICE);
  const names = listZip(bytes).entries.map((e) => e.name);
  assert.equal(names.includes('notes/ideas.md'), false, 'a file the user deleted must not come back inside a download of everything');
  assert.equal(names.length, 3);
});

/* ---------------------------------------------------------------- refusals --- */

test('an empty workspace is a refusal with a sentence, not a zip of nothing', async () => {
  rows.clear();
  const { res } = await archive(ALICE);
  assert.equal(res.status, 404, 'an archive containing no files saves as a file that opens as nothing');
  const body = await res.json();
  assert.match(body.error, /no files/i);
});

test('a member who can read the project can download it; a stranger gets 404', async () => {
  seed();
  assert.equal((await archive(BOB)).res.status, 200, 'reading the files and reading them all at once is the same permission');
  assert.equal((await archive(STRANGER)).res.status, 404);
});
