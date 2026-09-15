/**
 * THE PROJECT'S FILES: VERSIONS, TRASH, RENAME, MOVE, DUPLICATE — AGAINST BOTH STORES.
 *
 * The workspace used to be three verbs over KV, and `write` replaced the previous contents with no
 * record that there had been any. Everything below is new behaviour, and the reason this file runs
 * EVERY case twice — once against `memoryWorkspace`, once against `kvWorkspace` over a modelled KV —
 * is that only one of those two ships. A battery that exercises the in-memory store alone proves the
 * test double works; it says nothing about the store customers use, and the two are separate
 * implementations of one contract, which is exactly the shape that drifts.
 *
 * The modelled KV is faithful where faithfulness is load-bearing: metadata travels with the value,
 * `list` is prefix-scoped, ordered and PAGED (page size 2 here, 1000 in production), and a delete
 * really removes. The pagination is not decoration — a listing that returns the first page and stops
 * renders as a complete file list, which is this repository's central failure with a filename on it.
 *
 * Run with:  node --test tests/workspace-files.test.mjs      (from apps/worker)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

// Bundled rather than imported: webtools.ts reaches net-policy through an extensionless specifier,
// which Node's type stripping will not resolve. Same approach as tests/webtools.test.mjs.
const WORKER = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIR = mkdtempSync(join(tmpdir(), 'wsfiles-'));
const bundle = (rel, name) => {
  const out = join(DIR, `${name}.mjs`);
  execFileSync(
    join(WORKER, 'node_modules', '.bin', 'esbuild'),
    [join(WORKER, 'src', rel), '--bundle', '--format=esm', '--target=es2022', '--outfile=' + out],
    { cwd: WORKER, stdio: 'pipe' },
  );
  return out;
};
const { kvWorkspace, memoryWorkspace, WORKSPACE_MAX_VERSIONS, WORKSPACE_TRASH_TTL_SECONDS } =
  await import(`file://${bundle('webtools.ts', 'webtools')}`);
const {
  copyWorkspaceFile,
  deleteWorkspaceFile,
  freeCopyPath,
  historyOf,
  listWorkspace,
  moveWorkspaceFile,
  readVersionOf,
  restoreWorkspaceFile,
  revertWorkspaceFile,
  trashOf,
  WORKSPACE_OP_STATUS,
} = await import(`file://${bundle('workspace-files.ts', 'workspace-files')}`);

/** A KV that behaves like the real one in the ways this code depends on. */
function fakeKV({ pageSize = 2 } = {}) {
  const rows = new Map(); // key -> { value, metadata, expirationTtl }
  return {
    rows,
    async get(key) {
      return rows.get(key)?.value ?? null;
    },
    async getWithMetadata(key) {
      const row = rows.get(key);
      return row ? { value: row.value, metadata: row.metadata ?? null } : { value: null, metadata: null };
    },
    async put(key, value, opts = {}) {
      rows.set(key, { value, metadata: opts.metadata ?? null, expirationTtl: opts.expirationTtl ?? null });
    },
    async delete(key) {
      rows.delete(key);
    },
    async list({ prefix = '', cursor } = {}) {
      const names = [...rows.keys()].filter((k) => k.startsWith(prefix)).sort();
      const start = cursor ? Number(cursor) : 0;
      const page = names.slice(start, start + pageSize);
      const next = start + pageSize;
      const complete = next >= names.length;
      return {
        keys: page.map((name) => ({ name, metadata: rows.get(name).metadata })),
        list_complete: complete,
        ...(complete ? {} : { cursor: String(next) }),
      };
    },
  };
}

const STORES = [
  ['memory', () => memoryWorkspace()],
  ['kv', () => kvWorkspace(fakeKV(), 'proj-A')],
];

const each = (name, fn) => {
  for (const [label, make] of STORES) test(`${name} [${label}]`, () => fn(make()));
};

/* ------------------------------------------------------------ version history --- */

each('a write archives what was there, and the old text is still readable', async (store) => {
  await store.write('notes/plan.md', 'first');
  await store.write('notes/plan.md', 'second');

  const now = await store.read('notes/plan.md');
  assert.equal(now.content, 'second');
  assert.equal(now.version, 2);

  const history = await historyOf(store, 'notes/plan.md');
  assert.equal(history.ok, true);
  assert.deepEqual(history.versions.map((v) => v.version), [2, 1], 'newest first, and version 1 must still exist');
  assert.equal(history.versions[0].current, true);
  assert.equal(history.versions[1].current, false);

  const old = await readVersionOf(store, 'notes/plan.md', 1);
  assert.equal(old.ok, true);
  assert.equal(old.content, 'first', 'the superseded text was not kept');
});

each('the archive is capped, and it is the OLDEST that go', async (store) => {
  const writes = WORKSPACE_MAX_VERSIONS + 5;
  for (let i = 1; i <= writes; i += 1) await store.write('a.md', `v${i}`);

  const history = await historyOf(store, 'a.md');
  assert.equal(history.versions.length, WORKSPACE_MAX_VERSIONS + 1, 'the cap is on the archive; the live file is extra');
  assert.equal(history.versions[0].version, writes, 'the newest version must be the live one');
  const oldest = history.versions[history.versions.length - 1].version;
  assert.equal(oldest, writes - WORKSPACE_MAX_VERSIONS, 'pruning must drop the oldest, not the newest');

  const gone = await readVersionOf(store, 'a.md', 1);
  assert.equal(gone.ok, false);
  assert.equal(gone.code, 'no_such_version');
  assert.match(gone.error, new RegExp(String(WORKSPACE_MAX_VERSIONS)), 'the refusal must say how many are kept');
});

each('reverting is a new version, not an erasure of the ones between', async (store) => {
  await store.write('a.md', 'one');
  await store.write('a.md', 'two');
  await store.write('a.md', 'three');

  const back = await revertWorkspaceFile(store, 'a.md', 1);
  assert.equal(back.ok, true);
  assert.equal(back.version, 4, 'a revert writes forward');
  assert.equal(back.restoredFrom, 1);
  assert.equal((await store.read('a.md')).content, 'one');

  // The whole point: version 3 is still there to compare against.
  const three = await readVersionOf(store, 'a.md', 3);
  assert.equal(three.ok, true);
  assert.equal(three.content, 'three');
});

each('a path that never existed has no history and is not reported as deleted', async (store) => {
  const h = await historyOf(store, 'never/written.md');
  assert.equal(h.ok, false);
  assert.equal(h.code, 'not_found');
});

/* -------------------------------------------------------------------- trash --- */

each('a deleted file leaves the listing, enters the trash, and comes back byte-identical', async (store) => {
  await store.write('notes/plan.md', 'keep me');
  const del = await deleteWorkspaceFile(store, 'notes/plan.md');
  assert.equal(del.ok, true);
  assert.equal(del.bytes, 7);
  assert.ok(del.expiresAt > del.deletedAt, 'a recoverable deletion must carry its deadline');
  assert.equal(
    Math.round((del.expiresAt - del.deletedAt) / 1000),
    WORKSPACE_TRASH_TTL_SECONDS,
    'the stated deadline must be the retention window, not an invented one',
  );

  assert.equal(await store.read('notes/plan.md'), null);
  assert.equal((await listWorkspace(store)).fileCount, 0, 'a deleted file must not still be listed');

  const bin = await trashOf(store);
  assert.deepEqual(bin.entries.map((e) => e.path), ['notes/plan.md']);
  assert.equal(bin.entries[0].bytes, 7);

  const back = await restoreWorkspaceFile(store, 'notes/plan.md');
  assert.equal(back.ok, true);
  assert.equal((await store.read('notes/plan.md')).content, 'keep me');
  assert.equal((await trashOf(store)).entries.length, 0, 'a restored file must leave the trash');
});

each('undelete never overwrites whatever now holds the path', async (store) => {
  await store.write('a.md', 'original');
  await deleteWorkspaceFile(store, 'a.md');
  await store.write('a.md', 'a different file entirely');

  const back = await restoreWorkspaceFile(store, 'a.md');
  assert.equal(back.ok, false);
  assert.equal(back.code, 'occupied');
  assert.equal((await store.read('a.md')).content, 'a different file entirely', 'the live file was destroyed by an undelete');
});

each('undeleting something that was never deleted is refused by name', async (store) => {
  const r = await restoreWorkspaceFile(store, 'nothing/here.md');
  assert.equal(r.ok, false);
  assert.equal(r.code, 'not_in_trash');
});

/* ------------------------------------------------------------- move and copy --- */

each('a rename carries the file AND its history, and the old path is empty', async (store) => {
  await store.write('notes/draft.md', 'one');
  await store.write('notes/draft.md', 'two');

  const moved = await moveWorkspaceFile(store, 'notes/draft.md', 'notes/final.md');
  assert.equal(moved.ok, true);
  assert.equal(await store.read('notes/draft.md'), null, 'the source must not survive a move');
  assert.equal((await store.read('notes/final.md')).content, 'two');

  const history = await historyOf(store, 'notes/final.md');
  assert.deepEqual(history.versions.map((v) => v.version), [2, 1], 'a rename that loses the history discards evidence');
  assert.equal((await readVersionOf(store, 'notes/final.md', 1)).content, 'one');
});

each('a move into another folder is the same operation, and it lands there', async (store) => {
  await store.write('a.md', 'x');
  const moved = await moveWorkspaceFile(store, 'a.md', 'archive/2026/a.md');
  assert.equal(moved.ok, true);
  const listing = await listWorkspace(store);
  assert.deepEqual(listing.files.map((f) => f.path), ['archive/2026/a.md']);
  assert.deepEqual(listing.folders.map((f) => f.name), ['archive'], 'folders are derived from the paths that exist');
});

each('moving onto an existing file is refused, not merged', async (store) => {
  await store.write('a.md', 'aaa');
  await store.write('b.md', 'bbb');
  const moved = await moveWorkspaceFile(store, 'a.md', 'b.md');
  assert.equal(moved.ok, false);
  assert.equal(moved.code, 'occupied');
  assert.equal((await store.read('b.md')).content, 'bbb', 'the destination was destroyed by a refused move');
  assert.equal((await store.read('a.md')).content, 'aaa', 'the source must be untouched by a refused move');
});

each('BOTH paths are validated, not just the one the caller thinks is dangerous', async (store) => {
  await store.write('a.md', 'x');
  const escape = await moveWorkspaceFile(store, 'a.md', '../secrets/a.md');
  assert.equal(escape.ok, false);
  assert.equal(escape.code, 'bad_destination', 'an unchecked destination is a path traversal with extra steps');

  const wrongType = await moveWorkspaceFile(store, 'a.md', 'a.exe');
  assert.equal(wrongType.ok, false);
  assert.equal(wrongType.code, 'bad_destination');

  const badSource = await moveWorkspaceFile(store, '../a.md', 'b.md');
  assert.equal(badSource.ok, false);
  assert.equal(badSource.code, 'bad_path');

  assert.equal((await store.read('a.md')).content, 'x', 'a refused move must change nothing');
});

each('moving a file onto itself is refused rather than silently deleting it', async (store) => {
  await store.write('a.md', 'x');
  const same = await moveWorkspaceFile(store, 'a.md', 'a.md');
  assert.equal(same.ok, false);
  assert.equal(same.code, 'same_path');
  assert.equal((await store.read('a.md')).content, 'x');
});

each('a duplicate is a second file with the same bytes and a history of its own', async (store) => {
  await store.write('a.md', 'one');
  await store.write('a.md', 'two');

  const copied = await copyWorkspaceFile(store, 'a.md', 'a-copy.md');
  assert.equal(copied.ok, true);
  assert.equal(copied.historyCopied, false, 'the result must say whether the past came with it');
  assert.equal((await store.read('a-copy.md')).content, 'two');
  assert.equal((await store.read('a.md')).content, 'two', 'the source must survive a copy');

  const copyHistory = await historyOf(store, 'a-copy.md');
  assert.deepEqual(copyHistory.versions.map((v) => v.version), [1], 'the copy must not claim the original\'s past');
  const sourceHistory = await historyOf(store, 'a.md');
  assert.deepEqual(sourceHistory.versions.map((v) => v.version), [2, 1], 'copying must not disturb the source history');
});

each('duplicating onto a name that is taken is refused, and a free one is offered', async (store) => {
  await store.write('a.md', 'aaa');
  await store.write('a-copy.md', 'someone else');

  const clash = await copyWorkspaceFile(store, 'a.md', 'a-copy.md');
  assert.equal(clash.ok, false);
  assert.equal(clash.code, 'occupied');
  assert.equal((await store.read('a-copy.md')).content, 'someone else');

  const free = await freeCopyPath(store, 'a.md');
  assert.equal(free, 'a-copy-2.md', 'the offered name must be checked against the store, not guessed from a pattern');
  const second = await copyWorkspaceFile(store, 'a.md', free);
  assert.equal(second.ok, true);
});

/* ------------------------------------------------------------------ listing --- */

each('the listing pages through everything and totals only what was measured', async (store) => {
  for (let i = 0; i < 7; i += 1) await store.write(`notes/f${i}.md`, 'x'.repeat(i + 1));
  const listing = await listWorkspace(store);
  assert.equal(listing.fileCount, 7, 'a listing that stops at the first page renders as a complete one');
  assert.equal(listing.totalBytes, 1 + 2 + 3 + 4 + 5 + 6 + 7);
  assert.equal(listing.unmeasured, 0);
  assert.equal(listing.limits.trashDays, Math.round(WORKSPACE_TRASH_TTL_SECONDS / 86_400));
});

test('a size KV never recorded is counted as unmeasured, never summed as zero', async () => {
  // Only the KV store can be in this state: a row written before the store kept metadata.
  const kv = fakeKV();
  kv.rows.set('ws:proj-A:legacy.md', { value: 'hello', metadata: null });
  const listing = await listWorkspace(kvWorkspace(kv, 'proj-A'));
  assert.equal(listing.fileCount, 1);
  assert.equal(listing.unmeasured, 1);
  assert.equal(listing.totalBytes, 0, 'an unrecorded size must not be added as a confident zero');
});

test('an older row with no version metadata is version 1, and its text is archived on the next write', async () => {
  const kv = fakeKV();
  kv.rows.set('ws:proj-A:legacy.md', { value: 'written before versions existed', metadata: { bytes: 31, updatedAt: 5 } });
  const store = kvWorkspace(kv, 'proj-A');
  assert.equal((await store.read('legacy.md')).version, 1);
  await store.write('legacy.md', 'new text');
  const old = await readVersionOf(store, 'legacy.md', 1);
  assert.equal(old.ok, true);
  assert.equal(old.content, 'written before versions existed', 'the pre-versioning text was thrown away');
});

test('reading a file reports when it was written, not when it was read', async () => {
  const kv = fakeKV();
  const store = kvWorkspace(kv, 'proj-A');
  await store.write('a.md', 'x');
  const written = (await store.read('a.md')).updatedAt;
  await new Promise((r) => setTimeout(r, 12));
  assert.equal((await store.read('a.md')).updatedAt, written, 'a read must not restamp the file');
});

test('the trash and the archive are keyed by project too, which is the authorisation', async () => {
  const kv = fakeKV();
  const a = kvWorkspace(kv, 'proj-A');
  const b = kvWorkspace(kv, 'proj-B');
  await a.write('secret.md', 'alice');
  await a.write('secret.md', 'alice again');
  await a.remove('secret.md');

  assert.equal(await b.read('secret.md'), null);
  assert.deepEqual((await b.trash()).map((e) => e.path), [], "another project's trash must not be reachable");
  assert.deepEqual(await b.versions('secret.md'), [], "another project's archive must not be reachable");
  // And project A can still get it back, so the isolation above is not just an empty store.
  assert.equal((await restoreWorkspaceFile(a, 'secret.md')).ok, true);
});

test('a deleted file is written with a real expiry, not a promise to sweep later', async () => {
  const kv = fakeKV();
  const store = kvWorkspace(kv, 'proj-A');
  await store.write('a.md', 'x');
  await store.remove('a.md');
  const row = kv.rows.get('wst:proj-A:a.md');
  assert.ok(row, 'the trashed bytes must be stored somewhere');
  assert.equal(row.expirationTtl, WORKSPACE_TRASH_TTL_SECONDS, 'a retention window nothing enforces is not a retention window');
});

test('every refusal code maps to a status, so no route has to read the prose', () => {
  const codes = ['bad_path', 'bad_destination', 'not_found', 'occupied', 'not_in_trash', 'no_such_version', 'same_path', 'too_large'];
  for (const c of codes) assert.ok(WORKSPACE_OP_STATUS[c], `${c} has no status`);
  assert.equal(WORKSPACE_OP_STATUS.occupied, 409);
  assert.equal(WORKSPACE_OP_STATUS.bad_path, 400);
});
