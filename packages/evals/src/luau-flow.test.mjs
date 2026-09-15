// Proof that the control-flow analyses fire on code that is broken and stay silent on code that
// is not.
//
// Both halves are load-bearing and the second is the harder one. `no-yield-infinite-loop` and
// `never-updated-loop-condition` are aimed at shapes that sit one character away from correct,
// idiomatic Roblox code — `while true do task.wait() end` is a service, `while not ready do
// task.wait() end` is the standard wait-for-flag — so every rule here carries the near-miss that
// must NOT fire, next to the one that must.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCfg, controlFlow, deadCode, inconsistentReturns, infiniteLoops,
  callYields, callNeverReturns, constantTruth,
} from './luau-flow.mjs';
import { parseLuau } from './luau-ast.mjs';

const lines = (findings) => findings.map((f) => `${f.rule}@${f.line}`);

// ------------------------------------------------------------------ primitives

test('Lua truthiness, not JavaScript truthiness', () => {
  const truth = (src) => constantTruth(parseLuau(`local v = ${src}\n`).ast.body[0].init[0]);
  assert.equal(truth('0'), true, '0 is TRUE in Lua; reading it as false would hide a real hang');
  assert.equal(truth('""'), true, 'the empty string is TRUE in Lua');
  assert.equal(truth('false'), false);
  assert.equal(truth('nil'), false);
  assert.equal(truth('x'), null, 'a variable is not a constant');
});

test('callYields knows the yielding calls and callNeverReturns knows the terminal ones', () => {
  const call = (src) => parseLuau(`${src}\n`).ast.body[0].expression;
  assert.equal(callYields(call('task.wait(1)')), true);
  assert.equal(callYields(call('store:GetAsync(k)')), true);
  assert.equal(callYields(call('print(1)')), false);
  assert.equal(callNeverReturns(call('error("x")')), true);
  assert.equal(callNeverReturns(call('assert(false)')), true);
  assert.equal(callNeverReturns(call('assert(ok)')), false, 'assert with a real condition may return');
});

test('buildCfg links the exit only through paths that reach it', () => {
  const ast = parseLuau('if a then\n\treturn 1\nend\nprint(2)\n').ast;
  const cfg = buildCfg(ast.body, { name: 'test' });
  const reachable = cfg.reachable();
  assert.ok(reachable.has(cfg.exit.id), 'the exit must be reachable');
  assert.ok(cfg.fallsThrough, 'the `if` can be skipped, so control falls off the end');
});

// ------------------------------------------------------------------ dead code

test('a statically false branch is dead, and a statically true one kills its else', () => {
  const findings = deadCode(`if false then
	print("never")
end
if true then
	print("always")
else
	print("dead")
end
`);
  assert.deepEqual(lines(findings), ['unreachable-code@2', 'unreachable-code@7']);
});

test('code after a loop that cannot exit is unreachable', () => {
  const findings = deadCode('while true do\n\ttask.wait()\nend\nprint("never runs")\n');
  assert.deepEqual(lines(findings), ['unreachable-code@4']);
});

test('code after a loop that CAN exit is not reported', () => {
  const findings = deadCode('while true do\n\tif done then break end\nend\nprint("runs")\n');
  assert.deepEqual(findings, []);
});

test('statements after an unconditional error() are unreachable', () => {
  const findings = deadCode('local function f()\n\terror("no")\n\tprint("never")\nend\nreturn f\n');
  assert.deepEqual(lines(findings), ['unreachable-code@3']);
});

test('a normal branching function has no dead code', () => {
  const findings = deadCode(`local function classify(n)
	if n < 0 then
		return "negative"
	elseif n == 0 then
		return "zero"
	end
	return "positive"
end
return classify
`);
  assert.deepEqual(findings, []);
});

// ------------------------------------------------------------------ returns

test('a function that returns a value on one path and nothing on another is reported', () => {
  const findings = inconsistentReturns('local function get(x)\n\tif x then\n\t\treturn 1\n\tend\nend\nreturn get\n');
  assert.deepEqual(lines(findings), ['inconsistent-return@1']);
});

test('a function that returns on every path is not reported', () => {
  const findings = inconsistentReturns('local function get(x)\n\tif x then\n\t\treturn 1\n\tend\n\treturn 0\nend\nreturn get\n');
  assert.deepEqual(findings, []);
});

test('a function that returns nothing anywhere is not reported', () => {
  const findings = inconsistentReturns('local function run(x)\n\tif x then\n\t\treturn\n\tend\n\tprint(x)\nend\nreturn run\n');
  assert.deepEqual(findings, []);
});

// ------------------------------------------------------------------ infinite loops

test('a forever loop that never yields is an error; one that yields is not a finding', () => {
  assert.deepEqual(lines(infiniteLoops('while true do\n\tlocal n = 1 + 1\nend\n')), ['no-yield-infinite-loop@1']);
  assert.deepEqual(infiniteLoops('while true do\n\ttask.wait(1)\nend\n'), []);
  assert.deepEqual(infiniteLoops('while true do\n\tif done then break end\n\ttask.wait()\nend\n'), []);
});

test('`repeat ... until false` is a forever loop too', () => {
  assert.deepEqual(lines(infiniteLoops('repeat\n\tlocal n = 1\nuntil false\n')), ['no-yield-infinite-loop@1']);
  assert.deepEqual(infiniteLoops('repeat\n\tlocal n = 1\nuntil done\n'), []);
});

test('a `break` in a NESTED loop does not exempt the outer loop', () => {
  // The distinction the rule turns on: `break` is loop-scoped, `return` is not.
  const nested = 'while true do\n\tfor i = 1, 3 do\n\t\tif i == 2 then break end\n\tend\nend\n';
  assert.deepEqual(lines(infiniteLoops(nested)), ['no-yield-infinite-loop@1']);

  const returns = 'local function f()\n\twhile true do\n\t\tfor i = 1, 3 do\n\t\t\tif i == 2 then return end\n\t\tend\n\tend\nend\nreturn f\n';
  assert.deepEqual(infiniteLoops(returns), [], 'a return leaves every enclosing loop');
});

test('a yield reached through a local helper counts, when the call graph is supplied', () => {
  const src = 'local function pause()\n\ttask.wait(1)\nend\nwhile true do\n\tpause()\nend\n';
  assert.deepEqual(
    lines(infiniteLoops(src)),
    ['no-yield-infinite-loop@4'],
    'without the call graph the helper is opaque and the loop looks like a hang',
  );
  assert.deepEqual(
    infiniteLoops(src, { yieldingFunctions: new Set(['pause']) }),
    [],
    'with the call graph it is a normal service loop',
  );
});

test('a loop whose condition nothing can change is reported', () => {
  const findings = infiniteLoops('local i = 1\nwhile i < 10 do\n\tprint(i)\nend\n');
  assert.deepEqual(lines(findings), ['never-updated-loop-condition@2']);
  assert.match(findings[0].detail, /`i`/);
});

test('the four ways a loop condition CAN change are each exempted', () => {
  // Each of these is one character away from the reported case above, and each must stay silent.
  const cases = {
    'the body increments it': 'local i = 1\nwhile i < 10 do\n\ti += 1\nend\n',
    'the body yields, so another thread can set it': 'local ready = false\nwhile not ready do\n\ttask.wait()\nend\n',
    'the value is a table something can mutate': 'local queue = {}\nwhile #queue > 0 do\n\tdrain(queue)\nend\n',
    'the body can break out': 'local i = 1\nwhile i < 10 do\n\tif stop then break end\nend\n',
  };
  for (const [why, src] of Object.entries(cases)) {
    assert.deepEqual(infiniteLoops(src), [], `false positive: ${why}`);
  }
});

test('a global in the loop condition is never reported', () => {
  // Another script could be writing it; we cannot see that, so we must not claim it.
  assert.deepEqual(infiniteLoops('while Running do\n\tprint(1)\nend\n'), []);
});

// ------------------------------------------------------------------ whole-file shape

test('controlFlow reports one CFG per function plus the chunk', () => {
  const analysis = controlFlow('local function a() end\nlocal b = function() end\nprint(1)\n');
  assert.deepEqual(analysis.functions.map((f) => f.name), ['<chunk>', 'a', '<anonymous>']);
  assert.ok(analysis.functions.every((f) => f.blockCount >= 2));
});
