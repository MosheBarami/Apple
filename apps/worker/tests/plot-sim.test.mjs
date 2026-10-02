/**
 * The plot simulator (compose-plotsim.ts): the owner's request, 2026-10-01, "make it actually a fully game with maps
 * different ... more gui a shop machines and plots for 4 players if you find assets its better than generating one from
 * parts", fell through to "build it yourself" because compose_game had one template.
 *
 * RESTATED phase 1 (generalize-not-patch): the harness used to read the subject off a hero object or the request, recolour
 * the hero into "Classic / Neon / Ice / Gold / Lava / Galaxy" tiers with a keyboard emoji, name library models "Mega / Ultra /
 * Royal ...", scatter shops, trees, rocks and street lights it searched for by name, default to "Coins" and a set of tapping
 * upgrades, and delete the Baseplate and the hero's own screen. Now the AGENT supplies the machines (names, prices, incomes and
 * the model behind each), the upgrades, the currency and the scenery it chose; the tool validates the economy's arithmetic,
 * reports a short ladder as short, and touches nothing it was not asked to.
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
const src = (f) => readFileSync(join(WORKER, 'src', f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const comp = (...p) => readFileSync(join(WORKER, '..', '..', 'packages', 'components', ...p), 'utf8');

const GIVEN = {
  title: 'Gadget Sim', subject: 'gadget', currency: 'Gems',
  machines: [
    { name: 'Small Gadget', price: 25, income: 1, look: { gameId: '41f6ce3a6bde', path: '/Workspace/Gadget' } },
    { name: 'Mid Gadget', price: 100, income: 4, look: { gameId: 'f7209fe000d3', path: '/Workspace/Gadget' }, hue: 0.55 },
    { name: 'Big Gadget', price: 500, income: 20, from: 'Workspace.MyGadget', hue: 0.13 },
  ],
  upgrades: [{ label: 'Faster', kind: 'perSecond', amount: 1, cost: 40 }, { label: 'Stronger', kind: 'perPress', amount: 1, cost: 15 }],
};
const read = (over = {}, hasComponents = true) => { const r = P.readPlotSim({ ...GIVEN, ...over }, 12345, hasComponents); assert.ok(!('error' in r), JSON.stringify(r)); return r; };
const recipe = (over = {}) => read(over).recipe;

test('the plot simulator is the agent\'s arguments: machines, upgrades, currency, title, subject, nothing read off a request', () => {
  const r = read();
  assert.equal(r.recipe.title, 'Gadget Sim');
  assert.equal(r.recipe.subject, 'gadget');
  assert.equal(r.recipe.currency, 'Gems');
  assert.deepEqual(r.recipe.machines.map((m) => m.name), ['Small Gadget', 'Mid Gadget', 'Big Gadget']);
  assert.deepEqual(r.recipe.machines.map((m) => m.id), ['M1', 'M2', 'M3'], 'ids are plain ASCII whatever the language of the names');
  assert.equal(r.recipe.machines[2].from, 'Workspace.MyGadget');
  assert.equal(r.recipe.machines[1].hue, 0.55, 'a recolour is a hue the agent gave, not a table of tier colours');
  assert.deepEqual(r.recipe.upgrades.map((u) => u.label), ['Faster', 'Stronger']);
  assert.equal(r.recipe.players, 4);
  assert.deepEqual(r.defaults.sort(), ['players = 4', 'rebirth.cost = 50000', 'rebirth.growth = 3', 'rebirth.multiplier = 0.5'], 'defaults are said, not silent');
  assert.equal(P.isPlotSimRequest, undefined, 'a request classifier does not route');
  assert.equal(P.machineLadder, undefined, 'no ladder is built by the harness');
  assert.equal(P.subjectOf, undefined);
  assert.equal(P.genreWord, undefined);
  assert.equal(P.pieceName, undefined);
  const code = src('compose-plotsim.ts');
  for (const gone of ['TIER_NAMES', 'TIER_HUES', 'TIER_COLOURS', "'Mega'", "'Ultra'", "'Royal'", "currency: 'Coins'", 'DEFAULT_UPGRADES', 'SIM =']) assert.equal(code.includes(gone), false, `${gone} is back`);
});

test('what is missing is reported by name and nothing is filled in', () => {
  assert.ok('error' in P.readPlotSim({}, 1, false));
  const none = P.readPlotSim({}, 1, false);
  for (const want of ['title', 'subject', 'currency']) assert.ok(none.missing.includes(want), `${want} is missing`);
  assert.ok(none.missing.some((m) => /machines/.test(m)) && none.missing.some((m) => /upgrades/.test(m)));
  const noModel = P.readPlotSim({ ...GIVEN, machines: [{ name: 'A', price: 5, income: 1 }] }, 1, false);
  assert.ok(noModel.missing.some((m) => /machines\[0\]\.look .* or machines\[0\]\.from/.test(m)), 'a machine needs a model to stand on the plot');
  const rising = P.readPlotSim({ ...GIVEN, machines: [GIVEN.machines[1], GIVEN.machines[0]] }, 1, false);
  assert.match(rising.error, /machines\[1\]\.price \(25\) must be higher than machines\[0\]\.price \(100\)/);
});

test('the ladder is the agent\'s; only the economy\'s arithmetic is checked, payback is information, and a short ladder is said to be short', () => {
  const m = P.readMachines(GIVEN.machines);
  assert.deepEqual(m.economy.map((e) => e.paybackSeconds), [25, 25, 25]);
  assert.deepEqual(m.notes, [], 'three tiers is not short');
  const two = P.readMachines(GIVEN.machines.slice(0, 2));
  assert.ok(two.notes.some((n) => /a short ladder: 2 machines/.test(n)));
  const one = P.readMachines(GIVEN.machines.slice(0, 1));
  assert.ok(one.notes.some((n) => /a short ladder: 1 machine,/.test(n)));
  const slow = P.readMachines([{ name: 'Slowpoke', price: 100000, income: 1, look: GIVEN.machines[0].look }]);
  assert.ok(slow.notes.some((n) => /very slow tier/.test(n)));
  const free = P.readMachines([{ name: 'Free', price: 1, income: 100, look: GIVEN.machines[0].look }]);
  assert.ok(free.notes.some((n) => /under 2 seconds/.test(n)));
  assert.match(P.readMachines([]).error, /machines is required: 1 to 6/);
  assert.match(P.readMachines(new Array(7).fill(GIVEN.machines[0])).error, /1 to 6/);
  const names = P.readMachines([{ name: 'מכונה גדולה מאוד שאין לה סוף ולא נגמר השם שלה', price: 5, income: 1, look: GIVEN.machines[0].look }]);
  assert.ok(names.notes.some((n) => /cut to 30 characters/.test(n)), 'a cut name is said');
});

test('the steps build a hub with 4 plots, every simulator system, its config and HUD, and keep the place\'s economy', () => {
  const r = recipe();
  r.hubProps = [{ key: 'HubSell', ref: { game: 'abc', path: '/Workspace/SellPoint' }, at: 'sell', height: 10 }];
  const steps = P.plotSimSteps(r);
  const json = JSON.stringify(steps);
  const map = steps.find((s) => s.kind === 'create' && s.parent === 'game.Workspace');
  const plots = JSON.stringify(map).match(/"name":"Plot\d"/g) ?? [];
  assert.equal(new Set(plots).size, 4, '4 plots');
  assert.ok(!steps.some((s) => s.kind === 'create' && s.parent === 'game.ServerScriptService'), 'the economy folder already there is not replaced');
  const scripts = steps.filter((s) => s.kind === 'script').map((s) => s.name);
  for (const n of ['AppleEconomy', 'AppleShop', 'AppleMachines', 'AppleUpgrades', 'AppleAnimate', 'AppleGameUI', 'AppleBoot', 'AppleGameConfig', 'AppleUpgradesConfig']) assert.ok(scripts.includes(n), `${n} missing`);
  const cfg = steps.find((s) => s.kind === 'script' && s.name === 'AppleGameConfig').source;
  assert.match(cfg, /start = \{\s*"AppleShop",\s*"AppleMachines",?\s*\}/);
  assert.match(cfg, /from = "Workspace\.MyGadget"/, 'a model already in the place is staged as a machine when the agent names it');
  assert.match(cfg, /hue = /);
  assert.match(cfg, new RegExp(`width = ${P.PLOT_TILE - 0.6}\\b`), 'fitted to a plot tile');
  assert.ok(P.PLOT_TILE >= 9, 'a machine is big enough to read as one');
  assert.match(cfg, /machines = \{/);
  assert.match(cfg, /rebirth = \{/);
  assert.match(cfg, /currency = "Gems"/);
  const up = steps.find((s) => s.kind === 'script' && s.name === 'AppleUpgradesConfig').source;
  assert.match(up, /screen = "AppleHUD"/);
  assert.match(up, /counter = "Gems"/);
  assert.ok(json.includes('"name":"AppleHUD"'), 'the simulator HUD');
  assert.ok(steps.some((s) => s.kind === 'import' && s.ref.game === '41f6ce3a6bde'), 'library machines are imported');
  assert.ok(steps.some((s) => s.kind === 'place' && s.from === 'ServerStorage.AppleParts.HubSell'), 'the sell stand is placed');
});

test('nothing the agent did not name is deleted, moved or restyled: no Baseplate, no spawn, no Lighting, no screen of another object', () => {
  const steps = P.plotSimSteps(recipe({ hero: 'MyGadget' }));
  assert.equal(steps.some((s) => s.kind === 'delete'), false, 'a composed simulator deletes nothing');
  assert.equal(steps.some((s) => s.kind === 'set' && s.path === 'game.Lighting'), false);
  assert.equal(steps.some((s) => s.kind === 'create' && s.parent === 'game.Lighting'), false);
  const cleared = P.plotSimSteps(recipe({ clearDefaultGround: true }));
  assert.deepEqual(cleared.filter((s) => s.kind === 'delete').map((s) => s.paths), [['game.Workspace.Baseplate', 'game.Workspace.SpawnLocation']], 'only when the agent said the map replaces them');
});

test('a renamed currency is found everywhere: the counter is named for it, the client config and the upgrades config carry it, no "$" is written', () => {
  const steps = P.plotSimSteps(recipe({ currency: 'מטבעות', symbol: '' }));
  const hud = steps.find((s) => s.kind === 'create' && s.parent === 'game.StarterGui').items[0];
  assert.ok(hud.children.some((c) => c.name === 'מטבעות'), 'the money counter is named for the currency');
  assert.equal(hud.children.some((c) => c.name === 'Coins'), false);
  const client = steps.find((s) => s.kind === 'script' && s.name === 'AppleClientConfig').source;
  assert.match(client, /currency = "מטבעות"/);
  assert.match(client, /counter = "מטבעות"/);
  const written = steps.filter((s) => s.kind === 'create' || (s.kind === 'script' && /Config$/.test(s.name)));
  assert.equal(JSON.stringify(written).includes('$'), false);
  const symbolled = P.plotSimSteps(recipe({ symbol: '$' }));
  assert.match(symbolled.find((s) => s.kind === 'script' && s.name === 'AppleClientConfig').source, /symbol = "\$"/, 'a symbol only when the agent gave one');
  // The Luau side reads the same names: AppleGameUI by the client config's counter, AppleMachinesClient too, the upgrades by its own.
  assert.match(comp('gameui', 'AppleGameUI.luau'), /local counterName: string = cfg\.counter or "Coins"/);
  assert.match(comp('gameui', 'AppleGameUI.luau'), /find\(counterName \.\. "\.Value"\)/);
  assert.match(comp('machines', 'AppleMachinesClient.luau'), /screen:FindFirstChild\(counterName\)/);
  assert.match(comp('machines', 'AppleMachinesClient.luau'), /\(cfg :: any\)\.counter/);
  assert.match(comp('upgrades', 'AppleUpgradesClient.luau'), /find\(screen, config\.counter or currency\)/);
  assert.equal(/"\$"/.test(comp('gameui', 'AppleGameUI.luau').replace(/--.*$/gm, '')), false, 'no built-in dollar sign in the game UI');
});

test('scenery is what the agent chose from the library: scatter, roadside, shop and hub pieces, off the roads, the plots and the hub; plots are 4x4', () => {
  const s = P.readScenery([
    { look: { gameId: 'aabbccdd1122', path: '/Workspace/Plant' }, kind: 'scatter', height: 18, count: 16 },
    { look: { gameId: 'aabbccdd1133', path: '/Workspace/Stone' }, kind: 'scatter', height: 5, count: 10 },
    { look: { gameId: 'aabbccdd1144', path: '/Workspace/Post' }, kind: 'roadside', height: 12 },
    { look: { gameId: 'aabbccdd1155', path: '/Workspace/Stall' }, kind: 'shop', height: 12 },
    { kind: 'scatter' }, 'x',
  ]);
  assert.equal(s.decor.length, 2); assert.ok(s.roadside); assert.equal(s.hubProps.length, 1);
  assert.equal(s.notes.length, 2, 'a piece with no look is skipped and said');
  const r = recipe();
  r.decor = s.decor; r.roadside = s.roadside; r.hubProps = s.hubProps;
  r.heroSize = [82, 41];
  const steps = P.plotSimSteps(r);
  const a = steps.filter((x) => x.kind === 'place' && x.from === `ServerStorage.AppleParts.${s.decor[0].key}`);
  const b = steps.filter((x) => x.kind === 'place' && x.from === `ServerStorage.AppleParts.${s.decor[1].key}`);
  assert.equal(a.length, 16);
  assert.equal(b.length, 10);
  assert.equal(new Set([...a, ...b].map((x) => `${x.at[0]},${x.at[2]}`)).size, 26, 'no two on one spot');
  const lamps = steps.filter((x) => x.kind === 'place' && x.from === `ServerStorage.AppleParts.${s.roadside.key}`);
  assert.ok(lamps.length >= 8, `${lamps.length} pieces along 4 roads`);
  const map = JSON.stringify(steps.find((x) => x.kind === 'create' && x.parent === 'game.Workspace'));
  assert.equal((map.match(/"name":"Tile\d+"/g) ?? []).length, 4 * 16, '4 plots of 4x4 tiles');
  assert.equal(P.PLOT_TILES, 4);
  const tool = src('compose-tool.ts');
  assert.equal(/libraryModels|streetLight|subjectModels|lookFor|\bKIN\b|\bTHINGS\b|query_owner_library/.test(tool), false, 'the tool searches for no scenery or look of its own');
});

test('the hero is the agent\'s naming: measured so the hub holds it, moved onto the hub, and its own stage and screen are left alone', () => {
  const tool = src('compose-tool.ts');
  assert.match(tool, /hb = await bounds\(ctx\.execStudioOp, `game\.Workspace\.\$\{recipe\.hero\}`\)/);
  assert.match(tool, /paths: \[`game\.Workspace\.\$\{recipe\.hero\}`\], move: \[hx - hb\.center\[0\], 0\.8 - hb\.bottomY, hz - hb\.center\[2\]\]/, 'only the hero moves, onto the plaza');
  assert.equal(/delete_instances', paths: \[`game\.Workspace\.\$\{recipe\.hero\}Stage`\]/.test(tool), false, 'its stage is not deleted');
  assert.equal(/HUDScript|HUD`\]/.test(src('compose-plotsim.ts')), false, 'its own screen is not deleted');
  assert.equal(P.readPlotSim({ ...GIVEN, hero: 'game.Workspace.MyGadget' }, 1, false).recipe.hero, 'MyGadget');
  assert.equal(P.readPlotSim({ ...GIVEN }, 1, false).recipe.hero, undefined, 'a hero is never found by the harness');
  assert.equal(src('compose-tool.ts').includes('readPlace'), false);
});

test('compose_game is offered, never forced: no template guess from the request words decides the first tool', () => {
  const session = readFileSync(join(WORKER, 'src', 'do', 'session.ts'), 'utf8');
  assert.doesNotMatch(session, /composeFirst|ideaRecipe/, 'phase 1: the run starts with the model, which chooses compose_game when the idea calls for it');
});

// The owner's 93-step run (2026-10-01, 274 credits): compose_game ran, then the model rebuilt plots and screens by hand
// with 24 build_object calls and 49 tree reads. A built plot simulator is played once and answered.
test('a composed plot simulator ends the run at play-and-answer, narrows nothing, and a game already in the project does not refuse it', () => {
  const session = readFileSync(join(WORKER, 'src', 'do', 'session.ts'), 'utf8');
  // The composer says which template it made; the request's words decide nothing (phase 1).
  assert.match(session, /call\.name === 'compose_game' && out\.mutatedProject === true && out\.ok && \['plot-sim', 'tycoon'\]\.includes\([^\n]*\) \{\s*agent\.composedPlotSim = true;/);
  assert.doesNotMatch(session, /AFTER_OBJECT|objectBuilt/, 'no tool narrowing after a build');
  assert.doesNotMatch(session, /continueGameLine|refuseRebuild|BuiltGameRecord|continuesGame/, 'a rebuild is never refused by the harness');
});

// Live 2026-10-01: the simulator HUD was 400+ instances; Studio refused the create, the old screen was already gone,
// and the game had no screen at all while compose_game said "Built".
test('a create too big for one call is split under the limit, parents first, nothing lost', async () => {
  const runOut = join(mkdtempSync(join(tmpdir(), 'run-')), 'r.mjs');
  execFileSync(join(WORKER, 'node_modules', '.bin', 'esbuild'), [join(WORKER, 'src', 'compose-run.ts'), '--bundle', '--format=esm', '--platform=node', '--outfile=' + runOut, '--external:cloudflare:*'], { cwd: WORKER, stdio: 'pipe' });
  const R = await import(`file://${runOut}`);
  const machines = Array.from({ length: 6 }, (_, i) => ({ name: `Gadget ${i + 1}`, price: 10 * 5 ** i, income: 1 + i, look: GIVEN.machines[0].look }));
  const upgrades = Array.from({ length: 6 }, (_, i) => ({ label: `Upgrade ${i + 1}`, kind: 'perSecond', amount: 1, cost: 10 + i }));
  const hud = P.plotSimSteps(recipe({ machines, upgrades })).find((s) => s.kind === 'create' && s.parent === 'game.StarterGui');
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

test('the composer reads the screen back before it says "built"', () => {
  const tool = readFileSync(join(WORKER, 'src', 'compose-tool.ts'), 'utf8');
  assert.match(tool, /op: 'get_instance', path: 'game\.StarterGui\.AppleHUD'/);
  assert.match(tool, /the game's screen is not in StarterGui/);
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
  const steps = P.plotSimSteps(recipe());
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
});

// Owner's screenshots, 2026-10-01: placed machines were parts scattered over five tiles, and the Upgrades panel opened over the Shop.
test('a tier is one colour family, a shop copy is anchored, and one panel shows at a time', () => {
  const boot = comp('boot', 'AppleBoot.luau');
  assert.match(boot, /p\.Color = Color3\.fromHSV\(s\.hue % 1,/, 'the tier hue is set, not turned');
  assert.doesNotMatch(boot, /\(h \+ s\.hue\) % 1/);
  assert.match(boot, /if p:IsA\("BasePart"\) then p\.Anchored = true end/);
  assert.match(comp('machines', 'AppleMachinesClient.luau'), /GetPropertyChangedSignal\("Visible"\)[\s\S]{0,300}o\.Visible = false/);
  const gen = readFileSync(join(WORKER, 'src', 'components.generated.ts'), 'utf8');
  assert.ok(gen.includes('local function onePanel') && gen.includes('p.Anchored = true'), 'the bundle is regenerated');
});

test('the clips the server announces are always received (no "invocation queue exhausted" flood)', () => {
  const client = comp('animate', 'AppleAnimateClient.luau');
  assert.match(client, /WaitForChild\("AppleAnimatePlayed", \d+\)[\s\S]{0,3000}played\.OnClientEvent:Connect/);
  assert.match(readFileSync(join(WORKER, 'src', 'components.generated.ts'), 'utf8'), /AppleAnimatePlayed\\*", 10\)/, 'the bundle is regenerated');
});

// Round 4 of test 1 (2026-10-01): the answer said "you spawn in a hub... claim a plot" (each player starts on their own
// plot); the Rebirth panel's bare "x1" read as "a rebirth gives nothing"; a placed machine covered three tiles.
test('the composer tells the truth about plots, Rebirth shows what it gives, and staging checks its own fit', () => {
  const tool = readFileSync(join(WORKER, 'src', 'compose-tool.ts'), 'utf8');
  assert.match(tool, /Every player starts on their own plot/);
  assert.doesNotMatch(tool, /`Claim a plot/);
  assert.match(comp('machines', 'AppleMachinesClient.luau'), /x\(mult\) \.\. "  →  " \.\. x\(nextMult\)/);
  const boot = comp('boot', 'AppleBoot.luau');
  assert.match(boot, /if measure\(after\) <= want \* 1\.05 then return end/, 'the fit is measured after ScaleTo');
  assert.match(boot, /d\.Size \*= k/, 'and done by hand when ScaleTo left it as it was');
});

// Round 6 of test 1 (2026-10-01): the answer promised a starter machine on every plot, and plots started empty.
test('every plot starts with the cheapest machine, and the composer says so', () => {
  const r = recipe();
  const cfg = P.plotSimSteps(r).find((s) => s.kind === 'script' && s.name === 'AppleGameConfig').source;
  assert.match(cfg, new RegExp(`starter = "${r.machines[0].id}"`));
  const shop = comp('shop', 'AppleShop.luau');
  assert.match(shop, /task\.spawn\(giveStarter, player, plot\)/);
  assert.match(shop, /local function giveStarter[\s\S]{0,1500}put\(player, id, item, template, best\)/);
  const tool = readFileSync(join(WORKER, 'src', 'compose-tool.ts'), 'utf8');
  assert.match(tool, /starts on their own plot with a free/);
});

// Round 7 of test 1 (2026-10-01): the model's answer kept saying "you spawn in a hub"; every player starts on their plot.
test('a checked plot simulator is answered with what the composer built and what the check measured', () => {
  const session = readFileSync(join(WORKER, 'src', 'do', 'session.ts'), 'utf8');
  const at = session.search(/if \(\(?agent\.composedPlotSim[^\n]*agent\.composedForUser && agent\.playChecked/);
  assert.ok(at > 0, 'the composed ending exists');
  const end = session.slice(at, at + 600);
  assert.match(end, /!agent\.lastCheckProblem\)/, 'only when the check passed');
  assert.match(end, /agent\.finalText = `\$\{agent\.composedForUser\}\\n\\nI play-tested it: \$\{agent\.lastCheckSeen/);
  assert.match(end, /await this\.finishRun\(agent, 'done'\);\s*return;/, 'no further model call');
  assert.ok(at < session.indexOf('const focusedAllowed'), 'before the next model step is prepared');
});

// Round 11 of test 1 (2026-10-01): with a Play test running every write was refused, each retried ~12 s, and the build
// ground on for 17 minutes; Stop could not end it.
test('a build Studio refuses because a Play test runs stops at once and tells the user what to do', async () => {
  const runOut = join(mkdtempSync(join(tmpdir(), 'run-')), 'r.mjs');
  execFileSync(join(WORKER, 'node_modules', '.bin', 'esbuild'), [join(WORKER, 'src', 'compose-run.ts'), '--bundle', '--format=esm', '--platform=node', '--outfile=' + runOut, '--external:cloudflare:*', '--log-level=error'], { cwd: WORKER, stdio: 'pipe' });
  const R = await import(`file://${runOut}`);
  let calls = 0;
  const ctx = { execStudioOp: async () => { calls += 1; return { ok: false, error: 'writes require Studio edit mode' }; } };
  const report = await R.runSteps(ctx, P.plotSimSteps(recipe()));
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
  const shop = comp('shop', 'AppleShop.luau');
  assert.match(shop, /local d = if from then \(tile\.Position - from\)\.Magnitude else 0/);
  assert.match(shop, /if not under and d < bestDist then/, 'never the tile under the spawn');
  const boot = comp('boot', 'AppleBoot.luau');
  assert.match(boot, /if size\.Y < s\.width \* 0\.25 then[\s\S]{0,200}plinth\.Name = "Plinth"/);
  assert.ok(readFileSync(join(WORKER, 'src', 'components.generated.ts'), 'utf8').includes('PlinthGlow'), 'the bundle is regenerated');
});
