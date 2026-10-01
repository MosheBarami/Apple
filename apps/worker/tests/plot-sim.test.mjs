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

// Owner, 2026-10-01: "different keyboards" — four of six were the hero recoloured. Library models fill the middle.
test('the machines: the hero opens and (in gold) tops the ladder, different library models in between, each tier dearer and richer', () => {
  const m = P.machineLadder('keyboard', 'ASMRKeyboard', LIB);
  assert.equal(m.length, 6);
  assert.equal(m[0].from, 'Workspace.ASMRKeyboard');
  assert.equal(m[0].hue, undefined, 'the first is the player\'s own, as made');
  assert.equal(m[5].from, 'Workspace.ASMRKeyboard');
  assert.equal(m[5].hue, 0.13, 'the top tier is the player\'s own in gold');
  assert.deepEqual(m.filter((x) => x.ref).map((x) => x.ref), LIB, 'every library model is a machine');
  const four = [...LIB, { game: 'ced7934c1f5d', path: '/Workspace/Keyboard' }, { game: '0ce45fd5edd7', path: '/Workspace/Keyboard' }];
  const m4 = P.machineLadder('keyboard', 'ASMRKeyboard', four);
  assert.equal(m4.filter((x) => x.ref).length, 4, 'four library keyboards, four machines');
  assert.equal(m4.filter((x) => x.from).length, 2, 'and only two of the hero');
  for (const ladder of [m, m4]) for (let i = 1; i < ladder.length; i++) {
    assert.ok(ladder[i].price > ladder[i - 1].price && ladder[i].income > ladder[i - 1].income, `tier ${i} is not dearer and richer`);
    assert.ok(ladder[i].price / ladder[i].income > ladder[i - 1].price / ladder[i - 1].income * 0.9, 'a dearer tier pays back no faster than a cheap one by far');
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
  assert.match(cfg, new RegExp(`width = ${P.PLOT_TILE - 0.6}\\b`), 'fitted to a plot tile');
  assert.ok(P.PLOT_TILE >= 9, 'a machine is big enough to read as one (a 5.4-stud mat was not)');
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
  assert.match(session, /call\.name === 'compose_game' && out\.mutatedProject === true && out\.ok && isPlotSimRequest\([^)]*\)\) \{\s*agent\.composedPlotSim = true;\s*agent\.objectBuilt = true;/);
  const after = session.slice(session.indexOf('const AFTER_OBJECT'), session.indexOf('const AFTER_OBJECT') + 400);
  assert.match(after, /agent\.composedPlotSim \? \['play_check', 'get_output_logs'\]/);
  assert.match(session, /const continueLine = mode === 'agent' && !isPlotSimRequest\(text\) \? continueGameLine\(/);
});

// Live 2026-10-01: the simulator HUD was 400+ instances; Studio refused the create, the old screen was already gone,
// and the game had no screen at all while compose_game said "Built".
test('a create too big for one call is split under the limit, parents first, nothing lost', async () => {
  const runOut = join(mkdtempSync(join(tmpdir(), 'run-')), 'r.mjs');
  execFileSync(join(WORKER, 'node_modules', '.bin', 'esbuild'), [join(WORKER, 'src', 'compose-run.ts'), '--bundle', '--format=esm', '--platform=node', '--outfile=' + runOut, '--external:cloudflare:*'], { cwd: WORKER, stdio: 'pipe' });
  const R = await import(`file://${runOut}`);
  const recipe = P.plotSimRecipe(OWNER, 12345, { hero: 'ASMRKeyboard', library: LIB, hubProps: [], hasComponents: true });
  const hud = P.plotSimSteps(recipe).find((s) => s.kind === 'create' && s.parent === 'game.StarterGui');
  const count = (i) => 1 + (i.children ?? []).reduce((n, c) => n + count(c), 0);
  const total = hud.items.reduce((n, i) => n + count(i), 0);
  assert.ok(total > 400, `the HUD is ${total} instances, the case this guards`);
  const batches = R.createBatches(hud.parent, hud.items);
  assert.ok(batches.length > 1);
  for (const b of batches) assert.ok(b.items.reduce((n, i) => n + count(i), 0) <= R.CREATE_LIMIT, 'a batch over the limit');
  assert.equal(batches.reduce((n, b) => n + b.items.reduce((m, i) => m + count(i), 0), 0), total, 'every instance is made once');
  const made = new Set(['game.StarterGui']);
  for (const b of batches) {
    assert.ok(made.has(b.parent), `${b.parent} is used before it is made`);
    const walk = (parent, i) => { made.add(`${parent}.${i.name}`); for (const c of i.children ?? []) walk(`${parent}.${i.name}`, c); };
    for (const i of b.items) walk(b.parent, i);
  }
  const run = readFileSync(join(WORKER, 'src', 'compose-run.ts'), 'utf8');
  assert.match(run, /if \(s\.parent === 'game\.StarterGui'\) report\.critical\.push/, 'a screen that was not made fails the build');
});

test('the new screen is made before the old one goes, and the composer reads it back', () => {
  const recipe = P.plotSimRecipe(OWNER, 12345, { hero: 'ASMRKeyboard', library: LIB, hubProps: [], hasComponents: true });
  const steps = P.plotSimSteps(recipe);
  const made = steps.findIndex((s) => s.kind === 'create' && s.parent === 'game.StarterGui');
  const gone = steps.findIndex((s) => s.kind === 'delete' && s.paths.includes('game.StarterGui.ASMRKeyboardHUD'));
  assert.ok(made >= 0 && gone > made, 'the old screen goes only after the new one');
  const tool = readFileSync(join(WORKER, 'src', 'compose-tool.ts'), 'utf8');
  assert.match(tool, /op: 'get_instance', path: 'game\.StarterGui\.AppleHUD'/);
});

test('the island gets library scenery off the roads, the plots and the hub; plots are 4x4', () => {
  const recipe = P.plotSimRecipe(OWNER, 12345, { hero: 'ASMRKeyboard', library: LIB, hubProps: [], hasComponents: true });
  recipe.decor = [{ key: 'DecorTree', ref: { game: 't', path: '/Workspace/Tree' }, height: 18, count: 16 }, { key: 'DecorRock', ref: { game: 'r', path: '/Workspace/Rock' }, height: 5, count: 10 }];
  recipe.heroSize = [82, 41];
  const steps = P.plotSimSteps(recipe);
  const trees = steps.filter((s) => s.kind === 'place' && s.from === 'ServerStorage.AppleParts.DecorTree');
  const rocks = steps.filter((s) => s.kind === 'place' && s.from === 'ServerStorage.AppleParts.DecorRock');
  assert.equal(trees.length, 16);
  assert.equal(rocks.length, 10);
  assert.ok(steps.some((s) => s.kind === 'import' && s.key === 'DecorTree'), 'the tree is imported');
  assert.equal(new Set([...trees, ...rocks].map((s) => `${s.at[0]},${s.at[2]}`)).size, 26, 'no two on one spot');
  const map = JSON.stringify(steps.find((s) => s.kind === 'create' && s.parent === 'game.Workspace'));
  assert.equal((map.match(/"name":"Tile\d+"/g) ?? []).length, 4 * 16, '4 plots of 4x4 tiles');
  assert.equal(P.PLOT_TILES, 4);
});

test('a run that ends early after building a game ends on how to play it, and on what the last check found', () => {
  const session = readFileSync(join(WORKER, 'src', 'do', 'session.ts'), 'utf8');
  assert.match(session, /: agent\.composedForUser\s*\?\s*`\$\{agent\.composedForUser\}/);
  assert.match(session, /if \(typeof said === 'string' && said\.trim\(\)\) agent\.composedForUser = said\.trim\(\)/);
  assert.match(session, /agent\.lastCheckProblem = /);
});

// Live play, 2026-10-01 (test 1 rerun): "+0/s" with a machine earning, Rebirth did nothing, the SHOP pad did nothing,
// a SELL stand in a game that sells nothing, and every player spawned on the hub with no idea which plot was theirs.
test('the simulator screen is driven, the pads open panels, and each player starts on their own plot', () => {
  const recipe = P.plotSimRecipe(OWNER, 12345, { hero: 'ASMRKeyboard', library: LIB, hubProps: [], hasComponents: true });
  const steps = P.plotSimSteps(recipe);
  const client = steps.find((s) => s.kind === 'script' && s.name === 'AppleMachinesClient');
  assert.ok(client, 'the machines client is installed');
  assert.equal(client.className, 'LocalScript');
  assert.match(client.source, /GetAttributeChangedSignal\("IncomePerSecond"\)/, '+N/s follows what the machines pay');
  assert.match(client.source, /remote:InvokeServer\(\)/, 'Confirm rebirths');
  assert.match(client.source, /ShopPad = "ShopPanel", SellPad = "RebirthPanel"/, 'the pads open their panels');
  const map = JSON.stringify(steps.find((s) => s.kind === 'create' && s.parent === 'game.Workspace'));
  assert.ok(map.includes('"REBIRTH"') && !map.includes('"SELL"'), 'the second pad says REBIRTH');
  const plots = steps.find((s) => s.kind === 'create' && s.parent === 'game.Workspace').items[0].children.find((c) => c.name === 'Plots').children;
  assert.equal(plots.length, 4);
  for (const p of plots) {
    const spawn = p.children.find((c) => c.name === 'Spawn');
    assert.ok(spawn, `${p.name} has no spawn`);
    assert.equal(spawn.props.Transparency, 1);
    assert.equal(spawn.props.CanCollide, false);
    const frame = p.children.find((c) => c.name === 'Frame');
    const half = frame.props.Size[0] / 2;
    assert.ok(Math.abs(spawn.props.Position[0] - frame.props.Position[0]) < half && Math.abs(spawn.props.Position[2] - frame.props.Position[2]) < half, 'the spawn is on its plot');
  }
  const tool = readFileSync(join(WORKER, 'src', 'compose-tool.ts'), 'utf8');
  assert.doesNotMatch(tool, /libraryModels\(ctx, 'sell'/, 'no sell stand is imported');
});

// Owner's screenshots, 2026-10-01: the Gold Keyboard's icon was the same rainbow as the Classic one, placed keyboards
// were keycaps scattered over five tiles, and the Upgrades panel opened over the Shop.
test('a tier is one colour family, a shop copy is anchored, and one panel shows at a time', () => {
  const boot = readFileSync(join(WORKER, '..', '..', 'packages', 'components', 'boot', 'AppleBoot.luau'), 'utf8');
  assert.match(boot, /p\.Color = Color3\.fromHSV\(s\.hue % 1,/, 'the tier hue is set, not turned');
  assert.doesNotMatch(boot, /\(h \+ s\.hue\) % 1/);
  assert.match(boot, /if p:IsA\("BasePart"\) then p\.Anchored = true end/);
  const client = readFileSync(join(WORKER, '..', '..', 'packages', 'components', 'machines', 'AppleMachinesClient.luau'), 'utf8');
  assert.match(client, /GetPropertyChangedSignal\("Visible"\)[\s\S]{0,300}o\.Visible = false/);
  const gen = readFileSync(join(WORKER, 'src', 'components.generated.ts'), 'utf8');
  assert.ok(gen.includes('local function onePanel') && gen.includes('p.Anchored = true'), 'the bundle is regenerated');
});

test('the clips the server announces are always received (no "invocation queue exhausted" flood)', () => {
  const client = readFileSync(join(WORKER, '..', '..', 'packages', 'components', 'animate', 'AppleAnimateClient.luau'), 'utf8');
  assert.match(client, /WaitForChild\("AppleAnimatePlayed", \d+\)[\s\S]{0,3000}played\.OnClientEvent:Connect/);
  assert.match(readFileSync(join(WORKER, 'src', 'components.generated.ts'), 'utf8'), /AppleAnimatePlayed\\*", 10\)/, 'the bundle is regenerated');
});

test('a library machine is named for what it is', () => {
  const m = P.machineLadder('keyboard', 'ASMRKeyboard', [{ game: 'a', path: '/Workspace/Grand piano' }, { game: 'b', path: '/Workspace/Keyboard' }]);
  assert.deepEqual(m.filter((x) => x.ref).map((x) => x.name), ['Mega Grand Piano', 'Ultra Keyboard']);
});

// Round 4 of test 1 (2026-10-01): the answer said "you spawn in a hub... claim a plot" (each player starts on their own
// plot); the Rebirth panel's bare "x1" read as "a rebirth gives nothing"; a placed keyboard covered three tiles.
test('the composer tells the truth about plots, Rebirth shows what it gives, and staging checks its own fit', () => {
  const tool = readFileSync(join(WORKER, 'src', 'compose-tool.ts'), 'utf8');
  assert.match(tool, /Every player starts on their own plot/);
  assert.doesNotMatch(tool, /`Claim a plot/);
  const client = readFileSync(join(WORKER, '..', '..', 'packages', 'components', 'machines', 'AppleMachinesClient.luau'), 'utf8');
  assert.match(client, /x\(mult\) \.\. "  →  " \.\. x\(nextMult\)/);
  const boot = readFileSync(join(WORKER, '..', '..', 'packages', 'components', 'boot', 'AppleBoot.luau'), 'utf8');
  assert.match(boot, /if measure\(after\) <= want \* 1\.05 then return end/, 'the fit is measured after ScaleTo');
  assert.match(boot, /d\.Size \*= k/, 'and done by hand when ScaleTo left it as it was');
});

// Round 6 of test 1 (2026-10-01): the answer promised a starter keyboard on every plot, and plots started empty.
test('every plot starts with the cheapest machine, and the composer says so', () => {
  const recipe = P.plotSimRecipe(OWNER, 12345, { hero: 'ASMRKeyboard', library: LIB, hubProps: [], hasComponents: true });
  const cfg = P.plotSimSteps(recipe).find((s) => s.kind === 'script' && s.name === 'AppleGameConfig').source;
  assert.match(cfg, new RegExp(`starter = "${recipe.machines[0].id}"`));
  const shop = readFileSync(join(WORKER, '..', '..', 'packages', 'components', 'shop', 'AppleShop.luau'), 'utf8');
  assert.match(shop, /task\.spawn\(giveStarter, player, plot\)/);
  assert.match(shop, /local function giveStarter[\s\S]{0,1500}put\(player, id, item, template, best\)/);
  const tool = readFileSync(join(WORKER, 'src', 'compose-tool.ts'), 'utf8');
  assert.match(tool, /starts on their own plot with a free/);
});

// Round 7 of test 1 (2026-10-01): the model's answer kept saying "you spawn in a hub"; every player starts on their plot.
test('a checked plot simulator is answered with what the composer built and what the check measured', () => {
  const session = readFileSync(join(WORKER, 'src', 'do', 'session.ts'), 'utf8');
  // RESTATED 2026-10-01 (round 8 of test 2): the same ending also answers a built object (composedObject).
  const at = session.search(/if \(\(?agent\.composedPlotSim[^\n]*agent\.composedForUser && agent\.playChecked/);
  assert.ok(at > 0, 'the composed ending exists');
  const end = session.slice(at, at + 600);
  assert.match(end, /!agent\.lastCheckProblem\)/, 'only when the check passed');
  assert.match(end, /agent\.finalText = `\$\{agent\.composedForUser\}\\n\\nI play-tested it: \$\{agent\.lastCheckSeen/);
  assert.match(end, /await this\.finishRun\(agent, 'done'\);\s*return;/, 'no further model call');
  assert.ok(at < session.indexOf('const AFTER_OBJECT'), 'before the next model step is prepared');
});

// Round 9 of test 1 (2026-10-01): bare roads, and the hero's yellow stage stacked on the hub's plaza.
test('lamps line every road off the road itself, and the hero comes down onto the plaza without its stage', () => {
  const recipe = P.plotSimRecipe(OWNER, 12345, { hero: 'ASMRKeyboard', library: LIB, hubProps: [], hasComponents: true });
  recipe.roadside = { key: 'RoadLamp', ref: { game: 'l', path: '/Workspace/Street Light 1' }, height: 12 };
  recipe.heroSize = [82, 41];
  const steps = P.plotSimSteps(recipe);
  const lamps = steps.filter((s) => s.kind === 'place' && s.from === 'ServerStorage.AppleParts.RoadLamp');
  assert.ok(lamps.length >= 8, `${lamps.length} lamps for 4 roads`);
  assert.ok(steps.some((s) => s.kind === 'import' && s.key === 'RoadLamp'));
  const tool = readFileSync(join(WORKER, 'src', 'compose-tool.ts'), 'utf8');
  assert.match(tool, /paths: \[`game\.Workspace\.\$\{recipe\.hero\}`\], move: \[hx - at\[0\], drop, hz - at\[2\]\]/, 'only the hero moves, down onto the plaza');
  assert.match(tool, /delete_instances', paths: \[`game\.Workspace\.\$\{recipe\.hero\}Stage`\]/, 'and its stage goes');
});

// Round 11 of test 1 (2026-10-01): with a Play test running every write was refused, each retried ~12 s, and the build
// ground on for 17 minutes; Stop could not end it.
test('a build Studio refuses because a Play test runs stops at once and tells the user what to do', async () => {
  const runOut = join(mkdtempSync(join(tmpdir(), 'run-')), 'r.mjs');
  execFileSync(join(WORKER, 'node_modules', '.bin', 'esbuild'), [join(WORKER, 'src', 'compose-run.ts'), '--bundle', '--format=esm', '--platform=node', '--outfile=' + runOut, '--external:cloudflare:*', '--log-level=error'], { cwd: WORKER, stdio: 'pipe' });
  const R = await import(`file://${runOut}`);
  let calls = 0;
  const ctx = { execStudioOp: async () => { calls += 1; return { ok: false, error: 'writes require Studio edit mode' }; } };
  const recipe = P.plotSimRecipe(OWNER, 12345, { hero: 'ASMRKeyboard', library: LIB, hubProps: [], hasComponents: true });
  const report = await R.runSteps(ctx, P.plotSimSteps(recipe));
  assert.equal(report.stopped, R.PLAY_TEST_STOP);
  assert.ok(calls <= 2, `${calls} refused writes before it stopped`);
  const session = readFileSync(join(WORKER, 'src', 'do', 'session.ts'), 'utf8');
  assert.match(session, /if \(agent\.endWithComposed && agent\.composedForUser\) \{\s*agent\.finalText = agent\.composedForUser;\s*await this\.finishRun\(agent, 'incomplete'\);/);
});

// Round 11 of test 1 (2026-10-01): a run whose step died with a deploy answered Stop with "stopping" and stayed running.
test('Stop reaches a run that has no step executing in this instance', () => {
  const session = readFileSync(join(WORKER, 'src', 'do', 'session.ts'), 'utf8');
  const hurry = session.slice(session.indexOf('private async hurryStop'), session.indexOf('private async hurryStop') + 900);
  assert.match(hurry, /\|\| !this\.stepInFlight\) \{\s*await this\.ctx\.storage\.setAlarm\(Date\.now\(\)\);/);
  assert.match(session, /this\.stepInFlight = true;\s*try \{\s*try \{ await this\.runStep\(agent\); \} finally \{ this\.stepInFlight = false; \}/);
});

// Round 12 of test 1 (2026-10-01): the free starter went to the far corner of a 36-stud plot, a third of a stud thin.
test('the starter goes on the tile nearest the spawn, and a flat machine stands on a plinth', () => {
  const shop = readFileSync(join(WORKER, '..', '..', 'packages', 'components', 'shop', 'AppleShop.luau'), 'utf8');
  assert.match(shop, /local d = if from then \(tile\.Position - from\)\.Magnitude else 0/);
  assert.match(shop, /if not under and d < bestDist then/, 'never the tile under the spawn');
  const boot = readFileSync(join(WORKER, '..', '..', 'packages', 'components', 'boot', 'AppleBoot.luau'), 'utf8');
  assert.match(boot, /if size\.Y < s\.width \* 0\.25 then[\s\S]{0,200}plinth\.Name = "Plinth"/);
  assert.ok(readFileSync(join(WORKER, 'src', 'components.generated.ts'), 'utf8').includes('PlinthGlow'), 'the bundle is regenerated');
});
