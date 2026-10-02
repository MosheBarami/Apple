/**
 * The build ledger (build-ledger.ts): what earlier runs of THIS project built, as information for the next run.
 *
 * It replaces two single-slot memories that decided for the agent: `builtObject` (the last object's whole spec: any "make it
 * cooler" became an edit of that object) and `builtGame` (the last game's request: a rebuild was refused, and "THIS PLACE
 * ALREADY HAS ..." was injected into every later run). One project holds many things and whether a message continues, extends
 * or replaces one of them is the agent's call; the harness only says what stands there, labelled as possibly unrelated.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const WORKER = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = mkdtempSync(join(tmpdir(), 'ledger-'));
const entry = join(dir, 'entry.ts');
writeFileSync(entry, `export * from '${join(WORKER, 'src', 'build-ledger.ts')}';\nexport { TOOLS } from '${join(WORKER, 'src', 'tools.ts')}';\n`);
const out = join(dir, 'l.mjs');
execFileSync(join(WORKER, 'node_modules', '.bin', 'esbuild'), [entry, '--bundle', '--format=esm', '--target=es2022', '--platform=node', '--outfile=' + out, '--external:cloudflare:*', '--log-level=error'], { cwd: WORKER, stdio: 'pipe' });
const B = await import(`file://${out}`);
const src = (f) => readFileSync(join(WORKER, 'src', f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const SPEC = { name: 'Chest', parts: [{ name: 'Body', size: [4, 2, 2], at: [0, 1, 0], color: '#8e5b32' }] };

test('a build leaves an entry with the request that made it, the tool, and the paths that now stand', () => {
  const e = B.ledgerEntryFor('build_object', SPEC, { changed: true, object: 'game.Workspace.Chest' }, '  make me\n a chest  ', 100, 'abc123');
  assert.deepEqual(e, { id: 'abc123', request: 'make me a chest', tool: 'build_object', rootPaths: ['game.Workspace.Chest'], at: 100, spec: SPEC });
  const lib = B.ledgerEntryFor('insert_library_model', { id: 'x' }, { changed: true, inserted: ['game.Workspace.Lamp'] }, 'a lamp', 1, 'i1');
  assert.deepEqual(lib.rootPaths, ['game.Workspace.Lamp']);
  assert.equal(lib.spec, undefined, 'only build_object keeps a spec, for extend');
  const game = B.ledgerEntryFor('compose_game', {}, { changed: true, game: 'G', template: 'tycoon' }, 'a game', 1, 'g1');
  assert.deepEqual(game.rootPaths, ['game.Workspace.AppleMap']);
  const ui = B.ledgerEntryFor('add_upgrades', {}, { changed: true, screen: 'Hud' }, 'upgrades', 1, 'u1');
  assert.deepEqual(ui.rootPaths, ['game.StarterGui.Hud']);
  assert.equal(B.ledgerEntryFor('build_object', SPEC, { error: 'x' }, 'r', 1, 'e'), null, 'a failed build leaves nothing');
  assert.equal(B.ledgerEntryFor('get_project_tree', {}, { object: 'game.Workspace.X' }, 'r', 1, 'e'), null, 'a read leaves nothing');
  assert.equal(B.ledgerEntryFor('build_object', SPEC, { changed: true }, 'r', 1, 'e'), null, 'nothing standing to verify later');
  assert.equal(B.ledgerEntryFor('build_object', SPEC, { changed: true, object: 'game.Workspace.X' }, 'x'.repeat(500), 1, 'e').request.length, 200);
});

test('the ledger is bounded, replaces the same object built again, and only the newest few keep a spec', () => {
  let ledger = [];
  for (let i = 0; i < 40; i++) ledger = B.withEntry(ledger, B.ledgerEntryFor('build_object', { ...SPEC, name: `O${i}` }, { changed: true, object: `game.Workspace.O${i}` }, `r${i}`, i, `id${i}`));
  assert.equal(ledger.length, 24);
  assert.equal(ledger.at(-1).id, 'id39');
  assert.equal(ledger.filter((e) => e.spec).length, 3, 'only three keep a spec');
  assert.ok(ledger.at(-1).spec && !ledger[0].spec);
  const again = B.withEntry(ledger, B.ledgerEntryFor('build_object', SPEC, { changed: true, object: 'game.Workspace.O39' }, 'again', 99, 'new'));
  assert.equal(again.filter((e) => e.rootPaths[0] === 'game.Workspace.O39').length, 1, 'the same object is one entry');
  assert.equal(again.at(-1).id, 'new');
  const big = B.ledgerEntryFor('build_object', { name: 'Big', blob: 'x'.repeat(30_000), parts: [] }, { changed: true, object: 'game.Workspace.Big' }, 'r', 1, 'b');
  assert.equal(big.spec, undefined, 'a spec too big for storage is not kept');
});

test('only entries whose paths still stand in the live place are told, and the dead ones are reported', async () => {
  const ledger = [
    { id: 'a', request: 'r1', tool: 'build_object', rootPaths: ['game.Workspace.Alive'], at: 1 },
    { id: 'b', request: 'r2', tool: 'build_object', rootPaths: ['game.Workspace.Gone'], at: 2 },
    { id: 'c', request: 'r3', tool: 'compose_game', rootPaths: ['game.Workspace.Gone2', 'game.Workspace.AppleMap'], at: 3 },
  ];
  const standing = new Set(['game.Workspace.Alive', 'game.Workspace.AppleMap']);
  const { live, dead } = await B.liveEntries(ledger, async (p) => standing.has(p));
  assert.deepEqual(live.map((e) => e.id), ['a', 'c'], 'one path standing is enough');
  assert.deepEqual(dead.map((e) => e.id), ['b']);
});

test('the block is labelled information that may be unrelated; it forces and refuses nothing; empty says nothing', () => {
  assert.equal(B.ledgerBlock([]), undefined);
  const block = B.ledgerBlock([{ id: 'a1', request: 'make a "chest"\n', tool: 'build_object', rootPaths: ['game.Workspace.Chest'], at: 1, spec: SPEC }, { id: 'g1', request: 'a game', tool: 'compose_game', rootPaths: ['game.Workspace.AppleMap'], at: 2 }]);
  assert.match(block, /^Earlier in this project \(information, may be unrelated to this message;/);
  assert.match(block, /the message decides whether it continues, extends or replaces any of this, or has nothing to do with it/);
  assert.match(block, /\[a1\] build_object for "make a "chest" ": game\.Workspace\.Chest \(build_object \{ extend: "a1" \} adds to it\)/);
  assert.match(block, /\[g1\] compose_game for "a game": game\.Workspace\.AppleMap$/m, 'no extend offered for a game');
  assert.equal(/must|never|refuse|only|do not/i.test(block), false, 'no instruction in the block: ' + block);
  assert.equal(B.ledgerBlock(Array.from({ length: 30 }, (_, i) => ({ id: `i${i}`, request: 'r', tool: 'build_object', rootPaths: ['game.Workspace.X'], at: i }))).split('\n').length, 13, 'at most the newest twelve are told');
});

test('extend adds parts to an earlier spec; a part of the same name is replaced; the name stays', () => {
  const prev = { name: 'Chest', parts: [{ name: 'Body', size: [4, 2, 2] }, { name: 'Lid', size: [4, 1, 2] }], stage: { height: 2 } };
  const merged = B.extendSpec(prev, { name: 'Other', parts: [{ name: 'Lid', size: [5, 1, 2] }, { name: 'Lock', size: [1, 1, 1] }], extend: 'a1' });
  assert.equal(merged.name, 'Chest');
  assert.deepEqual(merged.parts.map((p) => p.name), ['Body', 'Lid', 'Lock']);
  assert.deepEqual(merged.parts[1].size, [5, 1, 2], 'the new Lid replaced the old');
  assert.deepEqual(merged.stage, { height: 2 }, 'what the earlier build asked for stays');
});

test('build_object { extend } builds the earlier object with the new parts in its place; an unknown id is an error, never a guess', async () => {
  const ops = [];
  const exists = new Set(['game.Workspace.Chest']);
  const ctx = {
    env: {}, studioConnected: () => true, userRequest: () => 'make it better',
    buildLedger: { find: async (id) => id === 'a1' ? { id: 'a1', tool: 'build_object', rootPaths: ['game.Workspace.Chest'], spec: SPEC } : id === 'g1' ? { id: 'g1', tool: 'compose_game', rootPaths: [] } : undefined },
    execStudioOp: async (op) => {
      ops.push(op);
      if (op.op === 'get_instance') return exists.has(op.path) ? { ok: true, data: {} } : { ok: false, error: 'no' };
      if (op.op === 'delete_instances') { for (const p of op.paths) exists.delete(p); return { ok: true, data: {} }; }
      if (op.op === 'spatial_query') return { ok: true, data: { parts: [], count: 0 } };
      return { ok: true, data: {} };
    },
  };
  const r = await B.TOOLS.build_object.run(ctx, { name: 'Ignored', extend: 'a1', parts: [{ name: 'Lock', size: [1, 1, 1], at: [0, 2.5, 1.2], color: '#ffc83d' }] });
  assert.equal(r.changed, true, JSON.stringify(r));
  assert.equal(r.object, 'game.Workspace.Chest', 'the earlier object\'s name, not the one passed');
  assert.equal(r.parts, 2, 'the old Body and the new Lock');
  assert.deepEqual(ops.filter((o) => o.op === 'delete_instances').map((o) => o.paths), [['game.Workspace.Chest']], 'only the earlier object, replaced because the agent extended it');
  assert.match((await B.TOOLS.build_object.run(ctx, { name: 'X', extend: 'nope', parts: SPEC.parts })).error, /not a build_object build in this project's ledger/);
  assert.match((await B.TOOLS.build_object.run(ctx, { name: 'X', extend: 'g1', parts: SPEC.parts })).error, /not a build_object build/);
});

test('the session keeps a ledger, not two single slots: no builtObject, no builtGame, no rebuild refusal, the ledger cleared on restore', () => {
  const s = src('do/session.ts');
  assert.equal(/builtObject|storage\.put\('builtGame'|continueGameLine|refuseRebuild|BuiltGameRecord|continuesGame|THIS PLACE ALREADY HAS|already holds its game/.test(s), false);
  assert.match(s, /const ledgerLine = mode === 'agent' \? ledgerBlock\(await this\.liveLedger\(studioConnected\)\) : undefined;/);
  assert.match(s, /find: async \(id: string\) => \(\(await this\.ctx\.storage\.get<LedgerEntry\[\]>\(LEDGER_KEY\)\) \?\? \[\]\)\.find\(\(e\) => e\.id === id\)/);
  assert.match(s, /if \(out\.mutatedProject === true\) await this\.recordBuild\(agent, call\.name, call\.arguments, out\);/);
  const restore = s.slice(s.indexOf('async restoreCheckpoint('));
  assert.ok(restore.indexOf("storage.delete(LEDGER_KEY)") > restore.indexOf("op: 'restore'"), 'the ledger goes only after the place was really put back');
  assert.ok(restore.indexOf("storage.delete('plannedGame')") > restore.indexOf("op: 'restore'"));
  const live = s.slice(s.indexOf('private async liveLedger'), s.indexOf('private async recordBuild'));
  assert.match(live, /!studioConnected\) return \[\]/, 'with Studio away nothing that may be dead is offered');
  assert.match(live, /op: 'get_instance'/, 'each entry is verified against the live place');
  const runFlow = src('run-flow.ts');
  assert.equal(/wantsNewGame|REBUILD_TOOLS|continueGameLine|refuseRebuild/.test(runFlow), false);
  const tools = src('tools.ts');
  assert.equal(/objectMemory/.test(tools) || /objectMemory/.test(src('object-tool.ts')), false);
});
