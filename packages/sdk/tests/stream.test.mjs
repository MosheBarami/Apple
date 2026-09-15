// The session socket: the subprotocols it opens with, and what it does with a bad frame.
//
// A FAKE SOCKET, deliberately. Everything worth testing here is what happens when the
// stream is NOT healthy — a truncated frame, a delta for a run that already ended, a
// stopReason from a worker one version ahead — and none of that can be requested from a
// real server. The fake is a socket-shaped object, not a reimplementation of the protocol:
// every assertion below is about what the SDK did with what it was handed.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SessionStream,
  applyServerMsg,
  emptyRun,
  parseServerMsg,
  validateClientMsg,
} from '../src/stream.mjs';
import { WS_JWT_PREFIX, WS_SUBPROTOCOL } from '../src/wire.mjs';

const PROJECT = '3f2a1c9e-77b4-4c2a-9a1e-0b8d6e4f1234';

class FakeSocket {
  constructor(url, protocols) {
    this.url = url;
    this.protocols = protocols;
    this.sent = [];
    this.readyState = 0;
    this.closed = null;
  }
  open() {
    this.readyState = 1;
    this.onopen?.({});
  }
  deliver(value) {
    this.onmessage?.({ data: typeof value === 'string' ? value : JSON.stringify(value) });
  }
  send(raw) {
    this.sent.push(JSON.parse(raw));
  }
  close(code, reason) {
    this.readyState = 3;
    this.closed = { code, reason };
    this.onclose?.({ code, reason });
  }
}

function connected(options = {}) {
  const sockets = [];
  const stream = new SessionStream({
    baseUrl: 'https://api.test',
    projectId: PROJECT,
    token: 'jwt-abc',
    socketFactory: (url, protocols) => {
      const s = new FakeSocket(url, protocols);
      sockets.push(s);
      return s;
    },
    // Reconnects run immediately rather than after a real delay: the schedule itself is
    // asserted through the `reconnecting` events, so waiting out 300ms would test the clock.
    setTimeout: (fn) => {
      fn();
      return 0;
    },
    clearTimeout: () => {},
    jitter: () => 1,
    ...options,
  }).connect();
  return { stream, sockets };
}

test('the socket opens on the documented URL with both subprotocols, in order', () => {
  const { sockets } = connected();
  assert.equal(sockets[0].url, `wss://api.test/api/projects/${PROJECT}/ws`);
  // `golem.v1` FIRST: the worker echoes exactly that value back, and a browser aborts the
  // handshake when the echoed protocol is not among the ones requested.
  assert.deepEqual(sockets[0].protocols, [WS_SUBPROTOCOL, `${WS_JWT_PREFIX}jwt-abc`]);
});

test('a session with no token refuses to open rather than connecting unauthenticated', () => {
  assert.throws(
    () => new SessionStream({ baseUrl: 'https://api.test', projectId: PROJECT, token: '', socketFactory: () => {} }).connect(),
    TypeError,
  );
});

test('a message sent before the socket is open is reported false, not thrown away silently', () => {
  const { stream, sockets } = connected();
  assert.equal(stream.sendChat('build a door', 'stone'), false, 'not open yet');
  sockets[0].open();
  assert.equal(stream.sendChat('build a door', 'stone'), true);
  assert.deepEqual(sockets[0].sent, [{ type: 'chat', text: 'build a door', mode: 'stone' }]);
});

test('an unknown mode is refused at the client, not sent for the server to reject', () => {
  const { stream, sockets } = connected();
  sockets[0].open();
  // A TypeScript union is a compile-time promise. This value routinely arrives from a CLI
  // flag or a Python caller, neither of which the compiler ever sees.
  // `undefined` is absent from this list on purpose: it selects the parameter default,
  // which is a real mode. `null` does not, and must be refused like any other wrong value.
  for (const bad of ['banana', 'CLAY', '', null, 1]) {
    assert.throws(() => stream.sendChat('x', bad), TypeError, `${String(bad)} was accepted`);
  }
  assert.throws(() => stream.sendChat('   ', 'clay'), TypeError, 'an empty prompt is not a turn');
  assert.equal(sockets[0].sent.length, 0);
});

test('a presence activity outside the allowlist is refused', () => {
  const { stream, sockets } = connected();
  sockets[0].open();
  // The worker takes the client's word for WHAT someone is doing but never for WHO they
  // are, so the activity is the field that has to be checked — against the allowlist, not
  // merely for being a string.
  for (const bad of ['idle', 'TYPING', '', null, 7, undefined]) {
    assert.throws(() => stream.presence(bad), TypeError, `${String(bad)} was accepted`);
  }
  assert.equal(sockets[0].sent.length, 0);
  assert.equal(stream.presence('typing'), true);
  assert.deepEqual(sockets[0].sent, [{ type: 'presence', activity: 'typing' }]);
});

test('an unknown client message type is refused', () => {
  assert.throws(() => validateClientMsg({ type: 'delete_everything' }), TypeError);
  assert.throws(() => validateClientMsg({ type: 'edit_resend', text: 'x', mode: 'clay' }), TypeError, 'no messageId');
  assert.throws(() => validateClientMsg({ type: 'checkpoint_restore' }), TypeError, 'no checkpointId');
  assert.deepEqual(validateClientMsg({ type: 'ping' }), { type: 'ping' });
});

test('an unreadable frame is announced as unreadable and never folded into the run', () => {
  const { stream, sockets } = connected();
  const unreadable = [];
  stream.on('unreadable', (d) => unreadable.push(d));
  sockets[0].open();
  sockets[0].deliver('{"type":"delta","text":"hel');   // truncated
  sockets[0].deliver('null');
  sockets[0].deliver('[1,2,3]');
  sockets[0].deliver('{"nope":1}');                     // object with no type
  assert.equal(unreadable.length, 4);
  assert.equal(stream.run.text, '', 'nothing unreadable reached the transcript');
});

test('deltas accumulate into the assistant turn, and a foreign delta is counted not merged', () => {
  let run = emptyRun();
  run = applyServerMsg(run, { type: 'msg_start', msgId: 'm1', role: 'assistant', mode: 'stone' });
  run = applyServerMsg(run, { type: 'delta', msgId: 'm1', text: 'Buil' });
  run = applyServerMsg(run, { type: 'delta', msgId: 'm1', text: 'ding' });
  assert.equal(run.text, 'Building');
  // A delta for another message means client and server disagree about which turn is live.
  // Merging it would corrupt the transcript; dropping it silently would hide the disagreement.
  run = applyServerMsg(run, { type: 'delta', msgId: 'm-other', text: ' ELSEWHERE' });
  assert.equal(run.text, 'Building');
  assert.equal(run.orphanDeltas, 1);
});

test('tool_end lands on the tool it names, and an unknown toolId changes nothing', () => {
  let run = applyServerMsg(emptyRun(), { type: 'msg_start', msgId: 'm1' });
  run = applyServerMsg(run, { type: 'tool_start', msgId: 'm1', toolId: 't1', tool: 'create_instance', summary: 'door' });
  run = applyServerMsg(run, { type: 'tool_start', msgId: 'm1', toolId: 't2', tool: 'edit_script', summary: 'open' });
  run = applyServerMsg(run, { type: 'tool_end', msgId: 'm1', toolId: 't2', ok: true, summary: 'opened' });
  assert.equal(run.tools[0].ok, null, 't1 has not finished');
  assert.equal(run.tools[1].ok, true);
  const before = JSON.stringify(run.tools);
  run = applyServerMsg(run, { type: 'tool_end', msgId: 'm1', toolId: 'ghost', ok: true, summary: 'x' });
  assert.equal(JSON.stringify(run.tools), before);
});

test('a stopReason this build has never heard of is recorded AND flagged', () => {
  let run = applyServerMsg(emptyRun(), { type: 'msg_start', msgId: 'm1' });
  run = applyServerMsg(run, { type: 'msg_end', msgId: 'm1', stopReason: 'done' });
  assert.equal(run.stopReasonRecognised, true);

  let ahead = applyServerMsg(emptyRun(), { type: 'msg_start', msgId: 'm1' });
  ahead = applyServerMsg(ahead, { type: 'msg_end', msgId: 'm1', stopReason: 'moderated' });
  // Kept, because a worker one version ahead is a normal state, not a corruption — and
  // flagged, because reporting it as a clean finish would be a claim this build cannot make.
  assert.equal(ahead.stopReason, 'moderated');
  assert.equal(ahead.stopReasonRecognised, false);
  assert.equal(ahead.done, true);
});

test('a non-finite sparksSpent never replaces the last real figure', () => {
  let run = applyServerMsg(emptyRun(), { type: 'msg_start', msgId: 'm1' });
  run = applyServerMsg(run, { type: 'agent_status', phase: 'building', sparksSpent: 6 });
  assert.equal(run.sparksSpent, 6);
  for (const bad of [NaN, Infinity, '9', null, undefined]) {
    run = applyServerMsg(run, { type: 'agent_status', phase: 'building', sparksSpent: bad });
    assert.equal(run.sparksSpent, 6, `${String(bad)} overwrote a real figure`);
  }
  run = applyServerMsg(run, { type: 'msg_end', msgId: 'm1', stopReason: 'done', sparksSpent: 11 });
  assert.equal(run.sparksSpent, 11, 'the settled figure on msg_end wins');
});

test('waitForRun resolves with the assembled turn', async () => {
  const { stream, sockets } = connected();
  sockets[0].open();
  const finished = stream.waitForRun();
  sockets[0].deliver({ type: 'msg_start', msgId: 'm1', role: 'assistant', mode: 'clay' });
  sockets[0].deliver({ type: 'delta', msgId: 'm1', text: 'done.' });
  sockets[0].deliver({ type: 'msg_end', msgId: 'm1', stopReason: 'done', sparksSpent: 4 });
  const run = await finished;
  assert.equal(run.text, 'done.');
  assert.equal(run.stopReason, 'done');
  assert.equal(run.sparksSpent, 4);
});

test('a FLAPPING connection backs off further each time, and does not reset on open', () => {
  const { stream, sockets } = connected();
  const attempts = [];
  stream.on('reconnecting', (e) => attempts.push(e.delayMs));
  // Open-then-drop with no frame in between is precisely the case a naive
  // `attempt = 0` in onopen would retry at the base delay forever.
  sockets[0].open();
  sockets[0].close(1006, 'abnormal');
  sockets[1].open();
  sockets[1].close(1006, 'abnormal again');
  assert.equal(attempts.length, 2);
  assert.ok(attempts[1] > attempts[0], `expected growth, got ${attempts.join(',')}`);
  assert.equal(sockets.length, 3, 'each drop opened a new socket');

  stream.close();
  assert.equal(attempts.length, 2, 'closing on purpose does not schedule a reconnect');
});

test('a connection that actually delivered a frame starts the schedule over', () => {
  const { stream, sockets } = connected();
  const attempts = [];
  stream.on('reconnecting', (e) => attempts.push(e.delayMs));
  sockets[0].open();
  sockets[0].close(1006, 'drop');            // flap: attempt 1
  sockets[1].open();
  sockets[1].close(1006, 'drop');            // flap: attempt 2, longer
  sockets[2].open();
  sockets[2].deliver({ type: 'hello', sessionId: 'p', studioConnected: false, quota: {} });
  sockets[2].close(1006, 'drop');            // healthy then dropped: back to the base delay
  assert.equal(attempts.length, 3);
  assert.ok(attempts[1] > attempts[0], 'the flap escalated');
  assert.equal(attempts[2], attempts[0], 'a proven-good connection resets the schedule');
});

test('reconnection gives up rather than looping forever, and says so', () => {
  const { stream, sockets } = connected({ maxReconnects: 2 });
  const gaveUp = [];
  stream.on('gave_up', (e) => gaveUp.push(e));
  sockets[0].open();
  for (let i = 0; i < 5 && sockets.length <= 5; i += 1) sockets.at(-1).close(1006, 'drop');
  assert.equal(gaveUp.length >= 1, true, 'the client must announce that it stopped trying');
  assert.equal(gaveUp[0].attempts, 2);
});

test('parseServerMsg is the only thing standing between JSON.parse and the socket handler', () => {
  assert.equal(parseServerMsg('not json'), null);
  assert.equal(parseServerMsg(''), null);
  assert.equal(parseServerMsg('"a string"'), null);
  assert.equal(parseServerMsg(undefined), null);
  assert.deepEqual(parseServerMsg('{"type":"pong"}'), { type: 'pong' });
});
