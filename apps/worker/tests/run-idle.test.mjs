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
  const { afterChange, RETUNE_NUDGE, RETUNE_LIMIT } = await import('../src/run-idle.ts');
  let counts; const actions = [];
  for (let i = 0; i < RETUNE_LIMIT; i++) { const r = afterChange(counts, 'set_props game.Lighting'); counts = r.counts; actions.push(r.action); }
  assert.equal(actions.indexOf('nudge'), RETUNE_NUDGE - 1);
  assert.equal(actions.filter((a) => a === 'nudge').length, 1);
  assert.equal(actions.at(-1), 'finish');
  let spread; const spreadActions = [];
  for (let i = 0; i < 40; i++) { const r = afterChange(spread, `create_instances Coin${i}`); spread = r.counts; spreadActions.push(r.action); }
  assert.ok(spreadActions.every((a) => a === 'none'), 'forty different targets are forty pieces of work, not one retune');
  assert.ok(Object.keys(spread).length <= 1, 'only the current run of one target is remembered');
  let mixed; const mixedActions = [];
  for (let i = 0; i < 3 * RETUNE_LIMIT; i++) {
    const key = i % 3 === 2 ? 'edit_script game.ServerScriptService.Server' : 'edit_script game.StarterPlayer.Client';
    const r = afterChange(mixed, key); mixed = r.counts; mixedActions.push(r.action);
  }
  assert.ok(mixedActions.every((a) => a === 'none'), 'a script edited many times between other changes is building, not retuning');
});

test('the run loop counts each successful change by its target and acts on the answer', () => {
  assert.match(SESSION, /if \(out\.mutatedProject === true\) \{\s*agent\.mutated = true;\s*mutatedThisStep = true;\s*const retune = afterChange\(agent\.changesByTarget, `\$\{call\.name\} \$\{aim\(call\.arguments\)\}`\);/);
  assert.match(SESSION, /if \(retuneThisStep === 'finish'\) \{[\s\S]{0,900}await this\.finishRun\(agent, 'incomplete'\);/);
  assert.match(SESSION, /if \(retuneThisStep === 'nudge'\) \{\s*agent\.llm\.push\(/);
});

// 2026-09-23: bound endings said "What it built is in your place" and nothing about what that was.
// 2026-09-30: and once they did, they named tools ("recreate owner game (1)"). They now name what the user got.
test('a stopped run says what the user got, in plain words, counted from its own record', async () => {
  const { builtSummary, addMade, madeKey } = await import('../src/run-idle.ts');
  const made = (...calls) => calls.reduce((m, [tool, args]) => addMade(m, madeKey(tool, args)), undefined);
  assert.equal(
    builtSummary(made(['edit_terrain'], ['edit_terrain'], ['create_instances'], ['transform_instances'], ['insert_sound'], ['insert_sound'], ['insert_sound'])),
    'It worked on the terrain, new objects, moved or resized objects and 3 sounds.');
  assert.equal(builtSummary(made(['insert_sound'])), 'It worked on a sound.');
  assert.equal(builtSummary(made(['add_effect'], ['insert_vfx'])), 'It worked on 2 effects.', 'two tools that make the same kind of thing count together');
  assert.equal(builtSummary(made(['insert_vfx'])), 'It worked on an effect.');
  assert.equal(builtSummary(made(['edit_script'], ['run_luau'], ['install_module'])), 'It worked on how the game works.');
  assert.equal(builtSummary(undefined), '', 'a run that changed nothing claims nothing');
  assert.equal(builtSummary({}), '');
  assert.equal(builtSummary(made(['create_instances'], ['set_mood'], ['insert_sound'], ['edit_terrain'], ['edit_script'], ['clone_instances'], ['delete_instances'])),
    'It worked on new objects, the lighting, a sound, the terrain, how the game works, copies of objects and more.', 'a long list is cut short');
});

test('what a library import brought is named the way the game shows it, never by path or tool', async () => {
  const { builtSummary, addMade, madeKey, plainName, plainLibraryThing } = await import('../src/run-idle.ts');
  const imp = (path, mode = 'self') => madeKey('import_owner_library', JSON.stringify({ gameId: 'abcdef012345', path, mode }));
  assert.equal(plainLibraryThing('/Workspace'), 'the game map');
  assert.equal(plainLibraryThing('/StarterGui'), 'the game screens');
  assert.equal(plainLibraryThing('/StarterGui/ShopGui'), 'the shop screen');
  assert.equal(plainLibraryThing('/StarterGui/MainUI/Frames#2'), 'the frames screen');
  assert.equal(plainLibraryThing('/Workspace/BrainrotPet'), 'the brainrot pet');
  assert.equal(plainLibraryThing('/ServerScriptService/CashLoop'), 'the cash loop system');
  assert.equal(plainLibraryThing('/StarterPack/Sword'), 'the sword tool');
  assert.equal(plainLibraryThing('/'), 'a saved model');
  assert.equal(plainLibraryThing('/StarterGui/##'), 'a screen', 'a name with nothing readable falls back to its kind');
  assert.equal(plainName('/Workspace/Plot1'), 'plot 1');
  assert.equal(plainName('/StarterGui/ShopGUI'), 'shop');
  assert.equal(plainName('/Workspace/Brainrot Pet#3'), 'brainrot pet');
  assert.equal(plainName('/Workspace/Bases_NEW/{94396031-cda8-4c6d-ae16-6f869de43bd7}'), '', 'an id is not a name');
  assert.equal(plainName('/Workspace/1449'), '', 'a bare number is not a name');
  assert.equal(plainLibraryThing('/SavedGameModules/Workspace/BoatContainer/Boat_{2E055272-1AE8-47E0-8BF6-22F0E52C71F9}'), 'a system');
  let made;
  for (const key of [imp('/Workspace', 'children'), imp('/StarterGui/ShopGui'), imp('/StarterGui/ShopGui'), madeKey('recreate_owner_game', '{"gameId":"abcdef012345"}')]) made = addMade(made, key);
  assert.equal(builtSummary(made), 'It worked on the game map, the shop screen and the whole game.');
  assert.equal(madeKey('import_owner_library', 'not json'), '=part of a saved game', 'unreadable arguments still name no tool');
});

test('addMade keeps a bounded record and files the overflow as other changes', async () => {
  const { builtSummary, addMade } = await import('../src/run-idle.ts');
  let made;
  for (let i = 0; i < 100; i++) made = addMade(made, `=thing number ${i}`);
  assert.ok(Object.keys(made).length <= 31, `${Object.keys(made).length} keys kept`);
  assert.match(builtSummary(made), /^It worked on .+ and more\.$/);
  assert.equal(builtSummary(addMade(addMade(undefined, 'constructor'), 'partial')), 'It worked on other changes.', 'an unknown key, even a name that exists on every object, is other changes');
});

test('no project-changing tool reaches the user under its own name', async () => {
  const esbuild = await import('esbuild');
  const { mkdtempSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { pathToFileURL } = await import('node:url');
  const dir = mkdtempSync(join(tmpdir(), 'run-idle-tools-'));
  try {
    await esbuild.build({ entryPoints: [join(WORKER, 'src', 'tools.ts')], bundle: true, format: 'esm', platform: 'node', outfile: join(dir, 'tools.mjs'),
      alias: { '@golem/shared': join(WORKER, '..', '..', 'packages', 'shared', 'src', 'index.ts') }, logLevel: 'silent' });
    const T = await import(pathToFileURL(join(dir, 'tools.mjs')).href);
    const { builtSummary, addMade, madeKey } = await import('../src/run-idle.ts');
    const writers = T.projectMutatingToolNames();
    assert.ok(writers.length > 30, 'the registry lists its project-changing tools');
    for (const name of writers) {
      const said = builtSummary(addMade(undefined, madeKey(name, '{"path":"/Workspace/Farm","mode":"self"}')));
      assert.ok(said, `${name} says nothing`);
      assert.doesNotMatch(said, /[a-z]+_[a-z]+/, `${name} reaches the user as: ${said}`);
      assert.doesNotMatch(said, /other changes/, `${name} has no plain words in run-idle.ts MADE`);
    }
    assert.equal(builtSummary({ made_up_tool: 2 }), 'It worked on other changes.');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('every bound ending that follows a change carries what was made', async () => {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('../src/do/session.ts', import.meta.url), 'utf8');
  for (const lead of ['kept doing the same thing again and again. ', 'instead of building the rest. ', 'over and over. ']) {
    const at = src.indexOf(lead);
    assert.ok(at > 0, `ending "${lead.trim()}" not found — this checks nothing`);
    assert.match(src.slice(at, at + 120), /builtSummary\(agent\.made\)/, `"${lead.trim()}" does not say what was made`);
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

test('the run loop hands every run its owed work back, bounded, instead of ending on a question', async () => {
  // V3 G01 folded the Autonomous "finish without asking" policy into every run: no flag gates it.
  const { AUTONOMOUS_CONTINUES } = await import('../src/run-idle.ts');
  assert.ok(AUTONOMOUS_CONTINUES >= 1 && AUTONOMOUS_CONTINUES <= 5, 'unbounded or disabled');
  assert.doesNotMatch(SESSION, /agent\.autonomous\b/, 'a run-level Autonomous flag gates the policy again');
  // prose ending: changed + can build + reply leaves work open -> steer, not finishRun
  assert.match(SESSION, /agent\.mutated && canBuild && !owesWork &&[\s\S]{0,200}leavesWorkOpen\(res\.text\)[\s)]*\{[\s\S]{0,200}AUTONOMOUS_CONTINUE_STEER[\s\S]{0,200}setAlarm[\s\S]{0,30}return;/);
  // idle bound: a run is steered, bounded, before the finish branch can end it
  assert.match(SESSION, /if \(idle\.action === 'finish' && \(agent\.autonomousContinues \?\? 0\) < AUTONOMOUS_CONTINUES\) \{[\s\S]{0,400}AUTONOMOUS_IDLE_STEER[\s\S]{0,40}\} else if \(idle\.action === 'finish'\)/);
  // the nudge must not tell a run to "reply to the user now"
  assert.match(SESSION, /if \(idle\.action === 'nudge'\) \{\s*agent\.llm\.push\(\{\s*role: 'user',\s*content: AUTONOMOUS_IDLE_STEER/);
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
  assert.match(SESSION, /out\.mutatedProject === true && buildsHud\(call\.name, call\.arguments\)\) agent\.hudBuilt = true/);
  // The property: a play_check that worked marks the run as played; so does a judge_game that played (sessions other than 0).
  assert.match(SESSION, /out\.ok && \(call\.name === 'play_check' \|\| \(call\.name === 'judge_game' && [^\n]*sessions[^\n]*\)\) agent\.playChecked = true/);
  // every Autonomous ending consults the game gaps: prose, idle, and the duplicate-streak unstick
  const uses = SESSION.match(/gameGaps\(agent\.request, agent, allowed\.has\('play_check'\)\)/g) ?? [];
  assert.equal(uses.length, 3, 'the prose, idle and duplicate-streak endings must all check the game');
  assert.match(SESSION, /gaps\.length > 0 \|\| leavesWorkOpen\(res\.text\)/);
});

test('an owner game recreate or StarterGui import brings its own HUD, so no generated HUD is owed', async () => {
  const { buildsHud } = await import('../src/run-idle.ts');
  assert.equal(buildsHud('recreate_owner_game', '{"gameId":"0a1b2c3d"}'), true);
  assert.equal(buildsHud('import_owner_library', '{"gameId":"0a1b2c3d","path":"/StarterGui","parent":"game.StarterGui"}'), true);
  assert.equal(buildsHud('import_owner_library', '{"gameId":"0a1b2c3d","path":"/Workspace/Farm"}'), false);
  assert.equal(buildsHud('insert_ui_component', '{}'), true);
  assert.equal(buildsHud('create_instances', '{"items":[{"className":"Part"}]}'), false);
});

test('the self-check\'s look counts as a check after a change, so reading after it is the idle this file bounds', async () => {
  const { EXTRA_CHECK_TOOLS, afterStep, IDLE_AFTER_VERIFY_NUDGE } = await import('../src/run-idle.ts');
  assert.ok(EXTRA_CHECK_TOOLS.has('look'));
  // Derived from the registry, not asserted by hand: every extra check is a real tool and changes nothing (a check that changes the
  // place would be a change, and a change clears the check).
  const esbuild = await import('esbuild');
  const { mkdtempSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { pathToFileURL } = await import('node:url');
  const dir = mkdtempSync(join(tmpdir(), 'run-idle-checks-'));
  try {
    await esbuild.build({ entryPoints: [join(WORKER, 'src', 'tools.ts')], bundle: true, format: 'esm', platform: 'node', outfile: join(dir, 'tools.mjs'),
      alias: { '@golem/shared': join(WORKER, '..', '..', 'packages', 'shared', 'src', 'index.ts') }, logLevel: 'silent' });
    const T = await import(pathToFileURL(join(dir, 'tools.mjs')).href);
    for (const name of EXTRA_CHECK_TOOLS) {
      assert.ok(T.toolNames().includes(name), `${name} is not a registered tool`);
      assert.ok(!T.projectMutatingToolNames().includes(name), `${name} changes the place, so it cannot be a check`);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  // And it behaves as a check: after a change and a check, only reading is counted toward the nudge.
  let state = {};
  state = afterStep(state, { mutated: true, verified: false, calls: 1 });
  state = afterStep(state, { mutated: false, verified: true, calls: 1 });
  for (let i = 0; i < IDLE_AFTER_VERIFY_NUDGE; i++) state = afterStep(state, { mutated: false, verified: false, calls: 1 });
  assert.equal(state.action, 'nudge');
});
