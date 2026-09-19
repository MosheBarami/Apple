import test from 'node:test';
import assert from 'node:assert/strict';
import { ALL_GAME_LOGIC_CURRICULUM } from './build-game-logic.mjs';
import { checkCandidate } from './evaluate-game-logic.mjs';
import { originalContractCases, supplementalContractCases } from './diagnosis-contract-cases.mjs';

const examples = ['weighted-selection', 'team-balance'].map(id => ALL_GAME_LOGIC_CURRICULUM.find(e => e.id === id));
const fenced = source => `\`\`\`luau\n${source}\n\`\`\``;
function replaceOnce(source, before, after) {
  assert.equal(source.split(before).length, 2, 'mutate one unique site');
  return source.replace(before, after);
}
async function runCases(example, source, cases = originalContractCases(example.checks)) {
  const rows = [];
  for (const c of cases) rows.push({ id: c.id, assertion: c.assertion, ...(await checkCandidate({ checks: c.checks }, fenced(source))) });
  return rows;
}

test('AST case extraction ignores comments and strings and preserves multiline source locations', () => {
  const checks = 'local text = "assert(false)"\n-- assert(false)\n--[[ assert(false) ]]\nassert(\n candidate({1}, 0) == 1\n)\nassert(candidate({1}, 1) == nil)';
  const cases = originalContractCases(checks);
  assert.equal(cases.length, 2);
  assert.equal(cases[0].line, 4);
  assert.equal(cases[0].endLine, 6);
  assert.equal(cases[1].assertion, 'assert(candidate({1}, 1) == nil)');
});

test('empty, nested, unparsable, shadowed and reserved harness inputs are refused', () => {
  for (const checks of ['-- assert(true)', 'for i=1,2 do assert(true) end', 'assert(',
    'local assert = function() end\nassert(false)', 'local __apple_diag_value = 1\nassert(true)']) {
    assert.throws(() => originalContractCases(checks));
  }
  assert.throws(() => supplementalContractCases('not-reviewed'), /no reviewed/);
});

test('nested assertions inside otherwise allowed local setup cannot silently disappear', () => {
  const checks = 'local unused = function() assert(false) end\nassert(candidate() == 1)';
  assert.throws(() => originalContractCases(checks), /nested/);
});

test('both reference answers execute successfully against every original and supplemental case', async () => {
  for (const example of examples) {
    const cases = [...originalContractCases(example.checks), ...supplementalContractCases(example.id)];
    const rows = await runCases(example, example.source, cases);
    assert.ok(rows.length > 15, 'non-empty diagnostic denominator');
    assert.equal(rows.every(r => r.passed), true, JSON.stringify(rows.filter(r => !r.passed)));
    assert.equal((await checkCandidate(example, fenced(example.source))).passed, true);
  }
});

test('boundary mutant exposes multiple later failures while unchanged canonical scoring still fails', async () => {
  const example = examples[0];
  const source = replaceOnce(example.source, ...example.mutation);
  assert.equal((await checkCandidate(example, fenced(source))).passed, false);
  const rows = await runCases(example, source);
  const failures = rows.filter(r => !r.passed);
  assert.ok(failures.length > 1);
  assert.equal(failures[0].assertion, 'assert(candidate(weights, 1) == 2)');
  assert.match(failures[0].stderr, /expected=2 actual=1/);
  assert.ok(failures.some(r => r.assertion === 'assert(candidate({0, 0, 2}, 0) == 3)'), 'later zero-weight assertion was executed');
});

test('validated coverage gap: type-guard mutant passes original contract but fails supplemental invalid-input execution', async () => {
  const example = examples[0];
  const source = replaceOnce(example.source,
    'if type(value) ~= "table" or getmetatable(value) ~= nil then return false end',
    'if getmetatable(value) ~= nil then return false end');
  const original = await checkCandidate(example, fenced(source));
  assert.equal(original.passed, true, 'original contract has no non-table weights case');
  const probe = supplementalContractCases(example.id).find(c => c.id === 'array-type');
  const result = await checkCandidate({ checks: probe.checks }, fenced(source));
  assert.equal(result.passed, false);
  assert.equal(result.reason, 'exit');
  assert.equal(result.exitCode, 1);
  assert.match(result.stderr, /attempt to get length of a number value/);
});

test('supplementary integer-domain probe catches a capacity defect not covered by original assertions', async () => {
  const example = examples[1];
  const source = replaceOnce(example.source, 'or not integer(capacity) or capacity <= 0',
    'or type(capacity) ~= "number" or capacity <= 0');
  assert.equal((await checkCandidate(example, fenced(source))).passed, true);
  const probe = supplementalContractCases(example.id).find(c => c.id === 'fractional-capacity');
  const result = await checkCandidate({ checks: probe.checks }, fenced(source));
  assert.equal(result.passed, false);
  assert.match(result.stderr, /expected=nil actual=1/);
});

test('measured assertions call candidate once and preserve preceding calls', async () => {
  const example = { ...examples[0], checks: 'assert(candidate() == 1)\nassert(candidate() == 2)' };
  const source = 'local count = 0\nreturn function() count += 1 return count end';
  assert.equal((await checkCandidate(example, fenced(source))).passed, true);
  assert.deepEqual((await runCases(example, source)).map(r => r.passed), [true, true]);
});

test('continuing past a failed assertion retains its input mutation for subsequent checks', async () => {
  const example = { ...examples[0], checks: 'local input = {1}\nassert(candidate(input) == false)\nassert(input[1] == 1)' };
  const source = 'return function(input) input[1] = 7 return true end';
  assert.equal((await checkCandidate(example, fenced(source))).passed, false);
  assert.deepEqual((await runCases(example, source)).map(r => r.passed), [false, false]);
});

test('case derivation is deterministic and never mutates reference checks or promotes test rows', () => {
  for (const example of examples) {
    const before = JSON.stringify(example);
    assert.deepEqual(originalContractCases(example.checks), originalContractCases(example.checks));
    assert.deepEqual(supplementalContractCases(example.id), supplementalContractCases(example.id));
    assert.equal(JSON.stringify(example), before);
    assert.ok(supplementalContractCases(example.id).every(c => c.origin === 'supplemental-prompt-contract'));
    assert.ok(supplementalContractCases(example.id).every(c => !Object.hasOwn(c, 'messages')));
  }
});
