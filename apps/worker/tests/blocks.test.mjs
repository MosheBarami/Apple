// M5 5.0, the block engine: the block format and generator, parameter validation, the interpreter's order, retry and
// check reporting, the "only selected blocks run" rule, intake, plan-fill, custom code, and the plugin allowlist the
// blocks need (derived from the blocks, never hand-written).
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { loadBlocks } from '../../../scripts/gen-blocks.mjs';
import { BLOCKS } from '../src/blocks.generated.ts';
import { validateParams } from '../src/block-schema.ts';
import { runBlocks, runOrder, fill, fillSource, luauLiteral, MAX_REPAIRS } from '../src/recipe.ts';
import { intake, parseIntake, blockMenu } from '../src/intake.ts';
import { fillParams, checkFill, repairParam, MAX_FILL_RETRIES } from '../src/plan-fill.ts';
import { checkCustomCode, proveCustomCode, writeCustomCode } from '../src/custom-code.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

// ---- fixtures -------------------------------------------------------------------------------------------------
const contract = (id, extra = {}) => ({
  id, kind: 'system', summary: `the ${id} block`, provides: [], depends: [],
  params: { type: 'object', additionalProperties: false, properties: { label: { type: 'string', maxLength: 10, default: 'hi' }, n: { type: 'integer', minimum: 1, maximum: 5, default: 2 } } },
  ...extra,
});
const fixture = (id, { depends = [], provides = [], checks } = {}) => ({
  block: contract(id, { depends, provides }),
  recipe: { steps: [
    { id: 'make', op: 'create_instances', items: [{ className: 'Folder', name: `${id}_{{label}}`, parent: 'game.Workspace' }] },
    { id: 'tune', op: 'set_props', path: `game.Workspace.${id}_{{label}}`, props: { Value: '{{n}}' } },
  ] },
  checks: checks ?? [{ id: 'there', kind: 'exists', after: 'make', path: `game.Workspace.${id}_{{label}}`, param: 'label', describes: `${id} folder exists` }],
  hint: `${id} hint`, sources: {},
});
const LIB = { base: fixture('base', { provides: ['Base.add'] }), top: fixture('top', { depends: ['base'] }), lone: fixture('lone') };

/** A fake Studio: records every op; `fail(op)` returns an error string to make that op fail. */
function studio({ fail = () => null, missing = () => false, play = { serverErrors: [], clientErrors: [] } } = {}) {
  const ops = [];
  return {
    ops,
    exec: async (op) => {
      ops.push(op);
      const err = fail(op);
      if (err) return { id: 'x', ok: false, error: err };
      if (op.op === 'get_instance') return missing(op.path) ? { id: 'x', ok: false, error: 'not found' } : { id: 'x', ok: true, data: { props: {} } };
      if (op.op === 'play_check') return { id: 'x', ok: true, data: { serverErrors: play.serverErrors.map((message) => ({ message })), clientErrors: play.clientErrors.map((message) => ({ message })) } };
      return { id: 'x', ok: true, data: {} };
    },
  };
}
const writes = (ops) => ops.filter((o) => o.op !== 'get_instance' && o.op !== 'read_script' && o.op !== 'play_check');

// ---- the format and the generator ------------------------------------------------------------------------------
test('the generated block file is current and every block in packages/blocks is valid', () => {
  const r = spawnSync(process.execPath, [join(ROOT, 'scripts', 'gen-blocks.mjs'), '--check'], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  const { problems } = loadBlocks();
  assert.deepEqual(problems, []);
  assert.ok(Object.keys(BLOCKS).length >= 1);
});

test('the generator refuses a malformed block, naming each problem', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'blocks-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  cpSync(join(ROOT, 'packages', 'blocks', 'ui', 'panel'), join(dir, 'ui', 'panel'), { recursive: true });
  const at = join(dir, 'ui', 'panel');
  const block = JSON.parse(readFileSync(join(at, 'block.json'), 'utf8'));
  block.params.properties.title.format = 'email'; // a keyword the validator does not cover
  delete block.params.properties.width.default;
  block.depends = ['ghost'];
  writeFileSync(join(at, 'block.json'), JSON.stringify(block));
  const recipe = JSON.parse(readFileSync(join(at, 'recipe.json'), 'utf8'));
  recipe.steps[0].items[0].name = '{{nope}}';
  writeFileSync(join(at, 'recipe.json'), JSON.stringify(recipe));
  writeFileSync(join(at, 'checks.json'), JSON.stringify([{ id: 'c', kind: 'play_clean', after: 'create', describes: 'x' }]));
  writeFileSync(join(at, 'hint.md'), 'x'.repeat(601));
  mkdirSync(join(dir, 'widgets'));
  const { problems } = loadBlocks(dir);
  const has = (re) => assert.ok(problems.some((p) => re.test(p)), `expected a problem matching ${re}:\n${problems.join('\n')}`);
  has(/"format" is outside the supported schema keywords/);
  has(/params\.width: needs a default/);
  has(/depends on ghost/);
  has(/\{\{nope\}\} is not a parameter/);
  has(/play_clean always runs last/);
  has(/hint\.md is 601 characters/);
  has(/widgets\/: not a block kind/);
});

test('the generator refuses a dependency cycle', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'blocks-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  for (const [id, dep] of [['a', 'b'], ['b', 'a']]) {
    const at = join(dir, 'system', id);
    mkdirSync(join(at, 'proof'), { recursive: true });
    writeFileSync(join(at, 'block.json'), JSON.stringify(contract(id, { depends: [dep] })));
    writeFileSync(join(at, 'recipe.json'), JSON.stringify({ steps: [{ id: 's', op: 'set_props', path: 'game.Workspace', props: {} }] }));
    writeFileSync(join(at, 'checks.json'), JSON.stringify([{ id: 'c', kind: 'play_clean', describes: 'clean' }]));
    writeFileSync(join(at, 'hint.md'), 'h');
    writeFileSync(join(at, 'proof', 'p.luau'), '');
  }
  assert.ok(loadBlocks(dir).problems.some((p) => /dependency cycle/.test(p)));
});

// ---- parameter validation --------------------------------------------------------------------------------------
test('schema validation fills defaults and reports field-level errors', () => {
  assert.deepEqual(validateParams(contract('x'), {}), { ok: true, params: { label: 'hi', n: 2 } });
  assert.deepEqual(validateParams(contract('x'), { n: 4 }), { ok: true, params: { label: 'hi', n: 4 } });
  const bad = validateParams(contract('x'), { label: 'far too long here', n: 2.5, extra: 1 });
  assert.equal(bad.ok, false);
  assert.ok(bad.errors.includes('label: must be at most 10 characters'));
  assert.ok(bad.errors.includes('n: must be a whole number'));
  assert.ok(bad.errors.some((e) => e.startsWith('extra: x has no such parameter')));
  assert.equal(validateParams(contract('x'), { n: 9 }).errors[0], 'n: must be at most 5');
  const panel = BLOCKS.panel.block;
  assert.equal(validateParams(panel, { accent: 'red' }).ok, false, 'the panel accent must be a hex colour');
  assert.equal(validateParams(panel, { name: 'a.b' }).ok, false, 'a name cannot carry a path segment');
});

test('slots keep a value\'s type, refuse a path segment, and become Luau literals in code', () => {
  assert.deepEqual(fill({ v: [0, '{{n}}'] }, { n: 480 }), { v: [0, 480] });
  assert.equal(fill('game.Workspace.{{label}}', { label: 'Shop' }), 'game.Workspace.Shop');
  assert.throws(() => fill('game.Workspace.{{label}}', { label: 'x.Parent' }), /would change a path/);
  assert.equal(fillSource('local t = {{label}}', { label: '"); game:Destroy() --' }), 'local t = "\\"); game:Destroy() --"');
  assert.equal(luauLiteral([1, 'a', true]), '{1, "a", true}');
});

// ---- the "only selected blocks run" rule -----------------------------------------------------------------------
test('a block that was not selected never runs, and nothing runs when the selection is refused', async () => {
  for (const [selected, params, why] of [
    [['top'], {}, /top needs base, which this run did not select/],
    [['ghost'], {}, /not a block: ghost/],
    [['lone'], { base: {} }, /parameters for blocks this run did not select: base/],
  ]) {
    const s = studio();
    const r = await runBlocks({ selected, params, deps: s, blocks: LIB });
    assert.equal(r.ok, false);
    assert.match(r.refused, why);
    assert.deepEqual(s.ops, [], 'no op is sent');
  }
  const s = studio();
  const r = await runBlocks({ selected: ['lone'], params: {}, deps: s, blocks: LIB });
  assert.equal(r.ok, true);
  assert.deepEqual(r.blocks.map((b) => b.id), ['lone']);
  assert.ok(writes(s.ops).every((o) => JSON.stringify(o).includes('lone_')), 'only the selected block wrote anything');
});

test('the interpreter runs dependencies first and each recipe\'s steps in order', async () => {
  assert.deepEqual(runOrder(['top', 'base'], LIB), { ok: true, order: ['base', 'top'] });
  const s = studio();
  const r = await runBlocks({ selected: ['top', 'base'], params: { base: { label: 'b' } }, deps: s, blocks: LIB });
  assert.equal(r.ok, true);
  assert.deepEqual(writes(s.ops).map((o) => `${o.op}:${o.path ?? o.items[0].name}`), [
    'create_instances:base_b', 'set_props:game.Workspace.base_b', 'create_instances:top_hi', 'set_props:game.Workspace.top_hi',
  ]);
  assert.deepEqual(s.ops[1], { op: 'get_instance', path: 'game.Workspace.base_b' }, 'the step\'s check runs right after it');
  assert.deepEqual(writes(s.ops)[1].props, { Value: { t: 'number', v: 2 } }, 'an exact slot keeps its number type');
});

// ---- retry and failure reporting -------------------------------------------------------------------------------
test('a failing check that names a parameter re-runs the step with a repaired value, removing what it made first', async () => {
  const s = studio({ missing: (p) => p.endsWith('_bad') });
  const asked = [];
  const repair = async (id, param, problem, params) => { asked.push({ id, param, problem }); return { ...params, label: 'good' }; };
  const r = await runBlocks({ selected: ['lone'], params: { lone: { label: 'bad' } }, deps: { exec: s.exec, repair }, blocks: LIB });
  assert.equal(r.ok, true);
  assert.deepEqual(asked, [{ id: 'lone', param: 'label', problem: 'lone folder exists: game.Workspace.lone_bad is not there (not found)' }]);
  assert.deepEqual(writes(s.ops).slice(0, 3).map((o) => o.op), ['create_instances', 'delete_instances', 'create_instances']);
  assert.deepEqual(writes(s.ops)[1].paths, ['game.Workspace.lone_bad']);
  assert.equal(r.blocks[0].steps[0].attempts, 2);
  assert.equal(r.blocks[0].params.label, 'good');
});

test('retries stop after MAX_REPAIRS and the failure is reported with what the check describes and what was found', async () => {
  const s = studio({ missing: () => true });
  let repairs = 0;
  const repair = async (_id, _p, _problem, params) => { repairs += 1; return { ...params, label: `try${repairs}` }; };
  const r = await runBlocks({ selected: ['base', 'top'], params: {}, deps: { exec: s.exec, repair }, blocks: LIB });
  assert.equal(repairs, MAX_REPAIRS);
  assert.equal(r.ok, false);
  const base = r.blocks.find((b) => b.id === 'base');
  assert.equal(base.steps[0].attempts, MAX_REPAIRS + 1);
  assert.deepEqual(base.checks, [{ block: 'base', id: 'there', ok: false, describes: 'base folder exists', found: 'game.Workspace.base_try2 is not there (not found)' }]);
  assert.equal(base.steps.length, 1, 'a failed step stops its block');
  const top = r.blocks.find((b) => b.id === 'top');
  assert.equal(top.ok, false);
  assert.match(top.error, /not run: base failed/, 'a block whose dependency failed is not run');
  assert.ok(!writes(s.ops).some((o) => JSON.stringify(o).includes('top_')));
});

test('an op failure is reported as such and its checks as not run; a check without a parameter is not retried', async () => {
  const s = studio({ fail: (op) => (op.op === 'create_instances' ? 'Folder is not allowed here' : null) });
  const r = await runBlocks({ selected: ['lone'], params: {}, deps: { exec: s.exec, repair: async () => assert.fail('no repair for an op failure') }, blocks: LIB });
  assert.equal(r.blocks[0].steps[0].error, 'create_instances failed: Folder is not allowed here');
  assert.match(r.blocks[0].checks[0].found, /^not run: create_instances failed/);

  const lib = { lone: fixture('lone', { checks: [{ id: 'there', kind: 'exists', after: 'make', path: 'game.Workspace.nowhere', describes: 'it exists' }] }) };
  const s2 = studio({ missing: () => true });
  const r2 = await runBlocks({ selected: ['lone'], params: {}, deps: { exec: s2.exec, repair: async () => assert.fail('nothing to repair') }, blocks: lib });
  assert.equal(r2.blocks[0].steps[0].attempts, 1);
  assert.equal(r2.ok, false);
});

test('one play test at the end proves every block that asks for it, and its errors are reported', async () => {
  const withPlay = (id, depends = []) => fixture(id, { depends, checks: [{ id: 'clean', kind: 'play_clean', describes: `${id} plays clean` }] });
  const lib = { a: withPlay('a'), b: withPlay('b', ['a']) };
  const s = studio({ play: { serverErrors: ['ServerScriptService.X:3: attempt to index nil'], clientErrors: [] } });
  const r = await runBlocks({ selected: ['a', 'b'], params: {}, deps: s, blocks: lib });
  assert.equal(s.ops.filter((o) => o.op === 'play_check').length, 1);
  assert.equal(s.ops.at(-1).op, 'play_check', 'the play test runs after every step');
  assert.equal(r.ok, false);
  assert.deepEqual(r.checks.map((c) => [c.block, c.ok]), [['a', false], ['b', false]]);
  assert.match(r.checks[0].found, /attempt to index nil/);
});

// ---- intake and plan-fill --------------------------------------------------------------------------------------
test('intake accepts only menu ids with their dependencies, and asks the model again once with the reason', async () => {
  assert.match(blockMenu(LIB), /^base \(system\): the base block$/m);
  assert.match(blockMenu(LIB), /top \(system\): the top block Needs: base\./);
  assert.deepEqual(parseIntake('```json\n{"blocks":["lone"],"custom":false}\n```', LIB), { ok: true, intake: { blocks: ['lone'], custom: false } });
  assert.match(parseIntake('{"blocks":["shop"],"custom":false}', LIB).error, /not on the menu: shop/);
  assert.match(parseIntake('{"blocks":["top"],"custom":false}', LIB).error, /top needs base/);
  const replies = ['{"blocks":["top"],"custom":false}', '{"blocks":["top","base"],"custom":true,"question":"How many coins?"}'];
  const seen = [];
  const r = await intake('a shop', async (m) => { seen.push(m.at(-1).content); return replies.shift(); }, LIB);
  assert.deepEqual(r, { ok: true, intake: { blocks: ['top', 'base'], custom: true, question: 'How many coins?' } });
  assert.match(seen[1], /top needs base/);
  const never = await intake('x', async () => 'no json', LIB);
  assert.equal(never.ok, false);
});

test('plan-fill feeds field errors back at most twice and never fills a block that was not selected', async () => {
  assert.match(checkFill({ lone: {}, base: {} }, ['lone'], LIB).errors[0], /base: not a selected block/);
  const replies = ['{"lone":{"n":9}}', '{"lone":{"n":3,"label":"Shop"}}'];
  const feedback = [];
  const ok = await fillParams({ request: 'r', selected: ['lone'], blocks: LIB, callModel: async (m) => { feedback.push(m.at(-1).content); return replies.shift(); } });
  assert.deepEqual(ok, { ok: true, params: { lone: { label: 'Shop', n: 3 } } });
  assert.match(feedback[1], /lone\.n: must be at most 5/);
  let calls = 0;
  const bad = await fillParams({ request: 'r', selected: ['lone'], blocks: LIB, callModel: async () => { calls += 1; return '{"lone":{"n":0}}'; } });
  assert.equal(bad.ok, false);
  assert.equal(calls, 1 + MAX_FILL_RETRIES);
});

test('repairParam names the failing parameter and keeps the other values', async () => {
  let prompt = '';
  const next = await repairParam({ request: 'r', blockId: 'lone', param: 'label', problem: 'it was missing', params: { label: 'a', n: 4 }, blocks: LIB,
    callModel: async (m) => { prompt = m.at(-1).content; return '{"lone":{"label":"b"}}'; } });
  assert.deepEqual(next, { label: 'b', n: 4 });
  assert.match(prompt, /The check on "label" failed: it was missing/);
  assert.equal(await repairParam({ request: 'r', blockId: 'lone', param: 'label', problem: 'p', params: { label: 'a', n: 4 }, blocks: LIB, callModel: async () => '{"lone":{"label":"far too long a label"}}' }), null);
});

// ---- custom code -----------------------------------------------------------------------------------------------
test('custom code must call a selected block\'s API, avoid what the plugin refuses, and assert in its test', async () => {
  const good = { name: 'Bonus', source: 'local Base = require(game.ServerScriptService.Base)\nBase.add(1)', test: 'assert(true)' };
  assert.deepEqual(checkCustomCode(good, ['Base.add']), []);
  assert.match(checkCustomCode(good, []).join(), /needs a selected block that provides an API/);
  assert.match(checkCustomCode({ ...good, source: 'print(1)' }, ['Base.add']).join(), /must call one of the selected blocks' APIs: Base\.add/);
  assert.match(checkCustomCode({ ...good, source: 'Base.add(1) loadstring("x")()' }, ['Base.add']).join(), /loadstring/);
  assert.match(checkCustomCode({ ...good, test: 'print(1)' }, ['Base.add']).join(), /test must assert/);
  const replies = ['{"name":"Bonus","source":"print(1)","test":"assert(true)"}', JSON.stringify(good)];
  const r = await writeCustomCode({ request: 'r', selected: ['base'], blocks: LIB, callModel: async () => replies.shift() });
  assert.deepEqual(r, { ok: true, code: good });
});

test('custom code counts only after a clean play; its test is always removed, and failing code is removed too', async () => {
  const code = { name: 'Bonus', source: 'Base.add(1)', test: 'assert(true)' };
  const clean = studio();
  assert.deepEqual(await proveCustomCode(code, clean.exec), { ok: true });
  assert.deepEqual(clean.ops.map((o) => o.op), ['edit_script', 'edit_script', 'play_check', 'delete_instances']);
  assert.deepEqual(clean.ops.at(-1).paths, ['game.ServerScriptService.StudPilotProof_Bonus']);
  const broken = studio({ play: { serverErrors: ['StudPilotProof_Bonus:1: assertion failed!'], clientErrors: [] } });
  const r = await proveCustomCode(code, broken.exec);
  assert.equal(r.ok, false);
  assert.match(r.found, /assertion failed/);
  assert.deepEqual(broken.ops.at(-1).paths, ['game.ServerScriptService.StudPilotProof_Bonus', 'game.ServerScriptService.Bonus']);
});

// ---- the plugin allowlist the blocks need ----------------------------------------------------------------------
function allowTable(source, name) {
  const start = source.indexOf(`local ${name} = {`);
  assert.ok(start >= 0, `${name} is in Commands.luau`);
  const body = source.slice(start, source.indexOf('\n}', start));
  return new Set([...body.matchAll(/^\s*([A-Za-z0-9_]+) = true,/gm)].map((m) => m[1]));
}

test('every class and property a block writes is on the plugin\'s allowlists', () => {
  const luau = readFileSync(join(ROOT, 'apps', 'studpilot-plugin', 'src', 'Commands.luau'), 'utf8');
  const classes = allowTable(luau, 'CREATE_CLASSES');
  const scripts = allowTable(luau, 'SCRIPT_CLASSES');
  const props = allowTable(luau, 'PROPERTY_ALLOW');
  const needs = { classes: new Set(), scripts: new Set(), props: new Set() };
  const walk = (item) => {
    needs.classes.add(item.className);
    Object.keys(item.props ?? {}).forEach((p) => needs.props.add(p));
    (item.children ?? []).forEach(walk);
  };
  for (const { recipe } of Object.values(BLOCKS)) {
    for (const step of recipe.steps) {
      if (step.op === 'create_instances') step.items.forEach(walk);
      if (step.op === 'set_props') Object.keys(step.props).forEach((p) => needs.props.add(p));
      if (step.op === 'edit_script') needs.scripts.add(step.create.className);
    }
  }
  assert.ok(needs.classes.size > 0);
  assert.deepEqual([...needs.classes].filter((c) => !classes.has(c)), [], 'classes the blocks create that the plugin refuses');
  assert.deepEqual([...needs.scripts].filter((c) => !scripts.has(c)), [], 'script classes the plugin refuses');
  assert.deepEqual([...needs.props].filter((p) => !props.has(p)), [], 'properties the blocks write that the plugin refuses');
});
