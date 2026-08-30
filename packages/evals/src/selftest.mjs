#!/usr/bin/env node
// Offline self-test for the eval harness. No network: validates all task files,
// exercises the grader on fake model responses, and proves the luau_syntax
// check against the real local Luau CLI with known-good and known-bad snippets.
//   node src/selftest.mjs
import { loadTasks } from './tasks.mjs';
import { extractCode, gradeTask } from './grade.mjs';
import { resolveLuauChecker, checkLuauSyntax } from './luau.mjs';
import { aggregate, formatTable } from './run.mjs';
import { buildPrompt } from './transport.mjs';

let failures = 0;
function check(name, cond, detail = '') {
  if (cond) {
    console.log(`  ok    ${name}`);
  } else {
    failures += 1;
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
}
function approx(a, b) {
  return Math.abs(a - b) < 1e-9;
}

// ---------------------------------------------------------------- 1. task files
console.log('\n[1] task file validation');
const { tasks, errors } = loadTasks();
check('all task files parse and validate', errors.length === 0, errors.slice(0, 5).join(' | '));
const counts = {};
for (const t of tasks) counts[t.category] = (counts[t.category] ?? 0) + 1;
const EXPECTED = {
  'api-knowledge': 12,
  'luau-correctness': 10,
  debugging: 8,
  'project-comprehension': 6,
  'tool-selection': 6,
  'multi-file': 5,
  'ui-implementation': 5,
  'failure-recovery': 4,
};
for (const [cat, n] of Object.entries(EXPECTED)) {
  check(`${cat} has ${n} tasks`, counts[cat] === n, `got ${counts[cat] ?? 0}`);
}
check('total task count is 56', tasks.length === 56, `got ${tasks.length}`);

// ---------------------------------------------------------------- 2. code extraction
console.log('\n[2] code extraction');
const multi = 'Intro text\n```luau\nlocal a = 1\n```\nmiddle\n```lua\nlocal b = 2\n```\ndone';
check('extracts and concatenates fenced blocks', extractCode(multi) === 'local a = 1\nlocal b = 2');
check('no fences -> empty string', extractCode('just prose, no code') === '');
check('unlabeled fence works', extractCode('```\nprint(1)\n```') === 'print(1)');

// ---------------------------------------------------------------- 3. luau checker (real CLI)
console.log('\n[3] luau_syntax via real local CLI');
const checker = resolveLuauChecker();
check('a working Luau checker was found', !!checker, 'install luau-lsp (rokit) or luau-analyze (brew), or set LUAU_CHECK_BIN');
if (checker) console.log(`        using: ${checker.name}`);
const goodLuau =
  'local Players = game:GetService("Players")\nPlayers.PlayerAdded:Connect(function(player)\n\tprint(`welcome {player.Name}`)\n\ttask.wait(1)\nend)\n';
const badLuau = 'local part = workspace.Beacon\nif part then\n\tprint("found"\nend\n';
const goodRes = checkLuauSyntax(goodLuau);
const badRes = checkLuauSyntax(badLuau);
check('known-good Roblox snippet passes (Roblox globals must not fail it)', goodRes.passed, goodRes.detail);
check('known-bad snippet fails with a SyntaxError', !badRes.passed && /SyntaxError/.test(badRes.detail), badRes.detail);
check('empty code fails luau_syntax', !checkLuauSyntax('').passed);

// ---------------------------------------------------------------- 4. grader on 3 fake model responses
console.log('\n[4] grading fake model responses');
const byId = new Map(tasks.map((t) => [t.id, t]));

// 4a. perfect answer to lc-01-countdown -> every check passes (uses real luau CLI)
const lcTask = byId.get('lc-01-countdown');
const fakeGood =
  'Here you go:\n\n```luau\nlocal function countdown(seconds)\n\tfor i = seconds, 1, -1 do\n\t\tprint(i)\n\t\ttask.wait(1)\n\tend\nend\n```\n';
const g1 = gradeTask(lcTask, fakeGood);
check('fake #1 (correct code) scores 1.0', approx(g1.score, 1), `score=${g1.score} ${JSON.stringify(g1.checks.filter((c) => !c.passed))}`);

// 4b. deprecated + syntax-broken answer to the same task -> only the `for` check passes (1 of 4)
const fakeBad =
  '```luau\nfunction countdown(seconds)\n\tfor i = seconds, 1, -1 do\n\t\tprint(i)\n\t\twait(1)\nend\n```\n';
const g2 = gradeTask(lcTask, fakeBad);
check('fake #2 (broken + deprecated wait) scores 0.25', approx(g2.score, 0.25), `score=${g2.score}`);
const g2ByType = Object.fromEntries(g2.checks.map((c) => [`${c.type}:${c.detail.slice(0, 20)}`, c.passed]));
check('fake #2 luau_syntax check failed', g2.checks.find((c) => c.type === 'luau_syntax')?.passed === false, JSON.stringify(g2ByType));
check('fake #2 bare wait( detected by not_contains pattern', g2.checks.find((c) => c.type === 'not_contains')?.passed === false);

// 4c. text-only api-knowledge answer -> contains + not_contains on target 'text'
const akTask = byId.get('ak-03-linear-velocity');
const g3 = gradeTask(akTask, 'Use a LinearVelocity constraint attached via an Attachment; BodyVelocity is deprecated.');
check('fake #3 (correct text answer) scores 1.0', approx(g3.score, 1), `score=${g3.score}`);
const g3wrong = gradeTask(akTask, 'Use BodyForce for that.');
check('fake #3 wrong answer scores 0.0 (misses LinearVelocity AND names BodyForce)', approx(g3wrong.score, 0), `score=${g3wrong.score}`);

// ---------------------------------------------------------------- 5. check primitives (injected luau stub)
console.log('\n[5] check primitives');
const stubTask = {
  id: 'stub',
  category: 'stub',
  prompt: 'x',
  checks: [
    { type: 'contains', value: 'alpha', target: 'text' },
    { type: 'not_contains', value: 'beta', target: 'text' },
    { type: 'not_contains', pattern: "gamma\\d+", target: 'text' },
    { type: 'regex', pattern: '^Alpha', flags: 'im', target: 'text' },
    { type: 'luau_syntax', target: 'code' },
  ],
};
const stub = gradeTask(stubTask, 'alpha line\nAlpha again\n```luau\nprint(1)\n```', { luauCheck: () => ({ passed: true, detail: 'stubbed' }) });
check('all primitive checks pass on matching input', approx(stub.score, 1), JSON.stringify(stub.checks));
const stub2 = gradeTask(stubTask, 'beta gamma42 nothing else', { luauCheck: () => ({ passed: true, detail: 'stubbed' }) });
check('primitives fail on violating input (only luau stub passes)', approx(stub2.score, 0.2), `score=${stub2.score}`);
const weighted = gradeTask(
  { id: 'w', category: 'w', prompt: 'x', checks: [
    { type: 'contains', value: 'yes', target: 'text', weight: 3 },
    { type: 'contains', value: 'nope', target: 'text', weight: 1 },
  ] },
  'yes',
);
check('check weights: 3-of-4 weighted fraction', approx(weighted.score, 0.75), `score=${weighted.score}`);

// ---------------------------------------------------------------- 6. aggregation + table + transport prompt
console.log('\n[6] aggregation, table, transport');
const perTask = [
  { taskId: 'a', category: 'cat1', model: 'clay', ok: true, score: 1, taskWeight: 1 },
  { taskId: 'b', category: 'cat1', model: 'clay', ok: true, score: 0, taskWeight: 3 },
  { taskId: 'a', category: 'cat1', model: 'stone', ok: true, score: 0.5, taskWeight: 1 },
  { taskId: 'c', category: 'cat2', model: 'clay', ok: false, score: 0, taskWeight: 1 },
];
const agg = aggregate(perTask);
const clayCat1 = agg.perCategory.find((c) => c.model === 'clay' && c.category === 'cat1');
check('task weights honored in category aggregate (1*1+3*0)/4', approx(clayCat1.score, 0.25), `got ${clayCat1?.score}`);
const clayOverall = agg.overall.find((o) => o.model === 'clay');
check('overall includes transport-error tasks as 0', approx(clayOverall.score, 0.2), `got ${clayOverall?.score}`);
check('transport errors counted', clayOverall.transportErrors === 1);
const table = formatTable(['clay', 'stone'], agg.perCategory, agg.overall);
check('table renders categories and OVERALL row', table.includes('cat1') && table.includes('OVERALL'));
check('transport folds system into prompt', buildPrompt('SYS', 'USER') === 'SYS\n\n---\n\nUSER' && buildPrompt(undefined, 'U') === 'U');

// ---------------------------------------------------------------- summary
console.log(failures === 0 ? '\nSELFTEST PASS' : `\nSELFTEST FAIL — ${failures} assertion(s) failed`);
process.exit(failures === 0 ? 0 : 1);
