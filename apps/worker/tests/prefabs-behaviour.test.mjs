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
