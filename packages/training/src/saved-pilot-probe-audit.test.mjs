import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { ALL_GAME_LOGIC_CURRICULUM } from './build-game-logic.mjs';
import { diagnosisCasesFor } from './local-pilot-diagnosis-cases.mjs';
import { probeCandidate, auditSavedPilot, stableProbeResult } from './saved-pilot-probe-audit.mjs';

const hash = value => createHash('sha256').update(value).digest('hex');
const fence = source => '```luau\n' + source + '\n```';
const weighted = ALL_GAME_LOGIC_CURRICULUM.find(e => e.id === 'weighted-selection');
const team = ALL_GAME_LOGIC_CURRICULUM.find(e => e.id === 'team-balance');
const byCase = (result, id) => result.probes.results.find(row => row.id === id);
function replaceOnce(source, before, after) {
  assert.equal(source.split(before).length, 2, 'mutation must target exactly one site');
  return source.replace(before, after);
}

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'apple-probe-audit-test-'));
  const run = join(root, 'run'), data = join(root, 'data');
  mkdirSync(run); mkdirSync(data); mkdirSync(join(run, 'adapter'));
  const write = (directory, name, value) => writeFileSync(join(directory, name), JSON.stringify(value) + '\n');
  const splits = { train: [ALL_GAME_LOGIC_CURRICULUM[0]], val: [ALL_GAME_LOGIC_CURRICULUM[1]], test: [weighted, team] };
  const families = {};
  for (const [split, examples] of Object.entries(splits)) {
    const rows = examples.map(e => {
      families[e.family] = split;
      return { messages: [{role: 'system', content: 'Synthetic test fixture only'},
        {role: 'user', content: e.prompt}, {role: 'assistant', content: fence(e.source)}],
      meta: {id: e.id, family: e.family, origin: 'first-party-authored-synthetic', evidence: {
        sourceSha256: hash(e.source), checksSha256: hash(e.checks), behaviorPassed: true,
        mutationRejected: true, studioVerified: false,
      }} };
    });
    writeFileSync(join(data, `${split}.jsonl`), rows.map(row => JSON.stringify(row)).join('\n') + '\n');
  }
  const card = {schema: 'apple-game-logic-seeds-v1', examples: 4, splitSizes: {train: 1, val: 1, test: 2}, families,
    digest: hash('fixture dataset identity; not an actual training run'), customerData: false, source: 'first-party-authored-synthetic'};
  write(data, 'dataset-card.json', card);
  const manifest = {config: {iters: 16}, dataDigest: card.digest, productionPromotion: false, inputHashes: {}};
  const refreshHashes = () => {
    for (const name of ['train.jsonl', 'val.jsonl', 'test.jsonl', 'dataset-card.json']) manifest.inputHashes[name] = hash(readFileSync(join(data, name)));
    write(run, 'manifest.json', manifest);
  };
  refreshHashes();
  const adapter = Buffer.from('TEST FIXTURE ONLY: not model weights');
  writeFileSync(join(run, 'adapter', 'adapters.safetensors'), adapter);
  const completed = {trainingCompleted: true, productionPromotion: false, adapterSha256: hash(adapter), adapterBytes: adapter.length};
  write(run, 'completed.json', completed);
  const replay = {freshProcessReload: true, productionPromotion: false, adapterSha256: completed.adapterSha256, results: []};
  for (const e of splits.test) {
    const response = fence('return function() return nil end');
    for (const phase of ['before', 'after']) write(run, `${phase}-${e.id}.json`, {id: e.id, phase, response});
    replay.results.push({id: e.id, response, matchesInMemory: true});
  }
  write(run, 'replay.json', replay);
  return { root, run, data, write, manifest, card, replay, refreshHashes,
    close: () => rmSync(root, {recursive: true, force: true}) };
}

function snapshot(root, prefix = '') {
  const values = {};
  for (const entry of readdirSync(join(root, prefix), {withFileTypes: true}).sort((a, b) => a.name.localeCompare(b.name))) {
    const path = join(prefix, entry.name);
    if (entry.isDirectory()) Object.assign(values, snapshot(root, path));
    else values[path] = hash(readFileSync(join(root, path)));
  }
  return values;
}

test('reviewed reference modules pass every independent fresh-case probe', async () => {
  for (const e of [weighted, team]) {
    const result = await probeCandidate(e, fence(e.source));
    assert.equal(result.original.passed, true);
    assert.equal(result.probes.planned, diagnosisCasesFor(e.id).length);
    assert.ok(result.probes.planned > 20);
    assert.equal(result.probes.executed, result.probes.planned);
    assert.equal(result.probes.passed, result.probes.planned, JSON.stringify(result.probes.results.filter(r => !r.passed)));
    assert.equal(result.probes.notRun, 0);
  }
});

test('integer-only weight mutant passes old contract but fails valid fractional-weight probe', async () => {
  const narrowed = replaceOnce(weighted.source, 'local weight = weights[i]',
    'local weight = weights[i]\n        if type(weight) == "number" and weight % 1 ~= 0 then return nil end');
  const result = await probeCandidate(weighted, fence(narrowed));
  assert.equal(result.original.passed, true, 'historical contract misses fractional weights');
  assert.equal(byCase(result, 'fractional-weights').classification, 'wrong-result');
  assert.equal(byCase(result, 'fractional-weights').observed, 'nil');
  assert.equal(byCase(result, 'fractional-weights').expected, 1);
});

test('fractional-capacity mutant passes old contract but fails the new integer-domain probe', async () => {
  const relaxed = replaceOnce(team.source, 'not integer(capacity)', 'type(capacity) ~= "number"');
  const result = await probeCandidate(team, fence(relaxed));
  assert.equal(result.original.passed, true, 'historical contract misses fractional capacity');
  assert.equal(byCase(result, 'fractional-capacity').classification, 'wrong-result');
  assert.equal(byCase(result, 'fractional-capacity').observed, '1');
  assert.equal(byCase(result, 'unsafe-capacity').passed, false);
});

test('first boundary failure does not hide a later invalid-total regression', async () => {
  let source = replaceOnce(weighted.source, 'if ticket < cumulative then return i end', 'if ticket <= cumulative then return i end');
  source = replaceOnce(source, 'ticket >= total', 'ticket > total');
  const result = await probeCandidate(weighted, fence(source));
  assert.equal(result.original.classification, 'assertion-failure');
  assert.equal(result.original.location.statement, 'assert(candidate(weights, 1) == 2)');
  assert.equal(byCase(result, 'first-boundary').passed, false);
  assert.equal(byCase(result, 'ticket-at-total').passed, false);
  assert.equal(byCase(result, 'input-preserved').passed, true);
});

test('runtime exception is distinguished from wrong return and cannot suppress following cases', async () => {
  const source = replaceOnce(weighted.source, 'return function(weights, ticket)',
    'return function(weights, ticket)\n    if type(weights) == "number" then error("injected type error") end');
  const result = await probeCandidate(weighted, fence(source));
  assert.equal(result.original.passed, true);
  assert.equal(byCase(result, 'number-array').classification, 'runtime-error');
  assert.equal(byCase(result, 'number-array').location.section, 'source');
  assert.equal(byCase(result, 'sparse-array').passed, true);
  assert.equal(byCase(result, 'input-preserved').passed, true);
});

test('format, unresolved context and absent executor are unobserved, never semantic passes', async () => {
  for (const [response, classification] of [
    ['plain prose', 'output-format'],
    ['```luau\nreturn function() return absentState.value end\n```', 'source-or-context'],
  ]) {
    const result = await probeCandidate(weighted, response);
    assert.equal(result.original.classification, classification);
    assert.equal(result.probes.executed, 0);
    assert.equal(result.probes.notRun, result.probes.planned);
    assert.ok(result.probes.results.every(r => r.passed === null));
  }
  let calls = 0;
  const unavailable = await probeCandidate(weighted, fence(weighted.source), {check: async () => {
    calls++; return {passed: false, reason: 'spawn_failed', exitCode: null};
  }});
  assert.equal(calls, 1);
  assert.equal(unavailable.probes.executed, 0);
  assert.equal(unavailable.original.classification, 'execution-unobserved-or-limited');
});

test('resource ceiling stops further execution rather than multiplying failed attempts', async () => {
  let calls = 0;
  const result = await probeCandidate(weighted, fence(weighted.source), {check: async () => {
    calls++;
    return calls === 1 ? {passed: true, reason: 'exit', exitCode: 0} : {passed: false, reason: 'wall_clock', exitCode: null};
  }});
  assert.equal(calls, 2);
  assert.equal(result.probes.executed, 1);
  assert.equal(result.probes.notRun, result.probes.planned - 1);
});

test('stable evidence removes temporary paths and timing but retains failing check and exit', () => {
  const first = {passed: false, reason: 'exit', exitCode: 1, durationMs: 5,
    stderr: '/tmp/apple-sandbox-ABC/program.luau:4: assertion failed!\nstacktrace:\n/tmp/apple-sandbox-ABC/program.luau:4\n'};
  const second = {...first, durationMs: 17, stderr: first.stderr.replaceAll('/tmp/apple-sandbox-ABC', '/var/folders/xyz/T/apple-sandbox-DEF')};
  const a = stableProbeResult(first, 'return function() end', 'assert(false)');
  assert.deepEqual(a, stableProbeResult(second, 'return function() end', 'assert(false)'));
  assert.equal(a.location.statement, 'assert(false)');
  assert.equal(a.exitCode, 1);
  assert.doesNotMatch(JSON.stringify(a), /durationMs|apple-sandbox-/);
});

test('saved-output audit is deterministic, read-only and offline, with no promotion from successful processing', async () => {
  const f = fixture();
  const oldFetch = globalThis.fetch;
  let networkCalls = 0;
  globalThis.fetch = () => { networkCalls++; throw new Error('network forbidden in audit'); };
  try {
    const before = snapshot(f.root);
    const first = await auditSavedPilot(f.run, f.data);
    assert.deepEqual(await auditSavedPilot(f.run, f.data), first);
    assert.deepEqual(snapshot(f.root), before, 'no input changes or added report files');
    assert.deepEqual(first.original, {examples: 2, beforePassed: 0, afterPassed: 0});
    assert.equal(first.artifact.recordedFreshProcessReplayVerified, true);
    assert.equal(first.artifact.weightsReloadedNow, false);
    assert.equal(first.productionPromotion, false);
    assert.equal(first.trainingStarted, false);
    assert.equal(first.studioVerified, false);
    assert.equal(first.providerSpendUsd, 0);
    assert.equal(networkCalls, 0);
  } finally { globalThis.fetch = oldFetch; f.close(); }
});

test('all dataset inputs and adapter bytes remain hash-bound to the recorded run', async () => {
  for (const name of ['train.jsonl', 'val.jsonl', 'test.jsonl', 'dataset-card.json', 'adapter/adapters.safetensors']) {
    const f = fixture();
    try {
      const path = join(name.startsWith('adapter/') ? f.run : f.data, name);
      writeFileSync(path, Buffer.concat([readFileSync(path), Buffer.from('\n')]));
      await assert.rejects(auditSavedPilot(f.run, f.data), /changed since/);
    } finally { f.close(); }
  }
});

test('family split drift is refused even after file hashes are refreshed', async () => {
  const f = fixture();
  try {
    f.card.families['team-balance'] = 'train';
    f.write(f.data, 'dataset-card.json', f.card); f.refreshHashes();
    await assert.rejects(auditSavedPilot(f.run, f.data), /semantic family leaks/);
  } finally { f.close(); }
});

test('recorded replay must contain identical responses, not just matchesInMemory=true', async () => {
  const f = fixture();
  try {
    f.replay.results[0].response = fence(weighted.source);
    f.replay.results[0].matchesInMemory = true;
    f.write(f.run, 'replay.json', f.replay);
    await assert.rejects(auditSavedPilot(f.run, f.data), /does not reproduce/);
  } finally { f.close(); }
});

test('wrong identity, missing artifacts and oversized input files refuse the audit', async () => {
  for (const fault of ['identity', 'missing', 'oversized']) {
    const f = fixture();
    try {
      if (fault === 'identity') f.write(f.run, 'before-weighted-selection.json', {id: 'team-balance', phase: 'before', response: fence(weighted.source)});
      if (fault === 'missing') rmSync(join(f.run, 'after-team-balance.json'));
      if (fault === 'oversized') writeFileSync(join(f.run, 'before-weighted-selection.json'), ' '.repeat(1024 * 1024 + 1));
      await assert.rejects(auditSavedPilot(f.run, f.data), /mismatched|ENOENT|bounded file/);
    } finally { f.close(); }
  }
});

test('unsupported families and excessive response size cannot be silently omitted', async () => {
  assert.throws(() => diagnosisCasesFor('ui-viewport-window'), /no reviewed diagnostic/);
  await assert.rejects(probeCandidate(weighted, 'a'.repeat(32_001)), /bounded string/);
});

test('CLI takes only explicit local artifact paths, without network or training flags', () => {
  const cli = new URL('./saved-pilot-probe-audit.mjs', import.meta.url);
  for (const args of [[], ['--live', 'ignored'], ['a', 'b', '--run']]) {
    const result = spawnSync(process.execPath, [cli.pathname, ...args], {encoding: 'utf8', timeout: 10_000});
    assert.equal(result.error, undefined);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /usage: saved-pilot-probe-audit/);
  }
});
