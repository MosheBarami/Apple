/**
 * THREE ANSWERS TO ONE QUESTION, ON ONE SCREEN.
 *
 * What a customer saw, in a screenshot taken 2026-09-19: the workspace header read "Studio last
 * connected 13 seconds ago", the panel beside it read "Studio not connected", and the assistant,
 * asked whether it was connected, replied "I don't have direct access to check Studio's connection
 * status." The plugin was connected the whole time.
 *
 * WHY. `pluginConnected()` had already been fixed to judge against an ADAPTIVE deadline — the last
 * heartbeat plus the sleep the worker told the plugin to take plus grace — because a fixed
 * threshold cannot work once the sleep is adaptive; its own comment says 8s "would declare a
 * healthy parked plugin dead 2s into a 10s [hold]". The wake path kept the old rule:
 *
 *     this.pluginSeenRecently = Date.now() - lastSeen < 8000;
 *
 * and `AgentCtx.studioConnected` — the thing that decides what the system prompt says and which
 * tools exist — read that flag. So the screen and the model were reading two different clocks, and
 * the model's was the one the codebase had already thrown away.
 *
 * THE WINDOW IS FIVE SECONDS WIDE, and measuring it is what stopped this write-up from being
 * wrong. After a wake the adaptive deadline is the last heartbeat plus POLL_WAIT_IDLE_MS (5s) plus
 * POLL_STALE_GRACE_MS (8s) = 13 seconds. The old rule said 8. So the two readers disagreed for a
 * heartbeat between 8 and 13 seconds old, and agreed either side of it — and the screenshot that
 * started this, at "13 seconds ago", was on the far boundary rather than inside. The defect is
 * real and it is smaller than it first looked: one run in that window is told it cannot build
 * while the screen says it can.
 *
 * These tests fix the rule in place by asserting the two readers AGREE, rather than by asserting
 * either one's number: a test that pinned 8s or 18s would have to be rewritten the next time the
 * pacing changes, and it is the disagreement, not the value, that reached the customer.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { sessionHarness } from './session-harness.mjs';

/** A DO that has just woken with a heartbeat `ageMs` old and has not been polled since. */
async function wokenWith(ageMs) {
  const h = sessionHarness({ store: [['pluginLastSeen', Date.now() - ageMs]] });
  // The constructor's blockConcurrencyWhile runs synchronously in the harness, but the load is
  // async; yielding once lets it finish before anything is asked.
  await new Promise((r) => setTimeout(r, 0));
  return h;
}

const modelSees = (h) => h.session.agentCtx().studioConnected();
const screenSees = (h) => h.session.pluginConnected();

test('INSIDE THE FIVE-SECOND GAP the model is told what the screen says, not what the old rule said', async () => {
  // 10s: past the old fixed 8s window, inside the real 13s deadline. This is precisely the gap the
  // two rules disagreed in, so it is the one age worth naming.
  const h = await wokenWith(10_000);
  assert.equal(await screenSees(h), true, 'the fixture is wrong: the screen must consider this connected');
  assert.equal(modelSees(h), true,
    'the model was told Studio is not connected while the screen said it was — this is the defect');
});

test('THE TWO READERS AGREE AT EVERY AGE, which is the property that was broken', async () => {
  // Across the whole range that matters: inside the old fixed window, in the gap that produced the
  // defect, and past any deadline either rule could produce.
  for (const ageMs of [0, 1_000, 7_999, 8_001, 10_000, 12_500, 13_500, 20_000, 60_000, 5 * 60_000]) {
    const h = await wokenWith(ageMs);
    assert.equal(modelSees(h), await screenSees(h), `the two disagree at ${ageMs}ms since the last heartbeat`);
  }
});

test('a plugin that has never polled is not connected, to either reader', async () => {
  const h = sessionHarness({ store: [['pluginLastSeen', 0]] });
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(await screenSees(h), false);
  assert.equal(modelSees(h), false, 'a project that never paired must not be told it can build');
});

test('a long-dead heartbeat is not connected — the agreement is not both saying yes to everything', async () => {
  // Falsification of the test above: `assert.equal(a, b)` passes when both are true for every
  // input, so at least one age must produce false or the agreement test proves nothing.
  const h = await wokenWith(6 * 60 * 60_000);
  assert.equal(await screenSees(h), false);
  assert.equal(modelSees(h), false);
});

test('BACKPRESSURE SURVIVES THE CHANGE — a hundred queued ops still answers no', async () => {
  const h = await wokenWith(1_000);
  assert.equal(modelSees(h), true);
  // The queue half of `studioConnected` is a separate claim from the connection half: at a hundred
  // ops deep the honest answer to "can you build right now" is no, whatever the socket says.
  h.session.opQueue = Array.from({ length: 100 }, (_, i) => ({ id: `op-${i}` }));
  assert.equal(modelSees(h), false, 'the queue ceiling was lost when the connection rule changed');
  assert.equal(await screenSees(h), true, 'the SCREEN is about the connection and must not follow the queue');
});
