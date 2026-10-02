/**
 * THE COMPLETION GATE: a run that changed the place does not answer before one look at it.
 *
 * Structural, on purpose: the gate reads only the ledger and what the run was offered. No word in the request, no
 * category of request and no keyword decides whether something "is visual" — that is the agent's call to make,
 * and a gate that guessed it would be the harness deciding what looks good.
 *
 * Bounds under test (frozen in self-check.ts): 1 forced look, 2 repair rounds, 6 looks per run.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { newLedger, recordToolCall, recordLook } from '../src/evidence-ledger.ts';
import { decideLookGate, noteGate, lookExtra } from '../src/look-gate.ts';
import { SELF_CHECK_LIMITS } from '../src/self-check.ts';

const change = (l, name = 'A') => recordToolCall(l, { tool: 'create_instances', kind: 'mutation', args: { items: [{ className: 'Part', name, parent: 'game.Workspace' }] }, result: {}, ok: true });
const looked = (l) => recordLook(l, { ok: true, source: 'studio_viewport', views: ['front'], observations: [{ about: 'a part', verdict: 'seen', note: 'a block' }], answers: [], issues: [] });
const failedLook = (l) => recordLook(l, { ok: false, source: 'none', views: [], observations: [], answers: [], issues: [], error: 'no capture' });
const CAN = { lookAvailable: true, studioConnected: true };

test('a run that changed nothing is not stopped: there is nothing to look at', () => {
  assert.equal(decideLookGate({ ledger: newLedger(), ...CAN }).action, 'pass');
});

test('changed and never looked: the gate forces one look', () => {
  const l = newLedger();
  change(l);
  const d = decideLookGate({ ledger: l, ...CAN });
  assert.equal(d.action, 'force_look');
  assert.match(d.why, /changed/i);
});

test('a run that only changed screens and scripts is not stopped for a look at a viewport that cannot show them', () => {
  const l = newLedger();
  recordToolCall(l, { tool: 'set_properties', kind: 'mutation', args: { path: 'game.StarterGui.Hud.Title', props: {} }, result: {}, ok: true });
  recordToolCall(l, { tool: 'edit_script', kind: 'mutation', args: { path: 'game.ServerScriptService.Main' }, result: {}, ok: true });
  const d = decideLookGate({ ledger: l, ...CAN });
  assert.equal(d.action, 'pass');
  assert.equal(lookExtra(l, { lookAvailable: true }), null, 'nothing about the viewport is unchecked, so the line does not claim it is');
});

test('a look that failed on the work in view is not forced again after a change that is out of view', () => {
  const l = newLedger();
  change(l);
  failedLook(l);
  recordToolCall(l, { tool: 'edit_script', kind: 'mutation', args: { path: 'game.ServerScriptService.Main' }, result: {}, ok: true });
  assert.equal(decideLookGate({ ledger: l, ...CAN }).action, 'pass');
});

test('no Studio, or no look offered: the gate steps aside (it cannot demand what cannot be done)', () => {
  const l = newLedger();
  change(l);
  assert.equal(decideLookGate({ ledger: l, lookAvailable: true, studioConnected: false }).action, 'pass');
  assert.equal(decideLookGate({ ledger: l, lookAvailable: false, studioConnected: true }).action, 'pass');
});

test('already looked after the last change: pass', () => {
  const l = newLedger();
  change(l);
  looked(l);
  assert.equal(decideLookGate({ ledger: l, ...CAN }).action, 'pass');
});

test('a look that could not run is not retried by force: the gate steps aside', () => {
  const l = newLedger();
  change(l);
  failedLook(l);
  const d = decideLookGate({ ledger: l, ...CAN });
  assert.equal(d.action, 'pass');
  assert.match(d.why, /could not/i);
});

test('changes after a look that the agent made itself: the agent is asked to look again, not forced', () => {
  const l = newLedger();
  change(l);
  looked(l);
  change(l, 'B');
  const d = decideLookGate({ ledger: l, ...CAN });
  assert.equal(d.action, 'ask_look');
});

test('repair rounds are bounded: two asks, then the gate lets the answer through', () => {
  const l = newLedger();
  change(l);
  looked(l);
  const actions = [];
  for (let i = 0; i < 5; i++) {
    change(l, `R${i}`);
    const d = decideLookGate({ ledger: l, ...CAN });
    actions.push(d.action);
    noteGate(l, d);
    if (d.action === 'ask_look') looked(l); // the agent complies each time
  }
  assert.deepEqual(actions, ['ask_look', 'ask_look', 'pass', 'pass', 'pass']);
  assert.equal(l.repairRounds, SELF_CHECK_LIMITS.repairRounds);
});

test('the forced look happens once per run, however many times the gate is asked', () => {
  const l = newLedger();
  change(l);
  const first = decideLookGate({ ledger: l, ...CAN });
  assert.equal(first.action, 'force_look');
  noteGate(l, first);
  // The forced look did not happen (suppose it threw before recording): the gate must not force a second one.
  const second = decideLookGate({ ledger: l, ...CAN });
  assert.notEqual(second.action, 'force_look');
  assert.equal(l.forcedLooks, SELF_CHECK_LIMITS.forcedLooks);
});

test('the per-run look cap ends the gate even with changes outstanding', () => {
  const l = newLedger();
  for (let i = 0; i < SELF_CHECK_LIMITS.looksPerRun; i++) looked(l);
  change(l);
  const d = decideLookGate({ ledger: l, ...CAN });
  assert.equal(d.action, 'pass');
  assert.match(d.why, /limit/i);
});

test('the gate never reads the request: the same ledger gives the same decision whatever was asked', () => {
  const l = newLedger();
  change(l);
  const a = decideLookGate({ ledger: l, ...CAN, request: 'make a spawn platform' });
  const b = decideLookGate({ ledger: l, ...CAN, request: 'write a leaderboard script' });
  const c = decideLookGate({ ledger: l, ...CAN });
  assert.deepEqual([a.action, b.action], [c.action, c.action]);
});

test('lookExtra: what the final line must admit when the work was not looked at', () => {
  const l = newLedger();
  assert.equal(lookExtra(l, { lookAvailable: true }), null, 'nothing changed, nothing to admit');
  change(l);
  assert.match(lookExtra(l, { lookAvailable: true }), /how it looks/);
  assert.match(lookExtra(l, { lookAvailable: false }), /could not look/);
  looked(l);
  assert.equal(lookExtra(l, { lookAvailable: true }), null);
});
