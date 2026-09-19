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
