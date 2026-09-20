// A generated mesh must be able to say what generated it, and from what prompt.
//
// WHY THIS FILE EXISTS
//
// `generated_roblox` is a legal `AssetSourceSite`, and `originalityOf('generated_roblox') ===
// 'user_generated'` is pinned by provenance.test.mjs. This file is about what happens to the
// generation block AFTER it is stored: that it survives the read back out of D1, and that the
// credits the customer reads can name the model and quote the prompt.
//
// The failure it refuses is the observation-failure shape: an asset whose generation record was
// lost does not read as "we failed to record the generation", it reads as an ordinary asset. The
// credits export files it under "Generated in your own Studio session" on the strength of its
// `source` column alone, while being unable to say what made it.
//
// WHAT WAS HERE AND IS NOT, AND WHY. Two whole sections tested a WRITE path: `generatedAsset()`,
// which constructed the record, `validateProvenance()`, which refused one carrying no model or
// prompt, and `COLUMNS`/`bindValues`, the D1 binding for the catalogue table. All four lived in
// `asset-library.ts`, which was deleted with the asset catalogue on 2026-09-20 — and, as the
// original version of this header said in as many words, nothing in apps/worker/src had ever
// called `generatedAsset` anyway. They were a vocabulary with no speaker.
//
// The READ path is live and is kept: `projectAssets` still parses a `generation` column off a row,
// and `attributionReport`/`renderAttribution` still render it. The record below is therefore a
// fixture written out in full rather than something a constructor produces.
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

const { originalityOf, normaliseLicence } = await import(bundle('asset-provenance.ts'));
const { attributionReport, renderAttribution, projectAssets } = await import(bundle('provenance.ts'));

const PROJECT = '11111111-2222-3333-4444-555555555555';
const NOW = new Date('2026-09-15T12:00:00.000Z');

/** A generated-asset provenance record, exactly as `projectAssets()` reconstructs one from D1. */
const generated = (over = {}) => ({
  id: 'generated_roblox/session-9/mossy-boulder-01',
  name: 'Mossy Boulder',
  kind: 'prop',
  source: 'generated_roblox',
  sourceUrl: 'https://create.roblox.com/docs/en-us/reference/engine/classes/GenerationService',
  licence: 'Roblox-generated content, owned by the account that generated it',
  licenceUrl: 'https://create.roblox.com/docs/en-us/reference/engine/classes/GenerationService',
  commercialUse: true,
  attributionRequired: false,
  author: 'Generated in the customer’s own Studio session',
  retrievedAt: '2026-09-15T11:00:00.000Z',
  importedAt: '2026-09-15T11:00:00.000Z',
  modifications: [],
  robloxAssetId: null,
  triangles: null,
  textureResolution: null,
  boundsStuds: null,
  tags: ['lowpoly', 'rock'],
  sha256: null,
  generation: {
    service: 'GenerationService:GenerateModelAsync',
    model: 'Roblox Cube 3D',
    prompt: 'a mossy granite boulder, low poly',
    generatedAt: '2026-09-15T11:00:00.000Z',
  },
  ...over,
});

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
// 1. The vocabulary the record is written in
// ==============================================================================================

test('a generated asset is the CUSTOMER’S, filed under neither ours nor a third party’s', () => {
  const g = generated();
  assert.equal(g.source, 'generated_roblox');
  assert.equal(originalityOf(g.source), 'user_generated', 'a generation is the customer’s, not ours and not a third party’s');
  assert.equal(normaliseLicence(g.licence), 'ROBLOX-GENERATED',
    'the licence string must resolve, or the credits grade it unrecognised and block a commercial publish');
});

// ==============================================================================================
// 2. The read back — a generation block that does not survive D1 cannot be credited
// ==============================================================================================

test('the generation block survives the read back out of D1', async () => {
  const g = generated({ robloxAssetId: 123456789, sha256: 'b'.repeat(64) });
  // Stored as JSON text, like `modifications` and `tags`. This is the shape the column holds.
  const stored = JSON.stringify(g.generation);

  // It must come back out of the join, or the credits cannot name the model.
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
// 3. The credits — the customer can see what made their mesh
// ==============================================================================================

test('the credits name the model and the prompt for a generated asset', () => {
  const g = generated();
  const report = attributionReport(PROJECT, [used(g)], NOW);
  assert.equal(report.userGenerated.length, 1);
  assert.equal(report.original.length, 0, 'a generation is not our original work');

  const text = renderAttribution(report);
  assert.match(text, /Roblox Cube 3D/, 'the credits must name the model that generated the mesh');
  assert.match(text, /a mossy granite boulder, low poly/, 'the credits must quote the prompt it was generated from');
});
