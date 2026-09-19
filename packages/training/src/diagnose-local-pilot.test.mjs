import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { ALL_GAME_LOGIC_CURRICULUM } from './build-game-logic.mjs';
import { checkCandidate } from './evaluate-game-logic.mjs';
import { diagnoseAnswer, diagnosePilot, inspectSavedAnswer, originalAssertionCases } from './diagnose-local-pilot.mjs';
import { supplementaryCases } from './local-pilot-diagnostic-cases.mjs';

const sha = value => createHash('sha256').update(value).digest('hex');
const fence = source => '```luau\n' + source + '\n```';
const example = id => ALL_GAME_LOGIC_CURRICULUM.find(e => e.id === id);
const simple = [{ id: 'one', checks: 'assert(candidate() == 1, "APPLE_DIAG_ASSERT")' }];
const good = fence('return function() return 1 end');
// Resolve relative to this test, not the caller's cwd: workspace runners execute
// from packages/training, while direct root runs use the repository root.
const cli = fileURLToPath(new URL('./diagnose-local-pilot.mjs', import.meta.url));

function snapshot(directory, prefix = '') {
  const result = {};
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    const name = prefix + entry.name;
    if (entry.isDirectory()) Object.assign(result, snapshot(path, name + '/'));
    else result[name] = sha(readFileSync(path));
  }
  return result;
}

/** Synthetic provenance fixture, NOT trained weights or a claimed model capability. */
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'apple-diagnosis-test-'));
  const data = join(root, 'data'); const run = join(root, 'run');
  mkdirSync(data); mkdirSync(run); mkdirSync(join(run, 'adapter'));
  const write = (path, value) => writeFileSync(path, JSON.stringify(value, null, 2) + '\n');
  const makeRow = e => ({ messages: [
    { role: 'system', content: 'Synthetic diagnostic fixture.' },
    { role: 'user', content: e.prompt },
    { role: 'assistant', content: fence(e.source) },
  ], meta: { id: e.id, family: e.family, origin: 'first-party-authored-synthetic', evidence: {
    sourceSha256: sha(e.source), checksSha256: sha(e.checks), behaviorPassed: true, mutationRejected: true,
  } } });
  const splits = { train: [ALL_GAME_LOGIC_CURRICULUM[0]], val: [ALL_GAME_LOGIC_CURRICULUM[1]],
    test: [example('weighted-selection'), example('team-balance')] };
  const card = { customerData: false, source: 'first-party-authored-synthetic', examples: 4,
    splitSizes: { train: 1, val: 1, test: 2 }, families: {}, digest: sha('synthetic diagnostic fixture, not a trained dataset') };
  for (const [split, examples] of Object.entries(splits)) {
    for (const e of examples) card.families[e.family] = split;
    writeFileSync(join(data, split + '.jsonl'), examples.map(e => JSON.stringify(makeRow(e))).join('\n') + '\n');
  }
  write(join(data, 'dataset-card.json'), card);
  const manifest = { productionPromotion: false, config: { iters: 16, data: 'mlx-community/WikiSQL' },
    dataDigest: card.digest, inputHashes: {} };
  for (const name of readdirSync(data)) manifest.inputHashes[name] = sha(readFileSync(join(data, name)));
  write(join(run, 'manifest.json'), manifest);
  const adapter = 'Test fixture. These are not model weights.';
  const adapterSha256 = sha(adapter);
  writeFileSync(join(run, 'adapter', 'adapters.safetensors'), adapter);
  write(join(run, 'completed.json'), { trainingCompleted: true, productionPromotion: false, adapterSha256 });
  const response = fence('return function() return nil end');
  for (const e of splits.test) for (const phase of ['before', 'after']) write(join(run, `${phase}-${e.id}.json`), { id: e.id, phase, response });
  write(join(run, 'replay.json'), { freshProcessReload: true, adapterSha256,
    results: splits.test.map(e => ({ id: e.id, response, matchesInMemory: true })) });
  return { root, data, run, write, card, manifest, close: () => rmSync(root, { recursive: true, force: true }) };
}

test('original assertions come from AST, not comments or one-line spelling', async () => {
  const checks = '-- assert(false) is prose\nlocal value = {n = 0}\nassert(\n candidate(value) == 1\n)\ncandidate(value)\nassert(value.n == 2)';
  const cases = originalAssertionCases(checks);
  assert.equal(cases.length, 2);
  assert.match(cases[0].assertion, /candidate\(value\)/);
  const result = await diagnoseAnswer(fence('return function(v) v.n += 1 return v.n end'), cases);
  assert.equal(result.complete, true);
  assert.deepEqual(result.cases.map(c => c.status), ['pass', 'pass'], 'setup and previous calls must be replayed');
});

test('later assertions execute after an earlier failure, without changing the original score', async () => {
  const checks = 'assert(candidate(1) == 1)\nassert(candidate(2) == 2)\nassert(candidate(3) == 3)';
  const answer = fence('return function(n) if n == 3 then return n end return n + 1 end');
  assert.equal((await checkCandidate({ checks }, answer)).passed, false);
  const result = await diagnoseAnswer(answer, originalAssertionCases(checks));
  assert.deepEqual(result.cases.map(c => c.status), ['fail', 'fail', 'pass']);
  assert.equal(result.cases[1].classification, 'semantic-contract');
  assert.match(result.cases[1].message, /expected 2; observed 3/);
});

test('unsupported, empty, nested, shadowed, and excessive checks are refused', () => {
  for (const checks of ['', '-- assert(true)', 'local assert = function() end\nassert(true)',
    'local candidate = function() end\nassert(true)', 'if true then assert(true) end',
    'local fn = function() assert(true) end\nassert(true)', 'assert(', Array(65).fill('assert(true)').join('\n')]) {
    assert.throws(() => originalAssertionCases(checks), /diagnostic|assertion|shadowing/);
  }
});

test('format, syntax, context, return shape, and runtime errors are distinguished', async () => {
  let calls = 0;
  for (const [answer, classification] of [
    ['No code', 'format'], ['```luau\nreturn function(\n```', 'syntax'],
    [fence('return require("./other")'), 'context-dependency'],
    [fence('return function() return missingState end'), 'context-dependency'],
  ]) {
    assert.equal(inspectSavedAnswer(answer).classification, classification);
    const result = await diagnoseAnswer(answer, simple, { run: () => { calls++; } });
    assert.equal(result.complete, false); assert.equal(result.cases[0].status, 'unobserved');
  }
  assert.equal(calls, 0);
  const shape = await diagnoseAnswer(fence('return {}'), simple);
  assert.equal(shape.cases[0].classification, 'module-return-shape');
  const runtime = await diagnoseAnswer(fence('return function() error("input error") end'), simple);
  assert.equal(runtime.cases[0].classification, 'runtime-error');
});

test('missing, duplicate, extra, or skipped results cannot fabricate a complete report', async () => {
  const cases = [...simple, { id: 'two', checks: 'assert(true)' }];
  for (const returned of [[{ name: 'one', status: 'pass' }],
    [{ name: 'one', status: 'pass' }, { name: 'one', status: 'pass' }],
    [{ name: 'one', status: 'pass' }, { name: 'unexpected', status: 'pass' }],
    [{ name: 'one', status: 'pass' }, { name: 'two', status: 'skip' }]]) {
    const result = await diagnoseAnswer(good, cases, { run: async () => ({ ok: true, reason: 'exit', exitCode: 0, run: { cases: returned } }) });
    assert.equal(result.complete, false);
    assert.ok(result.cases.every(c => c.status === 'unobserved'));
  }
  await assert.rejects(diagnoseAnswer(good, [simple[0], simple[0]]), /invalid/);
});

test('refusals and killed/truncated processes preserve unobserved cases and stop new batches', async () => {
  const cases = Array.from({ length: 25 }, (_, i) => ({ id: `case:${i}`, checks: 'assert(true)' }));
  for (const failure of [{ code: 'policy', error: 'refused fixture' },
    { ok: false, reason: 'wall_clock', exitCode: null, run: { cases: [{ name: 'case:0', status: 'pass' }] } },
    { ok: true, reason: 'exit', exitCode: 0, outputTruncated: true, run: { cases: [] } },
    { ok: false, reason: 'spawn_failed', exitCode: null }]) {
    let calls = 0;
    const result = await diagnoseAnswer(good, cases, { run: async () => { calls++; return failure; } });
    assert.equal(calls, 1); assert.equal(result.complete, false);
    assert.equal(result.cases.length, cases.length);
    assert.ok(result.cases.every(c => c.status === 'unobserved'));
  }
});

test('all original references pass all original and supplementary diagnostic cases', async () => {
  for (const id of ['weighted-selection', 'team-balance']) {
    const e = example(id);
    const cases = [...originalAssertionCases(e.checks), ...supplementaryCases(id)];
    const result = await diagnoseAnswer(fence(e.source), cases);
    assert.equal(result.complete, true);
    assert.ok(result.cases.length > 20);
    assert.ok(result.cases.every(c => c.status === 'pass'), JSON.stringify(result));
  }
  assert.throws(() => supplementaryCases('unreviewed-family'), /no reviewed/);
});

test('fractional-weight defect passes the old score but fails the new numeric-domain probe', async () => {
  const e = example('weighted-selection');
  const source = `local reference = (function()\n${e.source}\nend)()\nreturn function(weights, ticket)\n if type(weights) == "table" then\n  for _, weight in pairs(weights) do\n   if type(weight) == "number" and weight % 1 ~= 0 then return nil end\n  end\n end\n return reference(weights, ticket)\nend`;
  assert.equal((await checkCandidate(e, fence(source))).passed, true, 'the historical coverage gap must be reproduced');
  const result = await diagnoseAnswer(fence(source), supplementaryCases(e.id));
  const failure = result.cases.find(c => c.id === 'supplement:fractional-weights');
  assert.equal(failure.status, 'fail'); assert.equal(failure.classification, 'semantic-contract');
});

test('fractional-capacity defect passes the old score but fails the new integer-domain probe', async () => {
  const e = example('team-balance'); const needle = 'not integer(capacity)';
  assert.equal(e.source.split(needle).length, 2, 'mutation must target exactly one guard');
  const source = e.source.replace(needle, 'type(capacity) ~= "number"');
  assert.equal((await checkCandidate(e, fence(source))).passed, true, 'the historical coverage gap must be reproduced');
  const result = await diagnoseAnswer(fence(source), supplementaryCases(e.id));
  assert.equal(result.cases.find(c => c.id === 'supplement:fractional-capacity').status, 'fail');
});

test('diagnosis is deterministic, read-only, and does not turn synthetic completion metadata into promotion', async () => {
  const f = fixture();
  try {
    const before = snapshot(f.root);
    const first = await diagnosePilot(f.run, f.data);
    const second = await diagnosePilot(f.run, f.data);
    assert.deepEqual(first, second, 'temporary paths and timings must not change diagnostic evidence');
    assert.deepEqual(snapshot(f.root), before, 'all input bytes must be preserved');
    assert.deepEqual(first.originalGate, { examples: 2, beforePassed: 0, afterPassed: 0 });
    assert.equal(first.effectiveDataset.examples, 4);
    assert.equal(first.diagnosticComplete, true);
    assert.equal(first.modelReloadedNow, false); assert.equal(first.productionPromotion, false);
    assert.equal(first.studioVerified, false); assert.equal(first.providerSpendUsd, 0);
    assert.equal(first.savedReplayEvidenceMatched, true);
    assert.equal(first.metadataNotes.length, 1);
  } finally { f.close(); }
});

test('adapter, train, validation, holdout, reference, and saved replay tampering fail closed', async () => {
  for (const mutate of [
    f => writeFileSync(join(f.run, 'adapter', 'adapters.safetensors'), 'tampered fixture'),
    ...['train', 'val', 'test'].map(split => f => writeFileSync(join(f.data, `${split}.jsonl`), '\n', { flag: 'a' })),
    f => {
      const path = join(f.run, 'after-weighted-selection.json');
      f.write(path, { id: 'weighted-selection', phase: 'after', response: good });
    },
    f => {
      const path = join(f.data, 'test.jsonl');
      const rows = readFileSync(path, 'utf8').trim().split('\n').map(JSON.parse);
      rows[0].meta.evidence.checksSha256 = sha('other checks');
      writeFileSync(path, rows.map(r => JSON.stringify(r)).join('\n') + '\n');
      f.manifest.inputHashes['test.jsonl'] = sha(readFileSync(path));
      f.write(join(f.run, 'manifest.json'), f.manifest);
    },
  ]) {
    const f = fixture();
    try { mutate(f); await assert.rejects(diagnosePilot(f.run, f.data), /changed|reproduce|differ/); }
    finally { f.close(); }
  }
});

test('customer data and family reassignment are refused even with a newly matching file hash', async () => {
  for (const mutate of [card => { card.customerData = true; }, card => { card.families['team-balance'] = 'train'; }]) {
    const f = fixture();
    try {
      mutate(f.card); f.write(join(f.data, 'dataset-card.json'), f.card);
      f.manifest.inputHashes['dataset-card.json'] = sha(readFileSync(join(f.data, 'dataset-card.json')));
      f.write(join(f.run, 'manifest.json'), f.manifest);
      await assert.rejects(diagnosePilot(f.run, f.data), /synthetic|family split/);
    } finally { f.close(); }
  }
});

test('CLI requires explicit paths, writes only a new report, and refuses overwrite', () => {
  const f = fixture();
  try {
    assert.notEqual(spawnSync(process.execPath, [cli], { encoding: 'utf8', timeout: 5000 }).status, 0);
    const before = snapshot(f.root); const output = join(f.root, 'report.json');
    const args = [cli, f.run, f.data, '--out', output];
    const first = spawnSync(process.execPath, args, { cwd: f.root, encoding: 'utf8', timeout: 10000 });
    assert.equal(first.status, 0, first.stderr);
    const reportHash = sha(readFileSync(output));
    const second = spawnSync(process.execPath, args, { cwd: f.root, encoding: 'utf8', timeout: 10000 });
    assert.notEqual(second.status, 0); assert.match(second.stderr, /EEXIST/);
    assert.equal(sha(readFileSync(output)), reportHash);
    const after = snapshot(f.root); delete after['report.json']; assert.deepEqual(after, before);
  } finally { f.close(); }
});
