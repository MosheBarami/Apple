import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const WORKER = join(HERE, '..');
const dir = mkdtempSync(join(tmpdir(), 'direct-authoring-tools-'));
const bundle = join(dir, 'tools.mjs');
execFileSync(join(WORKER, 'node_modules', '.bin', 'esbuild'), [
  join(WORKER, 'src', 'tools.ts'),
  '--bundle', '--platform=node', '--format=esm', '--target=es2022', `--outfile=${bundle}`,
], { cwd: WORKER, stdio: 'pipe' });
const T = await import(pathToFileURL(bundle).href);
rmSync(dir, { recursive: true, force: true });

const DIRECT = {
  move_instances: ['move_instances', { moves: [{ path: 'game.Workspace.A', newParent: 'game.Workspace.Folder' }] }],
  transform_instances: ['transform_instances', { paths: ['game.Workspace.A'], move: [1, 2, 3], rotate: [0, 90, 0], scale: 2 }],
  clone_instances: ['clone_instances', { paths: ['game.Workspace.A'], parent: 'game.Workspace.Folder' }],
  group_instances: ['group_instances', { paths: ['game.Workspace.A', 'game.Workspace.B'], name: 'Group' }],
  ungroup_instances: ['ungroup_instances', { paths: ['game.Workspace.Group'] }],
  rename_instance: ['rename_instance', { path: 'game.Workspace.A', name: 'Renamed' }],
  set_locked: ['set_locked', { paths: ['game.Workspace.A'], locked: true }],
  set_visible: ['set_visible', { paths: ['game.Workspace.A'], visible: false }],
};

function ctx(ops) {
  return {
    studioConnected: () => true,
    execStudioOp: async (studioOp) => {
      ops.push(studioOp);
      return { id: `op-${ops.length}`, ok: true, data: { applied: true } };
    },
    createCheckpoint: async () => ({ error: 'unused' }),
    addMemoryFact: async () => 'refused',
    env: {},
  };
}

test('direct Studio authoring ops are model-visible typed tools with exact capability dependencies', async () => {
  for (const [toolName, [opName, args]] of Object.entries(DIRECT)) {
    const tool = T.TOOLS[toolName];
    assert.ok(tool, `${toolName} is not registered`);
    assert.equal(tool.def.name, toolName);
    assert.equal(tool.studio, true);
    assert.deepEqual(tool.studioOps, [opName]);
    const ops = [];
    const out = await T.runTool(ctx(ops), toolName, JSON.stringify(args));
    assert.equal(out.ok, true, `${toolName}: ${out.resultForLlm}`);
    assert.equal(out.mutatedProject, true, `${toolName} did not count as a project mutation`);
    assert.equal(ops.length, 1, `${toolName} queued ${ops.length} Studio ops`);
    assert.equal(ops[0].op, opName);
  }
});

test('direct wrappers reject over-bounds or malformed mutations before Studio sees them', async () => {
  const tooMany = Array.from({ length: 121 }, (_, i) => `game.Workspace.P${i}`);
  const cases = [
    ['transform_instances', { paths: tooMany, move: [1, 0, 0] }],
    ['transform_instances', { paths: ['game.Workspace.A'], scale: 1001 }],
    ['transform_instances', { paths: ['game.Workspace.A'], move: [1, 2] }],
    ['move_instances', { moves: [{ path: 'game.Workspace.A', newParent: 'game.Workspace' }, { path: 'game.Workspace.A', newParent: 'game.ReplicatedStorage' }] }],
    ['rename_instance', { path: 'game.Workspace.A', name: 'x'.repeat(97) }],
    ['set_locked', { paths: ['game.Workspace.A'], locked: 'yes' }],
    ['set_visible', { paths: ['game.Workspace.A'], visible: 1 }],
  ];
  for (const [name, args] of cases) {
    const ops = [];
    const out = await T.runTool(ctx(ops), name, JSON.stringify(args));
    assert.equal(out.ok, false, `${name} accepted malformed input`);
    assert.equal(ops.length, 0, `${name} queued an op before validating bounds`);
    assert.equal(out.mutatedProject, undefined);
  }
});

test('mutation truth covers script, terrain, generation and composite mutators without counting successful no-ops', () => {
  for (const name of [
    'edit_script', 'create_instances', 'set_properties', 'edit_terrain', 'delete_instances',
    'move_instances', 'transform_instances', 'clone_instances', 'group_instances', 'ungroup_instances',
    'rename_instance', 'set_locked', 'set_visible', 'set_mood', 'add_effect', 'insert_asset',
    'generate_model', 'design_sound',
  ]) {
    assert.equal(T.toolMutatesProject(name, { ok: true }), true, `${name} is missing mutation metadata`);
  }
  assert.equal(T.toolMutatesProject('format_script', { changed: true }), true);
  assert.equal(T.toolMutatesProject('format_script', { changed: false }), false);
  assert.equal(T.toolMutatesProject('install_module', { installed: 'SafeModule' }), true);
  assert.equal(T.toolMutatesProject('install_module', { alreadyInstalled: 'SafeModule' }), false);
  assert.equal(T.toolMutatesProject('remove_effect', { removed: 2 }), true);
  assert.equal(T.toolMutatesProject('remove_effect', { removed: 0 }), false);
  assert.equal(T.toolMutatesProject('assign_sounds', { assigned: 2 }), true);
  assert.equal(T.toolMutatesProject('assign_sounds', { assigned: 0, missing: ['x'] }), false);
  assert.equal(T.toolMutatesProject('render_view', { views: [] }), false);
});

test('SessionDO consumes runTool mutation truth even when a composite tool later fails', () => {
  const session = readFileSync(join(WORKER, 'src', 'do', 'session.ts'), 'utf8');
  assert.doesNotMatch(session, /\bMUTATING_TOOLS\b/);
  assert.doesNotMatch(session, /\bBUILD_TOOLS\b/);
  assert.match(session, /if \(out\.mutatedProject === true\)\s*\{?\s*agent\.mutated = true/);
  assert.doesNotMatch(session, /out\.ok\s*&&\s*out\.mutatedProject/);
  assert.match(session, /const built = agent\.mutated === true/);
});

test('failed composite tools preserve residual mutation truth without leaking the marker', async () => {
  const ops = [];
  const context = ctx(ops);
  context.execStudioOp = async (studioOp) => {
    ops.push(studioOp);
    if (studioOp.op === 'get_tree') {
      return {
        id: 'tree', ok: true, data: {
          root: {
            class: 'Lighting', name: 'Lighting', children: [
              {
                class: 'BloomEffect', name: 'OldAppleMood', path: 'game.Lighting.OldAppleMood',
                attributes: { AppleMood: { t: 'string', v: 'old' } },
              },
            ],
          },
        },
      };
    }
    if (studioOp.op === 'delete_instances') return { id: 'delete', ok: true, data: { deleted: 1 } };
    if (studioOp.op === 'set_props') return { id: 'set', ok: false, error: 'simulated write failure' };
    return { id: 'unexpected', ok: false, error: `unexpected ${studioOp.op}` };
  };

  const out = await T.runTool(context, 'set_mood', JSON.stringify({ mood: 'day' }));
  assert.equal(out.ok, false);
  assert.equal(out.mutatedProject, true, 'the successful delete before failure changed the place');
  assert.doesNotMatch(out.resultForLlm, /projectMutated/, 'internal bookkeeping leaked to the model');
});

test('run_code remains only the legacy run_luau dependency and no direct wrapper exposes it', () => {
  for (const name of Object.keys(DIRECT)) assert.notDeepEqual(T.TOOLS[name].studioOps, ['run_code']);
  assert.deepEqual(T.TOOLS.run_luau.studioOps, ['run_code']);
});
