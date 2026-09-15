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

test('every store that asserts a schema goes through it', async () => {
  //[[ THE CHECK THAT STOPS THIS GOING STALE.
  //
  //   Seven files had this defect. An eighth store added next month would have it again, and no
  //   test that only exercises the helper would notice. So the ensure-functions themselves are
  //   read: each must DELEGATE rather than run DDL directly. ]]
  const { readFileSync, readdirSync } = await import('node:fs');
  const dir = join(WORKER, 'src');
  const offenders = [];
  let checked = 0;
  for (const f of readdirSync(dir)) {
    if (!f.endsWith('.ts')) continue;
    const src = readFileSync(join(dir, f), 'utf8');
    for (const m of src.matchAll(/export (?:async )?function (ensure\w*Tables?|ensure\w*Table)\s*\(/g)) {
      checked++;
      const from = m.index;
      const body = src.slice(from, from + 900);
      if (!/oncePerIsolate\(/.test(body)) offenders.push(`${f}: ${m[1]}`);
    }
  }
  assert.ok(checked >= 7, `expected to find the seven schema functions, found ${checked} — this check has gone blind`);
  assert.deepEqual(offenders, [], 'these assert a schema without going through oncePerIsolate');
});
