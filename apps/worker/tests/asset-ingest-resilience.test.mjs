// What the bulk ingest does when D1 says no.
//
// THE FAILURE THIS IS WRITTEN FROM. A 510,979-row ingest ran eight batches and then returned
// `text/plain` 500 — "Internal Server Error", no count, no id, no reason — for every batch after
// it, including batches that had already succeeded minutes earlier. The only sentence explaining
// it existed in `wrangler tail`:
//
//   D1_EXEC_ERROR: Error in line 1: create index if not exists idx_asset_kind
//   on asset_library(kind, status): D1 DB exceeded its CPU time limit and was reset.
//
// Two defects, and the visible one was the smaller.
//
//   THE SCHEMA WAS RE-ASSERTED EVERY REQUEST. Ten DDL statements, ten sequential round trips to a
//   single-threaded D1, before a single row was written — to assert a schema unchanged since the
//   deployment booted. `sqlite_master` on the live database confirms all five indexes already
//   exist, so the statement that reported the reset had no work to do; it was merely the first
//   thing to touch a database the previous batch had exhausted.
//
//   A REFUSED CHUNK THREW. `upsertAssets` awaited `batch()` bare, so one transient refusal in
//   chunk 90 of 125 discarded the count of the 89 chunks that HAD been written and returned an
//   empty 500. Work that succeeded, reported as nothing.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const WORKER = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(mkdtempSync(join(tmpdir(), 'assetingest-')), 'lib.mjs');
execFileSync(join(WORKER, 'node_modules', '.bin', 'esbuild'),
  [join(WORKER, 'src', 'asset-library.ts'), '--bundle', '--format=esm', '--target=es2022',
   '--platform=neutral', '--main-fields=main,module', '--outfile=' + out],
  { cwd: WORKER, stdio: 'pipe' });
const L = await import(`file://${out}`);

/** A D1 stand-in that counts what it was asked to do and can be told to refuse. */
function fakeD1({ execFails = 0, batchFailsFirst = 0, batchAlwaysFails = false } = {}) {
  const calls = { exec: 0, batch: 0 };
  let execLeftToFail = execFails;
  let batchLeftToFail = batchFailsFirst;
  const stmt = { bind: () => stmt };
  return {
    calls,
    CORPUS: {
      async exec() {
        calls.exec++;
        if (execLeftToFail > 0) { execLeftToFail--; throw new Error('D1 DB exceeded its CPU time limit and was reset.'); }
        return { count: 1 };
      },
      prepare: () => stmt,
      async batch() {
        calls.batch++;
        if (batchAlwaysFails) throw new Error('D1 DB exceeded its CPU time limit and was reset.');
        if (batchLeftToFail > 0) { batchLeftToFail--; throw new Error('D1 DB exceeded its CPU time limit and was reset.'); }
        return [];
      },
    },
  };
}

/** A record that passes validateProvenance, so the test is about D1 and not about validation. */
const row = (n) => ({
  id: `fixture/d1-resilience/thing-${n}`,
  name: `Thing ${n}`,
  kind: 'prop',
  source: 'kenney',
  sourceUrl: 'https://example.org/thing',
  licence: 'CC0-1.0',
  licenceUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
  commercialUse: true,
  attributionRequired: false,
  author: 'Someone',
  retrievedAt: '2026-09-15T00:00:00.000Z',
  tags: ['thing'],
  robloxAssetId: null,
});

test('the schema is asserted once per isolate, not once per batch', async () => {
  L.resetAssetSchemaCache();
  const d1 = fakeD1();
  await L.ensureAssetTables(d1);
  const afterFirst = d1.calls.exec;
  assert.ok(afterFirst > 0, 'the first call must actually run the DDL');
  await L.ensureAssetTables(d1);
  await L.ensureAssetTables(d1);
  assert.equal(d1.calls.exec, afterFirst,
    'a second call must issue ZERO further statements — ten free round trips per request is ten more chances to be the one that reports a reset');
});

test('a DDL that threw is NOT remembered as done', async () => {
  // Caching a failure would leave a half-built schema permanent for the isolate's whole life.
  L.resetAssetSchemaCache();
  const d1 = fakeD1({ execFails: 1 });
  await assert.rejects(() => L.ensureAssetTables(d1), /CPU time limit/);
  const afterFailure = d1.calls.exec;
  await L.ensureAssetTables(d1);
  assert.ok(d1.calls.exec > afterFailure, 'the next request must try again, not inherit the failure');
});

test('a chunk D1 refuses once is retried and written', async () => {
  const d1 = fakeD1({ batchFailsFirst: 1 });
  const res = await L.upsertAssets(d1, [row(1), row(2)], { seed: true, cc0Only: false, requireImportDate: false });
  assert.equal(res.written, 2, 'a transient reset must not cost the rows');
  assert.equal(res.rejected.length, 0);
  assert.ok(d1.calls.batch >= 2, 'it must actually have retried');
});

test('a chunk D1 keeps refusing becomes rejects carrying D1’s own sentence', async () => {
  const d1 = fakeD1({ batchAlwaysFails: true });
  const rows = [row(1), row(2), row(3)];
  const res = await L.upsertAssets(d1, rows, { seed: true, cc0Only: false, requireImportDate: false });
  assert.equal(res.written, 0);
  assert.equal(res.rejected.length, rows.length,
    'every row of a refused chunk must be accounted for — written + rejected must equal received');
  assert.match(res.rejected[0].errors[0], /CPU time limit/,
    'the reject must carry what D1 said, not a generic message invented here');
  assert.deepEqual(res.rejected.map((r) => r.id).sort(), ['fixture/d1-resilience/thing-1', 'fixture/d1-resilience/thing-2', 'fixture/d1-resilience/thing-3']);
});

test('a refused chunk does not discard the chunks that succeeded', async () => {
  // 22 columns means 4 rows per statement, so 8 rows is two chunks. The first goes, the second
  // does not, and the count of the first must survive.
  const d1 = fakeD1();
  let seen = 0;
  d1.CORPUS.batch = async () => { seen++; if (seen === 2) throw new Error('D1 DB exceeded its CPU time limit and was reset.'); return []; };
  const rows = Array.from({ length: 8 }, (_, i) => row(i));
  const res = await L.upsertAssets(d1, rows, { seed: true, cc0Only: false, requireImportDate: false });
  assert.equal(res.written + res.rejected.length, rows.length,
    'the two numbers must still add up to what was handed in');
  assert.ok(res.written > 0, 'the chunk that landed must be counted, not thrown away with the one that did not');
});
