/**
 * A CREDENTIAL PASTED INTO THE CHAT IS DETECTED — AND, UNTIL NOW, THE DETECTION WAS THROWN AWAY.
 *
 * `abuse.ts` scans every prompt for high-confidence secrets and raises `secret_in_prompt` with the
 * one piece of advice that matters: a credential pasted into a chat is a credential to rotate. It
 * carries weight 0 on purpose — blocking the message would leave the key pasted AND the user
 * unhelped — so the verdict is always `allow`, and `refuseAbusive` returned on `allow` BEFORE it
 * recorded anything. The net effect: the product noticed somebody paste a live API key into a
 * conversation, said nothing to them, wrote nothing to the trace, and sent the key to the model.
 *
 * That is the observation-failure pattern inverted — an observation that was made and then
 * discarded, which is indistinguishable from never having looked.
 *
 * WHAT IS ASSERTED, and what is deliberately NOT:
 *
 *   The notice is produced from the verdict by a pure function, tested by calling it, including
 *   the case that must produce NOTHING — a clean prompt must not raise a warning about secrets,
 *   or people learn to dismiss it.
 *
 *   The ORDER at the call site is read from the source, because the defect is entirely an
 *   ordering: an early return above the handling. A test of the function alone would have passed
 *   throughout the whole period the feature did nothing.
 *
 *   The run is NOT stopped and the prompt is NOT rewritten. The user asked a question about their
 *   own key; refusing them or silently editing their message are both worse than telling them.
 *
 * Run with:  node --test tests/prompt-secret-notice.test.mjs      (from apps/worker)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { scoreSubmission, advisory } from '../src/abuse.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const WORKER = join(HERE, '..');
const session = readFileSync(join(WORKER, 'src', 'do', 'session.ts'), 'utf8');
const shared = readFileSync(join(WORKER, '..', '..', 'packages', 'shared', 'src', 'index.ts'), 'utf8');
const socket = readFileSync(join(WORKER, '..', 'web', 'src', 'lib', 'use-project-socket.ts'), 'utf8');
const workspace = readFileSync(join(WORKER, '..', 'web', 'src', 'routes', 'workspace.tsx'), 'utf8');

const KEY = 'gk_live_3f9a1c02b7e4d85610fa93c7_8b24e70d1af653c9d02e84b7f16a3c59de07481b25fa6c93';
const verdict = (text) =>
  scoreSubmission({ text, recent: [], now: 1_770_000_000_000, historyReadable: true, fenceId: 'abcd1234' });

test('A PASTED CREDENTIAL BECOMES A NOTICE THE USER CAN ACT ON', () => {
  const v = verdict(`my key ${KEY} stopped working, can you check`);
  assert.equal(v.action, 'allow', 'the run is still allowed — this is the premise of the whole feature');
  const notice = advisory(v);
  assert.ok(notice, 'the detection must survive the verdict');
  assert.equal(notice.code, 'secret_in_prompt');
  assert.match(notice.message, /rotate/i, 'the advice is the point, not the label');
  assert.equal(notice.message.includes(KEY), false, 'THE NOTICE MUST NOT QUOTE THE KEY BACK');
});

test('and an ordinary prompt produces no notice at all', () => {
  // A warning that shows up on innocent messages is a warning people learn to dismiss, which
  // costs exactly the case it was built for.
  assert.equal(advisory(verdict('build a medieval lobby with four torches')), null);
});

test('a malformed verdict is not mistaken for a clean one', () => {
  // Defensive because the caller is a Durable Object holding a persisted, versioned object: a
  // verdict from an older shape must read as "nothing observed" and return null rather than throw
  // partway through ingress. It must NOT be gated on the optional `disclosures` array — a real
  // signal that goes quiet because a sibling field is missing is this same bug one level down.
  assert.equal(advisory({}), null);
  assert.equal(advisory({ signals: [] }), null);
  assert.ok(advisory({ signals: [{ code: 'secret_in_prompt', detail: 'x', weight: 0 }] }), 'the signal alone is enough');
});

test('THE CALL SITE HANDLES IT BEFORE THE `allow` RETURN — the defect was an ordering', () => {
  const body = session.slice(session.indexOf('private refuseAbusive'));
  const handled = body.indexOf('advisory(verdict)');
  const allowReturn = body.indexOf("verdict.action === 'allow'");
  assert.ok(handled > 0, 'the session must produce the notice');
  assert.ok(allowReturn > 0, 'and must still allow the run');
  assert.ok(handled < allowReturn, 'the notice is raised BEFORE the early return, or it never runs');
});

test('it is broadcast to the client and recorded in the trace', () => {
  const body = session.slice(session.indexOf('private refuseAbusive'), session.indexOf('private captureProvenance'));
  assert.match(body, /type: 'notice'/, 'the browser is told, on the channel for things that did not fail');
  // A pasted credential is the one finding here about the user's own property rather than their
  // conduct, and it carries its own errorKind so an operator sweeping the trace for leaked keys
  // does not have to grep message bodies. Matched as the VALUE, since the expression that chooses
  // it is a conditional rather than a literal field.
  assert.match(body, /recordEvent\(\{[\s\S]{0,600}'secret_in_prompt'/, 'and the trace keeps it under its own kind');
});

test('the run is not stopped and the prompt is not rewritten', () => {
  // Stated as the ORDER OF STATEMENTS rather than as a distance in characters: the first return
  // after the notice is the `allow` path. A proximity regex passed for the wrong reason the moment
  // the block above it grew, which is how a guard quietly stops guarding.
  const body = session.slice(session.indexOf('private refuseAbusive'), session.indexOf('private captureProvenance'));
  const after = body.slice(body.indexOf('advisory(verdict)'));
  const firstReturn = /return (true|false);/.exec(after);
  assert.ok(firstReturn, 'the helper must still return something after raising the notice');
  assert.equal(firstReturn[1], 'false', 'a notice must never become a refusal — the next exit is the allow path');
});

test('THE WIRE CARRIES IT AND THE BROWSER SHOWS IT — not a message nothing handles', () => {
  assert.match(shared, /type: 'notice'; code: string; message: string/, 'the shared wire type must exist');
  assert.match(socket, /case 'notice':/, 'the client must handle it');
  assert.match(workspace, /onNotice/, 'and the workspace must render it somewhere a person looks');
});
