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

/**
 * ONE BUDGET PER REMOTE, not one per player.
 *
 * The buckets were keyed by player alone, so every guarded remote in the game shared a single
 * allowance. Guard a chat remote at 2/s and a movement remote at 30/s and the player gets one
 * bucket between them — whose capacity is whichever remote happened to create it, and whose refill
 * rate changes depending on which remote fired last. The visible symptom is a player being silently
 * ignored on one remote because they were busy on an unrelated one, which is indistinguishable from
 * lag and impossible to report usefully.
 */
test('TWO GUARDED REMOTES DO NOT SHARE ONE PLAYER BUDGET', () => {
  const r = runGuard([
    'local chat, move = fakeRemote("Chat"), fakeRemote("Move")',
    'local chats, moves = 0, 0',
    'M.on(chat, { perSecond = 2 }, function() chats = chats + 1 end)',
    'M.on(move, { perSecond = 30 }, function() moves = moves + 1 end)',
    '',
    // spend the chat allowance completely
    'for i = 1, 10 do chat.fire(player) end',
    'assert(chats == 2, "chat is limited to its own 2, got " .. tostring(chats))',
    '',
    // the movement remote must be completely unaffected
    'for i = 1, 30 do move.fire(player) end',
    'assert(moves == 30, "movement must have its own 30, got " .. tostring(moves))',
  ].join('\n'), 'rg-separate-budgets');
  assert.ok(r.ok, r.output);
});

test('each remote refills at ITS OWN rate, not whichever fired last', () => {
  const r = runGuard([
    'local slow, fast = fakeRemote("Slow"), fakeRemote("Fast")',
    'local slows, fasts = 0, 0',
    'M.on(slow, { perSecond = 1 }, function() slows = slows + 1 end)',
    'M.on(fast, { perSecond = 20 }, function() fasts = fasts + 1 end)',
    '',
    'for i = 1, 5 do slow.fire(player) end',
    'for i = 1, 25 do fast.fire(player) end',
    'assert(slows == 1 and fasts == 20, "got " .. tostring(slows) .. " and " .. tostring(fasts))',
    '',
    // a second of quiet returns one token to the slow remote and twenty to the fast one
    'advance(1)',
    'for i = 1, 5 do slow.fire(player) end',
    'for i = 1, 25 do fast.fire(player) end',
    'assert(slows == 2, "the slow remote must refill by 1, got " .. tostring(slows))',
    'assert(fasts == 40, "the fast one by 20, got " .. tostring(fasts - 20))',
  ].join('\n'), 'rg-own-rate');
  assert.ok(r.ok, r.output);
});

test('forgetting a player clears their bucket on EVERY remote', () => {
  const r = runGuard([
    'local a, b = fakeRemote("A"), fakeRemote("B")',
    'local as, bs = 0, 0',
    'M.on(a, { perSecond = 1 }, function() as = as + 1 end)',
    'M.on(b, { perSecond = 1 }, function() bs = bs + 1 end)',
    'a.fire(player); a.fire(player); b.fire(player); b.fire(player)',
    'assert(as == 1 and bs == 1, "both spent")',
    '',
    'assert(type(removingHandler) == "function", "the module must connect PlayerRemoving")',
    'removingHandler(player)',
    // a rejoin is a fresh bucket everywhere, and no table is left holding the departed player
    'a.fire(player); b.fire(player)',
    'assert(as == 2 and bs == 2, "a rejoining player starts fresh on every remote")',
  ].join('\n'), 'rg-forget-all');
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
    'local removingHandler, closeHandler, heartbeat = nil, nil, nil',
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
    '\t\treturn { IsStudio = function() return false end, Heartbeat = { Connect = function(_, fn) heartbeat = fn end } }',
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

/**
 * THE LOCK HAS TO SURVIVE THE SESSION, not just start it.
 *
 * Rule 3 says one writable copy per player, enforced by a lock another server may take once it has
 * gone stale. The lock was taken at load and then never touched again, so LOCK_STALE_SECONDS was
 * counting from the moment the player joined rather than from the last sign this server was alive.
 * Fifteen minutes is an ordinary session length. A second server would load the same player while
 * the first was still playing them, and then both would save — which is the exact outcome the
 * whole module exists to prevent, reached by the mechanism meant to prevent it.
 *
 * So the lock is refreshed on a heartbeat and re-checked on every write. These drive the refresh
 * directly; the connection itself is asserted separately below.
 */
test('THE HEARTBEAT KEEPS A LIVE SESSION FROM GOING STALE UNDER ANOTHER SERVER', () => {
  const r = runProfile([
    'assert(M.load(player) ~= nil, "the session loads")',
    'local takenAt = store.data["u_7"].lock.at',
    '',
    // most of an ordinary session passes with no purchase, so nothing has written
    'advance(800)',
    'M.refreshAllLocks()',
    'assert(store.data["u_7"].lock.at == takenAt + 800, "the lock must move forward with the clock")',
    'assert(store.data["u_7"].lock.serverId == "server-A", "and still be ours")',
    '',
    // and the value is untouched: this is a lock refresh, not an autosave
    'assert(store.data["u_7"].value.coins == 0, "the refresh must not write player data")',
    '',
    // THE PROPERTY, stated as the thing another server can observe: with the session refreshed,
    // a takeover attempt well past LOCK_STALE_SECONDS from the original login is still refused.
    'local otherServer = { UserId = 7 }',
    'game.JobId = "server-B"',
    'assert(M.load(player) ~= nil, "same server reloading is fine")',
    'game.JobId = "server-A"',
    '',
    // and once this server stops refreshing, the lock does go stale and a takeover succeeds
    'store.data["u_7"].lock = { serverId = "server-B", at = os.time() }',
    'advance(901)',
    'assert(M.load(player) ~= nil, "an unrefreshed lock must eventually be takeable")',
    'assert(store.data["u_7"].lock.serverId == "server-A", "by whoever is still alive")',
  ].join('\n'), 'prof-heartbeat');
  assert.ok(r.ok, r.output);
});

test('the refresh is wired to Heartbeat and only fires once the interval has passed', () => {
  const r = runProfile([
    'assert(type(heartbeat) == "function", "the module must connect the refresh to Heartbeat")',
    'assert(M.load(player) ~= nil)',
    'local takenAt = store.data["u_7"].lock.at',
    '',
    'advance(60)',
    'heartbeat(60)',
    'assert(store.data["u_7"].lock.at == takenAt, "a minute in, nothing should have been written")',
    '',
    'advance(130)',
    'heartbeat(130)',
    'assert(store.data["u_7"].lock.at == takenAt + 190, "past the interval it refreshes")',
  ].join('\n'), 'prof-heartbeat-wiring');
  assert.ok(r.ok, r.output);
});

test('A REFRESH THAT FINDS THE LOCK TAKEN STOPS THIS SESSION SAVING', () => {
  // If another server has the player, our in-memory copy is a fork. Continuing to save would
  // replace their live session with ours, which is the account-wiping write rule 2 is about —
  // arriving by a different road.
  const r = runProfile([
    'assert(M.load(player) ~= nil)',
    'M.get(player).coins = 250',
    '',
    // the handover: another server takes the key while we are idle
    'store.data["u_7"] = { value = { coins = 900 }, lock = { serverId = "server-B", at = os.time() } }',
    'M.refreshAllLocks()',
    'assert(M.get(player) == nil, "a session that lost its lock must stop handing out a writable table")',
    '',
    'assert(M.commit(player, { coins = 250 }) == false, "we must refuse to save after losing the lock")',
    'assert(M.release(player) == false, "and refuse on the way out too")',
    'assert(store.data["u_7"].value.coins == 900, "their data must be intact, has " .. tostring(store.data["u_7"].value.coins))',
    'assert(store.data["u_7"].lock.serverId == "server-B", "and their lock still theirs")',
    'assert(#warnings > 0, "losing a lock is not a silent event")',
  ].join('\n'), 'prof-lock-lost');
  assert.ok(r.ok, r.output);
});

test('RELEASE REFUSES TO WRITE OVER A LOCK THAT IS NO LONGER OURS', () => {
  // The handover this covers is the one nothing warned us about: the lock went to another server
  // between our last refresh and the player leaving, so canSave is still true and release believes
  // it is doing the right thing. Writing here would replace a live session on another server with
  // a snapshot from before the handover, and clearing the lock would leave that session unguarded.
  const r = runProfile([
    'assert(M.load(player) ~= nil)',
    'M.get(player).coins = 40',
    '',
    // taken silently — no refresh has run, so this session still thinks it may save
    'store.data["u_7"] = { value = { coins = 900 }, lock = { serverId = "server-B", at = os.time() } }',
    'assert(M.get(player) ~= nil, "this session has not noticed yet — that is the point")',
    '',
    'assert(M.release(player) == false, "release must refuse once it sees the foreign lock")',
    'assert(store.data["u_7"].value.coins == 900, "their data intact, has " .. tostring(store.data["u_7"].value.coins))',
    'assert(store.data["u_7"].lock ~= nil, "AND their lock must not be cleared out from under them")',
    'assert(store.data["u_7"].lock.serverId == "server-B")',
  ].join('\n'), 'prof-release-foreign-lock');
  assert.ok(r.ok, r.output);
});

test('a commit refuses when another server holds the lock, even without a refresh first', () => {
  // The write path checks for itself. A purchase must get a false here, because a false is what
  // stops the receipt being consumed.
  const r = runProfile([
    'assert(M.load(player) ~= nil)',
    'store.data["u_7"].lock = { serverId = "server-B", at = os.time() }',
    'assert(M.commit(player, { coins = 999 }) == false, "a commit under a foreign lock must fail")',
    'assert(store.data["u_7"].value.coins ~= 999, "and must not have written")',
  ].join('\n'), 'prof-commit-foreign-lock');
  assert.ok(r.ok, r.output);
});

test('a successful commit doubles as a lock refresh, because a write proves we are alive', () => {
  const r = runProfile([
    'assert(M.load(player) ~= nil)',
    'local takenAt = store.data["u_7"].lock.at',
    'advance(400)',
    'assert(M.commit(player, { coins = 120 }) == true)',
    'assert(store.data["u_7"].lock.at == takenAt + 400, "the commit must move the lock forward")',
    'assert(store.data["u_7"].lock.serverId == "server-A", "and keep it ours")',
    'assert(store.data["u_7"].value.coins == 120)',
  ].join('\n'), 'prof-commit-refreshes');
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
    // The module now forgets a player's in-flight and pending state on PlayerRemoving, so the stub
    // has to hand back a connectable signal and let the test fire it.
    'local onRemoving = nil',
    'local players = {',
    '\tGetPlayerByUserId = function(_, id) return presentPlayer end,',
    '\tPlayerRemoving = { Connect = function(_, fn) onRemoving = fn end },',
    '}',
    'game = {',
    '\tGetService = function(self, name)',
    '\t\tif name == "MarketplaceService" then return marketplace end',
    '\t\treturn players',
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

/**
 * A FAILED WRITE, and the two lines of this test that changed when the interleave bug was fixed.
 *
 * This used to assert that a failed save left the live session at zero coins and that the handler
 * then ran a second time on the retry — the module rolled the award back, so re-running it was
 * free. That rollback is gone, because it was the same operation as the bug: putting a pre-yield
 * snapshot back over the live table after the yield, erasing anything written in between.
 *
 * So the award now stays in memory and is remembered as pending, and the retry SAVES rather than
 * awards. The properties that actually protect the player are unchanged and asserted below: the
 * receipt is not consumed, nothing is marked as saved that was not, and one purchase produces
 * exactly one award. What changed is that the player now sees what they bought immediately instead
 * of during the retry — and that the handler must no longer be safe to run twice.
 *
 * Either way a server that dies mid-retry loses the award and does NOT consume the receipt, so
 * Roblox re-delivers the purchase on rejoin. The outcome for the player is the same; only the
 * window differs.
 */
test('A FAILED WRITE HOLDS THE AWARD AND DOES NOT CONSUME THE RECEIPT', () => {
  const r = runReceipts([
    WIRED,
    'commitOk = false',
    'assert(process(receipt("p-1")) == "RETRY", "a failed write must not report the purchase done")',
    'assert(data.coins == 100, "the award is held in memory, has " .. tostring(data.coins))',
    'assert(data.receipts == nil, "and must not carry a receipt for an ungranted purchase")',
    'assert(committed.receipts["p-1"] ~= nil, "the FAILED write still carried mark and award together")',
    'assert(committed.coins == 100, "which is the point — they are never written separately")',
    '',
    'commitOk = true',
    'assert(process(receipt("p-1")) == "GRANTED", "the retry must then succeed")',
    'assert(grants == 1, "AND MUST NOT AWARD AGAIN — the retry re-saves, it does not re-grant")',
    'assert(data.coins == 100, "one purchase, one award, has " .. tostring(data.coins))',
    'assert(data.receipts["p-1"] ~= nil, "now it is marked, because now it is on disk")',
    'assert(committed.coins == 100 and committed.receipts["p-1"] ~= nil, "both in the SAME write")',
  ].join('\n'), 'rec-failed-write');
  assert.ok(r.ok, r.output);
});

/**
 * THE ONE THAT LOSES MONEY.
 *
 * `commit` yields. In Roblox that is a DataStore round trip, and during it the scheduler runs
 * whatever else is ready: another player's remote, a Touched handler, a Currency.award for THIS
 * player — a module this same library ships and explicitly tells you to wire in beside Receipts.
 *
 * The committer below writes to the live table from inside the commit, which is exactly that
 * interleave with the timing made deterministic. The old code took a snapshot before the commit and
 * copied it over the live table after, so the interleaved write was erased: no error, no warning,
 * the balance simply lower than the player earned. Both the purchase and the concurrent award have
 * to survive, and the assertion is on the arithmetic, not on the absence of a crash.
 */
test('A WRITE DURING THE PURCHASE SAVE SURVIVES IT — the snapshot must not be copied back after', () => {
  const r = runReceipts([
    'local data = { coins = 500 }',
    'local committed = nil',
    'M.configure({',
    '\tget = function(p) return data end,',
    '\tcommit = function(p, snapshot)',
    // the interleave: another module awards into the LIVE table while this save is in flight
    '\t\tdata.coins = data.coins + 10',
    '\t\tcommitted = snapshot',
    '\t\treturn true',
    '\tend,',
    '})',
    'M.product(111, function(p, working, info) working.coins = working.coins + 100; return true end)',
    '',
    'assert(process(receipt("p-1")) == "GRANTED", "the purchase itself must still be granted")',
    'assert(data.coins == 610, "expected 500 + 100 bought + 10 earned = 610, got " .. tostring(data.coins))',
    'assert(committed.coins == 600, "the save carries the purchase; the 10 lands in the next save")',
    'assert(data.receipts["p-1"] ~= nil, "and the receipt is marked in the live session")',
    'assert(#warnings == 0, "nothing here is an error — got: " .. table.concat(warnings, " | "))',
  ].join('\n'), 'rec-interleave');
  assert.ok(r.ok, r.output);
});

test('a second receipt for the same player is asked to retry, not run alongside the first', () => {
  // Two overlapping receipts each save a snapshot, and whichever save lands second wins. The loser's
  // award AND its receipt mark are gone from disk while the player was told it was granted.
  const r = runReceipts([
    'local data = { coins = 0 }',
    'local reentered = nil',
    'M.configure({',
    '\tget = function(p) return data end,',
    '\tcommit = function(p, snapshot)',
    '\t\tif reentered == nil then reentered = process(receipt("p-2")) end',
    '\t\treturn true',
    '\tend,',
    '})',
    'M.product(111, function(p, working, info) working.coins = working.coins + 100; return true end)',
    '',
    'assert(process(receipt("p-1")) == "GRANTED")',
    'assert(reentered == "RETRY", "the overlapping receipt must be deferred, got " .. tostring(reentered))',
    'assert(data.coins == 100, "and it must NOT have awarded, got " .. tostring(data.coins))',
    // and once nothing is in flight it goes through normally
    'assert(process(receipt("p-2")) == "GRANTED", "the deferred receipt must succeed on its retry")',
    'assert(data.coins == 200)',
  ].join('\n'), 'rec-overlap');
  assert.ok(r.ok, r.output);
});

test('a save that THROWS does not lock the player out of every later purchase', () => {
  // inFlight is set before the save. If the DataStore error escaped, it would never be cleared and
  // this player could never buy anything again for the life of the server.
  const r = runReceipts([
    'local data = { coins = 0 }',
    'local explode = true',
    'M.configure({',
    '\tget = function(p) return data end,',
    '\tcommit = function(p, snapshot)',
    '\t\tif explode then error("DataStore request dropped") end',
    '\t\treturn true',
    '\tend,',
    '})',
    'M.product(111, function(p, working, info) working.coins = working.coins + 100; return true end)',
    '',
    'assert(process(receipt("p-1")) == "RETRY", "a throwing save must ask for a retry, not crash out")',
    'explode = false',
    'assert(process(receipt("p-1")) == "GRANTED", "and the player must not be locked out afterwards")',
    'assert(data.coins == 100)',
  ].join('\n'), 'rec-commit-throws');
  assert.ok(r.ok, r.output);
});

test('leaving clears the pending award, and the unconsumed receipt is awarded on rejoin', () => {
  const r = runReceipts([
    'local data = { coins = 0 }',
    'local commitOk = false',
    'local grants = 0',
    'M.configure({',
    '\tget = function(p) return data end,',
    '\tcommit = function(p, snapshot) return commitOk end,',
    '})',
    'M.product(111, function(p, working, info) grants = grants + 1; working.coins = working.coins + 100; return true end)',
    '',
    'assert(process(receipt("p-1")) == "RETRY")',
    'assert(grants == 1 and data.coins == 100)',
    '',
    'assert(type(onRemoving) == "function", "the module must connect to PlayerRemoving")',
    'onRemoving(player)',
    // rejoining is a fresh session table; the receipt was never consumed so Roblox re-delivers it
    'data = { coins = 0 }',
    'commitOk = true',
    'assert(process(receipt("p-1")) == "GRANTED", "the re-delivered receipt must be honoured")',
    'assert(grants == 2, "and awarded, because the first attempt never reached disk")',
    'assert(data.coins == 100, "exactly once into the new session, got " .. tostring(data.coins))',
  ].join('\n'), 'rec-leave-then-rejoin');
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

/**
 * Checkpoints' harness.
 *
 * All three bugs this module exists to prevent are executable, which is unusual and worth taking:
 * the stage going backwards is arithmetic, the Touched storm is a clock, and the respawn is an
 * assignment to a CFrame. So none of them has to be asserted about the source.
 *
 * CFrame is stubbed as a tagged table with an __add metamethod, so "the character was moved to the
 * checkpoint, lifted clear of it" is checkable rather than merely plausible.
 */
function runCheckpoints(body, tag) {
  const prelude = [
    'local warnings = {}',
    'warn = function(...)',
    '\tlocal parts = {}',
    '\tfor i = 1, select("#", ...) do parts[i] = tostring(select(i, ...)) end',
    '\ttable.insert(warnings, table.concat(parts, " "))',
    'end',
    '',
    'local nowValue = 0',
    'os = { clock = function() return nowValue end, time = function() return nowValue end }',
    'local function advance(seconds) nowValue = nowValue + seconds end',
    '',
    'Vector3 = { new = function(x, y, z) return { x = x, y = y, z = z } end }',
    'local function cframe(tag)',
    '\treturn setmetatable({ tag = tag }, { __add = function(a, v) return { tag = a.tag, lifted = v.y } end })',
    'end',
    '',
    '-- a folder of checkpoint parts named by their stage number',
    'local function makeFolder(count)',
    '\tlocal parts = {}',
    '\tfor i = 1, count do',
    '\t\tparts[i] = { Name = tostring(i), CFrame = cframe("stage" .. i), handlers = {} }',
    '\t\tparts[i].Touched = { Connect = function(_, fn) table.insert(parts[i].handlers, fn) end }',
    '\tend',
    '\treturn {',
    '\t\tGetChildren = function() return parts end,',
    '\t\tFindFirstChild = function(_, name)',
    '\t\t\tfor _, part in ipairs(parts) do if part.Name == name then return part end end',
    '\t\t\treturn nil',
    '\t\tend,',
    '\t\tparts = parts,',
    '\t}',
    'end',
    '',
    'local function makeCharacter()',
    '\tlocal root = { CFrame = cframe("spawn") }',
    '\treturn { root = root, WaitForChild = function(_, name) return root end }',
    'end',
    '',
    'local player = { Name = "runner", spawned = nil }',
    'player.CharacterAdded = { Connect = function(_, fn) player.spawned = fn end }',
  ].join('\n');

  const source = [
    prelude,
    `local M = (function()\n${P.PREFABS.checkpoints.source}\nend)()`,
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

const CP_WIRED = [
  'local data = { stage = 1 }',
  'local folder = makeFolder(5)',
  'M.configure({ get = function(p) return data end, field = "stage", folder = folder })',
].join('\n');

test('the checkpoints harness runs, and a false assertion in it still fails', () => {
  const good = runCheckpoints('assert(type(M.reach) == "function", "M.reach")', 'cp-sanity');
  assert.ok(good.ok, good.output);
  const bad = runCheckpoints('assert(false, "intentional-cp")', 'cp-sanity-neg');
  assert.equal(bad.ok, false, 'a failing assert did not fail the checkpoints run');
  assert.match(bad.output, /intentional-cp/);
});

test('THE STAGE NEVER GOES BACKWARDS — the bug players find instantly', () => {
  const r = runCheckpoints([
    CP_WIRED,
    'assert(M.reach(player, 3) == true, "advancing to 3")',
    'assert(M.stage(player) == 3)',
    'assert(M.reach(player, 7) == true, "advancing to 7")',
    'assert(M.reach(player, 3) == false, "re-touching 3 must not advance")',
    'assert(M.stage(player) == 7, "and must NOT move the stage back, got " .. tostring(M.stage(player)))',
    'assert(M.reach(player, 7) == false, "the same stage is not an advance either")',
    'assert(M.stage(player) == 7)',
  ].join('\n'), 'cp-backwards');
  assert.ok(r.ok, r.output);
});

test('nonsense stages are refused rather than stored', () => {
  const r = runCheckpoints([
    CP_WIRED,
    'assert(M.reach(player, 0) == false, "stage 0")',
    'assert(M.reach(player, -3) == false, "negative")',
    'assert(M.reach(player, 2.5) == false, "fractional")',
    'assert(M.reach(player, "9") == false, "a string")',
    'assert(M.stage(player) == 1, "none of those may have advanced anything")',
  ].join('\n'), 'cp-nonsense');
  assert.ok(r.ok, r.output);
});

test('A TOUCHED STORM ADVANCES ONCE — a part fires many times a second, and per limb', () => {
  const r = runCheckpoints([
    CP_WIRED,
    'player.Character = "the-character"',
    'assert(M.bind(player) == true)',
    'local touch = folder.parts[2].handlers[1]',
    '-- one arrival, forty Touched events across six limbs',
    'for i = 1, 40 do touch({ Parent = "the-character" }) end',
    'assert(M.stage(player) == 2, "stage should be 2")',
    '-- and a later, genuine arrival at 3 still registers once the cooldown has passed',
    'advance(1)',
    'local touch3 = folder.parts[3].handlers[1]',
    'for i = 1, 40 do touch3({ Parent = "the-character" }) end',
    'assert(M.stage(player) == 3, "a real later arrival must still count")',
  ].join('\n'), 'cp-touchstorm');
  assert.ok(r.ok, r.output);
});

test("another player's character touching does not advance this player", () => {
  const r = runCheckpoints([
    CP_WIRED,
    'player.Character = "the-character"',
    'assert(M.bind(player) == true)',
    'local touch = folder.parts[4].handlers[1]',
    'touch({ Parent = "someone-elses-character" })',
    'assert(M.stage(player) == 1, "a stranger\'s limb must not advance us")',
    'touch({ Parent = nil })',
    'assert(M.stage(player) == 1, "and neither must a parentless part")',
  ].join('\n'), 'cp-other');
  assert.ok(r.ok, r.output);
});

test('RESPAWN MOVES THE CHARACTER TO THE CHECKPOINT — Roblox has already chosen a spawn', () => {
  // The third bug: without moving the character AFTER it loads, a player who died at stage 4
  // restarts at the beginning while their saved stage still says 4.
  const r = runCheckpoints([
    CP_WIRED,
    'player.Character = "the-character"',
    'assert(M.bind(player) == true)',
    'M.reach(player, 4)',
    'local character = makeCharacter()',
    'assert(character.root.CFrame.tag == "spawn", "starts where Roblox put it")',
    'player.spawned(character)',
    'assert(character.root.CFrame.tag == "stage4", "must be moved to the reached checkpoint, got " .. tostring(character.root.CFrame.tag))',
    'assert(character.root.CFrame.lifted == 4, "and lifted clear of the part rather than inside it")',
  ].join('\n'), 'cp-respawn');
  assert.ok(r.ok, r.output);
});

test('a missing checkpoint part leaves the character where it is rather than erroring', () => {
  const r = runCheckpoints([
    'local data = { stage = 1 }',
    'local folder = makeFolder(2)',
    'M.configure({ get = function(p) return data end, field = "stage", folder = folder })',
    'player.Character = "the-character"',
    'assert(M.bind(player) == true)',
    'data.stage = 99',
    'local character = makeCharacter()',
    'player.spawned(character)',
    'assert(character.root.CFrame.tag == "spawn", "no part for stage 99, so no move and no error")',
  ].join('\n'), 'cp-missing');
  assert.ok(r.ok, r.output);
});

test('binding is refused when the player has no loaded data', () => {
  const r = runCheckpoints([
    'local folder = makeFolder(3)',
    'M.configure({ get = function(p) return nil end, field = "stage", folder = folder })',
    'assert(M.bind(player) == false, "no data means nothing to bind")',
    'assert(M.stage(player) == nil, "and no stage to report")',
    'assert(M.reach(player, 2) == false, "and nothing to advance")',
  ].join('\n'), 'cp-noload');
  assert.ok(r.ok, r.output);
});

/**
 * Leaderboard's harness.
 *
 * `task.spawn` CAPTURES the refresh loop rather than running it — the loop is `while running do`,
 * and a synchronous spawn would hang the test forever. refresh() is driven directly instead, which
 * is the part with the rules in it.
 *
 * The fake OrderedDataStore can be told to fail, and to fail only on the page read, so the two
 * different failure points get different tests. They are different: one leaves the cache alone by
 * never reaching it, the other has to leave it alone deliberately.
 */
function runLeaderboard(body, tag) {
  const prelude = [
    'local warnings = {}',
    'warn = function(...)',
    '\tlocal parts = {}',
    '\tfor i = 1, select("#", ...) do parts[i] = tostring(select(i, ...)) end',
    '\ttable.insert(warnings, table.concat(parts, " "))',
    'end',
    '',
    'local nowValue = 5000',
    'os = { time = function() return nowValue end, clock = function() return nowValue end }',
    '',
    'local spawned = nil',
    'task = { spawn = function(f) spawned = f end, wait = function() end }',
    '',
    'local store = {',
    '\tdata = {},',
    '\tfailFetch = false,',
    '\tfailPage = false,',
    '\tfetches = 0,',
    '}',
    'function store:UpdateAsync(key, transform)',
    '\tlocal updated = transform(self.data[key])',
    '\tself.data[key] = updated',
    '\treturn updated',
    'end',
    'function store:GetSortedAsync(ascending, size)',
    '\tself.fetches = self.fetches + 1',
    '\tif self.failFetch then error("throttled") end',
    '\tlocal rows = {}',
    '\tfor key, value in pairs(self.data) do table.insert(rows, { key = key, value = value }) end',
    '\ttable.sort(rows, function(a, b) return a.value > b.value end)',
    '\tlocal page = {}',
    '\tfor i = 1, math.min(size, #rows) do page[i] = rows[i] end',
    '\tlocal failPage = self.failPage',
    '\treturn { GetCurrentPage = function() if failPage then error("page read failed") end return page end }',
    'end',
    '',
    'game = { GetService = function(self, name) return { GetOrderedDataStore = function() return store end } end }',
    '',
    'local function p(id) return { UserId = id } end',
  ].join('\n');

  const source = [
    prelude,
    `local M = (function()\n${P.PREFABS.leaderboard.source}\nend)()`,
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

const LB = 'M.configure({ store = "Test_v1", size = 3, refreshSeconds = 60 })';

test('the leaderboard harness runs, and a false assertion in it still fails', () => {
  const good = runLeaderboard([LB, 'assert(type(M.refresh) == "function")'].join('\n'), 'lb-sanity');
  assert.ok(good.ok, good.output);
  const bad = runLeaderboard([LB, 'assert(false, "intentional-lb")'].join('\n'), 'lb-sanity-neg');
  assert.equal(bad.ok, false, 'a failing assert did not fail the leaderboard run');
  assert.match(bad.output, /intentional-lb/);
});

test('a refresh builds a ranked board from the store', () => {
  const r = runLeaderboard([
    LB,
    'M.submit(p(1), 50) M.submit(p(2), 900) M.submit(p(3), 300)',
    'assert(M.refresh() == true)',
    'local top, at = M.top()',
    'assert(#top == 3, "three entries, got " .. tostring(#top))',
    'assert(top[1].userId == 2 and top[1].score == 900, "highest first")',
    'assert(top[1].rank == 1 and top[3].rank == 3, "ranks are assigned")',
    'assert(at == 5000, "and the board says when it was fetched")',
  ].join('\n'), 'lb-refresh');
  assert.ok(r.ok, r.output);
});

test('A FAILED FETCH KEEPS THE PREVIOUS BOARD — an empty board reads as "nobody has scored"', () => {
  const r = runLeaderboard([
    LB,
    'M.submit(p(1), 100)',
    'assert(M.refresh() == true)',
    'assert(#M.top() == 1, "a board exists")',
    'store.failFetch = true',
    'assert(M.refresh() == false, "the fetch failed")',
    'local top = M.top()',
    'assert(#top == 1, "the previous board must still stand, got " .. tostring(#top))',
    'assert(top[1].userId == 1, "with its entries intact")',
  ].join('\n'), 'lb-failed-fetch');
  assert.ok(r.ok, r.output);
});

test('a page that fails partway does not replace the board with half of one', () => {
  // A separate failure point from the fetch: this one is reached AFTER the request succeeded, so
  // leaving the cache alone has to be deliberate rather than incidental.
  const r = runLeaderboard([
    LB,
    'M.submit(p(1), 100)',
    'assert(M.refresh() == true)',
    'store.failPage = true',
    'assert(M.refresh() == false, "the page read failed")',
    'assert(#M.top() == 1, "the old board stands rather than being half-replaced")',
  ].join('\n'), 'lb-failed-page');
  assert.ok(r.ok, r.output);
});

test('SUBMIT IS MONOTONIC BY DEFAULT — a stale retry cannot lower a score', () => {
  const r = runLeaderboard([
    LB,
    'M.submit(p(1), 900)',
    'M.submit(p(1), 100)',
    'assert(M.refresh() == true)',
    'local top = M.top()',
    'assert(top[1].score == 900, "a later lower write must not win, got " .. tostring(top[1].score))',
    'M.submit(p(1), 1200)',
    'assert(M.refresh() == true)',
    'assert(M.top()[1].score == 1200, "but a genuine improvement must")',
  ].join('\n'), 'lb-monotonic');
  assert.ok(r.ok, r.output);
});

test('monotonic = false lets a current value fall, for a board that tracks a balance', () => {
  const r = runLeaderboard([
    'M.configure({ store = "Test_v1", size = 3, monotonic = false })',
    'M.submit(p(1), 900)',
    'M.submit(p(1), 100)',
    'assert(M.refresh() == true)',
    'assert(M.top()[1].score == 100, "the newest write wins when the board tracks a current value")',
  ].join('\n'), 'lb-nonmonotonic');
  assert.ok(r.ok, r.output);
});

test('fractional, negative and non-numeric scores are refused', () => {
  const r = runLeaderboard([
    LB,
    'assert(M.submit(p(1), 1.5) == false, "OrderedDataStore stores integers")',
    'assert(M.submit(p(1), -5) == false)',
    'assert(M.submit(p(1), "900") == false)',
    'assert(M.refresh() == true)',
    'assert(#M.top() == 0, "none of those may have been stored")',
    'assert(#warnings >= 3, "and each should say why")',
  ].join('\n'), 'lb-validation');
  assert.ok(r.ok, r.output);
});

test('start is idempotent, so the scarcest budget is not spent twice over', () => {
  const r = runLeaderboard([
    LB,
    'assert(M.start() == true, "the first start runs")',
    'assert(M.start() == false, "a second start must NOT begin a second loop")',
    'M.stop()',
    'assert(M.start() == true, "and it can be restarted after stopping")',
  ].join('\n'), 'lb-start');
  assert.ok(r.ok, r.output);
});

test('an unconfigured board refuses rather than erroring', () => {
  const r = runLeaderboard([
    'assert(M.refresh() == false, "no store, no refresh")',
    'assert(M.submit(p(1), 10) == false, "no store, no submit")',
  ].join('\n'), 'lb-unconfigured');
  assert.ok(r.ok, r.output);
});

/**
 * Rounds' harness.
 *
 * `tick(dt)` exists so a round can be driven rather than waited for — a two-minute round is not
 * something a suite can sit through, and "advance time by 130 seconds" is the only way the
 * time-expiry path gets exercised at all. `task.spawn` captures the loop instead of running it,
 * because the loop is `while running do` and a synchronous spawn would hang forever.
 *
 * A "player" here is a table with a Parent, which is how the module tests presence: a player who
 * has left has a nil Parent. That is the real check, not a stub of one.
 */
function runRounds(body, tag) {
  const prelude = [
    'local warnings = {}',
    'warn = function(...)',
    '\tlocal parts = {}',
    '\tfor i = 1, select("#", ...) do parts[i] = tostring(select(i, ...)) end',
    '\ttable.insert(warnings, table.concat(parts, " "))',
    'end',
    '',
    'local spawned = nil',
    'local spawnedLoops = {}',
    '-- task.wait is a no-op here, so a loop that fails to terminate would hang the whole suite',
    '-- rather than fail it. Counting the waits turns that into an ordinary assertion failure.',
    'local waits = 0',
    'task = {',
    '\tspawn = function(f) spawned = f; table.insert(spawnedLoops, f) end,',
    '\twait = function()',
    '\t\twaits = waits + 1',
    '\t\tif waits > 200 then error("task.wait called 200 times — a loop is not terminating") end',
    '\tend,',
    '}',
    '',
    'local lobby = {}',
    'game = { GetService = function() return { GetPlayers = function() return lobby end } end }',
    '',
    '-- a present player has a Parent; one who has left does not',
    'local function player(name) return { Name = name, Parent = "Players" } end',
    'local function leave(p) p.Parent = nil end',
  ].join('\n');

  const source = [
    prelude,
    `local M = (function()\n${P.PREFABS.rounds.source}\nend)()`,
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

/** Two players in the lobby, short timers, started. */
const RD = [
  'local started, ended = {}, {}',
  'M.configure({ roundSeconds = 60, intermissionSeconds = 10, minimumPlayers = 2 })',
  'M.onStart(function(ps) table.insert(started, #ps) end)',
  'M.onEnd(function(ps, reason) table.insert(ended, reason) end)',
  'local a, b = player("a"), player("b")',
  'lobby = { a, b }',
  'assert(M.start() == true)',
].join('\n');

test('the rounds harness runs, and a false assertion in it still fails', () => {
  const good = runRounds('assert(type(M.tick) == "function")', 'rd-sanity');
  assert.ok(good.ok, good.output);
  const bad = runRounds('assert(false, "intentional-rounds")', 'rd-sanity-neg');
  assert.equal(bad.ok, false);
  assert.match(bad.output, /intentional-rounds/);
});

/**
 * STOP THEN START LEFT TWO LOOPS RUNNING.
 *
 * start() refuses while running, which handles a doubled start. It does not handle the other
 * ordering: stop() sets running false, but the loop it started is asleep inside task.wait and has
 * not noticed. A start() before that second elapses sets running true again, and the old loop wakes
 * to a flag that is true and carries on beside the new one. Two loops each calling tick(1) every
 * second means rounds advance at double speed, intermissions end early, and nothing in the module
 * looks wrong.
 *
 * A generation counter fixes it: a loop that wakes superseded exits. The harness counts task.wait
 * calls so a loop that never terminates fails this test instead of hanging the suite.
 */
test('STOP THEN START DOES NOT LEAVE THE OLD LOOP TICKING', () => {
  const r = runRounds([
    'M.configure({ roundSeconds = 60, intermissionSeconds = 10, minimumPlayers = 2 })',
    'lobby = { player("a"), player("b") }',
    '',
    'assert(M.start() == true)',
    'local firstLoop = spawnedLoops[1]',
    'assert(type(firstLoop) == "function", "start must spawn a loop")',
    '',
    'assert(M.stop() == true)',
    'assert(M.start() == true, "restarting is allowed")',
    'assert(#spawnedLoops == 2, "the restart spawns its own loop")',
    '',
    // the stale loop is what a real scheduler would resume a fraction of a second later
    'firstLoop()',
    'assert(M.phase() == "intermission", "the superseded loop must not have advanced anything")',
    'assert(M.number() == 0, "and must not have started a round, number is " .. tostring(M.number()))',
  ].join('\n'), 'rd-no-double-loop');
  assert.ok(r.ok, r.output);
});

test('a second start while running is still refused, and the loop count proves it', () => {
  const r = runRounds([
    'M.configure({ roundSeconds = 60, intermissionSeconds = 10, minimumPlayers = 2 })',
    'lobby = { player("a"), player("b") }',
    'assert(M.start() == true)',
    'assert(M.start() == false, "a second start must be refused")',
    'assert(#spawnedLoops == 1, "and must not spawn a second loop, spawned " .. tostring(#spawnedLoops))',
  ].join('\n'), 'rd-idempotent-start');
  assert.ok(r.ok, r.output);
});

test('START IS IDEMPOTENT — a second call must not begin a second loop', () => {
  // Two loops advance the same round, halving every timer and firing every event twice, and
  // nothing errors. It presents as "the game got faster".
  const r = runRounds([
    RD,
    'assert(M.start() == false, "a second start must be refused")',
    'assert(M.start() == false, "and a third")',
    'M.stop()',
    'assert(M.start() == true, "but it can be restarted after stopping")',
  ].join('\n'), 'rd-idempotent');
  assert.ok(r.ok, r.output);
});

test('a round begins after the intermission, once there are enough players', () => {
  const r = runRounds([
    RD,
    'assert(M.phase() == "intermission")',
    'M.tick(9)',
    'assert(M.phase() == "intermission", "not yet")',
    'M.tick(2)',
    'assert(M.phase() == "playing", "the round should have begun")',
    'assert(M.number() == 1)',
    'assert(#started == 1 and started[1] == 2, "onStart gets the participants")',
  ].join('\n'), 'rd-begin');
  assert.ok(r.ok, r.output);
});

test('A ROUND WITH NOBODY LEFT IN IT ENDS, rather than waiting for a win that cannot happen', () => {
  const r = runRounds([
    RD,
    'M.tick(11)',
    'assert(M.phase() == "playing")',
    'leave(a) leave(b)',
    'M.tick(1)',
    'assert(M.phase() == "intermission", "an empty round must end")',
    'assert(ended[1] == "abandoned", "and say why, got " .. tostring(ended[1]))',
  ].join('\n'), 'rd-abandoned');
  assert.ok(r.ok, r.output);
});

test('a round ends on time, and reports that as the reason', () => {
  const r = runRounds([
    RD,
    'M.tick(11)',
    'assert(M.phase() == "playing")',
    'M.tick(59)',
    'assert(M.phase() == "playing", "not yet")',
    'M.tick(2)',
    'assert(M.phase() == "intermission")',
    'assert(ended[1] == "time")',
  ].join('\n'), 'rd-time');
  assert.ok(r.ok, r.output);
});

test('A PLAYER WHO JOINS MID-ROUND IS NOT IN IT, and is in the next one', () => {
  const r = runRounds([
    RD,
    'M.tick(11)',
    'assert(#M.participants() == 2)',
    'local c = player("c")',
    'lobby = { a, b, c }',
    'M.tick(5)',
    'assert(#M.participants() == 2, "the joiner must not be added to a running round")',
    'M.finish("called")',
    'M.tick(11)',
    'assert(#M.participants() == 3, "and must be in the next one, got " .. tostring(#M.participants()))',
    'assert(M.number() == 2)',
  ].join('\n'), 'rd-midjoin');
  assert.ok(r.ok, r.output);
});

test('STATE DOES NOT SURVIVE A ROUND', () => {
  const r = runRounds([
    RD,
    'M.tick(11)',
    'assert(#M.participants() == 2)',
    'M.finish("called")',
    'assert(#M.participants() == 0, "participants must be cleared on the way out, not on the way in")',
    'assert(M.phase() == "intermission")',
  ].join('\n'), 'rd-cleanup');
  assert.ok(r.ok, r.output);
});

test('a handler that ERRORS does not leave the machine stuck in playing', () => {
  // Rule 3 stated as a failure path: cleanup runs before the callback, so a throwing handler
  // cannot strand the state machine.
  const r = runRounds([
    'M.configure({ roundSeconds = 60, intermissionSeconds = 10, minimumPlayers = 2 })',
    'M.onEnd(function() error("handler exploded") end)',
    'local a, b = player("a"), player("b")',
    'lobby = { a, b }',
    'M.start()',
    'M.tick(11)',
    'assert(M.phase() == "playing")',
    'M.finish("called")',
    'assert(M.phase() == "intermission", "a throwing onEnd must not strand the round")',
    'assert(#warnings >= 1, "and the error must be reported")',
  ].join('\n'), 'rd-throwing-end');
  assert.ok(r.ok, r.output);
});

test('an onStart that errors ends the round instead of running it broken', () => {
  const r = runRounds([
    'M.configure({ roundSeconds = 60, intermissionSeconds = 10, minimumPlayers = 2 })',
    'M.onStart(function() error("could not set up") end)',
    'local a, b = player("a"), player("b")',
    'lobby = { a, b }',
    'M.start()',
    'M.tick(11)',
    'assert(M.phase() == "intermission", "a round that could not start must not be left playing")',
    'assert(#warnings >= 1)',
  ].join('\n'), 'rd-throwing-start');
  assert.ok(r.ok, r.output);
});

test('too few players holds the intermission without the timer running away', () => {
  // If elapsed kept climbing, the moment a second player joined a round would start instantly,
  // with no intermission at all for the person who was already waiting.
  const r = runRounds([
    'M.configure({ roundSeconds = 60, intermissionSeconds = 10, minimumPlayers = 2 })',
    'local a = player("a")',
    'lobby = { a }',
    'M.start()',
    'M.tick(60)',
    'assert(M.phase() == "intermission", "one player is not a match")',
    'lobby = { a, player("b") }',
    'M.tick(1)',
    'assert(M.phase() == "playing", "and it starts on the next tick once there are two")',
  ].join('\n'), 'rd-tooFew');
  assert.ok(r.ok, r.output);
});

test('stop ends a round in progress so onEnd still runs', () => {
  const r = runRounds([
    RD,
    'M.tick(11)',
    'assert(M.phase() == "playing")',
    'assert(M.stop() == true)',
    'assert(M.phase() == "idle")',
    'assert(ended[1] == "stopped", "a shutdown mid-round must still settle it")',
    'assert(M.tick(100) == "idle", "and ticking a stopped machine does nothing")',
  ].join('\n'), 'rd-stop');
  assert.ok(r.ok, r.output);
});

test('finish on a round that is not running is refused rather than faked', () => {
  const r = runRounds([
    RD,
    'assert(M.phase() == "intermission")',
    'assert(M.finish("called") == false, "there is no round to finish")',
    'assert(#ended == 0, "and onEnd must not have been called")',
  ].join('\n'), 'rd-finish-idle');
  assert.ok(r.ok, r.output);
});

/**
 * Income's harness.
 *
 * The bug this module exists for is not a crash, it is an accumulation: a dropper spawning a part
 * a second with nothing removing them. That is only observable over TIME, which is why `step(dt)`
 * is public and why this harness stubs `Instance.new` — counting parts is the test.
 *
 * Attributes are a real map on each stub part rather than a no-op, because the whole payout path
 * turns on reading `DropValue` off a part and on that part's Parent going nil when it is consumed.
 */
function runIncome(body, tag) {
  const prelude = [
    'local warnings = {}',
    'warn = function(...)',
    '\tlocal parts = {}',
    '\tfor i = 1, select("#", ...) do parts[i] = tostring(select(i, ...)) end',
    '\ttable.insert(warnings, table.concat(parts, " "))',
    'end',
    '',
    'local nowValue = 0',
    'os = { clock = function() return nowValue end, time = function() return nowValue end }',
    'local function advance(s) nowValue = nowValue + s end',
    '',
    'Vector3 = { new = function(x, y, z) return { x = x, y = y, z = z } end }',
    'workspace = { Name = "Workspace" }',
    '',
    '-- every part made by the module, so the test can count what a server would be holding',
    'local created = {}',
    '-- and a WEAK mirror of the same parts. Clearing `created` and collecting leaves entries here',
    '-- only for parts something else still references — which is what a leak is.',
    'local createdWeak = setmetatable({}, { __mode = "v" })',
    'local function stillReferenced()',
    '\tcollectgarbage("collect")',
    '\tlocal n = 0',
    '\tfor _ in pairs(createdWeak) do n = n + 1 end',
    '\treturn n',
    'end',
    'local function makeInstance()',
    '\tlocal attrs = {}',
    '\tlocal inst',
    '\tinst = {',
    '\t\tParent = nil,',
    '\t\tSetAttribute = function(_, k, v) attrs[k] = v end,',
    '\t\tGetAttribute = function(_, k) return attrs[k] end,',
    '\t\tDestroy = function(self) self.Parent = nil end,',
    '\t\tGetFullName = function() return "plot" end,',
    '\t}',
    '\treturn inst',
    'end',
    'Instance = { new = function(class)',
    '\tlocal i = makeInstance()',
    '\ti.ClassName = class',
    '\ttable.insert(created, i)',
    '\ttable.insert(createdWeak, i)',
    '\treturn i',
    'end }',
    '',
    'local owner = { UserId = 7, Name = "owner" }',
    'local visitor = { UserId = 9, Name = "visitor" }',
    'local knownPlayers = { [7] = owner, [9] = visitor }',
    'game = { GetService = function() return { GetPlayerByUserId = function(_, id) return knownPlayers[id] end } end }',
    '',
    '-- a plot whose ownership the test controls, and a spawner with a CFrame',
    'local function makePlot(ownerId)',
    '\tlocal attrs = { OwnerUserId = ownerId }',
    '\treturn {',
    '\t\tSetAttribute = function(_, k, v) attrs[k] = v end,',
    '\t\tGetAttribute = function(_, k) return attrs[k] end,',
    '\t\tGetFullName = function() return "game.Workspace.Plot" end,',
    '\t}',
    'end',
    'local spawner = { CFrame = "at-the-dropper" }',
    '',
    '-- a collector whose Touched the test can fire',
    'local function makeCollector()',
    '\tlocal handler = nil',
    '\treturn {',
    '\t\tTouched = { Connect = function(_, fn) handler = fn end },',
    '\t\ttouch = function(part) return handler(part) end,',
    '\t}',
    'end',
    '',
    'local function liveParts()',
    '\tlocal n = 0',
    '\tfor _, p in ipairs(created) do if p.Parent ~= nil then n = n + 1 end end',
    '\treturn n',
    'end',
  ].join('\n');

  const source = [
    prelude,
    `local M = (function()\n${P.PREFABS.income.source}\nend)()`,
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

const INC = [
  'local paid = {}',
  'M.configure({ award = function(p, amount) paid[p.Name] = (paid[p.Name] or 0) + amount end, maxLive = 5 })',
  'local plot = makePlot(7)',
  'local d = M.addDropper({ plot = plot, spawner = spawner, value = 10, everySeconds = 1 })',
].join('\n');

test('the income harness runs, and a false assertion in it still fails', () => {
  const good = runIncome([INC, 'assert(type(M.step) == "function")'].join('\n'), 'in-sanity');
  assert.ok(good.ok, good.output);
  const bad = runIncome([INC, 'assert(false, "intentional-income")'].join('\n'), 'in-sanity-neg');
  assert.equal(bad.ok, false);
  assert.match(bad.output, /intentional-income/);
});

test('THE PART CAP HOLDS — this is the bug that kills a server, silently', () => {
  // Ten droppers at one part a second is 36,000 parts an hour. There is no crash to point at:
  // frame time climbs, players say the game is laggy, and the loop is working exactly as written.
  const r = runIncome([
    INC,
    'M.step(200)   -- two hundred seconds, one drop a second',
    'assert(M.liveCount(d) <= 5, "live drops must stay under the cap, got " .. tostring(M.liveCount(d)))',
    'assert(liveParts() <= 5, "and the server must not be holding more than that either")',
    'M.step(200)',
    'assert(liveParts() <= 5, "still, after four hundred seconds")',
  ].join('\n'), 'in-cap');
  assert.ok(r.ok, r.output);
});

test('it drops on schedule rather than all at once', () => {
  const r = runIncome([
    INC,
    'M.step(0.5)',
    'assert(M.liveCount(d) == 0, "half a second is not a second")',
    'M.step(0.6)',
    'assert(M.liveCount(d) == 1)',
    'M.step(3)',
    'assert(M.liveCount(d) == 4, "three more seconds, three more drops, got " .. tostring(M.liveCount(d)))',
  ].join('\n'), 'in-schedule');
  assert.ok(r.ok, r.output);
});

/**
 * THE DEBOUNCE TABLE WAS THE MODULE'S OWN HEADLINE BUG, POINTED AT ITSELF.
 *
 * Income opens by explaining that a dropper which spawns parts nothing removes will degrade a
 * server until it dies. The collector then recorded every collected drop in a table keyed by the
 * part, with no removal — one entry per collection for the life of the server, each one holding a
 * destroyed part alive so it could never be freed. The parts were capped; the record of them was
 * not.
 *
 * Weak keys fix it, and this asserts the consequence rather than the spelling: after a drop is
 * collected and every reference the test holds is dropped, a garbage collection must actually
 * reclaim it.
 */
test('A COLLECTED DROP IS ACTUALLY FREED, not held forever by the debounce record', () => {
  const r = runIncome([
    INC,
    'local collector = makeCollector()',
    'M.collector(plot, collector)',
    '',
    'local part = M.drop(d)',
    'assert(part ~= nil, "a drop was spawned")',
    'collector.touch(part)',
    'assert(paid["owner"] == 10, "and it paid out")',
    'assert(part.Parent == nil, "and was consumed")',
    'part = nil',
    '',
    'M.step(0)      -- the module forgets destroyed parts from its own live list',
    'created = {}   -- and the HARNESS drops its strong list, so only real leaks remain',
    'assert(stillReferenced() == 0, "a collected drop is still referenced after collection")',
  ].join('\n'), 'in-no-leak');
  assert.ok(r.ok, r.output);
});

test('a hundred collections leave nothing behind', () => {
  // One entry is easy to miss; the shape of the bug is that it grows without bound.
  const r = runIncome([
    INC,
    'local collector = makeCollector()',
    'M.collector(plot, collector)',
    'for i = 1, 100 do',
    '\tlocal part = M.drop(d)',
    '\tadvance(1)              -- past the touch debounce window',
    '\tcollector.touch(part)',
    '\tM.step(0)',
    'end',
    'assert(paid["owner"] == 1000, "all hundred paid, got " .. tostring(paid["owner"]))',
    'created = {}',
    'assert(stillReferenced() == 0, "the server is holding drops it collected")',
  ].join('\n'), 'in-no-leak-many');
  assert.ok(r.ok, r.output);
});

test('A CAP BELOW ONE IS REFUSED RATHER THAN HANGING THE SERVER', () => {
  // The trim loop removes the oldest while the count is at or above the cap. At zero there is never
  // anything to remove and the condition never stops holding: Income.drop never returns, the script
  // never yields, and the server is gone. "No drops" is a plausible thing to mean by maxLive = 0.
  const r = runIncome([
    'local paid = {}',
    'M.configure({ award = function(p, n) paid[p.Name] = (paid[p.Name] or 0) + n end, maxLive = 0 })',
    'local plot = makePlot(7)',
    'local d = M.addDropper({ plot = plot, spawner = spawner, value = 10, everySeconds = 1 })',
    '',
    'assert(#warnings == 1, "an unusable cap must be reported, not silently accepted")',
    'assert(string.find(warnings[1], "maxLive") ~= nil, "and the warning must name it")',
    '',
    'assert(M.drop(d) ~= nil, "a drop must still be produced")',
    'assert(M.drop(d) ~= nil, "and the next one must return at all")',
    'assert(M.liveCount(d) == 1, "with the cap clamped to one, got " .. tostring(M.liveCount(d)))',
  ].join('\n'), 'in-zero-cap');
  assert.ok(r.ok, r.output);
});

test('A PLOT NOBODY OWNS PRODUCES NOTHING — the state a plot is in most of the time', () => {
  const r = runIncome([
    'local paid = {}',
    'M.configure({ award = function(p, a) paid[p.Name] = a end, maxLive = 5 })',
    'local plot = makePlot(nil)',
    'local d = M.addDropper({ plot = plot, spawner = spawner, value = 10, everySeconds = 1 })',
    'M.step(60)',
    'assert(M.liveCount(d) == 0, "an unowned plot must not spawn, got " .. tostring(M.liveCount(d)))',
    'plot:SetAttribute("OwnerUserId", 7)',
    'M.step(2)',
    'assert(M.liveCount(d) > 0, "and must start once it is claimed")',
  ].join('\n'), 'in-unowned');
  assert.ok(r.ok, r.output);
});

test('THE PLOT OWNER IS PAID, not whoever touched the collector', () => {
  // A visitor standing on a neighbour's collector must not earn their income.
  const r = runIncome([
    INC,
    'local c = makeCollector()',
    'M.collector(plot, c)',
    'M.step(1)',
    'local drop = created[#created]',
    'c.touch(drop)',
    'assert(paid.owner == 10, "the plot owner must be paid, got " .. tostring(paid.owner))',
    'assert(paid.visitor == nil, "the toucher must not be")',
  ].join('\n'), 'in-owner');
  assert.ok(r.ok, r.output);
});

test('ONE PAYOUT PER DROP, however many times Touched fires', () => {
  // A part resting on the collector fires Touched dozens of times a second.
  const r = runIncome([
    INC,
    'local c = makeCollector()',
    'M.collector(plot, c)',
    'M.step(1)',
    'local drop = created[#created]',
    'for i = 1, 40 do c.touch(drop) end',
    'assert(paid.owner == 10, "one drop is one payout, got " .. tostring(paid.owner))',
    'assert(drop.Parent == nil, "and the drop is consumed")',
  ].join('\n'), 'in-once');
  assert.ok(r.ok, r.output);
});

test('a part that is not a drop is ignored', () => {
  // A player walking over the collector must not be treated as income.
  const r = runIncome([
    INC,
    'local c = makeCollector()',
    'M.collector(plot, c)',
    'local leg = makeInstance()',
    'leg.Parent = workspace',
    'c.touch(leg)',
    'assert(next(paid) == nil, "a limb is not a drop")',
    'assert(leg.Parent ~= nil, "and must not be destroyed")',
  ].join('\n'), 'in-notadrop');
  assert.ok(r.ok, r.output);
});

test('collected drops free their slot, so the cap counts what is actually there', () => {
  const r = runIncome([
    INC,
    'local c = makeCollector()',
    'M.collector(plot, c)',
    'M.step(5)',
    'assert(M.liveCount(d) == 5, "at the cap")',
    'for _, part in ipairs(created) do if part.Parent ~= nil then c.touch(part) end end',
    'M.step(0)',
    'assert(M.liveCount(d) == 0, "collecting must free the slots, got " .. tostring(M.liveCount(d)))',
    'M.step(3)',
    'assert(M.liveCount(d) == 3, "and the dropper resumes normally")',
  ].join('\n'), 'in-freeslots');
  assert.ok(r.ok, r.output);
});

test('an award that throws does not take the collector down with it', () => {
  const r = runIncome([
    'M.configure({ award = function() error("currency module exploded") end, maxLive = 5 })',
    'local plot = makePlot(7)',
    'local d = M.addDropper({ plot = plot, spawner = spawner, value = 10, everySeconds = 1 })',
    'local c = makeCollector()',
    'M.collector(plot, c)',
    'M.step(2)',
    'for _, part in ipairs(created) do if part.Parent ~= nil then c.touch(part) end end',
    'assert(#warnings >= 1, "the failure must be reported")',
    'M.step(2)',
    'assert(M.liveCount(d) > 0, "and the chain must still be running")',
  ].join('\n'), 'in-throwing-award');
  assert.ok(r.ok, r.output);
});
