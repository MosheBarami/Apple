// The scripting curriculum, checked against its own claims.
//
// Master Mission §U puts Roblox SCRIPTING at the top of the long-term capability list, and §AJ asks
// for a benchmark that tracks it. Two ways that goes wrong quietly:
//
//   1. The suite says scripting matters and then scores it at a fifth of the weight, because
//      "highest weight" lived in a README instead of in the numbers the runner multiplies.
//   2. A task ships with a check no correct answer can satisfy — a regex expecting a literal the
//      reference solution names as a constant. Every model loses the point, forever, and the loss
//      looks like a model weakness rather than a broken check.
//
// So the weighting is asserted arithmetically, the §U topic list is asserted covered, and every
// scripting task carries a reference answer that must score exactly 1.0. A task with no reference
// cannot be added.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadTasks, SCRIPTING_TOPICS, SCRIPTING_CATEGORIES, TASKS_DIR } from './tasks.mjs';
import { gradeTask } from './grade.mjs';
import { resolveLuauChecker } from './luau.mjs';

const REFERENCE_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'tasks', 'reference');

const { tasks, errors } = loadTasks();
const scripting = tasks.filter((t) => SCRIPTING_CATEGORIES.includes(t.category));
const weightOf = (t) => t.weight ?? 1;
const sum = (list) => list.reduce((a, t) => a + weightOf(t), 0);

// The real CLI when it is installed, a transparent stub when it is not. luau-analyze is present in
// CI via LUAU_CHECK_BIN and often absent on a laptop; a hard failure there would make the reference
// suite unrunnable locally, and silently passing WITHOUT saying so would be worse.
const checker = resolveLuauChecker();
const luauCheck = checker ? undefined : () => ({ passed: true, detail: 'skipped: no local Luau checker' });
if (!checker) console.log('      note: no local Luau checker — reference answers are graded on every check EXCEPT luau_syntax');

test('all task files still load clean with the scripting categories added', () => {
  assert.deepEqual(errors, []);
});

test('the four scripting categories are present and populated', () => {
  const counts = Object.fromEntries(SCRIPTING_CATEGORIES.map((c) => [c, tasks.filter((t) => t.category === c).length]));
  for (const [cat, n] of Object.entries(counts)) assert.ok(n >= 7, `${cat} has ${n} tasks, expected at least 7`);
});

test('scripting carries the majority of total task weight, as §U requires', () => {
  // The runner's overall score is a task-weight-weighted mean (aggregate() in run.mjs), so this
  // ratio IS the claim "scripting dominates the benchmark" — not a sentence about it.
  const scriptingWeight = sum(scripting);
  const totalWeight = sum(tasks);
  const share = scriptingWeight / totalWeight;
  console.log(`      scripting ${scriptingWeight} of ${totalWeight} total weight (${(share * 100).toFixed(1)}%)`);
  assert.ok(share > 0.5, `scripting is ${(share * 100).toFixed(1)}% of total weight; it must be the largest single block`);
});

test('scripting is also the heaviest category block per task', () => {
  // A majority built out of many weight-1 tasks would let a single non-scripting task outrank a
  // scripting one. Every scripting task must outweigh the suite's default task.
  const light = scripting.filter((t) => weightOf(t) < 3).map((t) => t.id);
  assert.deepEqual(light, [], `scripting tasks below weight 3: ${light.join(', ')}`);
});

test('every §U scripting topic is exercised by at least one task', () => {
  const covered = new Set(scripting.flatMap((t) => t.topics ?? []));
  const missing = SCRIPTING_TOPICS.filter((topic) => !covered.has(topic));
  assert.deepEqual(missing, [], `topics claimed by the curriculum but tested by nothing: ${missing.join(', ')}`);
});

test('every scripting task declares what it exercises', () => {
  const untagged = scripting.filter((t) => !t.topics?.length).map((t) => t.id);
  assert.deepEqual(untagged, [], `untagged tasks are invisible to the coverage report: ${untagged.join(', ')}`);
});

test('the anti-pattern grader is actually wired into the code tasks', () => {
  // Code tasks whose checks are all contains/regex measure vocabulary. The whole reason
  // roblox-antipatterns.mjs exists is that vocabulary and correctness come apart on this material.
  const codeTasks = scripting.filter((t) => t.checks.some((c) => c.type === 'luau_syntax'));
  const unguarded = codeTasks.filter((t) => !t.checks.some((c) => c.type === 'no_antipattern')).map((t) => t.id);
  assert.deepEqual(unguarded, [], `code tasks with no anti-pattern check: ${unguarded.join(', ')}`);
});

test('every scripting task has a reference answer on disk', () => {
  const missing = scripting.filter((t) => !existsSync(join(REFERENCE_DIR, `${t.id}.md`))).map((t) => t.id);
  assert.deepEqual(missing, [], `tasks whose checks have never been shown to be satisfiable: ${missing.join(', ')}`);
});

test('no reference answer is orphaned by a renamed or deleted task', () => {
  const ids = new Set(tasks.map((t) => t.id));
  const orphans = readdirSync(REFERENCE_DIR)
    .filter((f) => f.endsWith('.md'))
    .map((f) => f.replace(/\.md$/, ''))
    .filter((id) => !ids.has(id));
  assert.deepEqual(orphans, [], `reference answers for tasks that no longer exist: ${orphans.join(', ')}`);
});

for (const task of scripting) {
  test(`${task.id}: the reference answer scores 1.0`, () => {
    const answer = readFileSync(join(REFERENCE_DIR, `${task.id}.md`), 'utf8');
    const graded = gradeTask(task, answer, { luauCheck });
    const failed = graded.checks.filter((c) => !c.passed);
    assert.deepEqual(
      failed.map((c) => `${c.type}(${c.target}): ${c.detail}`),
      [],
      `a correct answer must pass every check; score ${graded.score.toFixed(3)}`,
    );
  });
}

test('the reference answers are graded against real checks, not empty ones', () => {
  // Guard against the failure where this whole file passes because the tasks have no checks left.
  const thin = scripting.filter((t) => t.checks.length < 4).map((t) => t.id);
  assert.deepEqual(thin, [], `tasks with fewer than 4 checks: ${thin.join(', ')}`);
});

test('a reference answer with the security removed stops scoring 1.0', () => {
  // The strongest evidence that the checks bite: take the reference shop, delete the balance
  // guard and the server-side price lookup, and the score must drop. If it does not, the task is
  // measuring vocabulary and would have scored the exploitable version full marks.
  const task = tasks.find((t) => t.id === 'ss-02-shop-purchase-authority');
  const exploitable = [
    '```luau',
    'local ReplicatedStorage = game:GetService("ReplicatedStorage")',
    'local buyItem = ReplicatedStorage:WaitForChild("BuyItem", 10)',
    'local PRICES = { sword = 100, shield = 250 }',
    '',
    'buyItem.OnServerEvent:Connect(function(player, itemId, price)',
    '\tlocal coins = player.leaderstats.Coins',
    '\tcoins.Value = coins.Value - price',
    'end)',
    '```',
  ].join('\n');
  const graded = gradeTask(task, exploitable, { luauCheck });
  assert.ok(graded.score < 1, 'the exploitable shop must not score full marks');
  const antipattern = graded.checks.find((c) => c.type === 'no_antipattern');
  assert.equal(antipattern.passed, false, 'the anti-pattern check is the one that must catch it');
  assert.match(antipattern.detail, /server-trusts-client-amount|unvalidated-remote-arg/);
});
