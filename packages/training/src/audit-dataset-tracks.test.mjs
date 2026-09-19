import { test } from 'node:test';
import assert from 'node:assert/strict';
import { auditRows, INSTRUCTION_SUFFIX } from './audit-dataset.mjs';
import { looksLikeDescription } from './build-dataset.mjs';

/**
 * The auditor learned a second row shape. These are the guards on that.
 *
 * The hazard being guarded is specific: an instrument that cannot express the new data will
 * report NOT_READY, and that verdict will be read as a fact about the data when it is a fact
 * about the ruler. The opposite hazard is worse — quietly widening the rules until everything
 * passes. So every test here pairs an admission with a rejection.
 */

const guard = { taskCount: 1, shingles: new Set(), parseErrors: [] };
const audit = (rows) => auditRows({ train: rows, val: [], test: [] }, { evalGuard: guard, licenseIndex: null });
const codes = (report) => new Set(report.errors.map((e) => e.code));

const firstPartyMeta = { id: 'x', family: 'f', origin: 'first-party-authored', rights: 'private-project-source-not-publicly-licensed' };

const trajectoryRow = (overrides = {}) => ({
  messages: [
    { role: 'system', content: 'You are Apple, a Roblox engineering assistant.' },
    { role: 'user', content: 'Put a platform in the sky please' },
    { role: 'assistant', content: '', tool_calls: [{ id: 'call_0', type: 'function', function: { name: 'create_instances', arguments: '{"items":[]}' } }] },
  ],
  meta: { ...firstPartyMeta, kind: 'apple-tool-trajectory' },
  ...overrides,
});

test('a tool trajectory is not judged by the code-row shape rules', () => {
  const report = audit([trajectoryRow()]);
  const found = codes(report);
  assert.ok(!found.has('message_shape'), 'a trajectory transcript is not a malformed three-message code row');
  assert.ok(!found.has('response_empty'), 'an assistant turn carrying tool_calls is not an empty response');
  assert.ok(!found.has('instruction_suffix'), 'the harvest suffix does not apply to a trajectory');
  assert.equal(report.totals.trajectoryRows, 1);
});

test('but a trajectory that teaches nothing about tools is still refused', () => {
  const noCalls = trajectoryRow({
    messages: [
      { role: 'system', content: 'You are Apple.' },
      { role: 'user', content: 'Put a platform in the sky please' },
      { role: 'assistant', content: 'Sure, done.' },
    ],
    meta: { ...firstPartyMeta, kind: 'apple-tool-trajectory' },
  });
  // Declared a trajectory by its meta, so it is held to the trajectory rules and fails them.
  assert.ok(codes(audit([noCalls])).has('no_tool_call'));
});

test('tool call arguments that are not a JSON string are refused', () => {
  const objectArgs = trajectoryRow();
  objectArgs.messages[2].tool_calls[0].function.arguments = { items: [] };
  assert.ok(codes(audit([objectArgs])).has('tool_call_shape'));

  const notJson = trajectoryRow();
  notJson.messages[2].tool_calls[0].function.arguments = '{items: [}';
  assert.ok(codes(audit([notJson])).has('tool_call_shape'));
});

test('a first-party row proves provenance by rights, not by an SPDX it cannot have', () => {
  const clean = audit([trajectoryRow()]);
  for (const code of ['spdx_missing', 'pin_missing', 'path_missing', 'source_missing', 'license_regression']) {
    assert.ok(!codes(clean).has(code), `${code} is inapplicable to a row this repository authored`);
  }

  const noRights = trajectoryRow({ meta: { id: 'x', family: 'f', origin: 'first-party-authored', kind: 'apple-tool-trajectory' } });
  assert.ok(codes(audit([noRights])).has('rights_missing'), 'a first-party row must still say what its rights are');
});

test('a first-party row that also claims an upstream licence is refused', () => {
  // A fabricated provenance is worse than a missing one: it would launder authored data as
  // harvested-and-cleared, and the licence registry would agree with it.
  const both = trajectoryRow({ meta: { ...firstPartyMeta, kind: 'apple-tool-trajectory', spdx: 'MIT', sha: 'a'.repeat(40) } });
  const found = codes(audit([both]));
  assert.ok(found.has('false_provenance'));
});

test('a first-party row may not claim it was captured from Studio', () => {
  const claims = trajectoryRow({ meta: { ...firstPartyMeta, kind: 'apple-tool-trajectory', capturedFromStudio: true } });
  assert.ok(codes(audit([claims])).has('false_provenance'));
});

test('the harvest suffix is required of harvested rows and not of authored ones', () => {
  const codeRow = (meta, suffix) => ({
    messages: [
      { role: 'system', content: 'You are Apple, an expert Roblox engineer.' },
      { role: 'user', content: 'Write a standalone Luau module returning add(a, b) that returns their sum.' + suffix },
      { role: 'assistant', content: '```luau\nreturn function(a, b)\n    return a + b\nend\n```' },
    ],
    meta,
  });
  const harvested = { id: 'h', family: 'f', source: 'https://example.invalid/repo', spdx: 'MIT', sha: 'b'.repeat(40), path: 'src/a.lua' };

  assert.ok(codes(audit([codeRow(harvested, '')])).has('instruction_suffix'), 'a harvested row still owes the suffix');
  assert.ok(!codes(audit([codeRow({ ...firstPartyMeta }, '')])).has('instruction_suffix'), 'an authored prompt is already the instruction');
  assert.ok(!codes(audit([codeRow(harvested, INSTRUCTION_SUFFIX)])).has('instruction_suffix'));
});

test('"then" twice is English, and a Luau assignment is not', () => {
  // The rule fired on any two of local/end/then/elseif anywhere in the text, which rejected a
  // perfectly ordinary sorting instruction. Its first replacement then rejected "This function
  // returns..." and "Sets the value at the end" — caught because the harvested dataset's usable
  // count fell. Both directions are pinned here.
  assert.equal(looksLikeDescription('Return the rows ordered by rarity, then by name ascending, then by id ascending.'), true);
  assert.equal(looksLikeDescription('This function returns the player name for the given user id.'), true);
  assert.equal(looksLikeDescription('Sets the stored value and clears the marker at the end.'), true);

  assert.equal(looksLikeDescription('local Players = game:GetService("Players") and more text here'), false);
  assert.equal(looksLikeDescription('if value == nil then return end and some trailing words'), false);
  assert.equal(looksLikeDescription('function onTouch(part) does the thing for us all'), false);
});
