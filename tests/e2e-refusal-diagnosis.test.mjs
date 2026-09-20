// The test of the harness that decides what a failed production run is CALLED.
//
// `infra/e2e.mjs` is the only end-to-end instrument pointed at the deployed product, and on
// 2026-09-20 it answered a question nobody asked. A free account requesting Apple MAX is refused by
// `refuseOne` in apps/worker/src/do/session.ts — one `error` frame, then `return`, with no
// `msg_end`, no `run_state`, no terminal event at all. The harness logged that refusal, kept
// waiting, and 150 seconds later reported `chat timeout after 150s`. The server had answered
// immediately and clearly; the harness reported not having heard anything.
//
// That is the exact shape this repository exists to refuse: a failure to observe rendered as an
// observation. It sent three sessions after a timeout that was not happening, and it cost 150
// seconds every time it fired.
//
// WHAT THIS PINS, AND WHAT IT DELIBERATELY DOES NOT. It pins that a refusal REJECTS — the harness
// must keep failing, because a chat that never terminates on the wire is a real defect and the
// worker-side half is still open (session.ts is held by another lane; see
// docs/backlog/HANDOFF-SESSION-AGENT-LOOP.md). It does not pin the timeout path, the 150-second
// figure, or anything about the live site. It pins only that the harness names what it saw.
//
// It drives the REAL bytes of infra/e2e.mjs rather than a copy: the function is extracted from the
// file at run time and evaluated against a stub socket. A copy of the handler would pass forever
// after the original was edited, which is the same defect one level up.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const HARNESS = new URL('../infra/e2e.mjs', import.meta.url);
const SOURCE = readFileSync(HARNESS, 'utf8');

/**
 * Lift `wsChat` out of the harness and bind the handful of module-scope names it closes over.
 *
 * `infra/e2e.mjs` signs in to Supabase at module scope, so it cannot be imported: importing it
 * would authenticate and then spend real inference. Extraction is what makes this testable at all
 * without touching the network.
 *
 * ON THE `new Function` BELOW, because it should not be copied without the reason. The only string
 * put into it is a slice of a tracked file in this repository, read from disk by this test. There
 * is no external input on this path, and the point of the exercise is precisely to execute the
 * repository's own bytes rather than a paraphrase of them. Do not generalise this into a helper
 * that takes source from anywhere else.
 */
function loadWsChat(source, { socketSink }) {
  const match = /\nfunction wsChat\([\s\S]*?\n}\n/.exec(source);
  assert.ok(match, 'wsChat was not found in infra/e2e.mjs — re-aim this test before trusting it');
  class StubSocket {
    constructor() { this.sent = []; this.closed = false; socketSink.push(this); }
    send(payload) { this.sent.push(payload); }
    close() { this.closed = true; }
  }
  // A timer that cannot hold the test process open. The harness's own 150s timeout is real and
  // stays real; this only stops a mutation-induced hang from becoming a 150-second test.
  const timers = {
    setTimeout: (fn, ms) => setTimeout(fn, ms).unref(),
    clearTimeout: (id) => clearTimeout(id),
  };
  const make = new Function(
    'WebSocket', 'BASE', 'project', 'jwt', 'log', 'setTimeout', 'clearTimeout',
    `${match[0]}\nreturn wsChat;`,
  );
  return make(StubSocket, 'https://example.invalid', { id: 'p1' }, 'jwt', () => {}, timers.setTimeout, timers.clearTimeout);
}

/** Feed frames to the socket the harness just opened, in order, as the server would. */
function deliver(socket, frames) {
  for (const frame of frames) socket.onmessage({ data: JSON.stringify(frame) });
}

// A promise that must settle without the harness's own 150-second timer being involved at all.
// If a mutation makes the refusal non-terminal again, this is what turns red instead of hanging.
function settledWithin(promise, ms = 2000) {
  return Promise.race([
    promise.then((value) => ({ state: 'resolved', value }), (error) => ({ state: 'rejected', error })),
    new Promise((r) => setTimeout(() => r({ state: 'pending' }), ms).unref()),
  ]);
}

test('a refusal is reported as a refusal, not as a timeout', async () => {
  const sockets = [];
  const wsChat = loadWsChat(SOURCE, { socketSink: sockets });
  const run = wsChat('build me a tower', 'stone');
  assert.equal(sockets.length, 1, 'wsChat did not open a socket');
  deliver(sockets[0], [
    { type: 'hello', studioConnected: false },
    { type: 'error', code: 'product_model_unavailable', message: 'Apple MAX is not available on your plan.' },
  ]);

  const outcome = await settledWithin(run);
  assert.notEqual(outcome.state, 'pending', 'the harness sat on a refusal instead of reporting it — this is the 150s timeout defect');
  assert.equal(outcome.state, 'rejected', 'a refusal with no terminal event must FAIL the harness, never pass it');
  // The diagnosis, not just the failure: the message has to name the code, or the next person
  // reads "chat timeout" again and goes looking for the wrong defect.
  assert.match(outcome.error.message, /product_model_unavailable/, 'the rejection did not name the refusal code');
  assert.doesNotMatch(outcome.error.message, /timeout/i, 'the rejection still blames a timeout for a refusal that arrived');
  assert.equal(sockets[0].closed, true, 'the socket was left open after the refusal');
});

test('a normal run still resolves on its terminal event', async () => {
  const sockets = [];
  const wsChat = loadWsChat(SOURCE, { socketSink: sockets });
  const run = wsChat('what does task.wait() do?', 'clay');
  deliver(sockets[0], [
    { type: 'hello', studioConnected: false },
    { type: 'delta', text: 'It yields ' },
    { type: 'delta', text: 'the thread.' },
    { type: 'msg_end', stopReason: 'done' },
  ]);

  const outcome = await settledWithin(run);
  assert.equal(outcome.state, 'resolved', 'a run that ended properly must still pass');
  assert.equal(outcome.value.stopReason, 'done');
  assert.equal(outcome.value.finalText, 'It yields the thread.');
});

test('role_changed is informational and does not abort a live run', async () => {
  // The one non-refusal on the error channel (broadcastRoleChange in apps/worker/src/do/session.ts).
  // Treating it as fatal would invent a failure on a run that is still going, which is the mirror
  // image of the defect above: an observation rendered as a failure.
  const sockets = [];
  const wsChat = loadWsChat(SOURCE, { socketSink: sockets });
  const run = wsChat('keep building', 'stone');
  deliver(sockets[0], [
    { type: 'hello', studioConnected: true },
    { type: 'error', code: 'role_changed', message: 'Your role on this project is now viewer.' },
    { type: 'delta', text: 'Done.' },
    { type: 'msg_end', stopReason: 'done' },
  ]);

  const outcome = await settledWithin(run);
  assert.equal(outcome.state, 'resolved', 'role_changed aborted a run it only informs about');
  assert.equal(outcome.value.stopReason, 'done');
});
