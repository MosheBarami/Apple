// The DDL runs once per isolate — and the three properties the obvious version does not have.
//
// Seven stores each ran their whole `create table if not exists` list on every request that
// touched them. On a quiet database that is invisible; under a bulk ingest D1 answers
// "exceeded its CPU time limit and was reset" and the request 500s with an empty body having
// written nothing. It killed the asset ingest at ensureAssetTables and then the site deploy at
// ensureStaticTables — two unrelated features, one shared cause, and in both cases the statement
// that reported the reset had no work to do.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const WORKER = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(mkdtempSync(join(tmpdir(), 'schemaonce-')), 's.mjs');
execFileSync(join(WORKER, 'node_modules', '.bin', 'esbuild'),
  [join(WORKER, 'src', 'schema-once.ts'), '--bundle', '--format=esm', '--target=es2022',
   '--platform=neutral', '--main-fields=main,module', '--outfile=' + out],
  { cwd: WORKER, stdio: 'pipe' });
const S = await import(`file://${out}`);

test('the second call does not run it again', async () => {
  S.resetSchemaOnce();
  let runs = 0;
  const fn = async () => { runs++; };
  await S.oncePerIsolate('k', fn);
  await S.oncePerIsolate('k', fn);
  await S.oncePerIsolate('k', fn);
  assert.equal(runs, 1);
});

test('concurrent callers share ONE run', async () => {
  // Two requests arriving together in one isolate would otherwise both see "not done" and both
  // issue the DDL — the doubling this exists to prevent, at exactly the moment of load when it
  // costs most. Storing only a finished flag is not enough; the in-flight promise must be stored.
  S.resetSchemaOnce();
  let runs = 0;
  let release;
  const gate = new Promise((r) => { release = r; });
  const fn = async () => { runs++; await gate; };
  const a = S.oncePerIsolate('k', fn);
  const b = S.oncePerIsolate('k', fn);
  const c = S.oncePerIsolate('k', fn);
  assert.equal(runs, 1, 'the second and third callers must join the first run, not start their own');
  release();
  await Promise.all([a, b, c]);
  assert.equal(runs, 1);
});

test('a run that threw is NOT remembered as done', async () => {
  // Caching a rejection would make a half-built schema permanent for the isolate's whole life —
  // and the failure this exists for is transient by nature, so it would turn a momentary D1 reset
  // into an outage lasting until the isolate is recycled.
  S.resetSchemaOnce();
  let runs = 0;
  const fn = async () => { runs++; if (runs === 1) throw new Error('D1 DB exceeded its CPU time limit and was reset.'); };
  await assert.rejects(() => S.oncePerIsolate('k', fn), /CPU time limit/);
  await S.oncePerIsolate('k', fn);
  assert.equal(runs, 2, 'the next request must try again, not inherit the failure');
});

test('the rejection reaches every caller that was waiting', async () => {
  // A shared in-flight promise must not swallow the error for the callers who joined it: a request
  // whose schema run failed has to fail, not proceed against a schema that may not be there.
  S.resetSchemaOnce();
  let release;
  const gate = new Promise((_, rej) => { release = rej; });
  const fn = () => gate;
  const a = S.oncePerIsolate('k', fn);
  const b = S.oncePerIsolate('k', fn);
  release(new Error('reset'));
  await assert.rejects(() => a, /reset/);
  await assert.rejects(() => b, /reset/);
});

test('one store’s run does not silence another’s', async () => {
  // Seven stores share one isolate. A single flag between them would let the first store to run
  // convince the other six their tables were already made.
  S.resetSchemaOnce();
  const runs = {};
  const mk = (k) => async () => { runs[k] = (runs[k] ?? 0) + 1; };
  await S.oncePerIsolate('assets', mk('assets'));
  await S.oncePerIsolate('static', mk('static'));
  await S.oncePerIsolate('memory', mk('memory'));
  assert.deepEqual(runs, { assets: 1, static: 1, memory: 1 });
});

test('the happy path issues NO schema work at all', async () => {
  // The memo is per-isolate, and a site deploy is one POST per file spread across many fresh
  // isolates — so almost every request ran the DDL anyway, and under a concurrent bulk ingest D1
  // answered "is overloaded. Requests queued for too long." on the first `create table`, before a
  // byte was stored. withSchema inverts it: do the work, and build the schema only if SQLite says
  // it is missing.
  let created = 0;
  const r = await S.withSchema(async () => 'stored', async () => { created++; });
  assert.equal(r, 'stored');
  assert.equal(created, 0, 'a working store must not be asked to prove it exists');
});

test('a missing table is built once and the work retried', async () => {
  let created = 0;
  let calls = 0;
  const run = async () => {
    calls++;
    if (calls === 1) throw new Error('D1_ERROR: no such table: static_assets');
    return 'stored';
  };
  assert.equal(await S.withSchema(run, async () => { created++; }), 'stored');
  assert.equal(created, 1);
  assert.equal(calls, 2);
});

test('an overloaded database is NOT answered with more DDL', async () => {
  //[[ THE WHOLE POINT, AND THE EASY THING TO GET WRONG.
  //
  //   "D1 DB is overloaded. Requests queued for too long." and "exceeded its CPU time limit and
  //   was reset" are not missing-table errors. Treating any failure as "maybe the schema is gone"
  //   would hand a struggling database a fresh pile of DDL at the moment it has least room —
  //   which is the outage this file exists for, arrived at from the other direction. ]]
  for (const msg of [
    'D1_ERROR: D1 DB is overloaded. Requests queued for too long.',
    'D1_EXEC_ERROR: D1 DB exceeded its CPU time limit and was reset.',
    'Network connection lost.',
  ]) {
    let created = 0;
    await assert.rejects(
      () => S.withSchema(async () => { throw new Error(msg); }, async () => { created++; }),
      (e) => e.message === msg,
      msg,
    );
    assert.equal(created, 0, `"${msg}" must not trigger schema creation`);
  }
});

test('two databases each get their own schema run', async () => {
  //[[ THE REGRESSION THIS IS WRITTEN FROM, AND IT COST 52 TESTS.
  //
  //   The memo keyed on the store's NAME alone, justified by a comment saying one isolate serves
  //   one worker with one binding set — true in production, false the moment anything fabricates a
  //   second database. The suite does exactly that: every test builds a fresh in-memory D1 stub.
  //   The second stub was told the schema was already made, never got its tables, and 52 tests
  //   failed with `no such table: memory_orgs`.
  //
  //   The comment asserted an invariant instead of enforcing one. Keying on the binding OBJECT
  //   enforces it: identical and free in a Worker, correct in a test, and no seam anybody has to
  //   remember to call.
  S.resetSchemaOnce();
  const dbA = { name: 'A' };
  const dbB = { name: 'B' };
  const ran = [];
  const mk = (tag) => async () => { ran.push(tag); };
  await S.oncePerIsolate('memory', mk('A1'), dbA);
  await S.oncePerIsolate('memory', mk('A2'), dbA);
  await S.oncePerIsolate('memory', mk('B1'), dbB);
  assert.deepEqual(ran, ['A1', 'B1'],
    'the same store on a DIFFERENT database is a different run; on the same database it is not');
});

test('a caller with no database still gets the isolate-wide memo', async () => {
  S.resetSchemaOnce();
  let runs = 0;
  const fn = async () => { runs++; };
  await S.oncePerIsolate('k', fn);
  await S.oncePerIsolate('k', fn);
  assert.equal(runs, 1);
});

test('every store that asserts a schema goes through it — AND names its database', async () => {
  //[[ THE CHECK THAT STOPS THIS GOING STALE.
  //
  //   Seven files had this defect. An eighth store added next month would have it again, and no
  //   test that only exercises the helper would notice. So the ensure-functions themselves are
  //   read: each must DELEGATE rather than run DDL directly.
  //
  //   DELEGATING IS HALF THE PROPERTY. `oncePerIsolate` keys on the database object, and a call
  //   that omits the third argument falls back to the isolate-wide table — which is the whole of
  //   the original bug, since one flag then covers every database the process ever builds. That
  //   is not a theoretical gap: with the fixed helper in place but the callers still passing no
  //   database, memory-store and notification-store fail 40 and 12 tests respectively, exactly as
  //   they did before the helper was fixed. A store that delegates without naming its database is
  //   therefore an offender, and this check reads the ARGUMENT COUNT, not just the call. ]]
  const { readFileSync, readdirSync } = await import('node:fs');
  const dir = join(WORKER, 'src');
  const notDelegating = [];
  const noDatabase = [];
  let checked = 0;

  /** Top-level argument count of the call whose `(` is at `open`. Quotes and nesting aware. */
  const argCount = (src, open) => {
    let depth = 0, args = 1, quote = null;
    for (let i = open; i < src.length; i++) {
      const c = src[i], prev = src[i - 1];
      if (quote) {
        if (c === quote && prev !== '\\') quote = null;
        continue;
      }
      if (c === '"' || c === "'" || c === '`') { quote = c; continue; }
      if (c === '(' || c === '[' || c === '{') depth++;
      else if (c === ')' || c === ']' || c === '}') {
        depth--;
        if (depth === 0) return args;
      } else if (c === ',' && depth === 1) args++;
    }
    return -1; // unbalanced — the slice cut the call in half
  };

  for (const f of readdirSync(dir)) {
    if (!f.endsWith('.ts')) continue;
    const src = readFileSync(join(dir, f), 'utf8');
    for (const m of src.matchAll(/export (?:async )?function (ensure\w*Tables?|ensure\w*Table)\s*\(/g)) {
      checked++;
      const call = src.indexOf('oncePerIsolate(', m.index);
      // Bound the search to this function rather than to a fixed slice, so a long store body
      // cannot make the check silently miss a call and report the file as clean.
      const nextFn = src.indexOf('\nexport ', m.index + 1);
      const end = nextFn === -1 ? src.length : nextFn;
      if (call === -1 || call > end) { notDelegating.push(`${f}: ${m[1]}`); continue; }
      const n = argCount(src, call + 'oncePerIsolate'.length);
      if (n < 3) noDatabase.push(`${f}: ${m[1]} (${n === -1 ? 'unparsed' : n + ' args'})`);
    }
  }
  assert.ok(checked >= 7, `expected to find the seven schema functions, found ${checked} — this check has gone blind`);
  assert.deepEqual(notDelegating, [], 'these assert a schema without going through oncePerIsolate');
  assert.deepEqual(noDatabase, [],
    'these call oncePerIsolate without passing their database, so they share one isolate-wide flag across every database');
});
