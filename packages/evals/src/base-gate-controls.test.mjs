import test from 'node:test';
import assert from 'node:assert/strict';
import { callModel, TransportError } from './transport.mjs';
import { APPLE_MAX_BASE_GATE, evaluateBaseGate, parseArgs, runJob, sourceHashes, validateBaseGateConfig } from './run.mjs';
import { loadTasks, TASKS_DIR } from './tasks.mjs';
import { readdirSync } from 'node:fs';

const TASK = {
  id: 'base-gate-control',
  category: 'debugging',
  prompt: 'Return the word complete.',
  system: 'Be exact.',
  checks: [{ type: 'contains', target: 'text', value: 'complete' }],
};

test('transport sends the registered maxTokens and retains the provider finish reason', async () => {
  let request;
  const result = await callModel({
    apiBase: 'https://worker.example',
    adminKey: 'redacted-test-key',
    model: 'appleMaxBase',
    prompt: 'task',
    system: 'system',
    maxTokens: 2400,
    fetchImpl: async (url, init) => {
      request = { url, init, body: JSON.parse(init.body) };
      return {
        ok: true,
        status: 200,
        json: async () => ({
          ok: true,
          text: 'partial',
          model: '@cf/qwen/qwen2.5-coder-32b-instruct',
          finishReason: 'length',
          usage: { inputTokens: 17, outputTokens: 2400 },
          neurons: 221,
        }),
      };
    },
  });

  assert.equal(request.url, 'https://worker.example/api/admin/model-test');
  assert.equal(request.body.maxTokens, 2400);
  assert.equal(request.body.prompt, 'system\n\n---\n\ntask');
  assert.equal(result.finishReason, 'length');
  assert.equal(result.modelId, '@cf/qwen/qwen2.5-coder-32b-instruct');
  assert.deepEqual(result.usage, { inputTokens: 17, outputTokens: 2400 });
  assert.equal(result.neurons, 221);
});

test('transport keeps the existing endpoint default when maxTokens is omitted', async () => {
  let payload;
  await callModel({
    apiBase: 'https://worker.example/',
    adminKey: 'redacted-test-key',
    model: 'clay',
    prompt: 'task',
    fetchImpl: async (_url, init) => {
      payload = JSON.parse(init.body);
      return { ok: true, status: 200, json: async () => ({ ok: true, text: 'done' }) };
    },
  });
  assert.equal(Object.hasOwn(payload, 'maxTokens'), false);
});

test('transport refuses an invalid maxTokens value before any request', async () => {
  let calls = 0;
  await assert.rejects(
    callModel({
      apiBase: 'https://worker.example',
      adminKey: 'redacted-test-key',
      model: 'clay',
      prompt: 'task',
      maxTokens: 0,
      fetchImpl: async () => {
        calls += 1;
      },
    }),
    /positive integer/,
  );
  assert.equal(calls, 0);
});

test('bounded CLI controls opt into 2,400 tokens and one attempt without changing defaults', () => {
  const normal = parseArgs([]);
  assert.equal(normal.maxTokens, null);
  assert.equal(normal.attempts, 2);

  const bounded = parseArgs(['--models', 'appleMaxBase', '--max-tokens', '2400', '--one-attempt', '--base-gate']);
  assert.deepEqual(bounded.models, ['appleMaxBase']);
  assert.equal(bounded.maxTokens, 2400);
  assert.equal(bounded.attempts, 1);
  assert.equal(bounded.baseGate, true);
  assert.throws(() => parseArgs(['--max-tokens', '2.5']), /positive integer/);
});

test('base-gate preflight binds the complete current task bundle and refuses drift', () => {
  const { tasks, errors } = loadTasks();
  assert.deepEqual(errors, []);
  const cfg = parseArgs(['--models', 'appleMaxBase', '--max-tokens', '2400', '--one-attempt', '--base-gate']);
  assert.deepEqual(validateBaseGateConfig(cfg, tasks), []);
  assert.match(
    validateBaseGateConfig({ ...cfg, rag: true }, tasks).join('\n'),
    /--rag is forbidden/,
  );
  // Drift is forged where the digest is actually computed from -- the per-file hashes. Overriding
  // the top-level taskBundleSha256 used to be the injection point; once the gate started hashing
  // its own frozen subset, that override changed an input nothing read, and the forgery passed.
  const real = sourceHashes();
  const tampered = { ...real, taskFiles: { ...real.taskFiles, 'debugging.json': '0'.repeat(64) } };
  assert.match(validateBaseGateConfig(cfg, tasks, tampered).join('\n'), /task bundle changed/);

  // A task file the gate names and that is no longer on disk must refuse, not hash around it.
  const missing = { ...real, taskFiles: { ...real.taskFiles } };
  delete missing.taskFiles['door-mechanic.json'];
  assert.match(validateBaseGateConfig(cfg, tasks, missing).join('\n'), /missing from/);

  // And a file the gate does NOT name may appear or change without refusing the frozen run.
  const grown = { ...real, taskFiles: { ...real.taskFiles, 'a-new-category.json': '1'.repeat(64) } };
  assert.deepEqual(validateBaseGateConfig(cfg, tasks, grown), []);
});

test('a length finish is retained, charged, and excluded from grading without a retry', async () => {
  let calls = 0;
  const record = await runJob(
    { model: 'appleMaxBase', task: TASK },
    { rag: false, apiBase: 'https://worker.example', adminKey: 'redacted', maxTokens: 2400, attempts: 2 },
    {
      callModelImpl: async (request) => {
        calls += 1;
        assert.equal(request.maxTokens, 2400);
        return {
          text: 'complete',
          modelId: '@cf/qwen/qwen2.5-coder-32b-instruct',
          finishReason: 'length',
          usage: { inputTokens: 31, outputTokens: 2400 },
          neurons: 224,
          ms: 91,
          toolCalls: null,
        };
      },
      sleep: async () => assert.fail('a billed truncated response must never be retried'),
    },
  );

  assert.equal(calls, 1);
  assert.equal(record.ok, true);
  assert.equal(record.complete, false);
  assert.equal(record.truncated, true);
  assert.equal(record.finishReason, 'length');
  assert.equal(record.score, null, 'the answer contains the passing word but must not be graded');
  assert.equal(record.scored, false);
  assert.equal(record.ungradedReason, 'truncated');
  assert.deepEqual(record.usage, { inputTokens: 31, outputTokens: 2400 });
  assert.equal(record.neurons, 224);
  assert.equal(record.attempts, 1);
});

test('one-attempt mode suppresses the runner retry on a retryable transport failure', async () => {
  let calls = 0;
  const record = await runJob(
    { model: 'appleMaxBase', task: TASK },
    { rag: false, apiBase: 'https://worker.example', adminKey: 'redacted', maxTokens: 2400, attempts: 1 },
    {
      callModelImpl: async () => {
        calls += 1;
        throw new TransportError('temporary upstream failure', { retryable: true });
      },
      sleep: async () => assert.fail('one-attempt mode must not sleep for a retry'),
    },
  );
  assert.equal(calls, 1);
  assert.equal(record.ok, false);
  assert.equal(record.attempts, 1);
  assert.equal(record.score, null);
});

test('the default runner remains compatible with one retry', async () => {
  let calls = 0;
  const waits = [];
  const record = await runJob(
    { model: 'clay', task: TASK },
    { rag: false, apiBase: 'https://worker.example', adminKey: 'redacted', maxTokens: null },
    {
      callModelImpl: async () => {
        calls += 1;
        if (calls === 1) throw new TransportError('temporary upstream failure', { retryable: true });
        return { text: 'complete', modelId: 'model', finishReason: 'stop', usage: null, neurons: 1, ms: 1, toolCalls: null };
      },
      sleep: async (ms) => waits.push(ms),
    },
  );
  assert.equal(calls, 2);
  assert.deepEqual(waits, [1500]);
  assert.equal(record.ok, true);
  assert.equal(record.score, 1);
  assert.equal(record.attempts, 2);
  assert.equal(record.finishReason, 'stop');
});

test('result fingerprints retain every task file and the runner sources', () => {
  const hashes = sourceHashes();
  // Compared against the directory, not a literal: the property is "every task file", and a
  // pinned 13 went red the moment the suite grew by one file that the provenance record had
  // correctly picked up. The literal measured the suite's size; this measures the coverage.
  const onDisk = readdirSync(TASKS_DIR).filter((name) => name.endsWith('.json')).sort();
  assert.ok(onDisk.length >= 13, `expected the task directory to be populated, saw ${onDisk.length}`);
  assert.deepEqual(Object.keys(hashes.taskFiles).sort(), onDisk);
  for (const value of [
    hashes.taskBundleSha256,
    hashes.runnerSha256,
    hashes.transportSha256,
    hashes.graderSha256,
    hashes.metricsSha256,
    ...Object.values(hashes.taskFiles),
  ]) {
    assert.match(value, /^[a-f0-9]{64}$/);
  }
});

function passingGateRecords() {
  const categories = ['scripting-security', 'scripting-persistence', 'scripting-systems', 'scripting-gameplay'];
  return Array.from({ length: APPLE_MAX_BASE_GATE.taskCount }, (_, index) => ({
    taskId: `task-${index}`,
    category: categories[index % categories.length],
    model: APPLE_MAX_BASE_GATE.modelKey,
    modelId: APPLE_MAX_BASE_GATE.modelId,
    ok: true,
    complete: true,
    truncated: false,
    attempts: 1,
    scored: true,
    score: 1,
    taskWeight: 1,
    finishReason: 'stop',
    usage: { inputTokens: 10, outputTokens: 10 },
    neurons: 2,
    checks: index === 0
      ? [
          { type: 'luau_syntax', passed: true },
          { type: 'no_antipattern', passed: true },
        ]
      : [],
  }));
}

test('the preregistered gate passes only a complete first-attempt measured result', () => {
  const pass = evaluateBaseGate(passingGateRecords());
  assert.equal(pass.passed, true);
  assert.equal(pass.foundationEligibilityOnly, true);

  const truncated = passingGateRecords();
  truncated[7] = { ...truncated[7], finishReason: 'length', complete: false, truncated: true, scored: false, score: null };
  const rejected = evaluateBaseGate(truncated);
  assert.equal(rejected.passed, false);
  assert.equal(rejected.criteria.find((criterion) => criterion.id === 'no_truncation').passed, false);
  assert.equal(rejected.criteria.find((criterion) => criterion.id === 'complete_first_attempt_expected_model').passed, false);
  assert.equal(rejected.criteria.find((criterion) => criterion.id === 'usage_and_complete_denominator').passed, false);
});
