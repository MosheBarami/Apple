// Built and checked, then only reading — see src/run-idle.ts for the measurement.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterStep, IDLE_AFTER_VERIFY_NUDGE, IDLE_AFTER_VERIFY_LIMIT, ANSWER_ONLY_NUDGE, READ_STALL_NUDGE, READ_STALL_LIMIT } from '../src/run-idle.ts';

const WORKER = join(dirname(fileURLToPath(import.meta.url)), '..');
const SESSION = readFileSync(join(WORKER, 'src', 'do', 'session.ts'), 'utf8');

const READ = { mutated: false, verified: false, calls: 1 };
const run = (steps) => {
  let state = {};
  const actions = [];
  for (const s of steps) {
    const next = afterStep(state, s);
    actions.push(next.action);
    state = { verifiedAfterMutation: next.verifiedAfterMutation, idleAfterVerify: next.idleAfterVerify, readsSinceChange: next.readsSinceChange };
  }
  return { state, actions };
};

test('the measured shape — build, check, then only reads — is nudged once, then ended', () => {
  const { actions } = run([
    { mutated: true, verified: false, calls: 1 },
    { mutated: false, verified: true, calls: 1 },
    ...Array.from({ length: 30 }, () => READ),
  ]);
  const nudgeAt = actions.indexOf('nudge');
  const finishAt = actions.indexOf('finish');
  assert.equal(nudgeAt, 2 + IDLE_AFTER_VERIFY_NUDGE - 1, 'nudged after the fourth read-only step');
  assert.equal(actions.filter((a) => a === 'nudge').length, 1, 'nudged once, not every step');
  assert.equal(finishAt, 2 + IDLE_AFTER_VERIFY_LIMIT - 1, 'ended at the limit, not 30 paid steps later');
});

test('a run still fixing things is never counted: each change clears the check', () => {
  const steps = [];
  for (let i = 0; i < 10; i++) steps.push({ mutated: true, verified: false, calls: 1 }, { mutated: false, verified: true, calls: 1 }, READ, READ);
  assert.ok(run(steps).actions.every((a) => a === 'none'));
});

test('reads before any check are not idle — investigating before building is work', () => {
  const { actions } = run([{ mutated: true, verified: false, calls: 1 }, ...Array.from({ length: 12 }, () => READ)]);
  assert.ok(actions.every((a) => a === 'none'), 'no verifier passed after the change, so nothing is counted');
});

test('a prose step resets the count; a check and a change in one step does not count as checked', () => {
  const { state } = run([{ mutated: true, verified: false, calls: 1 }, { mutated: false, verified: true, calls: 1 }, READ, READ,
    { mutated: false, verified: false, calls: 0 }]);
  assert.equal(state.idleAfterVerify, 0);
  const same = afterStep({}, { mutated: true, verified: true, calls: 2 });
  assert.equal(same.verifiedAfterMutation, false, 'the order inside one step is unknown, so the check may predate the change');
});

test('the run loop feeds every step through afterStep and acts on its answer', () => {
  // The property: every step's facts reach afterStep. Further facts may be added (canBuild was, 2026-09-23).
  assert.match(SESSION, /const idle = afterStep\(agent, \{\s*mutated: mutatedThisStep,\s*verified: verifiedThisStep,\s*calls: executedThisStep \+ duplicatesThisStep,\s*answerOnly: agent\.readOnly === true,[^}]*\}\);/);
  assert.match(SESSION, /if \(idle\.action === 'answer'\) \{\s*agent\.llm\.push\(/);
  assert.match(SESSION, /if \(idle\.action === 'finish'\) \{[\s\S]{0,700}await this\.finishRun\(agent, 'done'\);/);
  assert.match(SESSION, /if \(idle\.action === 'nudge'\) \{\s*agent\.llm\.push\(/);
  // Both facts come from the tool loop itself, not from a name list kept beside it.
  assert.match(SESSION, /if \(out\.mutatedProject === true\) \{\s*agent\.mutated = true;\s*mutatedThisStep = true;/);
  assert.match(SESSION, /if \(out\.ok && VERIFIERS\.has\(call\.name\) && agent\.mutated\) verifiedThisStep = true;/);
  assert.match(SESSION, /const VERIFIERS = new Set<string>\(VERIFIER_TOOLS\);/);
});

test('a change after the check needs a new check before reads count again', () => {
  const { actions } = run([
    { mutated: true, verified: false, calls: 1 },
    { mutated: false, verified: true, calls: 1 },
    { mutated: true, verified: false, calls: 1 },   // changed again, not re-checked
    ...Array.from({ length: 12 }, () => READ),
  ]);
  assert.ok(actions.every((a) => a === 'none'), 'the earlier check does not cover the later change');
});

// 2026-09-22, run 5034f8f2: "What parts make up the StreetLamp model? Just tell me, don't change
// anything." read the model and the tree, then kept reading until the duplicate guard ended it.
test('a run told not to change anything is told to answer after a few reads, once, and never ended by it', () => {
  const RO = { mutated: false, verified: false, calls: 1, answerOnly: true };
  const { actions } = run(Array.from({ length: 20 }, () => RO));
  assert.equal(actions.indexOf('answer'), ANSWER_ONLY_NUDGE - 1);
  assert.equal(actions.filter((a) => a === 'answer').length, 1, 'told once, not every step');
  assert.ok(!actions.includes('finish'), 'a read-only run is never ended by this bound — it has nothing built to end on');
});

test('control: an ordinary run reading before any change is still not idle', () => {
  const { actions } = run(Array.from({ length: 20 }, () => ({ mutated: false, verified: false, calls: 1 })));
  assert.ok(actions.every((a) => a === 'none'));
});

// Reading without building — run c71b89a9, 2026-09-23: one install, then 88 read-only calls, 242 Credits.
const BUILD_READ = { mutated: false, verified: false, calls: 1, canBuild: true };

test('the coin-game shape — one change, then only reads — is told to build, then ended', () => {
  const { actions } = run([{ mutated: true, verified: false, calls: 1, canBuild: true }, ...Array.from({ length: 40 }, () => BUILD_READ)]);
  assert.equal(actions.indexOf('build'), READ_STALL_NUDGE, 'told to build after the tenth read-only step');
  assert.equal(actions.filter((a) => a === 'build').length, 1, 'told once, not every step');
  assert.equal(actions.indexOf('stall'), READ_STALL_LIMIT, 'ended at the limit rather than 88 paid steps later');
});

test('reading before the first change is bounded too, and a change or a check restarts the count', () => {
  const { actions } = run(Array.from({ length: 25 }, () => BUILD_READ));
  assert.equal(actions.indexOf('stall'), READ_STALL_LIMIT - 1);
  const steps = [];
  for (let i = 0; i < 6; i++) steps.push(...Array.from({ length: READ_STALL_NUDGE - 1 }, () => BUILD_READ), { mutated: true, verified: false, calls: 1, canBuild: true });
  assert.ok(run(steps).actions.every((a) => a === 'none'), 'a run that keeps building between reads is never counted');
});

test('a run that cannot build (Plan mode, Studio disconnected) or owes only an answer is not counted', () => {
  assert.ok(run(Array.from({ length: 30 }, () => ({ ...BUILD_READ, canBuild: false }))).actions.every((a) => a === 'none'));
  assert.ok(!run(Array.from({ length: 30 }, () => ({ ...BUILD_READ, answerOnly: true }))).actions.includes('stall'));
});

test('after a passing check the stricter after-verify bound decides, not this one', () => {
  const { actions } = run([{ mutated: true, verified: false, calls: 1, canBuild: true }, { mutated: false, verified: true, calls: 1, canBuild: true },
    ...Array.from({ length: 30 }, () => BUILD_READ)]);
  assert.ok(!actions.includes('build') && !actions.includes('stall'));
  assert.equal(actions.indexOf('finish'), 2 + IDLE_AFTER_VERIFY_LIMIT - 1);
});

test('the run loop passes canBuild, ends a stalled run as incomplete, and tells a reading run to build', () => {
  assert.match(SESSION, /answerOnly: agent\.readOnly === true,\s*canBuild,\s*\}\);/);
  assert.match(SESSION, /if \(idle\.action === 'stall'\) \{[\s\S]{0,900}await this\.finishRun\(agent, 'incomplete'\);/);
  assert.match(SESSION, /if \(idle\.action === 'build'\) \{\s*agent\.llm\.push\(/);
  assert.match(SESSION, /trimTranscriptReport\(agent\.llm, MAX_PROMPT_CHARS, MAX_PROMPT_TARGET\)/);
});

// Changing the same thing over and over — F-036, 101 steps re-tuning one Lighting value.
test('the same target changed again and again is told to stop tuning, then ended; other targets are separate', async () => {
  const { afterChange, RETUNE_NUDGE, RETUNE_LIMIT, RETUNE_KEYS } = await import('../src/run-idle.ts');
  let counts; const actions = [];
  for (let i = 0; i < RETUNE_LIMIT; i++) { const r = afterChange(counts, 'set_props game.Lighting'); counts = r.counts; actions.push(r.action); }
  assert.equal(actions.indexOf('nudge'), RETUNE_NUDGE - 1);
  assert.equal(actions.filter((a) => a === 'nudge').length, 1);
  assert.equal(actions.at(-1), 'finish');
  let spread; const spreadActions = [];
  for (let i = 0; i < 40; i++) { const r = afterChange(spread, `create_instances Coin${i}`); spread = r.counts; spreadActions.push(r.action); }
  assert.ok(spreadActions.every((a) => a === 'none'), 'forty different targets are forty pieces of work, not one retune');
  assert.ok(Object.keys(spread).length <= RETUNE_KEYS, 'the remembered targets are bounded');
});

test('the run loop counts each successful change by its target and acts on the answer', () => {
  assert.match(SESSION, /if \(out\.mutatedProject === true\) \{\s*agent\.mutated = true;\s*mutatedThisStep = true;\s*const retune = afterChange\(agent\.changesByTarget, `\$\{call\.name\} \$\{aim\(call\.arguments\)\}`\);/);
  assert.match(SESSION, /if \(retuneThisStep === 'finish'\) \{[\s\S]{0,900}await this\.finishRun\(agent, 'done'\);/);
  assert.match(SESSION, /if \(retuneThisStep === 'nudge'\) \{\s*agent\.llm\.push\(/);
});
