// The transcript that leaves this worker never claims a tool call that nothing answered.
//
// THE DEFECT, MEASURED. `do/session.ts` records the assistant turn with EVERY tool call the model
// emitted and then executes `res.toolCalls.slice(0, 4)`. A turn of five calls leaves the fifth with
// no `tool` message answering it, and `encodeOpenAiChat` renders `m.toolCalls` verbatim, so the
// unanswered call reaches the provider. Nothing throws; the model is simply shown a call it made,
// with no result, forever — the shape that makes an agent repeat work or narrate a result it never
// received.
//
// WHAT THIS FILE GUARDS, AND WHAT IT DOES NOT. It guards `apps/worker/src/transcript.ts`: whatever
// the loop records, the transcript this module hands on is well formed. It does NOT guard the loop
// itself — a run should not discard the model's fifth call at all, and that fix is
// docs/backlog/HANDOFF-SESSION-AGENT-LOOP.md §A, in a file another lane holds. If §A ever lands
// these tests keep passing and simply stop being load-bearing, which is the right end state for a
// guard, not a reason to delete it.
//
// THE ASSERTION IS ON THE WIRE PAYLOAD, not on a helper in the module under test. `unansweredToolCalls`
// lives in the same file as the repair, so a test that only consulted it would be asking the patient
// to take their own temperature. `encodeOpenAiChat` is the real encoder on the real path.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

import { trimTranscript, answerOnlyWhatRan } from '../src/transcript.ts';

// The encoder is bundled with the worker's own esbuild rather than imported as source, because it
// imports `./types` without an extension and node's type stripping cannot resolve that. Same
// mechanism as apps/worker/tests/usage-extraction.test.mjs, and it has the same virtue: what runs
// here is the production module, built the production way.
const WORKER = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = mkdtempSync(join(tmpdir(), 'answered-'));
const out = join(dir, 'oa.mjs');
execFileSync(join(WORKER, 'node_modules', '.bin', 'esbuild'),
  [join(WORKER, 'src/providers/openai.ts'), '--bundle', '--format=esm', '--target=es2022', '--outfile=' + out],
  { cwd: WORKER, stdio: 'pipe' });
const { encodeOpenAiChat } = await import(`file://${out}`);

const HUGE = 1_000_000;
const sys = { role: 'system', content: 'S'.repeat(200) };
const request = { role: 'user', content: 'build me a lobby', pinned: true };

/** Exactly what session.ts builds: the WHOLE emitted list recorded, only `executed` of them run. */
function overflowingStep(n, emitted, executed, text = '') {
  const toolCalls = Array.from({ length: emitted }, (_, k) => ({
    id: `call_${n}_${k}`,
    name: 'run_luau',
    arguments: JSON.stringify({ source: 'print(1)' }),
  }));
  return [
    { role: 'assistant', content: text, toolCalls },
    ...toolCalls.slice(0, executed).map((c) => ({ role: 'tool', content: 'ok', toolCallId: c.id, name: c.name })),
  ];
}

/**
 * Tool-call ids on the wire that no `tool` message on the wire answers.
 *
 * Reads the encoded payload, so it is blind to anything the module under test believes about
 * itself. Named after the failure rather than the fix.
 */
function unansweredOnTheWire(llm) {
  const { payload } = encodeOpenAiChat({ modelId: 'gpt-x', messages: llm, maxTokens: 64, temperature: 0 });
  const answered = new Set(payload.messages.filter((m) => m.tool_call_id).map((m) => m.tool_call_id));
  return payload.messages.flatMap((m) => (m.tool_calls ?? []).map((c) => c.id)).filter((id) => !answered.has(id));
}

// THE INSTRUMENT ITSELF, FIRST. `unansweredOnTheWire` returning [] has to be capable of meaning
// something, and it only does if it returns a non-empty list for a transcript that really is
// malformed. This is the untrimmed, unrepaired shape session.ts produces today.
test('the instrument sees the defect when the repair is not applied', () => {
  const raw = [sys, request, ...overflowingStep(0, 5, 4)];
  assert.deepEqual(unansweredOnTheWire(raw), ['call_0_4']);
});

test('a turn of five calls reaches the provider as the four that actually ran', () => {
  const out = trimTranscript([sys, request, ...overflowingStep(0, 5, 4)], HUGE);
  assert.deepEqual(unansweredOnTheWire(out), []);
  const assistant = out.find((m) => m.role === 'assistant');
  assert.deepEqual(
    assistant.toolCalls.map((c) => c.id),
    ['call_0_0', 'call_0_1', 'call_0_2', 'call_0_3'],
    'the four that ran are kept, in order',
  );
  assert.equal(out.filter((m) => m.role === 'tool').length, 4);
});

test('every overflow width, and over budget as well as under it', () => {
  for (const emitted of [5, 6, 9, 17]) {
    for (const budget of [HUGE, 400]) {
      const llm = [sys, request, ...overflowingStep(1, emitted, 4)];
      assert.deepEqual(
        unansweredOnTheWire(trimTranscript(llm, budget)),
        [],
        `emitted=${emitted} budget=${budget}`,
      );
    }
  }
});

test('the prose of an overflowing turn survives; only the unanswered claim goes', () => {
  // `executed: 0` — nothing the model asked for ran, which is what a stopForAccess bail looks like.
  const out = trimTranscript([sys, request, ...overflowingStep(2, 3, 0, 'I will start with the floor.')], HUGE);
  const assistant = out.find((m) => m.role === 'assistant');
  assert.equal(assistant.content, 'I will start with the floor.', 'what it said is not a casualty of what it did not do');
  assert.ok(!('toolCalls' in assistant), 'and the key is gone, not present-and-undefined');
  assert.deepEqual(unansweredOnTheWire(out), []);
});

test('an assistant turn that said nothing and ran nothing is dropped whole', () => {
  const out = trimTranscript([sys, request, ...overflowingStep(3, 2, 0)], HUGE);
  assert.equal(out.filter((m) => m.role === 'assistant').length, 0);
  // The request is never a casualty of the repair, whatever else goes.
  assert.equal(out.filter((m) => m.pinned).length, 1);
});

test('a well-formed transcript is returned by reference — the repair costs the common path nothing', () => {
  const clean = [sys, request, ...overflowingStep(4, 4, 4)];
  assert.equal(answerOnlyWhatRan(clean), clean);
  assert.equal(trimTranscript(clean, HUGE), clean);
});

test('a tool result whose assistant turn was trimmed away is still not left orphaned', () => {
  // The other direction of the same invariant, checked here because the repair must not create it:
  // the group trim removes whole turn groups, so no `tool` message outlives its call.
  const long = [sys, request];
  for (let i = 0; i < 12; i++) long.push(...overflowingStep(i, 5, 4, 'X'.repeat(2000)));
  const out = trimTranscript(long, 6000);
  const calls = new Set(out.flatMap((m) => (m.toolCalls ?? []).map((c) => c.id)));
  const orphans = out.filter((m) => m.role === 'tool' && !calls.has(m.toolCallId)).map((m) => m.toolCallId);
  assert.deepEqual(orphans, []);
  assert.deepEqual(unansweredOnTheWire(out), []);
});
