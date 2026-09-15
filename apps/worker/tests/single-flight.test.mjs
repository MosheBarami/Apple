/**
 * ONE RUN AT A TIME, AND THE GAP THAT MADE TWO.
 *
 * A3 from the independent review: concurrent `startRun` double-charges a Credit, inserts two
 * user rows, and orphans a message that never gets `msg_end`.
 *
 * The trap is that Durable Objects are single-threaded, which reads as "cannot race". It
 * means only that no two lines run at once — an async handler yields at every await, and the
 * second `chat` frame runs in that gap. Both frames read an idle agent from storage, because
 * reading storage is one of the things being awaited.
 *
 * The fix only works if the guard is established SYNCHRONOUSLY. The third test below is the
 * one that matters: it starts both calls without awaiting the first, which is exactly how the
 * two frames arrive.
 *
 * Run with:  node --test           (from apps/worker)
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { singleFlight } from '../src/single-flight.ts';

/** A promise you resolve by hand, so a test can hold a call open at a chosen moment. */
function deferred() {
  let resolve, reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

test('an idle gate runs the work and returns its value', async () => {
  const guard = singleFlight();
  const result = await guard(async () => 'built');
  assert.deepEqual(result, { ran: true, value: 'built' });
});

test('sequential calls all run', async () => {
  // The gate must not be a one-shot latch: a user sends many messages in a session.
  const guard = singleFlight();
  for (let i = 0; i < 3; i += 1) {
    const result = await guard(async () => i);
    assert.deepEqual(result, { ran: true, value: i });
  }
});

test('a second call started before the first finishes does not run', async () => {
  // THE test. Both calls are started without awaiting, which is how two websocket frames
  // arrive. Against an unguarded startRun, `runs` reaches 2 — two Credits, two user rows,
  // and one message that never ends.
  const guard = singleFlight();
  const gate = deferred();
  let runs = 0;

  const first = guard(async () => {
    runs += 1;
    await gate.promise;
    return 'first';
  });
  const second = guard(async () => {
    runs += 1;
    return 'second';
  });

  assert.deepEqual(await second, { ran: false }, 'the second must be turned away');
  assert.equal(runs, 1, 'and must never have entered the body');

  gate.resolve();
  assert.deepEqual(await first, { ran: true, value: 'first' });
  assert.equal(runs, 1, 'still one, after the first completes');
});

test('the guard holds across an await inside the work', async () => {
  // A guard that were itself established after an await would let the second call through
  // here, because the first is suspended at exactly this point.
  const guard = singleFlight();
  const gate = deferred();
  let concurrent = 0;
  let peak = 0;

  const busy = async () => {
    concurrent += 1;
    peak = Math.max(peak, concurrent);
    await gate.promise;
    concurrent -= 1;
  };

  const a = guard(busy);
  const b = guard(busy);
  const c = guard(busy);
  gate.resolve();
  await Promise.all([a, b, c]);

  assert.equal(peak, 1, 'never more than one in the body at a time');
});

test('a throwing call releases the gate instead of wedging the session', async () => {
  // Without the finally, one bad request would make every later message report "already
  // working" for the life of the Durable Object.
  const guard = singleFlight();

  await assert.rejects(() => guard(async () => {
    throw new Error('checkpoint exploded');
  }), /checkpoint exploded/);

  const after = await guard(async () => 'recovered');
  assert.deepEqual(after, { ran: true, value: 'recovered' }, 'the gate must reopen');
});

test('a rejected call does not stop a queued caller from being told it was refused', async () => {
  const guard = singleFlight();
  const gate = deferred();

  const first = guard(async () => {
    await gate.promise;
    throw new Error('boom');
  });
  const second = await guard(async () => 'should not run');

  assert.deepEqual(second, { ran: false });
  gate.reject(new Error('boom'));
  await assert.rejects(() => first);
});

test('two gates are independent', async () => {
  // startRun's gate must not accidentally block anything else that adopts this helper.
  const a = singleFlight();
  const b = singleFlight();
  const gate = deferred();

  const held = a(async () => {
    await gate.promise;
  });
  assert.deepEqual(await b(async () => 'independent'), { ran: true, value: 'independent' });

  gate.resolve();
  await held;
});
