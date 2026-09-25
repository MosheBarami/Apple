import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TASKS } from './missions.mjs';
import { criteriaFor, gradeMission, gradeSuite } from './score.mjs';

const root = mkdtempSync(join(tmpdir(), 'apple-frontier-score-'));
const body = Buffer.from('synthetic fixture: not a real Studio observation');
writeFileSync(join(root, 'fixture.txt'), body);
const digest = createHash('sha256').update(body).digest('hex');
const traceBody = Buffer.from(JSON.stringify({ runId: 'synthetic-run', tools: [
  { tool: 'insert_library_model', ok: true }, { tool: 'play_check', ok: true },
  { tool: 'inspect_visually', ok: true },
] }));
writeFileSync(join(root, 'trace.json'), traceBody);
const traceDigest = createHash('sha256').update(traceBody).digest('hex');
const task = TASKS[0];
const kind = (key) => key.startsWith('feature:') ? 'playtest' : key.startsWith('asset:') ? 'studio-readback' : ({
  run: 'run-trace', studio: 'studio-readback', playtest: 'playtest', security: 'security-probe',
  persistence: 'playtest', mobile: 'mobile-capture', 'visual-world': 'blind-review',
  'visual-ui': 'blind-review', 'no-errors': 'studio-readback',
  'asset-policy': 'studio-readback', 'ui-source': 'studio-readback',
})[key];
const complete = () => ({
  taskId: task.id,
  run: { id: 'synthetic-run', buildSha: 'abc123', projectId: 'synthetic-place', startedAt: '2026-09-25T00:00:00Z', endedAt: '2026-09-25T01:00:00Z', mode: 'agent', autonomous: true, start: 'fresh-baseplate', stopReason: 'done', interventions: [] },
  proofs: Object.fromEntries(criteriaFor(task).map((key) => [key, { kind: kind(key), observer: 'independent-reviewer', runId: 'synthetic-run', artifact: key === 'run' ? 'trace.json' : 'fixture.txt', sha256: key === 'run' ? traceDigest : digest, passed: true, ...(key.startsWith('asset:') ? { asset: { source: 'creator-store', sourceRef: '123456789', rightsUrl: 'https://create.roblox.com/store/asset/123456789', robloxSpecific: true, rightsVerified: true, placed: true, instancePath: 'Workspace.SampleAsset', selectionReason: 'Fits the game role and style', placementReason: 'Placed at the player route entrance', scriptDisposition: 'no-scripts' } } : {}), ...(key.startsWith('visual-') ? { verdict: { fitForRoblox: true, amazing: true } } : {}) }])),
});

test('the bank covers twelve game genres in three independent attempts', () => {
  assert.equal(TASKS.length, 36);
  assert.equal(new Set(TASKS.map((t) => t.id)).size, 36);
  assert.equal(new Set(TASKS.map((t) => t.genre)).size, 12);
  assert.ok(TASKS.every((t) => t.features.length >= 8 && t.assets.length >= 4));
});

test('a full evidence bundle can pass but one broken gameplay feature fails the game', () => {
  const bundle = complete();
  assert.equal(gradeMission(task, bundle, root).status, 'passed');
  bundle.proofs[`feature:${task.features[0]}`].passed = false;
  const result = gradeMission(task, bundle, root);
  assert.equal(result.status, 'failed');
  assert.deepEqual(result.failed, [`feature:${task.features[0]}`]);
});

test('missing, self-attested, wrong-run or fabricated artifacts do not become scores', () => {
  for (const mutation of [
    (b) => { delete b.proofs['visual-ui']; },
    (b) => { b.proofs['visual-ui'].observer = 'Apple'; },
    (b) => { b.proofs['visual-ui'].runId = 'other-run'; },
    (b) => { b.proofs['visual-ui'].artifact = '../fixture.txt'; },
    (b) => { b.proofs['visual-ui'].sha256 = '0'.repeat(64); },
  ]) {
    const bundle = complete(); mutation(bundle);
    const result = gradeMission(task, bundle, root);
    assert.equal(result.status, 'unmeasured');
    assert.ok(result.missing.includes('visual-ui'));
  }
});

test('a partial suite with one easy pass never reports a frontier rate', () => {
  const result = gradeSuite([complete()], root);
  assert.equal(result.measured, 1);
  assert.equal(result.passRate, null);
  assert.equal(result.benchmarkPass, false);
});

test('an unfinished or human-directed run cannot pass', () => {
  const bundle = complete();
  bundle.run.stopReason = 'incomplete';
  bundle.run.interventions = ['manual-code-edit'];
  const result = gradeMission(task, bundle, root);
  assert.equal(result.status, 'unmeasured');
  assert.ok(result.invalid.includes('stop-reason'));
  assert.ok(result.invalid.includes('interventions'));
});

test('a full-game pass requires recorded asset insertion, play check and visual inspection', () => {
  for (const tool of ['insert_library_model', 'play_check', 'inspect_visually']) {
    const bundle = complete();
    const altered = JSON.stringify({ runId: 'synthetic-run', tools: [
      { tool: 'insert_library_model', ok: true }, { tool: 'play_check', ok: true },
      { tool: 'inspect_visually', ok: true },
    ].filter((x) => x.tool !== tool) });
    const file = `${tool}.json`;
    writeFileSync(join(root, file), altered);
    bundle.proofs.run.artifact = file;
    bundle.proofs.run.sha256 = createHash('sha256').update(altered).digest('hex');
    assert.equal(gradeMission(task, bundle, root).status, 'unmeasured');
  }
});

test('a generic converted model cannot satisfy a Roblox asset requirement', () => {
  const bundle = complete();
  bundle.proofs[`asset:${task.assets[0]}`].asset.robloxSpecific = false;
  const result = gradeMission(task, bundle, root);
  assert.equal(result.status, 'unmeasured');
  assert.ok(result.missing.includes(`asset:${task.assets[0]}`));
});

test('an asset is unmeasured without a concrete source, placed instance and script disposition', () => {
  const key = `asset:${task.assets[0]}`;
  for (const erase of ['sourceRef', 'rightsUrl', 'instancePath', 'placementReason', 'scriptDisposition']) {
    const bundle = complete();
    delete bundle.proofs[key].asset[erase];
    const result = gradeMission(task, bundle, root);
    assert.equal(result.status, 'unmeasured', erase);
    assert.ok(result.missing.includes(key), erase);
  }
});

test('a visually rejected game cannot pass even if its code and play loop pass', () => {
  const bundle = complete();
  bundle.proofs['visual-world'].verdict.amazing = false;
  const result = gradeMission(task, bundle, root);
  assert.equal(result.status, 'failed');
  assert.ok(result.failed.includes('visual-world'));
});
