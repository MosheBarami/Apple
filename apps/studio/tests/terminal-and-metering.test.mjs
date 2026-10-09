import test from 'node:test';
import assert from 'node:assert/strict';
import { stopNote, terminalReason } from '../src/terminal.ts';
import { meteredAi, releaseAll, settleNext } from '../src/metering.ts';

test('every way a turn can end has a reason; only a plain finish is silent', () => {
  assert.equal(terminalReason('stop', 3, 60), 'completed');
  assert.equal(terminalReason('tool-calls', 60, 60), 'step_limit', 'the island run: 60 steps, still calling tools');
  assert.equal(terminalReason('length', 4, 60), 'output_limit');
  assert.equal(terminalReason('content-filter', 1, 60), 'content_filter');
  assert.equal(terminalReason('error', 9, 60), 'provider_error');
  assert.equal(terminalReason('tool-calls', 12, 60), 'incomplete');
  assert.equal(terminalReason(undefined, 0, 60), 'incomplete');
  assert.equal(stopNote('completed', 3), null);
  for (const r of ['step_limit', 'output_limit', 'content_filter', 'provider_error', 'incomplete']) {
    assert.ok(stopNote(r, 60)?.length > 20, r);
  }
  assert.match(stopNote('step_limit', 60), /60 steps.*continue/s);
});

function gate() {
  const calls = [];
  return {
    calls,
    env: {
      GATE: {
        reserveModel: async () => ({ ok: true, reserved: 1000 }),
        settleModel: async (model, reserved, usage) => { calls.push({ op: 'settle', model, reserved, usage }); },
        releaseModel: async (model, reserved) => { calls.push({ op: 'release', model, reserved }); },
      },
      AI: { run: async (model, inputs) => (inputs.stream ? { stream: true } : { usage: { prompt_tokens: 900, completion_tokens: 50, prompt_tokens_details: { cached_tokens: 800 } } }) },
    },
  };
}

test('a non-streamed call settles with its cached input, so the shared budget sees the cached rate', async () => {
  const g = gate();
  await meteredAi(g.env).run('m', { messages: [] });
  assert.deepEqual(g.calls, [{ op: 'settle', model: 'm', reserved: 1000, usage: { inputTokens: 900, outputTokens: 50, cachedInputTokens: 800 } }]);
});

test('a streamed call is settled later at its real usage (cached included), against the model it was reserved for', async () => {
  const g = gate();
  const holds = { pending: [] };
  const ai = meteredAi(g.env, holds);
  await ai.run('main-model', { stream: true });
  await ai.run('fallback-model', { stream: true });
  await settleNext(g.env, holds, { inputTokens: 100, outputTokens: 10, cachedInputTokens: 90 });
  await releaseAll(g.env, holds);
  assert.deepEqual(g.calls, [
    { op: 'settle', model: 'main-model', reserved: 1000, usage: { inputTokens: 100, outputTokens: 10, cachedInputTokens: 90 } },
    { op: 'release', model: 'fallback-model', reserved: 1000 },
  ]);
});

test('a turn that ends on a UI check with defects still open says so (admin panel, 2026-10-09)', async () => {
  const { openUiDefects } = await import('../src/terminal.ts');
  const check = (verdict, n) => JSON.stringify({ screen: 's', verdict, defects: Array.from({ length: n }, () => ({ kind: 'overflows_parent' })) });
  const steps = [
    { toolResults: [{ toolName: 'build_ui', output: { built: 's', layout: { verdict: 'defects', defects: [{}, {}, {}] } } }] },
    { toolResults: [{ toolName: 'check_ui', output: check('defects', 2) }] },
    { toolResults: [{ toolName: 'set_properties', output: '{"set":["ClipsDescendants"]}' }] },
  ];
  assert.equal(openUiDefects(steps), 2, 'the latest measurement counts; an unmeasured fix does not clear it');
  assert.equal(openUiDefects([...steps, { toolResults: [{ toolName: 'check_ui', output: check('pass', 0) }] }]), 0);
  assert.equal(openUiDefects(steps.slice(0, 1)), 3, 'build_ui reports its layout');
  assert.equal(openUiDefects([]), 0);
  assert.equal(terminalReason('stop', 29, 60, 2), 'open_defects');
  assert.match(stopNote('open_defects', 29, 2), /2 layout defects/);
});

test('a stopped turn has its own reason and note', () => {
  assert.match(stopNote('cancelled', 7), /Stopped after 7 steps.*discarded/s);
});
