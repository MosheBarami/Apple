// OpenGameArt's expanded catalogue has one direct file URL per row. These tests keep that URL
// attached to the provenance record from the ingest boundary through D1 and into the importer.
//
// The security assertions are deliberately negative: a URL that came from a catalogue is still
// data, not code. The importer must not follow redirects or allow a row to turn into an SSRF probe.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const WORKER = join(dirname(fileURLToPath(import.meta.url)), '..');
const bundle = (name) => {
  const out = join(mkdtempSync(join(tmpdir(), 'oga-download-')), `${name}.mjs`);
  execFileSync(join(WORKER, 'node_modules', '.bin', 'esbuild'), [
    join(WORKER, 'src', `${name}.ts`), '--bundle', '--format=esm', '--target=es2022',
    '--platform=neutral', '--main-fields=main,module', '--outfile=' + out,
  ], { cwd: WORKER, stdio: 'pipe' });
  return import(`file://${out}`);
};

const L = await bundle('asset-library');
const I = await bundle('asset-import');
const { toIngestRecord } = await import(`file://${join(WORKER, '..', '..', 'scripts', 'lib', 'asset-ingest-record.mjs')}`);

const DOWNLOAD = 'https://opengameart.org/sites/default/files/100%20smileys.png';
const ROW = {
  id: 'opengameart/100-smiley-faces/100-smileys',
  name: '100 Smileys',
  kind: 'ui_icon',
  source: 'opengameart',
  sourceUrl: 'https://opengameart.org/content/100-smiley-faces',
  licence: 'CC0',
  licenceUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
  commercialUse: true,
  attributionRequired: false,
  author: 'Angrycheese',
  retrievedAt: '2026-09-15T13:00:52.708Z',
  importedAt: null,
  modifications: ['one file of "100 Smiley Faces"'],
  robloxAssetId: null,
  triangles: null,
  textureResolution: null,
  boundsStuds: null,
  tags: ['smiley', 'face', 'pixel', 'art'],
  sha256: null,
  downloadUrl: DOWNLOAD,
};

test('the ingest boundary promotes only expanded OGA _download metadata', () => {
  const expanded = toIngestRecord({ ...ROW, _download: DOWNLOAD }, { expandedOpenGameArt: true });
  assert.equal(expanded.downloadUrl, DOWNLOAD);
  assert.equal('_download' in expanded, false);

  const rawPack = { ...ROW, _download: DOWNLOAD };
  delete rawPack.downloadUrl;
  const ordinaryOga = toIngestRecord(rawPack, { expandedOpenGameArt: false });
  assert.equal('downloadUrl' in ordinaryOga, false, 'a pack hint must not become a loose-file URL');

  const rawOtherSource = { ...rawPack, source: 'kenney' };
  const otherSource = toIngestRecord(rawOtherSource, { expandedOpenGameArt: true });
  assert.equal('downloadUrl' in otherSource, false, 'another source must keep its own resolver');
});

function fakeD1(results = []) {
  const calls = { exec: [], prepare: [], batches: [] };
  const CORPUS = {
    async exec(sql) {
      calls.exec.push(sql);
      return { count: 1, duration: 0 };
    },
    prepare(sql) {
      calls.prepare.push(sql);
      return {
        bind(...params) {
          const statement = { sql, params };
          return {
            sql,
            params,
            async all() { return { results }; },
            async first() { return results[0] ?? null; },
            async run() { return { success: true, meta: { changes: 1 } }; },
            statement,
          };
        },
      };
    },
    async batch(statements) {
      calls.batches.push(statements);
      return statements.map(() => ({ success: true, meta: { changes: 1 } }));
    },
  };
  return { CORPUS, calls };
}

test('an expanded OpenGameArt row resolves to its own image URL, while a pack still refuses', async () => {
  const resolved = await I.resolveDownload(ROW);
  assert.deepEqual(resolved, { url: DOWNLOAD, contentType: 'image/png' });

  const pack = { ...ROW };
  delete pack.downloadUrl;
  const refused = await I.resolveDownload(pack);
  assert.ok(!('url' in refused));
  assert.match(refused.error, /PACK of many files/);
});

test('direct download URLs are restricted to HTTPS OpenGameArt image hosts', async () => {
  for (const url of [
    'https://evil.example/payload.png',
    'https://127.0.0.1/latest.png',
    'https://[::1]/latest.png',
    'http://opengameart.org/sites/default/files/file.png',
    'https://opengameart.org.evil.example/file.png',
    'https://user:password@opengameart.org/file.png',
    'https://opengameart.org:8443/file.png',
    'https://opengameart.org/sites/default/files/file.html',
  ]) {
    const row = { ...ROW, downloadUrl: url };
    const validation = L.validateProvenance(row, { seed: true, cc0Only: false });
    assert.equal(validation.ok, false, `${url} must be rejected at the ingest boundary`);
    assert.ok(validation.errors.some((e) => /downloadUrl|OpenGameArt|https|host|image/i.test(e)), validation.errors.join('; '));
    const resolved = await I.resolveDownload(row);
    assert.ok(!('url' in resolved), `${url} must not reach fetch`);
    assert.match(resolved.error, /download|OpenGameArt|trusted|host|https/i);
  }
});

test('downloadUrl is not accepted on a different source, even when the URL host is trusted', async () => {
  const row = { ...ROW, source: 'kenney', downloadUrl: DOWNLOAD };
  const validation = L.validateProvenance(row, { seed: true, cc0Only: false });
  assert.equal(validation.ok, false);
  assert.ok(validation.errors.some((e) => /downloadUrl.*opengameart|only.*opengameart/i.test(e)), validation.errors.join('; '));
});

test('the schema and D1 bind preserve download_url instead of silently dropping it', async () => {
  L.resetAssetSchemaCache();
  const d1 = fakeD1();
  await L.ensureAssetTables(d1);
  const create = d1.calls.exec.find((sql) => /create table if not exists asset_library/i.test(sql));
  assert.match(create, /download_url text/i);
  assert.ok(d1.calls.exec.some((sql) => /alter table asset_library add column download_url text/i.test(sql)));

  const result = await L.upsertAssets(d1, [ROW], { seed: true, cc0Only: false, requireImportDate: false });
  assert.deepEqual(result.rejected, []);
  const insert = d1.calls.batches.flat().find((statement) => /^insert into asset_library\(/i.test(statement.sql));
  assert.ok(insert, 'the main asset insert must be queued');
  assert.match(insert.sql, /download_url/i);
  const offset = L.COLUMNS.indexOf('download_url');
  assert.ok(offset >= 0, 'download_url must be an authoritative asset column');
  assert.equal(insert.params[offset], DOWNLOAD);
});

test('schema compatibility swallows only duplicate-column responses', async () => {
  L.resetAssetSchemaCache();
  const d1 = fakeD1();
  const originalExec = d1.CORPUS.exec;
  d1.CORPUS.exec = async (sql) => {
    if (/alter table asset_library add column download_url/i.test(sql)) {
      throw new Error('D1_EXEC_ERROR: permission denied');
    }
    return originalExec(sql);
  };
  await assert.rejects(() => L.ensureAssetTables(d1), /permission denied/);
});

test('pending row selection carries download_url from D1 to resolveDownload', async () => {
  const dbRow = {
    id: ROW.id,
    name: ROW.name,
    kind: ROW.kind,
    source: ROW.source,
    source_url: ROW.sourceUrl,
    licence: ROW.licence,
    licence_url: ROW.licenceUrl,
    commercial_use: 1,
    attribution_required: 0,
    author: ROW.author,
    retrieved_at: ROW.retrievedAt,
    imported_at: null,
    modifications: JSON.stringify(ROW.modifications),
    download_url: DOWNLOAD,
    roblox_asset_id: null,
    triangles: null,
    texture_resolution: null,
    bounds_studs: null,
    tags: JSON.stringify(ROW.tags),
    sha256: null,
  };
  const d1 = fakeD1([dbRow]);
  const rows = await I.pendingAssets(d1, 1, 'opengameart');
  assert.match(d1.calls.prepare[0], /download_url/i);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].downloadUrl, DOWNLOAD);
  assert.deepEqual(await I.resolveDownload(rows[0]), { url: DOWNLOAD, contentType: 'image/png' });
});

test('an old D1 schema maps a missing download_url to null and never claims an OGA import', async () => {
  const legacyRow = {
    id: ROW.id,
    name: ROW.name,
    kind: ROW.kind,
    source: ROW.source,
    source_url: ROW.sourceUrl,
    licence: ROW.licence,
    licence_url: ROW.licenceUrl,
    commercial_use: 1,
    attribution_required: 0,
    author: ROW.author,
    retrieved_at: ROW.retrievedAt,
    imported_at: null,
    modifications: JSON.stringify(ROW.modifications),
    roblox_asset_id: null,
    triangles: null,
    texture_resolution: null,
    bounds_studs: null,
    tags: JSON.stringify(ROW.tags),
    sha256: null,
  };
  let attempts = 0;
  const d1 = {
    CORPUS: {
      prepare(sql) {
        return {
          bind() {
            return {
              async all() {
                attempts++;
                if (attempts === 1) throw new Error('D1_ERROR: no such column: download_url');
                return { results: [legacyRow] };
              },
            };
          },
        };
      },
    },
  };
  const rows = await I.pendingAssets(d1, 1, 'opengameart');
  assert.equal(attempts, 2, 'only the specific missing-column error may trigger the legacy projection');
  assert.equal(rows[0].downloadUrl, null);
  const refused = await I.resolveDownload(rows[0]);
  assert.ok(!('url' in refused));
  assert.match(refused.error, /PACK of many files/);
});

test('a direct OpenGameArt download fails closed on redirects before any upload attempt', async () => {
  const originalFetch = globalThis.fetch;
  const seen = [];
  globalThis.fetch = async (url, init) => {
    seen.push({ url, init });
    throw new TypeError('redirect disallowed');
  };
  try {
    const outcome = await I.importAsset({}, ROW);
    assert.equal(outcome.ok, false);
    assert.match(outcome.error, /download failed|redirect/i);
    assert.equal(seen.length, 1);
    assert.equal(seen[0].url, DOWNLOAD);
    assert.equal(seen[0].init?.redirect, 'error', 'the fetch must never follow an untrusted redirect');
  } finally {
    globalThis.fetch = originalFetch;
  }
});
