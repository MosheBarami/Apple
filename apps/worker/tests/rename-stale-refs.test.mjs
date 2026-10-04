import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const WORKER = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = mkdtempSync(join(tmpdir(), 'rename-stale-refs-'));
const bundle = join(dir, 'tools.mjs');
execFileSync(join(WORKER, 'node_modules', '.bin', 'esbuild'), [join(WORKER, 'src', 'tools.ts'),
  '--bundle', '--platform=node', '--format=esm', '--target=es2022', `--outfile=${bundle}`], { cwd: WORKER, stdio: 'pipe' });
const T = await import(pathToFileURL(bundle).href);
rmSync(dir, { recursive: true, force: true });

function ctx(matches) {
  const ops = [];
  return { ops, studioConnected: () => true, env: {},
    execStudioOp: async (o) => { ops.push(o); return o.op === 'search_scripts' ? { ok: true, data: { matches } } : { ok: true, data: { applied: true } }; },
    createCheckpoint: async () => ({ error: 'unused' }), addMemoryFact: async () => 'refused' };
}

test('a rename lists the script lines that still name the old object (s08: Baseplate -> LavaFloor)', async () => {
  const c = ctx([
    { path: 'game.ServerScriptService.Lava', line: 3, text: 'local floor = workspace:WaitForChild("Baseplate")' },
    { path: 'game.ServerScriptService.Lava', line: 9, text: '-- the old Baseplateish comment' },
  ]);
  const r = await T.TOOLS.rename_instance.run(c, { path: 'game.Workspace.Baseplate', name: 'LavaFloor' });
  assert.deepEqual(c.ops.map((o) => o.op), ['rename_instance', 'search_scripts']);
  assert.equal(c.ops[1].query, 'Baseplate');
  assert.deepEqual(r.staleReferences, ['game.ServerScriptService.Lava:3  local floor = workspace:WaitForChild("Baseplate")']);
  assert.match(r.warning, /edit_script/);
});

test('a rename with no stale references returns the plain result', async () => {
  const r = await T.TOOLS.rename_instance.run(ctx([]), { path: 'game.Workspace.Baseplate', name: 'LavaFloor' });
  assert.equal(r.staleReferences, undefined);
  assert.equal(r.applied, true);
});
