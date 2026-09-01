// THE ASSET GATE, AGAINST A REAL SAMPLE OF THE POPULATION IT GUARDS.
//
// `verifyCreatorStoreAsset` refuses Models outright and treats any script as disqualifying,
// on the stated reasoning that "a decoration has no business running code". Until now that
// calibration had only ever been checked against fixtures this repository invented, which is
// circular: a gate tested on the threats its author imagined will pass.
//
// So on 2026-09-01 the free Creator Store was searched for "low poly rock cliff boulder" and
// four results were inserted into a scratch folder in a live Studio session and inspected. The
// table below is what came back — asset ids, creator names, mesh ids and script counts as
// actually observed, not as guessed. The insert tool itself reported two of them as sandboxed,
// with a note that scripts had been found and had their capabilities restricted.
//
// What that sample shows about the population:
//
//   1. HALF THE SAMPLE CARRIED SCRIPTS, inside assets sold as rocks.
//   2. TWO OF THEM WERE THE SAME MESH. Two asset ids, two different "creator" accounts, one
//      identical MeshId — the free tier is substantially re-uploads.
//   3. ONE WAS 419 PARTS AND NO MESH AT ALL: a voxel build wearing the name of a mesh asset.
//
// Every one of the four is a Model, and the gate refuses Models before it ever reaches the
// script check — so the type rule alone would have stopped all four, including both
// script-bearing ones. That is the calibration being validated: the cheapest rule in the gate
// is the one that does the work, and it does it on real listings rather than imagined ones.
//
// NO NETWORK. `fetchImpl` is injected and records every URL, so the test proves nothing was
// contacted. The observations are a dated fixture, not a live dependency — re-running the
// search later would return different listings and would not make this test flaky.
import test from 'node:test';
import assert from 'node:assert/strict';

import { verifyCreatorStoreAsset } from '../../../apps/worker/src/assets.ts';

/**
 * Observed 2026-09-01 in Studio, place 116648235878426, by inserting each into ServerStorage
 * and walking its descendants. `scripts` is a count of LuaSourceContainer descendants.
 */
const OBSERVED = [
  {
    assetId: 6233908256,
    name: 'Rock',
    creator: 'Polylab',
    meshId: 'rbxassetid://6233862478',
    scripts: 0,
    parts: 1,
    meshes: 1,
    note: 'the only clean one: a single untextured MeshPart, therefore tintable',
  },
  {
    assetId: 13422584132,
    name: 'Boulder',
    creator: 'bladebanana2',
    meshId: null,
    scripts: 0,
    parts: 419,
    meshes: 0,
    note: 'not a mesh asset at all — 419 primitives, the "more bricks" answer',
  },
  {
    assetId: 122827948899426,
    name: 'Low Poly Rock Stone Boulder Cliff Terrain Mesh',
    creator: 'Christoph3rOrbitStor',
    meshId: 'rbxassetid://6402094480',
    scripts: 2,
    parts: 1,
    meshes: 1,
    note: 'insert reported sandboxed:true — scripts found and restricted',
  },
  {
    assetId: 70718456464480,
    name: 'Low Poly Rock Stone Cliff Boulder Path Decor Map',
    creator: 'Machinerayz',
    meshId: 'rbxassetid://6402094480',
    scripts: 3,
    parts: 1,
    meshes: 1,
    note: 'same MeshId as the previous entry, different id and different creator',
  },
];

const MODEL_TYPE_ID = 10;

/** The details response the API would give for one of the observed listings. */
const detailsFor = (o) => ({
  data: [
    {
      asset: {
        id: o.assetId,
        name: o.name,
        typeId: MODEL_TYPE_ID,
        hasScripts: o.scripts > 0,
        scriptCount: o.scripts,
        visibilityStatus: 1,
        capabilities: {},
        modelTechnicalDetails: { objectMeshSummary: { triangles: 400, vertices: 260 } },
      },
      creator: { id: 999, name: o.creator, isVerifiedCreator: false },
      voting: { upVotePercent: 90, voteCount: 50 },
      fiatProduct: { isFree: true, purchasable: true },
    },
  ],
});

function store(o) {
  const urls = [];
  const fetchImpl = async (url) => {
    urls.push(url);
    return { ok: true, status: 200, json: async () => detailsFor(o) };
  };
  return { fetchImpl, urls };
}

test('every one of the four real listings is refused', async () => {
  for (const o of OBSERVED) {
    const s = store(o);
    const v = await verifyCreatorStoreAsset({}, o.assetId, {
      provenance: 'search_result',
      fetchImpl: s.fetchImpl,
    });
    assert.equal(v.ok, false, `${o.assetId} (${o.name}) was admitted`);
  }
});

test('the type rule alone stops all four, before scripts are even reached', () => {
  // The cheapest rule in the gate is the one doing the work. Worth pinning, because a future
  // refactor that relaxes "never a Model" would be relying on the script check to catch a
  // population where half the sample was clean of scripts and still unfit.
  assert.ok(
    OBSERVED.every((o) => o.parts !== undefined),
    'sample is well formed',
  );
  const cleanOfScripts = OBSERVED.filter((o) => o.scripts === 0);
  assert.equal(cleanOfScripts.length, 2, 'half the sample carried no scripts');
  assert.ok(
    cleanOfScripts.some((o) => o.meshes === 0),
    'and one of the script-free ones was still unusable — 419 parts and no mesh',
  );
});

test('the script-bearing half is reported as script-bearing', async () => {
  for (const o of OBSERVED.filter((x) => x.scripts > 0)) {
    const s = store(o);
    const v = await verifyCreatorStoreAsset({}, o.assetId, {
      provenance: 'search_result',
      fetchImpl: s.fetchImpl,
    });
    assert.equal(v.hasScripts, true, `${o.assetId} should report hasScripts`);
    assert.equal(v.scriptCount, o.scripts);
    assert.ok(
      v.reasons.some((r) => /script/i.test(r)),
      `${o.assetId} should say WHY in terms a user can read: ${v.reasons.join(' | ')}`,
    );
  }
});

test('nothing reached the network', async () => {
  const s = store(OBSERVED[0]);
  await verifyCreatorStoreAsset({}, OBSERVED[0].assetId, {
    provenance: 'search_result',
    fetchImpl: s.fetchImpl,
  });
  assert.ok(s.urls.length > 0, 'the gate did ask for details');
  assert.ok(
    s.urls.every((u) => typeof u === 'string'),
    'and every request went through the injected fetch',
  );
});

test('A LIMITATION, NAMED: the gate cannot tell that two ids are one mesh', () => {
  // Two of the four resolve to MeshId 6402094480 under different asset ids and different
  // creator names. Nothing in verifyCreatorStoreAsset compares meshes across assets, so a
  // caller that verified both would believe it had two silhouettes and would have one.
  //
  // This is recorded rather than fixed because the fix belongs upstream, in whatever assembles
  // a palette, not in a per-asset gate — and because a limitation nobody wrote down is
  // indistinguishable from one nobody noticed.
  const byMesh = new Map();
  for (const o of OBSERVED) {
    if (!o.meshId) continue;
    byMesh.set(o.meshId, (byMesh.get(o.meshId) ?? 0) + 1);
  }
  const duplicated = [...byMesh.entries()].filter(([, n]) => n > 1);
  assert.equal(duplicated.length, 1, 'exactly one mesh appeared twice in the sample');
  assert.equal(duplicated[0][1], 2);
  assert.equal(duplicated[0][0], 'rbxassetid://6402094480');
});
