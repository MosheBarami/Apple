/**
 * The plot simulator (compose-plotsim.ts): the owner's request, 2026-10-01, "make it actually a fully game with maps
 * different keyboards more gui a shop machines and plots for 4 players if you find assets its better than generating
 * one from parts", fell through to "build it yourself" because compose_game had one template.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const WORKER = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(mkdtempSync(join(tmpdir(), 'ps-')), 'p.mjs');
execFileSync(join(WORKER, 'node_modules', '.bin', 'esbuild'), [join(WORKER, 'src', 'compose-plotsim.ts'), '--bundle', '--format=esm', '--platform=node', '--outfile=' + out, '--external:cloudflare:*'], { cwd: WORKER, stdio: 'pipe' });
const P = await import(`file://${out}`);

const OWNER = 'make it actually a fully game with maps different keyboards more gui a shop machines and plots for 4 players if you find assets its better than generating one fron parts';
const LIB = [{ game: '41f6ce3a6bde', path: '/Workspace/Keyboard' }, { game: 'f7209fe000d3', path: '/Workspace/Keyboard' }];

test("the owner's request is a plot simulator for 4 players about the keyboard already in the place", () => {
  assert.ok(P.isPlotSimRequest(OWNER));
  for (const t of ['a keyboard simulator', 'make a pizza tycoon', 'turn this into a full game']) assert.ok(P.isPlotSimRequest(t), t);
  for (const t of ['make an asmr keyboard', 'add an upgrades gui that actually functions', 'make me a stick of butter']) assert.ok(!P.isPlotSimRequest(t), t);
  assert.equal(P.playersIn(OWNER), 4);
  assert.equal(P.playersIn('a tycoon for 12 players'), 8, 'at most 8');
  assert.equal(P.playersIn('a tycoon'), 4);
  assert.equal(P.subjectOf(OWNER, 'ASMRKeyboard'), 'keyboard');
  assert.equal(P.subjectOf('a pizza tycoon'), 'pizza');
});

test('the machines are the player\'s own object in four colour tiers and the library\'s models, each tier dearer and richer', () => {
  const m = P.machineLadder('keyboard', 'ASMRKeyboard', LIB);
  assert.equal(m.length, 6);
  assert.deepEqual(m.slice(0, 4).map((x) => x.from), Array(4).fill('Workspace.ASMRKeyboard'));
  assert.equal(new Set(m.slice(1, 4).map((x) => x.hue)).size, 3, 'each recoloured tier has its own colour family');
  assert.deepEqual(m.slice(4).map((x) => x.ref), LIB, 'library models are machines too');
  for (let i = 1; i < m.length; i++) {
    assert.ok(m[i].price > m[i - 1].price && m[i].income > m[i - 1].income, `tier ${i} is not dearer and richer`);
    assert.ok(m[i].price / m[i].income > m[i - 1].price / m[i - 1].income * 0.9, 'a dearer tier pays back no faster than a cheap one by far');
  }
  assert.equal(P.machineLadder('pizza', undefined, []).length, 0, 'nothing to sell without an object or a library model');
});

test('the steps build a hub with 4 plots, every simulator system, its config and HUD, and keep the place\'s economy', () => {
  const recipe = P.plotSimRecipe(OWNER, 12345, { hero: 'ASMRKeyboard', library: LIB, hubProps: [{ key: 'HubSell', ref: { game: 'abc', path: '/Workspace/SellPoint' }, at: 'sell', height: 10 }], hasComponents: true });
  const steps = P.plotSimSteps(recipe);
  const json = JSON.stringify(steps);
  const map = steps.find((s) => s.kind === 'create' && s.parent === 'game.Workspace');
  const plots = JSON.stringify(map).match(/"name":"Plot\d"/g) ?? [];
  assert.equal(new Set(plots).size, 4, '4 plots');
  assert.ok(!steps.some((s) => s.kind === 'create' && s.parent === 'game.ServerScriptService'), 'the economy folder already there is not replaced');
  const scripts = steps.filter((s) => s.kind === 'script').map((s) => s.name);
  for (const n of ['AppleEconomy', 'AppleShop', 'AppleMachines', 'AppleUpgrades', 'AppleAnimate', 'AppleGameUI', 'AppleBoot', 'AppleGameConfig', 'AppleUpgradesConfig']) assert.ok(scripts.includes(n), `${n} missing`);
  const cfg = steps.find((s) => s.kind === 'script' && s.name === 'AppleGameConfig').source;
  assert.match(cfg, /start = \{\s*"AppleShop",\s*"AppleMachines",?\s*\}/);
  assert.match(cfg, /from = "Workspace\.ASMRKeyboard"/, 'the hero is staged as a machine');
  assert.match(cfg, /hue = /, 'recoloured tiers');
  assert.match(cfg, /width = 5\.4/, 'fitted to a plot tile');
  assert.match(cfg, /machines = \{/);
  assert.match(cfg, /rebirth = \{/);
  const up = steps.find((s) => s.kind === 'script' && s.name === 'AppleUpgradesConfig').source;
  assert.match(up, /screen = "AppleHUD"/);
  assert.ok(json.includes('"name":"AppleHUD"'), 'the simulator HUD');
  assert.ok(steps.some((s) => s.kind === 'delete' && s.paths.includes('game.StarterGui.ASMRKeyboardHUD')), 'the hero\'s small screen goes');
  assert.ok(steps.some((s) => s.kind === 'import' && s.ref.game === '41f6ce3a6bde'), 'library machines are imported');
  assert.ok(steps.some((s) => s.kind === 'place' && s.from === 'ServerStorage.AppleParts.HubSell'), 'the sell stand is placed');
});

test('the session routes a simulator request to compose_game first, and compose_game to the plot simulator', () => {
  const session = readFileSync(join(WORKER, 'src', 'do', 'session.ts'), 'utf8');
  assert.match(session, /\(!\('error' in ideaRecipe\(text\)\) \|\| isPlotSimRequest\(text\)\) \? \{ composeFirst: true \}/);
  const tool = readFileSync(join(WORKER, 'src', 'compose-tool.ts'), 'utf8');
  assert.match(tool, /if \('error' in plan && isPlotSimRequest\(idea\)\) return composePlotSim\(ctx, idea\);/);
});

// The owner's 93-step run (2026-10-01, 274 credits): compose_game ran, then the model rebuilt plots and screens by hand
// with 24 build_object calls and 49 tree reads. A built plot simulator is played once and answered.
test('a composed plot simulator ends the run at play-and-answer, and a game already in the project does not refuse it', () => {
  const session = readFileSync(join(WORKER, 'src', 'do', 'session.ts'), 'utf8');
  assert.match(session, /call\.name === 'compose_game' && out\.ok && out\.mutatedProject === true && isPlotSimRequest\([^)]*\)\) \{\s*agent\.composedPlotSim = true;\s*agent\.objectBuilt = true;/);
  const after = session.slice(session.indexOf('const AFTER_OBJECT'), session.indexOf('const AFTER_OBJECT') + 400);
  assert.match(after, /agent\.composedPlotSim \? \['play_check', 'get_output_logs'\]/);
  assert.match(session, /const continueLine = mode === 'agent' && !isPlotSimRequest\(text\) \? continueGameLine\(/);
});
