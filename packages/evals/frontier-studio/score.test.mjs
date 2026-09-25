import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TASKS } from './missions.mjs';
import { TASKS as CARTOON_TASKS, BANK as CARTOON_BANK } from './missions-cartoon-v2.mjs';
import { criteriaFor, gradeMission, gradeSuite } from './score.mjs';

const root = mkdtempSync(join(tmpdir(), 'apple-frontier-score-'));
const body = Buffer.from('synthetic fixture: not a real Studio observation');
writeFileSync(join(root, 'fixture.txt'), body);
const digest = createHash('sha256').update(body).digest('hex');
const traceBody = Buffer.from(JSON.stringify({ runId: 'synthetic-run', tools: [
  { tool: 'propose_plan', ok: true }, { tool: 'find_library_model', ok: true },
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
  run: { id: 'synthetic-run', buildSha: 'abc123', projectId: 'synthetic-place', promptSha256: createHash('sha256').update(task.prompt).digest('hex'), baselineSha256: 'a'.repeat(64), startedAt: '2026-09-25T00:00:00Z', endedAt: '2026-09-25T01:00:00Z', finalized: true, mode: 'agent', autonomous: true, start: 'fresh-baseplate', stopReason: 'done', interventions: [] },
  proofs: Object.fromEntries(criteriaFor(task).map((key) => [key, { kind: kind(key), observer: 'independent-reviewer', runId: 'synthetic-run', artifact: key === 'run' ? 'trace.json' : 'fixture.txt', sha256: key === 'run' ? traceDigest : digest, passed: true, ...(key.startsWith('asset:') ? { asset: { source: 'creator-store', sourceRef: '123456789', rightsUrl: 'https://create.roblox.com/store/asset/123456789', robloxSpecific: true, rightsVerified: true, placed: true, instancePath: 'Workspace.SampleAsset', selectionReason: 'Fits the game role and style', placementReason: 'Placed at the player route entrance', scriptDisposition: 'no-scripts' } } : {}), ...(key.startsWith('visual-') ? { verdict: { fitForRoblox: true, amazing: true } } : {}) }])),
});

test('the bank covers twelve game genres in three independent attempts', () => {
  assert.equal(TASKS.length, 36);
  assert.equal(new Set(TASKS.map((t) => t.id)).size, 36);
  assert.equal(new Set(TASKS.map((t) => t.genre)).size, 12);
  assert.ok(TASKS.every((t) => t.features.length >= 8 && t.assets.length >= 4));
});

test('cartoon v2 is a distinct fixed 36-run bank with a required visual-style verdict', () => {
  assert.equal(CARTOON_TASKS.length, 36);
  assert.equal(new Set(CARTOON_TASKS.map((t) => t.genre)).size, 12);
  assert.ok(CARTOON_TASKS.every((t) => t.bank === CARTOON_BANK && t.prompt.includes('colorful cartoon')));
  assert.ok(CARTOON_TASKS.every((t) => !TASKS.some((old) => old.id === t.id)));
  assert.ok(criteriaFor(CARTOON_TASKS[0]).includes('visual-style'));
  const summary = gradeSuite([], root, CARTOON_TASKS);
  assert.equal(summary.total, 36);
  assert.equal(summary.measured, 0);
  assert.equal(summary.passRate, null);
});

test('cartoon visual style is unmeasured without review and fails when rejected', () => {
  const cartoon = CARTOON_TASKS[0];
  const bundle = complete();
  bundle.taskId = cartoon.id;
  bundle.run.promptSha256 = createHash('sha256').update(cartoon.prompt).digest('hex');
  for (const key of criteriaFor(cartoon)) {
    if (bundle.proofs[key]) continue;
    bundle.proofs[key] = {
      kind: key === 'visual-style' ? 'blind-review' : kind(key),
      observer: 'independent-reviewer', runId: 'synthetic-run', artifact: 'fixture.txt',
      sha256: digest, passed: true,
      ...(key.startsWith('asset:') ? { asset: { source: 'creator-store', sourceRef: '123456789', rightsUrl: 'https://create.roblox.com/store/asset/123456789', robloxSpecific: true, rightsVerified: true, placed: true, instancePath: 'Workspace.SampleAsset', selectionReason: 'Fits the game role and style', placementReason: 'Placed at the player route entrance', scriptDisposition: 'no-scripts' } } : {}),
    };
  }
  assert.equal(gradeMission(cartoon, bundle, root).status, 'unmeasured');
  assert.ok(gradeMission(cartoon, bundle, root).missing.includes('visual-style'));
  bundle.proofs['visual-style'].verdict = {
    colorfulCartoon: false, coherentArtDirection: true, commerciallyPolished: true,
  };
  assert.ok(gradeMission(cartoon, bundle, root).failed.includes('visual-style'));
  bundle.proofs['visual-style'].verdict.colorfulCartoon = true;
  assert.equal(gradeMission(cartoon, bundle, root).status, 'unmeasured');
  assert.ok(gradeMission(cartoon, bundle, root).missing.includes('first-action'));
  bundle.proofs['first-action'] = {
    kind: 'playtest', observer: 'independent-reviewer', runId: 'synthetic-run',
    artifact: 'fixture.txt', sha256: digest, passed: true,
    firstAction: {
      input: 'Pressed the highlighted Ride control', instructionVisible: true,
      activated: true, worldChanged: true, hudChanged: true, nextObjectiveVisible: true,
    },
  };
  assert.equal(gradeMission(cartoon, bundle, root).status, 'passed');
  bundle.proofs['visual-style'].verdict.colorfulCartoon = false;
  assert.equal(gradeMission(cartoon, bundle, root).status, 'failed');
  bundle.proofs['visual-style'].verdict.colorfulCartoon = true;
  bundle.proofs['first-action'].firstAction.activated = false;
  assert.equal(gradeMission(cartoon, bundle, root).status, 'failed');
  bundle.proofs['first-action'].firstAction.activated = true;
  delete bundle.proofs['first-action'].firstAction.nextObjectiveVisible;
  assert.equal(gradeMission(cartoon, bundle, root).status, 'unmeasured');
});

test('a full evidence bundle can pass but one broken gameplay feature fails the game', () => {
  const bundle = complete();
  assert.equal(gradeMission(task, bundle, root).status, 'passed');
  bundle.proofs[`feature:${task.features[0]}`].passed = false;
  const result = gradeMission(task, bundle, root);
  assert.equal(result.status, 'failed');
  assert.deepEqual(result.failed, [`feature:${task.features[0]}`]);
});

test('a conclusive observed failure remains a failure when other proofs are missing', () => {
  const bundle = complete();
  const absent = `feature:${task.features[1]}`;
  bundle.proofs['visual-ui'].verdict.amazing = false;
  delete bundle.proofs[absent];
  const result = gradeMission(task, bundle, root);
  assert.equal(result.status, 'failed');
  assert.ok(result.failed.includes('visual-ui'));
  assert.ok(result.missing.includes(absent));
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
  assert.throws(() => gradeSuite([complete()], root, [task]), /unknown fixed task bank/);
});

test('an unfinished or human-directed run cannot pass', () => {
  const bundle = complete();
  bundle.run.stopReason = 'incomplete';
  bundle.run.interventions = ['manual-code-edit'];
  const result = gradeMission(task, bundle, root);
  assert.equal(result.status, 'unmeasured');
  assert.ok(result.invalid.includes('interventions'));
  assert.equal(result.failureReason, 'stop-reason:incomplete');
});

test('normal preview rejection is a permitted bounded choice, not a manual hint', () => {
  const bundle = complete();
  bundle.run.interventions = ['preview-rejection'];
  assert.equal(gradeMission(task, bundle, root).status, 'passed');
});

test('a trace-proven terminal stop is a measured failure even without finished-game proofs', () => {
  const bundle = complete();
  bundle.run.stopReason = 'incomplete';
  bundle.run.interventions = ['preview-rejection'];
  bundle.proofs = { run: bundle.proofs.run };
  bundle.proofs.run.passed = false;
  const result = gradeMission(task, bundle, root);
  assert.equal(result.status, 'failed');
  assert.ok(result.failed.includes('run'));
  assert.equal(result.failureReason, 'stop-reason:incomplete');

  delete bundle.proofs.run;
  assert.equal(gradeMission(task, bundle, root).status, 'unmeasured');
});

test('a paused preview segment is unmeasured until the mission is truly finalized', () => {
  const bundle = complete();
  bundle.run.stopReason = 'incomplete';
  bundle.run.finalized = false;
  bundle.proofs = { run: { ...bundle.proofs.run, passed: false } };
  assert.equal(gradeMission(task, bundle, root).status, 'unmeasured');
});

test('a full-game pass requires recorded asset insertion, play check and visual inspection', () => {
  for (const tool of ['insert_library_model', 'play_check', 'inspect_visually']) {
    const bundle = complete();
    const altered = JSON.stringify({ runId: 'synthetic-run', tools: [
      { tool: 'propose_plan', ok: true }, { tool: 'find_library_model', ok: true },
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

test('the agent must plan and discover a verified asset before insertion, then verify the result', () => {
  const bundle = complete();
  const outOfOrder = JSON.stringify({ runId: 'synthetic-run', tools: [
    { tool: 'insert_library_model', ok: true }, { tool: 'find_library_model', ok: true },
    { tool: 'propose_plan', ok: true }, { tool: 'inspect_visually', ok: true },
    { tool: 'play_check', ok: true },
  ] });
  writeFileSync(join(root, 'out-of-order.json'), outOfOrder);
  bundle.proofs.run.artifact = 'out-of-order.json';
  bundle.proofs.run.sha256 = createHash('sha256').update(outOfOrder).digest('hex');
  const result = gradeMission(task, bundle, root);
  assert.equal(result.status, 'unmeasured');
  assert.ok(result.missing.includes('run'));
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

test('a different prompt, missing baseline or impossible run interval cannot pass', () => {
  for (const mutation of [
    (b) => { b.run.promptSha256 = createHash('sha256').update('easier prompt').digest('hex'); },
    (b) => { delete b.run.baselineSha256; },
    (b) => { b.run.endedAt = '2026-09-24T23:00:00Z'; },
  ]) {
    const bundle = complete(); mutation(bundle);
    assert.equal(gradeMission(task, bundle, root).status, 'unmeasured');
  }
});

test('duplicate task submissions or reused Studio projects cannot count as independent attempts', () => {
  const duplicate = gradeSuite([complete(), complete()], root);
  assert.equal(duplicate.measured, 0);
  assert.ok(duplicate.results[0].invalid.includes('duplicate-task'));

  const other = complete();
  other.taskId = TASKS[1].id;
  const reused = gradeSuite([complete(), other], root);
  assert.equal(reused.measured, 0);
  assert.ok(reused.results[0].invalid.includes('reused-project'));
  assert.ok(reused.results[0].invalid.includes('reused-run'));
});
