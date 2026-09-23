/**
 * THE PLAYER-SIDE CHECK, WORKER HALF (F-046).
 *
 * The plugin's `play_check` op reports what a player had on screen in a real Test session. What
 * this file holds the worker to is the sentence the MODEL reads: it must say plainly what the player
 * sees — including "no ScreenGui at all" — and which client errors happened, and it must never turn
 * a check that did not observe the screen into one that did.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const WORKER = join(HERE, '..');
const temp = mkdtempSync(join(tmpdir(), 'play-check-'));
const bundle = (entry) => {
  const outfile = join(temp, `${entry}.mjs`);
  execFileSync(join(WORKER, 'node_modules', '.bin', 'esbuild'), [
    join(WORKER, 'src', `${entry}.ts`), '--bundle', '--format=esm', '--target=es2022', `--outfile=${outfile}`,
  ], { cwd: WORKER, stdio: 'pipe' });
  return outfile;
};
const T = await import(pathToFileURL(bundle('tools')).href);
const P = await import(pathToFileURL(bundle('playtest')).href);
rmSync(temp, { recursive: true, force: true });

function ctxReturning(result) {
  const calls = [];
  return {
    calls,
    ctx: {
      execStudioOp: async (op, timeoutMs) => {
        calls.push({ op, timeoutMs });
        return typeof result === 'function' ? result(op) : result;
      },
    },
  };
}

// What the plugin returned for the Coin Rush place in the shape PlayCheck.normalise produces.
const F046 = {
  completed: true, stage: 'done', playerJoined: true, characterSpawned: true, clientReported: true, playerGuiFound: true,
  screenGuis: [{ name: 'Freecam', enabled: true, labels: [] }],
  otherPlayerGuiChildren: [{ name: 'ShopGui', class: 'LocalScript' }],
  clientErrors: [{ message: 'ResetOnSpawn is not a valid member of LocalScript "Players.Player1.PlayerGui.ShopGui"', source: 'Players.Player1.PlayerGui.ShopGui' }],
  clientWarnings: [], serverErrors: [], serverWarnings: [],
  leaderstatsBefore: [{ name: 'Coins', value: 5 }], leaderstatsAfter: [{ name: 'Coins', value: 5 }], touches: [],
  harnessRemoved: true,
};

test('the tool is registered as a Studio tool standing on play_check alone', () => {
  const tool = T.TOOLS.play_check;
  assert.ok(tool, 'play_check is not in the registry');
  assert.equal(tool.studio, true);
  assert.deepEqual(tool.studioOps, ['play_check']);
  assert.ok(!tool.mutatesProject, 'a play check changes nothing in the place');
  assert.match(tool.def.description, /run_and_check has no player/);
});

test('F-046: no game ScreenGui and a client error are said plainly, and are not a pass', async () => {
  const { ctx, calls } = ctxReturning({ id: 'x', ok: true, data: F046 });
  const out = await T.TOOLS.play_check.run(ctx, { seconds: 4 });
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].op, { op: 'play_check', seconds: 4 });
  assert.ok(calls[0].timeoutMs >= 60_000, 'the worker must outwait the plugin\'s own 50-second session bound');
  assert.equal(out.verdict, 'client_errors');
  assert.match(out.playerSees, /NO game ScreenGui at all/);
  assert.match(out.playerSees, /ShopGui \(LocalScript\)/, 'the thing named like a GUI is named for what it is');
  assert.match(out.playerSees, /Studio's own Freecam/, 'Studio\'s Freecam is not counted as the game\'s UI');
  assert.equal(out.clientErrors.length, 1);
  assert.match(out.clientErrors[0], /ResetOnSpawn is not a valid member/);
  assert.match(out.note, /do not call it verified/);
  assert.match(out.harness, /removed/);
});

test('a working counter is quoted with its visible text and the coin touch result', async () => {
  const data = {
    ...F046,
    screenGuis: [{ name: 'CoinGui', enabled: true, labels: [
      { name: 'CoinLabel', class: 'TextLabel', text: 'Coins: 6', visible: true },
      { name: 'Buy', class: 'TextButton', text: 'Buy', visible: false },
    ] }],
    otherPlayerGuiChildren: [], clientErrors: [],
    leaderstatsAfter: [{ name: 'Coins', value: 6 }],
    touches: [{ path: 'game.Workspace.Coin1', found: true, moved: true, transparency: 1, stillInPlace: true, leaderstatsAfter: [{ name: 'Coins', value: 6 }] }],
  };
  const { ctx, calls } = ctxReturning({ id: 'x', ok: true, data });
  const out = await T.TOOLS.play_check.run(ctx, { touch: ['game.Workspace.Coin1'] });
  assert.deepEqual(calls[0].op, { op: 'play_check', seconds: 5, touch: ['game.Workspace.Coin1'] });
  assert.equal(out.verdict, 'observed');
  assert.match(out.playerSees, /ScreenGui "CoinGui" \(enabled\): visible text "Coins: 6" \[CoinLabel\]; hidden: Buy/);
  assert.equal(out.leaderstats, 'Coins 5 at the start → Coins 6 at the end');
  assert.match(out.touches[0], /game\.Workspace\.Coin1: walked onto it, leaderstats then Coins 6, Transparency 1/);
});

test('a client that never answered is "not observed", never an empty screen', () => {
  const out = P.summarisePlayCheck({ ...F046, clientReported: false, screenGuis: [], serverViewScreenGuis: [{ name: 'CoinGui', enabled: true, labels: [] }] });
  assert.equal(out.verdict, 'no_report');
  assert.match(out.playerSees, /^NOT OBSERVED/);
  assert.match(out.playerSees, /server cannot see GUIs a LocalScript builds/);
  assert.match(out.note, /NOT verified/);
});

test('no player means nothing was observed', () => {
  const out = P.summarisePlayCheck({ stage: 'no_player', playerJoined: false, harnessRemoved: true });
  assert.equal(out.verdict, 'no_player');
  assert.match(out.playerSees, /^NOTHING WAS OBSERVED/);
});

test('a disabled ScreenGui is not what the player sees, and a harness left behind leads the result', () => {
  const out = P.summarisePlayCheck({ ...F046, clientErrors: [], harnessRemoved: false, harnessRemaining: 1,
    screenGuis: [{ name: 'CoinGui', enabled: false, labels: [{ name: 'CoinLabel', text: 'Coins: 0', visible: false }] }] });
  assert.match(out.playerSees, /DISABLED — the player sees none of it/);
  assert.match(out.harness, /^WARNING: 1 temporary check script/);
  assert.equal(Object.keys(out)[0], 'harness', 'a harness left in the place must lead the result, ahead of any truncation');
  assert.equal(Object.keys(P.summarisePlayCheck(F046))[0], 'verdict', 'otherwise the verdict leads');
});

test('a refused or failed op says nothing was observed and carries the refusal remedy', async () => {
  const { ctx } = ctxReturning({ id: 'x', ok: false, error: 'writes require explicit edit consent', failure: 'refused', remedy: 'edit_consent' });
  const out = await T.TOOLS.play_check.run(ctx, {});
  assert.match(out.error, /edit consent/);
  assert.ok(out.fix, 'the product remedy travels with the refusal');
  assert.match(out.notVerified, /nothing on the player's screen was observed/);
});

test('arguments are bounded before anything is sent to Studio', async () => {
  const { ctx, calls } = ctxReturning({ id: 'x', ok: true, data: F046 });
  const tooMany = await T.TOOLS.play_check.run(ctx, { touch: ['a', 'b', 'c', 'd', 'e', 'f'] });
  assert.match(tooMany.error, /at most 5/);
  const notList = await T.TOOLS.play_check.run(ctx, { touch: 'game.Workspace.Coin1' });
  assert.match(notList.error, /at most 5/);
  assert.equal(calls.length, 0, 'an invalid request reaches no Studio');
  await T.TOOLS.play_check.run(ctx, { seconds: 99 });
  await T.TOOLS.play_check.run(ctx, { seconds: 1 });
  assert.deepEqual(calls.map((c) => c.op.seconds), [15, 3]);
});

test('the prompt says a UI claim needs the player-side check, or an explicit "not verified"', () => {
  const prompts = readFileSync(join(WORKER, 'src', 'prompts.ts'), 'utf8');
  assert.match(prompts, /UI WORKS or is VERIFIED needs play_check/);
  assert.match(prompts, /run_and_check has no player/);
  assert.match(prompts, /NOT verified/);
});
