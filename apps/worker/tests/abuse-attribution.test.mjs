/**
 * AN ABUSE FINDING NOBODY CAN ATTRIBUTE IS A COUNTER, NOT A CASE.
 *
 * `scoreSubmission` is thorough and well tested, and `refuseAbusive` records everything it finds —
 * a flood refusal, a throttle, an injection pattern, a live credential pasted into a transcript.
 * Every one of those rows left with `actorId: null` and `projectId: null`, because the helper was
 * never handed either. So the operator surface could say "seven abuse findings this week" and could
 * not say whose, which means nobody could be warned, nobody could be looked at, and the credential
 * sitting in somebody's transcript could not be traced back to the somebody.
 *
 * The identity has to be the SENDER's. The project owner is frequently not the person typing —
 * that is the entire point of collaboration — and attributing a collaborator's flood to the owner
 * would put the finding on the wrong account, which is worse than leaving it unattributed.
 *
 * STRUCTURAL, and anchored. Executing this path means standing up a SessionDO with a live socket
 * and a serialized attachment; these assertions read the ingress and the helper as text, each cut
 * from a named anchor rather than matched anywhere in a 6,000-line file, and each with a positive
 * control so a slice that found nothing cannot pass as a slice that found nothing wrong.
 *
 * Run with:  node --test tests/abuse-attribution.test.mjs      (from apps/worker)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SESSION = readFileSync(join(HERE, '..', 'src', 'do', 'session.ts'), 'utf8');

/** The chat ingress, cut from its own anchor. An empty slice fails loudly rather than passing. */
function chatCase() {
  const from = SESSION.indexOf("case 'chat':");
  const to = SESSION.indexOf("case 'edit_resend':");
  assert.ok(from >= 0 && to > from, 'the chat ingress must still exist for this to be checking anything');
  return SESSION.slice(from, to);
}

/** The helper, likewise. */
function helper() {
  const from = SESSION.indexOf('private refuseAbusive(');
  const to = SESSION.indexOf('private captureProvenance(');
  assert.ok(from >= 0 && to > from, 'the helper must still exist for this to be checking anything');
  return SESSION.slice(from, to);
}

test('CONTROL: the ingress still calls the scorer', () => {
  assert.match(chatCase(), /this\.refuseAbusive\(text/, 'without this every assertion below is vacuous');
});

test('THE INGRESS HANDS THE SCORER THE SENDER — not the owner, and not nothing', () => {
  const chat = chatCase();
  assert.match(chat, /this\.refuseAbusive\(text,\s*\{[^}]*actorId:[^}]*\}/s, 'the call must carry an actor');
  const call = chat.slice(chat.indexOf('this.refuseAbusive(text'), chat.indexOf('this.refuseAbusive(text') + 220);
  assert.match(call, /me\?\.userId/, "the actor is the socket's own verified identity");
  assert.doesNotMatch(call, /ownerId/, 'attributing a collaborator to the project owner files the case against the wrong person');
  assert.match(call, /projectId: bind\.projectId/, 'and the project it happened on');
});

test('THE RECORDED FINDING CARRIES BOTH, so the row can be followed up', () => {
  const h = helper();
  const at = h.indexOf('recordEvent(');
  assert.ok(at >= 0, 'the helper must still record what it found');
  const event = h.slice(at, h.indexOf('});', at));
  assert.match(event, /actorId: who\.actorId/, 'the event must name the account');
  assert.match(event, /projectId: who\.projectId/, 'and the project');
});

test('the identity is PASSED IN rather than invented inside the helper', () => {
  // A helper that reached for a "current user" of its own would be guessing, and would be wrong on
  // exactly the shared projects where knowing who typed it matters most.
  const h = helper();
  assert.match(h, /private refuseAbusive\(text: string, who: \{ actorId: string \| null; projectId: string \| null \}\)/,
    'the caller supplies the identity, because the caller is the only place that knows it');
  assert.doesNotMatch(h, /\bnull,?\s*\/\/ *actor/i, 'and no placeholder is hard-coded in its place');
});

test('null stays possible — a socket with no readable identity must not be given a fake one', () => {
  // `me` is null for a connection that carries no role, and `breakdownBy` counts unattributed
  // events rather than bucketing them under a plausible-looking key. A placeholder here would put
  // a tenant-shaped string in an operator's abuse table that belongs to nobody.
  const chat = chatCase();
  const call = chat.slice(chat.indexOf('this.refuseAbusive(text'), chat.indexOf('this.refuseAbusive(text') + 220);
  assert.match(call, /me\?\.userId \?\? null/, 'unknown must stay unknown');
});
