// Gauntlet round 3 (2026-09-23, Apple MAX, "make the full game"): 78 ops in, the model re-read the
// same scripts while chasing one defect, three all-duplicate steps ended the run, and the plan's
// next step ("Player HUD and shop screen") was never built. A stuck step is not a finished run.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterDuplicateStreak, UNSTICKS_PER_RUN, UNSTICK_STEER } from '../src/run-idle.ts';

const SESSION = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'do', 'session.ts'), 'utf8')
  .replace(/\/\/\[\[[\s\S]*?\]\]/g, '')
  .replace(/\/\/[^\n]*/g, '');

const at = (o) => afterDuplicateStreak({ streak: 3, limit: 3, building: true, unstucks: 0, workOpen: true, ...o });

test('below the limit nothing happens', () => {
  assert.equal(at({ streak: 2 }), 'continue');
});

test('an Agent run with work still open is moved on, not ended', () => {
  assert.equal(at({}), 'unstick');
});

test('the move-on is bounded per run, so a truly stuck run still ends', () => {
  assert.ok(UNSTICKS_PER_RUN >= 1 && UNSTICKS_PER_RUN <= 3);
  assert.equal(at({ unstucks: UNSTICKS_PER_RUN }), 'end');
});

test('a run that cannot build, or has nothing left to do, ends as before', () => {
  assert.equal(at({ building: false }), 'end');
  assert.equal(at({ workOpen: false }), 'end');
});

// Gauntlet round 4 (2026-09-23, run a933ac87): Autonomous was off, the plan's "Audit and light the
// scene" was still open, and three duplicate steps ended a "make the full game" run after 6 minutes.
// Whether the user pre-approved tools says nothing about whether the work is finished.
test('an Agent run with open work is moved on whether or not Autonomous is on', () => {
  assert.equal(afterDuplicateStreak({ streak: 3, limit: 3, building: true, unstucks: 0, workOpen: true }), 'unstick');
  const call = SESSION.match(/afterDuplicateStreak\(\{[\s\S]*?\}\)/);
  assert.ok(call, 'the session call was not found');
  assert.doesNotMatch(call[0], /autonomous/, 'the move-on still depends on the Autonomous switch');
});

test('the steer does not assume the repeats were reads', () => {
  assert.doesNotMatch(UNSTICK_STEER, /repeated reads/i);
});

test('the steer tells the model to leave the stuck detail and build the next missing piece', () => {
  assert.match(UNSTICK_STEER, /stop (re-?reading|investigating)/i);
  assert.match(UNSTICK_STEER, /next/i);
  assert.doesNotMatch(UNSTICK_STEER, /garden|plot|seed/i, 'the steer names no game');
});

test('the session uses the decision, withholds reads for the next step, and says which step', () => {
  assert.match(SESSION, /afterDuplicateStreak\(/);
  assert.match(SESSION, /readsWithheldOnce/);
  // the withheld set only removes tools, and only the non-mutating ones
  assert.match(SESSION, /readsWithheldOnce[\s\S]{0,400}READ_ONLY_WITHHELD\.has\(/);
});
