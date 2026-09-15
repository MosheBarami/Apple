/**
 * "SOMEONE ELSE IS TYPING" — the third of a vocabulary that could not occur.
 *
 * packages/shared declares the client frame `{type:'presence', activity:'viewing'|'typing'|
 * 'building'}`. apps/worker/src/do/session.ts handles it. apps/web/src/components/presence-model.ts
 * renders all three verbs and sorts the strongest activity first. The workspace stylesheet has
 * rules for `.is-typing` and `.is-building`. And a repo-wide grep for a SEND site in apps/web/src
 * found none — so `typing` was unreachable, and everything above it was written for a state the
 * product could never enter.
 *
 * The throttling rule is the whole of the behaviour: a frame per keystroke is a socket write per
 * keystroke in the most-used control in the product, and a claim that is never withdrawn is worse
 * than no claim. Both are decided in lib/presence-signal.ts, so both can be driven with a clock.
 *
 * Run with:  node --test tests/presence-signal.test.mjs      (from apps/web)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const WEB = join(dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = join(WEB, '..', '..');
const ESBUILD = join(WEB, '..', 'worker', 'node_modules', '.bin', 'esbuild');
const TMP = mkdtempSync(join(tmpdir(), 'presence-signal-'));

const bundle = async (entry, name) => {
  const out = join(TMP, `${name}.mjs`);
  execFileSync(ESBUILD, [entry, '--bundle', '--format=esm', '--platform=neutral', '--main-fields=main,module', `--outfile=${out}`], {
    stdio: 'pipe',
  });
  return import(`file://${out}`);
};

const P = await bundle(join(WEB, 'src', 'lib', 'presence-signal.ts'), 'presence-signal');

const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const read = (...p) => readFileSync(join(...p), 'utf8');

/** Type a burst of keystrokes, collecting what actually went on the wire. */
function typeFor(events) {
  let state = P.initialPresence();
  const sent = [];
  for (const at of events) {
    const step = P.onComposerInput(state, at);
    state = step.state;
    if (step.send) sent.push({ at, activity: step.send });
  }
  return { state, sent };
}

// ============================================================ the rule

test('A BURST OF KEYSTROKES IS ONE FRAME, not one frame per key', () => {
  const t0 = 1_770_000_000_000;
  // Forty characters typed over two seconds — a normal sentence.
  const { sent } = typeFor(Array.from({ length: 40 }, (_, i) => t0 + i * 50));
  assert.deepEqual(sent, [{ at: t0, activity: 'typing' }], 'the room is told once');
});

test('a long sentence refreshes the claim, so the server TTL does not age it out mid-typing', () => {
  const t0 = 1_770_000_000_000;
  const keystrokes = Array.from({ length: 400 }, (_, i) => t0 + i * 50); // twenty seconds of typing
  const { sent } = typeFor(keystrokes);
  assert.ok(sent.length >= 4, `a twenty-second sentence must refresh, got ${sent.length} frames`);
  assert.ok(sent.every((s) => s.activity === 'typing'));
  for (let i = 1; i < sent.length; i++) {
    assert.ok(sent[i].at - sent[i - 1].at >= P.TYPING_REPEAT_MS, 'two frames arrived inside the repeat window');
  }
});

test('THE CLAIM IS WITHDRAWN WHEN THE TYPING STOPS, and withdrawn exactly once', () => {
  const t0 = 1_770_000_000_000;
  let { state } = typeFor([t0, t0 + 100, t0 + 200]);
  assert.equal(state.shown, 'typing');

  const stop = P.onComposerIdle(state, t0 + P.TYPING_IDLE_MS);
  assert.equal(stop.send, 'viewing', 'a pause must say so — an indicator nobody clears states a fact that stopped being true');
  state = stop.state;

  // Idempotent. A second `viewing` is a packet that changes nothing and a broadcast to everyone.
  const again = P.onComposerIdle(state, t0 + 10_000);
  assert.equal(again.send, null);
  assert.equal(again.state.shown, 'viewing');
});

test('the idle pause is shorter than the repeat window, or the pause could never be noticed', () => {
  // If TYPING_IDLE_MS were the larger of the two, a person who stopped typing would keep being
  // refreshed as typing by the next keystroke before the pause was ever declared.
  assert.ok(P.TYPING_IDLE_MS < P.TYPING_REPEAT_MS, 'a pause must be declarable inside one repeat window');
});

test('SENDING THE MESSAGE ENDS THE TYPING, whether or not it was ever announced', () => {
  // The server sets `building` on the socket that starts a run. Leaving `typing` standing beside
  // it would show the same person doing two things at once.
  const t0 = 1_770_000_000_000;
  const quiet = P.onComposerSubmit(P.initialPresence(), t0);
  assert.equal(quiet.send, 'viewing', 'even a message typed faster than one frame ends in viewing');

  const { state } = typeFor([t0, t0 + 50]);
  const after = P.onComposerSubmit(state, t0 + 100);
  assert.equal(after.send, 'viewing');
  assert.equal(after.state.shown, 'viewing');
});

test('leaving the page withdraws a standing claim and says nothing when there is none', () => {
  const t0 = 1_770_000_000_000;
  const { state } = typeFor([t0]);
  assert.equal(P.onComposerLeave(state).send, 'viewing');
  assert.equal(P.onComposerLeave(P.initialPresence()).send, null, 'a silent tab must not broadcast on unmount');
});

test('A CLOCK THAT CANNOT BE READ SENDS NOTHING, rather than a frame timestamped NaN', () => {
  // Every comparison against NaN is false, so an unguarded version sends `typing` on every single
  // keystroke forever — the exact defect the throttle exists to prevent, arriving silently.
  let state = P.initialPresence();
  for (const bad of [NaN, Infinity, -Infinity]) {
    const step = P.onComposerInput(state, bad);
    assert.equal(step.send, null, `a ${bad} clock must not produce a frame`);
    assert.deepEqual(step.state, state, 'and must not move the state');
  }
  // CONTROL: a real clock does produce one, or the refusals above prove nothing.
  assert.equal(P.onComposerInput(state, 1_770_000_000_000).send, 'typing');
});

// ============================================================ the wiring

test('the frame has a SEND SITE now, and the composer is the thing that sends it', () => {
  const socket = code(read(WEB, 'src', 'lib', 'use-project-socket.ts'));
  const composer = code(read(WEB, 'src', 'components', 'ws', 'composer.tsx'));
  const workspace = code(read(WEB, 'src', 'routes', 'workspace.tsx'));

  assert.match(socket, /type: 'presence', activity/, 'the socket hook must be able to put the frame on the wire');
  assert.match(socket, /signalPresence/, 'and expose it');
  assert.match(composer, /onComposerInput/, 'the composer must decide through the throttle, not inline');
  assert.match(composer, /typed\(\)/, 'and call it from the textarea');
  assert.match(workspace, /onPresence={signalPresence}/, 'the workspace must connect the two');
});

test('THE SERVER STOPS SAYING "is building" WHEN THE RUN ENDS', () => {
  // touch(ws,'building') was set when a chat started and cleared by nothing: after a member's
  // first message their face read "is building" for the life of the socket. Asserted against the
  // worker source because it is the one place the claim is withdrawn.
  const session = read(ROOT, 'apps', 'worker', 'src', 'do', 'session.ts');
  assert.match(session, /private clearBuildingBeats\(\)/, 'the worker must have a way to withdraw the claim');
  const finish = session.slice(session.indexOf('private async finishRun('));
  assert.ok(finish.length > 0, 'finishRun must still exist');
  assert.match(finish.slice(0, 1500), /this\.clearBuildingBeats\(\)/, 'finishRun must withdraw it');
});
