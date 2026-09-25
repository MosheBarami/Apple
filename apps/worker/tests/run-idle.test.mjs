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
  // The trim's budget is pinned behaviourally in run-loop-traps.test.mjs (derived from the model) and
  // prompt-budget.test.mjs, not by spelling here.
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
  assert.match(SESSION, /if \(retuneThisStep === 'finish'\) \{[\s\S]{0,900}await this\.finishRun\(agent, 'incomplete'\);/);
  assert.match(SESSION, /if \(retuneThisStep === 'nudge'\) \{\s*agent\.llm\.push\(/);
});

// 2026-09-23: bound endings said "What it built is in your place" and nothing about what that was.
test('a stopped run says what it changed, counted from its own trace', async () => {
  const { builtSummary } = await import('../src/run-idle.ts');
  const mutating = new Set(['edit_terrain', 'create_instances', 'transform_instances']);
  const trace = [
    { tool: 'get_project_tree', ok: true },
    { tool: 'edit_terrain', ok: true }, { tool: 'edit_terrain', ok: true }, { tool: 'edit_terrain', ok: false },
    { tool: 'create_instances', ok: true },
    { tool: 'transform_instances', ok: true }, { tool: 'transform_instances', ok: true }, { tool: 'transform_instances', ok: true },
  ];
  assert.equal(builtSummary(trace, mutating), 'It made 6 changes in your place: moves and resizes (3), terrain (2), new objects (1).');
  assert.equal(builtSummary([{ tool: 'get_project_tree', ok: true }], mutating), '', 'a run that changed nothing claims nothing');
});

test('every bound ending that follows a change carries the count', async () => {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('../src/do/session.ts', import.meta.url), 'utf8');
  for (const lead of ['kept repeating a step it had already done. ', 'instead of building the rest. ', 'many times in a row. ']) {
    const at = src.indexOf(lead);
    assert.ok(at > 0, `ending "${lead.trim()}" not found — this checks nothing`);
    assert.match(src.slice(at, at + 120), /builtSummary\(agent\.trace, READ_ONLY_WITHHELD\)/, `"${lead.trim()}" does not say what was changed`);
  }
});

test('an Autonomous reply that names owed work or asks leave to continue is recognised; a finished one is not', async () => {
  const { leavesWorkOpen } = await import('../src/run-idle.ts');
  // the gauntlet round-2 ending, verbatim in shape
  assert.ok(leavesWorkOpen("audit_build still reports one real defect I have not fixed yet. Want me to fix the z-fighting next, then run the playtest?"));
  assert.ok(leavesWorkOpen('The loop has not been playtested yet.'));
  assert.ok(leavesWorkOpen('Should I add a shop next?'));
  assert.ok(!leavesWorkOpen('Built six plots, a seed shop and a sell stand. The playtest passed: planting, growing and selling all work.'));
  assert.ok(!leavesWorkOpen(''));
});

test('the run loop hands an Autonomous run its owed work back, bounded, instead of ending on a question', async () => {
  const { AUTONOMOUS_CONTINUES } = await import('../src/run-idle.ts');
  assert.ok(AUTONOMOUS_CONTINUES >= 1 && AUTONOMOUS_CONTINUES <= 5, 'unbounded or disabled');
  // prose ending: autonomous + changed + can build + reply leaves work open -> steer, not finishRun
  assert.match(SESSION, /agent\.autonomous && agent\.mutated && canBuild[\s\S]{0,200}leavesWorkOpen\(res\.text\)[\s)]*\{[\s\S]{0,200}AUTONOMOUS_CONTINUE_STEER[\s\S]{0,200}setAlarm[\s\S]{0,30}return;/);
  // idle bound: autonomous runs are steered before the finish branch can end them
  assert.match(SESSION, /if \(idle\.action === 'finish' && agent\.autonomous && \(agent\.autonomousContinues \?\? 0\) < AUTONOMOUS_CONTINUES\) \{[\s\S]{0,400}AUTONOMOUS_IDLE_STEER[\s\S]{0,40}\} else if \(idle\.action === 'finish'\)/);
  // the nudge must not tell an Autonomous run to "reply to the user now"
  assert.match(SESSION, /if \(idle\.action === 'nudge'\) \{\s*agent\.llm\.push\(\{\s*role: 'user',\s*content: agent\.autonomous \? AUTONOMOUS_IDLE_STEER/);
});

test('a built game with nothing on screen or an unplayed loop is not finished; other requests owe nothing', async () => {
  const { gameGaps, gameGapSteer } = await import('../src/run-idle.ts');
  const ask = 'Build Basically Grow A Garden Type Game include 6 plots make the full game make no mistakes';
  assert.deepEqual(gameGaps(ask, {}, true), ['hud', 'playtest']);
  assert.deepEqual(gameGaps(ask, { hudBuilt: true }, true), ['playtest']);
  assert.deepEqual(gameGaps(ask, { hudBuilt: true, playChecked: true }, true), []);
  // a run that cannot play is not told to
  assert.deepEqual(gameGaps('make an obby', { hudBuilt: true }, false), []);
  // not a game: a prop, or no request at all
  assert.deepEqual(gameGaps('build a wooden bridge over the river', {}, true), []);
  assert.deepEqual(gameGaps(undefined, {}, true), []);
  const steer = gameGapSteer(['hud', 'playtest']);
  assert.match(steer, /ScreenGui/);
  assert.match(steer, /play_check/);
  assert.doesNotMatch(steer, /garden|plot|seed/i, 'the steer teaches one game instead of games');
});

test('the run loop records the HUD and the playtest, and steers an unfinished game before it can end', () => {
  assert.match(SESSION, /out\.mutatedProject === true && \(call\.name === 'build_ui' \|\| call\.name === 'insert_ui_component' \|\| \/ScreenGui\|ui_kit\/\.test\(call\.arguments[^)]*\)\)\) agent\.hudBuilt = true/);
  assert.match(SESSION, /out\.ok && call\.name === 'play_check'\) agent\.playChecked = true/);
  // every Autonomous ending consults the game gaps: prose, idle, and the duplicate-streak unstick
  const uses = SESSION.match(/gameGaps\(agent\.request, agent, allowed\.has\('play_check'\)\)/g) ?? [];
  assert.equal(uses.length, 3, 'the prose, idle and duplicate-streak endings must all check the game');
  assert.match(SESSION, /gaps\.length > 0 \|\| leavesWorkOpen\(res\.text\)/);
});
