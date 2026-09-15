// The graders' own honesty: what each of them does when it CANNOT grade.
//
// Three checks in this harness could report a verdict about a model's answer without having
// examined it, and each did:
//
//   luau_syntax     no checker installed -> every snippet "fails"      (a fact about the machine)
//   no_antipattern  every requested rule skipped -> "no anti-patterns" (a fact about nothing)
//   any check       throws -> counted as a failed check                (a fact about the harness)
//
// Each test below constructs the condition and asserts the grader now says "unavailable" rather
// than rendering it as a score. The violating inputs all come from the test, so none of these
// depends on the state of this machine.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { checkLuauSyntax, resolveLuauChecker } from './luau.mjs';
import { checkNoAntipattern, analyzeLuau } from './roblox-antipatterns.mjs';
import { gradeTask } from './grade.mjs';
import { validateTask } from './tasks.mjs';

const CODE = '```luau\nlocal x = 1\nprint(x)\n```';

// =============================================================================================
// 1. luau_syntax with no checker
// =============================================================================================

test('with no Luau checker, luau_syntax reports UNAVAILABLE rather than failing the code', () => {
  // Injected rather than uninstalled: this must hold on a machine where luau-lsp IS present,
  // which is the machine the suite normally runs on and therefore the one where the bug hid.
  const r = checkLuauSyntax('local x = 1\n', { resolve: () => null });
  assert.equal(r.unavailable, true, 'an absent checker still returned a verdict on the code');
  assert.equal(r.reason, 'luau_checker_absent');
  assert.match(r.detail, /no working Luau checker/);
});

test('"no code in the answer" stays an ordinary failure, because that IS an observation', () => {
  const r = checkLuauSyntax('', { resolve: () => null });
  assert.equal(r.passed, false);
  assert.ok(!r.unavailable, 'an answer containing no code was excused as unmeasurable');
  assert.match(r.detail, /no code to check/);
});

test('the real checker on this machine still separates good Luau from broken Luau', () => {
  // Guards the other direction: the unavailable branch must not have swallowed real detection.
  const checker = resolveLuauChecker();
  assert.ok(checker, 'no Luau checker on this machine - install luau-lsp or set LUAU_CHECK_BIN');
  const good = checkLuauSyntax('local Players = game:GetService("Players")\nprint(Players.Name)\n');
  const bad = checkLuauSyntax('local x = 1\nif x then\n\tprint(x\nend\n');
  assert.equal(good.passed, true, good.detail);
  assert.ok(!good.unavailable);
  assert.equal(bad.passed, false);
  assert.ok(!bad.unavailable, 'a genuine syntax error was reported as "could not measure"');
  assert.match(bad.detail, /SyntaxError/);
});

// =============================================================================================
// 2. no_antipattern with nothing to run
// =============================================================================================

test('a rule set that does not apply to the snippet reports UNAVAILABLE, not a clean bill', () => {
  // `client-authoritative-currency` is scoped to client files. Asked for on a server snippet it
  // is SKIPPED -- analyzeLuau says so explicitly and deliberately. checkNoAntipattern then found
  // zero findings and returned `passed: true, "0 rule(s) run"`. Nothing was examined and the
  // answer was marked clean.
  const serverCode = 'local remote = game.ReplicatedStorage.Buy\nremote.OnServerEvent:Connect(function(player, price)\n\tplayer.leaderstats.Coins.Value -= price\nend)\n';
  const analysis = analyzeLuau(serverCode, { context: 'server', rules: ['client-authoritative-currency'] });
  assert.deepEqual(analysis.ruleIds, [], 'fixture drift: this rule now applies to server code');
  assert.deepEqual(analysis.skipped, ['client-authoritative-currency']);

  const r = checkNoAntipattern(serverCode, { context: 'server', rules: ['client-authoritative-currency'] });
  assert.equal(r.passed, false, 'a snippet nothing was run against was passed as clean');
  assert.equal(r.unavailable, true);
  assert.equal(r.reason, 'no_applicable_rules');
  assert.match(r.detail, /nothing was examined/);
});

test('a rule set that DOES apply still passes clean code and fails dirty code', () => {
  const exploitable = 'local remote = game.ReplicatedStorage.Buy\nremote.OnServerEvent:Connect(function(player, price)\n\tplayer.leaderstats.Coins.Value = player.leaderstats.Coins.Value - price\nend)\n';
  const guarded = 'local PRICES = { sword = 100 }\nlocal remote = game.ReplicatedStorage.Buy\nremote.OnServerEvent:Connect(function(player, itemId)\n\tif typeof(itemId) ~= "string" then return end\n\tlocal price = PRICES[itemId]\n\tif price == nil then return end\n\tplayer.leaderstats.Coins.Value -= price\nend)\n';
  const bad = checkNoAntipattern(exploitable, { context: 'server', rules: ['server-trusts-client-amount', 'unvalidated-remote-arg'] });
  const good = checkNoAntipattern(guarded, { context: 'server', rules: ['server-trusts-client-amount', 'unvalidated-remote-arg'] });
  assert.equal(bad.passed, false);
  assert.ok(!bad.unavailable, 'a real finding was reported as unmeasurable');
  assert.equal(good.passed, true, good.detail);
  assert.ok(!good.unavailable);
  assert.match(good.detail, /2 rule\(s\) run/);
});

// =============================================================================================
// 3. gradeTask: what an unavailable check does to a score
// =============================================================================================

const task = (checks) => ({ id: 'probe', category: 'c', prompt: 'p', checks });

test('an unavailable check leaves BOTH sides of the fraction, so it cannot lower a score', () => {
  const t = task([
    { type: 'contains', target: 'text', value: 'alpha' },
    { type: 'luau_syntax', target: 'code' },
  ]);
  const g = gradeTask(t, `alpha\n${CODE}`, { luauCheck: () => ({ passed: false, unavailable: true, reason: 'luau_checker_absent', detail: 'no checker' }) });
  // Counting the unavailable check as a failure gives 0.5 -- a correct answer marked half wrong
  // because of a missing binary.
  assert.equal(g.score, 1);
  assert.equal(g.scored, true);
  assert.equal(g.gradedWeight, 1);
  assert.equal(g.ungradedWeight, 1);
  assert.deepEqual(g.ungraded.map((u) => u.reason), ['luau_checker_absent']);
  assert.equal(g.checks.find((c) => c.type === 'luau_syntax').unavailable, true);
});

test('when NOTHING could be graded the score is null, never 0', () => {
  const g = gradeTask(task([{ type: 'luau_syntax', target: 'code' }]), CODE, {
    luauCheck: () => ({ passed: false, unavailable: true, reason: 'luau_checker_absent', detail: 'no checker' }),
  });
  assert.equal(g.score, null, 'a task nothing could be graded on was scored 0');
  assert.equal(g.scored, false);
  assert.equal(g.gradedWeight, 0);
  assert.equal(g.ungradedReason, 'luau_checker_absent');
});

test('an analyzer that throws is unavailable, not a failed check', () => {
  // An unknown rule id makes analyzeLuau throw. checkNoAntipattern caught it and returned
  // `passed: false` with the error message as the detail -- so "the harness was misconfigured"
  // and "the model wrote an exploitable shop" produced the same 0 on the scoreboard.
  const g = gradeTask(task([{ type: 'no_antipattern', target: 'code', rules: ['no-such-rule-id'] }, { type: 'contains', target: 'text', value: 'alpha' }]), `alpha\n${CODE}`);
  assert.equal(g.score, 1, 'a harness fault was charged to the model');
  assert.equal(g.ungradedWeight, 1);
  assert.deepEqual(g.ungraded.map((u) => u.reason), ['analyzer_error']);
  assert.match(g.ungraded[0].detail, /unknown anti-pattern rule/);
});

test('a check that throws out of the dispatcher is unavailable too', () => {
  // tasks.mjs compiles every declared pattern at load time, so this shape cannot come from a
  // task file -- but gradeTask is called directly by the curriculum tests and by the critic
  // harness, and an exception there must not become a score either.
  const g = gradeTask(task([{ type: 'regex', target: 'text', pattern: '([' }, { type: 'contains', target: 'text', value: 'alpha' }]), 'alpha');
  assert.equal(g.score, 1, 'an exception inside a check was charged to the model');
  assert.deepEqual(g.ungraded.map((u) => u.reason), ['check_error']);
});

test('an unknown check type is still a failure, not an excuse', () => {
  // `unknown check type` means the task file asked for something that does not exist. That is a
  // bug in the task, and it must not be laundered into "unmeasurable" where nobody looks at it.
  const g = gradeTask(task([{ type: 'no_such_check', target: 'text' }]), 'anything');
  assert.equal(g.score, 0);
  assert.equal(g.scored, true);
  assert.equal(g.ungradedWeight, 0);
});

test('a non-finite check weight cannot poison a task score', () => {
  for (const weight of [NaN, Infinity, '3', -1, 0, null]) {
    const g = gradeTask(task([
      { type: 'contains', target: 'text', value: 'alpha', weight },
      { type: 'contains', target: 'text', value: 'beta' },
    ]), 'alpha only');
    assert.ok(Number.isFinite(g.score), `weight ${String(weight)} produced score ${g.score}`);
    assert.ok(g.score >= 0 && g.score <= 1, `weight ${String(weight)} produced ${g.score}`);
  }
  // A NaN weight used to make the whole score NaN, and NaN compares false against every
  // threshold -- so the task was silently neither a pass nor a failure.
  const poisoned = gradeTask(task([{ type: 'contains', target: 'text', value: 'alpha', weight: NaN }]), 'alpha');
  assert.equal(poisoned.score, 1);
});

test('the task loader rejects a bad check weight instead of letting the grader paper over it', () => {
  for (const weight of [NaN, Infinity, '3', -1, 0]) {
    const errs = validateTask(task([{ type: 'contains', target: 'text', value: 'x', weight }]), 'probe.json');
    assert.ok(errs.some((e) => /weight must be a positive finite number/.test(e)), `weight ${String(weight)} loaded clean: ${JSON.stringify(errs)}`);
  }
  assert.deepEqual(validateTask(task([{ type: 'contains', target: 'text', value: 'x', weight: 2.5 }]), 'probe.json'), []);
});

// =============================================================================================
// 4. The wiring: run.mjs must not write a 0 for a job that never came back
// =============================================================================================

test('the runner records a failed job with score null and a named reason', () => {
  // Anchored to the failure-return block in runJob, not to "score: null" appearing anywhere in
  // the file -- the success path also has a `score` field and would satisfy a loose match.
  const src = readFileSync(new URL('./run.mjs', import.meta.url), 'utf8');
  const failBlock = src.slice(src.indexOf('const message = lastErr instanceof Error'), src.indexOf('async function pool'));
  assert.ok(failBlock.length > 0, 'runJob\'s failure return block moved; re-anchor this test');
  assert.match(failBlock, /score: null/, 'a job that never got a response is being scored');
  assert.doesNotMatch(failBlock, /score: 0/);
  assert.match(failBlock, /ungradedReason:/);
  assert.match(failBlock, /timeout/, 'a timeout is not distinguished from a transport error');
});

test('the aggregate mean is taken over graded records only', () => {
  const src = readFileSync(new URL('./run.mjs', import.meta.url), 'utf8');
  const agg = src.slice(src.indexOf('export function aggregate'), src.indexOf('export function formatTable'));
  assert.ok(agg.includes('classifyRecord'), 'aggregate no longer asks whether a record was gradable');
  // The single line that used to average everything.
  assert.doesNotMatch(agg, /^\s*cur\.weighted \+= w \* r\.score;/m);
});
