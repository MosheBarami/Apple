// A generated mesh must be able to say what generated it, and from what prompt.
//
// WHY THIS FILE EXISTS
//
// `generated_roblox` has been a legal `AssetSourceSite` since the library was written, and
// `originalityOf('generated_roblox') === 'user_generated'` is already pinned by
// provenance.test.mjs. But nothing in apps/worker/src has ever CONSTRUCTED one. The vocabulary
// existed; the record did not. So a mesh that Roblox's Cube 3D model generated inside the
// customer's own Studio session landed in their place carrying no statement that it was
// generated, by which model, or from which prompt.
//
// That is the observation-failure shape this codebase refuses: an asset with no generation
// record does not read as "we failed to record the generation", it reads as an ordinary asset.
// The credits export would file it under "Generated in your own Studio session" on the strength
// of its `source` column alone, while being unable to say what made it.
//
// So the gate is inverted here: a `generated_roblox` record WITHOUT model+prompt is a
// validation ERROR, not a warning. An unprovable generation claim is refused outright.
//
// The paired rule matters just as much: a record that is NOT `generated_roblox` may not carry
// generation metadata. Otherwise a third-party download could be dressed as "generated" —
// laundering somebody else's asset into the customer's own column, which is exactly the §42
// mistake pointed the other way.
//
// Run: node --test packages/evals/src/generation-provenance.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const ESBUILD = new URL('../../../apps/worker/node_modules/.bin/esbuild', import.meta.url).pathname;
const dir = mkdtempSync(join(tmpdir(), 'golem-gen-prov-'));
const src = (name) => new URL(`../../../apps/worker/src/${name}`, import.meta.url).pathname;

const bundle = (name) => {
  const out = join(dir, name.replace(/\.ts$/, '.mjs'));
  execFileSync(ESBUILD, [src(name), '--bundle', '--format=esm', '--platform=neutral', '--main-fields=main,module', '--outfile=' + out], {
    stdio: 'pipe',
  });
  return out;
};

const { generatedAsset, validateProvenance, originalityOf, normaliseLicence, COLUMNS, bindValues } = await import(bundle('asset-library.ts'));
const { attributionReport, renderAttribution, projectAssets } = await import(bundle('provenance.ts'));

const PROJECT = '11111111-2222-3333-4444-555555555555';
const NOW = new Date('2026-09-15T12:00:00.000Z');

const GEN = {
  id: 'generated_roblox/session-9/mossy-boulder-01',
  name: 'Mossy Boulder',
  kind: 'prop',
  tags: ['lowpoly', 'rock'],
  service: 'GenerationService:GenerateModelAsync',
  model: 'Roblox Cube 3D',
  prompt: 'a mossy granite boulder, low poly',
  generatedAt: '2026-09-15T11:00:00.000Z',
};

const used = (provenance) => ({
  use: {
    projectId: PROJECT,
    assetId: provenance.id,
    firstUsedAt: '2026-09-15T11:30:00.000Z',
    lastUsedAt: '2026-09-15T11:30:00.000Z',
    uses: 1,
    viaLiveApi: false,
    context: null,
  },
  provenance,
});

// ==============================================================================================
// 1. The constructor — generation provenance is CONSTRUCTED, never omitted
// ==============================================================================================

test('generatedAsset() builds a record that names the service, the model and the prompt', () => {
  const g = generatedAsset(GEN);
  const v = validateProvenance(g);
  assert.equal(v.ok, true, v.errors.join('; '));

  assert.equal(g.source, 'generated_roblox');
  assert.equal(originalityOf(g.source), 'user_generated', 'a generation is the customer’s, not ours and not a third party’s');
  assert.equal(normaliseLicence(g.licence), 'ROBLOX-GENERATED');

  assert.equal(g.generation.service, 'GenerationService:GenerateModelAsync');
  assert.equal(g.generation.model, 'Roblox Cube 3D');
  assert.equal(g.generation.prompt, 'a mossy granite boulder, low poly');
  assert.equal(g.generation.generatedAt, '2026-09-15T11:00:00.000Z');
});

test('generatedAsset() REFUSES to build a record with no model or no prompt', () => {
  assert.throws(() => generatedAsset({ ...GEN, model: '' }), /model/i, 'a generation that cannot name its model is not provenance');
  assert.throws(() => generatedAsset({ ...GEN, prompt: '   ' }), /prompt/i, 'a generation that cannot name its prompt is not provenance');
  assert.throws(() => generatedAsset({ ...GEN, service: '' }), /service/i);
});

// ==============================================================================================
// 2. The gate — an unprovable generation claim is an ERROR, not a warning
// ==============================================================================================

test('a generated_roblox record with NO generation block is REJECTED', () => {
  const g = generatedAsset(GEN);
  delete g.generation;
  const v = validateProvenance(g);
  assert.equal(v.ok, false, 'an asset claiming to be generated while unable to say what generated it must not validate');
  assert.ok(
    v.errors.some((e) => /generation/i.test(e)),
    `expected an error naming the missing generation block, got: ${v.errors.join('; ')}`,
  );
});

test('a generated_roblox record with an EMPTY prompt or model is REJECTED', () => {
  for (const field of ['model', 'prompt', 'service']) {
    const g = generatedAsset(GEN);
    g.generation = { ...g.generation, [field]: '' };
    const v = validateProvenance(g);
    assert.equal(v.ok, false, `an empty ${field} must not pass as provenance`);
    assert.ok(v.errors.some((e) => new RegExp(field, 'i').test(e)), `expected an error naming ${field}, got: ${v.errors.join('; ')}`);
  }
});

test('a NON-generated record may not claim generation metadata', () => {
  const laundered = {
    id: 'kenney/nature-kit/tree-pine-01',
    name: 'Tree Pine 01',
    kind: 'foliage',
    source: 'kenney',
    sourceUrl: 'https://kenney.nl/assets/nature-kit',
    licence: 'License: Creative Commons CC0',
    licenceUrl: 'https://kenney.nl/assets/nature-kit',
    commercialUse: true,
    attributionRequired: false,
    author: 'Kenney',
    retrievedAt: '2026-08-30T12:00:00.000Z',
    importedAt: '2026-08-31T09:00:00.000Z',
    modifications: [],
    robloxAssetId: 987654321,
    triangles: null,
    textureResolution: null,
    boundsStuds: null,
    tags: ['lowpoly', 'tree'],
    sha256: 'a'.repeat(64),
    generation: { service: 'GenerationService:GenerateModelAsync', model: 'Roblox Cube 3D', prompt: 'a pine tree', generatedAt: '2026-09-15T11:00:00.000Z' },
  };
  const v = validateProvenance(laundered);
  assert.equal(v.ok, false, 'a downloaded third-party asset must not be able to dress itself as a generation');
  assert.ok(v.errors.some((e) => /generation/i.test(e)), `expected an error naming generation, got: ${v.errors.join('; ')}`);
});

// ==============================================================================================
// 3. Persistence — the generation must survive D1, or it is not provenance
// ==============================================================================================

test('the generation block is a real column and round-trips through D1', async () => {
  assert.ok(COLUMNS.includes('generation'), 'generation must be a persisted column, not a value that lives only in memory');

  const g = generatedAsset({ ...GEN, robloxAssetId: 123456789, sha256: 'b'.repeat(64) });
  const values = bindValues(g, 'active', NOW.toISOString());
  assert.equal(values.length, COLUMNS.length, 'every column must be bound');
  const stored = values[COLUMNS.indexOf('generation')];
  assert.equal(typeof stored, 'string', 'generation is stored as JSON text, like modifications and tags');
  assert.deepEqual(JSON.parse(stored), g.generation);

  // and it must come back out of the join, or the credits cannot name the model
  const row = {
    asset_id: g.id,
    first_used_at: '2026-09-15T11:30:00.000Z',
    last_used_at: '2026-09-15T11:30:00.000Z',
    uses: 1,
    via_live_api: 0,
    context: null,
    name: g.name,
    kind: g.kind,
    source: g.source,
    source_url: g.sourceUrl,
    licence: g.licence,
    licence_url: g.licenceUrl,
    commercial_use: 1,
    attribution_required: 0,
    author: g.author,
    retrieved_at: g.retrievedAt,
    imported_at: g.importedAt,
    modifications: '[]',
    roblox_asset_id: 123456789,
    tags: JSON.stringify(g.tags),
    sha256: 'b'.repeat(64),
    generation: stored,
  };
  const env = { CORPUS: { prepare: () => ({ bind: () => ({ all: async () => ({ results: [row] }) }) }) } };
  const assets = await projectAssets(env, PROJECT);
  assert.equal(assets.length, 1);
  assert.deepEqual(assets[0].provenance.generation, g.generation, 'the generation must survive the read back, not just the write');
});

// ==============================================================================================
// 4. The credits — the customer can see what made their mesh
// ==============================================================================================

test('the credits name the model and the prompt for a generated asset', () => {
  const g = generatedAsset(GEN);
  const report = attributionReport(PROJECT, [used(g)], NOW);
  assert.equal(report.userGenerated.length, 1);
  assert.equal(report.original.length, 0, 'a generation is not our original work');

  const text = renderAttribution(report);
  assert.match(text, /Roblox Cube 3D/, 'the credits must name the model that generated the mesh');
  assert.match(text, /a mossy granite boulder, low poly/, 'the credits must quote the prompt it was generated from');
});
