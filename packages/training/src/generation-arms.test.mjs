import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ALL_GAME_LOGIC_CURRICULUM } from './build-game-logic.mjs';
import { BASELINE_SYSTEM, exemplarsFor, fencedBlocks, fidelityGate, loadLibrary, runOwnSpec } from './generation-arms.mjs';
import { resolveSettings } from './production-settings.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const CORPUS = resolve(HERE, '../../corpus/data/verified-modules.json');

//[[ THE PREMISE OF THE LEAVE-ONE-OUT GUARD, TESTED RATHER THAN ASSUMED.
//
//   The few-shot arm is only interesting because the library and the benchmark are the SAME eighty
//   things: hand a model the verified module for the contract it was asked to write and it scores
//   ~100% while measuring nothing. If that stopped being true — if the library grew past the
//   curriculum, or the ids diverged — the guard would still pass and would be guarding nothing.
//   So the overlap is asserted here, and this test is the reason the guard is not decoration.
test('the verified library and the game-logic curriculum are the same eighty ids', () => {
  const mods = JSON.parse(readFileSync(CORPUS, 'utf8')).modules;
  const moduleIds = new Set(mods.map((m) => m.id));
  const curriculumIds = ALL_GAME_LOGIC_CURRICULUM.map((e) => e.id);
  assert.equal(curriculumIds.length, 80);
  assert.equal(moduleIds.size, 80);
  const overlap = curriculumIds.filter((id) => moduleIds.has(id));
  assert.equal(overlap.length, 80, 'every curriculum example has a verified module with the same id — leave-one-out exists for this reason');
});

test('leave-one-out holds for all eighty: no example is ever handed its own answer', async () => {
  const lib = await loadLibrary();
  let withExemplars = 0;
  for (const e of ALL_GAME_LOGIC_CURRICULUM) {
    const picked = exemplarsFor(lib, e, 3);
    assert.ok(!picked.some((m) => m.id === e.id), `${e.id} was handed its own answer`);
    if (picked.length) withExemplars += 1;
  }
  //[[ A GUARD THAT PASSES BECAUSE NOTHING WAS RETRIEVED IS NOT A GUARD.
  //   If `searchVerifiedModules` returned [] for every prompt the loop above would be green and the
  //   arm would silently be the baseline. Assert the door actually opened.
  assert.equal(withExemplars, 80, 'every prompt retrieved at least one exemplar');
});

test('exemplars are other modules, and there are three of them', async () => {
  const lib = await loadLibrary();
  const picked = exemplarsFor(lib, ALL_GAME_LOGIC_CURRICULUM[0], 3);
  assert.equal(picked.length, 3);
  assert.equal(new Set(picked.map((m) => m.id)).size, 3);
  for (const m of picked) assert.ok(m.source && m.contract, 'an exemplar carries its contract and its source');
});

//[[ FALSIFY THE GATE BEFORE TRUSTING IT. A fidelity gate that cannot go red is a green light with
//   no wire behind it — this repository has shipped one of those before.
//
//   2026-09-21 — RE-AIMED, AND THE REASON IS THE FINDING. The first line used to be
//   `assert.equal(fidelityGate().ok, true)` with the message "the shipped string still matches the
//   recorded run". It went red the moment generation-arms.mjs stopped carrying a literal budget and
//   started DERIVING one from production-settings.mjs, because production had moved to
//   effectiveTokens 6500 on 2026-09-20 while every recorded arm was taken at 5500. The code got
//   better and the assertion was holding a fossil, which is case 2 of the working rules. So the
//   green-after half is kept — a gate that never says yes is not a gate either — but aimed at the
//   property: it agrees exactly when the run it is given and the settings it is given agree, and
//   the specific numbers it is agreeing about are pinned in the tripwire below.
test('the fidelity gate goes red when the baseline system prompt drifts', () => {
  assert.equal(fidelityGate().ok, true, 'the recorded run and production agree today');
  const drifted = fidelityGate({ system: BASELINE_SYSTEM + ' Also be cheerful.' });
  assert.equal(drifted.ok, false);
  assert.match(drifted.why, /system prompt differs/);
  assert.equal(fidelityGate({ tokens: 4400 }).ok, false, 'a budget that is not production is not a baseline');
  assert.equal(fidelityGate({ gateway: 'rune' }).ok, false, 'a different gateway is a different measurement');
});

//[[ A TRIPWIRE, NOT A PIN — it is meant to fire on ANY change, because each one needs reviewing.
//
//   Two things must stay true together or the arms stop being comparable to each other: the budget
//   the harness derives from production, and the budget the recorded baseline was taken at. When
//   the worker's effort scale or a gateway ceiling moves, this goes red and the review is: re-record
//   the shipped baseline at the new budget, then re-run any arm you intend to compare against it.
//   Do not bump the number. 6500 is `min(4400 x 2, stone ceiling 6500)` as of commit 8b61c91; the
//   seven arms in docs/frontier-for-roblox.md §4 were all taken at 5500, which is why that section
//   names its own budget rather than pointing here.
test('the harness, production and the recorded baseline are all on the same output budget', () => {
  const production = resolveSettings({ lane: 'apple', mode: 'agent' });
  assert.equal(production.effectiveTokens, 6500, 'production moved — re-record the baseline, then re-run the arms');
  const gate = fidelityGate();
  assert.equal(gate.recorded.effectiveTokens, production.effectiveTokens, 'the recorded baseline is at a different budget from production');
  assert.equal(gate.recorded.file, 'eval-production-apple-agent-armA-shipped-2026-09-21.json');
});

test('the fidelity gate refuses rather than passing when the recorded run is missing', () => {
  const gone = fidelityGate({ file: resolve(HERE, 'no-such-run.json') });
  assert.equal(gone.ok, false, 'a file it could not read must not read as agreement');
  assert.match(gone.why, /cannot read/);
});

test('two fenced blocks are returned in order, and one block does not become two', () => {
  assert.deepEqual(fencedBlocks('```luau\nA\n```\ntext\n```luau\nB\n```'), ['A', 'B']);
  assert.deepEqual(fencedBlocks('```luau\nonly\n```'), ['only']);
  assert.deepEqual(fencedBlocks('no code here'), []);
});

//[[ THE REPAIR SIGNAL ITSELF. Three outcomes that must stay distinguishable, because the arm keeps
//   the draft on two of them and replaces it on one.
test('the own-spec runner tells a pass, a failed assertion and a broken spec apart', () => {
  const mod = 'return function(a, b) return a + b end';
  const pass = runOwnSpec(mod, 'assert(candidate(1, 2) == 3)');
  assert.equal(pass.ran && pass.compiled && pass.passed, true);

  const fail = runOwnSpec(mod, 'assert(candidate(1, 2) == 4, "sum wrong")');
  assert.equal(fail.compiled, true);
  assert.equal(fail.passed, false);
  assert.match(fail.detail, /sum wrong/, 'the failure text is what the repair call is given');

  const broken = runOwnSpec(mod, 'assert(candidate(1, 2 ==');
  assert.equal(broken.compiled, false, 'a spec that does not compile is not a module that is wrong');
});

test('a module that does not compile is not reported as a module whose assertions failed', () => {
  const broken = runOwnSpec('return function(a b) return a end', 'assert(true)');
  assert.equal(broken.compiled, false);
});
