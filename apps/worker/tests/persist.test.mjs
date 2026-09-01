/**
 * PERSISTING A RUN, AND THE BUG THAT PROVES THIS NEEDED A TEST.
 *
 * `persistAgent` was a private method on the Durable Object, and its whole body was:
 *
 *     try {
 *       await this.persistAgent(agent);   // itself
 *       return;
 *     } catch (err) { ...shed and put... }
 *
 * Every persist recursed until the stack overflowed. The RangeError landed in the shedding
 * path, which dutifully saved the run WITHOUT its transcript — every step, silently, behind a
 * console warning that reads like a size problem. The agent forgot the conversation each step
 * and the only visible symptom was that it behaved as though it had.
 *
 * The first test below is the one that fails against that code: it asserts a healthy save
 * writes the state INTACT and exactly once. Nothing could assert it before, because a
 * DurableObject subclass cannot be instantiated outside the Workers runtime — the policy lived
 * where no test could go. It takes its `put` as an argument now.
 *
 * Run with:  node --test           (from apps/worker)
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { persistWithShedding, TOO_LARGE_MESSAGE, SHED_TRACE_KEEP } from '../src/persist.ts';

const sys = { role: 'system', content: 'system prompt' };
const pinnedUser = { role: 'user', content: 'build me a tycoon', pinned: true };
const chatter = (n) =>
  Array.from({ length: n }, (_, i) => ({ role: 'assistant', content: `step ${i}` }));

const agent = (over = {}) => ({
  status: 'running',
  llm: [sys, pinnedUser, ...chatter(20)],
  trace: Array.from({ length: 40 }, (_, i) => ({ tool: 'create_instances', step: i })),
  seenCalls: ['create_instances:abc'],
  lastCalls: [{ id: 'c1', name: 'edit_script', arguments: '{}' }],
  finalText: '',
  ...over,
});

/** Records every value handed to `put`, and can be told to reject the first N calls. */
function recorder(rejectFirst = 0) {
  const calls = [];
  const put = async (value) => {
    calls.push(value);
    if (calls.length <= rejectFirst) throw new Error('value too large: 128 KiB limit');
  };
  return { put, calls };
}

const quiet = () => {};

test('a healthy save writes the state intact, exactly once', async () => {
  // The regression test for the self-call. Against that code this fails twice over: `put` is
  // reached with a shed value, and the transcript is gone.
  const { put, calls } = recorder();
  const state = agent();

  const outcome = await persistWithShedding(put, state, quiet);

  assert.equal(outcome, 'full');
  assert.equal(calls.length, 1, 'a save that fits must not write twice');
  assert.deepEqual(calls[0], state, 'the state must reach storage unmodified');
  assert.equal(calls[0].llm.length, 22, 'the whole transcript must survive a healthy save');
  assert.equal(calls[0].trace.length, 40, 'and so must the trace');
});

test('the caller can tell a healthy save from a degraded one', async () => {
  // The old code returned void, so "saved" and "saved without the transcript" were
  // indistinguishable to everything except a human reading console output.
  const healthy = await persistWithShedding(recorder(0).put, agent(), quiet);
  const degraded = await persistWithShedding(recorder(1).put, agent(), quiet);
  assert.equal(healthy, 'full');
  assert.equal(degraded, 'shed');
  assert.notEqual(healthy, degraded);
});

test('an oversized state sheds the transcript but keeps what a run cannot continue without', async () => {
  const { put, calls } = recorder(1);

  const outcome = await persistWithShedding(put, agent(), quiet);

  assert.equal(outcome, 'shed');
  assert.equal(calls.length, 2, 'one rejected attempt, one shed attempt');
  const shed = calls[1];
  assert.deepEqual(shed.llm, [sys, pinnedUser], 'system prompt and pinned turns survive');
  assert.equal(shed.trace.length, SHED_TRACE_KEEP, 'trace is trimmed, not emptied');
  assert.deepEqual(shed.seenCalls, [], 'seenCalls is dropped');
  assert.deepEqual(shed.lastCalls, [], 'lastCalls is dropped');
  assert.equal(shed.status, 'running', 'a shed run is still running — it lost history, not life');
});

test('shedding never drops a pinned turn, whatever else goes', async () => {
  // The pinned user turn is the request the run exists to satisfy. A run that forgets it is
  // worse than a run that stops.
  const { put, calls } = recorder(1);
  await persistWithShedding(put, agent({ llm: [sys, pinnedUser, ...chatter(200)] }), quiet);
  assert.ok(calls[1].llm.some((m) => m.pinned), 'the pinned turn must survive');
  assert.ok(calls[1].llm.some((m) => m.role === 'system'), 'so must the system prompt');
});

test('a state that will not fit even shed is recorded as a terminal state, not left to retry', async () => {
  // The reason this path exists: an exception escaping the alarm handler makes the platform
  // retry the alarm from the state persisted BEFORE the step, re-running its paid LLM call and
  // re-executing its mutating tools against the user's place.
  const { put, calls } = recorder(2);

  const outcome = await persistWithShedding(put, agent(), quiet);

  assert.equal(outcome, 'terminal');
  assert.equal(calls.length, 3);
  const terminal = calls[2];
  assert.deepEqual(terminal.llm, []);
  assert.deepEqual(terminal.trace, []);
  assert.equal(terminal.status, 'idle', 'a terminal state must not read as still running');
  assert.equal(terminal.finalText, TOO_LARGE_MESSAGE, 'and must say why, in the run itself');
});

test('it does not swallow a failure it cannot handle', async () => {
  // Three rejections is not a case this policy claims to survive. Failing loudly there is
  // correct; pretending otherwise would put us back to a state the platform replays.
  const { put } = recorder(3);
  await assert.rejects(() => persistWithShedding(put, agent(), quiet), /too large/);
});

test('both degraded paths announce themselves', async () => {
  const seen = [];
  const warn = (m) => seen.push(m);
  await persistWithShedding(recorder(1).put, agent(), warn);
  assert.equal(seen.length, 1);
  assert.match(seen[0], /without transcript/);

  seen.length = 0;
  await persistWithShedding(recorder(2).put, agent(), warn);
  assert.equal(seen.length, 1, 'the terminal path reports once, naming the worse failure');
  assert.match(seen[0], /unsaveable even when empty/);
});

test('a healthy save is silent', async () => {
  // A warning on every successful persist is how the self-call bug hid: the console said
  // "too large" ten times a run and that looked like a known condition.
  const seen = [];
  await persistWithShedding(recorder(0).put, agent(), (m) => seen.push(m));
  assert.deepEqual(seen, [], 'nothing to report when nothing went wrong');
});
