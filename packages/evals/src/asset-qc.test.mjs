// Tests for the asset pipeline's pure logic: the source decision table, the Creator Store
// verification gate, provenance/licence validation, and the scale-plausibility maths.
//
// These rules decide two things that are expensive to get wrong — whether Golem executes a
// stranger's Lua inside a customer's place, and whether it can honestly say where every asset it
// ships came from — so they are pinned here rather than left to inspection.
//
// The modules are TypeScript in the worker; they are transpiled on the fly so there is no build
// step and no duplicated copy to drift. The Luau QC gate cannot run under node, so instead the
// last block PARSES apps/plugin/src/Generation.luau and asserts its mirrored thresholds agree
// with the canonical TypeScript ones — which is what actually stops the two drifting.
//
// Run: node --test packages/evals/src/asset-qc.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'golem-assets-'));
const WORKER = new URL('../../../apps/worker/', import.meta.url).pathname;
const src = (name) => join(WORKER, 'src', name);

// esbuild is resolved from the workspace that DECLARES it, not through `npx`.
//
// `npx esbuild` was resolving nothing here: esbuild is a devDependency of apps/worker and this
// test runs with packages/evals as its cwd, so npx fell through to fetching it from the registry —
// which worked on a warm machine and failed everywhere else, including CI. A test whose pass
// depends on a package it does not declare being downloadable is a test that reports the network.
const esbuild = join(WORKER, 'node_modules', '.bin', 'esbuild');

// assets.ts has no runtime imports, so a plain transpile is enough.
const assetsOut = join(dir, 'assets.mjs');
execFileSync(esbuild, [src('assets.ts'), '--format=esm', '--outfile=' + assetsOut], { stdio: 'pipe', cwd: WORKER });
// asset-library.ts imports embed() from the gateway, so it is bundled with its local deps.
const libraryOut = join(dir, 'asset-library.mjs');
// `--main-fields` is explicit because `--platform=neutral` defaults it to EMPTY, so a workspace
// package whose entry comes from `main` cannot be resolved at all. That was invisible until
// asset-library gained a transitive @golem/shared import through the gateway; the bundle had
// simply never had a package to resolve before.
execFileSync(
  esbuild,
  [src('asset-library.ts'), '--bundle', '--format=esm', '--platform=neutral', '--main-fields=main,module', '--outfile=' + libraryOut],
  { stdio: 'pipe', cwd: WORKER },
);

// provenance.ts is bundled the same way asset-library is, and for the same reason: it imports
// from asset-library.ts, so a plain transpile would leave those imports unresolved.
const provOut = join(dir, 'provenance.mjs');
execFileSync(
  esbuild,
  [src('provenance.ts'), '--bundle', '--format=esm', '--platform=neutral', '--main-fields=main,module', '--outfile=' + provOut],
  { stdio: 'pipe', cwd: WORKER },
);
const { attributionReport, renderAttribution } = await import(provOut);

const {
  ASSET_NEEDS,
  ASSET_KINDS,
  chooseAssetSource,
  assetDecisionTable,
  verifyCreatorStoreAsset,
  searchCreatorStore,
  ACCEPTABLE_ASSET_TYPES,
  REFUSED_ASSET_TYPES,
  checkScale,
  scaleRuleFor,
  SCALE_ENVELOPES,
  QC_THRESHOLDS,
  pivotToleranceStuds,
  lateralPivotToleranceStuds,
} = await import(assetsOut);

const { validateProvenance, normaliseLicence, LICENCES, SEED_MANIFEST, rowsPerStatement, MAX_BOUND_PARAMS, assetEmbeddingInput } = await import(libraryOut);

// ==============================================================================================
// 1. Decision table
// ==============================================================================================

test('every need has an ordered, non-empty, duplicate-free list with a stated gate', () => {
  for (const need of ASSET_NEEDS) {
    const choices = chooseAssetSource(need);
    assert.ok(choices.length > 0, `${need} returned nothing`);
    const seen = new Set();
    for (const c of choices) {
      assert.ok(c.rationale.length > 20, `${need}/${c.source} has no real rationale`);
      assert.ok(c.verification.length > 0, `${need}/${c.source} has no verification gate`);
      assert.ok(!seen.has(c.source), `${need} lists ${c.source} twice`);
      seen.add(c.source);
    }
  }
});

test('chooseAssetSource returns copies — a caller cannot corrupt the table', () => {
  const first = chooseAssetSource('prop');
  first[0].source = 'creator_store';
  assert.equal(chooseAssetSource('prop')[0].source, 'library');
});

test('ground goes to Terrain first — free, no assets, better looking than any slab', () => {
  assert.equal(chooseAssetSource('ground')[0].source, 'terrain');
});

test('buildings are procedural first and never reach the Creator Store', () => {
  const choices = chooseAssetSource('building');
  assert.equal(choices[0].source, 'procedural');
  assert.ok(!choices.some((c) => c.source === 'creator_store'), 'buildings must never come from the Creator Store — that is where script-bearing free models live');
});

test('FOLIAGE IS WHERE PROCEDURAL LOSES: library first, procedural absent entirely', () => {
  const choices = chooseAssetSource('foliage');
  assert.equal(choices[0].source, 'library');
  assert.ok(!choices.some((c) => c.source === 'procedural'), 'parts-and-wedges trees look amateur at any part count; procedural must not be offered for foliage');
  assert.match(choices[0].rationale, /MANDATORY/);
});

test('CHARACTERS ARE WHERE PROCEDURAL LOSES: built-in rig first, procedural and Creator Store absent', () => {
  const choices = chooseAssetSource('character');
  assert.equal(choices[0].source, 'builtin');
  assert.ok(!choices.some((c) => c.source === 'procedural'), 'procedural humanoids look bad at any part count');
  assert.ok(!choices.some((c) => c.source === 'creator_store'), 'Creator Store characters carry scripts');
  const generated = choices.find((c) => c.source === 'generation_service');
  assert.match(generated.rationale, /STATIC|static/, 'GenerateModelAsync does not rig — that has to be said');
});

test('vehicles lead with GenerateModelAsync, because Car5 exists for exactly this', () => {
  const choices = chooseAssetSource('vehicle');
  assert.equal(choices[0].source, 'generation_service');
  assert.match(choices[0].rationale, /Car5/);
});

test('lighting is procedural and nothing else — the highest quality-per-effort row', () => {
  const choices = chooseAssetSource('lighting');
  assert.equal(choices.length, 1);
  assert.equal(choices[0].source, 'procedural');
});

test('props prefer the library and put the Creator Store last', () => {
  const choices = chooseAssetSource('prop');
  assert.equal(choices[0].source, 'library');
  assert.equal(choices[choices.length - 1].source, 'creator_store');
});

test('textures lead with the free built-in Enum.Material', () => {
  assert.equal(chooseAssetSource('texture')[0].source, 'builtin');
});

test('the whole table renders, and lighting is the only single-option row', () => {
  const table = assetDecisionTable();
  assert.equal(Object.keys(table).length, ASSET_NEEDS.length);
  const singles = Object.entries(table).filter(([, v]) => v.length === 1).map(([k]) => k);
  assert.deepEqual(singles, ['lighting']);
});

test('ASSET_KINDS is the storable subset — lighting is configuration, not an asset', () => {
  assert.ok(!ASSET_KINDS.includes('lighting'));
  assert.equal(ASSET_KINDS.length, ASSET_NEEDS.length - 1);
});

// ==============================================================================================
// 2. Creator Store verification gate
// ==============================================================================================

/** A details-endpoint entry that passes every assertion. Tests mutate one field at a time. */
const cleanMesh = (over = {}) => ({
  asset: {
    id: 12345,
    name: 'Low Poly Pine Tree',
    typeId: 40,
    hasScripts: false,
    scriptCount: 0,
    visibilityStatus: 1,
    isEndorsed: false,
    capabilities: { shouldSandbox: false },
    modelTechnicalDetails: { objectMeshSummary: { triangles: 1200, vertices: 700 } },
    ...(over.asset ?? {}),
  },
  creator: { id: 998877, name: 'SomeVerifiedCreator', isVerifiedCreator: true, ...(over.creator ?? {}) },
  voting: { upVotePercent: 92, voteCount: 340, ...(over.voting ?? {}) },
  fiatProduct: { isFree: true, purchasable: true, published: true, ...(over.fiatProduct ?? {}) },
});

/** An injectable fetch that returns one details entry and records every call it received. */
function fakeFetch(entry, { status = 200, ok = true, body, throws } = {}) {
  const calls = [];
  const impl = async (url, init) => {
    calls.push({ url, init });
    if (throws) throw new Error(throws);
    return {
      ok,
      status,
      json: async () => {
        if (body === 'invalid') throw new Error('Unexpected token < in JSON');
        return body ?? { data: entry === null ? [] : [entry] };
      },
    };
  };
  impl.calls = calls;
  return impl;
}

const verifyOpts = (fetchImpl, over = {}) => ({ provenance: 'search_result', fetchImpl, now: () => new Date('2026-08-31T00:00:00.000Z'), ...over });

test('a clean, free, script-free Mesh from a verified creator passes', async () => {
  const f = fakeFetch(cleanMesh());
  const v = await verifyCreatorStoreAsset({}, 12345, verifyOpts(f));
  assert.equal(v.ok, true, v.reasons.join('; '));
  assert.equal(v.verdict, 'pass');
  assert.deepEqual(v.reasons, []);
  assert.equal(v.assetType, 'MeshPart');
  assert.equal(v.triangles, 1200);
  assert.match(v.thumbnailUrl, /thumbnails\.roblox\.com.*assetIds=12345/);
});

test('AN ASSET WITH hasScripts:true IS REFUSED — this is the backdoor-script vector', async () => {
  const f = fakeFetch(cleanMesh({ asset: { hasScripts: true, scriptCount: 3 } }));
  const v = await verifyCreatorStoreAsset({}, 12345, verifyOpts(f));
  assert.equal(v.ok, false);
  assert.equal(v.verdict, 'fail_has_scripts');
  assert.match(v.reasons.join(' '), /script/i);
  assert.equal(v.hasScripts, true);
});

test('a positive scriptCount is refused even when hasScripts is false', async () => {
  const f = fakeFetch(cleanMesh({ asset: { hasScripts: false, scriptCount: 1 } }));
  const v = await verifyCreatorStoreAsset({}, 12345, verifyOpts(f));
  assert.equal(v.verdict, 'fail_has_scripts');
});

test('scripts outrank every other failure, so the log shows the fact that matters', async () => {
  // wrong type AND not free AND script-bearing: the verdict must still name the script
  const f = fakeFetch(cleanMesh({ asset: { typeId: 10, hasScripts: true, scriptCount: 9 }, fiatProduct: { isFree: false } }));
  const v = await verifyCreatorStoreAsset({}, 12345, verifyOpts(f));
  assert.equal(v.verdict, 'fail_has_scripts');
  // but nothing is hidden — every failed assertion is still reported
  assert.equal(v.reasons.length, 3);
  assert.match(v.reasons.join(' '), /Model/);
  assert.match(v.reasons.join(' '), /not free/);
});

test('A MODEL-TYPE ASSET IS REFUSED IN FAVOUR OF THE MESH OR IMAGE IT WRAPS', async () => {
  const f = fakeFetch(cleanMesh({ asset: { typeId: 10 } }));
  const v = await verifyCreatorStoreAsset({}, 12345, verifyOpts(f));
  assert.equal(v.ok, false);
  assert.equal(v.verdict, 'fail_wrong_type');
  assert.equal(v.assetType, 'Model');
  const reason = v.reasons.join(' ');
  assert.match(reason, /Model/);
  assert.match(reason, /Mesh/, 'the refusal must point at the acceptable alternative');
  assert.match(reason, /Image/);
});

test('the allowlist is Mesh, Image and Decal; Model is the named refusal', () => {
  assert.deepEqual(Object.keys(ACCEPTABLE_ASSET_TYPES).map(Number).sort((a, b) => a - b), [1, 13, 40]);
  assert.deepEqual(REFUSED_ASSET_TYPES, { 10: 'Model' });
  assert.equal(ACCEPTABLE_ASSET_TYPES[10], undefined, 'Model must never be on the allowlist');
});

test('an asset type outside the allowlist is refused rather than assumed harmless', async () => {
  const f = fakeFetch(cleanMesh({ asset: { typeId: 3 } })); // Audio
  const v = await verifyCreatorStoreAsset({}, 12345, verifyOpts(f));
  assert.equal(v.verdict, 'fail_wrong_type');
});

test('expectType catches an id that resolves to the wrong allowed type', async () => {
  const f = fakeFetch(cleanMesh({ asset: { typeId: 13 } }));
  const v = await verifyCreatorStoreAsset({}, 12345, verifyOpts(f, { expectType: 'MeshPart' }));
  assert.equal(v.verdict, 'fail_wrong_type');
  assert.match(v.reasons[0], /asked for a MeshPart/);
});

test('sandbox-flagged assets are refused — Roblox itself thinks they need containment', async () => {
  const f = fakeFetch(cleanMesh({ asset: { capabilities: { shouldSandbox: true } } }));
  assert.equal((await verifyCreatorStoreAsset({}, 12345, verifyOpts(f))).verdict, 'fail_sandboxed');
});

test('a paid asset is refused, and so is a free-but-unpurchasable one', async () => {
  const paid = fakeFetch(cleanMesh({ fiatProduct: { isFree: false } }));
  assert.equal((await verifyCreatorStoreAsset({}, 1, verifyOpts(paid))).verdict, 'fail_not_free');
  const stuck = fakeFetch(cleanMesh({ fiatProduct: { isFree: true, purchasable: false } }));
  assert.equal((await verifyCreatorStoreAsset({}, 1, verifyOpts(stuck))).verdict, 'fail_not_free');
});

/* RECALIBRATED 2026-08-31. These four tests used to assert that visibility,
   creator verification and vote counts REJECT an asset. Together they rejected
   100% of the live catalogue — measured: findVerifiedAssets('low poly tree')
   returned 0 passed / 12 rejected — so the asset pipeline could never hand the
   agent an insertable id and every prop in the benchmark world had to be built
   from primitives.

   The decisive measurement: asset 6434088676 reports `visibilityStatus: 0` and
   `hasScripts: false`, and INSERTED SUCCESSFULLY into a real place with
   `sandboxed: false`. A moderated asset does not do that. The field is a
   ranking signal, not a safety one.

   These now pin the opposite contract — quality signals RANK, they do not
   reject — and the tests immediately below still pin the assertions that do
   reject, which are the ones about safety and licensing. */
test('a low-visibility asset is ACCEPTED and recorded as a quality signal, not refused', async () => {
  const f = fakeFetch(cleanMesh({ asset: { visibilityStatus: 0 } }));
  const v = await verifyCreatorStoreAsset({}, 1, verifyOpts(f));
  assert.equal(v.ok, true, v.reasons.join('; '));
  assert.equal(v.qualitySignals?.surfaced, false, 'low visibility must still be RECORDED so ranking can prefer surfaced assets');
});

test('an unverified, unendorsed creator is accepted, and the fact is recorded', async () => {
  const f = fakeFetch(cleanMesh({ creator: { id: 42, name: 'RandomUser', isVerifiedCreator: false } }));
  const v = await verifyCreatorStoreAsset({}, 1, verifyOpts(f));
  assert.equal(v.ok, true, v.reasons.join('; '));
  assert.equal(v.qualitySignals?.unverifiedCreator, true);
});

test('an endorsed asset from an unverified creator is accepted', async () => {
  const f = fakeFetch(cleanMesh({ asset: { isEndorsed: true }, creator: { id: 42, isVerifiedCreator: false } }));
  assert.equal((await verifyCreatorStoreAsset({}, 1, verifyOpts(f))).ok, true);
});

test('Roblox-authored assets skip the vote gate, which would otherwise reject them all', async () => {
  const f = fakeFetch(cleanMesh({ creator: { id: 1, name: 'Roblox', isVerifiedCreator: false }, voting: { upVotePercent: 0, voteCount: 0 } }));
  const v = await verifyCreatorStoreAsset({}, 1, verifyOpts(f));
  assert.equal(v.ok, true, v.reasons.join('; '));
});

test('a low-vote asset is accepted by default — a new free mesh is not less SAFE than a popular one', async () => {
  const f = fakeFetch(cleanMesh({ voting: { upVotePercent: 100, voteCount: 2 } }));
  const v = await verifyCreatorStoreAsset({}, 1, verifyOpts(f));
  assert.equal(v.ok, true, v.reasons.join('; '));
  assert.equal(v.qualitySignals?.voteCount, 2);
});

test('vote thresholds still apply when a CALLER asks for them', async () => {
  // The quality-sensitive path can opt back in; it is simply no longer the
  // default, because the default was "reject everything".
  const f = fakeFetch(cleanMesh({ voting: { upVotePercent: 30, voteCount: 500 } }));
  const v = await verifyCreatorStoreAsset({}, 1, verifyOpts(f, { minUpVotePercent: 70 }));
  assert.equal(v.verdict, 'fail_low_rating');
});

test('SAFETY assertions did not move: scripts, type and free still reject', async () => {
  // The point of the recalibration was that quality heuristics were masquerading
  // as security. These are the real ones and they must be untouched.
  const scripted = fakeFetch(cleanMesh({ asset: { hasScripts: true } }));
  assert.equal((await verifyCreatorStoreAsset({}, 1, verifyOpts(scripted))).verdict, 'fail_has_scripts');
  const wrongType = fakeFetch(cleanMesh({ asset: { typeId: 10 } }));
  assert.equal((await verifyCreatorStoreAsset({}, 1, verifyOpts(wrongType))).verdict, 'fail_wrong_type');
  const paid = fakeFetch(cleanMesh({ fiatProduct: { isFree: false, purchasable: true } }));
  assert.equal((await verifyCreatorStoreAsset({}, 1, verifyOpts(paid))).verdict, 'fail_not_free');
});

test('an asset over the remaining triangle budget is refused', async () => {
  const f = fakeFetch(cleanMesh());
  const v = await verifyCreatorStoreAsset({}, 1, verifyOpts(f, { maxTriangles: 500 }));
  assert.equal(v.verdict, 'fail_too_many_triangles');
  assert.match(v.reasons[0], /1200 triangles/);
});

// ---- the "never guess asset IDs" invariant ---------------------------------------------------

test('AN ID FROM MODEL OUTPUT IS REFUSED WITHOUT EVEN MAKING A REQUEST', async () => {
  const f = fakeFetch(cleanMesh());
  const v = await verifyCreatorStoreAsset({}, 12345, verifyOpts(f, { provenance: 'model_output' }));
  assert.equal(v.ok, false);
  assert.equal(v.verdict, 'fail_bad_provenance');
  assert.equal(f.calls.length, 0, 'a hallucinated id must not even reach the network');
});

test('omitting provenance is refused too — the caller has to say where the id came from', async () => {
  const f = fakeFetch(cleanMesh());
  const v = await verifyCreatorStoreAsset({}, 12345, { fetchImpl: f });
  assert.equal(v.verdict, 'fail_bad_provenance');
  assert.equal(f.calls.length, 0);
});

test('library and user-supplied provenance are allowed through to verification', async () => {
  for (const provenance of ['library', 'user_supplied', 'search_result']) {
    const f = fakeFetch(cleanMesh());
    const v = await verifyCreatorStoreAsset({}, 12345, verifyOpts(f, { provenance }));
    assert.equal(v.ok, true, `${provenance}: ${v.reasons.join('; ')}`);
    assert.equal(f.calls.length, 1);
  }
});

test('a non-integer or negative id is refused before any request', async () => {
  const f = fakeFetch(cleanMesh());
  for (const bad of [0, -5, 1.5, NaN]) {
    const v = await verifyCreatorStoreAsset({}, bad, verifyOpts(f));
    assert.equal(v.ok, false);
  }
  assert.equal(f.calls.length, 0);
});

// ---- failure modes must degrade, never throw --------------------------------------------------

test('a network error is a refusal, not an exception', async () => {
  const f = fakeFetch(null, { throws: 'ECONNRESET' });
  const v = await verifyCreatorStoreAsset({}, 1, verifyOpts(f));
  assert.equal(v.verdict, 'fail_network');
  assert.match(v.reasons[0], /ECONNRESET/);
});

test('a 404 is not-found and a 500 is a network failure', async () => {
  const missing = fakeFetch(null, { ok: false, status: 404 });
  assert.equal((await verifyCreatorStoreAsset({}, 1, verifyOpts(missing))).verdict, 'fail_not_found');
  const broken = fakeFetch(null, { ok: false, status: 500 });
  assert.equal((await verifyCreatorStoreAsset({}, 1, verifyOpts(broken))).verdict, 'fail_network');
});

test('an HTML error page where JSON was expected does not crash the gate', async () => {
  const f = fakeFetch(null, { body: 'invalid' });
  const v = await verifyCreatorStoreAsset({}, 1, verifyOpts(f));
  assert.equal(v.verdict, 'fail_network');
});

test('an empty data array means the id does not exist', async () => {
  const f = fakeFetch(null);
  assert.equal((await verifyCreatorStoreAsset({}, 1, verifyOpts(f))).verdict, 'fail_not_found');
});

// ==============================================================================================
// 3. Creator Store search
// ==============================================================================================

function searchFetch(payload, { ok = true, status = 200 } = {}) {
  const calls = [];
  const impl = async (url, init) => {
    calls.push({ url, init });
    return { ok, status, json: async () => payload };
  };
  impl.calls = calls;
  return impl;
}

const V1_PAYLOAD = { data: [{ asset: { id: 777, name: 'Rock', typeId: 40 }, creator: { id: 1, name: 'Roblox' } }] };

test('with no API key the search degrades to the v1 endpoint and says so clearly', async () => {
  const f = searchFetch(V1_PAYLOAD);
  const r = await searchCreatorStore({}, 'rock', { fetchImpl: f });
  assert.equal(r.configured, false);
  assert.equal(r.endpoint, 'v1');
  assert.equal(r.results.length, 1);
  assert.equal(r.results[0].assetId, 777);
  assert.match(r.note, /ROBLOX_API_KEY is not configured/);
  assert.match(f.calls[0].url, /toolbox-service\/v1\/marketplace\/40/);
});

test('with an API key the official v2 endpoint is used, with the key in the header', async () => {
  const f = searchFetch({ data: [{ asset: { id: 42, name: 'Tree', typeId: 40 }, creator: { id: 1 } }] });
  const r = await searchCreatorStore({ ROBLOX_API_KEY: 'k' }, 'tree', { fetchImpl: f });
  assert.equal(r.configured, true);
  assert.equal(r.endpoint, 'v2');
  assert.equal(f.calls[0].url, 'https://apis.roblox.com/toolbox-service/v2/assets:search');
  assert.equal(f.calls[0].init.method, 'POST');
  assert.equal(f.calls[0].init.headers['x-api-key'], 'k');
  const body = JSON.parse(f.calls[0].init.body);
  assert.equal(body.includeOnlyVerifiedCreators, true, 'the verified-creator filter must be on by default');
});

test('a rejected API key falls back to v1 rather than failing the build', async () => {
  const calls = [];
  const f = async (url, init) => {
    calls.push(url);
    if (url.includes('v2')) return { ok: false, status: 401, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => V1_PAYLOAD };
  };
  const r = await searchCreatorStore({ ROBLOX_API_KEY: 'bad' }, 'rock', { fetchImpl: f });
  assert.equal(r.endpoint, 'v1');
  assert.match(r.note, /HTTP 401/);
  assert.equal(r.results.length, 1);
});

test('robloxOnly restricts the v1 query to Roblox-authored assets', async () => {
  const f = searchFetch(V1_PAYLOAD);
  await searchCreatorStore({}, 'tree', { fetchImpl: f, robloxOnly: true });
  assert.match(f.calls[0].url, /creatorTargetId=1/);
  assert.match(f.calls[0].url, /creatorType=1/);
});

test('when both endpoints fail the result is empty and explained, never thrown', async () => {
  const f = async () => {
    throw new Error('offline');
  };
  const r = await searchCreatorStore({}, 'tree', { fetchImpl: f });
  assert.equal(r.endpoint, 'none');
  assert.deepEqual(r.results, []);
  assert.match(r.error, /offline/);
  assert.ok(r.note.length > 0);
});

test('an empty query makes no request at all', async () => {
  const f = searchFetch(V1_PAYLOAD);
  const r = await searchCreatorStore({}, '   ', { fetchImpl: f });
  assert.equal(r.endpoint, 'none');
  assert.equal(f.calls.length, 0);
});

test('a search hit never claims to be verified — hintIsFree is only ever a hint', async () => {
  const f = searchFetch({ data: [{ asset: { id: 5, name: 'x', typeId: 40 }, fiatProduct: { isFree: true } }] });
  const r = await searchCreatorStore({}, 'x', { fetchImpl: f });
  assert.equal(r.results[0].hintIsFree, true);
  assert.match(r.note, /must still pass verifyCreatorStoreAsset/);
});

// ==============================================================================================
// 4. Licence and provenance validation
// ==============================================================================================

const goodRecord = (over = {}) => ({
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
  robloxAssetId: null,
  triangles: 480,
  textureResolution: 256,
  boundsStuds: [6, 18, 6],
  tags: ['lowpoly', 'tree', 'foliage'],
  sha256: 'a'.repeat(64),
  ...over,
});

test('a complete CC0 record validates', () => {
  const r = validateProvenance(goodRecord());
  assert.equal(r.ok, true, r.errors.join('; '));
  assert.equal(r.licenceId, 'CC0-1.0');
});

test('normaliseLicence resolves the verbatim wordings the sources actually publish', () => {
  assert.equal(normaliseLicence('License: Creative Commons CC0'), 'CC0-1.0');
  assert.equal(normaliseLicence('License: CC0'), 'CC0-1.0');
  assert.equal(normaliseLicence('All assets are released under the Creative Commons CC0 license'), 'CC0-1.0');
  assert.equal(normaliseLicence('CC BY 4.0'), 'CC-BY-4.0');
  assert.equal(normaliseLicence('Creative Commons Attribution 3.0 Unported'), 'CC-BY-3.0');
  assert.equal(normaliseLicence('something nobody has ever heard of'), null);
});

test('share-alike is matched BEFORE plain attribution — "CC BY-SA" must not read as "CC BY"', () => {
  assert.equal(normaliseLicence('CC BY-SA 4.0'), 'CC-BY-SA-4.0');
  assert.equal(normaliseLicence('Creative Commons Attribution-ShareAlike'), 'CC-BY-SA-4.0');
});

test('CC-BY-SA and GPL are excluded from the library outright', () => {
  for (const licence of ['CC BY-SA 4.0', 'GPL-3.0']) {
    const r = validateProvenance(goodRecord({ licence, attributionRequired: true }));
    assert.equal(r.ok, false);
    assert.match(r.errors.join(' '), /excluded from the library/);
  }
  assert.equal(LICENCES['CC-BY-SA-4.0'].allowedInLibrary, false);
  assert.equal(LICENCES['GPL-3.0'].allowedInLibrary, false);
});

test('a record whose booleans contradict its licence is rejected, not quietly corrected', () => {
  const r = validateProvenance(goodRecord({ attributionRequired: true }));
  assert.equal(r.ok, false);
  assert.match(r.errors.join(' '), /attributionRequired is true but CC0-1.0 says false/);
});

test('an unrecognised licence string is rejected rather than guessed at', () => {
  const r = validateProvenance(goodRecord({ licence: 'free for everyone probably' }));
  assert.equal(r.ok, false);
  assert.match(r.errors.join(' '), /not a recognised licence/);
});

test('CC-BY is allowed but warns, and is rejected when an ingest asks for no-credit licences', () => {
  const ccby = goodRecord({ licence: 'CC BY 4.0', attributionRequired: true });
  const permissive = validateProvenance(ccby);
  assert.equal(permissive.ok, true, permissive.errors.join('; '));
  assert.match(permissive.warnings.join(' '), /credit line/);
  const strict = validateProvenance(ccby, { cc0Only: true });
  assert.equal(strict.ok, false);
  // The REASON, not a licence id and not a fixed sentence. The message has been reworded twice
  // — once when the rule stopped being a list of three ids, once when the policy it enforced was
  // retired — and both times this assertion went red for a wording change rather than a
  // behaviour one. What must hold is that the refusal is about the credit line.
  assert.match(strict.errors.join(' '), /credit line|attribution/, 'the reason must name the obligation');
});

test('THE POLICY IS "NO ATTRIBUTION OWED", NOT "THE STRING SAYS CC0"', () => {
  // These are different rules and the gate used to be the first one wearing the second one's name:
  // an explicit list of three licence ids, which refused ROBLOX-TOU — a licence with
  // attributionRequired FALSE, because using a free Creator Store asset owes nobody a credit. That
  // would have excluded the ~100,000 library rows that are already Roblox asset ids and need no
  // upload at all: the one part of the library with nothing standing between it and a game.
  const tou = goodRecord({
    source: 'creator_store',
    licence: 'Roblox Terms of Use',
    attributionRequired: false,
    robloxAssetId: 4969855485,
  });
  const strict = validateProvenance(tou, { cc0Only: true });
  assert.equal(strict.ok, true, strict.errors.join('; '));

  // And the gate still bites wherever an obligation really exists — the control, so this is not
  // simply a loosening that lets everything through.
  for (const l of ['CC BY 4.0', 'CC BY 3.0', 'MIT', 'Apache 2.0']) {
    const rec = goodRecord({ licence: l, attributionRequired: true });
    assert.equal(validateProvenance(rec, { cc0Only: true }).ok, false, `${l} owes a credit line and must be refused`);
  }
});

test('A ROBLOX ASSET ID WE DID NOT MINT NEEDS NO HASH — and one we did still does', () => {
  // `robloxAssetId` meant one thing when it was written: "we uploaded this, here is the id we got
  // back", and the hash invariant rests on it — we must always be able to say what bytes we put in
  // somebody's account. A Creator Store row's id belongs to its own creator and we never held the
  // bytes, so there is no hash we could honestly record. The invariant is scoped, not dropped.
  const store = goodRecord({ source: 'creator_store', licence: 'Roblox Terms of Use', attributionRequired: false, robloxAssetId: 123456789, sha256: null });
  assert.equal(validateProvenance(store).ok, true, validateProvenance(store).errors.join('; '));

  const ours = goodRecord({ source: 'poly_haven', robloxAssetId: 123456789, sha256: null });
  const r = validateProvenance(ours);
  assert.equal(r.ok, false);
  assert.match(r.errors.join(' '), /sha256 is required/, 'an id WE minted must still be accompanied by the bytes we uploaded');
});

test('provenance fields that cannot be verified later are rejected', () => {
  const cases = [
    [{ id: 'NotASlug' }, /namespaced lowercase slug/],
    [{ id: 'nonamespace' }, /namespaced lowercase slug/],
    [{ name: '' }, /name is required/],
    [{ kind: 'spaceship' }, /kind must be one of/],
    [{ source: 'some-random-site' }, /source must be one of/],
    [{ sourceUrl: 'http://kenney.nl/x' }, /sourceUrl must be an https URL/],
    [{ licenceUrl: 'not a url' }, /licenceUrl must be an https URL/],
    [{ author: '' }, /author is required/],
    [{ retrievedAt: 'last tuesday' }, /retrievedAt must be an ISO 8601/],
    [{ tags: [] }, /tags must be a non-empty array/],
    [{ tags: ['Not A Slug'] }, /lowercase slug/],
    [{ sha256: 'nope' }, /64 lowercase hex/],
    [{ textureResolution: 4096 }, /exceeds Roblox's 1024px guidance/],
    [{ boundsStuds: [1, 0.001, 1] }, /three finite numbers/],
    [{ boundsStuds: [1, 2] }, /three finite numbers/],
    [{ triangles: -1 }, /non-negative integer/],
    [{ robloxAssetId: -3 }, /positive integer or null/],
  ];
  for (const [over, pattern] of cases) {
    const r = validateProvenance(goodRecord(over));
    assert.equal(r.ok, false, `${JSON.stringify(over)} should have been rejected`);
    assert.match(r.errors.join(' | '), pattern, JSON.stringify(over));
  }
});

test('an asset live in Roblox must be hashed — we have to know what we uploaded', () => {
  const live = goodRecord({ robloxAssetId: 987654321, sha256: null });
  const r = validateProvenance(live);
  assert.equal(r.ok, false);
  assert.match(r.errors.join(' '), /sha256 is required once robloxAssetId is set/);
  assert.equal(validateProvenance(goodRecord({ robloxAssetId: 987654321 })).ok, true);
});

test('a record with no Roblox id validates but is flagged as not yet insertable', () => {
  const r = validateProvenance(goodRecord({ robloxAssetId: null }));
  assert.equal(r.ok, true);
  assert.match(r.warnings.join(' '), /not yet insertable/);
});

test('validateProvenance survives garbage input instead of throwing', () => {
  for (const junk of [null, undefined, 42, 'a string', [], {}]) {
    const r = validateProvenance(junk);
    assert.equal(r.ok, false);
    assert.ok(r.errors.length > 0);
  }
});

// ---- the seed manifest -------------------------------------------------------------------------

test('every seed record validates in seed mode, and all of them are CC0', () => {
  assert.ok(SEED_MANIFEST.length >= 15, 'the seed kit should actually cover the categories');
  for (const rec of SEED_MANIFEST) {
    const r = validateProvenance(rec, { seed: true, cc0Only: true });
    assert.equal(r.ok, true, `${rec.id}: ${r.errors.join('; ')}`);
    assert.equal(r.licenceId, 'CC0-1.0', `${rec.id} is not CC0`);
    assert.equal(rec.attributionRequired, false);
    assert.equal(rec.commercialUse, true);
  }
});

test('seed records are pre-ingest: no Roblox ids, no hashes, no measurements', () => {
  for (const rec of SEED_MANIFEST) {
    assert.equal(rec.robloxAssetId, null, `${rec.id} claims a Roblox id it cannot have yet`);
    assert.equal(rec.sha256, null, `${rec.id} claims a hash but no binary was downloaded`);
    assert.equal(rec.triangles, null);
    assert.equal(rec.boundsStuds, null);
  }
});

test('seed ids are unique and every seed source is one of the three verified CC0 sites', () => {
  const ids = SEED_MANIFEST.map((r) => r.id);
  assert.equal(new Set(ids).size, ids.length, 'duplicate seed ids');
  const trusted = new Set(['kenney', 'quaternius', 'ambientcg']);
  for (const rec of SEED_MANIFEST) assert.ok(trusted.has(rec.source), `${rec.id} comes from an untrusted source`);
});

test('the seed kit covers the categories where procedural geometry loses', () => {
  const kinds = new Set(SEED_MANIFEST.map((r) => r.kind));
  assert.ok(kinds.has('foliage'), 'foliage is the whole reason the library exists');
  assert.ok(kinds.has('character'), 'characters are the other category procedural cannot do');
});

test('the embedding input carries kind, name and style tags', () => {
  const text = assetEmbeddingInput(SEED_MANIFEST[0]);
  assert.match(text, new RegExp(SEED_MANIFEST[0].kind));
  assert.match(text, /Style:/);
});

test('batch writes respect D1’s 100-bound-parameter cap', () => {
  assert.equal(MAX_BOUND_PARAMS, 100);
  assert.equal(rowsPerStatement(20), 5);
  assert.equal(rowsPerStatement(101), 1, 'a wide row must still produce at least one row per statement');
  assert.ok(rowsPerStatement() * 20 <= MAX_BOUND_PARAMS);
});

// ==============================================================================================
// 5. Scale-plausibility maths
// ==============================================================================================

test('A CHAIR 40 STUDS TALL FAILS; a chair 3 studs tall passes', () => {
  const bad = checkScale('chair', [4, 40, 4]);
  assert.equal(bad.ok, false);
  assert.match(bad.reasons.join(' '), /over the 7 maximum/);
  assert.equal(checkScale('chair', [3, 3, 3]).ok, true);
});

test('the suggested rescale lands the object in the middle of its envelope', () => {
  const r = checkScale('chair', [4, 40, 4]);
  const target = (SCALE_ENVELOPES.chair.minHeight + SCALE_ENVELOPES.chair.maxHeight) / 2;
  assert.ok(Math.abs(40 * r.suggestedScale - target) < 1e-9);
  assert.equal(checkScale('chair', [3, 3, 3]).suggestedScale, 1, 'a passing model needs no rescale');
});

test('a too-small object fails as well as a too-large one', () => {
  const r = checkScale('tree', [2, 1, 2]);
  assert.equal(r.ok, false);
  assert.match(r.reasons.join(' '), /under the 10 minimum/);
});

test('a felled tree is caught: height must be the largest dimension for upright things', () => {
  const felled = checkScale('tree', [30, 5, 8]);
  assert.equal(felled.ok, false);
  assert.equal(felled.lyingDown, true);
  assert.match(felled.reasons.join(' '), /lying on its side/);
  // the same aspect ratio is fine for something not expected to be tall
  assert.equal(checkScale('bench', [12, 3, 2]).ok, true);
  assert.equal(checkScale('bench', [12, 3, 2]).lyingDown, false);
});

test('a sprawling object is caught by maxAnyDim even when its height is fine', () => {
  const r = checkScale('crate', [40, 3, 3]);
  assert.equal(r.ok, false);
  assert.match(r.reasons.join(' '), /exceeds the 10 limit/);
});

test('a character is measured against the 5-stud avatar', () => {
  assert.equal(checkScale('character', [2, 5, 1.5]).ok, true);
  assert.equal(checkScale('character', [2, 25, 1.5]).ok, false);
});

test('intent resolution: exact key, then longest substring, then the generic prop envelope', () => {
  assert.equal(scaleRuleFor('chair').key, 'chair');
  assert.equal(scaleRuleFor('CHAIR').key, 'chair', 'matching is case-insensitive');
  assert.equal(scaleRuleFor('a wooden lamp post').key, 'lamp');
  assert.equal(scaleRuleFor('an ornate gilded pocketwatch').key, 'prop');
  assert.equal(scaleRuleFor(undefined).key, 'prop');
  assert.equal(scaleRuleFor('').key, 'prop');
});

test('every envelope is internally coherent', () => {
  for (const [key, rule] of Object.entries(SCALE_ENVELOPES)) {
    assert.ok(rule.minHeight > 0, `${key} minHeight`);
    assert.ok(rule.maxHeight > rule.minHeight, `${key} max must exceed min`);
    assert.ok(rule.maxAnyDim >= rule.maxHeight, `${key} maxAnyDim must admit a legal height`);
    assert.equal(typeof rule.tallest, 'boolean');
  }
});

test('pivot tolerance is absolute for small objects and relative for large ones', () => {
  // a 2-stud crate gets the 0.5-stud floor, not 0.1
  assert.equal(pivotToleranceStuds(2), 0.5);
  // a 60-stud tree gets 5% = 3 studs
  assert.equal(pivotToleranceStuds(60), 3);
  assert.equal(lateralPivotToleranceStuds(2, 2), 0.5);
  assert.equal(lateralPivotToleranceStuds(40, 10), 4);
});

test('a centroid pivot on a tall model is outside tolerance — this is the float/sink bug', () => {
  // a 30-stud tree whose pivot is at its centroid sits 15 studs above its base
  const height = 30;
  assert.ok(15 > pivotToleranceStuds(height), 'a centroid pivot must be caught, not tolerated');
  // while a 0.2-stud modelling slop on the same tree must not be flagged
  assert.ok(0.2 <= pivotToleranceStuds(height));
});

// ==============================================================================================
// 6. The Luau mirror must agree with the TypeScript canon
// ==============================================================================================

const luauSrc = readFileSync(new URL('../../../apps/plugin/src/Generation.luau', import.meta.url).pathname, 'utf8');

function parseLuauScaleTable(text) {
  const start = text.indexOf('local SCALE: { [string]: ScaleRule } = {');
  assert.notEqual(start, -1, 'could not find the SCALE table in Generation.luau');
  const body = text.slice(start, text.indexOf('\n}', start));
  const out = {};
  const re = /^\t(\w+) = \{ minHeight = ([\d.]+), maxHeight = ([\d.]+), maxAnyDim = ([\d.]+), tallest = (true|false) \},$/gm;
  let m;
  while ((m = re.exec(body)) !== null) {
    out[m[1]] = { minHeight: Number(m[2]), maxHeight: Number(m[3]), maxAnyDim: Number(m[4]), tallest: m[5] === 'true' };
  }
  return out;
}

test("the plugin's mirrored SCALE table is identical to SCALE_ENVELOPES", () => {
  const luau = parseLuauScaleTable(luauSrc);
  assert.ok(Object.keys(luau).length > 20, 'the Luau table did not parse');
  assert.deepEqual(luau, JSON.parse(JSON.stringify(SCALE_ENVELOPES)), 'Generation.luau has drifted from assets.ts SCALE_ENVELOPES');
});

test("the plugin's QC constants match the canonical QC_THRESHOLDS", () => {
  const constant = (name) => {
    const m = new RegExp(`^local ${name} = ([\\d.]+)$`, 'm').exec(luauSrc);
    assert.ok(m, `Generation.luau has no '${name}' constant`);
    return Number(m[1]);
  };
  assert.equal(constant('RATE_LIMIT'), QC_THRESHOLDS.generationRateLimitPerMinute);
  assert.equal(constant('RATE_WINDOW'), QC_THRESHOLDS.generationRateWindowSeconds);
  assert.equal(constant('DEFAULT_TIMEOUT'), QC_THRESHOLDS.generationTimeoutSeconds);
  assert.equal(constant('DEFAULT_MAX_TRIANGLES'), QC_THRESHOLDS.defaultMaxTriangles);
  assert.equal(constant('MIN_STUD'), QC_THRESHOLDS.minStud);
  assert.equal(constant('HARD_TRIANGLE_CEILING'), QC_THRESHOLDS.hardTriangleCeiling);
  assert.equal(constant('SOFT_TRIANGLE_WARN'), QC_THRESHOLDS.softTriangleWarn);
  assert.equal(constant('SOFT_PART_WARN'), QC_THRESHOLDS.softPartWarn);
  // written as a fraction in the Luau so the provenance of the number stays visible
  assert.match(luauSrc, /local GREY_TOLERANCE = 12 \/ 255/);
  assert.equal(12 / 255, QC_THRESHOLDS.defaultGreyTolerance);
});

test('the plugin uses the same pivot and upright tolerances as the TypeScript canon', () => {
  assert.match(luauSrc, /math\.max\(0\.5, s\.Y \* 0\.05\)/, 'vertical pivot tolerance drifted');
  assert.match(luauSrc, /math\.max\(0\.5, math\.max\(s\.X, s\.Z\) \* 0\.10\)/, 'lateral pivot tolerance drifted');
  assert.match(luauSrc, /measurements\.uprightDot < 0\.85/, 'upright tolerance drifted');
  assert.equal(QC_THRESHOLDS.pivotToleranceStuds, 0.5);
  assert.equal(QC_THRESHOLDS.pivotToleranceFraction, 0.05);
  assert.equal(QC_THRESHOLDS.lateralPivotToleranceFraction, 0.1);
  assert.equal(QC_THRESHOLDS.uprightDotMin, 0.85);
});

test('the plugin refuses scripts and calls GetObjects rather than InsertService:LoadAsset', () => {
  assert.match(luauSrc, /game:GetObjects\("rbxassetid:\/\/"/, 'the only working plugin insert path must be used');
  // InsertService:LoadAsset fails from a plugin ("User is not authorized to access Asset."), so it
  // may be named in a comment but must never be acquired or called.
  assert.ok(!/GetService\("InsertService"\)/.test(luauSrc), 'InsertService must not be acquired');
  assert.ok(!/InsertService\s*:\s*LoadAsset/.test(luauSrc.replace(/^\s*--.*$/gm, '')), 'InsertService:LoadAsset must not be called');
  // exactly one CALL site (comments may mention it), so the deprecation of GetObjects is a
  // one-function fix rather than a hunt through the plugin
  const code = luauSrc.replace(/^\s*--.*$/gm, '');
  assert.equal(code.split('game:GetObjects(').length - 1, 1, 'GetObjects must be behind a single adapter');
  assert.match(luauSrc, /REFUSE this model/, 'a script-bearing model must be refused outright');
});

test('ADMITTING AN ATTRIBUTION-REQUIRED ASSET IS ONLY HONEST WHILE THE CREDITS CAN NAME IT', async () => {
  // The library stopped refusing MIT, Apache, ISC, BSD and CC-BY, and the whole justification is
  // that the product can now discharge the obligation. That justification is a CHAIN, and a chain
  // asserted in a comment is a chain nobody re-checks. This is the link test: if the credits ever
  // stop naming the author of an attribution-required asset, the decision to admit them goes red
  // rather than silently becoming a licence violation in every customer's place.
  const rec = goodRecord({
    source: 'iconify',
    licence: 'MIT',
    attributionRequired: true,
    author: 'Pictogrammers',
    name: 'Abacus',
  });
  assert.equal(validateProvenance(rec).ok, true, 'the library must admit it at all');

  const report = attributionReport('p1', [{ use: { assetId: rec.id, viaLiveApi: false }, provenance: rec }]);
  assert.equal(report.required.length, 1, 'it must land in the REQUIRED list, not the courtesy one');
  assert.equal(report.courtesy.length, 0);

  const text = renderAttribution(report);
  assert.match(text, /Pictogrammers/, 'the credits must name the author');
  assert.match(text, /Abacus/, 'and the work');
  assert.match(text, /MIT/, 'and the licence it is used under');
  assert.match(text, /attribution required/i, 'under a heading that says the credit is owed');
});

test('and what stays refused is what CANNOT be discharged, not what is merely inconvenient', () => {
  // Share-alike and non-commercial are excluded because a customer would inherit an obligation
  // they never agreed to — a Roblox place cannot carry a source-distribution or copyleft duty.
  // That distinction is the reason the gate is still a gate.
  for (const l of ['CC BY-SA 4.0', 'CC BY-NC 4.0', 'GPL 3.0', 'SIL Open Font License']) {
    const rec = goodRecord({ licence: l, attributionRequired: true });
    assert.equal(validateProvenance(rec).ok, false, `${l} must still be refused outright`);
  }
});
