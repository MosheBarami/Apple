import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ALL_GAME_LOGIC_CURRICULUM } from './build-game-logic.mjs';
import { checkCandidate } from './evaluate-game-logic.mjs';
import { diagnoseAnswer, diagnosePilot, inspectSavedAnswer, originalAssertionCases } from './diagnose-local-pilot.mjs';
import { supplementaryCases } from './local-pilot-diagnostic-cases.mjs';

const hash = value => createHash('sha256').update(value).digest('hex');
const fence = source => '```luau\n' + source + '\n```';
const example = id => ALL_GAME_LOGIC_CURRICULUM.find(entry => entry.id === id);
const casesFor = entry => [...originalAssertionCases(entry.checks), ...supplementaryCases(entry.id)];

function replaceOnce(source, before, after) {
  assert.equal(source.split(before).length, 2, 'mutation must target one unique site');
  return source.replace(before, after);
}

test('offline diagnostic extracts real assertions while ignoring prose and preserving preceding calls', () => {
  const checks = '-- assert(false)\nlocal text = "assert(false)"\nassert(\n candidate() == 1\n)\nassert(candidate() == 2)';
  const cases = originalAssertionCases(checks);
  assert.equal(cases.length, 2);
  assert.equal(cases[0].line, 3);
  assert.match(cases[1].checks, /pcall\(function\(\)/);
  assert.ok(cases.every(item => item.kind === 'original-assertion-continuation'));
  for (const source of ['-- assert(false)', 'for i=1,2 do assert(true) end',
    'local assert = function() end\nassert(true)', 'local candidate = function() end\nassert(true)', 'assert(']) {
    assert.throws(() => originalAssertionCases(source));
  }
});

test('offline diagnostic executes every reference case and rejects real semantic mutants', async () => {
  for (const id of ['weighted-selection', 'team-balance']) {
    const entry = example(id);
    const cases = casesFor(entry);
    const good = await diagnoseAnswer(fence(entry.source), cases);
    assert.equal(good.complete, true);
    assert.equal(good.cases.length, cases.length);
    assert.ok(good.cases.every(item => item.status === 'pass'), JSON.stringify(good));
    assert.equal((await checkCandidate(entry, fence(entry.source))).passed, true);
    const bad = await diagnoseAnswer(fence(replaceOnce(entry.source, ...entry.mutation)), cases);
    assert.equal(bad.complete, true);
    assert.ok(bad.cases.some(item => item.kind === 'original-assertion-continuation' && item.status === 'fail'));
  }
});

test('offline diagnostic exposes a validated input-type coverage defect without changing the canonical score', async () => {
  const entry = example('weighted-selection');
  const source = replaceOnce(entry.source,
    'if type(value) ~= "table" or getmetatable(value) ~= nil then return false end',
    'if getmetatable(value) ~= nil then return false end');
  // This flawed reference derivative passes the unchanged old checks: numeric arrays were absent.
  assert.equal((await checkCandidate(entry, fence(source))).passed, true);
  const diagnostic = await diagnoseAnswer(fence(source), casesFor(entry));
  const missing = diagnostic.cases.find(item => item.id === 'supplement:number-array');
  assert.equal(diagnostic.complete, true);
  assert.equal(missing.status, 'fail');
  assert.equal(missing.classification, 'runtime-error');
  assert.match(missing.message, /length of a number/);
  assert.doesNotMatch(missing.message, /apple-sandbox-|\/var\//);
});

test('offline diagnostic continues beyond failures while preserving evaluated side effects', async () => {
  const sequential = await diagnoseAnswer(fence('local count = 0\nreturn function() count += 1 return count end'),
    originalAssertionCases('assert(candidate() == 1)\nassert(candidate() == 2)'));
  assert.deepEqual(sequential.cases.map(item => item.status), ['pass', 'pass']);
  const mutation = await diagnoseAnswer(fence('return function(input) input[1] = 7 return true end'),
    originalAssertionCases('local input = {1}\nassert(candidate(input) == false)\nassert(input[1] == 1)'));
  assert.deepEqual(mutation.cases.map(item => item.status), ['fail', 'fail']);
  const throws = await diagnoseAnswer(fence('return function(x) if x < 0 then error("fixture-negative") end return x end'),
    originalAssertionCases('assert(candidate(0) == 1)\nassert(candidate(-1) == nil)\nassert(candidate(2) == 2)'));
  assert.deepEqual(throws.cases.map(item => item.status), ['fail', 'fail', 'pass']);
  assert.deepEqual(throws.cases.map(item => item.classification), ['semantic-contract', 'runtime-error', 'pass']);
});

test('offline diagnostic distinguishes format, syntax, external context and wrong module shape', async () => {
  const cases = originalAssertionCases('assert(candidate() == 1)');
  for (const [answer, classification] of [
    ['return function() end', 'format'], [fence('return function('), 'syntax'],
    [fence('return function() return missingState.value end'), 'context-dependency'],
  ]) {
    assert.equal(inspectSavedAnswer(answer).classification, classification);
    const result = await diagnoseAnswer(answer, cases, { run: () => { throw Error('must not execute'); } });
    assert.equal(result.complete, false);
    assert.ok(result.cases.every(item => item.status === 'unobserved'));
  }
  const shape = await diagnoseAnswer(fence('return {}'), cases);
  assert.equal(shape.complete, true);
  assert.equal(shape.cases[0].status, 'fail');
  assert.equal(shape.cases[0].classification, 'module-return-shape');
});

test('offline diagnostic rejects partial, duplicated or unrelated observations and stops after a failed batch', async () => {
  const cases = originalAssertionCases('assert(candidate() == 1)\nassert(candidate() == 1)');
  const response = fence('return function() return 1 end');
  for (const failure of [
    { code: 'policy', error: 'fixture refusal', blocked: ['network'] },
    { ok: false, reason: 'wall_clock', exitCode: null, run: null },
    { ok: false, reason: 'spawn_failed', exitCode: null, run: null },
    { ok: true, reason: 'exit', exitCode: 0, outputTruncated: true, run: { cases: [] } },
    { ok: true, reason: 'exit', exitCode: 0, run: { cases: [{ name: cases[0].id, status: 'pass' }] } },
    { ok: true, reason: 'exit', exitCode: 0, run: { cases: cases.map(() => ({ name: cases[0].id, status: 'pass' })) } },
    { ok: true, reason: 'exit', exitCode: 0, run: { cases: [{ name: cases[0].id, status: 'pass' }, { name: 'unrelated', status: 'pass' }] } },
  ]) {
    let calls = 0;
    const result = await diagnoseAnswer(response, cases, { run: async () => { calls++; return failure; } });
    assert.equal(calls, 1);
    assert.equal(result.complete, false);
    assert.ok(result.cases.every(item => item.status === 'unobserved'));
  }
  const many = originalAssertionCases(Array(30).fill('assert(candidate() == 1)').join('\n'));
  let batches = 0;
  const result = await diagnoseAnswer(response, many, { run: async () => {
    batches++; return { ok: false, reason: 'wall_clock', exitCode: null, run: null };
  } });
  assert.equal(batches, 1);
  assert.equal(result.cases.length, many.length);
  assert.ok(result.cases.every(item => item.status === 'unobserved'));
});

function fixture() {
  // Deliberately dummy adapter bytes. This tests evidence binding, NEVER trained-model quality.
  const root = mkdtempSync(join(tmpdir(), 'apple-worker2-diagnostic-test-'));
  const data = join(root, 'data'); const run = join(root, 'run');
  mkdirSync(data); mkdirSync(run); mkdirSync(join(run, 'adapter'));
  const entries = { train: [example('purchase-transaction')], val: [example('cooldown-clock')], test: [example('weighted-selection')] };
  const put = (directory, name, value) => writeFileSync(join(directory, name), JSON.stringify(value));
  const card = { source: 'first-party-authored-synthetic', customerData: false, digest: hash('synthetic-test-fixture-not-trained-data'),
    examples: 3, splitSizes: { train: 1, val: 1, test: 1 },
    families: Object.fromEntries(Object.entries(entries).flatMap(([split, rows]) => rows.map(entry => [entry.family, split]))) };
  put(data, 'dataset-card.json', card);
  for (const [split, rows] of Object.entries(entries)) writeFileSync(join(data, `${split}.jsonl`), rows.map(entry => JSON.stringify({
    meta: { id: entry.id, family: entry.family, origin: 'first-party-authored-synthetic', evidence: {
      sourceSha256: hash(entry.source), checksSha256: hash(entry.checks), behaviorPassed: true, mutationRejected: true } },
    messages: [{ role: 'system', content: 'unit test only' }, { role: 'user', content: entry.prompt }, { role: 'assistant', content: fence(entry.source) }],
  })).join('\n') + '\n');
  const files = ['dataset-card.json', 'train.jsonl', 'val.jsonl', 'test.jsonl'];
  const manifest = { productionPromotion: false, dataDigest: card.digest, config: { iters: 16 },
    inputHashes: Object.fromEntries(files.map(name => [name, hash(readFileSync(join(data, name)))])) };
  put(run, 'manifest.json', manifest);
  const adapter = 'not weights; offline diagnosis unit-test fixture';
  writeFileSync(join(run, 'adapter/adapters.safetensors'), adapter);
  put(run, 'completed.json', { trainingCompleted: true, productionPromotion: false, adapterSha256: hash(adapter) });
  const entry = entries.test[0];
  const response = fence(replaceOnce(entry.source, ...entry.mutation));
  for (const phase of ['before', 'after']) put(run, `${phase}-${entry.id}.json`, { id: entry.id, phase, response });
  const replay = { freshProcessReload: true, adapterSha256: hash(adapter), results: [{ id: entry.id, response, matchesInMemory: true }] };
  put(run, 'replay.json', replay);
  const paths = [...files.map(name => join(data, name)), ...['manifest.json', 'completed.json', 'replay.json', 'adapter/adapters.safetensors',
    `before-${entry.id}.json`, `after-${entry.id}.json`].map(name => join(run, name))];
  const snapshot = () => Object.fromEntries(paths.map(path => [path, hash(readFileSync(path))]));
  return { root, run, data, put, manifest, replay, snapshot, close: () => rmSync(root, { recursive: true, force: true }) };
}

test('offline diagnostic is byte-deterministic and input-preserving without network or model work', async () => {
  const f = fixture(); const previousFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = () => { calls++; throw Error('network forbidden in diagnostic'); };
  try {
    const before = f.snapshot();
    const report = await diagnosePilot(f.run, f.data);
    assert.deepEqual(await diagnosePilot(f.run, f.data), report);
    assert.deepEqual(f.snapshot(), before);
    assert.deepEqual(report.originalGate, { examples: 1, beforePassed: 0, afterPassed: 0 });
    assert.equal(report.savedReplayEvidenceMatched, true);
    assert.equal(report.inputsUnchanged, true);
    assert.equal(report.diagnosticComplete, true);
    assert.equal(report.modelReloadedNow, false);
    assert.equal(report.productionPromotion, false);
    assert.equal(report.providerSpendUsd, 0);
    assert.equal(calls, 0);
  } finally { globalThis.fetch = previousFetch; f.close(); }
});

test('offline diagnostic rejects modified evidence and rebound family leakage', async () => {
  for (const name of ['dataset-card.json', 'train.jsonl', 'val.jsonl', 'test.jsonl']) {
    const f = fixture();
    try {
      writeFileSync(join(f.data, name), readFileSync(join(f.data, name)).toString() + '\n');
      await assert.rejects(diagnosePilot(f.run, f.data), /dataset changed since training/);
    } finally { f.close(); }
  }
  for (const kind of ['adapter', 'replay', 'family']) {
    const f = fixture();
    try {
      if (kind === 'adapter') writeFileSync(join(f.run, 'adapter/adapters.safetensors'), 'changed');
      if (kind === 'replay') { f.replay.results[0].response = 'different'; f.put(f.run, 'replay.json', f.replay); }
      if (kind === 'family') {
        const row = JSON.parse(readFileSync(join(f.data, 'train.jsonl')));
        row.meta.family = 'weighted-selection'; f.put(f.data, 'train.jsonl', row);
        f.manifest.inputHashes['train.jsonl'] = hash(readFileSync(join(f.data, 'train.jsonl')));
        f.put(f.run, 'manifest.json', f.manifest);
      }
      await assert.rejects(diagnosePilot(f.run, f.data), /adapter changed|does not reproduce|family split mismatch/);
    } finally { f.close(); }
  }
});
