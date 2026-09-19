// THE LIBRARY WAS SORTED BACKWARDS, AND ONE COLUMN DID IT.
//
// `scripts/ingest-assets.mjs` sends a row carrying a robloxAssetId as `status='active'` and every
// other row as `status='pending_ingest'`. `ftsSearch` filters on `status='active'`. Those two
// sentences together decide what the agent can see, and what they decided was exactly inverted:
//
//   THE ROWS WITH AN ID are the Creator Store scrape — 2008-era user uploads harvested by
//   `scripts/harvest-library.mjs`, whose `name` comes verbatim from whatever the uploader typed:
//   "Bakiiiiiiiiiiiiiiii", "Part2", "diediedieDIELess", anime rips. They were the only rows search
//   could return.
//
//   THE ROWS WITHOUT ONE are Kenney, Poly Haven, ambientCG, Quaternius, OpenGameArt and
//   game-icons: CC0 packs assembled and maintained by people who make game art. They were
//   invisible — not ranked low, not returned last, INVISIBLE — because "we have not imported this
//   yet" and "this row is unusable" were the same value in the same column.
//
// So this test is about two different facts wearing one name. `status` is an import lifecycle:
// pending_ingest -> active, with quarantined/retired for rows that are genuinely dead. Whether a
// row can be inserted into a place TODAY is a different fact, and it is `robloxAssetId !== null`.
// A search that conflates them either hides the library or lies about what can be used.
//
// Run with:  node --test tests/asset-library-quality.test.mjs      (from apps/worker)
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { DatabaseSync } from 'node:sqlite';

const WORKER = join(dirname(fileURLToPath(import.meta.url)), '..');
const TMP = mkdtempSync(join(tmpdir(), 'assetquality-'));
const bundle = (src, name) => {
  const out = join(TMP, name);
  execFileSync(join(WORKER, 'node_modules', '.bin', 'esbuild'),
    [join(WORKER, 'src', src), '--bundle', '--format=esm', '--target=es2022',
     '--platform=neutral', '--main-fields=main,module', '--outfile=' + out],
    { cwd: WORKER, stdio: 'pipe' });
  return import(`file://${out}`);
};
const L = await bundle('asset-library.ts', 'lib.mjs');
// The decision table, because the gate it hands the model is the same fact stated a second time —
// and a second statement of a fact is a second place it can be wrong.
const A = await bundle('assets.ts', 'assets.mjs');

/**
 * A D1 binding that RUNS THE SQL, because the defect lives in a WHERE clause.
 *
 * A recording fake would pass whether the clause filtered on one status or four — it would measure
 * the strings it was handed, not which rows come back. node:sqlite is the same engine family D1 is
 * built on and has fts5, so `match`, `bm25()` and the join behave as they do in production.
 *
 * `batch()` is included because `upsertAssets` writes through it, and the ordering inside it
 * (every delete before every insert) is load-bearing for the FTS mirror.
 */
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
        async first() { const r = db.prepare(sql).get(...params); return r === undefined ? null : r; },
        async run() { const r = run(sql, params); return { success: true, meta: { changes: Number(r.changes) } }; },
      });
      return make([]);
    },
    async batch(stmts) {
      // In order, in one transaction — the property `upsertAssets` relies on.
      db.exec('begin');
      try {
        for (const s of stmts) run(s.sql, s.params);
        db.exec('commit');
      } catch (e) { db.exec('rollback'); throw e; }
      return stmts.map(() => ({ success: true, meta: {} }));
    },
  };
  // No VEC and no AI: `vecSearch` throws inside `embed` and `searchAssetLibrary` catches it, so
  // this exercises the D1 half on its own. That is the half the defect is in.
  return { CORPUS, raw: db, close: () => db.close() };
}

/** Kenney. A curated CC0 pack, clean name, and NO Roblox id — it needs an import first. */
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
  tags: ['crate', 'prop', 'survival'],
  robloxAssetId: null,
  triangles: null,
  textureResolution: null,
  boundsStuds: null,
  sha256: null,
};

/** The Creator Store scrape. Already a Roblox id — insertable today — and named by its uploader. */
const SCRAPE = {
  id: 'creator_store/props/9182736455',
  name: 'diediedieDIELess crate',
  kind: 'prop',
  source: 'creator_store',
  sourceUrl: 'https://create.roblox.com/store/asset/9182736455',
  licence: 'Roblox Terms of Use — Open Use, free on the Creator Store',
  licenceUrl: 'https://create.roblox.com/docs/production/publishing/asset-permissions',
  commercialUse: true,
  attributionRequired: false,
  author: 'someuploader',
  retrievedAt: '2026-09-01T00:00:00.000Z',
  tags: ['crate', 'prop'],
  robloxAssetId: 9182736455,
  triangles: null,
  textureResolution: null,
  boundsStuds: null,
  sha256: null,
};

/**
 * The fixture is the ingest script's own behaviour, not an approximation of it: the row with an id
 * goes in the way `ingest-assets.mjs` sends it (`seed:false` -> status 'active'), the row without
 * one goes in the way it sends that (`seed:true` -> status 'pending_ingest').
 */
async function library() {
  L.resetAssetSchemaCache();
  const d1 = realD1();
  await L.ensureAssetTables(d1);
  const curated = await L.upsertAssets(d1, [CURATED], { seed: true });
  const scrape = await L.upsertAssets(d1, [SCRAPE], {});
  assert.deepEqual(curated.rejected, [], 'the curated fixture must be a valid row, or this measures validation');
  assert.deepEqual(scrape.rejected, [], 'and so must the scrape fixture');
  assert.equal(curated.written + scrape.written, 2, 'both rows must actually be in the table');
  return d1;
}

test('an in-batch duplicate is counted as a reject and cannot duplicate the FTS mirror', async () => {
  const d1 = await library();
  try {
    const result = await L.upsertAssets(d1, [CURATED, { ...CURATED }], { seed: true });
    assert.equal(result.written, 1, 'one canonical id means one written record');
    assert.equal(result.rejected.length, 1, 'the duplicate must be accounted for, not silently dropped');
    assert.match(result.rejected[0].errors[0], /duplicate id/i);

    const mirror = await d1.CORPUS.prepare(
      'select count(*) as n from asset_library_fts where asset_id = ?',
    ).bind(CURATED.id).first();
    assert.equal(Number(mirror.n), 1, 'one canonical asset must have one searchable mirror row');
  } finally { d1.close(); }
});

test('the curated row comes back FIRST, above the scrape that outranks it on nothing but a column', async () => {
  const d1 = await library();
  try {
    const hits = await L.searchAssetLibrary(d1, 'crate');
    const ids = hits.map((h) => h.id);
    assert.ok(ids.includes(CURATED.id), `the curated row must be visible at all — search returned ${JSON.stringify(ids)}`);
    assert.ok(ids.includes(SCRAPE.id), 'and the scrape row is still returned, ranked, not hidden');
    assert.equal(ids[0], CURATED.id, `the curated pack must rank above the scrape — got ${JSON.stringify(ids)}`);
  } finally { d1.close(); }
});

test('every hit says whether it can be inserted TODAY, needs taking, or needs an import first', async () => {
  const d1 = await library();
  try {
    const hits = await L.searchAssetLibrary(d1, 'crate');
    const by = new Map(hits.map((h) => [h.id, h]));
    const curated = by.get(CURATED.id);
    const scrape = by.get(SCRAPE.id);
    assert.ok(curated && scrape, 'both rows must be returned for this to say anything');

    // The fact, as a boolean and as a word. Both, because the agent reads one and the UI shows the
    // other, and a UI that has to re-derive it from a null id is a UI that will get it wrong.
    assert.equal(curated.insertable, false, 'a row with no Roblox id cannot be inserted yet');
    assert.equal(curated.availability, 'needs_import', 'and it must say so in a word a person can read');
    // A ROBLOX ID IS NOT PERMISSION, which is what this assertion used to say. Measured in Studio
    // 2026-09-19: InsertService:LoadAsset on an asset this account owns returns OK, and on a
    // creator_store library row returns "User is not authorized". Free on the Creator Store is
    // free to TAKE, not free to LOAD — and every one of the library's 81,648 live rows is a
    // third party's. `insertable` stays true (an id exists and is resolvable), but the WORD the
    // model and the UI read is now needs_take, because "usable now" was false for all of them.
    assert.equal(scrape.insertable, true, 'a row that already carries a Roblox id has an id');
    assert.equal(scrape.availability, 'needs_take', 'but a third party owns it, so the user must take it first');

    // Availability is NOT the lifecycle column. Both facts travel, separately.
    assert.equal(curated.status, 'pending_ingest');
    assert.equal(scrape.status, 'active');
  } finally { d1.close(); }
});

test('a source WE mint ids for stays insertable — needs_take is about ownership, not about having an id', async () => {
  // Found by falsification: making requiresTaking() return true for every source broke NOTHING,
  // because no fixture covered "ours, and it has an id". Without this, the rule could quietly
  // become "nothing is ever insertable" and every test would still pass while the product told
  // users to go and take assets they already own.
  const d1 = await library();
  try {
    const OURS = {
      ...CURATED,
      id: 'kenney/props/ours-with-an-id',
      name: 'crate we uploaded ourselves',
      robloxAssetId: 7788990011,
      sha256: 'a'.repeat(64),
      status: 'active',
    };
    const written = await L.upsertAssets(d1, [OURS], { seed: true });
    assert.deepEqual(written.rejected, [], `the fixture must be accepted: ${JSON.stringify(written.rejected)}`);
    const hit = (await L.searchAssetLibrary(d1, 'crate')).find((h) => h.id === OURS.id);
    assert.ok(hit, 'the fixture row was not returned');
    assert.equal(hit.source, 'kenney', 'this asserts nothing unless the row really is a source we mint for');
    assert.equal(hit.availability, 'insertable', 'an id in our own account is insertable without the user taking anything');
  } finally { d1.close(); }
});

test('quality is derived from recorded facts, and the scrape scores below the pack', async () => {
  const d1 = await library();
  try {
    const hits = await L.searchAssetLibrary(d1, 'crate');
    const by = new Map(hits.map((h) => [h.id, h]));
    assert.ok(
      by.get(CURATED.id).quality > by.get(SCRAPE.id).quality,
      'a curated release with a clean name must outscore an open scrape with a mashed one',
    );
  } finally { d1.close(); }
});

test('insertableOnly still means what it says — the caller who needs an id today can ask for one', async () => {
  const d1 = await library();
  try {
    const hits = await L.searchAssetLibrary(d1, 'crate', { insertableOnly: true });
    assert.deepEqual(hits.map((h) => h.id), [SCRAPE.id], 'only the row with an id survives that filter');
  } finally { d1.close(); }
});

test('the gate the model is handed BEFORE it searches must not exclude the rows search returns', async () => {
  // `choose_asset_source` is documented "Call this BEFORE building anything you might be tempted to
  // search for", and it returns `SourceChoice.verification` to the model verbatim. So that string is
  // the rule the model is holding when the search results arrive. It said the library gate was
  // `status=active` — which is the discarded half of the defect, stated a second time in prose, in
  // the one place that reaches the model earliest.
  //
  // The assertion is derived from the code rather than from a remembered wording: SEARCHABLE_STATUSES
  // is the list search actually admits, and naming any single member of it as *the* required status
  // tells the model to throw away the others.
  const d1 = await library();
  try {
    const hits = await L.searchAssetLibrary(d1, 'crate');
    const curated = hits.find((h) => h.id === CURATED.id);
    assert.ok(curated, 'the curated row must be returned at all, or this test measures nothing');
    assert.equal(curated.status, 'pending_ingest', 'the row the library exists to hold is not "active"');
    assert.equal(curated.availability, 'needs_import');

    const gate = A.chooseAssetSource('prop').find((c) => c.source === 'library')?.verification;
    assert.ok(gate, 'the library source must carry a gate description');

    for (const s of L.SEARCHABLE_STATUSES) {
      assert.doesNotMatch(
        gate,
        new RegExp(`status\\s*=\\s*${s}\\b`),
        `search returns ${L.SEARCHABLE_STATUSES.join(' and ')} rows, so a gate requiring status=${s} `
          + `tells the model that ${JSON.stringify(curated.name)} — status ${curated.status} — fails it`,
      );
    }

    // And it must name the fact that DOES decide it, in the words the search emits, so the model can
    // match one to the other instead of inferring a rule from a null id.
    assert.match(gate, /needs_import/, 'the gate must name the state a curated row is actually in');
    assert.match(gate, /needs_take/, 'and the state every creator_store row is actually in');
    assert.match(gate, /insertable/, 'and the state that means an id exists today');

    // Widening must not drop the real restriction: the dead statuses are still dead.
    for (const s of L.UNUSABLE_STATUSES) {
      assert.match(gate, new RegExp(s), `the gate must still refuse ${s} rows`);
    }
  } finally { d1.close(); }
});

test('a quarantined row is still gone — widening the status filter must not resurrect dead rows', async () => {
  // The failure mode of this whole change: "pending_ingest is not unusable" turning into "no status
  // is unusable". markHealth() writes 'quarantined' when a Roblox id stops resolving, and that row
  // must not come back.
  const d1 = await library();
  try {
    await L.markHealth(d1, SCRAPE.id, false);
    const hits = await L.searchAssetLibrary(d1, 'crate');
    assert.deepEqual(hits.map((h) => h.id), [CURATED.id], 'a quarantined row is unusable, not merely un-imported');
  } finally { d1.close(); }
});
