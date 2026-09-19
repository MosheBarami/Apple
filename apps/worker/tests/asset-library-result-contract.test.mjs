// The search tool is the boundary the model actually sees.
//
// `asset-library-quality.test.mjs` proves the internal AssetHit has a canonical `id`, but the
// tool used to drop that field while translating the hit to its public result. A pending-import
// row then arrived as `{ assetId: null }`: the library had the asset, but no caller could address
// the row or carry its provenance into a later import flow.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { DatabaseSync } from 'node:sqlite';

const WORKER = join(dirname(fileURLToPath(import.meta.url)), '..');
const TMP = mkdtempSync(join(tmpdir(), 'asset-result-'));

const bundle = (entry, name) => {
  const out = join(TMP, `${name}.mjs`);
  execFileSync(join(WORKER, 'node_modules', '.bin', 'esbuild'), [
    join(WORKER, 'src', entry),
    '--bundle',
    '--format=esm',
    '--target=es2022',
    '--platform=node',
    '--outfile=' + out,
  ], { cwd: WORKER, stdio: 'pipe' });
  return import(`file://${out}`);
};

const T = await bundle('tools.ts', 'tools');
const L = await bundle('asset-library.ts', 'library');

function realD1() {
  const db = new DatabaseSync(':memory:');
  const run = (sql, params) => db.prepare(sql).run(...params);
  const CORPUS = {
    async exec(sql) { db.exec(sql); return { count: 1, duration: 0 }; },
    prepare(sql) {
      const make = (params) => ({
        sql,
        params,
        bind: (...next) => make(next),
        async all() { return { results: db.prepare(sql).all(...params), success: true, meta: {} }; },
        async first() { const row = db.prepare(sql).get(...params); return row === undefined ? null : row; },
        async run() { const result = run(sql, params); return { success: true, meta: { changes: Number(result.changes) } }; },
      });
      return make([]);
    },
    async batch(statements) {
      db.exec('begin');
      try {
        for (const statement of statements) run(statement.sql, statement.params);
        db.exec('commit');
      } catch (error) {
        db.exec('rollback');
        throw error;
      }
      return statements.map(() => ({ success: true, meta: {} }));
    },
  };
  return { CORPUS, close: () => db.close() };
}

const CURATED = {
  id: 'kenney/survival-kit/wooden-crate',
  name: 'Wooden Crate',
  kind: 'prop',
  source: 'kenney',
  sourceUrl: 'https://kenney.nl/assets/survival-kit',
  licence: 'Creative Commons Zero, CC0',
  licenceUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
  commercialUse: true,
  attributionRequired: false,
  author: 'Kenney',
  retrievedAt: '2026-09-01T00:00:00.000Z',
  robloxAssetId: null,
  triangles: null,
  textureResolution: null,
  boundsStuds: null,
  tags: ['crate', 'prop', 'survival'],
  sha256: null,
};

test('pending-import search hits carry canonical id and provenance, not an insertable Roblox id', async () => {
  L.resetAssetSchemaCache();
  const d1 = realD1();
  try {
    await L.ensureAssetTables(d1);
    const written = await L.upsertAssets(d1, [CURATED], { seed: true });
    assert.deepEqual(written.rejected, [], 'the fixture must be accepted before the tool is exercised');

    const result = await T.TOOLS.search_asset_library.run(
      { env: d1, assetSources: { mode: 'remember', allow: ['apple_library'] } },
      { query: 'crate' },
    );
    assert.ok(Array.isArray(result), `search refused or failed: ${JSON.stringify(result)}`);
    const hit = result.find((row) => row.availability === 'needs_import');
    assert.ok(hit, `the pending row was not returned: ${JSON.stringify(result)}`);

    assert.equal(hit.libraryId, CURATED.id, 'libraryId is the stable asset_library key, even before import');
    assert.equal(hit.assetId, null, 'assetId remains null until Roblox import produces a real id');
    assert.equal(hit.insertable, false, 'the pending row must not be mistaken for an insertable asset');
    assert.equal(hit.availability, 'needs_import');
    assert.equal(hit.source, CURATED.source, 'source provenance must survive the tool boundary');
    assert.equal(hit.licence, CURATED.licence, 'licence provenance must survive the tool boundary');
  } finally {
    d1.close();
  }
});
