import test from 'node:test';
import assert from 'node:assert/strict';
import { sessionHarness, rows } from './session-harness.mjs';

function snapshot(id, extra = {}) {
  return {
    format: 'apple-studio-snapshot-v1', checkpointId: id,
    root: 'game', scope: 'place', node: { className: 'DataModel', name: 'game', children: [] },
    nodeCount: 1, instanceCount: 0, scriptCount: 0, sourceChars: 0,
    includeScripts: true, sourceHashAlgorithm: 'fnv1a32',
    complete: false, wholePlaceComplete: false, restorable: true, checkpointEligible: true,
    coverage: 'supported-subset', truncated: false, skipped: {},
    protected: [{ path: 'game.Workspace.Camera', className: 'Camera', name: 'Camera', childCount: 0 }],
    ...extra,
  };
}

test('snapshot, persisted checkpoint and restore use the same ID; partial coverage survives listing and completion', async () => {
  const h = sessionHarness();
  const seen = [];
  h.session.execStudioOp = async op => {
    seen.push(op);
    if (op.op === 'snapshot') return { ok: true, data: snapshot(op.checkpointId) };
    return { ok: true, data: { restored: true, scriptsExpected: 0, scriptsRestored: 0,
      instancesCreated: 0, failedInstances: 0, failedScripts: 0, failedProperties: 0 } };
  };
  const cp = await h.session.createCheckpoint('bounded capture', 'manual');
  assert.equal(cp.id, seen[0].checkpointId);
  assert.match(cp.id, /^[a-f0-9-]{36}$/);
  assert.equal(seen[0].includeScripts, true);
  assert.equal(cp.coverage, 'supported-subset');
  assert.equal(cp.preservedObjects, 1);
  const listed = await (await h.session.fetch(new Request('https://do/checkpoints'))).json();
  assert.equal(listed.checkpoints[0].coverage, cp.coverage);
  assert.equal(listed.checkpoints[0].preservedObjects, 1);
  const result = await h.session.restoreCheckpoint(cp.id);
  assert.equal(result.ok, true);
  assert.equal(seen[1].checkpointId, cp.id);
  assert.equal(seen[1].snapshot.checkpointId, cp.id);
  assert.equal(seen[1].snapshot.complete, false);
  assert.match(result.note, /preserved rather than rolled back/);
  assert.equal(h.sent.findLast(event => event.type === 'restore_status').note, result.note);
});

test('an ineligible, unbound, inconsistent or truncated snapshot writes no checkpoint or chunks', async () => {
  for (const extra of [
    { checkpointId: 'other' }, { checkpointEligible: false }, { restorable: false },
    { truncated: true }, { coverage: 'incomplete' }, { complete: true },
    { protected: [] }, { wholePlaceComplete: true }, { includeScripts: false },
    { skipped: { MeshPart: 1 } }, { scope: 'subtree' }, { scriptCount: -1 },
    { format: undefined }, { format: 'unrecognized' },
  ]) {
    const h = sessionHarness();
    h.session.execStudioOp = async op => ({ ok: true, data: snapshot(op.checkpointId, extra) });
    const result = await h.session.createCheckpoint('refused', 'manual');
    assert.ok(result.error, JSON.stringify(extra));
    assert.equal(rows(h, 'select * from checkpoints').length, 0);
    assert.equal(rows(h, 'select * from checkpoint_chunks').length, 0);
  }
});

test('copying chunks under another checkpoint ID is refused before restore reaches Studio', async () => {
  const h = sessionHarness();
  let calls = 0;
  h.session.execStudioOp = async op => { calls++; return { ok: true, data: snapshot(op.checkpointId) }; };
  const cp = await h.session.createCheckpoint('original', 'manual');
  h.sql.exec('insert into checkpoint_chunks(checkpoint_id,idx,data) select ?,idx,data from checkpoint_chunks where checkpoint_id=?', 'wrong-id', cp.id);
  const result = await h.session.restoreCheckpoint('wrong-id');
  assert.equal(result.ok, false);
  assert.match(result.error, /identity/);
  assert.equal(calls, 1);
  assert.equal(h.sent.findLast(event => event.type === 'restore_status').phase, 'failed');
});

test('legacy snapshot payloads keep compatibility without inventing measured coverage', async () => {
  const h = sessionHarness();
  h.session.execStudioOp = async () => ({ ok: true, data: { v: 1, containers: {}, scripts: [], scriptCount: 0, instanceCount: 0 } });
  const cp = await h.session.createCheckpoint('legacy', 'manual');
  assert.ok(cp.id);
  assert.equal(cp.coverage, undefined);
  assert.equal(cp.preservedObjects, undefined);
  const listed = await (await h.session.fetch(new Request('https://do/checkpoints'))).json();
  assert.equal(listed.checkpoints[0].coverage, undefined);
});

test('an empty Luau omissions table encoded as [] is accepted, but nonempty omissions remain refused', async () => {
  for (const [skipped, accepted] of [[[], true], [['MeshPart'], false]]) {
    const h = sessionHarness();
    h.session.execStudioOp = async op => ({ ok: true, data: snapshot(op.checkpointId, { skipped }) });
    const cp = await h.session.createCheckpoint('engine JSON', 'manual');
    assert.equal(typeof cp.id === 'string', accepted);
    assert.equal(rows(h, 'select * from checkpoints').length, accepted ? 1 : 0);
  }
});

// THE SNAPSHOT REFUSAL NAMED NOTHING. On 2026-09-20 the owner's build reported "Couldn't snapshot
// your project before starting (Studio could not capture a restorable snapshot of the supported
// objects). Continuing without an undo point." That one sentence was returned for three unrelated
// failures with three different remedies — the place outgrew the plugin's bounded walk, the place
// held classes this version cannot serialise, or the plugin never stamped the snapshot with the
// checkpoint id. The test above proves each is REFUSED; this one proves each says which it was,
// because a refusal that cannot be acted on is the defect, not the refusal.
test('each snapshot refusal names its own cause, with only the numbers Studio sent', async () => {
  const refusal = async extra => {
    const h = sessionHarness();
    h.session.execStudioOp = async op => ({ ok: true, data: snapshot(op.checkpointId, extra) });
    const { error } = await h.session.createCheckpoint('refused', 'manual');
    assert.ok(error, JSON.stringify(extra));
    return error;
  };

  // Bounded walk stopped early. Quotes the plugin's own counters, never a cap this side invented.
  //
  // RE-AIMED 2026-09-21, and the history matters. These two assertions used to require the literal
  // "too large for one checkpoint", and they were right to until the day the sentence was measured
  // against the real plugin: `truncated` is raised by FOUR ceilings — objects, nesting depth, script
  // bytes, one parent's children — and a place of thirteen objects with a deep folder chain was
  // being told it was too large, with "(it reached 13 objects)" printed beside the claim. The
  // property was never the spelling; it is that a stopped walk is refused, says the walk stopped,
  // quotes only Studio's own counters, and does not attribute a cause Studio never reported. These
  // fixtures send no `truncatedBy`, which is exactly what every plugin build before 2026-09-21 puts
  // on the wire, so the no-cause sentence is the correct answer for them. The cause-naming itself is
  // measured against the real plugin in tests/checkpoint-evidence-live-plugin.test.mjs.
  const tooLarge = await refusal({ truncated: true, nodeCount: 800, sourceChars: 600123 });
  assert.match(tooLarge, /larger or deeper than one checkpoint can carry/);
  assert.doesNotMatch(tooLarge, /nests objects deeper|more objects than|more script than|more children than/);
  assert.match(tooLarge, /reached 800 objects and 600123 characters of script/);
  assert.match(tooLarge, /Studio's own undo/);

  // A count Studio did not send is not reported as zero.
  const tooLargeQuiet = await refusal({ truncated: true, nodeCount: 0, sourceChars: 0 });
  assert.match(tooLargeQuiet, /larger or deeper than one checkpoint can carry/);
  assert.doesNotMatch(tooLargeQuiet, /reached/);

  // When Studio DOES say which ceiling it hit, the sentence is that ceiling's and no other. Depth is
  // the case that made this necessary: its remedy is to flatten, and "too large" sends the owner to
  // delete content that was never the problem.
  const nested = await refusal({ truncated: true, truncatedBy: 'depth', nodeCount: 13, sourceChars: 0 });
  assert.match(nested, /nests objects deeper/);
  assert.doesNotMatch(nested, /larger or deeper|more objects than/);
  assert.match(nested, /reached 13 objects/);

  // An unrecognised value is an unrecognised value, not a licence to guess the nearest cause.
  const garbled = await refusal({ truncated: true, truncatedBy: 'constructor', nodeCount: 13, sourceChars: 0 });
  assert.match(garbled, /larger or deeper than one checkpoint can carry/);

  // Unserialisable objects: named, most frequent first, so support can act on the class.
  const named = await refusal({ restorable: false, skipped: { Terrain: 1, MeshPart: 3 } });
  assert.match(named, /these objects exactly: MeshPart x3, Terrain x1/);
  assert.doesNotMatch(named, /too large/);

  // Incomplete with nothing named is reported as unnamed, not as a cause this side guessed.
  const unnamed = await refusal({ restorable: false, skipped: {} });
  assert.match(unnamed, /every object exactly \(it named none of them\)/);

  // Identity, which is a plugin-version problem and nothing to do with size or coverage.
  const unstamped = await refusal({ checkpointEligible: false });
  assert.match(unstamped, /did not stamp its snapshot with this checkpoint/);
  assert.match(unstamped, /Update the Studio plugin/);
  assert.doesNotMatch(unstamped, /too large|these objects exactly/);

  // The whole point: a reader can tell them apart.
  assert.equal(new Set([tooLarge, named, unnamed, unstamped]).size, 4);
});
