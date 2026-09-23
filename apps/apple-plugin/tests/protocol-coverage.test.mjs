import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { opFamilySources } from './studio-mock.mjs';

const shared = readFileSync(new URL('../../../packages/shared/src/index.ts', import.meta.url), 'utf8');
const commands = readFileSync(new URL('../src/Commands.luau', import.meta.url), 'utf8');
const generation = readFileSync(new URL('../src/GenerationService.luau', import.meta.url), 'utf8');

// The op families (src/ops/*.luau) join HANDLERS at load, through OP_FAMILIES.install. Their
// handler names are read from each family's `handlers = { ... }` table, the same way HANDLERS is.
function familyHandlerKeys() {
  const keys = new Set();
  for (const [name, source] of Object.entries(opFamilySources())) {
    const match = /\n\t\thandlers = \{([\s\S]*?)\n\t\t\}/.exec(source);
    assert.ok(match, `${name} has no handlers table`);
    for (const entry of match[1].matchAll(/^\s*([a-z_]+)\s*=/gm)) keys.add(entry[1]);
  }
  return keys;
}

// The table may be declared in place (`local X = {`) or assigned to a local declared earlier
// (`X = {` inside the handler region's `do` block, which keeps Commands.luau under Luau's
// 200-local limit when Studio compiles it at -O0). What matters is that it is a LOCAL — an
// assignment with no local in scope would silently create a global — and what its keys are.
function tableKeys(name) {
  const match = new RegExp(`(local )?(?<![.\\w])${name} = \\{([\\s\\S]*?)\\n\\}`).exec(commands);
  assert.ok(match, `${name} table was not found`);
  if (!match[1]) {
    const declared = new RegExp(`^local [^=\\n]*\\b${name}\\b[^=\\n]*$`, 'm').test(commands.slice(0, match.index));
    assert.ok(declared, `${name} is assigned without a local declared before it — that would be a global`);
  }
  return new Set([...match[2].matchAll(/^\s*([a-z_]+)\s*=/gm)].map((entry) => entry[1]));
}

test('every live StudioOp has a handler, named refusal, deferred path, restore preflight, or waypoint path', () => {
  const union = /export type StudioOp =([\s\S]*?);\n\n\/\*\*/m.exec(shared);
  assert.ok(union, 'StudioOp union was not found');
  const liveOps = new Set([...union[1].matchAll(/op:\s*'([a-z_]+)'/g)].map((entry) => entry[1]));
  const handlers = tableKeys('HANDLERS');
  const refused = tableKeys('UNSUPPORTED');
  const deferred = tableKeys('DEFERRED_MUTATING');
  const accounted = new Set([...handlers, ...familyHandlerKeys(), ...refused, ...deferred, 'restore', 'undo_waypoint']);

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
  for (const op of ['run_code']) {
    assert.match(commands, new RegExp(`\\b${op}\\s*=\\s*"[^"]{24,}"`));
  }
  assert.match(commands, /no constrained plugin evaluator/);
  assert.match(commands, /no substitute was created/);
});

test('insert_asset is supported, and its code refusal is what makes that safe', () => {
  // insert_asset stopped being a refusal on 2026-09-19 — the review is in
  // worker-capability-contract.test.mjs. What replaced the refusal is asserted here, because a
  // supported insert with no code guard is strictly worse than the refusal was.
  assert.match(commands, /insert_asset\s*=\s*handleInsertAsset/, 'insert_asset must be dispatched, not refused');
  assert.doesNotMatch(commands, /insert_asset\s*=\s*"/, 'insert_asset must not also carry a refusal string');

  const body = commands.slice(commands.indexOf('local function handleInsertAsset'));
  const guard = body.slice(0, body.indexOf('\nlocal function '));
  assert.ok(guard.length > 400, 'handleInsertAsset was not found — this test would check nothing');
  assert.match(guard, /IsA\("LuaSourceContainer"\)/, 'the insert path must scan the loaded tree for code');
  assert.match(guard, /Apple inserts geometry, not code/, 'the refusal must say what it refused');

  // ORDER MATTERS MORE THAN PRESENCE. A scan that runs after the instances are already in the
  // place has not prevented anything.
  const scanAt = guard.indexOf('IsA("LuaSourceContainer")');
  const parentAt = guard.indexOf('child.Parent = parent');
  assert.ok(scanAt > 0 && parentAt > 0 && scanAt < parentAt,
    'the code scan must run BEFORE anything is parented into the place');
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
