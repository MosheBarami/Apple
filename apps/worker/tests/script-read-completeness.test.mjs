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

function context(source, ops = []) {
  return { studioConnected: () => true, env: {}, execStudioOp: async op => {
    ops.push(op); return { id: 'read-1', ok: true, data: { path: op.path, class: 'Script', source, baseHash: 'whole-file-hash', lines: source.split('\n').length } };
  }};
}
test('the agent receives the full garden-sized script including late remote handlers', async () => {
  const source = '-- garden setup\n'.repeat(400) + 'PlantRE.OnServerEvent:Connect(function() end)\nHarvestRE.OnServerEvent:Connect(function() end)';
  const out = await T.runTool(context(source), 'read_script', JSON.stringify({path:'game.ServerScriptService.GardenMain'}));
  assert.equal(out.ok,true);
  const read = JSON.parse(out.resultForLlm);
  assert.equal(read.source,source); assert.equal(read.baseHash,'whole-file-hash');
  assert.equal(read.complete,true); assert.equal(read.nextStartLine,null);
  assert.equal(out.mutatedProject,undefined);
});
test('large scripts page losslessly with whole-file hash and valid bounded JSON', async () => {
  const source = Array.from({length:1200},(_,i)=>`local item${i} = "${'x'.repeat(60)}"`).join('\n');
  let start = 1; const pages = [];
  do {
    const out = await T.runTool(context(source), 'read_script', JSON.stringify({path:'game.ServerScriptService.Big',start_line:start}));
    assert.equal(out.ok,true); assert.ok(out.resultForLlm.length<=24000);
    const read = JSON.parse(out.resultForLlm); assert.equal(read.baseHash,'whole-file-hash');
    assert.equal(read.startLine,start); pages.push(read.source);
    if (read.nextStartLine === null) break;
    assert.ok(read.nextStartLine>start); start=read.nextStartLine;
  } while (start<=1200);
  assert.equal(pages.join('\n'),source);
});
test('malformed ranges are refused before reading Studio', async () => {
  for (const args of [{start_line:0},{start_line:1.5},{max_lines:0},{max_lines:1001}]) {
    const ops=[]; const out=await T.runTool(context('local x=1',ops),'read_script',JSON.stringify({path:'game.ServerScriptService.X',...args}));
    assert.equal(out.ok,false); assert.equal(ops.length,0);
  }
});
test('a single oversized line is reported explicitly without invalid JSON or lost source', async () => {
  const out = await T.runTool(context('x'.repeat(25000)),'read_script',JSON.stringify({path:'game.ServerScriptService.Big'}));
  assert.equal(out.ok,false); assert.match(JSON.parse(out.resultForLlm).error,/line.*too large/i);
});
