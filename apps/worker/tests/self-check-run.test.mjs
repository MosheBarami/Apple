/**
 * THE DECISION AT THE MOMENT OF ANSWERING — gate first, then the claim audit, then the plain line.
 *
 * `checkAtAnswer` is the whole policy in one pure function over the ledger: what the run loop does when the agent
 * stops calling tools and writes its answer. The loop itself (session.ts) only carries the decision out, so the
 * property tests live here: every path terminates, every bound holds, and the order is always gate before audit
 * (the audit may lean on what the look saw, so the look comes first).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { newLedger, recordToolCall, recordLook } from '../src/evidence-ledger.ts';
import { checkAtAnswer, forcedLookMessage, askLookMessage, judgeWorthIt } from '../src/self-check-run.ts';
import { SELF_CHECK_LIMITS } from '../src/self-check.ts';

const red = { t: 'Color3', v: [1, 0, 0] };
const white = { t: 'Color3', v: [1, 1, 1] };
const change = (l, props = { Color: red }) => recordToolCall(l, { tool: 'set_properties', kind: 'mutation', args: { path: 'game.Workspace.Door', props }, result: {}, ok: true });
const readback = (l, props) => recordToolCall(l, { tool: 'get_instance', kind: 'read', args: {}, result: { path: 'game.Workspace.Door', name: 'Door', props }, ok: true });
const looked = (l) => recordLook(l, { ok: true, source: 'studio_viewport', views: ['front'], observations: [{ about: 'door', verdict: 'seen', note: 'a door' }], answers: [], issues: [] });
const CAN = { read: true, play: true, look: true };
const at = (l, reply, extra = {}) => checkAtAnswer({ ledger: l, reply, lookAvailable: true, studioConnected: true, can: CAN, ...extra });

test('changed and never looked: the look is forced before anything is said about the reply', () => {
  const l = newLedger();
  change(l);
  const d = at(l, 'I painted the door red.');
  assert.equal(d.action, 'force_look');
  assert.equal(l.forcedLooks, 1);
});

test('the gate comes before the audit: a contradicted reply is not sent back until the work has been looked at', () => {
  const l = newLedger();
  change(l);
  readback(l, { Color: white });
  assert.equal(at(l, 'I painted the door red.').action, 'force_look');
  looked(l);
  const d = at(l, 'I painted the door red.');
  assert.equal(d.action, 'steer');
  assert.equal(d.kind, 'audit');
  assert.match(d.message, /white/);
});

test('audit rounds are bounded at two; after that the plain line is the answer and the agent\'s words are untouched', () => {
  const l = newLedger();
  change(l);
  readback(l, { Color: white });
  looked(l);
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

test('a reply with nothing to flag finishes with no note at all', () => {
  const l = newLedger();
  change(l);
  looked(l);
  const d = at(l, 'The door is in the wall.');
  assert.deepEqual(d, { action: 'finish' });
});

test('work that was never looked at (the gate stepped aside) is admitted in the line, with the reply\'s other unchecked claims', () => {
  const l = newLedger();
  change(l);
  const d = at(l, 'The door is in the wall.', { lookAvailable: false });
  assert.equal(d.action, 'finish');
  assert.match(d.note, /how it looks in Studio \(I could not look at it this time\)/);
});

test('a claim no offered tool could settle is not sent back: it goes to the line', () => {
  const l = newLedger();
  change(l);
  looked(l);
  const d = at(l, 'The chest opens when you click it.', { can: { read: true, play: false, look: true } });
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
  looked(l);
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
    if (d.action === 'force_look') looked(l);
    if (d.kind === 'look') { change(l, { Color: red }); readback(l, { Color: white }); }
    if (d.kind === 'audit') change(l, { Color: red });
  }
  assert.ok(rounds <= SELF_CHECK_LIMITS.forcedLooks + SELF_CHECK_LIMITS.repairRounds + SELF_CHECK_LIMITS.auditRounds, `${rounds} extra rounds`);
});

test('the messages the loop hands the agent are plain, short and name what to do', () => {
  assert.match(askLookMessage(), /call look/i);
  assert.ok(askLookMessage().length < 500);
  const m = forcedLookMessage('<observations>x</observations>');
  assert.match(m, /observations, not a score/i);
  assert.match(m, /<observations>x<\/observations>/);
  assert.match(m, /fix it now/i);
  assert.ok(m.length < 1500);
});

test('the judge is worth a call only when the answer could actually go through: gate open, something done in Studio, audit rounds left', () => {
  const input = (l) => ({ ledger: l, reply: 'Done. The lamp turns on at night.', lookAvailable: true, studioConnected: true, can: CAN });
  const never = newLedger();
  assert.equal(judgeWorthIt(input(never)), false, 'nothing was done in Studio');
  const unlooked = newLedger();
  change(unlooked);
  assert.equal(judgeWorthIt(input(unlooked)), false, 'the gate would force a look first; the reply is not final yet');
  const ready = newLedger();
  change(ready);
  looked(ready);
  assert.equal(judgeWorthIt(input(ready)), true);
  ready.auditRounds = SELF_CHECK_LIMITS.auditRounds;
  assert.equal(judgeWorthIt(input(ready)), false, 'no round left to send a finding back in');
});

// Benchmark 2026-10-04, item o01 with SELF_CHECK on: the agent's first answer had already streamed to the user when the check
// sent it back, and its next answer restated the first; the user read the same paragraph three times. Every message the check
// sends back says the earlier answer was already read, so the next one carries only what is new or corrected.
test('every message the self-check sends back says the earlier answer was already read', async () => {
  const R = await import('../src/self-check-run.ts');
  const A = await import('../src/claim-audit.ts');
  const shown = /already read your previous answer/i;
  assert.match(R.askLookMessage(), shown);
  assert.match(R.forcedLookMessage('front: seen'), shown);
  const steer = A.steerForFindings(A.auditReply('The chest opens when you click it.', newLedger()), { read: true, play: true, look: true });
  assert.ok(steer, 'an unsupported claim produces a steer — this check would be vacuous otherwise');
  assert.match(steer, shown);
  assert.ok(A.ALREADY_SHOWN && shown.test(A.ALREADY_SHOWN), 'one shared sentence, not three copies');
});
