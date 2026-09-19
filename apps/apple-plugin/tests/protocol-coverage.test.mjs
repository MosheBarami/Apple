import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const shared = readFileSync(new URL('../../../packages/shared/src/index.ts', import.meta.url), 'utf8');
const commands = readFileSync(new URL('../src/Commands.luau', import.meta.url), 'utf8');
const generation = readFileSync(new URL('../src/GenerationService.luau', import.meta.url), 'utf8');

function tableKeys(name) {
  const match = new RegExp(`local ${name} = \\{([\\s\\S]*?)\\n\\}`, 'm').exec(commands);
  assert.ok(match, `${name} table was not found`);
  return new Set([...match[1].matchAll(/^\s*([a-z_]+)\s*=/gm)].map((entry) => entry[1]));
}

test('every live StudioOp has a handler, named refusal, deferred path, restore preflight, or waypoint path', () => {
  const union = /export type StudioOp =([\s\S]*?);\n\n\/\*\*/m.exec(shared);
  assert.ok(union, 'StudioOp union was not found');
  const liveOps = new Set([...union[1].matchAll(/op:\s*'([a-z_]+)'/g)].map((entry) => entry[1]));
  const handlers = tableKeys('HANDLERS');
  const refused = tableKeys('UNSUPPORTED');
  const deferred = tableKeys('DEFERRED_MUTATING');
  const accounted = new Set([...handlers, ...refused, ...deferred, 'restore', 'undo_waypoint']);

  assert.deepEqual(
    [...liveOps].filter((op) => !accounted.has(op)),
    [],
    'a backend StudioOp would fall through to the generic unknown-operation response',
  );
  assert.deepEqual(
    [...accounted].filter((op) => !liveOps.has(op)),
    [],
    'the plugin names an operation that is no longer in the shared wire union',
  );
});

test('dangerous compatibility operations explain their refusal', () => {
  for (const op of ['run_code', 'insert_asset']) {
    assert.match(commands, new RegExp(`\\b${op}\\s*=\\s*"[^"]{24,}"`));
  }
  assert.match(commands, /received text is never loaded, required or executed/);
  assert.match(commands, /no remote asset loader/);
  assert.match(commands, /no substitute was created/);
});

test('restore is the bounded preflight-before-recording path', () => {
  assert.ok(tableKeys('MUTATING').has('restore'));
  assert.match(commands, /if name == "restore" then[\s\S]*?prepareRestore\(self, op\)/);
  assert.match(commands, /prepareRestore\(self, op\)[\s\S]*?beginRecording\(self\.history, self\.enum, id, name\)/);
  assert.match(commands, /restore requires a live Studio consent fence/);
  assert.match(commands, /restore checkpointId does not match the snapshot identity/);
  assert.match(commands, /snapshot script source hash does not match its source/);
  assert.match(commands, /FinishRecordingOperation\.Cancel/);
});

test('generate_model is a deferred recorded write with one bounded provider adapter', () => {
  assert.ok(tableKeys('DEFERRED_MUTATING').has('generate_model'));
  assert.match(commands, /return runGeneration\(self, id, op, allowEdits, stillCurrent, editMode, started\)/);
  assert.match(commands, /beginRecording\(self\.history, self\.enum, id, "generate_model"\)/);
  assert.match(generation, /GenerateModelAsync\(normalized\.inputs, normalized\.schema\)/);
  assert.equal((generation.match(/GenerateModelAsync\s*\(/g) ?? []).length, 1);
  assert.match(generation, /visualJudgementRequired\s*=\s*true/);
  assert.doesNotMatch(generation, /GetService\s*\(\s*["']AssetService["']\s*\)/);
  assert.doesNotMatch(generation, /\b(?:CreateAssetAsync|SavePlace|PublishAs|RequestAsync|HttpGet|LoadAsset)\s*\(/);
});
