/**
 * THE DECISION AT THE MOMENT OF ANSWERING — the claim audit, then the plain line.
 *
 * `checkAtAnswer` is the whole policy in one pure function over the ledger: what the run loop does when the agent
 * stops calling tools and writes its answer. The loop itself (session.ts) only carries the decision out, so the
 * property tests live here: every path terminates and every bound holds.
 *
 * RESTATED in M4: this file also held the completion gate (force a look, ask for another look) and the "how it looks"
 * admission. The product has no vision, so there is no look to force and none to admit; the audit and the plain line stay.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { newLedger, recordToolCall } from '../src/evidence-ledger.ts';
import { checkAtAnswer, judgeWorthIt } from '../src/self-check-run.ts';
import { SELF_CHECK_LIMITS } from '../src/self-check.ts';

const red = { t: 'Color3', v: [1, 0, 0] };
const white = { t: 'Color3', v: [1, 1, 1] };
const change = (l, props = { Color: red }) => recordToolCall(l, { tool: 'set_properties', kind: 'mutation', args: { path: 'game.Workspace.Door', props }, result: {}, ok: true });
const readback = (l, props) => recordToolCall(l, { tool: 'get_instance', kind: 'read', args: {}, result: { path: 'game.Workspace.Door', name: 'Door', props }, ok: true });
const CAN = { read: true, play: true };
const at = (l, reply, extra = {}) => checkAtAnswer({ ledger: l, reply, can: CAN, ...extra });

test('a contradicted reply is sent back to the agent with what the read-back said', () => {
  const l = newLedger();
  change(l);
  readback(l, { Color: white });
  const d = at(l, 'I painted the door red.');
  assert.equal(d.action, 'steer');
  assert.equal(d.kind, 'audit');
  assert.match(d.message, /white/);
  assert.equal(l.auditRounds, 1);
});

test('audit rounds are bounded at two; after that the plain line is the answer and the agent\'s words are untouched', () => {
  const l = newLedger();
  change(l);
  readback(l, { Color: white });
  const kinds = [];
  let last;
  for (let i = 0; i < 6; i++) {
    last = at(l, 'I painted the door red.');
    kinds.push(`${last.action}${last.kind ? `:${last.kind}` : ''}`);
    if (last.action === 'finish') break;
  }
  assert.deepEqual(kinds, ['steer:audit', 'steer:audit', 'finish']);
  assert.equal(l.auditRounds, SELF_CHECK_LIMITS.auditRounds);
  assert.match(last.note, /^What I did not check: .*door/);
});

test('a reply with nothing to flag finishes with no note at all, and never admits anything about how it looks', () => {
  const l = newLedger();
  change(l);
  const d = at(l, 'The door is in the wall.');
  assert.deepEqual(d, { action: 'finish' });
  const spoken = at(l, 'The door is in the wall.', { can: { read: false, play: false } });
  assert.deepEqual(spoken, { action: 'finish' }, 'a run that changed the place is not made to say "I could not look": there is no look');
});

test('a claim no offered tool could settle is not sent back: it goes to the line', () => {
  const l = newLedger();
  change(l);
  const d = at(l, 'The chest opens when you click it.', { can: { read: true, play: false } });
  assert.equal(d.action, 'finish');
  assert.match(d.note, /it works as I said/);
  assert.equal(l.auditRounds, 0, 'no round was spent');
});

test('a run that never touched Studio is not audited: there is nothing to check a claim against', () => {
  const l = newLedger();
  assert.deepEqual(at(l, 'I painted the door red. The sign says "Hello".'), { action: 'finish' });
});

test('extra findings (the judge) are added to the audit and never remove one', () => {
  const l = newLedger();
  change(l);
  const d = at(l, 'The door is in the wall.', {
    extra: [{ claim: { kind: 'other', sentence: 'The door is in the wall.' }, verdict: 'unsupported', because: 'nothing this run observed says either way', needs: 'read' }],
  });
  assert.equal(d.action, 'steer');
  assert.equal(d.kind, 'audit');
});

test('EVERY PATH TERMINATES: whatever the agent does, the number of extra rounds is bounded', () => {
  // A worst-case agent: changes the place and repeats a contradicted claim at every answer.
  const l = newLedger();
  change(l);
  readback(l, { Color: white });
  let rounds = 0;
  for (let i = 0; i < 50; i++) {
    const d = at(l, 'I painted the door red.');
    if (d.action === 'finish') break;
    rounds += 1;
    change(l, { Color: red });
    readback(l, { Color: white });
  }
  assert.equal(rounds, SELF_CHECK_LIMITS.auditRounds, `${rounds} extra rounds`);
});

test('the judge is worth a call only when something was done in Studio and an audit round is left', () => {
  const input = (l) => ({ ledger: l, reply: 'Done. The lamp turns on at night.', can: CAN });
  const never = newLedger();
  assert.equal(judgeWorthIt(input(never)), false, 'nothing was done in Studio');
  const ready = newLedger();
  change(ready);
  assert.equal(judgeWorthIt(input(ready)), true);
  ready.auditRounds = SELF_CHECK_LIMITS.auditRounds;
  assert.equal(judgeWorthIt(input(ready)), false, 'no round left to send a finding back in');
});

// Benchmark 2026-10-04, item o01 with SELF_CHECK on: the agent's first answer had already streamed to the user when the check
// sent it back, and its next answer restated the first; the user read the same paragraph three times. Every message the check
// sends back says the earlier answer was already read, so the next one carries only what is new or corrected.
test('every message the self-check sends back says the earlier answer was already read', async () => {
  const A = await import('../src/claim-audit.ts');
  const shown = /already read your previous answer/i;
  const steer = A.steerForFindings(A.auditReply('The chest opens when you click it.', newLedger()), { read: true, play: true });
  assert.ok(steer, 'an unsupported claim produces a steer — this check would be vacuous otherwise');
  assert.match(steer, shown);
  assert.ok(A.ALREADY_SHOWN && shown.test(A.ALREADY_SHOWN), 'one shared sentence, not three copies');
  const l = newLedger();
  change(l);
  readback(l, { Color: white });
  assert.match(at(l, 'I painted the door red.').message, shown, 'and the loop\'s own steer carries it');
});
