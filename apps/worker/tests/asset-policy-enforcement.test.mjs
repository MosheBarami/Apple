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

/* ------------------------------------------------------------ search_asset_library ------------ */

test('NO POLICY: search_asset_library refuses and NEVER reads ctx.env', async () => {
  const ctx = envThatMustNotBeTouched({ assetSources: undefined });
  const result = await TOOLS.search_asset_library.run(ctx, { query: 'rock' });
  assert.ok(result && typeof result === 'object' && 'error' in result, 'must refuse');
  assert.match(result.error, /has not been asked/);
});

test('allow: [apple_library] -> search_asset_library PROCEEDS to the real query', async () => {
  const ctx = envThatMustNotBeTouched({ assetSources: pol(['apple_library']) });
  // The only way this rejects with THIS message is that execution reached
  // `searchAssetLibrary(ctx.env, ...)` and evaluated `ctx.env` — i.e. it got past the guard.
  await assert.rejects(
    () => TOOLS.search_asset_library.run(ctx, { query: 'rock' }),
    /ctx\.env was touched/,
  );
});

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

test('allow: [apple_library] (no from_scratch) -> choose_asset_source NEVER returns a from-scratch-only need as usable', async () => {
  // "ground" is procedural-first in the product's own ranking; with only the library allowed, its
  // usable list must be filtered down to whatever the library can supply, never fall back silently
  // to the procedural rationale the policy did not permit.
  const ctx = { assetSources: pol(['apple_library']) };
  const result = await TOOLS.choose_asset_source.run(ctx, { need: 'ground' });
  if (Array.isArray(result)) {
    for (const c of result) assert.equal(c.source, 'library', `ground: "${c.source}" was not allowed`);
  } else {
    assert.ok(Array.isArray(result.wouldHaveUsed));
  }
});

/* ------------------------------------------------------------------ find_verified_asset -------- */

test('allow: [apple_library] -> find_verified_asset refuses and NEVER reads ctx.env', async () => {
  const ctx = envThatMustNotBeTouched({ assetSources: pol(['apple_library']) });
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

test('allow: [apple_library] -> insert_asset REFUSES a search_result (Creator Store) id BEFORE any network call', async () => {
  const assetId = 918_273_645;
  const ctx = {
    assetSources: pol(['apple_library']),
    discoveredAssetIds: new Set([assetId]), // came from find_verified_asset, never the library
    libraryAssetIds: new Set(),
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

test('allow: [apple_library] -> insert_asset does NOT source-refuse a library id (it reaches verification instead)', async () => {
  const assetId = 918_273_646;
  const ctx = {
    assetSources: pol(['apple_library']),
    discoveredAssetIds: new Set(),
    libraryAssetIds: new Set([assetId]),
  };
  const stub = stubFetch();
  try {
    const result = await TOOLS.insert_asset.run(ctx, { assetId });
    // The fetch stub makes verification itself fail — that is expected and is not the thing under
    // test here. What matters is WHY it failed.
    assert.ok(result && typeof result === 'object' && 'error' in result);
    assert.doesNotMatch(result.error, /Settings under Connections/, 'must not be the source-policy refusal');
    assert.ok(stub.calls() > 0, 'must have reached verification, which touches the network');
  } finally {
    stub.restore();
  }
});

test('user_supplied is NEVER refused by the source policy, even when NOTHING is allowed', async () => {
  const assetId = 918_273_647;
  const ctx = {
    assetSources: pol([]), // an answered policy that permits nothing at all
    discoveredAssetIds: new Set(),
    libraryAssetIds: new Set(),
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
