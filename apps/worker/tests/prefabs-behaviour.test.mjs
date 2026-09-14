/**
 * RUN THE LUAU. Not read it — RUN it.
 *
 * Every other test over these modules asserts on their source, which is defensible (the source is
 * the artefact the product installs) and is still weaker than it looks: `assert.match(s, /pcall/)`
 * proves a string is present, not that a refused spend leaves the balance alone.
 *
 * `luau` is a standalone interpreter and is on PATH, so the pure logic can actually be executed.
 * The modules touch Roblox globals only inside functions, so a small prelude stubbing `warn` and a
 * fake player is enough to drive Currency's real arithmetic — the part where a mistake costs a
 * player money or hands them an item they did not pay for.
 *
 * What this CANNOT cover, stated rather than implied: anything that talks to DataStoreService,
 * MarketplaceService or the instance tree. Profile, Receipts and RemoteGuard are exercised by the
 * source-level guards in prefabs.test.mjs and by nothing here. This file proves one module behaves;
 * it does not prove the other three do.
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
const out = join(mkdtempSync(join(tmpdir(), 'pfb-')), 'pfb.mjs');
execFileSync(join(WORKER, 'node_modules', '.bin', 'esbuild'),
  [join(WORKER, 'src', 'prefabs.ts'), '--bundle', '--format=esm', '--target=es2022', '--outfile=' + out],
  { cwd: WORKER, stdio: 'pipe' });
const P = await import(`file://${out}`);

const TMP = mkdtempSync(join(tmpdir(), 'pfb-luau-'));
/**
 * The toolchain is REQUIRED, not optional.
 *
 * The first draft of this file probed with `luau --version`, which is not a flag — the probe threw,
 * every test skipped, and `node --test` reported "tests 6, pass 0, fail 0" and exited 0. A suite
 * that proves nothing and says nothing is worse than no suite, because it occupies the space where
 * somebody would otherwise notice the gap. So absence of the toolchain fails here rather than
 * skipping, and the check runs once, loudly.
 */
function requireLuau() {
  try {
    execFileSync('luau', ['--help'], { stdio: 'pipe' });
  } catch (e) {
    throw new Error('luau is not on PATH — these tests EXECUTE the shipped Luau and cannot be skipped into a pass');
  }
}
requireLuau();

/**
 * Wrap a module's source as an IIFE, prepend stubs for the Roblox globals it touches, append the
 * assertions, and run the whole thing under `luau`. A failed assert exits non-zero and the message
 * comes back as the test failure.
 */
function runLuau(moduleId, body, tag) {
  const prelude = [
    'local warnings = {}',
    'warn = function(...)',
    '\tlocal parts = {}',
    '\tfor i = 1, select("#", ...) do parts[i] = tostring(select(i, ...)) end',
    '\ttable.insert(warnings, table.concat(parts, " "))',
    'end',
    '-- a player with no leaderstats: the mirror is absent, which must not break the arithmetic',
    'local player = { FindFirstChild = function(self, name) return nil end }',
  ].join('\n');

  const source = [
    prelude,
    `local M = (function()\n${P.PREFABS[moduleId].source}\nend)()`,
    body,
    'print("PREFAB-OK")',
  ].join('\n\n');

  const file = join(TMP, `${tag}.luau`);
  writeFileSync(file, source);
  try {
    const stdout = execFileSync('luau', [file], { encoding: 'utf8', stdio: 'pipe' });
    return { ok: stdout.includes('PREFAB-OK'), output: stdout };
  } catch (e) {
    return { ok: false, output: `${e.stdout ?? ''}${e.stderr ?? ''}` };
  }
}

const SETUP = [
  'local data = { coins = 100 }',
  'M.configure({ get = function(p) return data end, name = "Coins", field = "coins" })',
].join('\n');

test('the harness itself runs, so a green result below is not vacuous', () => {
  const r = runLuau('currency', [SETUP, 'assert(M.balance(player) == 100, "balance")'].join('\n'), 'sanity');
  assert.ok(r.ok, r.output);
  // and a deliberately false assertion must actually fail, or this file proves nothing
  const bad = runLuau('currency', [SETUP, 'assert(M.balance(player) == 999, "intentional")'].join('\n'), 'sanity-neg');
  assert.equal(bad.ok, false, 'a failing assert did not fail the run');
  assert.match(bad.output, /intentional/);
});

test('award adds, and returns the new balance', () => {
  const r = runLuau('currency', [
    SETUP,
    'assert(M.award(player, 50) == 150, "award should return the new balance")',
    'assert(data.coins == 150, "the SAVE is what changed")',
  ].join('\n'), 'award');
  assert.ok(r.ok, r.output);
});

test('A REFUSED SPEND CHANGES NOTHING — the rule that stops a negative balance', () => {
  const r = runLuau('currency', [
    SETUP,
    'assert(M.spend(player, 200) == false, "200 out of 100 must be refused")',
    'assert(data.coins == 100, "a refused spend must not have moved the balance")',
    'assert(M.spend(player, 100) == true, "spending exactly the balance is allowed")',
    'assert(data.coins == 0, "and lands on zero")',
    'assert(M.spend(player, 1) == false, "and cannot go below it")',
    'assert(data.coins == 0, "still zero")',
  ].join('\n'), 'spend');
  assert.ok(r.ok, r.output);
});

test('fractional and negative amounts are refused by both award and spend', () => {
  // A negative award is a spend with no balance check; a fractional one desyncs the IntValue mirror.
  const r = runLuau('currency', [
    SETUP,
    'assert(M.award(player, -5) == nil, "a negative award is a disguised spend")',
    'assert(M.award(player, 1.5) == nil, "a fractional award desyncs an IntValue")',
    'assert(M.spend(player, -5) == false, "a negative spend is a disguised award")',
    'assert(data.coins == 100, "none of those may have moved the balance")',
    'assert(#warnings >= 3, "each refusal should say why, got " .. tostring(#warnings))',
  ].join('\n'), 'validation');
  assert.ok(r.ok, r.output);
});

test('a player whose data never loaded gets nil, not zero', () => {
  // Zero is a balance. nil is "we could not read it". Returning 0 here would show an account with
  // money as empty, and any spend check against it would refuse everything the player owns.
  const r = runLuau('currency', [
    'M.configure({ get = function(p) return nil end, name = "Coins", field = "coins" })',
    'assert(M.balance(player) == nil, "an unreadable balance must be nil, never 0")',
    'assert(M.award(player, 10) == nil, "and must not be awarded into")',
    'assert(M.spend(player, 1) == false, "and must not be spent from")',
    'assert(M.attach(player) == false, "and must not get a leaderstats of 0")',
  ].join('\n'), 'noload');
  assert.ok(r.ok, r.output);
});

test('the balance comes from the save even when the mirror disagrees', () => {
  // The whole design: leaderstats is replicated display state anything on the server can write.
  // A module that read it back would inherit every other system's mistakes.
  const r = runLuau('currency', [
    'local data = { coins = 42 }',
    'local fakeValue = { Value = 999999 }',
    'local stats = { FindFirstChild = function(self, n) return fakeValue end }',
    'local richLookingPlayer = { FindFirstChild = function(self, n) return stats end }',
    'M.configure({ get = function(p) return data end, name = "Coins", field = "coins" })',
    'assert(M.balance(richLookingPlayer) == 42, "the save is the truth, not the mirror")',
    'assert(M.spend(richLookingPlayer, 100) == false, "a tampered mirror must not fund a purchase")',
    'assert(data.coins == 42, "and must not have moved the real balance")',
    '-- an award syncs the mirror down to the truth rather than trusting it',
    'M.award(richLookingPlayer, 8)',
    'assert(fakeValue.Value == 50, "the mirror follows the save, got " .. tostring(fakeValue.Value))',
  ].join('\n'), 'mirror');
  assert.ok(r.ok, r.output);
});

/**
 * RemoteGuard's harness.
 *
 * Its rate limit is a token bucket refilled by elapsed time, so testing it means CONTROLLING time
 * rather than sleeping through it — a test that waits a real second to prove a refill is a test
 * nobody runs twice. `os.clock` is replaced before the module loads, so the module's own calls
 * resolve to the stub.
 *
 * The module also connects to Players.PlayerRemoving at load, so `game` has to exist for it to
 * construct at all.
 */
function runGuard(body, tag) {
  const prelude = [
    'local warnings = {}',
    'warn = function(...)',
    '\tlocal parts = {}',
    '\tfor i = 1, select("#", ...) do parts[i] = tostring(select(i, ...)) end',
    '\ttable.insert(warnings, table.concat(parts, " "))',
    'end',
    '',
    '-- Controlled time. The module reads the global `os` at call time, so replacing it here wins.',
    'local nowValue = 0',
    'local realOs = os',
    'os = { clock = function() return nowValue end, time = realOs.time, date = realOs.date }',
    'local function advance(seconds) nowValue = nowValue + seconds end',
    '',
    '-- Just enough of the instance tree for the module to load and for one remote to exist.',
    'local removingHandler = nil',
    'game = {',
    '\tGetService = function(self, name)',
    '\t\treturn { PlayerRemoving = { Connect = function(_, fn) removingHandler = fn end } }',
    '\tend,',
    '}',
    '',
    'local function fakeRemote(name)',
    '\tlocal fired = nil',
    '\treturn {',
    '\t\tName = name,',
    '\t\tOnServerEvent = { Connect = function(_, fn) fired = fn end },',
    '\t\tfire = function(...) return fired(...) end,',
    '\t}',
    'end',
    'local player = { Name = "tester" }',
  ].join('\n');

  const source = [
    prelude,
    `local M = (function()\n${P.PREFABS.remote_guard.source}\nend)()`,
    body,
    'print("PREFAB-OK")',
  ].join('\n\n');

  const file = join(TMP, `${tag}.luau`);
  writeFileSync(file, source);
  try {
    const stdout = execFileSync('luau', [file], { encoding: 'utf8', stdio: 'pipe' });
    return { ok: stdout.includes('PREFAB-OK'), output: stdout };
  } catch (e) {
    return { ok: false, output: `${e.stdout ?? ''}${e.stderr ?? ''}` };
  }
}

test('the guard harness runs, and a false assertion in it still fails', () => {
  const good = runGuard('assert(type(M.on) == "function", "M.on")', 'guard-sanity');
  assert.ok(good.ok, good.output);
  const bad = runGuard('assert(false, "intentional-guard")', 'guard-sanity-neg');
  assert.equal(bad.ok, false, 'a failing assert did not fail the guard run');
  assert.match(bad.output, /intentional-guard/);
});

test('calls within the rate are all delivered', () => {
  const r = runGuard([
    'local calls = 0',
    'local remote = fakeRemote("Buy")',
    'M.on(remote, { perSecond = 5 }, function(p) calls = calls + 1 end)',
    'for i = 1, 5 do remote.fire(player) end',
    'assert(calls == 5, "expected 5 delivered, got " .. tostring(calls))',
  ].join('\n'), 'guard-under');
  assert.ok(r.ok, r.output);
});

test('A BURST PAST THE LIMIT IS DROPPED, not queued', () => {
  // The whole point. A client-side debounce is deleted by the exploiter; this is the limit that
  // survives, and it must drop silently rather than throw or buffer.
  const r = runGuard([
    'local calls = 0',
    'local remote = fakeRemote("Buy")',
    'M.on(remote, { perSecond = 5 }, function(p) calls = calls + 1 end)',
    'for i = 1, 50 do remote.fire(player) end',
    'assert(calls == 5, "a 50-call burst should deliver 5, delivered " .. tostring(calls))',
  ].join('\n'), 'guard-burst');
  assert.ok(r.ok, r.output);
});

test('tokens refill with elapsed time, and never bank past capacity', () => {
  // The second half is the subtle one: a player idle for an hour must not be able to spend an
  // hour of tokens at once, which would make the limit meaningless for exactly the pattern that
  // matters — a quiet client that suddenly floods.
  const r = runGuard([
    'local calls = 0',
    'local remote = fakeRemote("Buy")',
    'M.on(remote, { perSecond = 5 }, function(p) calls = calls + 1 end)',
    'for i = 1, 50 do remote.fire(player) end',
    'assert(calls == 5, "burst drained the bucket")',
    'advance(1)',
    'for i = 1, 50 do remote.fire(player) end',
    'assert(calls == 10, "one second should restore 5, got " .. tostring(calls - 5))',
    'advance(3600)',
    'for i = 1, 50 do remote.fire(player) end',
    'assert(calls == 15, "an idle hour must not bank more than capacity, got " .. tostring(calls - 10))',
  ].join('\n'), 'guard-refill');
  assert.ok(r.ok, r.output);
});

test('a validate that returns false blocks the handler entirely', () => {
  const r = runGuard([
    'local calls = 0',
    'local remote = fakeRemote("Buy")',
    'M.on(remote, { perSecond = 100, validate = function(p, amount) return amount == 1 end },',
    '\tfunction(p, amount) calls = calls + 1 end)',
    'remote.fire(player, 1)',
    'assert(calls == 1, "a valid call must pass")',
    'remote.fire(player, 9999)',
    'assert(calls == 1, "an invalid argument must not reach the handler")',
    'remote.fire(player, nil)',
    'assert(calls == 1, "nil must not reach the handler either")',
  ].join('\n'), 'guard-validate');
  assert.ok(r.ok, r.output);
});

test('a validate that ERRORS is a refusal, not an opening', () => {
  // A validator that throws must fail closed. Failing open would make a crash in the check the
  // easiest way through it.
  const r = runGuard([
    'local calls = 0',
    'local remote = fakeRemote("Buy")',
    'M.on(remote, { perSecond = 100, validate = function() error("boom") end },',
    '\tfunction(p) calls = calls + 1 end)',
    'remote.fire(player)',
    'assert(calls == 0, "a throwing validator must refuse, not admit")',
  ].join('\n'), 'guard-validate-error');
  assert.ok(r.ok, r.output);
});

test('a handler that errors does not kill the connection for everyone after it', () => {
  const r = runGuard([
    'local calls = 0',
    'local remote = fakeRemote("Buy")',
    'M.on(remote, { perSecond = 100 }, function(p)',
    '\tcalls = calls + 1',
    '\tif calls == 1 then error("first call explodes") end',
    'end)',
    'remote.fire(player)',
    'remote.fire(player)',
    'assert(calls == 2, "the second call must still arrive, got " .. tostring(calls))',
    'assert(#warnings >= 1, "the error should have been reported")',
  ].join('\n'), 'guard-handler-error');
  assert.ok(r.ok, r.output);
});

test('each player gets their own bucket', () => {
  // One noisy client must not spend another player's allowance.
  const r = runGuard([
    'local calls = 0',
    'local other = { Name = "other" }',
    'local remote = fakeRemote("Buy")',
    'M.on(remote, { perSecond = 3 }, function(p) calls = calls + 1 end)',
    'for i = 1, 20 do remote.fire(player) end',
    'assert(calls == 3, "first player drained their own bucket")',
    'for i = 1, 20 do remote.fire(other) end',
    'assert(calls == 6, "the second player must have a full bucket, got " .. tostring(calls - 3))',
  ].join('\n'), 'guard-per-player');
  assert.ok(r.ok, r.output);
});

/**
 * Profile's harness — a fake DataStore whose failures are scriptable.
 *
 * This is the module where being wrong costs a player their account, and until now every one of its
 * four rules was asserted by matching a word in the source. `assert.match(s, /canSave/)` proves a
 * flag is mentioned. It does not prove that a session whose load errored writes nothing.
 *
 * The stub implements UpdateAsync with real read-modify-write semantics — the transform receives
 * the stored value and its return is stored — so the session-lock logic is exercised as written
 * rather than described. `store.failNext` makes a transient service failure a thing the test can
 * schedule, which is the only way to reach the branch that matters most.
 *
 * ONE DELIBERATE INFIDELITY, stated because it bounds what these prove: `task.spawn` runs
 * synchronously here. That is fine for everything below, and it means this file does NOT test
 * BindToClose's parallel-save behaviour — only that release() itself is correct.
 */
function runProfile(body, tag) {
  const prelude = [
    'local warnings = {}',
    'warn = function(...)',
    '\tlocal parts = {}',
    '\tfor i = 1, select("#", ...) do parts[i] = tostring(select(i, ...)) end',
    '\ttable.insert(warnings, table.concat(parts, " "))',
    'end',
    '',
    'local nowValue = 1000000',
    'local realOs = os',
    'os = { time = function() return nowValue end, clock = function() return nowValue end }',
    'local function advance(seconds) nowValue = nowValue + seconds end',
    '',
    'task = { wait = function() end, spawn = function(f, ...) f(...) end }',
    '',
    '-- A DataStore with real read-modify-write semantics and schedulable failures.',
    'local store = { data = {}, writes = 0, failNext = 0 }',
    'function store:UpdateAsync(key, transform)',
    '\tif self.failNext > 0 then',
    '\t\tself.failNext = self.failNext - 1',
    '\t\terror("DataStore unavailable")',
    '\tend',
    '\tself.writes = self.writes + 1',
    '\tlocal updated = transform(self.data[key])',
    '\tif updated ~= nil then',
    '\t\tself.data[key] = updated',
    '\tend',
    '\treturn updated',
    'end',
    '',
    'local removingHandler, closeHandler = nil, nil',
    'game = {',
    '\tJobId = "server-A",',
    '\tGetService = function(self, name)',
    '\t\tif name == "DataStoreService" then',
    '\t\t\treturn { GetDataStore = function() return store end }',
    '\t\tend',
    '\t\tif name == "Players" then',
    '\t\t\treturn {',
    '\t\t\t\tPlayerRemoving = { Connect = function(_, fn) removingHandler = fn end },',
    '\t\t\t\tGetPlayers = function() return {} end,',
    '\t\t\t}',
    '\t\tend',
    '\t\treturn { IsStudio = function() return false end }',
    '\tend,',
    '\tBindToClose = function(self, fn) closeHandler = fn end,',
    '}',
    '',
    'local player = { UserId = 7, Name = "tester" }',
  ].join('\n');

  const source = [
    prelude,
    `local M = (function()\n${P.PREFABS.profile_store.source}\nend)()`,
    body,
    'print("PREFAB-OK")',
  ].join('\n\n');

  const file = join(TMP, `${tag}.luau`);
  writeFileSync(file, source);
  try {
    const stdout = execFileSync('luau', [file], { encoding: 'utf8', stdio: 'pipe' });
    return { ok: stdout.includes('PREFAB-OK'), output: stdout };
  } catch (e) {
    return { ok: false, output: `${e.stdout ?? ''}${e.stderr ?? ''}` };
  }
}

test('the profile harness runs, and a false assertion in it still fails', () => {
  const good = runProfile('assert(type(M.load) == "function", "M.load")', 'prof-sanity');
  assert.ok(good.ok, good.output);
  const bad = runProfile('assert(false, "intentional-profile")', 'prof-sanity-neg');
  assert.equal(bad.ok, false, 'a failing assert did not fail the profile run');
  assert.match(bad.output, /intentional-profile/);
});

test('a first load returns the defaults and takes the lock', () => {
  const r = runProfile([
    'local data = M.load(player)',
    'assert(data ~= nil, "a fresh profile must load")',
    'assert(data.coins == 0 and data.level == 1, "defaults")',
    'assert(store.data["u_7"].lock ~= nil, "the lock must be taken")',
    'assert(store.data["u_7"].lock.serverId == "server-A", "by this server")',
  ].join('\n'), 'prof-first');
  assert.ok(r.ok, r.output);
});

test('ANOTHER SERVER HOLDING A FRESH LOCK IS REFUSED — this is the duplication guard', () => {
  const r = runProfile([
    'store.data["u_7"] = { value = { coins = 500 }, lock = { serverId = "server-B", at = os.time() } }',
    'local data = M.load(player)',
    'assert(data == nil, "a live lock elsewhere must refuse the load")',
    'assert(M.get(player) == nil, "and there must be no session data")',
    'assert(store.data["u_7"].lock.serverId == "server-B", "the other lock must be intact")',
    'assert(store.data["u_7"].value.coins == 500, "and their balance untouched")',
  ].join('\n'), 'prof-locked');
  assert.ok(r.ok, r.output);
});

test('a STALE lock is taken over, so a crashed server does not lock a player out forever', () => {
  const r = runProfile([
    'store.data["u_7"] = { value = { coins = 500 }, lock = { serverId = "server-B", at = os.time() } }',
    'assert(M.load(player) == nil, "fresh lock refuses")',
    'advance(1000)',
    'local data = M.load(player)',
    'assert(data ~= nil, "a stale lock must be taken over")',
    'assert(data.coins == 500, "and the real balance loaded, not the defaults")',
    'assert(store.data["u_7"].lock.serverId == "server-A", "we now hold it")',
  ].join('\n'), 'prof-stale');
  assert.ok(r.ok, r.output);
});

test('A FAILED LOAD WRITES NOTHING ON RELEASE — the rule that saves accounts', () => {
  // The single highest-stakes branch in these modules. A session that could not READ must never
  // WRITE, because the write it would make is a fresh default over a real account, and on the
  // server it is indistinguishable from a successful save.
  const r = runProfile([
    'store.data["u_7"] = { value = { coins = 500 }, lock = nil }',
    'store.failNext = 99',
    'local data = M.load(player)',
    'assert(data == nil, "the load must fail")',
    'store.failNext = 0',
    'local writesBefore = store.writes',
    'assert(M.release(player) == false, "a failed-load session must refuse to save")',
    'assert(store.writes == writesBefore, "and must not have written AT ALL")',
    'assert(store.data["u_7"].value.coins == 500, "the real account is untouched")',
  ].join('\n'), 'prof-failed-load');
  assert.ok(r.ok, r.output);
});

test('a good session saves and releases the lock', () => {
  const r = runProfile([
    'local data = M.load(player)',
    'data.coins = 250',
    'assert(M.release(player) == true, "release should succeed")',
    'assert(store.data["u_7"].value.coins == 250, "the balance persisted")',
    'assert(store.data["u_7"].lock == nil, "the lock must be released")',
    'assert(M.get(player) == nil, "and the session forgotten")',
  ].join('\n'), 'prof-release');
  assert.ok(r.ok, r.output);
});

test('release is safe to call twice', () => {
  const r = runProfile([
    'M.load(player)',
    'assert(M.release(player) == true)',
    'local writes = store.writes',
    'assert(M.release(player) == false, "a second release has nothing to save")',
    'assert(store.writes == writes, "and must not write again")',
  ].join('\n'), 'prof-double-release');
  assert.ok(r.ok, r.output);
});

test('a transient failure is retried rather than lost', () => {
  const r = runProfile([
    'store.failNext = 2',
    'local data = M.load(player)',
    'assert(data ~= nil, "two transient failures must be ridden out, not surfaced")',
  ].join('\n'), 'prof-retry');
  assert.ok(r.ok, r.output);
});

test('commit persists one table, keeps the lock, and honours the failed-load rule', () => {
  // This is the call Receipts depends on for its atomic purchase write.
  const r = runProfile([
    'local data = M.load(player)',
    'local working = { coins = 999, receipts = { ["abc"] = os.time() } }',
    'assert(M.commit(player, working) == true, "commit should succeed")',
    'assert(store.data["u_7"].value.coins == 999, "the table was written")',
    'assert(store.data["u_7"].value.receipts["abc"] ~= nil, "including the receipt, in the SAME write")',
    'assert(store.data["u_7"].lock ~= nil, "commit must NOT drop the session lock")',
    'assert(M.get(player).coins == 999, "and the session adopted it")',
  ].join('\n'), 'prof-commit');
  assert.ok(r.ok, r.output);
});

test('commit refuses for a session that could not load', () => {
  const r = runProfile([
    'store.failNext = 99',
    'assert(M.load(player) == nil)',
    'store.failNext = 0',
    'local writes = store.writes',
    'assert(M.commit(player, { coins = 1 }) == false, "no data means no write")',
    'assert(store.writes == writes, "nothing may be written")',
  ].join('\n'), 'prof-commit-refuse');
  assert.ok(r.ok, r.output);
});

test('a failed commit does not let the session adopt the unsaved table', () => {
  const r = runProfile([
    'local data = M.load(player)',
    'data.coins = 10',
    'store.failNext = 99',
    'assert(M.commit(player, { coins = 777 }) == false, "the write failed")',
    'store.failNext = 0',
    'assert(M.get(player).coins == 10, "the session must still hold the old table, got " .. tostring(M.get(player).coins))',
  ].join('\n'), 'prof-commit-fail');
  assert.ok(r.ok, r.output);
});

/**
 * Receipts' harness — the money one.
 *
 * ProcessReceipt is assigned to MarketplaceService at module load, so the stub hands it back and
 * the tests call it exactly as Roblox would. `Enum.ProductPurchaseDecision` is two sentinel values;
 * what matters is which one comes back, because PurchaseGranted is irreversible — it tells Roblox
 * to stop retrying, and a wrong one either charges a player for nothing or grants them a second
 * copy of what they bought.
 *
 * The getter and the committer are injected by design, so both the "data never loaded" and the
 * "write failed" branches are reachable without a DataStore at all.
 */
function runReceipts(body, tag) {
  const prelude = [
    'local warnings = {}',
    'warn = function(...)',
    '\tlocal parts = {}',
    '\tfor i = 1, select("#", ...) do parts[i] = tostring(select(i, ...)) end',
    '\ttable.insert(warnings, table.concat(parts, " "))',
    'end',
    '',
    'local nowValue = 1000',
    'os = { time = function() return nowValue end, clock = function() return nowValue end }',
    '',
    'Enum = { ProductPurchaseDecision = { PurchaseGranted = "GRANTED", NotProcessedYet = "RETRY" } }',
    '',
    'local player = { UserId = 7, Name = "buyer" }',
    'local presentPlayer = player',
    'local marketplace = {}',
    'game = {',
    '\tGetService = function(self, name)',
    '\t\tif name == "MarketplaceService" then return marketplace end',
    '\t\treturn { GetPlayerByUserId = function(_, id) return presentPlayer end }',
    '\tend,',
    '}',
    '',
    'local function receipt(purchaseId, productId)',
    '\treturn { PlayerId = 7, ProductId = productId or 111, PurchaseId = purchaseId or "p-1" }',
    'end',
  ].join('\n');

  const source = [
    prelude,
    `local M = (function()\n${P.PREFABS.receipts.source}\nend)()`,
    'local process = marketplace.ProcessReceipt',
    'assert(type(process) == "function", "the module must install ProcessReceipt at load")',
    body,
    'print("PREFAB-OK")',
  ].join('\n\n');

  const file = join(TMP, `${tag}.luau`);
  writeFileSync(file, source);
  try {
    const stdout = execFileSync('luau', [file], { encoding: 'utf8', stdio: 'pipe' });
    return { ok: stdout.includes('PREFAB-OK'), output: stdout };
  } catch (e) {
    return { ok: false, output: `${e.stdout ?? ''}${e.stderr ?? ''}` };
  }
}

/** A configured module with a live profile and a committer whose success the test controls. */
const WIRED = [
  'local data = { coins = 0 }',
  'local committed = nil',
  'local commitOk = true',
  'local commitCalls = 0',
  'M.configure({',
  '\tget = function(p) return data end,',
  '\tcommit = function(p, table_) commitCalls = commitCalls + 1; committed = table_; return commitOk end,',
  '})',
  'local grants = 0',
  'M.product(111, function(p, working, info) grants = grants + 1; working.coins = working.coins + 100; return true end)',
].join('\n');

test('the receipts harness runs, and a false assertion in it still fails', () => {
  const good = runReceipts('assert(type(M.product) == "function", "M.product")', 'rec-sanity');
  assert.ok(good.ok, good.output);
  const bad = runReceipts('assert(false, "intentional-receipt")', 'rec-sanity-neg');
  assert.equal(bad.ok, false, 'a failing assert did not fail the receipts run');
  assert.match(bad.output, /intentional-receipt/);
});

test('an unconfigured module never consumes a receipt', () => {
  const r = runReceipts([
    'assert(process(receipt()) == "RETRY", "unconfigured must ask for a retry, not consume")',
  ].join('\n'), 'rec-unconfigured');
  assert.ok(r.ok, r.output);
});

test('THE AWARD AND THE RECEIPT ID REACH THE COMMITTER IN ONE TABLE', () => {
  // The atomicity rule, observed rather than asserted about the source.
  const r = runReceipts([
    WIRED,
    'assert(process(receipt("p-1")) == "GRANTED", "a good purchase is granted")',
    'assert(commitCalls == 1, "exactly one write")',
    'assert(committed.coins == 100, "the award is in the written table")',
    'assert(committed.receipts["p-1"] ~= nil, "AND the receipt id is in the SAME table")',
    'assert(data.coins == 100, "the session adopted it")',
  ].join('\n'), 'rec-atomic');
  assert.ok(r.ok, r.output);
});

test('A REPEATED RECEIPT GRANTS ONCE — Roblox may call this more than once', () => {
  const r = runReceipts([
    WIRED,
    'assert(process(receipt("p-1")) == "GRANTED")',
    'assert(process(receipt("p-1")) == "GRANTED", "a repeat must still consume the receipt")',
    'assert(grants == 1, "but the handler must run once, ran " .. tostring(grants))',
    'assert(data.coins == 100, "and the player must be awarded once, has " .. tostring(data.coins))',
    'assert(commitCalls == 1, "and nothing written the second time")',
  ].join('\n'), 'rec-idempotent');
  assert.ok(r.ok, r.output);
});

test('a DIFFERENT receipt for the same product does grant again', () => {
  // Idempotency must be keyed on the purchase, not the product — otherwise nobody can buy twice.
  const r = runReceipts([
    WIRED,
    'assert(process(receipt("p-1")) == "GRANTED")',
    'assert(process(receipt("p-2")) == "GRANTED")',
    'assert(grants == 2, "two purchases, two grants")',
    'assert(data.coins == 200)',
  ].join('\n'), 'rec-distinct');
  assert.ok(r.ok, r.output);
});

test('A FAILED WRITE CHANGES NOTHING AND DOES NOT CONSUME THE RECEIPT', () => {
  // The player keeps their Robux until the grant actually lands.
  const r = runReceipts([
    WIRED,
    'commitOk = false',
    'assert(process(receipt("p-1")) == "RETRY", "a failed write must not report the purchase done")',
    'assert(data.coins == 0, "the live session must be untouched, has " .. tostring(data.coins))',
    'assert(data.receipts == nil, "and must not carry a receipt for an ungranted purchase")',
    'commitOk = true',
    'assert(process(receipt("p-1")) == "GRANTED", "the retry must then succeed")',
    'assert(data.coins == 100, "and award exactly once")',
    'assert(grants == 2, "the handler ran twice, which is fine — only the WRITE is authoritative")',
  ].join('\n'), 'rec-failed-write');
  assert.ok(r.ok, r.output);
});

test('a handler that declines or errors does not consume the receipt', () => {
  const r = runReceipts([
    'local data = { coins = 0 }',
    'M.configure({ get = function() return data end, commit = function() return true end })',
    'M.product(111, function() return false end)',
    'M.product(222, function() error("handler exploded") end)',
    'assert(process(receipt("p-1", 111)) == "RETRY", "a declining handler must not consume")',
    'assert(process(receipt("p-2", 222)) == "RETRY", "a throwing handler must not consume")',
    'assert(data.coins == 0, "and neither may award")',
  ].join('\n'), 'rec-decline');
  assert.ok(r.ok, r.output);
});

test('a player who has left, and data that never loaded, both retry rather than consume', () => {
  const r = runReceipts([
    'local data = { coins = 0 }',
    'M.configure({ get = function() return data end, commit = function() return true end })',
    'M.product(111, function(p, w) w.coins = 1 return true end)',
    'presentPlayer = nil',
    'assert(process(receipt("p-1")) == "RETRY", "an absent player must not have their receipt consumed")',
    'presentPlayer = player',
    'M.configure({ get = function() return nil end, commit = function() return true end })',
    'assert(process(receipt("p-1")) == "RETRY", "unloaded data must not be awarded into")',
  ].join('\n'), 'rec-absent');
  assert.ok(r.ok, r.output);
});

test('an unknown product retries rather than silently consuming a real purchase', () => {
  const r = runReceipts([
    WIRED,
    'assert(process(receipt("p-1", 999)) == "RETRY", "a product with no handler must not be consumed")',
    'assert(#warnings >= 1, "and should say so")',
  ].join('\n'), 'rec-unknown-product');
  assert.ok(r.ok, r.output);
});
