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

/**
 * A Studio stub whose `read_script` answers separately, because install_module reads before it
 * writes. `existing` of null means "no script at that path", which the plugin signals by erroring —
 * Paths.resolve throws rather than returning nil.
 *
 * THE ABSENCE MESSAGE IS COPIED FROM THE PLUGIN, not invented. It used to read
 * "<path> is not a script", which is a real error the plugin can produce but is NOT the one it
 * produces for a missing script — that comes from Paths.resolve and says "not found: <path>
 * (missing "Name" at depth N)". The difference matters now that the tool distinguishes "there is
 * nothing there" from "I could not tell", because a stub that spells absence as some other failure
 * proves the wrong branch. `readError` overrides it so the other failures can be tested too.
 */
const NOT_FOUND = (path) => `not found: ${path} (missing "Receipts" at depth 2)`;

function stubCtx({ existing = null, data = { ok: true }, readError = null } = {}) {
  const ops = [];
  return {
    ops,
    ctx: {
      env: {},
      studioConnected: () => true,
      addMemoryFact: async () => {},
      execStudioOp: async (o) => {
        ops.push(o);
        if (o.op === 'read_script') {
          if (readError !== null) return { ok: false, error: readError };
          return existing === null
            ? { ok: false, error: NOT_FOUND(o.path) }
            : { ok: true, data: { path: o.path, source: existing } };
        }
        return { ok: true, data };
      },
    },
  };
}
/** The ops that actually changed something, so a test can ignore the existence probe. */
const writes = (ops) => ops.filter((o) => o.op !== 'read_script');

test('the catalogue is real and each entry is complete', () => {
  assert.equal(P.PREFAB_IDS.length, 10);
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
  // Roblox allows ~30s in BindToClose and then closes regardless. Waiting for the saves is the
  // documented shape; a fixed sleep silently truncates whichever save was slow — the one most
  // worth keeping. An earlier version of this module did exactly that.
  assert.match(s, /outstanding/, 'the shutdown must track its outstanding saves');
  assert.doesNotMatch(s, /task\.wait\(3\)\s*\nend\)/, 'a fixed sleep is a guess, not a wait');
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

test('receipts is idempotent on PurchaseId and refuses to consume a receipt it did not grant', () => {
  const s = P.PREFABS.receipts.source;
  assert.match(s, /ProcessReceipt/);
  assert.match(s, /PurchaseId/, 'idempotency is keyed on the receipt id');
  assert.match(s, /NotProcessedYet/, 'a failed grant must NOT consume the receipt');
  assert.match(s, /GetPlayerByUserId/, 'a player who left must not have their receipt consumed');
  assert.match(s, /if live == nil then/, 'awarding into data that never loaded loses the purchase');
});

test('THE AWARD AND THE RECEIPT ID GO INTO ONE WRITE — the atomicity rule', () => {
  // Roblox's own guidance: "Purchase handling must be performed atomically." The obvious
  // implementation — mark the receipt, run the handler, mark it delivered — looks careful and is
  // not: a server that dies between the award and the second mark leaves an unfinished record, and
  // the retry awards again. Charged once, received twice, nothing errors.
  //
  // So the handler mutates a COPY, and one snapshot carries both the award and the receipt id into
  // a single write. These assertions pin that ordering, because the ordering IS the fix.
  //
  // THIS TEST USED TO ASSERT THE BUG. It required `commitData(...)` to come BEFORE
  // `replaceContents(live, working)` — "the session adopts the copy only after the write
  // succeeded" — which sounds like care and is how the award got lost. commitData yields; a copy
  // taken before the yield and written over the live table after it erases anything that happened
  // in between, and Currency.award is a writer this same library tells you to wire in. The
  // orderings below are the corrected ones, and the behavioural proof is in prefabs-behaviour.
  const s = P.PREFABS.receipts.source;

  const copied = s.indexOf('local working = deepCopy(live)');
  const handled = s.indexOf('pcall(handler, player, working, receiptInfo)');
  const adopted = s.indexOf('replaceContents(live, working)');
  const snapshot = s.indexOf('local toSave = deepCopy(live)');
  const marked = s.indexOf('toSave.receipts[purchaseId] = awardedAt');
  const committed = s.indexOf('pcall(commitData, player, toSave)');

  for (const [name, i] of Object.entries({ copied, handled, adopted, snapshot, marked, committed })) {
    assert.ok(i > 0, `${name} step is missing entirely`);
  }
  assert.ok(copied < handled, 'the handler must receive a copy, not the live table');
  assert.ok(handled < adopted, 'the copy goes back only after the handler succeeded on it');
  assert.ok(adopted < snapshot, 'THE COPY-BACK HAPPENS BEFORE THE SAVE — this is the ordering fix');
  assert.ok(snapshot < marked, 'the receipt is marked on the snapshot being written');
  assert.ok(marked < committed, 'the receipt id must be IN the table being written');

  // Nothing may be copied wholesale over the live table after the write, which is the shape of the
  // defect. The only post-write assignment is the receipt mark, on its own key.
  const afterWrite = s.slice(committed);
  assert.doesNotMatch(afterWrite, /replaceContents\(live/, 'a post-write copy-back is the bug itself');
  assert.match(afterWrite, /live\.receipts\[purchaseId\] = awardedAt/, 'the mark is written back on its own');

  // and the two-write shape this replaced must not come back
  assert.doesNotMatch(s, /delivered\s*=\s*true/, 'a second mark is the bug this design removes');
});

test('a failed commit holds the award, keeps the receipt retryable, and cannot deadlock', () => {
  const s = P.PREFABS.receipts.source;
  const failBranch = s.slice(s.indexOf('local ok, saved = pcall(commitData'), s.indexOf('live.receipts = live.receipts or {}'));
  assert.match(failBranch, /if not ok or saved ~= true then/, 'the write result AND a thrown error must be checked');
  assert.match(failBranch, /NotProcessedYet/, 'a failed write must leave the receipt retryable');
  assert.doesNotMatch(failBranch, /PurchaseGranted/, 'a failed write must never report the purchase done');

  // pcall is not decoration here. inFlight is set before the save; a DataStore error that escaped
  // would leave it set forever and lock that player out of every later purchase on the server.
  assert.match(failBranch, /inFlight\[player\] = nil/, 'the in-flight guard must be released on every exit');

  // The award stays in memory and is remembered, so the retry saves again rather than granting
  // again. Rolling it back would mean writing a pre-yield snapshot back after the yield — the very
  // operation that lost the concurrent write.
  assert.match(s, /pendingSave\[player\]\[purchaseId\] = awardedAt/, 'an unsaved award must be remembered');
  assert.match(s, /Players\.PlayerRemoving:Connect/, 'and forgotten when the player leaves');
});

test('receipts refuses to run at all until it is wired to a data module', () => {
  const s = P.PREFABS.receipts.source;
  assert.match(s, /function Receipts\.configure/);
  assert.match(s, /if getData == nil or commitData == nil then/, 'unconfigured must be a refusal');
});

test('profile_store offers the single-table write receipts needs', () => {
  // The two modules stay independent, but they have to be able to compose, and the composition is
  // exactly the atomic purchase write.
  const s = P.PREFABS.profile_store.source;
  assert.match(s, /function Profile\.commit\(player, data\)/);
  assert.match(s, /if ok then\n\t\tentry\.value = data/, 'the session adopts the table only when the write landed');
  const commit = s.slice(s.indexOf('function Profile.commit'));
  assert.match(commit.slice(0, commit.indexOf('end')), /canSave/, 'commit must honour the failed-load rule too');
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
  const w = writes(ops);
  assert.equal(w.length, 1);
  assert.equal(w[0].op, 'edit_script');
  assert.equal(w[0].path, 'game.ServerScriptService.Profile');
  assert.deepEqual(w[0].create, { className: 'ModuleScript', parent: 'game.ServerScriptService' });
  assert.equal(w[0].source, P.PREFABS.profile_store.source, 'the source must be ours, unaltered');
  assert.equal(res.installed, 'Profile');
  assert.deepEqual(res.api, P.PREFABS.profile_store.api);
});

test('a chosen parent is honoured', async () => {
  const { ctx, ops } = stubCtx();
  await T.TOOLS.install_module.run(ctx, { module: 'receipts', parent: 'game.ServerScriptService.Systems' });
  const w = writes(ops);
  assert.equal(w[0].path, 'game.ServerScriptService.Systems.Receipts');
  assert.equal(w[0].create.parent, 'game.ServerScriptService.Systems');
});

// --- installing over something that is already there -------------------------------------------

test('IT READS BEFORE IT WRITES, because edit_script REPLACES a script', async () => {
  const { ctx, ops } = stubCtx();
  await T.TOOLS.install_module.run(ctx, { module: 'profile_store' });
  assert.equal(ops[0].op, 'read_script', 'the first thing it does must be to look');
  assert.equal(ops[0].path, 'game.ServerScriptService.Profile');
});

test("A USER'S EDITED MODULE IS NOT OVERWRITTEN — it refuses and says why", async () => {
  // The dangerous case, and the likely one: this is a tool a model calls again when it is unsure,
  // which is exactly when the user has already changed what is there.
  const edited = P.PREFABS.profile_store.source.replace('local RETRIES = 4', 'local RETRIES = 9');
  const { ctx, ops } = stubCtx({ existing: edited });
  const res = await T.TOOLS.install_module.run(ctx, { module: 'profile_store' });
  assert.match(String(res.error), /already exists and differs/);
  assert.match(String(res.error), /replace: true/, 'and must say how to proceed deliberately');
  assert.equal(writes(ops).length, 0, 'NOTHING may be written');
});

test('replace: true overwrites, and reports that it did', async () => {
  const edited = P.PREFABS.profile_store.source.replace('local RETRIES = 4', 'local RETRIES = 9');
  const { ctx, ops } = stubCtx({ existing: edited });
  const res = await T.TOOLS.install_module.run(ctx, { module: 'profile_store', replace: true });
  assert.equal(res.installed, 'Profile');
  assert.equal(res.replaced, true, 'an overwrite must be reported, not silent');
  assert.equal(writes(ops).length, 1);
  assert.equal(writes(ops)[0].source, P.PREFABS.profile_store.source);
});

test('re-installing an IDENTICAL module is a boring no-op, not an error', async () => {
  // Re-asking for a module already present should not be something the model has to reason about.
  const { ctx, ops } = stubCtx({ existing: P.PREFABS.profile_store.source });
  const res = await T.TOOLS.install_module.run(ctx, { module: 'profile_store' });
  assert.equal(res.alreadyInstalled, 'Profile');
  assert.equal(res.error, undefined);
  assert.deepEqual(res.api, P.PREFABS.profile_store.api, 'and it still reports the API');
  assert.equal(writes(ops).length, 0, 'an identical module needs no write at all');
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

// --- how the modules compose ------------------------------------------------------------------

/**
 * `needs` is WIRING, not imports. Every module is one file with no dependency on the others —
 * the only shape that survives being dropped into a project the agent did not write. But Receipts
 * is handed Profile's `get` and `commit`, and Currency is handed Profile's `get`, and installing
 * one without the other leaves a module that loads, configures, and silently does nothing.
 *
 * That is the worst available failure for these: not an error, not a crash, just a save that never
 * happens or a purchase that never lands, discovered by a player rather than by the developer.
 */

test('every module named in a `needs` actually exists', () => {
  for (const id of P.PREFAB_IDS) {
    for (const need of P.PREFABS[id].needs ?? []) {
      assert.ok(
        P.PREFAB_IDS.includes(need),
        `${id} says it needs "${need}", which is not a module. Available: ${P.PREFAB_IDS.join(', ')}`,
      );
      assert.notEqual(need, id, `${id} cannot need itself`);
    }
  }
});

test('the wiring graph has no cycle, so there is always an order to install in', () => {
  // A cycle would make "install that first" advice impossible to follow.
  const seen = new Map();
  const visit = (id, trail) => {
    if (seen.get(id) === 'done') return;
    assert.equal(seen.get(id), undefined, `cycle through ${id}: ${[...trail, id].join(' -> ')}`);
    seen.set(id, 'open');
    for (const need of P.PREFABS[id].needs ?? []) visit(need, [...trail, id]);
    seen.set(id, 'done');
  };
  for (const id of P.PREFAB_IDS) visit(id, []);
});

test('a module that is handed another module\'s function declares it', () => {
  // Read from the API strings rather than from my own memory of which needs which: a configure
  // line mentioning Profile is the evidence that this module is wired to Profile.
  // A configure line that stopped naming other modules would empty this loop and the test would
  // pass having compared nothing, which is the failure mode it is meant to catch.
  let pairs = 0;
  for (const id of P.PREFAB_IDS) {
    const p = P.PREFABS[id];
    const configure = p.api.find((line) => line.includes('configure')) ?? '';
    const declared = (p.needs ?? []).map((n) => P.PREFABS[n].moduleName);
    for (const other of P.PREFAB_IDS) {
      if (other === id) continue;
      const name = P.PREFABS[other].moduleName;
      if (new RegExp(`\\b${name}\\.`).test(configure)) {
        pairs += 1;
        assert.ok(
          declared.includes(name),
          `${id}'s configure line uses ${name}.something but ${id} does not declare needing ${other}`,
        );
      }
    }
  }
  assert.ok(pairs >= 3, `expected at least 3 cross-module configure references, found ${pairs}`);
});

test('install_module reports what a module has to be wired to', async () => {
  const { ctx } = stubCtx();
  const res = await T.TOOLS.install_module.run(ctx, { module: 'receipts' });
  assert.deepEqual(res.needs, ['profile_store']);
  assert.match(res.next, /Profile/, 'and names it in words, not just as an id');
  assert.match(res.next, /install/, 'and says to install it');
});

test('a module that needs nothing says nothing about wiring', () => {
  // An empty array rendered as "needs: []" reads as a missing dependency rather than none.
  assert.equal(P.PREFABS.profile_store.needs, undefined);
  assert.equal(P.PREFABS.remote_guard.needs, undefined);
});

test('an already-installed module still reports its wiring', async () => {
  // The likeliest moment to need this is the second time somebody asks, having found it present
  // and still not working.
  const { ctx } = stubCtx({ existing: P.PREFABS.currency.source });
  const res = await T.TOOLS.install_module.run(ctx, { module: 'currency' });
  assert.equal(res.alreadyInstalled, 'Currency');
  assert.deepEqual(res.needs, ['profile_store']);
});

/**
 * A FAILED READ IS NOT AN EMPTY PATH.
 *
 * install_module reads before it writes because edit_script with a source REPLACES, and this is a
 * tool a model calls again whenever it is unsure — which is exactly when the user has already
 * edited what is there. The guard treated ANY error from that read as "nothing there, safe to
 * create", so a plugin that timed out, a Studio that disconnected mid-call, or a path that resolves
 * to a Folder all read as absence and were then written over. The protection became the overwrite.
 *
 * Only the resolver's own not-found is absence. Everything else is a failure to observe, and the
 * tool stops rather than guessing.
 */
test('A READ THAT TIMED OUT MUST NOT BE TREATED AS AN EMPTY PATH', async () => {
  const { ctx, ops } = stubCtx({ readError: 'studio did not respond within 30000ms' });
  const res = await T.TOOLS.install_module.run(ctx, { module: 'receipts' });
  assert.ok(res.error, 'it must refuse');
  assert.match(res.error, /could not check/i);
  assert.match(res.error, /did not respond/, 'and pass the real reason through');
  assert.deepEqual(writes(ops), [], 'AND MUST NOT HAVE WRITTEN ANYTHING');
});

test('a path that resolves to something that is not a script is refused, not overwritten', async () => {
  const { ctx, ops } = stubCtx({ readError: 'game.ServerScriptService.Receipts is not a script' });
  const res = await T.TOOLS.install_module.run(ctx, { module: 'receipts' });
  assert.ok(res.error, 'it must refuse');
  assert.deepEqual(writes(ops), [], 'nothing written over a Folder of the same name');
});

test('a disconnected Studio is refused even with replace: true', async () => {
  // replace: true is permission to overwrite a script the user has seen — not permission to write
  // blind into a Studio that is not answering.
  const { ctx, ops } = stubCtx({ readError: 'not connected' });
  const res = await T.TOOLS.install_module.run(ctx, { module: 'receipts', replace: true });
  assert.ok(res.error, 'it must still refuse');
  assert.deepEqual(writes(ops), [], 'nothing written');
});

test('a genuine not-found still installs, which is the whole point of telling them apart', async () => {
  const { ctx, ops } = stubCtx({ existing: null });
  const res = await T.TOOLS.install_module.run(ctx, { module: 'receipts' });
  assert.equal(res.error, undefined, JSON.stringify(res));
  assert.equal(res.installed, 'Receipts');
  assert.equal(writes(ops).length, 1, 'exactly one write');
  assert.equal(writes(ops)[0].op, 'edit_script');
});
