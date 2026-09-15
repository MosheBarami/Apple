// Tool-argument grading.
//
// The pair of cases this file is built around is the last two tests: `null` tool calls and `[]`
// tool calls. They are one JSON field apart and they mean opposite things, and every other
// assertion here is only worth having if that distinction holds.
import test from 'node:test';
import assert from 'node:assert/strict';

import { gradeToolCalls, matchArg, validateExpectTools, ARG_MATCHERS } from './tool-grader.mjs';
import { validateTask } from './tasks.mjs';

const EXPECT = [{ name: 'create_instance', args: { className: 'Part', name: { type: 'string' } }, required: ['parent'] }];
const GOOD = [{ name: 'create_instance', args: { className: 'Part', name: 'Beacon', parent: 'Workspace' } }];

test('a call that matches everything scores 1', () => {
  const r = gradeToolCalls(EXPECT, GOOD);
  assert.equal(r.available, true);
  assert.equal(r.score, 1);
  assert.deepEqual(r.findings, []);
});

test('a wrong argument VALUE lowers the score without zeroing a correct call', () => {
  const r = gradeToolCalls(EXPECT, [{ name: 'create_instance', args: { className: 'Model', name: 'Beacon', parent: 'Workspace' } }]);
  // The relationship is the claim: right tool + wrong arg must land strictly between a perfect
  // call and a missing one. A pass/fail grader cannot tell those three apart.
  assert.ok(r.score < 1, 'a wrong className scored the same as a right one');
  assert.ok(r.score > gradeToolCalls(EXPECT, []).score, 'a wrong argument scored no better than never calling the tool');
  assert.equal(r.findings.length, 1);
  assert.equal(r.findings[0].kind, 'bad_arg');
  assert.equal(r.findings[0].arg, 'className');
});

test('a missing REQUIRED argument is caught even when every declared matcher passes', () => {
  // `parent` has no matcher, only a `required` entry. A grader that only walked `args` would
  // report this call as perfect -- and an instance created with no parent never appears.
  const r = gradeToolCalls(EXPECT, [{ name: 'create_instance', args: { className: 'Part', name: 'Beacon' } }]);
  assert.ok(r.score < 1);
  assert.deepEqual(r.findings.map((f) => [f.kind, f.arg]), [['missing_arg', 'parent']]);
});

test('a wrong argument TYPE is caught', () => {
  const r = gradeToolCalls(EXPECT, [{ name: 'create_instance', args: { className: 'Part', name: 42, parent: 'Workspace' } }]);
  assert.equal(r.findings.length, 1);
  assert.match(r.findings[0].why, /type number, expected string/);
});

test('the wrong tool entirely is a missing call, not a partial credit', () => {
  const r = gradeToolCalls(EXPECT, [{ name: 'delete_instance', args: { path: 'Workspace.Beacon' } }]);
  assert.equal(r.score, 0, 'calling a different tool earned credit for the expected one');
  assert.ok(r.findings.some((f) => f.kind === 'missing_call'));
  assert.ok(r.findings.some((f) => f.kind === 'unexpected_call' && f.tool === 'delete_instance'));
});

test('spraying extra tool calls lowers the score instead of hiding inside a correct one', () => {
  const sprayed = [...GOOD, { name: 'delete_instance', args: {} }, { name: 'run_script', args: {} }];
  const strict = gradeToolCalls(EXPECT, sprayed);
  assert.ok(strict.score < 1, 'a model that calls every tool it can think of scored a perfect 1.0');
  assert.equal(strict.findings.filter((f) => f.kind === 'unexpected_call').length, 2);
  // ...and the same input scores 1 when the task says it does not care about extras.
  assert.equal(gradeToolCalls(EXPECT, sprayed, { strict: false }).score, 1);
});

test('the score is monotone: more satisfied constraints never scores lower', () => {
  const worse = gradeToolCalls(EXPECT, [{ name: 'create_instance', args: { className: 'Model', name: 42 } }]);
  const better = gradeToolCalls(EXPECT, [{ name: 'create_instance', args: { className: 'Part', name: 42 } }]);
  const best = gradeToolCalls(EXPECT, GOOD);
  assert.ok(worse.score < better.score, `${worse.score} !< ${better.score}`);
  assert.ok(better.score < best.score, `${better.score} !< ${best.score}`);
  for (const r of [worse, better, best]) assert.ok(r.score >= 0 && r.score <= 1, `score out of range: ${r.score}`);
});

// =============================================================================================
// The distinction the module exists for
// =============================================================================================

test('NO TOOL CALLS RECORDED is unavailable; NO TOOL CALLS MADE is a zero', () => {
  const neverLooked = gradeToolCalls(EXPECT, null);
  assert.equal(neverLooked.available, false, 'a run that captured nothing was graded anyway');
  assert.equal(neverLooked.reason, 'no_tool_calls_recorded');
  assert.equal(neverLooked.score, undefined, 'an unavailable grade carried a score');

  const lookedAndFoundNone = gradeToolCalls(EXPECT, []);
  assert.equal(lookedAndFoundNone.available, true, 'an empty array is an observation and must be graded');
  assert.equal(lookedAndFoundNone.score, 0);
  assert.deepEqual(lookedAndFoundNone.findings.map((f) => f.kind), ['missing_call']);

  // undefined is the same fact as null: the field was never written.
  assert.equal(gradeToolCalls(EXPECT, undefined).available, false);
  // A non-array is malformed, which is also not a zero.
  assert.equal(gradeToolCalls(EXPECT, 'oops').reason, 'malformed_tool_calls');
});

test('a task that declares no expectations is unavailable, not a free 1.0', () => {
  assert.equal(gradeToolCalls([], GOOD).available, false);
  assert.equal(gradeToolCalls(undefined, GOOD).reason, 'no_tool_expectations');
});

// =============================================================================================
// Matchers
// =============================================================================================

test('each matcher accepts what it should and rejects what it should not', () => {
  assert.equal(matchArg({ equals: 5 }, 5, true).ok, true);
  assert.equal(matchArg({ equals: 5 }, '5', true).ok, false);
  assert.equal(matchArg({ oneOf: ['a', 'b'] }, 'b', true).ok, true);
  assert.equal(matchArg({ oneOf: ['a', 'b'] }, 'c', true).ok, false);
  assert.equal(matchArg({ matches: '^Work' }, 'Workspace', true).ok, true);
  assert.equal(matchArg({ matches: '^Work' }, 'game.Workspace', true).ok, false);
  assert.equal(matchArg({ matches: '^Work' }, 7, true).ok, false, 'a regex matcher accepted a non-string');
  assert.equal(matchArg({ type: 'array' }, [1], true).ok, true);
  assert.equal(matchArg({ type: 'array' }, { 0: 1 }, true).ok, false, 'an object passed as an array');
  assert.equal(matchArg({ type: 'null' }, null, true).ok, true);
  assert.equal(matchArg({ present: true }, undefined, false).ok, false);
  assert.equal(matchArg('literal', 'literal', true).ok, true);
  assert.equal(matchArg('literal', 'other', true).ok, false);
  // A key that is absent fails every matcher, rather than vacuously satisfying it.
  for (const m of [{ equals: 1 }, { type: 'string' }, { oneOf: [1] }, { matches: '.' }, 'lit']) {
    assert.equal(matchArg(m, undefined, false).ok, false, `${JSON.stringify(m)} was satisfied by an absent argument`);
  }
});

test('deep equality is used for object and array arguments', () => {
  assert.equal(matchArg({ equals: { a: [1, 2] } }, { a: [1, 2] }, true).ok, true);
  assert.equal(matchArg({ equals: { a: [1, 2] } }, { a: [2, 1] }, true).ok, false);
  assert.equal(matchArg({ equals: { a: 1 } }, { a: 1, b: 2 }, true).ok, false, 'an extra key was ignored');
});

test('arguments are read from args, arguments or input', () => {
  for (const key of ['args', 'arguments', 'input']) {
    const call = { name: 'create_instance', [key]: { className: 'Part', name: 'x', parent: 'Workspace' } };
    assert.equal(gradeToolCalls(EXPECT, [call]).score, 1, `tool call shape {${key}} was not read`);
  }
});

// =============================================================================================
// Load-time validation: a misspelled matcher must not become a check that cannot fail
// =============================================================================================

test('a misspelled matcher is rejected at load time', () => {
  const errs = validateExpectTools([{ name: 't', args: { x: { equal: 5 } } }]);
  assert.ok(errs.some((e) => /unknown matcher\(s\) equal/.test(e)), JSON.stringify(errs));
  // Left unvalidated, `{equal: 5}` has no recognised key, so nothing is checked and the argument
  // passes whatever the model sent.
  assert.equal(matchArg({ equal: 5 }, 'anything at all', true).ok, true, 'this is exactly why the validator exists');
});

test('every advertised matcher name is one matchArg actually implements', () => {
  // The DISPATCHABLE_CHECK_TYPES defect, one level down: a matcher advertised in ARG_MATCHERS
  // and not implemented would be accepted by the validator and then ignored by the grader.
  const probes = {
    equals: [{ equals: 'x' }, 'x', 'y'],
    matches: [{ matches: '^x$' }, 'x', 'y'],
    type: [{ type: 'string' }, 'x', 5],
    oneOf: [{ oneOf: ['x'] }, 'x', 'y'],
    present: [{ present: true }, 'x', undefined],
  };
  assert.deepEqual(Object.keys(probes).sort(), [...ARG_MATCHERS].sort(), 'ARG_MATCHERS and the probes here have drifted');
  for (const [name, [matcher, good, bad]] of Object.entries(probes)) {
    assert.equal(matchArg(matcher, good, true).ok, true, `${name} rejected a value it should accept`);
    assert.equal(matchArg(matcher, bad, bad !== undefined).ok, false, `${name} accepted a value it should reject -- it is not implemented`);
  }
});

test('an invalid regex, a bad type name and a malformed spec are all load errors', () => {
  assert.ok(validateExpectTools([{ name: 't', args: { x: { matches: '([' } } }]).some((e) => /invalid regex/.test(e)));
  assert.ok(validateExpectTools([{ name: 't', args: { x: { type: 'Instance' } } }]).some((e) => /unknown type/.test(e)));
  assert.ok(validateExpectTools([{ args: {} }]).some((e) => /missing tool name/.test(e)));
  assert.ok(validateExpectTools([]).some((e) => /non-empty array/.test(e)));
  assert.ok(validateExpectTools([{ name: 't', required: 'parent' }]).some((e) => /array of argument names/.test(e)));
  assert.deepEqual(validateExpectTools([{ name: 't', args: { x: { type: 'string' } }, required: ['y'] }]), []);
});

test('the task loader runs that validation, so a bad expectTools cannot reach a paid run', () => {
  // Reachability, not just correctness: validateExpectTools passing its own unit test means
  // nothing if loadTasks never calls it.
  const errs = validateTask({ id: 'p', category: 'c', prompt: 'p', checks: [{ type: 'contains', target: 'text', value: 'x' }], expectTools: [{ name: 't', args: { x: { equal: 5 } } }] }, 'probe.json');
  assert.ok(errs.some((e) => /unknown matcher/.test(e)), JSON.stringify(errs));
  const clean = validateTask({ id: 'p', category: 'c', prompt: 'p', checks: [{ type: 'contains', target: 'text', value: 'x' }], expectTools: [{ name: 't', args: { x: { equals: 5 } } }] }, 'probe.json');
  assert.deepEqual(clean, []);
});
