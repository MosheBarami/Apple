// Proof that the composed analyser adds the structural checks WITHOUT losing the scanner's rules,
// and that the one place the two overlap is resolved rather than double-reported.
//
// The deduplication is the assertion most at risk of being vacuous: "the scanner's finding is
// suppressed" is trivially true if the scanner never fired in the first place. So the test first
// proves `analyzeLuau` DOES report `busy-wait-loop` on the sample, then proves `analyzeFile` shows
// exactly one finding for that line, then proves the suppression is conditional by feeding a file
// that does not parse and watching the scanner's finding come back.
import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeFile, analyzePlace, summarizeFile, TEST_GLOBALS } from './luau-intel.mjs';
import { analyzeLuau, fired } from './roblox-antipatterns.mjs';

const rulesAt = (result, line) => result.findings.filter((f) => f.line === line).map((f) => f.rule).sort();

test('the scanner rules still run, and their findings are carried through', () => {
  const src = `local remote = game:GetService("ReplicatedStorage"):WaitForChild("Ask", 5)
game:GetService("Players").PlayerAdded:Connect(function(player)
	local answer = remote:InvokeClient(player, "ready?")
	print(player.Name, answer)
end)
`;
  const result = analyzeFile(src);
  assert.equal(result.context, 'server');
  assert.ok(
    result.findings.some((f) => f.rule === 'remote-function-to-client' && f.line === 3),
    `expected the scanner's rule; got ${JSON.stringify(result.findings.map((f) => f.rule))}`,
  );
});

test('the structural findings the scanner cannot produce are added', () => {
  const src = `local Unused = 1
local function orphan() return 1 end
while true do
	local n = 1
end
print("unreachable")
`;
  const result = analyzeFile(src);
  // The exact set, not "contains": a rule that fires twice, or one that quietly stops firing, both
  // have to show up here.
  assert.deepEqual(result.findings.map((f) => `${f.rule}@${f.line}`), [
    'unused-local@1',
    'unused-local@2',
    'no-yield-infinite-loop@3',
    'unused-local@4',
    'unreachable-code@6',
  ]);
});

test('a dead function reachable only from another dead function is still reported', () => {
  // This is the case `unused-local` cannot state: `helper` IS read — by `caller`, which nothing
  // calls. Only the call graph knows that makes it unreachable. It is also the case the
  // deduplication must not swallow.
  const src = `local function helper() return 1 end
local function caller() return helper() end
return 2
`;
  const result = analyzeFile(src);
  assert.deepEqual(result.findings.map((f) => `${f.rule}@${f.line}`), [
    'unreachable-function@1',
    'unused-local@2',
  ]);
});

test('the scanner and the CFG do not both report the same hang', () => {
  const src = 'while true do\n\tlocal n = 1\nend\n';

  // 1. the scanner really does fire here — without this, the suppression below proves nothing
  assert.ok(fired(analyzeLuau(src, { context: 'server', rules: ['busy-wait-loop'] }), 'busy-wait-loop'));

  // 2. the composed report carries the better-informed finding, once
  assert.deepEqual(rulesAt(analyzeFile(src, { context: 'server' }), 1), ['no-yield-infinite-loop']);
});

test('when the file does not parse, the scanner\'s finding is kept', () => {
  // A syntax error must not mean FEWER checks than a clean file. The CFG is unavailable here, so
  // the regex rule is the only thing that can speak.
  const src = 'while true do\n\tlocal n = 1\nend\nlocal x = (\n';
  const result = analyzeFile(src, { context: 'server' });
  assert.equal(result.ok, false);
  assert.ok(result.findings.some((f) => f.rule === 'busy-wait-loop' && f.line === 1));
  assert.ok(result.findings.some((f) => f.rule === 'syntax-error'));
});

test('a syntax error is reported as a finding with its line', () => {
  const result = analyzeFile('local function f()\n\tprint(1)\n');
  const err = result.findings.find((f) => f.rule === 'syntax-error');
  assert.ok(err);
  assert.equal(err.severity, 'error');
  assert.equal(result.errorCount >= 1, true);
});

test('a spec file is not punished for the globals its runner injects', () => {
  const spec = `return function()
	describe("shop", function()
		it("adds", function()
			expect(1 + 1).to.equal(2)
		end)
	end)
end
`;
  const result = analyzeFile(spec);
  assert.equal(result.isTest, true);
  assert.deepEqual(result.findings.filter((f) => f.rule === 'unknown-global'), []);
  for (const g of ['describe', 'it', 'expect']) assert.ok(TEST_GLOBALS.has(g));

  // and the exemption is scoped to tests: the same names in shipped code are still reported
  const shipped = 'print(describe)\n';
  const plain = analyzeFile(shipped);
  assert.equal(plain.isTest, false);
  assert.deepEqual(plain.findings.filter((f) => f.rule === 'unknown-global').map((f) => f.detail.includes('describe')), [true]);
});

test('an accidental global and a nil global read are both reported', () => {
  const result = analyzeFile('Leaked = 1\nprint(Typoed)\n');
  assert.deepEqual(rulesAt(result, 1), ['implicit-global']);
  assert.deepEqual(rulesAt(result, 2), ['unknown-global']);
});

test('analyzePlace adds the facts that only exist between scripts', () => {
  const place = [
    { path: 'ServerScriptService/Main', source: 'local S = require(game:GetService("ReplicatedStorage").Shop)\nS.Start()\n' },
    { path: 'ReplicatedStorage/Shop', source: 'local E = require(script.Parent.Economy)\nreturn { Start = function() return E end }\n' },
    { path: 'ReplicatedStorage/Economy', source: 'local S = require(script.Parent.Shop)\nreturn { S = S }\n' },
  ];
  const result = analyzePlace(place);
  assert.equal(result.totals.scripts, 3);
  assert.equal(result.totals.parsed, 3);
  assert.equal(result.totals.requireCycles, 1);
  assert.deepEqual(result.findings.map((f) => f.rule), ['require-cycle']);
  assert.ok(result.symbols.some((s) => s.name === 'Start' && s.path === 'ReplicatedStorage/Shop'));
  assert.deepEqual(result.search('require').map((h) => h.path).sort(), [
    'ReplicatedStorage/Economy', 'ReplicatedStorage/Shop', 'ServerScriptService/Main',
  ]);
});

test('analyzePlace on an empty or non-array input does not throw', () => {
  for (const input of [[], null, undefined]) {
    const result = analyzePlace(input);
    assert.equal(result.totals.scripts, 0);
    assert.deepEqual(result.findings, []);
  }
});

test('summarizeFile reports the counts it actually measured', () => {
  const summary = summarizeFile('local M = {}\ntype Cfg = {}\nfunction M.Go() end\nlocal u = 1\nreturn M\n');
  assert.equal(summary.functions, 1);
  assert.equal(summary.types, 1);
  assert.equal(summary.warnings >= 1, true, 'the unused `u` is a warning');
  assert.ok(summary.topFindings[0].includes('unused-local'));
});
