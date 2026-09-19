import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GAME_LOGIC_CURRICULUM } from './game-logic-curriculum.mjs';
import { checkCandidate, usageCost, evaluateGameLogic, EVALUATION_RESERVE_USD } from './evaluate-game-logic.mjs';
import { createSpendLedger, readSpendLedger, reserveSpend } from './spend-ledger.mjs';
const example = GAME_LOGIC_CURRICULUM[0];
const answer = '```luau\n' + example.source + '\n```';
const model = '@cf/zai-org/glm-5.3-flash';

test('model answer must pass the actual behavior checks', async () => {
  assert.equal((await checkCandidate(example, answer)).passed, true);
  assert.equal((await checkCandidate(example, answer.replace(...example.mutation))).passed, false);
  assert.equal((await checkCandidate(example, 'No code')).passed, false);
  assert.equal((await checkCandidate(example, '```luau\nreturn function() return unknownState end\n```')).passed, false);
});

test('model output is time-bounded and unsafe runtime primitives are refused', async () => {
  const runaway = await checkCandidate(example, '```luau\nwhile true do end\nreturn function() end\n```');
  assert.equal(runaway.passed, false);
  assert.equal(runaway.reason, 'wall_clock');
  const unsafe = await checkCandidate(example, '```luau\nreturn require("./secret")\n```');
  assert.equal(unsafe.passed, false);
});

test('unknown usage is never represented as an observed zero cost', () => {
  assert.equal(usageCost(null), null);
  assert.equal(usageCost({ inputTokens: 0, outputTokens: 0 }), null);
  assert.equal(usageCost({ inputTokens: -1, outputTokens: 2 }), null);
  assert.equal(usageCost({ inputTokens: 1000, outputTokens: 1000 }), 0.00065);
});

test('no live flag means no network or spending', async () => {
  let calls = 0;
  await assert.rejects(evaluateGameLogic({ fetchImpl: () => { calls++; } }), /explicit --live/);
  assert.equal(calls, 0);
});

async function fixture(run, { body, configModel = model } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'apple-baseline-test-'));
  const output = join(dir, 'results');
  const budgetPath = join(dir, 'budget.json');
  createSpendLedger(budgetPath);
  const calls = [];
  try {
    const fetchImpl = async (url, init) => {
      calls.push({ url, init });
      if (url.endsWith('/models')) return Response.json({ stone: { id: configModel } });
      assert.ok(readSpendLedger(budgetPath).allocatedUsd >= 0.005, 'reservation must exist before paid network call');
      if (body instanceof Error) throw body;
      return Response.json(body ?? { ok: true, model, text: answer, usage: { inputTokens: 100, outputTokens: 300 } });
    };
    await run({ calls, output, options: { live: true, adminKey: 'test-not-real', output, budgetPath, fetchImpl, examples: [example] } });
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

test('live preflight refuses any different routed model before inference', async () => {
  await fixture(async ({ calls, options }) => {
    await assert.rejects(evaluateGameLogic(options), /preflight/);
    assert.equal(calls.length, 1);
  }, { configModel: 'another-model' });
});

test('mock evaluation records bounded tokens, exact model and scoped result', async () => {
  await fixture(async ({ calls, output, options }) => {
    const report = await evaluateGameLogic(options);
    assert.equal(report.passed, 1);
    assert.equal(report.studioVerified, false);
    assert.ok(report.reservedUsd <= EVALUATION_RESERVE_USD);
    const request = JSON.parse(calls[1].init.body);
    assert.ok(request.maxTokens <= 1600);
    assert.equal(request.prompt, example.prompt);
    assert.equal(request.tools, false);
    assert.equal(request.rag, false);
    assert.equal(request.prompt.includes(example.checks), false);
    const record = JSON.parse(readFileSync(join(output, `${example.id}.json`), 'utf8'));
    assert.equal(record.status, 'response_received');
    assert.equal(JSON.stringify(record).includes('test-not-real'), false);
  });
});

test('uncertain request consumes reservation and stops without retry', async () => {
  await fixture(async ({ calls, options }) => {
    const report = await evaluateGameLogic({ ...options, examples: GAME_LOGIC_CURRICULUM.slice(0, 2) });
    assert.equal(calls.length, 2);
    assert.equal(report.requested, 1);
    assert.equal(report.uncertainRequests, 1);
    assert.equal(report.reservedUsd, 0.005);
    assert.equal(readSpendLedger(options.budgetPath).allocatedUsd, 0.005);
  }, { body: new Error('network disconnected') });
});

test('exhausted total budget blocks inference even with a fresh output directory', async () => {
  await fixture(async ({ calls, options }) => {
    reserveSpend(options.budgetPath, { id: 'previous-spending', usd: 20 });
    await assert.rejects(evaluateGameLogic(options), /budget exceeded/);
    assert.equal(calls.filter((call) => call.url.endsWith('/model-test')).length, 0);
  });
});

test('missing budget refuses all network requests', async () => {
  await fixture(async ({ calls, options }) => {
    await assert.rejects(evaluateGameLogic({ ...options, budgetPath: undefined }), /budget ledger/);
    assert.equal(calls.length, 0);
  });
});

test('a second evaluation cannot reset the shared total with a new output', async () => {
  await fixture(async ({ calls, output, options }) => {
    reserveSpend(options.budgetPath, { id: 'prior-training-and-serving', usd: 19.995 });
    const first = await evaluateGameLogic(options);
    assert.equal(first.totalBudget.availableUsd, 0);
    await assert.rejects(evaluateGameLogic({ ...options, output: `${output}-second-run` }), /budget exceeded/);
    assert.equal(calls.filter((call) => call.url.endsWith('/model-test')).length, 1);
    assert.equal(readSpendLedger(options.budgetPath).allocatedUsd, 20);
  });
});
