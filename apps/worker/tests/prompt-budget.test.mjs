// The transcript budget is DERIVED from the model a step is sent to — its per-step reservation cap,
// its context window and the run-state storage limit — never a hand-written constant. Gauntlet
// round 4 (2026-09-23) ran Apple MAX (a 1.3M-token model) at a 60,000-char budget: 23 turn groups
// dropped, and the model re-read its own work and lost its plan.
//
// The properties, each measured against the production functions rather than a spelling:
//   - a full step at the budget is ADMITTED by the same estimator and cap the gateway applies;
//   - the budget follows the window: a small-window model gets a window-bound budget, a large one
//     is bound by something else, and more window never means less budget;
//   - it never exceeds what the run state can persist, and the trim target sits below the ceiling.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as esbuild from 'esbuild';
import { mkdtempSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const WORKER = join(dirname(fileURLToPath(import.meta.url)), '..');
const TMP = mkdtempSync(join(tmpdir(), 'prompt-budget-'));
const OUT = join(TMP, 'b.mjs');
const ENTRY = join(TMP, 'entry.ts');
import { writeFileSync } from 'node:fs';
writeFileSync(ENTRY, `
export * from ${JSON.stringify(join(WORKER, 'src/prompt-budget.ts'))};
export { DEFAULT_MODELS } from ${JSON.stringify(join(WORKER, 'src/gateway.ts'))};
export { estimateNeuronsForModel } from ${JSON.stringify(join(WORKER, 'src/providers/cost.ts'))};
export { modelById } from ${JSON.stringify(join(WORKER, 'src/providers/registry.ts'))};
export { maxNeuronsPerStepFor } from ${JSON.stringify(join(WORKER, 'src/pricing.ts'))};
`);
await esbuild.build({ entryPoints: [ENTRY], bundle: true, format: 'esm', target: 'es2022', outfile: OUT, logLevel: 'silent',
  alias: { 'cloudflare:workers': join(WORKER, 'tests', 'stubs', 'cloudflare-workers.mjs') } });
const B = await import(pathToFileURL(OUT).href);
test.after(() => rmSync(TMP, { recursive: true, force: true }));

const TOOLS_CHARS = 70_000; // the order of the full tool-definition payload
const agent = B.DEFAULT_MODELS.agent;

test('a full Apple MAX step at the budget is admitted by the gateway\'s own estimate and cap', () => {
  const b = B.promptBudgetForKey('agent', TOOLS_CHARS);
  const priced = B.modelById(agent.id);
  assert.ok(priced, 'the agent model is priced in the catalogue');
  const estimate = B.estimateNeuronsForModel(priced, b.maxChars + TOOLS_CHARS, agent.maxTokens);
  assert.ok(estimate <= B.maxNeuronsPerStepFor(agent.id), `estimate ${estimate} over the per-step cap`);
});

test('the Apple MAX budget uses the room the gate allows, not a window-blind constant', () => {
  const b = B.promptBudgetForKey('agent', TOOLS_CHARS);
  // Round 4 was cut at 60,000 while the gate would have admitted about twice that.
  assert.ok(b.maxChars > 60_000, `budget ${b.maxChars}`);
  const priced = B.modelById(agent.id);
  const used = B.estimateNeuronsForModel(priced, b.maxChars + TOOLS_CHARS, agent.maxTokens) / B.maxNeuronsPerStepFor(agent.id);
  assert.ok(used >= B.BUDGET_MARGIN - 0.02, `only ${used.toFixed(2)} of the admissible step is used`);
});

test('the budget follows the context window', () => {
  const small = B.promptBudget({ id: agent.id, maxTokens: agent.maxTokens, ctx: 64_000 }, TOOLS_CHARS);
  assert.equal(small.limitedBy, 'context');
  assert.ok(small.maxChars + TOOLS_CHARS <= (64_000 - agent.maxTokens) * B.WINDOW_CHARS_PER_TOKEN);
  let prev = 0;
  for (const ctx of [40_000, 64_000, 128_000, 1_310_720]) {
    const b = B.promptBudget({ id: agent.id, maxTokens: agent.maxTokens, ctx }, TOOLS_CHARS);
    assert.ok(b.maxChars >= prev, `ctx ${ctx}: ${b.maxChars} < ${prev}`);
    prev = b.maxChars;
  }
});

test('never more than the run state can persist, and the trim target sits below the ceiling', () => {
  for (const key of Object.keys(B.DEFAULT_MODELS)) {
    const b = B.promptBudgetForKey(key, TOOLS_CHARS);
    assert.ok(b.maxChars <= B.PERSISTED_TRANSCRIPT_MAX_CHARS, key);
    assert.ok(b.targetChars < b.maxChars && b.targetChars > 0, key);
  }
});
