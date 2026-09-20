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
  // `> 0` is not decoration. Without it, deleting the refusal guard makes indexOf
  // return -1, and -1 < record is true — so the assertion passed with the guard gone,
  // which a mutation proved.
  assert.ok(refusalGuard > 0, 'the refusal guard must exist at all');
  assert.ok(refusalGuard < record, 'a refused insertion must return before anything is recorded');
});

test('the session gives its tools a project id to attribute to', () => {
  const src = readFileSync(join(ROOT, 'apps/worker/src/do/session.ts'), 'utf8');
  // Located by name rather than by exact signature: `agentCtx` gained an optional run parameter so
  // asset provenance could survive a step boundary, and matching `private agentCtx()` literally
  // meant indexOf returned -1 and the slice silently became the last character of the file — a
  // test that fails for a reason with nothing to do with what it is guarding.
  const start = src.search(/private agentCtx\(/);
  assert.ok(start !== -1, 'agentCtx must exist');
  const ctx = src.slice(start, src.indexOf('playtest:', start));
  assert.match(ctx, /projectId: this\.boundProjectId/, 'agentCtx must carry the project');
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

test('an unaccounted key can never be mistaken for a provenance id', () => {
  // The report left-joins usage rows onto the provenance table by id, and every id that table
  // ever held is a namespaced slug: `kenney/city-kit-suburban/building-a-01`. The sentinel written
  // for an asset nothing knows about must be unable to MATCH one — now, and if a provenance table
  // is ever repopulated by some other route. A colon is what makes that true, so a colon is what
  // is asserted rather than the whole shape.
  //
  // THE PATTERN USED TO BE READ OUT OF `asset-library.ts`, which was the honest way to do it while
  // that file owned `ID_RE` and `validateProvenance`. The catalogue was removed on 2026-09-20 and
  // both went with it, so the constraint is stated here directly instead of parsed out of a file
  // that no longer exists. Reading a regex out of a deleted module is how a guard starts throwing
  // ENOENT and gets deleted along with the thing it was protecting.
  const SLUG_RE = /^[a-z0-9][a-z0-9._-]*(\/[a-z0-9][a-z0-9._-]*)+$/;
  assert.ok(SLUG_RE.test('kenney/city-kit-suburban/building-a-01'), 'the pattern matches a real provenance id');
  assert.equal(SLUG_RE.test('unaccounted:roblox:123456'), false, 'the sentinel must be unrepresentable as a provenance id');

  // And the sentinel the code actually writes must be that shape.
  const tools = readFileSync(join(ROOT, 'apps/worker/src/tools.ts'), 'utf8');
  const sentinel = tools.match(/`unaccounted:roblox:\$\{assetId\}`/g) ?? [];
  assert.ok(sentinel.length >= 1, 'insert_asset must key unaccounted assets with the sentinel');
  for (const written of sentinel) {
    assert.ok(written.includes(':'), 'the sentinel lost its colon, which is the only thing keeping it unmatchable');
  }
});

// The runtime half of this wiring — that a recorded row survives the join and that an
// unaccounted asset is NAMED rather than hidden — lives in packages/evals alongside the
// report's own tests, because provenance.ts imports asset-library.ts extensionlessly and
// has to be bundled before node can load it. Splitting it here rather than duplicating
// the bundle: same feature, tested where the toolchain for it already exists.

test('the route returns exactly the keys the browser declares', () => {
  // The web app hand-mirrors every worker response type — MeResponse, SpendReport,
  // RoadmapResponse and now AttributionResponse are all declared a second time in
  // apps/web. That is the codebase's convention and this test does not change it, but
  // it does mean a rename on this side is invisible until a panel renders undefined.
  //
  // Only source drift is checked here. VERSION drift — a deployed worker older than the
  // browser — is a different problem and is handled where it has to be, at the reader:
  // see copyableCredits in credits-model.ts.
  const worker = readFileSync(join(ROOT, 'apps/worker/src/index.ts'), 'utf8');
  const route = worker.slice(worker.indexOf("app.get('/api/projects/:id/attribution'"));
  // The LAST c.json in the handler is the payload. The first is the 404 guard, and
  // anchoring on that made the test read `{ error: 'not found' }` as the response shape.
  const handler = route.slice(0, route.indexOf('\n});'));
  const payload = handler.slice(handler.lastIndexOf('c.json({'));
  // Split rather than match: a regex that consumes the leading `{` or `,` eats the
  // delimiter the NEXT key needs, so it finds every other key and reports the ones it
  // skipped as missing. The first version of this test did exactly that and accused the
  // route of not sending `commercialUse`, which it sends.
  const sent = new Set(
    payload
      .slice(payload.indexOf('{') + 1)
      .split(',')
      .map((part) => /^\s*(\w+)/.exec(part)?.[1])
      .filter(Boolean),
  );

  const model = readFileSync(join(ROOT, 'apps/web/src/components/ws/credits-model.ts'), 'utf8');
  const iface = model.slice(model.indexOf('export interface AttributionResponse {'));
  // `\?` included: an optional field is optional because a DEPLOYED worker may be older,
  // not because this one may stop sending it. Dropping it from the route is still drift,
  // and leaving the `?` out of this pattern silently removed `credits` from the
  // comparison the moment it was made optional.
  const declared = new Set(
    [...iface.slice(0, iface.indexOf('\n}')).matchAll(/^\s{2}(\w+)\??:/gm)].map((m) => m[1]),
  );

  assert.ok(declared.size >= 3, `parsed ${declared.size} declared fields; the check would be vacuous`);
  assert.deepEqual(
    [...declared].filter((k) => !sent.has(k)),
    [],
    'the browser declares a field the route does not send',
  );
});

test('the session restores its binding when an evicted instance is revived', () => {
  // The agent loop runs from alarm(), which never reads the binding. Without this,
  // an instance revived mid-run has no projectId, recordPlacedAsset returns on its
  // first line, and every remaining insert records nothing — an empty ledger, which
  // reads clean. The original bug, re-entering through the recovery path.
  const src = readFileSync(join(ROOT, 'apps/worker/src/do/session.ts'), 'utf8');
  const ctor = src.slice(src.indexOf('blockConcurrencyWhile'), src.indexOf('// ------------------------------------------------------------------ helpers'));
  assert.match(ctor, /storage\.get<\{ projectId: string \}>\('bind'\)/, 'the constructor must read the binding back');
  assert.match(ctor, /this\.boundProjectId = bound\.projectId/);
});

//[[ THE LOOKUP THIS GUARDED IS GONE, AND WHAT REPLACED IT IS STRONGER, SO THE GUARD FOLLOWED IT.
//
//   `recordPlacedAsset` used to ask D1 for a catalogue row matching the Roblox id, and the inner
//   catch around that query had to re-throw anything that was not the missing-table case.
//   Swallowing everything would have written a PERMANENT `unaccounted:` row for an asset that WAS
//   in the catalogue whenever D1 hiccuped — and because the usage table's primary key is
//   (project_id, asset_id), a later correct placement added a SECOND row under the real id, listing
//   one physical asset twice: once unaccounted, once credited.
//
//   The catalogue was removed on 2026-09-20. There is no row to find, so there is no query, so
//   there is no fault to misreport: the key is the sentinel unconditionally. That is a stronger
//   guarantee than the catch was, and this asserts it directly — no lookup, and no branch in which
//   `accounted` could ever be true. ]]
test('there is no catalogue lookup left to misreport a fault as an answer', () => {
  const src = readFileSync(join(ROOT, 'apps/worker/src/tools.ts'), 'utf8');
  const start = src.indexOf('async function recordPlacedAsset');
  assert.notEqual(start, -1, 'recordPlacedAsset moved or was renamed — this guard is looking at nothing');
  const fn = src.slice(start, src.indexOf('export const TOOLS'));
  assert.ok(fn.length > 200, 'the slice is empty or truncated, so the assertions below prove nothing');

  assert.equal(fn.includes('asset_library'), false,
    'recordPlacedAsset queries the catalogue table again — it was deleted, so this can only ever throw');
  assert.equal(/accounted:\s*true/.test(fn), false,
    'something can be reported as accounted again, which means a provenance source came back unannounced');
  assert.match(fn, /accounted: false/, 'and the honest verdict must actually be written');
  assert.match(fn, /recordAssetUse\(ctx\.env, ctx\.projectId, key/, 'the usage row must still be written');
});
