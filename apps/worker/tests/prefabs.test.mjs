/**
 * THREE MODULES THAT GO INTO A STRANGER'S PLACE AND HANDLE THEIR PLAYERS' DATA AND MONEY.
 *
 * roadmap.ts now tells the model what correct looks like for saving, for remote validation and for
 * receipts. A brief is an instruction, and an instruction is re-followed from scratch on every
 * project with a fresh chance to drop one clause — and the clause that gets dropped is always the
 * one whose absence is silent. These are the same rules as code.
 *
 * Asserting on this source is not the "assert a comment exists" anti-pattern, for the same reason
 * the roadmap-brief tests are not: this text is not documentation ABOUT the product, it is the
 * artefact the product installs into a customer's game. `SetAsync` appearing in it would be a
 * defect shipped to every user of the tool, not a stale doc.
 *
 * The strongest guards here are the NEGATIVE ones. It is easy to check that UpdateAsync is present;
 * what actually matters is that SetAsync is absent, because a later edit that "simplifies" the
 * write is exactly how this regresses, and the resulting bug is invisible until two servers hold
 * one player.
 *
 * Run with:  node --test           (from apps/worker)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const WORKER = join(dirname(fileURLToPath(import.meta.url)), '..');
const bundle = (src, tag) => {
  const out = join(mkdtempSync(join(tmpdir(), `${tag}-`)), `${tag}.mjs`);
  execFileSync(join(WORKER, 'node_modules', '.bin', 'esbuild'),
    [join(WORKER, 'src', src), '--bundle', '--format=esm', '--target=es2022', '--outfile=' + out],
    { cwd: WORKER, stdio: 'pipe' });
  return out;
};
const P = await import(`file://${bundle('prefabs.ts', 'pf')}`);
const T = await import(`file://${bundle('tools.ts', 'tools')}`);

const TMP = mkdtempSync(join(tmpdir(), 'pf-luau-'));
const haveLuau = () => { try { execFileSync('luau-analyze', ['--help'], { stdio: 'pipe' }); return true; } catch { return false; } };
function syntaxErrors(source, tag) {
  const file = join(TMP, `${tag}.luau`);
  writeFileSync(file, source);
  let out = '';
  try { out = execFileSync('luau-analyze', [file], { encoding: 'utf8', stdio: 'pipe' }); }
  catch (e) { out = `${e.stdout ?? ''}${e.stderr ?? ''}`; }
  return out.split('\n').filter((l) => l.includes('SyntaxError'));
}

function stubCtx(data = { ok: true }) {
  const ops = [];
  return { ops, ctx: { env: {}, studioConnected: () => true,
    execStudioOp: async (o) => { ops.push(o); return { ok: true, data }; }, addMemoryFact: async () => {} } };
}

test('the catalogue is real and each entry is complete', () => {
  assert.equal(P.PREFAB_IDS.length, 3);
  for (const id of P.PREFAB_IDS) {
    const p = P.PREFABS[id];
    assert.equal(p.id, id);
    assert.ok(p.moduleName && p.summary && p.defaultParent && p.source, `${id} is incomplete`);
    assert.ok(p.prevents.length >= 2, `${id} does not say what it prevents`);
    assert.ok(p.api.length >= 1, `${id} documents no API`);
    assert.ok(p.source.length > 500, `${id} is too small to be the real thing`);
  }
});

test('EVERY module compiles', { skip: haveLuau() ? false : 'luau-analyze not on PATH' }, () => {
  for (const id of P.PREFAB_IDS) {
    assert.deepEqual(syntaxErrors(P.PREFABS[id].source, id), [], `${id} does not parse`);
  }
});

test('the module returns the table its name and API promise', () => {
  // require(path) must give back something whose shape matches the documented api strings.
  for (const id of P.PREFAB_IDS) {
    const p = P.PREFABS[id];
    assert.match(p.source, new RegExp(`\\breturn ${p.moduleName}\\s*$`, 'm'),
      `${id} does not return ${p.moduleName}`);
    for (const line of p.api) {
      assert.ok(line.startsWith(p.moduleName + '.'), `${id} api line does not belong to ${p.moduleName}: ${line}`);
      const fn = line.slice(p.moduleName.length + 1).split(/[(\s]/)[0];
      assert.match(p.source, new RegExp(`function ${p.moduleName}\\.${fn}\\b`),
        `${id} documents ${fn} and does not define it`);
    }
  }
});

// --- the negative guards, which are the ones that matter ---------------------------------

test('NO module ever writes with SetAsync', () => {
  // The whole point of profile_store. A later "simplification" of the write is how this regresses,
  // and the bug is invisible until two servers hold one player.
  for (const id of P.PREFAB_IDS) {
    assert.doesNotMatch(P.PREFABS[id].source, /:SetAsync\b/, `${id} uses SetAsync`);
  }
});

test('profile_store keeps all four of its rules', () => {
  const s = P.PREFABS.profile_store.source;
  assert.match(s, /:UpdateAsync\(/, 'the atomic write');
  assert.match(s, /BindToClose/, 'a shutdown must still persist');
  assert.match(s, /lock/, 'the session lock');
  assert.match(s, /pcall/, 'transient failure must be caught');
  // the rule that saves accounts: a failed load disables saving for that session
  assert.match(s, /canSave/, 'the failed-load flag');
  assert.match(s, /if entry == nil or not entry\.canSave then/, 'release must refuse when the load failed');
});

test('remote_guard rate-limits on the server and never trusts a client debounce', () => {
  const s = P.PREFABS.remote_guard.source;
  assert.match(s, /OnServerEvent/, 'it must live on the server side of the remote');
  assert.match(s, /tokens/, 'a token bucket, not a timer');
  assert.doesNotMatch(s, /OnClientEvent/, 'a guard on the client guards nothing');
  assert.match(s, /validate/, 'arguments must be checkable');
});

test('receipts grants after the write, and is idempotent on PurchaseId', () => {
  const s = P.PREFABS.receipts.source;
  assert.match(s, /ProcessReceipt/);
  assert.match(s, /PurchaseId/, 'idempotency is keyed on the receipt id');
  assert.match(s, /NotProcessedYet/, 'a failed grant must NOT consume the receipt');
  // PurchaseGranted must never be the first thing returned after calling the handler
  const granted = s.indexOf('Enum.ProductPurchaseDecision.PurchaseGranted');
  assert.ok(granted > 0);
  assert.match(s, /if not ok or delivered ~= true then/, 'a failed grant must be detected');
});

test('no module reaches for an asset, so none of them can fail the asset gate', () => {
  for (const id of P.PREFAB_IDS) {
    const s = P.PREFABS[id].source;
    assert.doesNotMatch(s, /rbxassetid:\/\//i, `${id} names a marketplace asset`);
    assert.doesNotMatch(s, /GetObjects|InsertService/, `${id} loads content at runtime`);
    assert.equal(T.refuseLuauIngress(s), null, `${id} would be refused by the ingress filter`);
  }
});

// --- the tool ------------------------------------------------------------------------------

test('install_module writes the module at its recommended parent', async () => {
  const { ctx, ops } = stubCtx();
  const res = await T.TOOLS.install_module.run(ctx, { module: 'profile_store' });
  assert.equal(ops.length, 1);
  assert.equal(ops[0].op, 'edit_script');
  assert.equal(ops[0].path, 'game.ServerScriptService.Profile');
  assert.deepEqual(ops[0].create, { className: 'ModuleScript', parent: 'game.ServerScriptService' });
  assert.equal(ops[0].source, P.PREFABS.profile_store.source, 'the source must be ours, unaltered');
  assert.equal(res.installed, 'Profile');
  assert.deepEqual(res.api, P.PREFABS.profile_store.api);
});

test('a chosen parent is honoured', async () => {
  const { ctx, ops } = stubCtx();
  await T.TOOLS.install_module.run(ctx, { module: 'receipts', parent: 'game.ServerScriptService.Systems' });
  assert.equal(ops[0].path, 'game.ServerScriptService.Systems.Receipts');
  assert.equal(ops[0].create.parent, 'game.ServerScriptService.Systems');
});

test('an unknown module and a hostile parent are both refused with nothing sent', async () => {
  for (const args of [
    { module: 'nope' },
    { module: 'profile_store', parent: 'game.Workspace"]..x' },
    { module: 'profile_store', parent: 'game Workspace' },
    { module: 'profile_store', parent: 'game/Workspace' },
  ]) {
    const { ctx, ops } = stubCtx();
    const res = await T.TOOLS.install_module.run(ctx, args);
    assert.ok(res.error, `not refused: ${JSON.stringify(args)}`);
    assert.equal(ops.length, 0, `reached Studio: ${JSON.stringify(args)}`);
  }
});

test('install_module is offered with Studio and withheld without it', () => {
  assert.ok(T.toolDefs(true, undefined).map((d) => d.name).includes('install_module'));
  assert.equal(T.toolDefs(false, undefined).map((d) => d.name).includes('install_module'), false);
});

test('the description carries the whole catalogue, so no extra round trip is needed', () => {
  const def = T.toolDefs(true, undefined).find((d) => d.name === 'install_module');
  for (const id of P.PREFAB_IDS) assert.ok(def.description.includes(id), `${id} missing from the description`);
});
