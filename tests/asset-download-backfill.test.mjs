import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { planDownloadBackfill, verifyDownloadBackfill } from '../scripts/lib/asset-download-backfill.mjs';

const bundle = join(mkdtempSync(join(tmpdir(), 'asset-backfill-test-')), 'library.mjs');
execFileSync('apps/worker/node_modules/.bin/esbuild', ['apps/worker/src/asset-library.ts', '--bundle',
  '--format=esm', '--platform=neutral', '--main-fields=main,module', '--outfile=' + bundle], { stdio: 'pipe' });
const { validateProvenance } = await import(pathToFileURL(bundle).href);
const raw = JSON.parse(readFileSync('packages/corpus/data/library/opengameart-expanded.json', 'utf8')).assets[0];
const plan = rows => planDownloadBackfill(rows, validateProvenance);
const query = plan([raw]).queries[0];
assert.ok(query, 'Real catalogue fixture must be valid');
function fixture(overrides = {}) {
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE asset_library (
    id TEXT PRIMARY KEY, source TEXT, source_url TEXT, licence TEXT, licence_url TEXT,
    author TEXT, commercial_use INTEGER, attribution_required INTEGER, name TEXT, kind TEXT,
    status TEXT, roblox_asset_id INTEGER, imported_at TEXT, sha256 TEXT, download_url TEXT,
    modifications TEXT, tags TEXT, updated_at TEXT, health_ok INTEGER)`);
  const row = { id: raw.id, source: raw.source, source_url: raw.sourceUrl, licence: raw.licence,
    licence_url: raw.licenceUrl, author: raw.author, commercial_use: 1, attribution_required: 0,
    name: raw.name, kind: raw.kind, status: 'pending_ingest', roblox_asset_id: null,
    imported_at: null, sha256: null, download_url: null, modifications: '["keep"]',
    tags: '["keep"]', updated_at: 'keep', health_ok: 0, ...overrides };
  db.prepare(`INSERT INTO asset_library VALUES (${Object.keys(row).map(() => '?').join(',')})`).run(...Object.values(row));
  return { db, read: () => db.prepare('SELECT * FROM asset_library').all() };
}

test('real SQLite changes only the missing URL and a second run is an exact no-op', () => {
  const { db, read } = fixture();
  const before = read();
  assert.equal(db.prepare(query.sql).all(...query.params).length, 1);
  const after = read();
  assert.equal(after[0].download_url, raw._download);
  assert.deepEqual(verifyDownloadBackfill(before, after, [query]), { changed: 1, preserved: 0 });
  assert.equal(db.prepare(query.sql).all(...query.params).length, 0);
  assert.deepEqual(read(), after);
  db.close();
});

test('live lifecycle/provenance drift and existing URLs are protected at write time', () => {
  for (const overrides of [
    { id: raw.id + '-changed' }, { source: 'kenney' }, { source_url: 'https://other.example' },
    { licence: 'CC-BY 4.0' }, { licence_url: 'https://other.example/licence' }, { author: 'different' },
    { commercial_use: 0 }, { attribution_required: 1 }, { name: 'Renamed' }, { kind: 'prop' },
    { status: 'active' }, { roblox_asset_id: 123 }, { imported_at: '2026-09-18' },
    { sha256: 'existing' }, { download_url: 'https://opengameart.org/other.png' },
  ]) {
    const { db, read } = fixture(overrides);
    const before = read();
    assert.equal(db.prepare(query.sql).all(...query.params).length, 0, JSON.stringify(overrides));
    assert.deepEqual(read(), before);
    db.close();
  }
});

test('bound strings cannot become executable SQL', () => {
  const malicious = "name'; DELETE FROM asset_library; --";
  const { db, read } = fixture({ author: malicious });
  const params = [...query.params];
  params[5] = malicious;
  assert.equal(db.prepare(query.sql).all(...params).length, 1);
  assert.equal(read().length, 1);
  db.close();
});

test('no loose-file provenance means no planned repair', () => {
  for (const overrides of [
    { _download: undefined }, { _download: 'https://evil.example/a.png' },
    { _download: 'https://opengameart.org/a.zip' }, { source: 'kenney' },
    { licence: 'unknown' }, { commercialUse: false }, { robloxAssetId: 123 },
    { importedAt: '2026-09-18T00:00:00Z' }, { sha256: 'existing' },
  ]) {
    const result = plan([{ ...raw, ...overrides }]);
    assert.equal(result.queries.length, 0, JSON.stringify(overrides));
    assert.equal(result.rejected.length, 1);
  }
  assert.throws(() => plan([]), /empty/);
  const duplicates = plan([raw, { ...raw, _download: 'https://opengameart.org/another.png' }]);
  assert.deepEqual(duplicates.ambiguous, [{ id: raw.id, count: 2 }]);
  assert.equal(duplicates.queries.length, 0, 'Neither colliding file is chosen arbitrarily');
});

test('read-back rejects any unrelated mutation, existing URL overwrite, omission or new ID', () => {
  const { db, read } = fixture();
  const before = read();
  assert.throws(() => verifyDownloadBackfill(before, [], [query]), /count/);
  assert.throws(() => verifyDownloadBackfill(before, [{ ...before[0], id: 'wrong' }], [query]), /Unexpected source/);
  assert.throws(() => verifyDownloadBackfill(before, [{ ...before[0], tags: '[]' }], [query]), /Non-download/);
  assert.throws(() => verifyDownloadBackfill(before, [{ ...before[0], download_url: 'wrong' }], [query]), /Unexpected download/);
  assert.throws(() => verifyDownloadBackfill([{ ...before[0], download_url: 'existing' }],
    [{ ...before[0], download_url: raw._download }], [query]), /Unexpected download/);
  db.close();
});

test('falsification: removing the imported-ID fence makes the protection assertion fail', () => {
  const needle = 'AND roblox_asset_id IS NULL';
  assert.equal(query.sql.split(needle).length - 1, 1);
  const mutant = query.sql.replace(needle, '');
  const { db } = fixture({ roblox_asset_id: 123 });
  assert.throws(() => assert.equal(db.prepare(mutant).all(...query.params).length, 0), assert.AssertionError);
  db.close();
});
