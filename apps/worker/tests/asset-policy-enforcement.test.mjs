// Behavioural proof that the asset-source policy actually governs the tools — not merely that the
// right identifiers sort in the right order in the source text.
//
// asset-policy-wiring.test.mjs greps tools.ts for call sites. That catches a call site that was
// never added, but it cannot catch a call site that was added and then silently disarmed: delete
// `if (refused) return { error: refused };` from a tool's `run` and leave the `sourceRefusal(...)`
// call sitting right above it, unused, and every source-text assertion in that file stays green —
// the token `sourceRefusal(` still sorts before the token it's being compared against. The guard
// only ever looked at where a name appears, never at what the code actually does with its result.
//
// So these tests call the REAL functions and make "did it touch the thing it was not allowed to
// touch" an observable event: a `ctx.env` getter that throws the instant it is read, and a
// `globalThis.fetch` stub that counts its own calls. A wrongly-ordered or wrongly-wired guard shows
// up here as an exception at the wrong moment or a network call that should never have happened —
// not as a missing token.
//
// Bundled with esbuild exactly the way apps/worker/tests/asset-source-policy.test.mjs bundles
// preferences.ts: real worker TypeScript, compiled to ESM, imported from this .mjs test.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const WORKER = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(mkdtempSync(join(tmpdir(), 'toolsbundle-')), 'tools.mjs');
execFileSync(
  join(WORKER, 'node_modules', '.bin', 'esbuild'),
  [join(WORKER, 'src', 'tools.ts'), '--bundle', '--format=esm', '--target=es2022', '--platform=node', '--outfile=' + out],
  { cwd: WORKER, stdio: 'pipe' },
);
const { TOOLS } = await import(`file://${out}`);

const pol = (allow) => ({ mode: 'remember', allow });

/** A ctx whose `env` throws the instant it is read — proves a guard runs before ANY use of it. */
function envThatMustNotBeTouched(extra = {}) {
  return {
    get env() {
      throw new Error('ctx.env was touched');
    },
    ...extra,
  };
}

/** Replace globalThis.fetch with a call-counting stub that always fails, and return a restorer. */
function stubFetch() {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    throw new Error('TEST-STUB: network reached');
  };
  return { calls: () => calls, restore: () => { globalThis.fetch = original; } };
}

/* --------------------------------------------------------------- choose_asset_source ----------- */

test("allow: [from_scratch] -> choose_asset_source's usable list is ONLY from-scratch sources", async () => {
  const FROM_SCRATCH = new Set(['procedural', 'generation_service', 'terrain', 'builtin']);
  const ctx = { assetSources: pol(['from_scratch']) };
  let sawUsableList = false;
  for (const need of ['prop', 'foliage', 'character', 'ground', 'vehicle', 'building']) {
    const result = await TOOLS.choose_asset_source.run(ctx, { need });
    if (Array.isArray(result)) {
      sawUsableList = true;
      assert.ok(result.length > 0, `${need}: a returned list must not be empty`);
      for (const c of result) assert.ok(FROM_SCRATCH.has(c.source), `${need}: "${c.source}" is not a from_scratch source`);
    } else {
      // A refusal must still name what it would have used, from the product's full ranking —
      // never nothing, and never something already filtered.
      assert.ok(Array.isArray(result.wouldHaveUsed), `${need}: a refusal must report wouldHaveUsed`);
    }
  }
  assert.ok(sawUsableList, 'the test fixture is broken if no need ever produced a usable list');
});

/* ------------------------------------------------------------------ find_verified_asset -------- */

test('allow: [from_scratch] -> find_verified_asset refuses and NEVER reads ctx.env', async () => {
  const ctx = envThatMustNotBeTouched({ assetSources: pol(['from_scratch']) });
  const result = await TOOLS.find_verified_asset.run(ctx, { query: 'chair' });
  assert.ok(result && typeof result === 'object' && 'error' in result, 'must refuse');
  assert.match(result.error, /Creator Store/);
});

test('allow: [creator_store] -> find_verified_asset PROCEEDS to the real search', async () => {
  const ctx = envThatMustNotBeTouched({ assetSources: pol(['creator_store']) });
  await assert.rejects(
    () => TOOLS.find_verified_asset.run(ctx, { query: 'chair' }),
    /ctx\.env was touched/,
  );
});

/* ------------------------------------------------------------------------- insert_asset -------- */
//
// This is the chokepoint the fix-round review named: find_verified_asset can be refused and
// insert_asset can still place a Creator Store id if IT does not also check. So every case here
// drives insert_asset directly, with a `globalThis.fetch` stub standing in for the Roblox details
// call `verifyCreatorStoreAsset` makes — the network call this policy question must never reach.

//[[ FROM SCRATCH MEANS NOTHING COMES FROM ANYWHERE ELSE.
//
//   The owner's third choice is the one where the refusal has to be absolute rather than a
//   preference the model may weigh against a better-looking search hit. A project set to build
//   from scratch that can still place a Creator Store mesh has not been set to anything: it has
//   been given a hint. Both doors are driven here — the search that finds an id, and the insert
//   that would place one found some other way — because closing only the first leaves the second
//   reachable by any id already in the transcript. ]]

test('allow: [from_scratch] -> insert_asset REFUSES a Creator Store id BEFORE any network call', async () => {
  const assetId = 918_273_648;
  const ctx = {
    assetSources: pol(['from_scratch']),
    discoveredAssetIds: new Set([assetId]),
  };
  const stub = stubFetch();
  try {
    const result = await TOOLS.insert_asset.run(ctx, { assetId });
    assert.ok(result && typeof result === 'object' && 'error' in result, 'must refuse');
    assert.match(result.error, /Creator Store/);
    assert.doesNotMatch(result.error, /was not verified/, 'must be the SOURCE refusal, not a verification failure');
    assert.equal(stub.calls(), 0, 'must refuse before ever reaching the network');
  } finally {
    stub.restore();
  }
});

//[[ THERE USED TO BE TWO SEARCHES HERE AND NOW THERE IS ONE.
//
//   This test ran `search_asset_library` and `find_verified_asset` together, because either one
//   returning a hit under `from_scratch` would have handed the model an id to insert. The curated
//   library was removed on 2026-09-20 and its tool with it, so the Creator Store is the only way
//   an id can be discovered — which is what makes the single assertion below sufficient rather
//   than a narrowing of the old one. `search_asset_library` not existing is asserted separately,
//   in asset-policy.test.mjs and in the tool-registry guard, so its absence here is not silence. ]]
test('allow: [from_scratch] -> the only search refuses, so no id is ever discovered to insert', async () => {
  const ctx = envThatMustNotBeTouched({ assetSources: pol(['from_scratch']) });
  assert.equal(TOOLS.search_asset_library, undefined,
    'the catalogue search tool is back in the registry — this test would no longer cover every way an id can arrive');
  const store = await TOOLS.find_verified_asset.run(ctx, { query: 'rock' });
  assert.ok(store && 'error' in store, 'the Creator Store must refuse');
  assert.match(store.error, /Creator Store/);
});

test('user_supplied is NEVER refused by the source policy, even when NOTHING is allowed', async () => {
  const assetId = 918_273_647;
  const ctx = {
    assetSources: pol([]), // an answered policy that permits nothing at all
    discoveredAssetIds: new Set(),
  };
  const stub = stubFetch();
  try {
    const result = await TOOLS.insert_asset.run(ctx, { assetId });
    assert.ok(result && typeof result === 'object' && 'error' in result);
    assert.doesNotMatch(
      result.error,
      /Settings under Connections/,
      "a pasted id is the customer's own choice, not a source decision Apple made",
    );
    assert.ok(stub.calls() > 0, 'must have reached verification — the security gate still runs in full');
  } finally {
    stub.restore();
  }
});
