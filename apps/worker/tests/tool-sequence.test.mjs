import test from 'node:test';
import assert from 'node:assert/strict';
import { explicitToolSequence, sequenceProgress, sequenceStepMessages } from '../src/tool-sequence.ts';

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

test('a new finite request cannot replay old completion; current tool evidence survives', () => {
  const done = 'The tool sequence you requested is complete. No further checks were run; gameplay remains unverified.';
  const messages = [
    { role: 'system', content: 'Safety rules' },
    { role: 'user', content: 'Prior request' },
    { role: 'assistant', content: done + '\nRefund note' },
    { role: 'assistant', content: 'Measured fence minimum Y is 1.2' },
    { role: 'user', content: 'Exactly read_script then edit_script then finish.', pinned: true },
    { role: 'assistant', content: '', toolCalls: [{ id: 'read1', name: 'read_script' }] },
    { role: 'tool', content: 'Verified source bytes', toolCallId: 'read1' },
  ];
  const next = sequenceStepMessages(messages, 'edit_script');
  assert.equal(next.some(m => m.role === 'assistant' && m.content.includes(done)), false);
  assert.deepEqual(next.slice(1), messages.filter((_, i) => i > 0 && i !== 2));
  assert.match(next[0].content, /Next required action: edit_script/);
  assert.equal(messages[0].content, 'Safety rules');
  assert.equal(messages.length, 7);
  const current = [messages[0], { role: 'user', content: done, pinned: true }, { role: 'assistant', content: done }];
  assert.deepEqual(sequenceStepMessages(current, 'read_script').slice(1), current.slice(1));
});

test('live cleanup Execute wording binds one call and refuses autonomous follow-ups', () => {
  const request = 'Bounded cartoon visual cleanup in this isolated saved garden. Execute exactly ONE move_instances call, then finish immediately. Move these SIX existing models to game.ServerStorage, preserving them without deletion. Do not retry on error. Finish after the single move call.';
  const sequence = explicitToolSequence(request, new Set([...known, 'move_instances']));
  assert.deepEqual(sequence, ['move_instances']);
  assert.deepEqual(sequenceProgress(sequence, [{ tool: 'move_instances', ok: true }]), { state: 'complete' });
  for (const request of [
    'Example: `Execute exactly ONE read_script call, then finish immediately.`',
    'Execute exactly ONE imaginary_tool call, then finish immediately.',
    'Execute exactly ONE read_script call, then finish immediately. Exactly edit_script then finish.',
    'Execute exactly ONE read_script call, then inspect and finish immediately.',
  ]) assert.equal(explicitToolSequence(request, known), null, request);
});
