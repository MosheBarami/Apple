// Tests for what a project owes and whether it can be published: the attribution export and the
// commercial-use gate in apps/worker/src/provenance.ts.
//
// These are the rules that decide whether Golem can honestly say "here is everything in your game
// and where it came from", so they are pinned rather than left to inspection. The four cases the
// module exists for each get a test by name: a CC0 asset that obliges nothing, a CC-BY asset that
// obliges a credit line, a non-commercial asset that must block a commercial publish, and an
// original Golem build that must never be filed alongside somebody else's work.
//
// Pure functions throughout — no D1, no network. The one storage test drives a fake D1 that
// returns rows, because the row→record mapping is real logic and its failure mode (silently
// dropping an asset the library cannot account for) is the one this module exists to prevent.
//
// Run: node --test packages/evals/src/provenance.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// esbuild is resolved from the workspace that DECLARES it, and `--main-fields` is explicit.
//
// Both were latent: `npx esbuild` fell through to fetching esbuild from the registry when the
// cwd was a package that does not declare it, and `--platform=neutral` defaults `mainFields` to
// EMPTY, so a workspace package whose entry comes from `main` cannot be resolved at all. Neither
// showed until this bundle gained its first cross-package import. A test whose pass depends on a
// package it does not declare being downloadable is a test that reports the network.
const ESBUILD = new URL('../../../apps/worker/node_modules/.bin/esbuild', import.meta.url).pathname;

const dir = mkdtempSync(join(tmpdir(), 'golem-provenance-'));
const src = (name) => new URL(`../../../apps/worker/src/${name}`, import.meta.url).pathname;

const out = join(dir, 'provenance.mjs');
execFileSync(ESBUILD, [src('provenance.ts'), '--bundle', '--format=esm', '--platform=neutral', '--main-fields=main,module', '--outfile=' + out], { stdio: 'pipe' });
// `asset-library.ts` was bundled here until 2026-09-20, when the asset catalogue was removed.
// What this file actually needs from it — the source-site vocabulary, the originality table and
// the licence rules — moved to `asset-provenance.ts`, which holds exactly that and nothing else.
const libOut = join(dir, 'asset-provenance.mjs');
execFileSync(ESBUILD, [src('asset-provenance.ts'), '--bundle', '--format=esm', '--platform=neutral', '--main-fields=main,module', '--outfile=' + libOut], { stdio: 'pipe' });

const {
  SOURCE_CREDITS,
  COMPLIANCE_CODES,
  attributionReport,
  renderAttribution,
  commercialUseReport,
  projectAssets,
  recordAssetUse,
} = await import(out);

const { ASSET_ORIGINALITY, ASSET_SOURCE_SITES, originalityOf, normaliseLicence, LICENCES } = await import(libOut);

//[[ `originalAsset()` WAS A CONSTRUCTOR IN THE DELETED CATALOGUE MODULE, AND IS A FIXTURE NOW.
//
//   It built a provenance record for something Apple made itself: source `procedural`, author
//   `Apple`, no licence obligation. It was only ever called by this suite — nothing in the worker
//   ever constructed one — so it went with `asset-library.ts`. The RECORD SHAPE is what these tests
//   are about, and `attributionReport` still consumes exactly this shape out of `projectAssets`,
//   so the shape is written here instead of imported from a module that no longer exists. ]]
const originalAsset = ({ id, name, kind, tags, createdAt, robloxAssetId = null, sha256 = null }) => ({
  id,
  name,
  kind,
  source: 'procedural',
  sourceUrl: 'https://apple.moshe-barami111.workers.dev',
  // `NONE-PROCEDURAL` is the canonical id `normaliseLicence` resolves this string to, and it is
  // what makes the record a real one rather than a plausible-looking shape: a licence string the
  // table cannot resolve is graded `unrecognised_licence` and BLOCKS a commercial publish, so a
  // fixture with invented wording would have quietly turned these tests into the opposite of what
  // they claim to check.
  licence: 'none-procedural',
  licenceUrl: 'https://apple.moshe-barami111.workers.dev',
  commercialUse: true,
  attributionRequired: false,
  author: 'Apple',
  retrievedAt: createdAt,
  importedAt: createdAt,
  modifications: [],
  robloxAssetId,
  triangles: null,
  textureResolution: null,
  boundsStuds: null,
  tags,
  sha256,
});

const PROJECT = '11111111-2222-3333-4444-555555555555';

// A provenance record shaped exactly as projectAssets() produces one.
const rec = (over = {}) => ({
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
  ...over,
});

const used = (provenance, over = {}) => ({
  use: {
    projectId: PROJECT,
    assetId: provenance ? provenance.id : over.assetId,
    firstUsedAt: '2026-08-31T10:00:00.000Z',
    lastUsedAt: '2026-08-31T10:00:00.000Z',
    uses: 1,
    viaLiveApi: false,
    context: null,
    ...over,
  },
  provenance,
});

const NOW = new Date('2026-08-31T12:00:00.000Z');
const codeFor = (report, id) => report.findings.filter((f) => f.assetId === id).map((f) => f.code);

// ==============================================================================================
// 1. Originality — the §42 line
// ==============================================================================================

test('every source site is classified as ours, the user’s, or somebody else’s', () => {
  for (const site of ASSET_SOURCE_SITES) {
    assert.ok(ASSET_ORIGINALITY[site], `${site} is unclassified — it would default to being treated as ours`);
  }
  assert.equal(originalityOf('procedural'), 'golem_original');
  assert.equal(originalityOf('generated_roblox'), 'user_generated');
  for (const site of ['kenney', 'quaternius', 'ambientcg', 'poly_haven', 'sketchfab', 'creator_store', 'roblox_official']) {
    assert.equal(originalityOf(site), 'third_party', `${site} is not ours to claim`);
  }
});

test('AN ORIGINAL APPLE ASSET is credited as our own work and never as a third party’s', () => {
  const mine = originalAsset({
    id: 'procedural/market-stall/stall-01',
    name: 'Market Stall',
    kind: 'building',
    tags: ['lowpoly', 'market'],
    createdAt: '2026-08-31T11:00:00.000Z',
  });
  // `golem_original` is a PERSISTED originality value written into provenance rows and into user
  // places; the rebrand exempts it for exactly that reason. `author` is different — it is rendered
  // in the credits panel, so it carries the brand and follows it.
  assert.equal(originalityOf(mine.source), 'golem_original');
  assert.equal(mine.author, 'Apple');
  assert.equal(mine.attributionRequired, false);

  const report = attributionReport(PROJECT, [used(mine)], NOW);
  assert.equal(report.original.length, 1);
  assert.equal(report.required.length, 0);
  assert.equal(report.courtesy.length, 0, 'our own work must not appear under a third-party heading');
  assert.equal(report.userGenerated.length, 0);

  const text = renderAttribution(report);
  assert.match(text, /Original work, built for this experience by Apple/);
  assert.doesNotMatch(text, /Third-party/, 'a project of purely original work must not print a third-party heading at all');

  // and it is not a commercial problem
  const c = commercialUseReport(PROJECT, [used(mine)]);
  assert.equal(c.ok, true);
  assert.equal(c.counts.golem_original, 1);
  assert.equal(c.findings.length, 0);
});

test('GenerationService output is the user’s, filed under neither ours nor a third party’s', () => {
  const theirs = rec({
    id: 'generated_roblox/session-9/rock-01',
    source: 'generated_roblox',
    author: 'Roblox GenerationService',
    licence: 'ROBLOX-GENERATED',
    licenceUrl: 'https://create.roblox.com/docs/reference/engine/classes/GenerationService',
    sourceUrl: 'https://create.roblox.com/docs/reference/engine/classes/GenerationService',
  });
  const report = attributionReport(PROJECT, [used(theirs)], NOW);
  assert.equal(report.userGenerated.length, 1);
  assert.equal(report.original.length, 0, 'Golem does not own what the customer generated in their own session');
  assert.equal(report.courtesy.length, 0);
  assert.match(renderAttribution(report), /yours, not ours/);
});

// ==============================================================================================
// 2. A CC0 asset — no obligation, credited anyway
// ==============================================================================================

test('A CC0 ASSET obliges nothing, publishes commercially, and is still credited out of courtesy', () => {
  const cc0 = rec();
  assert.equal(normaliseLicence(cc0.licence), 'CC0-1.0');
  assert.equal(LICENCES['CC0-1.0'].attributionRequired, false);

  const report = attributionReport(PROJECT, [used(cc0)], NOW);
  assert.equal(report.required.length, 0, 'CC0 requires no attribution');
  assert.equal(report.courtesy.length, 1, 'crediting anyway is the point of the courtesy section');
  assert.equal(report.courtesy[0].author, 'Kenney');

  const text = renderAttribution(report);
  assert.match(text, /no attribution required, credited anyway/);
  assert.match(text, /"Tree Pine 01" by Kenney/);
  assert.match(text, /License: Creative Commons CC0/, 'the licence string is printed verbatim, not prettified');

  const c = commercialUseReport(PROJECT, [used(cc0)]);
  assert.equal(c.ok, true);
  assert.equal(c.findings.length, 0);
  assert.equal(c.counts.third_party, 1);
});

test('Poly Haven’s CC0 assets still owe "Powered by Poly Haven" when the live API was used', () => {
  const ph = rec({ id: 'poly_haven/rock-05', name: 'Rock 05', source: 'poly_haven', author: 'Poly Haven', sourceUrl: 'https://polyhaven.com/a/rock_05', licenceUrl: 'https://polyhaven.com/license' });
  assert.equal(SOURCE_CREDITS.poly_haven.when, 'live_api');

  const viaApi = attributionReport(PROJECT, [used(ph, { viaLiveApi: true })], NOW);
  assert.equal(viaApi.sourceCredits.length, 1);
  assert.equal(viaApi.sourceCredits[0].text, 'Powered by Poly Haven');
  assert.match(renderAttribution(viaApi), /Powered by Poly Haven/);
  assert.equal(viaApi.required.length, 0, 'the credit is owed to the source, not required by the licence');
  assert.equal(viaApi.courtesy.length, 1);

  const manual = attributionReport(PROJECT, [used(ph)], NOW);
  assert.equal(manual.sourceCredits.length, 0, 'a one-off download does not trigger the live-API credit');

  // and it is not a publishing blocker either way
  assert.equal(commercialUseReport(PROJECT, [used(ph, { viaLiveApi: true })]).ok, true);
});

// ==============================================================================================
// 3. An attribution-required asset
// ==============================================================================================

test('AN ATTRIBUTION-REQUIRED ASSET publishes commercially but carries a warning and a credit line', () => {
  const ccby = rec({
    id: 'opengameart/lantern-01',
    name: 'Lantern',
    source: 'opengameart',
    author: 'A. Contributor',
    licence: 'CC BY 4.0',
    licenceUrl: 'https://creativecommons.org/licenses/by/4.0/',
    sourceUrl: 'https://opengameart.org/content/lantern',
    attributionRequired: true,
    modifications: ['decimated to 900 triangles', 'retextured to 512px'],
  });
  assert.equal(normaliseLicence(ccby.licence), 'CC-BY-4.0');

  const report = attributionReport(PROJECT, [used(ccby)], NOW);
  assert.equal(report.required.length, 1);
  assert.equal(report.courtesy.length, 0);
  const text = renderAttribution(report);
  assert.match(text, /attribution required by their licence/);
  assert.match(text, /"Lantern" by A\. Contributor — CC BY 4\.0/);
  assert.match(text, /modified: decimated to 900 triangles; retextured to 512px/, 'a modified asset must say so — the credit is for their work, not ours');
  assert.match(text, /https:\/\/opengameart\.org\/content\/lantern/);

  const c = commercialUseReport(PROJECT, [used(ccby)]);
  assert.equal(c.ok, true, 'CC-BY is commercially usable — the obligation is a warning, not a blocker');
  assert.deepEqual(codeFor(c, ccby.id), ['attribution_required']);
  assert.equal(c.findings[0].severity, 'warning');
  assert.match(c.findings[0].remediation, /include the attribution export/);
});

test('a share-alike asset blocks even though its licence permits commercial use', () => {
  const sa = rec({ id: 'opengameart/statue-sa', name: 'Statue', source: 'opengameart', author: 'B. Sculptor', licence: 'CC BY-SA 4.0', attributionRequired: true });
  assert.equal(normaliseLicence(sa.licence), 'CC-BY-SA-4.0');
  const c = commercialUseReport(PROJECT, [used(sa)]);
  assert.equal(c.ok, false);
  assert.deepEqual(codeFor(c, sa.id), ['share_alike']);
  assert.match(c.findings[0].why, /share-alike/);
});

// ==============================================================================================
// 4. A non-commercial asset in a commercial project
// ==============================================================================================

test('A NON-COMMERCIAL ASSET BLOCKS a commercial publish, and the report names it and says why', () => {
  const nc = rec({
    id: 'sketchfab/temple-01',
    name: 'Temple',
    source: 'sketchfab',
    author: 'C. Modeller',
    licence: 'CC BY-NC 4.0',
    licenceUrl: 'https://creativecommons.org/licenses/by-nc/4.0/',
    sourceUrl: 'https://sketchfab.com/3d-models/temple-01',
    commercialUse: false,
    attributionRequired: true,
  });
  assert.equal(normaliseLicence(nc.licence), 'CC-BY-NC-4.0');
  assert.equal(LICENCES['CC-BY-NC-4.0'].commercialUse, false);

  const c = commercialUseReport(PROJECT, [used(rec()), used(nc)]);
  assert.equal(c.ok, false, 'one non-commercial asset is enough to block the whole project');
  assert.equal(c.checked, 2);
  assert.deepEqual(codeFor(c, nc.id), ['non_commercial']);
  const f = c.findings.find((x) => x.assetId === nc.id);
  assert.equal(f.severity, 'blocker');
  assert.equal(f.name, 'Temple', 'the finding names the asset a human has to go and replace');
  assert.match(f.why, /commercial use/);
  assert.match(f.remediation, /Temple/);
  // the CC0 asset alongside it is not implicated
  assert.deepEqual(codeFor(c, 'kenney/nature-kit/tree-pine-01'), []);
  // blockers sort ahead of warnings
  assert.equal(c.findings[0].severity, 'blocker');
});

test('a non-commercial licence is refused by the licence table too, not only at export', () => {
  // This used to go through the catalogue's ingest validator, which refused the row before it was
  // ever stored. There is no ingest any more, so the same decision is asserted where it now lives:
  // the licence table, which `admitToKit` reads before a sound id reaches a customer's game.
  const id = normaliseLicence('CC BY-NC 4.0');
  assert.equal(id, 'CC-BY-NC-4.0');
  assert.equal(LICENCES[id].commercialUse, false);
  assert.equal(LICENCES[id].allowedInLibrary, false, 'non-commercial must be refused, not merely warned about');
});

test('NC-SA resolves to itself rather than being matched as NC or SA alone', () => {
  assert.equal(normaliseLicence('CC BY-NC-SA 4.0'), 'CC-BY-NC-SA-4.0');
  assert.equal(normaliseLicence('Creative Commons Attribution-NonCommercial 4.0'), 'CC-BY-NC-4.0');
  assert.equal(normaliseLicence('CC BY-SA 4.0'), 'CC-BY-SA-4.0');
  assert.equal(normaliseLicence('CC BY 4.0'), 'CC-BY-4.0');
  assert.equal(normaliseLicence('Creative Commons CC0'), 'CC0-1.0');
});

// ==============================================================================================
// 5. Assets the library cannot account for
// ==============================================================================================

test('an asset used with no provenance row blocks the publish and says so in the credits', () => {
  const orphan = used(null, { assetId: 'unknown/whatever-01' });
  const c = commercialUseReport(PROJECT, [orphan]);
  assert.equal(c.ok, false);
  assert.deepEqual(codeFor(c, 'unknown/whatever-01'), ['missing_provenance']);
  assert.equal(c.counts.unknown, 1);

  const report = attributionReport(PROJECT, [orphan], NOW);
  assert.deepEqual(report.unaccounted, ['unknown/whatever-01']);
  assert.match(renderAttribution(report), /INCOMPLETE/, 'an incomplete export must admit it is incomplete');
});

test('an unrecognised licence string blocks rather than being read charitably', () => {
  const vague = rec({ id: 'opengameart/mystery-01', licence: 'free for everyone probably' });
  const c = commercialUseReport(PROJECT, [used(vague)]);
  assert.equal(c.ok, false);
  assert.deepEqual(codeFor(c, vague.id), ['unrecognised_licence']);
});

test('a live third-party asset with no import date is a §16 warning, not a blocker', () => {
  const noDate = rec({ importedAt: null });
  const c = commercialUseReport(PROJECT, [used(noDate)]);
  assert.equal(c.ok, true);
  assert.deepEqual(codeFor(c, noDate.id), ['import_date_missing']);
  // an original asset with no import date is not a §16 problem — nothing was imported
  const mine = originalAsset({ id: 'procedural/wall/wall-01', name: 'Wall', kind: 'building', tags: ['wall'], createdAt: '2026-08-31T11:00:00.000Z' });
  assert.deepEqual(codeFor(commercialUseReport(PROJECT, [used(mine)]), mine.id), []);
});

test('every finding carries a code from the published list and a remediation a human can act on', () => {
  const assets = [used(rec()), used(rec({ id: 'a/nc', licence: 'CC BY-NC 4.0', commercialUse: false, attributionRequired: true })), used(null, { assetId: 'a/orphan' })];
  for (const f of commercialUseReport(PROJECT, assets).findings) {
    assert.ok(COMPLIANCE_CODES.includes(f.code), `${f.code} is not a published code`);
    assert.ok(f.remediation.length > 20, `${f.code} has no real remediation`);
    assert.ok(['blocker', 'warning'].includes(f.severity));
  }
});

// ==============================================================================================
// 6. The export as a whole
// ==============================================================================================

test('a mixed project separates our work, their work and the obligations attached to each', () => {
  const mine = originalAsset({ id: 'procedural/road/road-01', name: 'Road Section', kind: 'ground', tags: ['road'], createdAt: '2026-08-31T11:00:00.000Z' });
  const cc0 = rec();
  const ccby = rec({ id: 'opengameart/lantern-01', name: 'Lantern', source: 'opengameart', author: 'A. Contributor', licence: 'CC BY 4.0', attributionRequired: true });
  const ph = rec({ id: 'poly_haven/rock-05', name: 'Rock 05', source: 'poly_haven', author: 'Poly Haven' });

  const assets = [used(mine), used(cc0), used(ccby), used(ph, { viaLiveApi: true })];
  const report = attributionReport(PROJECT, assets, NOW);
  assert.equal(report.original.length, 1);
  assert.equal(report.required.length, 1);
  assert.equal(report.courtesy.length, 2);
  assert.equal(report.sourceCredits.length, 1);
  assert.equal(report.generatedAt, NOW.toISOString());

  const text = renderAttribution(report);
  // the headings are what stop the credits reading as though Golem made all of it
  assert.ok(text.indexOf('Original work') < text.indexOf('attribution required'), 'our work is listed separately and first');
  assert.match(text, /Rock 05/);
  assert.match(text, /Road Section/);

  const c = commercialUseReport(PROJECT, assets);
  assert.equal(c.ok, true);
  assert.deepEqual(c.counts, { golem_original: 1, user_generated: 0, third_party: 3, unknown: 0 });
});

test('the export is deterministic — the same project renders identically twice', () => {
  const assets = [
    used(rec({ id: 'b/second', name: 'Second', author: 'Zed' })),
    used(rec({ id: 'a/first', name: 'First', author: 'Alice' })),
  ];
  const a = renderAttribution(attributionReport(PROJECT, assets, NOW));
  const b = renderAttribution(attributionReport(PROJECT, [...assets].reverse(), NOW));
  assert.equal(a, b, 'ordering must not depend on the order rows came back from D1');
  assert.ok(a.indexOf('Alice') < a.indexOf('Zed'), 'credits are ordered by author');
});

test('a project with nothing recorded renders an honest empty export rather than a blank string', () => {
  const report = attributionReport(PROJECT, [], NOW);
  assert.match(renderAttribution(report), /uses no recorded assets/);
  assert.equal(commercialUseReport(PROJECT, []).ok, true);
  assert.equal(commercialUseReport(PROJECT, []).checked, 0);
});

// ==============================================================================================
// 7. The D1 store
// ==============================================================================================

/** Minimal D1 stand-in: records the SQL and the binds, returns rows the test supplies. */
function fakeD1(rows) {
  const calls = [];
  return {
    calls,
    CORPUS: {
      prepare(sql) {
        const call = { sql, binds: [] };
        calls.push(call);
        return {
          bind(...b) {
            call.binds = b;
            return this;
          },
          all: async () => ({ results: rows }),
          run: async () => ({}),
        };
      },
    },
  };
}

test('projectAssets keeps a usage row whose library row is missing instead of dropping it', async () => {
  const db = fakeD1([
    {
      asset_id: 'kenney/nature-kit/tree-pine-01',
      first_used_at: '2026-08-31T10:00:00.000Z',
      last_used_at: '2026-08-31T10:00:00.000Z',
      uses: 3,
      via_live_api: 1,
      context: 'forest',
      name: 'Tree Pine 01',
      kind: 'foliage',
      source: 'kenney',
      source_url: 'https://kenney.nl/assets/nature-kit',
      licence: 'License: Creative Commons CC0',
      licence_url: 'https://kenney.nl/assets/nature-kit',
      commercial_use: 1,
      attribution_required: 0,
      author: 'Kenney',
      retrieved_at: '2026-08-30T12:00:00.000Z',
      imported_at: '2026-08-31T09:00:00.000Z',
      modifications: '["rescaled"]',
      roblox_asset_id: 987654321,
      tags: '["lowpoly","tree"]',
      sha256: 'a'.repeat(64),
    },
    {
      asset_id: 'ghost/nothing-here',
      first_used_at: '2026-08-31T10:00:00.000Z',
      last_used_at: '2026-08-31T10:00:00.000Z',
      uses: 1,
      via_live_api: 0,
      context: null,
      name: null,
      kind: null,
      source: null,
      source_url: null,
      licence: null,
      licence_url: null,
      commercial_use: null,
      attribution_required: null,
      author: null,
      retrieved_at: null,
      imported_at: null,
      modifications: null,
      roblox_asset_id: null,
      tags: null,
      sha256: null,
    },
  ]);

  const assets = await projectAssets(db, PROJECT);
  assert.equal(assets.length, 2, 'the orphan row must survive the join');
  assert.equal(assets[0].provenance.name, 'Tree Pine 01');
  assert.deepEqual(assets[0].provenance.modifications, ['rescaled']);
  assert.deepEqual(assets[0].provenance.tags, ['lowpoly', 'tree']);
  assert.equal(assets[0].use.viaLiveApi, true);
  assert.equal(assets[0].use.uses, 3);
  assert.equal(assets[1].provenance, null);
  assert.match(db.calls[0].sql, /left join asset_library/, 'an inner join would hide exactly the assets we most need to see');
  assert.deepEqual(db.calls[0].binds, [PROJECT]);
});

test('malformed JSON in a row degrades to an empty list rather than throwing mid-export', async () => {
  const db = fakeD1([
    {
      asset_id: 'a/b',
      first_used_at: 'x',
      last_used_at: 'x',
      uses: 1,
      via_live_api: 0,
      context: null,
      name: 'B',
      kind: 'prop',
      source: 'kenney',
      source_url: 'https://kenney.nl',
      licence: 'License: Creative Commons CC0',
      licence_url: 'https://kenney.nl',
      commercial_use: 1,
      attribution_required: 0,
      author: 'Kenney',
      retrieved_at: 'x',
      imported_at: null,
      modifications: '{not json',
      roblox_asset_id: null,
      tags: 'also not json',
      sha256: null,
    },
  ]);
  const assets = await projectAssets(db, PROJECT);
  assert.deepEqual(assets[0].provenance.modifications, []);
  assert.deepEqual(assets[0].provenance.tags, []);
});

test('recording a use is idempotent per (project, asset) and a live-API credit once owed stays owed', async () => {
  const db = fakeD1([]);
  await recordAssetUse(db, PROJECT, 'kenney/nature-kit/tree-pine-01', { viaLiveApi: true, context: 'forest', now: '2026-08-31T10:00:00.000Z' });
  const { sql, binds } = db.calls[0];
  assert.match(sql, /on conflict\(project_id, asset_id\) do update/);
  assert.match(sql, /uses=project_asset_use\.uses\+1/);
  assert.match(sql, /via_live_api=max\(/, 'a credit already owed must not be cleared by a later cached placement');
  assert.deepEqual(binds, [PROJECT, 'kenney/nature-kit/tree-pine-01', '2026-08-31T10:00:00.000Z', '2026-08-31T10:00:00.000Z', 1, 'forest']);
});


/* ============================================================================
 * THE PRODUCER — added when insert_asset was finally wired to this ledger.
 *
 * Every test above feeds the report assets by hand. That is the right way to test the
 * report, and it is exactly why the missing producer went unnoticed for so long:
 * `recordAssetUse` had no caller in the worker, so on the real path the table was
 * always empty — and an empty table produces a CLEAN report. The feature's failure
 * mode was to say "you owe nothing", confidently, always.
 * ==========================================================================*/

/**
 * A WRITABLE stand-in, unlike `fakeD1` above.
 *
 * `fakeD1(rows)` hands the report a fixed result set, which is what the report's own
 * tests want. These tests are about the round trip — a write, then the read that has to
 * find it — so this one actually stores rows and implements the upsert's conflict arm.
 */
function writableD1() {
  const rows = [];
  return {
    rows,
    exec: async () => {},
    prepare() {
      return {
        bind(...args) {
          return {
            run: async () => {
              const [projectId, assetId, first, last, live, context] = args;
              const existing = rows.find((r) => r.project_id === projectId && r.asset_id === assetId);
              if (existing) {
                existing.last_used_at = last;
                existing.uses += 1;
                existing.via_live_api = Math.max(existing.via_live_api, live);
                existing.context = context ?? existing.context;
              } else {
                rows.push({ project_id: projectId, asset_id: assetId, first_used_at: first, last_used_at: last, uses: 1, via_live_api: live, context });
              }
            },
            // The report's LEFT join. No library rows exist here, so every column from
            // `l` comes back null — which is the unaccounted case being exercised.
            all: async () => ({
              results: rows
                .filter((r) => r.project_id === args[0])
                .map((r) => ({ ...r, name: null, kind: null, source: null, source_url: null, licence: null, licence_url: null, commercial_use: null, attribution_required: null, author: null, retrieved_at: null, imported_at: null, modifications: null, roblox_asset_id: null, tags: null, sha256: null })),
            }),
            first: async () => null,
          };
        },
      };
    },
  };
}

test('a recorded use reaches the report, and an unaccounted asset is named rather than hidden', async () => {
  const env = { CORPUS: writableD1() };
  await recordAssetUse(env, 'p1', 'unaccounted:roblox:998877', { context: 'game.Workspace.Lobby' });

  const assets = await projectAssets(env, 'p1');
  assert.equal(assets.length, 1, 'the row must survive the join');
  assert.equal(assets[0].provenance, null, 'with no library row, provenance is unknown');
  assert.equal(assets[0].use.context, 'game.Workspace.Lobby');

  assert.deepEqual(attributionReport('p1', assets).unaccounted, ['unaccounted:roblox:998877']);

  const compliance = commercialUseReport('p1', assets);
  assert.equal(compliance.counts.unknown, 1);
  assert.equal(compliance.ok, false, 'an asset with no known licence cannot be cleared to ship');
});

test('re-placing the same asset counts twice but is one obligation', async () => {
  const env = { CORPUS: writableD1() };
  await recordAssetUse(env, 'p1', 'unaccounted:roblox:1', { context: 'a' });
  await recordAssetUse(env, 'p1', 'unaccounted:roblox:1', { context: 'b' });
  const assets = await projectAssets(env, 'p1');
  assert.equal(assets.length, 1, 'usage is a set, not a log');
  assert.equal(assets[0].use.uses, 2);
});

test('an empty ledger reports nothing owed, which is why the producer matters', async () => {
  // The state the feature was ALWAYS in before insert_asset called it. On the record so
  // the pass is legible: a clean report from an empty table is indistinguishable from a
  // clean report from a genuinely compliant project.
  const env = { CORPUS: writableD1() };
  const assets = await projectAssets(env, 'p-never-built');
  assert.deepEqual(assets, []);
  assert.deepEqual(attributionReport('p-never-built', assets).required, []);
  assert.equal(commercialUseReport('p-never-built', assets).ok, true);
});
