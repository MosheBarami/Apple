/**
 * PUTTING A FILE INTO YOUR OWN PROJECT — executed against the real app.
 *
 * Every file in the workspace arrived one way: the agent wrote it. `workspace_write` is a tool, so
 * the only way a person could put a design brief, a CSV of level data or a note where Apple can
 * read it was to paste the whole thing into the chat and ask Apple to save it — which costs a turn,
 * costs credits, and passes the text through a model that may reword it.
 *
 * The panel said so in its own header: "NO UPLOAD. There is no object store behind this worker."
 * That is true of BINARY and it was over-stated for text. The workspace is a text store with a
 * declared extension list and a 48 KB per-file ceiling, and a .md file is exactly what it holds.
 *
 * FOUR DECISIONS, each tested by the case that would break it:
 *
 *   1. THE SAME RULES AS THE AGENT'S WRITES. One `checkWorkspacePath`, one size ceiling, one
 *      extension list — in workspace-files.ts, where the module header already says the rules have
 *      to be identical whoever asks. A second validator on the person-facing route is a second
 *      chance to differ, and the direction it differs in is the traversal that only one of them
 *      refused.
 *   2. AN OCCUPIED PATH IS A REFUSAL, NOT AN OVERWRITE — the same rule copy and move already keep.
 *      A user who picks `plan.md` from their disk must not silently replace the plan Apple wrote.
 *      `overwrite: true` is how they say they meant it, and the replaced text survives as a version
 *      because every write archives the previous one.
 *   3. A REFUSAL WRITES NOTHING. Each refusal below asserts the store afterwards, because "refused"
 *      and "refused after writing half of it" are different events and only one of them is safe.
 *   4. IT IS A BUILD PERMISSION. A viewer gets 403 — they already know the project exists, and a
 *      404 would send them looking for a missing file instead of at their own role.
 *
 * Run with:  node --test tests/files-upload-live.test.mjs      (from apps/worker)
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
const OUT = join(tmpdir(), `golem-files-upload-${process.pid}.mjs`);

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
const CARLA = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const STRANGER = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const PROJECT = '22222222-2222-4222-8222-222222222222';

PROJECTS.set(PROJECT, ALICE);
MEMBERS.set(PROJECT, [
  { user_id: BOB, role: 'viewer' },
  { user_id: CARLA, role: 'editor' },
]);

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
const post = (user, body) => ({
  method: 'POST',
  headers: { Authorization: `Bearer ${user}`, 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});
const base = `https://x/api/projects/${PROJECT}`;
const upload = (user, body) => app.request(`${base}/files/content`, post(user, body), env);

function seed() {
  rows.clear();
  rows.set(`ws:${PROJECT}:notes/plan.md`, {
    value: '# the plan\nbuild a lobby\n',
    metadata: { bytes: 25, updatedAt: Date.now(), version: 1 },
  });
}
seed();

/* ------------------------------------------------------------------ it works --- */

test('the owner can put a text file into the project, and it is there afterwards', async () => {
  seed();
  const res = await upload(ALICE, { path: 'notes/brief.md', content: '# brief\nmake it feel like a市场 at dusk 🌆\n' });
  const body = await res.json();
  assert.equal(res.status, 200, JSON.stringify(body));
  assert.equal(body.path, 'notes/brief.md');
  assert.equal(body.created, true, 'a new path is a creation, and the answer says which it was');

  const listing = await (await app.request(`${base}/files`, as(ALICE), env)).json();
  const row = listing.files.find((f) => f.path === 'notes/brief.md');
  assert.ok(row, 'the uploaded file must appear in the listing');
  // BYTES, NOT CHARACTERS: the content above is deliberately not ASCII. A length in characters
  // would under-count it, and the size the user is shown would be smaller than the file.
  assert.equal(row.bytes, new TextEncoder().encode('# brief\nmake it feel like a市场 at dusk 🌆\n').byteLength);

  const read = await (await app.request(`${base}/files/content?path=notes/brief.md`, as(ALICE), env)).json();
  assert.equal(read.content, '# brief\nmake it feel like a市场 at dusk 🌆\n', 'the bytes must survive the round trip intact');
});

test('a member who may build can upload; a member who may only read is refused by 403', async () => {
  seed();
  assert.equal((await upload(CARLA, { path: 'notes/carla.md', content: 'hello' })).status, 200);

  const refused = await upload(BOB, { path: 'notes/bob.md', content: 'hello' });
  assert.equal(refused.status, 403, 'a viewer told 404 goes looking for a missing file instead of at their role');
  assert.equal(rows.has(`ws:${PROJECT}:notes/bob.md`), false, 'a refused upload wrote the file anyway');
});

test('a stranger gets the same 404 as everywhere else, and writes nothing', async () => {
  seed();
  const res = await upload(STRANGER, { path: 'notes/theirs.md', content: 'hello' });
  assert.equal(res.status, 404);
  assert.equal(rows.has(`ws:${PROJECT}:notes/theirs.md`), false);
});

/* ---------------------------------------------------------------- it refuses --- */

test('A PATH THAT ESCAPES THE WORKSPACE IS REFUSED, and no key outside it is written', async () => {
  seed();
  const res = await upload(ALICE, { path: '../../other/plan.md', content: 'mine now' });
  assert.equal(res.status, 400);
  assert.equal((await res.json()).code, 'bad_path');
  assert.equal([...rows.keys()].some((k) => k.includes('other/plan.md')), false, 'the traversal wrote a key outside the workspace');
});

test('a file type the workspace does not hold is refused — this is not an object store', async () => {
  seed();
  const res = await upload(ALICE, { path: 'art/logo.png', content: 'PNG…' });
  assert.equal(res.status, 400);
  assert.equal((await res.json()).code, 'bad_path');
  assert.equal(rows.has(`ws:${PROJECT}:art/logo.png`), false);
});

test('CONTENT PAST THE CEILING IS REFUSED BY THE ROUTE, not discovered later', async () => {
  seed();
  const huge = 'x'.repeat(48 * 1024 + 1);
  const res = await upload(ALICE, { path: 'notes/huge.md', content: huge });
  assert.equal(res.status, 413);
  const body = await res.json();
  assert.equal(body.code, 'too_large');
  assert.match(body.error, /\d/, 'the refusal must state the limit, not just refuse');
  assert.equal(rows.has(`ws:${PROJECT}:notes/huge.md`), false, 'nothing is written when the size is refused');
});

test('a body with no text at all is refused as a body, not as a bad path', async () => {
  seed();
  const res = await upload(ALICE, { path: 'notes/empty.md' });
  assert.equal(res.status, 400);
  assert.equal((await res.json()).code, 'bad_content', 'saying "bad path" about a missing body sends the user to fix the wrong field');
  assert.equal(rows.has(`ws:${PROJECT}:notes/empty.md`), false);
});

/* -------------------------------------------------------------- it overwrites --- */

test('AN OCCUPIED PATH IS A REFUSAL, exactly as it is for copy and move', async () => {
  seed();
  const res = await upload(ALICE, { path: 'notes/plan.md', content: 'my plan now' });
  assert.equal(res.status, 409);
  assert.equal((await res.json()).code, 'occupied');
  const read = await (await app.request(`${base}/files/content?path=notes/plan.md`, as(ALICE), env)).json();
  assert.equal(read.content, '# the plan\nbuild a lobby\n', 'a refused upload replaced the file it was refused over');
});

test('an overwrite the user asked for keeps the replaced text as a version', async () => {
  seed();
  const res = await upload(ALICE, { path: 'notes/plan.md', content: 'my plan now', overwrite: true });
  const body = await res.json();
  assert.equal(res.status, 200, JSON.stringify(body));
  assert.equal(body.created, false, 'replacing is not creating, and the answer must not say it was');

  const read = await (await app.request(`${base}/files/content?path=notes/plan.md`, as(ALICE), env)).json();
  assert.equal(read.content, 'my plan now');

  // The point of allowing the overwrite at all: it is recoverable. An upload that destroyed the
  // agent's work with no way back would be a worse feature than no upload.
  const history = await (await app.request(`${base}/files/history?path=notes/plan.md`, as(ALICE), env)).json();
  assert.ok(history.versions.length >= 2, 'the replaced text must still be readable as an earlier version');
  const previous = history.versions.find((v) => !v.current);
  const old = await (await app.request(`${base}/files/content?path=notes/plan.md&version=${previous.version}`, as(ALICE), env)).json();
  assert.equal(old.content, '# the plan\nbuild a lobby\n', 'the version the overwrite replaced must be the text it replaced');
});
