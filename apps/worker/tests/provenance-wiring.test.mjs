/**
 * THE LEDGER HAD 500 LINES, 20 TESTS, AND NOTHING THAT EVER WROTE TO IT.
 *
 * `src/provenance.ts` computes what a project owes and to whom. Every function in it
 * was tested in packages/evals, and every one of those tests fed it assets by hand.
 * `recordAssetUse` had no caller anywhere in the worker, so on the real product path
 * the table was always empty — and an empty table produces a clean report. The
 * feature's failure mode was to say "you owe nothing", confidently, always.
 *
 * That is the class of defect a test suite makes MORE likely rather than less: the
 * logic was well covered, so the coverage number said the feature was in good shape.
 * What nothing checked was whether anything called it.
 *
 * These tests are the STRUCTURAL half: that the producer is called, called in the right
 * order, and keyed so its rows cannot be confused with library ids. The runtime half is
 * in packages/evals, where the bundle these modules need already exists.
 *
 * Run with:  node --test           (from apps/worker)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');

/* ------------------------------------------------------------------ the wiring --- */

test('insert_asset records the use, and only after the asset is proven clean', () => {
  // Order matters and is not visible from a unit test of either half: an insertion
  // that was refused is not a use, and recording before the proof would bill the
  // customer for an asset that never reached their place.
  const src = readFileSync(join(ROOT, 'apps/worker/src/tools.ts'), 'utf8');
  const body = src.slice(src.indexOf('insert_asset: {'), src.indexOf('generate_model: {'));

  const proof = body.indexOf('insertAndProveClean');
  const refusalGuard = body.indexOf("'error' in placed");
  const record = body.indexOf('recordPlacedAsset');

  assert.ok(proof > 0 && record > 0, 'insert_asset must both prove and record');
  assert.ok(proof < record, 'the proof has to come first');
  assert.ok(refusalGuard < record, 'a refused insertion must return before anything is recorded');
});

test('the session gives its tools a project id to attribute to', () => {
  const src = readFileSync(join(ROOT, 'apps/worker/src/do/session.ts'), 'utf8');
  const ctx = src.slice(src.indexOf('private agentCtx()'));
  assert.match(ctx.slice(0, 400), /projectId: this\.boundProjectId/, 'agentCtx must carry the project');
  assert.match(src, /this\.boundProjectId = body\.projectId/, '/init must set it');
  assert.match(src, /if \(b\) this\.boundProjectId = b\.projectId/, 'and reading the binding must refresh it');
});

test('the attribution route exists and is owner-scoped', () => {
  const src = readFileSync(join(ROOT, 'apps/worker/src/index.ts'), 'utf8');
  const route = src.slice(src.indexOf("app.get('/api/projects/:id/attribution'"));
  assert.ok(route.length > 0, 'the ledger needs a way to be read');
  const handler = route.slice(0, route.indexOf('});'));
  assert.match(handler, /withOwnedProject/, 'another user must not be able to read it');
  assert.ok(
    handler.indexOf('withOwnedProject') < handler.indexOf('exportProjectAttribution'),
    'ownership is checked before anything is read',
  );

  // And it composes through the module's own entry point rather than re-deriving the
  // three outputs inline, which is what the first version of this route did.
  assert.match(handler, /exportProjectAttribution/);
  assert.doesNotMatch(handler, /attributionReport\(/, 'no second composition of the same report');
});

/* ------------------------------------------------------- the key space it writes --- */

test('an unaccounted key can never be mistaken for a library id', () => {
  // The report left-joins usage rows onto asset_library by id. A key for an asset the
  // library does not have must therefore be unable to MATCH a library id — now or
  // after some future ingest. The library's own id pattern is the authority.
  const lib = readFileSync(join(ROOT, 'apps/worker/src/asset-library.ts'), 'utf8');
  const ID_RE = new RegExp(lib.match(/const ID_RE = \/(.+?)\/;/)[1]);

  assert.ok(ID_RE.test('kenney/city-kit-suburban/building-a-01'), 'the pattern was read correctly');
  assert.equal(ID_RE.test('unaccounted:roblox:123456'), false, 'the sentinel must be unrepresentable as a library id');

  // And the sentinel the code actually writes must be that shape.
  const tools = readFileSync(join(ROOT, 'apps/worker/src/tools.ts'), 'utf8');
  const sentinel = tools.match(/`unaccounted:roblox:\$\{assetId\}`/g) ?? [];
  assert.ok(sentinel.length >= 1, 'insert_asset must key unaccounted assets with the sentinel');
});

// The runtime half of this wiring — that a recorded row survives the join and that an
// unaccounted asset is NAMED rather than hidden — lives in packages/evals alongside the
// report's own tests, because provenance.ts imports asset-library.ts extensionlessly and
// has to be bundled before node can load it. Splitting it here rather than duplicating
// the bundle: same feature, tested where the toolchain for it already exists.
