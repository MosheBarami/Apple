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
 * WHAT WAS ALREADY TRUE, and the reason this is a lock rather than a fix: all three adapters DO
 * guard. openai gates on `typeof prompt_tokens === 'number' && typeof completion_tokens === 'number'`
 * and falls back to a conservative estimate — its comment, "so unmetered calls still cost the
 * budget", is this done right. workers-ai does the same. google gates promptTokenCount and takes
 * `?? 0` for the rest.
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
const GG = await bundle('providers/google.ts', 'gg.mjs');
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

// Gemini names its fields differently, so its broken shapes are its own.
const BROKEN_GEMINI = [
  ['no usageMetadata', undefined],
  ['an empty usageMetadata', {}],
  ['promptTokenCount is null', { promptTokenCount: null }],
  ['promptTokenCount is a string', { promptTokenCount: '120' }],
  ['only a candidates count', { candidatesTokenCount: 8 }],
  ['a cached count but no prompt count', { cachedContentTokenCount: 4 }],
];

for (const [label, usageMetadata] of BROKEN_GEMINI) {
  test(`google: ${label} still yields a usable token count`, () => {
    const r = GG.decodeGemini(
      { candidates: [{ content: { parts: [{ text: TEXT }] }, finishReason: 'STOP' }], usageMetadata },
      PROMPT_CHARS, 'gemini-x');
    assertUsable(r.usage, `google/${label}`);
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

  const g = GG.decodeGemini(
    { candidates: [{ content: { parts: [{ text: TEXT }] } }],
      usageMetadata: { promptTokenCount: 321, candidatesTokenCount: 12, cachedContentTokenCount: 5 } },
    PROMPT_CHARS, 'gemini-x');
  assert.equal(g.usage.inputTokens, 321);
  assert.equal(g.usage.outputTokens, 12);
  assert.equal(g.usage.cachedInputTokens, 5);
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
