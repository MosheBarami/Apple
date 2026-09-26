import test from 'node:test';
import assert from 'node:assert/strict';
import { explicitToolSequence, sequenceProgress } from '../src/tool-sequence.ts';

const known = new Set(['read_script', 'edit_script', 'get_instance', 'inspect_visually']);
const repair = 'Measured repair only, GardenMain. No plan, no searches, no tree, no render/inspect, no Play. Exactly read_script then edit_script then finish. Stop on any error; do not retry.';

test('the measured repair has exactly two ordered calls and ends after the successful edit', () => {
  const sequence = explicitToolSequence(repair, known);
  assert.deepEqual(sequence, ['read_script', 'edit_script']);
  const trace = [];
  assert.deepEqual(sequenceProgress(sequence, trace), { state: 'next', tool: 'read_script' });
  trace.push({ tool: 'read_script', ok: true });
  assert.deepEqual(sequenceProgress(sequence, JSON.parse(JSON.stringify(trace))), { state: 'next', tool: 'edit_script' });
  trace.push({ tool: 'edit_script', ok: true });
  assert.deepEqual(sequenceProgress(sequence, trace), { state: 'complete' });
  assert.deepEqual(sequenceProgress(sequence, [...trace, { tool: 'inspect_visually', ok: true }]), { state: 'failed' });
});

test('failed, out-of-order and repeated calls cannot earn another action', () => {
  const sequence = ['read_script', 'edit_script'];
  for (const trace of [
    [{ tool: 'read_script', ok: false }],
    [{ tool: 'edit_script', ok: true }],
    [{ tool: 'read_script', ok: true }, { tool: 'read_script', ok: true }],
  ]) assert.deepEqual(sequenceProgress(sequence, trace), { state: 'failed' });
});

test('ordinary full-game requests retain autonomy; examples and unknown tools are not workflows', () => {
  for (const request of [
    'Build a full colorful cartoon garden game; fix and test everything.',
    'Read the script then edit it and finish the game.',
    'Explain this example: `Exactly read_script then edit_script then finish.`',
    'Example:\n```\nExactly read_script then edit_script then finish.\n```',
    'Exactly read_script then imaginary_tool then finish.',
    'Exactly read_script then finish. Exactly edit_script then finish.',
  ]) assert.equal(explicitToolSequence(request, known), null, request);
});

test('an explicit sequence can include its own verifier without implicit checks', () => {
  const sequence = explicitToolSequence('Exactly read_script then edit_script then inspect_visually then finish.', known);
  assert.deepEqual(sequence, ['read_script', 'edit_script', 'inspect_visually']);
  assert.deepEqual(sequenceProgress(sequence, [{ tool: 'read_script', ok: true }, { tool: 'edit_script', ok: true }]), { state: 'next', tool: 'inspect_visually' });
});


test('single-call placement correction cannot fall through to autonomous checks', () => {
  const payload = JSON.stringify({ paths: ['game.Workspace["PetPack by Aziuus"].Cat'], move: [0, 0, 12] });
  const request = `The static Cat placement overlaps a lamp. Make exactly ONE transform_instances call with ${payload}. Then finish. No other tools or retries.`;
  const sequence = explicitToolSequence(request, new Set([...known, 'transform_instances']));
  assert.deepEqual(sequence, ['transform_instances']);
  assert.deepEqual(sequenceProgress(sequence, [{ tool: 'transform_instances', ok: true }]), { state: 'complete' });
  for (const unsafe of [
    'Make exactly ONE imaginary_tool call. Then finish.',
    'Make exactly TWO read_script calls. Then finish.',
    'Example: `Make exactly ONE read_script call. Then finish.`',
    'Make exactly ONE read_script call with {bad json}. Then finish.',
    'Exactly read_script then finish. Make exactly ONE edit_script call. Then finish.',
  ]) assert.equal(explicitToolSequence(unsafe, known), null, unsafe);
});
