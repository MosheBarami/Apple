/**
 * THE STOP BUTTON, AND THE RACE THAT COULD SILENTLY DISCARD IT.
 *
 * A2 from the independent review: `webSocketMessage` did a read-modify-write of the `agent`
 * blob to set `status: 'stopping'`, while `runStep` held its own copy of that same blob for
 * the length of a step and wrote it back at the tail. Two writers, one value.
 *
 *   * run's write lands last  -> 'running' overwrites 'stopping'. The button did nothing.
 *   * stop's write lands last -> a blob read BEFORE the step overwrites the step's transcript
 *     and trace, and the alarm replays a step whose paid LLM call already ran and whose
 *     mutating tools already executed against the user's place.
 *
 * The second is the worse one. Neither is fixable by ordering the checks more carefully,
 * because the gap being raced IS the step.
 *
 * These tests drive the two paths against one fake storage and assert the property the fix
 * rests on: the stop path never writes the agent key, so neither write can erase the other.
 *
 * Run with:  node --test           (from apps/worker)
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { requestStop, stopRequested, stopRequestedAt, clearStop, STOP_KEY } from '../src/stop-signal.ts';

/** A Map with the Durable Object storage shape, recording which keys were written. */
function fakeStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  const writes = [];
  return {
    writes,
    map,
    async get(key) {
      return map.get(key);
    },
    async put(key, value) {
      writes.push(key);
      map.set(key, value);
    },
    async delete(key) {
      writes.push(`delete:${key}`);
      return map.delete(key);
    },
  };
}

const runningAgent = { status: 'running', llm: ['system', 'user', 'a lot of history'], step: 4 };

test('requesting a stop never touches the agent blob', async () => {
  // THE fix. Everything else follows from it: two writers on one value is the bug, and this
  // is the assertion that the second writer is gone.
  const storage = fakeStorage({ agent: runningAgent });

  await requestStop(storage, 1000);

  assert.deepEqual(storage.writes, [STOP_KEY], 'the stop path may write exactly one key');
  assert.ok(!storage.writes.includes('agent'), 'and it is not the agent');
  assert.equal(storage.map.get('agent'), runningAgent, 'the run state is byte-identical');
});

test('a stop survives the run writing the agent blob after it', async () => {
  // The first losing interleaving: stop arrives mid-step, run persists at the tail.
  const storage = fakeStorage({ agent: runningAgent });

  await requestStop(storage, 1000);
  await storage.put('agent', { ...runningAgent, status: 'running', step: 5 }); // the tail persist

  assert.equal(await stopRequested(storage), true, 'the stop must outlive the tail persist');
});

test('the run writing the agent blob is not lost to a stop landing after it', async () => {
  // The second, worse interleaving: the stop path used to write a blob it had read BEFORE the
  // step, reverting the step's work and inviting the alarm to replay it.
  const storage = fakeStorage({ agent: runningAgent });
  const stale = { ...runningAgent, step: 4 };

  const afterStep = { ...runningAgent, status: 'running', step: 5, llm: [...runningAgent.llm, 'step 5 work'] };
  await storage.put('agent', afterStep);
  await requestStop(storage, 1000); // concurrent, holding `stale`
  void stale;

  const stored = storage.map.get('agent');
  assert.equal(stored.step, 5, 'the completed step must not be reverted');
  assert.deepEqual(stored.llm, afterStep.llm, 'and its transcript must survive');
  assert.equal(await stopRequested(storage), true, 'while the stop is still honoured');
});

test('no stop means no stop', async () => {
  const storage = fakeStorage({ agent: runningAgent });
  assert.equal(await stopRequested(storage), false);
  assert.equal(await stopRequestedAt(storage), null);
});

test('the signal carries when it was pressed', async () => {
  const storage = fakeStorage();
  await requestStop(storage, 1_700_000_000_000);
  assert.equal(await stopRequestedAt(storage), 1_700_000_000_000);
});

test('a stop of 0 is still a stop', async () => {
  // Guards the obvious refactor into a truthiness check. Date.now() is never 0 in practice,
  // but a test that passes an explicit timestamp is exactly how it would become one.
  const storage = fakeStorage();
  await requestStop(storage, 0);
  assert.equal(await stopRequested(storage), true, '0 is a timestamp, not an absence');
});

test('clearing releases the signal', async () => {
  const storage = fakeStorage();
  await requestStop(storage, 1000);
  await clearStop(storage);
  assert.equal(await stopRequested(storage), false);
});

test('a new run does not inherit the previous run stop', async () => {
  // Why startRun clears as well as finishRun: a stop landing in the moment a run finishes can
  // arrive after finishRun's clear, and would otherwise kill the user's next message before
  // its first step.
  const storage = fakeStorage();
  await requestStop(storage, 1000);      // pressed as the old run was ending
  await clearStop(storage);              // finishRun
  await requestStop(storage, 1001);      // ...and this one landed just after
  await clearStop(storage);              // startRun, for the new run

  assert.equal(await stopRequested(storage), false, 'the new run must start un-stopped');
});

test('clearing a signal that is not set is harmless', async () => {
  const storage = fakeStorage();
  await clearStop(storage);
  assert.equal(await stopRequested(storage), false);
});

/*
 * THE STOP THAT WENT NOWHERE (round 6, 2026-09-23). The browser's socket opened, said hello and was
 * then never delivered a frame, so Stop was pressed and the build kept going. The button now also
 * sends an HTTP stop, which answers. Held here as properties of the source, comments stripped.
 */
import { readFileSync } from 'node:fs';

const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const read = (rel) => strip(readFileSync(new URL(rel, import.meta.url), 'utf8'));

test('the HTTP stop route is gated like the socket stop and writes the same signal', () => {
  const src = read('../src/index.ts');
  const at = src.indexOf("app.post('/api/projects/:id/stop'");
  assert.ok(at >= 0, 'POST /api/projects/:id/stop is missing');
  const body = src.slice(at, src.indexOf('\n});', at));
  // A viewer may not end a build: the socket refuses without 'chat', and so must this.
  assert.match(body, /withOwnedProject\(\s*c\s*,[^,]+,\s*'chat'/);
  assert.match(body, /if \(!ctx\) return/);
  assert.match(body, /https:\/\/do\/agent-stop/);
});

test('the web Stop button sends the HTTP stop and says so when neither path reached the worker', () => {
  const hook = read('../../web/src/lib/use-project-socket.ts');
  const at = hook.indexOf('const stop = useCallback');
  assert.ok(at >= 0);
  const stop = hook.slice(at, hook.indexOf('}, [', at));
  assert.match(stop, /sendRaw\(\{ type: 'stop' \}\)/);
  assert.match(stop, /stopRun\(/);
  const ws = read('../../web/src/routes/workspace.tsx');
  assert.match(ws, /stop\(\)\.then\(\(ok\) => \{\s*if \(!ok\) toast\(/);
});
