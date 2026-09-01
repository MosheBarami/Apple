/**
 * THE PLAYTEST RECORD: what the worker is allowed to tell the browser about a
 * run in progress.
 *
 * These are honesty tests, in the same spirit as web/tests/studio-connection.
 * The Playtest card is a moving picture of the user's game, which is the most
 * credible surface this product has — people believe a viewport over any text
 * beside it. Everything that governs whether it may claim to be current is
 * decided in playtest-stream.ts and asserted here:
 *
 *   - a terminal run is FROZEN, so a frame or a log read that lands after the
 *     playtest ended cannot revive it or edit its record;
 *   - elapsed time is measured from worker timestamps and stops when the run
 *     stops, so a finished playtest does not keep counting;
 *   - freshness has four states, not two, because "no frame yet" and "the
 *     stream died" need opposite copy;
 *   - console counts REPLACE rather than accumulate, because get_logs returns
 *     a trailing window and adding successive reads turns one error into a
 *     cascade.
 *
 * Run with:  node --test           (from apps/worker)
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  advance,
  countConsole,
  elapsedMs,
  frameFreshness,
  isTerminal,
  parseLogEntries,
  startPlaytest,
} from '../src/playtest-stream.ts';
import { PLAYTEST_DEAD_MS, PLAYTEST_STALE_MS } from '../../../packages/shared/src/index.ts';

const T0 = 1_700_000_000_000;

const fresh = (over = {}) => ({
  ...startPlaytest({ id: 'pt_1', now: T0, requestedSeconds: 5, msgId: 'm1' }),
  ...over,
});

// ---------------------------------------------------------------- lifecycle

test('a new playtest starts in preparing, with nothing claimed', () => {
  const run = fresh();
  assert.equal(run.phase, 'preparing');
  assert.equal(run.consoleErrors, 0);
  assert.equal(run.framesDelivered, 0);
  assert.equal(run.framesDropped, 0);
  assert.equal(run.lastFrameAt, undefined, 'no frame time before a frame exists');
  assert.equal(run.endedAt, undefined);
});

test('only finished and failed are terminal', () => {
  assert.equal(isTerminal('finished'), true);
  assert.equal(isTerminal('failed'), true);
  for (const p of ['preparing', 'running', 'stopping']) {
    assert.equal(isTerminal(p), false, p);
  }
});

test('reaching a terminal phase stamps the end time', () => {
  const run = advance(fresh(), { phase: 'finished', now: T0 + 5000 });
  assert.equal(run.endedAt, T0 + 5000);
});

test('a terminal run is frozen against every later update', () => {
  // The capture loop and the op timeouts are concurrent, so a frame arriving
  // after the stop is ORDINARY, not exceptional. It must not resurrect a
  // finished playtest into a running one on the user's screen.
  const done = advance(fresh(), { phase: 'finished', now: T0 + 5000 });
  const meddled = advance(done, {
    phase: 'running',
    action: 'still going!',
    consoleErrors: 99,
    deliveredFrame: true,
    lastFrameAt: T0 + 9999,
  });
  assert.deepEqual(meddled, done, 'a terminal run must be returned unchanged');
});

test('a failed run is frozen too, and keeps its reason', () => {
  const failed = advance(fresh(), { phase: 'failed', error: 'could not checkpoint', now: T0 + 100 });
  assert.equal(failed.error, 'could not checkpoint');
  const meddled = advance(failed, { phase: 'finished', error: undefined });
  assert.equal(meddled.phase, 'failed');
  assert.equal(meddled.error, 'could not checkpoint');
});

test('advance never mutates the run it was given', () => {
  const run = fresh();
  const next = advance(run, { phase: 'running', deliveredFrame: true });
  assert.equal(run.phase, 'preparing');
  assert.equal(run.framesDelivered, 0);
  assert.equal(next.framesDelivered, 1);
});

test('a run abandoned mid-playtest can be closed out as failed, not finished', () => {
  // run_and_check reports a terminal phase on every path it RETURNS from, but
  // it is not the only way the agent run can end: the tool can throw, the user
  // can press stop, the budget can abort. finishRun in do/session.ts closes the
  // record on those paths — otherwise the card sits there counting up the age
  // of a frame from a playtest that is long over.
  //
  // 'failed' rather than 'finished' because that is what happened.
  const live = fresh({ phase: 'running' });
  const closed = advance(live, {
    phase: 'failed',
    action: 'The run ended before the playtest finished',
    error: 'stopped by you',
    now: T0 + 3000,
  });
  assert.equal(closed.phase, 'failed');
  assert.equal(closed.endedAt, T0 + 3000);
  assert.equal(elapsedMs(closed, T0 + 999_999), 3000, 'a closed-out run stops counting');
});

// ---------------------------------------------------------------- counters

test('delivered and dropped frames are counted separately', () => {
  // A stuttering stream must read as stuttering, not as slow. Folding drops
  // into deliveries would hide exactly that.
  let run = fresh({ phase: 'running' });
  run = advance(run, { deliveredFrame: true, lastFrameAt: T0 + 1000 });
  run = advance(run, { droppedFrame: true });
  run = advance(run, { droppedFrame: true });
  assert.equal(run.framesDelivered, 1);
  assert.equal(run.framesDropped, 2);
  assert.equal(run.lastFrameAt, T0 + 1000, 'a drop must not advance the frame clock');
});

test('a dropped frame never moves lastFrameAt, so staleness keeps advancing', () => {
  // If a failed capture refreshed the timestamp, a stream that stopped
  // delivering would look permanently current.
  let run = fresh({ phase: 'running', lastFrameAt: T0 });
  for (let i = 0; i < 5; i += 1) run = advance(run, { droppedFrame: true });
  assert.equal(run.lastFrameAt, T0);
  assert.equal(frameFreshness(run.lastFrameAt, T0 + PLAYTEST_DEAD_MS), 'dead');
});

test('console counts replace rather than accumulate', () => {
  // get_logs returns a trailing window of history. Adding successive reads
  // would report one error as a rising cascade.
  let run = fresh({ phase: 'running' });
  run = advance(run, { consoleErrors: 2, consoleWarnings: 1 });
  run = advance(run, { consoleErrors: 2, consoleWarnings: 1 });
  assert.equal(run.consoleErrors, 2);
  assert.equal(run.consoleWarnings, 1);
});

// ---------------------------------------------------------------- elapsed

test('elapsed counts up while live and freezes when the run ends', () => {
  const live = fresh({ phase: 'running' });
  assert.equal(elapsedMs(live, T0 + 3000), 3000);
  const done = advance(live, { phase: 'finished', now: T0 + 5000 });
  assert.equal(elapsedMs(done, T0 + 60_000), 5000, 'a finished run does not keep counting');
});

test('elapsed is never negative when the clocks disagree', () => {
  // The browser and the worker do not share a clock. A countdown would be
  // visibly wrong in a way a user cannot explain.
  assert.equal(elapsedMs(fresh(), T0 - 10_000), 0);
});

// ---------------------------------------------------------------- freshness

test('freshness distinguishes never-had-a-frame from lost-the-stream', () => {
  // Two states, opposite copy: one is patience, the other is a problem.
  assert.equal(frameFreshness(undefined, T0), 'none');
  assert.equal(frameFreshness(T0, T0 + PLAYTEST_DEAD_MS), 'dead');
});

test('freshness thresholds are exact at their boundaries', () => {
  assert.equal(frameFreshness(T0, T0), 'fresh');
  assert.equal(frameFreshness(T0, T0 + PLAYTEST_STALE_MS - 1), 'fresh');
  assert.equal(frameFreshness(T0, T0 + PLAYTEST_STALE_MS), 'stale');
  assert.equal(frameFreshness(T0, T0 + PLAYTEST_DEAD_MS - 1), 'stale');
  assert.equal(frameFreshness(T0, T0 + PLAYTEST_DEAD_MS), 'dead');
});

test('a frame stamped in the future does not pin the card to fresh forever', () => {
  // Clock skew is a disagreement, not eternal currency. Treating it as
  // just-arrived lets the next frame settle it.
  assert.equal(frameFreshness(T0 + 60_000, T0), 'fresh');
});

test('an old frame is stale no matter how healthy the run record looks', () => {
  // The load-bearing property of the whole feature: freshness is a function of
  // the PIXELS' timestamp alone. Nothing about the run's phase, the socket, or
  // a frame having once arrived can make an old frame read as current.
  const run = fresh({ phase: 'running', framesDelivered: 40, consoleErrors: 0, lastFrameAt: T0 });
  assert.equal(frameFreshness(run.lastFrameAt, T0 + 30_000), 'dead');
});

// ---------------------------------------------------------------- log parsing

test('console entries are counted by real severity', () => {
  const entries = [
    { kind: 'log', message: 'a', level: 'error', clock: 1 },
    { kind: 'log', message: 'b', level: 'error', clock: 2 },
    { kind: 'log', message: 'c', level: 'warn', clock: 3 },
    { kind: 'log', message: 'd', level: 'output', clock: 4 },
    { kind: 'log', message: 'e', level: 'info', clock: 5 },
  ];
  assert.deepEqual(countConsole(entries), { errors: 2, warnings: 1 });
});

test('counting nothing is zero, not a crash', () => {
  assert.deepEqual(countConsole(undefined), { errors: 0, warnings: 0 });
  assert.deepEqual(countConsole([]), { errors: 0, warnings: 0 });
});

test('log entries are unwrapped whatever order the wire nests them in', () => {
  // Same hazard as parseCensus in playtest.ts: assuming a fixed nesting order
  // was wrong twice against real Studio while every unit test passed.
  const entries = [{ message: 'boom', level: 'error', clock: 7 }];
  const shapes = [
    { entries },
    { result: { entries } },
    { data: { result: { entries } } },
    { result: { t: 'string', v: JSON.stringify({ entries }) } },
    { result: { v: { entries }, t: 'table' } },
  ];
  for (const shape of shapes) {
    const parsed = parseLogEntries(shape);
    assert.ok(parsed, `failed to unwrap ${JSON.stringify(shape).slice(0, 60)}`);
    assert.equal(parsed.length, 1);
    assert.equal(parsed[0].level, 'error');
    assert.equal(parsed[0].message, 'boom');
  }
});

test('an unreadable log payload is null, never an empty success', () => {
  // A broken read must not be indistinguishable from "no errors occurred".
  // That is the difference between "we did not look" and "we looked and it
  // was clean", and only one of them is safe to show as a zero.
  for (const bad of [null, undefined, 42, 'nonsense', { nothing: true }]) {
    assert.equal(parseLogEntries(bad), null, JSON.stringify(bad));
  }
});

test('an unknown severity degrades to output rather than to error', () => {
  const parsed = parseLogEntries({ entries: [{ message: 'x', level: 'weird', clock: 1 }] });
  assert.equal(parsed[0].level, 'output');
});

test('malformed entries are skipped, not counted as errors', () => {
  const parsed = parseLogEntries({ entries: [{ message: 'ok', level: 'error' }, { nope: 1 }, null, 'string'] });
  assert.equal(parsed.length, 1);
  assert.deepEqual(countConsole(parsed), { errors: 1, warnings: 0 });
});
