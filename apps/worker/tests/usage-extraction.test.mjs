/**
 * Every provider's token count, at the boundary where a provider's JSON becomes money.
 *
 * WHY. The spend chain this repository spent a day closing starts here. A non-numeric token count
 * becomes NaN in providers/cost.ts (`Math.max(0, inputTokens)`, no finiteness check), and every cap
 * downstream is a `>` comparison, which is FALSE for NaN — so an uncomputable cost passed the
 * gateway's per-request cap, BudgetDO's copy of it, and settled as costing nothing. Both ledgers now
 * refuse a non-finite figure (bf64b0d, 72d3fc3). This is the other end: proving no adapter can emit
 * one in the first place.
 *
 * WHAT WAS ALREADY TRUE, and the reason this is a lock rather than a fix: both decoders DO guard.
 * The OpenAI-compatible decoder (still used by the customer-key path) gates on
 * `typeof prompt_tokens === 'number' && typeof completion_tokens === 'number'` and falls back to a
 * conservative estimate — its comment, "so unmetered calls still cost the budget", is this done
 * right. workers-ai does the same, for the chat wire and for the Responses wire the GPT-5.6 models
 * speak through the same binding (D-VISION-1). The direct Google adapter is gone: Gemini now runs
 * on the binding's chat wire, which the workers-ai cases cover.
 *
 * The guards are one deleted `typeof` from not being guards, and nothing was asserting them. That
 * is what this file is: the property stated so a future simplification goes red instead of quiet.
 *
 * WHAT IS NOT CLAIMED. JSON cannot carry NaN or Infinity, so a malformed count arrives as null, a
 * string, or absent — which is exactly what the cases below send. An in-process caller CAN still
 * pass a non-number (gateway's `maxTokens` reaches the estimate through
 * `Math.min(req.maxTokens ?? cfg.maxTokens, cfg.maxTokens)`, and `??` defends undefined only). That
 * path is not an adapter's to defend and is not tested here.
 *
 * Run with:  node --test           (from apps/worker)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const WORKER = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = mkdtempSync(join(tmpdir(), 'usage-'));
const bundle = (rel, name) => {
  const out = join(dir, name);
  execFileSync(join(WORKER, 'node_modules', '.bin', 'esbuild'),
    [join(WORKER, 'src', rel), '--bundle', '--format=esm', '--target=es2022', '--outfile=' + out],
    { cwd: WORKER, stdio: 'pipe' });
  return import(`file://${out}`);
};
const OA = await bundle('providers/openai.ts', 'oa.mjs');
const WA = await bundle('providers/workers-ai.ts', 'wa.mjs');
const COST = await bundle('providers/cost.ts', 'cost.mjs');

/** A token count is only usable if arithmetic on it produces money rather than NaN. */
function assertUsable(usage, where) {
  for (const k of ['inputTokens', 'outputTokens', 'cachedInputTokens']) {
    const v = usage[k];
    assert.equal(typeof v, 'number', `${where}: ${k} is ${typeof v}, not a number`);
    assert.equal(Number.isFinite(v), true, `${where}: ${k} is ${v}, which every cap below compares with > and admits`);
    assert.equal(v >= 0, true, `${where}: ${k} is negative (${v})`);
  }
}

/** The shapes a provider actually sends when its usage block is wrong, absent or partial. */
const BROKEN_USAGE = [
  ['no usage block at all', undefined],
  ['an empty usage block', {}],
  ['usage is null', null],
  ['counts are null', { prompt_tokens: null, completion_tokens: null }],
  ['counts are strings', { prompt_tokens: '120', completion_tokens: '8' }],
  ['only the input count', { prompt_tokens: 120 }],
  ['only the output count', { completion_tokens: 8 }],
  ['counts are booleans', { prompt_tokens: true, completion_tokens: false }],
  ['a nested object where a number goes', { prompt_tokens: { n: 1 }, completion_tokens: [] }],
];

const PROMPT_CHARS = 700;
const TEXT = 'a short answer';

for (const [label, usage] of BROKEN_USAGE) {
  test(`openai: ${label} still yields a usable token count`, () => {
    const r = OA.decodeOpenAiChat(
      { choices: [{ message: { content: TEXT }, finish_reason: 'stop' }], usage },
      PROMPT_CHARS, 'gpt-x', 'openai');
    assertUsable(r.usage, `openai/${label}`);
  });

  test(`workers-ai: ${label} still yields a usable token count`, () => {
    assertUsable(WA.extractUsage({ usage }, PROMPT_CHARS, TEXT), `workers-ai/${label}`);
  });
}

// The Responses wire (GPT-5.6 Sol and Luna) names its fields differently, so its broken shapes are
// its own.
const BROKEN_RESPONSES = [
  ['input_tokens is null', { input_tokens: null, output_tokens: 8 }],
  ['input_tokens is a string', { input_tokens: '120', output_tokens: 8 }],
  ['only an output count', { output_tokens: 8 }],
  ['a cached count that is not a number', { input_tokens: 120, output_tokens: 8, input_tokens_details: { cached_tokens: '4' } }],
  ['a cached count but no input count', { input_tokens_details: { cached_tokens: 4 } }],
];

for (const [label, usage] of BROKEN_RESPONSES) {
  test(`workers-ai responses wire: ${label} still yields a usable token count`, () => {
    assertUsable(WA.extractUsage({ output: [], usage }, PROMPT_CHARS, TEXT), `responses/${label}`);
  });
}

test('CONTROL: a well-formed usage block is passed through EXACTLY, not estimated', () => {
  // Without this, an adapter that ignored the provider and always estimated would pass every case
  // above — while silently billing a figure the provider never reported.
  const r = OA.decodeOpenAiChat(
    { choices: [{ message: { content: TEXT }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 1234, completion_tokens: 56, prompt_tokens_details: { cached_tokens: 7 } } },
    PROMPT_CHARS, 'gpt-x', 'openai');
  assert.equal(r.usage.inputTokens, 1234, 'a reported input count must be used, not replaced by an estimate');
  assert.equal(r.usage.outputTokens, 56);
  assert.equal(r.usage.cachedInputTokens, 7);

  const w = WA.extractUsage({ usage: { prompt_tokens: 99, completion_tokens: 3 } }, PROMPT_CHARS, TEXT);
  assert.equal(w.inputTokens, 99);
  assert.equal(w.outputTokens, 3);

  const g = WA.extractUsage(
    { output: [], usage: { input_tokens: 321, output_tokens: 12, input_tokens_details: { cached_tokens: 5 } } },
    PROMPT_CHARS, TEXT);
  assert.equal(g.inputTokens, 321);
  assert.equal(g.outputTokens, 12);
  assert.equal(g.cachedInputTokens, 5);
});

test('CONTROL: an unmetered call is estimated as COSTING SOMETHING, never as free', () => {
  // The fallback exists so a provider that reports nothing still moves the ledger. An adapter that
  // fell back to zero would satisfy "usable" above and give away the work.
  for (const [label, usage] of [['none', undefined], ['empty', {}]]) {
    const r = OA.decodeOpenAiChat(
      { choices: [{ message: { content: TEXT }, finish_reason: 'stop' }], usage },
      PROMPT_CHARS, 'gpt-x', 'openai');
    assert.ok(r.usage.inputTokens > 0, `openai/${label}: an unmetered call must still cost input tokens`);
    assert.ok(r.usage.outputTokens > 0, `openai/${label}: and output tokens`);
    const w = WA.extractUsage({ usage }, PROMPT_CHARS, TEXT);
    assert.ok(w.inputTokens > 0 && w.outputTokens > 0, `workers-ai/${label}: must still cost something`);
  }
});

test('the cost of every usage an adapter can produce is a real number', () => {
  // The end of the chain: whatever the adapters emit must price to money, not to NaN.
  const model = { provider: 'openai', id: 'gpt-x', inputCostPer1M: 150, outputCostPer1M: 600 };
  for (const [label, usage] of BROKEN_USAGE) {
    const r = OA.decodeOpenAiChat(
      { choices: [{ message: { content: TEXT }, finish_reason: 'stop' }], usage },
      PROMPT_CHARS, 'gpt-x', 'openai');
    const n = COST.neuronsForModelTokens(model, r.usage.inputTokens, r.usage.outputTokens, r.usage.cachedInputTokens);
    assert.equal(Number.isFinite(n), true, `${label}: priced to ${n}, and every cap downstream admits that`);
    assert.ok(n >= 0, `${label}: priced to a negative (${n})`);
  }
});
