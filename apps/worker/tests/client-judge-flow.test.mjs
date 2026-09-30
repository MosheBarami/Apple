// judge_game end to end against the stand-in Studio (fixtures/fake-studio.mjs): the whole place is read, the game is "played" in
// at most three sessions whose reports the test scripts, and seven questions come back. The worlds are in fixtures/judge-world.mjs:
// a finished garden game a client would accept, and the same game as the owner saw it fail.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { fakeStudio } from './fixtures/fake-studio.mjs';
import * as W from './fixtures/judge-world.mjs';

const esbuild = await import(process.env.APPLE_TEST_ESBUILD || 'esbuild');
const dir = mkdtempSync(join(tmpdir(), 'client-judge-flow-'));
test.after(() => rmSync(dir, { recursive: true, force: true }));
const alias = { '@golem/shared': '../../packages/shared/src/index.ts' };
const load = async (name) => {
  await esbuild.build({ entryPoints: [`src/${name}.ts`], bundle: true, format: 'esm', platform: 'node', outfile: join(dir, `${name}.mjs`), alias });
  return import(pathToFileURL(join(dir, `${name}.mjs`)).href);
};
const J = await load('client-judge');
const T = await load('tools');
const C = await load('plugin-capabilities');

/** The op channel the tools use: a failed op is `{error}`, a good one its data. */
const channel = (f) => (op, ms) => f.ctx.execStudioOp(op, ms).then((r) => (r.ok ? r.data ?? { ok: true } : { error: r.error }));
const judge = (f, args = {}, opts) => J.judgeGame(channel(f), { request: 'a grow a garden game', ...args }, opts);
const crit = (res, id) => res.criteria.find((c) => c.id === id);
const READS = new Set(['get_tree', 'query_instances', 'spatial_query', 'dump_scripts', 'ui_layout_check', 'query_owner_library', 'play_check', 'play_check_ui']);

test('a finished garden game is ready: every question a client asks is a yes, from the place and from three short sessions', async () => {
  const { f } = W.goodGarden({ studio: { play: W.gardenPlay() } });
  const res = await judge(f);
  assert.equal(res.verdict, 'ready', JSON.stringify(res.criteria.filter((c) => !c.ok).map((c) => [c.id, c.evidence])));
  assert.ok(res.score >= 80 && res.score <= 100);
  assert.deepEqual(res.criteria.map((c) => c.id), ['placeholders', 'ui_coherence', 'buttons_work', 'progression', 'errors', 'construction', 'fit_uniqueness']);
  for (const c of res.criteria) assert.deepEqual([c.ok, c.measured, typeof c.fix, Array.isArray(c.evidence), c.evidence.length > 0], [true, true, 'string', true, true], c.id);
  assert.deepEqual(res.fixes, []);
  assert.match(res.forUser, /^Your game passed every check a player would notice/);
  assert.match(res.next, /^The game is ready\. Answer the user now[\s\S]*run no further checks/, 'ready ends the flow: the answer comes next');
  assert.doesNotMatch(JSON.stringify(res.notVerified), /inspect_visually/, 'no further check is asked for');
  assert.equal('plain' in res.criteria[0], false, 'the plain sentences are for forUser, not part of the criteria');

  // The loop that was seen is in the evidence: the walk paid, the shop sold.
  const loop = crit(res, 'progression').evidence.join('\n');
  assert.match(loop, /Moved by walking onto Coin\d: Cash 20 -> 26/);
  assert.match(loop, /Moved by pressing "Buy Seed \$10": .*Cash 20 -> 10/);
  assert.match(loop, /Seeds none -> 1/);

  // Nothing in the place changed; only reads and the play sessions were asked, three at most.
  assert.ok(f.log.every((op) => READS.has(op.op)), [...new Set(f.log.map((op) => op.op))].join());
  const sessions = f.log.filter((op) => op.op === 'play_check_ui' || op.op === 'play_check');
  assert.equal(sessions.length, 3);
  assert.deepEqual(res.sessions.map((s) => [s.index, s.observed]), [[1, true], [2, true], [3, true]]);
  assert.deepEqual(sessions.map((s) => s.seconds), [15, 4, 4], 'a long first wait shows passive income; the others only need the clicks');
  assert.ok(sessions.every((s) => (s.press ?? []).length <= 5 && (s.touch ?? []).length <= 5));
  assert.ok(sessions[0].touch === undefined, 'the first session only stands and presses, so its stats show income by itself');
  assert.ok(sessions[1].touch.length >= 1 && sessions[1].press.length >= 1, 'the second walks onto the coins BEFORE it presses the collectors');
  assert.deepEqual(sessions[2].press.slice(-2), ['game.StarterGui.HUD.Menu.ShopButton', 'game.StarterGui.ShopGui.Panel.BuySeed'], 'the third opens the shop and buys');
  assert.ok(f.log.findIndex((op) => op.op === 'play_check_ui') > f.log.findIndex((op) => op.op === 'dump_scripts'), 'the place is read before it is played');
});

test('a screen whose every window stays shut (a left-out feature kept for its code) shows no look, so it cannot clash with the HUD', async () => {
  const { f } = W.goodGarden({ studio: { play: W.gardenPlay() } });
  const kept = W.screen(f, 'SiblingZIndex', { look: W.LOOK.pets });
  const deck = kept.frame('DeckCreator', { visible: false, pos: [0.2, 0, 0.2, 0], size: [0.6, 0, 0.6, 0] });
  for (const t of ['Cards', 'Merge', 'Equip', 'Pack']) kept.put(deck, t, 'TextButton', { text: t, size: [0.2, 0, 0.1, 0] });
  const res = await judge(f);
  assert.doesNotMatch(crit(res, 'ui_coherence').evidence.join('\n'), /Looks like two different games/);
  assert.equal(crit(res, 'ui_coherence').ok, true);
});

test('a layout problem counts only where a player can see it: not inside a piece the build took out of sight', async () => {
  const issue = (path) => ({ kind: 'text_overflow', path, detail: 'its text does not fit its box' });
  const layout = { 'game.StarterGui.HUD': { screen: 'game.StarterGui.HUD', devices: [{ device: 'desktop', size: [1920, 1080], elements: 9, issues: [issue('game.StarterGui.HUD.Timer.Time')] }], issues: 1, verdict: 'fail' } };
  const { f, hud } = W.goodGarden({ studio: { play: W.gardenPlay(), layout } });
  const timer = hud.frame('Timer', { pos: [0.8, 0, 0.3, 0], size: [0.1, 0, 0.05, 0] });
  hud.put(timer, 'Time', 'TextLabel', { text: 'Next attack in 00:59' });
  assert.match(crit(await judge(f), 'ui_coherence').evidence.join('\n'), /Layout text overflow/, 'on screen, it counts');
  f.world.nodes.get(timer).attrs.AppleHidden = true;
  f.world.nodes.get(timer).props.Visible = { t: 'bool', v: false };
  assert.doesNotMatch(crit(await judge(f), 'ui_coherence').evidence.join('\n'), /Layout text overflow/);
});

test('what the build took out of sight (tagged AppleHidden) is not what a player reads: its old branding does not count', async () => {
  const { f, hud } = W.goodGarden({ studio: { play: W.gardenPlay() } });
  const reward = hud.frame('GroupReward', { visible: false, pos: [0.3, 0, 0.3, 0], size: [0.4, 0, 0.4, 0] });
  hud.put(reward, 'Title', 'TextLabel', { text: '1. Like the game 👍 2. Join the group' });
  const plain = await judge(f);
  assert.match(crit(plain, 'fit_uniqueness').evidence.join('\n'), /Like the game/, 'a window that is only shut still counts: a script may open it');
  f.world.nodes.get(reward).attrs.AppleHidden = true;
  const tagged = await judge(f);
  assert.doesNotMatch(crit(tagged, 'fit_uniqueness').evidence.join('\n'), /Like the game/);
});

test('the game as the owner saw it fail is not ready, and each defect he named comes back as its own finding with a fix', async () => {
  const names = { aaaa11111111: 'Grow A Garden', bbbb22222222: 'Full Pet System' };
  const f = fakeStudio({
    workspace: ['Baseplate', 'SpawnLocation'], game: (op) => ({ name: names[op.id] ?? 'Game' }),
    play: (op) => W.report({
      before: [{ name: 'Cash', value: 0 }, { name: 'Coins', value: 0 }], after: [{ name: 'Cash', value: 0 }, { name: 'Coins', value: 0 }],
      screens: [{ name: 'HUD', enabled: true, labels: [{ name: 'Load', class: 'TextLabel', text: 'loading name...', visible: true }] }],
      clientErrors: [{ message: 'PetsGui.Client:12: attempt to index nil with Value', source: 'game.StarterGui.PetsGui.Client' }],
      clientWarnings: [{ message: "Infinite yield possible on 'ReplicatedStorage:WaitForChild(\"PetEvents\")'" }],
      presses: (op.press ?? []).map((p) => W.press(p, { activated: false, changes: [] })),
    }),
  });
  const hud = W.screen(f, 'HUD', { tag: 'aaaa11111111' });
  hud.label('Cash', { text: '$299,999', pos: [0.02, 0, 0.02, 0], size: [0.18, 0, 0.06, 0] });
  hud.label('Load', { text: 'loading name...', pos: [0.4, 0, 0.02, 0], size: [0.2, 0, 0.05, 0] });
  const menu = hud.frame('Menu', { pos: [0.01, 0, 0.35, 0], size: [0.09, 0, 0.3, 0], bgT: 1 });
  for (const t of ['Shop', 'Seeds', 'Index']) hud.put(menu, t + 'Button', 'TextButton', { text: t, size: [1, 0, 0.3, 0] });
  hud.put(hud.frame('Sign', { pos: [0.4, 0, 0.8, 0], size: [0.3, 0, 0.1, 0] }), 'Hint', 'TextLabel', { text: 'Para correr apretá Shift [borrar este cartel]', size: [1, 0, 1, 0] });
  const pets = W.screen(f, 'PetsGui', { tag: 'bbbb22222222', look: W.LOOK.pets });
  const pm = pets.frame('Menu', { pos: [0.01, 0, 0.33, 0], size: [0.09, 0, 0.32, 0], bgT: 1 });
  for (const t of ['Pets', 'Eggs', 'Hatch', 'Trade']) pets.put(pm, t, 'TextButton', { text: t, size: [1, 0, 0.25, 0] });
  pets.label('Title', { text: 'Full Pet System', pos: [0.3, 0, 0.05, 0], size: [0.4, 0, 0.08, 0] });
  W.screen(f, 'AdminPanel').label('T', { text: 'Admin Commands', pos: [0.6, 0, 0.1, 0], size: [0.3, 0, 0.1, 0] });
  f.world.add('game.Workspace.Tree', { class: 'Model', center: [30, 30, 30], size: [4, 8, 4] });
  f.world.add('game.ServerScriptService.Store', { class: 'Script', source: 'MarketplaceService:PromptGamePassPurchase(player, 1234567)' });
  f.world.add('game.ServerScriptService.Duels Machine', { class: 'Script', source: '' });

  const res = await judge(f);
  assert.equal(res.verdict, 'not ready');
  assert.match(res.next, /^Fix what fixes lists/);
  assert.ok(res.score <= 79, `not ready caps the score: ${res.score}`);
  assert.ok(res.criteria.every((c) => c.measured && !c.ok), res.criteria.filter((c) => c.ok).map((c) => c.id).join());
  const ev = (id) => crit(res, id).evidence.join('\n');
  // 1. placeholders, the owner's own examples
  assert.match(ev('placeholders'), /made-up number: "\$299,999"/);
  assert.match(ev('placeholders'), /developer note \+ other language: "Para correr apretá Shift \[borrar este cartel\]" in HUD\.Sign\.Hint/);
  assert.match(ev('placeholders'), /stuck "loading": "loading name\.\.\." in HUD\.Load/);
  assert.match(ev('placeholders'), /Robux products that are not yours \(1\): 1234567/);
  // 2. a pet system's buttons over the HUD, two looks
  assert.match(ev('ui_coherence'), /Screens on top of each other: HUD\.Menu and PetsGui\.Menu/);
  assert.match(ev('ui_coherence'), /Two sets of left-edge menu buttons: HUD \(from "Grow A Garden"\).*PetsGui \(from "Full Pet System"\)/);
  assert.match(ev('ui_coherence'), /Looks like two different games/);
  // 3-5. nothing works, nothing to earn, errors
  assert.match(ev('buttons_work'), /Does nothing: "Shop"/);
  assert.match(ev('progression'), /Nothing the player earned moved/);
  assert.match(ev('errors'), /client error: PetsGui\.Client:12: attempt to index nil/);
  assert.match(ev('errors'), /waits forever for something that is not there: ReplicatedStorage:WaitForChild\("PetEvents"\)/);
  // 6. construction
  assert.match(ev('construction'), /Tree floats 26 studs above the ground/);
  // 7. "adding a pets UI to a grow a garden game is simply foolish"
  assert.match(ev('fit_uniqueness'), /a pet and egg system is in the game \(.*PetsGui.*\) but the request for a garden or farming game does not call for it/);
  assert.match(ev('fit_uniqueness'), /an admin or commands panel is in the game/);
  assert.match(ev('fit_uniqueness'), /a duels or battle arena is in the game \(Duels Machine in ServerScriptService\)/);
  assert.match(ev('fit_uniqueness'), /two currencies doing the same job: Cash and Coins/);
  assert.match(ev('fit_uniqueness'), /names the source game "Full Pet System"/);
  // The fixes: removing what does not belong comes first.
  assert.deepEqual(res.fixes.map((x) => x.split(':')[0]), ['fit_uniqueness', 'errors', 'construction', 'progression', 'buttons_work', 'ui_coherence', 'placeholders']);
  assert.match(res.forUser, /not ready/);
  assert.match(res.forUser, /pet and egg system/);
  assert.doesNotMatch(res.forUser, /game\.|_|play_check|\d{5,}/, 'plain words only');
  assert.ok(res.forUser.split(/(?<=\.)\s+/).length <= 4);
});

test('each question fails on its own: dead buttons, nothing to earn, nothing to buy', async () => {
  const failing = async (over) => {
    const res = await judge(W.goodGarden({ studio: { play: W.gardenPlay(over) } }).f);
    return { res, failed: res.criteria.filter((c) => !c.ok).map((c) => c.id) };
  };
  const dead = await failing({ deadButtons: true });
  assert.equal(dead.res.verdict, 'not ready');
  assert.deepEqual(dead.failed, ['buttons_work', 'progression'], 'buttons that never fire cannot collect or buy either');
  assert.match(crit(dead.res, 'buttons_work').evidence.join('\n'), /Does nothing: "(Shop|Seeds|Index|Collect)"/);

  const frozen = await failing({ noEarning: true });
  assert.deepEqual(frozen.failed, ['progression'], 'every button answers, but no number ever moves');
  assert.match(crit(frozen.res, 'progression').evidence.join('\n'), /Nothing the player earned moved in ~25 s of play \(stats: Cash; counters: HUD\.Cash\)/);
  assert.match(frozen.res.forUser, /In the test nothing could be earned, so the game looks like a place to walk around/);

  const nothingToBuy = await failing({ noSpending: true });
  assert.deepEqual(nothingToBuy.failed, ['progression']);
  assert.match(crit(nothingToBuy.res, 'progression').evidence.join('\n'), /Earning works, but pressing \d+ buy\/upgrade buttons? after earning took no money/);
  assert.match(nothingToBuy.res.forUser, /can earn, but I could not see anything they can spend it on/);
});

test('sessions: 0 reads without playing; buttons, progression and errors are not observed, and the verdict cannot be ready', async () => {
  const { f } = W.goodGarden({ studio: { play: W.gardenPlay() } });
  const res = await judge(f, { sessions: 0 });
  assert.equal(res.verdict, 'not ready');
  assert.equal(f.world.sessions, 0);
  assert.equal(f.log.filter((op) => op.op.startsWith('play_check')).length, 0);
  for (const id of ['buttons_work', 'progression', 'errors']) assert.deepEqual([crit(res, id).ok, crit(res, id).measured], [false, false], id);
  assert.match(crit(res, 'errors').evidence[0], /^NOT OBSERVED: no play session was run/);
  for (const id of ['placeholders', 'ui_coherence', 'construction', 'fit_uniqueness']) assert.equal(crit(res, id).measured, true, id);
  assert.match(res.forUser, /I could not finish testing this game, so I cannot say it is ready\. I could not test some parts/);
  assert.ok(res.notVerified.some((x) => /sessions: 0/.test(x)));
  assert.ok(res.fixes.some((x) => x.startsWith('errors: NOT OBSERVED')));
});

test('a refused play session is one attempt, not a retry storm: the criteria that needed it say NOT OBSERVED', async () => {
  const { f } = W.goodGarden({ studio: { play: () => new Error('Studio is already in a test session') } });
  const res = await judge(f);
  assert.equal(f.world.sessions, 1, 'the second and third are not attempted after the first is refused');
  assert.equal(res.verdict, 'not ready');
  assert.deepEqual(res.sessions.map((s) => [s.index, s.observed]), [[1, false]]);
  assert.match(res.sessions[0].note, /already in a test session/);
  assert.match(crit(res, 'progression').evidence[0], /^NOT OBSERVED: no play session ran \(Studio is already in a test session\)/);
  assert.ok(res.notVerified.some((x) => /A play session could not run/.test(x)));
});

test('a session whose player never spawned observes nothing: not measured, never a pass', async () => {
  const { f } = W.goodGarden({ studio: { play: () => ({ ...W.report(), playerJoined: true, characterSpawned: false, clientReported: false, stage: 'no_character' }) } });
  const res = await judge(f);
  assert.equal(res.verdict, 'not ready');
  assert.equal(res.sessions[0].observed, false);
  assert.match(res.sessions[0].note, /no_character/);
  for (const id of ['progression', 'errors']) assert.equal(crit(res, id).measured, false, id);
});

test('a game with dozens of buttons is judged in three sessions of five presses, each button pressed once', async () => {
  const f = fakeStudio({ workspace: ['Baseplate', 'SpawnLocation'], play: (op) => W.report({ presses: (op.press ?? []).map((p) => W.press(p)) }) });
  const hud = W.screen(f, 'HUD');
  hud.label('Cash', { text: '$0', size: [0.1, 0, 0.05, 0] });
  const grid = hud.frame('Grid', { size: [0.5, 0, 0.5, 0] });
  for (let i = 0; i < 40; i++) hud.put(grid, 'B' + i, 'TextButton', { text: 'Item ' + i, pos: [0, 0, 0, 0], size: [0.1, 0, 0.1, 0] });
  const res = await judge(f);
  const sessions = f.log.filter((op) => op.op === 'play_check_ui');
  assert.equal(sessions.length, 3);
  assert.ok(sessions.every((s) => s.press.length === 5));
  const pressed = sessions.flatMap((s) => s.press);
  assert.equal(new Set(pressed).size, pressed.length, 'no button twice');
  assert.match(crit(res, 'buttons_work').evidence.join('\n'), /Sampled: 40 testable buttons, at most 15 can be pressed in 3 sessions/);
});

test('buttons in a window the game keeps closed are not pressed after the first session has shown it is closed', async () => {
  const widgets = [{ gui: 'Popup', name: 'Box', visible: false }, { gui: 'HUD', name: 'Menu', visible: true }];
  const play = (op) => ({ ...W.report({ presses: (op.press ?? []).map((p) => W.press(p)) }), hud: { first: null, afterWait: null, afterPresses: null, widgets } });
  const f = fakeStudio({ workspace: ['Baseplate', 'SpawnLocation'], play });
  const hud = W.screen(f, 'HUD');
  const menu = hud.frame('Menu', { pos: [0.01, 0, 0.35, 0], size: [0.09, 0, 0.3, 0], bgT: 1 });
  for (const t of ['Index', 'Settings']) hud.put(menu, t, 'TextButton', { text: t, size: [1, 0, 0.3, 0] });
  const popup = W.screen(f, 'Popup');
  const box = popup.frame('Box', { pos: [0.3, 0, 0.3, 0], size: [0.3, 0, 0.3, 0] });
  for (let i = 1; i <= 8; i++) popup.put(box, 'Buy' + i, 'TextButton', { text: 'Buy ' + i, size: [0.1, 0, 0.1, 0] });
  const res = await judge(f);
  const pressed = f.ops('play_check_ui').flatMap((o) => o.press);
  assert.deepEqual(pressed.filter((p) => /Buy/.test(p)), [], 'the box was closed when the first session looked, so no later session spends a press on it');
  assert.ok(pressed.length >= 2, 'the buttons that can be reached were pressed');
  assert.equal(crit(res, 'buttons_work').evidence.some((e) => /Not on the player's screen at play time/.test(e)), false);
});

test('the time budget is honoured: a judge that has run out of time plays nothing and says so', async () => {
  const { f } = W.goodGarden({ studio: { play: W.gardenPlay() } });
  let t = 0;
  const res = await judge(f, {}, { now: () => (t += 60_000), budgetMs: 100_000 });
  assert.equal(f.world.sessions, 0);
  assert.equal(res.verdict, 'not ready');
  assert.match(crit(res, 'progression').evidence[0], /NOT OBSERVED/);
});

test('bad arguments are refused before anything is sent to Studio', async () => {
  const { f } = W.goodGarden();
  for (const args of [{}, { request: '  ' }, { request: 5 }]) {
    const r = await J.judgeGame(channel(f), args);
    assert.match(r.error, /request is required/);
  }
  for (const sessions of [4, -1, 1.5, 'x']) assert.match((await judge(f, { sessions })).error, /sessions must be a whole number 0-3/);
  assert.equal(f.log.length, 0);
});

test('a Studio that cannot read the screens is an error, not a verdict', async () => {
  const f = fakeStudio({ workspace: ['Baseplate'] });
  f.world.nodes.delete('game.StarterGui');
  const res = await judge(f);
  assert.match(res.error, /Could not read the player's screens/);
  assert.equal(res.verdict, undefined);
});

test('the same judge run twice on the same place answers the same (no session state leaks)', async () => {
  const a = await judge(W.goodGarden({ studio: { play: W.gardenPlay() } }).f);
  const b = await judge(W.goodGarden({ studio: { play: W.gardenPlay() } }).f);
  assert.deepEqual(a, b);
});

test('the tool is registered: studio-only, gated on the plugin operations it uses, and its answer fits the result cap without cutting the fixes', async () => {
  const tool = T.TOOLS.judge_game;
  assert.equal(tool.def.name, 'judge_game');
  assert.equal(tool.studio, true);
  assert.deepEqual(tool.def.parameters.required, ['request']);
  assert.deepEqual(Object.keys(tool.def.parameters.properties).sort(), ['ownProductIds', 'request', 'sessions']);
  for (const id of ['placeholders', 'ui_coherence', 'buttons_work', 'progression', 'errors', 'construction', 'fit_uniqueness']) assert.match(tool.def.description, new RegExp(id), id);
  assert.match(tool.def.description, /Only "ready" means every question is a yes/);
  assert.match(tool.def.description, /take[s]? Studio over/i);
  assert.ok(tool.studioOps.includes('play_check_ui') && tool.studioOps.includes('get_tree'));
  // Withheld from a plugin that cannot click buttons, offered to one that can.
  const report = (without) => ({ schema: C.PLUGIN_CAPABILITY_SCHEMA, operations: [...tool.studioOps.filter((o) => o !== without), 'ping'].map((op) => ({ op, status: 'supported' })) });
  const reqs = { judge_game: tool.studioOps };
  assert.equal(C.filterToolsForPlugin(['judge_game'], reqs, report()).allowed.has('judge_game'), true);
  const missing = C.filterToolsForPlugin(['judge_game'], reqs, report('play_check_ui'));
  assert.equal(missing.allowed.has('judge_game'), false);
  assert.match(C.pluginCapabilityPromptNote(missing), /play_check_ui is unavailable\. Withheld tools: judge_game\./);

  // Through the real registry, on the worst report (everything wrong): parsable, complete, under the cap.
  const { f } = W.goodGarden({ studio: { play: W.gardenPlay({ deadButtons: true, noEarning: true }) } });
  for (const t of ['PetsGui', 'AdminPanel', 'HalloweenEvent']) W.screen(f, t).label('T', { text: t === 'PetsGui' ? 'Pets Label' : t, pos: [0.4, 0, 0.1, 0], size: [0.3, 0, 0.1, 0] });
  const out = await T.runTool(f.ctx, 'judge_game', JSON.stringify({ request: 'a grow a garden game' }));
  assert.equal(out.ok, true);
  assert.ok(!out.resultForLlm.includes('[truncated'), `the answer is ${out.resultForLlm.length} chars`);
  assert.ok(out.resultForLlm.length <= T.MAX_SCRIPT_RESULT_CHARS);
  const data = JSON.parse(out.resultForLlm);
  assert.equal(data.verdict, 'not ready');
  assert.deepEqual(Object.keys(data).slice(0, 4), ['verdict', 'score', 'forUser', 'fixes'], 'the verdict, the words for the user and the fixes lead, so nothing important is at the tail');
  assert.match(out.summary, /Checked the game like a player would: not ready yet \(\d+ out of 100\)/);
  assert.equal(out.mutatedProject, undefined, 'judging changes nothing');
  const refused = await T.runTool(f.ctx, 'judge_game', JSON.stringify({}));
  assert.equal(refused.ok, false);
});

/* ------------------------------------------------------------------ what the player's own screen changes --- */

/** A HUD with a bar at the left and a second screen whose widget sits on top of that bar. */
function twoScreens({ second = {}, census, widgets }) {
  const f = fakeStudio({ workspace: ['Baseplate', 'SpawnLocation'], play: (op) => ({ ...W.report({ screens: census, presses: (op.press ?? []).map((p) => W.press(p)) }), ...(widgets ? { hud: { first: null, afterWait: null, afterPresses: null, widgets } } : {}) }) });
  const hud = W.screen(f, 'HUD');
  hud.label('Cash', { text: '$0', pos: [0.02, 0, 0.02, 0], size: [0.18, 0, 0.06, 0] });
  const bar = hud.frame('Bar', { pos: [0.01, 0, 0.35, 0], size: [0.09, 0, 0.3, 0] });
  hud.put(bar, 'Label', 'TextLabel', { text: 'Bar', size: [1, 0, 1, 0] });
  const other = W.screen(f, 'Other', second);
  const panel = other.frame('Panel', { pos: [0.01, 0, 0.33, 0], size: [0.09, 0, 0.32, 0] });
  other.put(panel, 'Msg', 'TextLabel', { text: 'Hello', size: [1, 0, 1, 0] });
  return f;
}
const label = (name, text, visible = true) => ({ name, class: 'TextLabel', text, visible });
const hudCensus = { name: 'HUD', enabled: true, labels: [label('Cash', '$0'), label('Label', 'Bar')] };
const overlapEvidence = (res) => crit(res, 'ui_coherence').evidence.filter((e) => /on top of each other/.test(e));

test('a screen a script switches on is judged where it sits; one the game never shows is not held against it', async () => {
  const off = { enabled: false };
  const never = await judge(twoScreens({ second: off, census: [hudCensus] }), { sessions: 1 });
  assert.deepEqual(overlapEvidence(never), [], 'disabled at the start and still off on the player\'s screen: nothing to overlap');
  const shown = await judge(twoScreens({ second: off, census: [hudCensus, { name: 'Other', enabled: true, labels: [label('Msg', 'Hello')] }] }), { sessions: 1 });
  assert.equal(overlapEvidence(shown).length, 1, 'the player saw it, so it sits on the HUD');
  assert.match(overlapEvidence(shown)[0], /HUD\.Bar and Other\.Panel/);
  assert.equal(crit(shown, 'ui_coherence').ok, false);
});

test('a window a script hides at the start is not an overlap; the same window with no such evidence is', async () => {
  const hiddenByScript = await judge(twoScreens({ census: [hudCensus, { name: 'Other', enabled: true, labels: [label('Msg', 'Hello', false)] }] }), { sessions: 1 });
  assert.deepEqual(overlapEvidence(hiddenByScript), [], 'the player\'s screen reported its text hidden');
  const unknown = await judge(twoScreens({ census: [hudCensus] }), { sessions: 1 });
  assert.equal(overlapEvidence(unknown).length, 1, 'authored visible and never seen hidden: assumed on');
  const shownToo = await judge(twoScreens({ census: [hudCensus, { name: 'Other', enabled: true, labels: [label('Msg', 'Hello', true)] }] }), { sessions: 1 });
  assert.equal(overlapEvidence(shownToo).length, 1);
});

test('the pieces of the screen the player had on once the game settled decide which windows are open; they outrank the texts read after the presses', async () => {
  const widgets = (bar, panel) => [{ gui: 'HUD', name: 'Bar', visible: bar }, { gui: 'Other', name: 'Panel', visible: panel }, { gui: 'HUD', name: 'Cash', visible: true }];
  const closed = await judge(twoScreens({ census: [hudCensus], widgets: widgets(true, false) }), { sessions: 1 });
  assert.deepEqual(overlapEvidence(closed), [], 'the panel was authored on and the game had it closed: no overlap');
  const open = await judge(twoScreens({ census: [hudCensus], widgets: widgets(true, true) }), { sessions: 1 });
  assert.equal(overlapEvidence(open).length, 1, 'both were on');
  // A press opened the panel and the texts read afterwards say it shows; the start said it did not.
  const openedByPress = await judge(twoScreens({ census: [hudCensus, { name: 'Other', enabled: true, labels: [label('Msg', 'Hello', true)] }], widgets: widgets(true, false) }), { sessions: 1 });
  assert.deepEqual(overlapEvidence(openedByPress), [], 'the start decides, not what a press opened later');
  // The start says the panel was on; a label of it read later says hidden: the start is still the last word.
  const onButLabelHidden = await judge(twoScreens({ census: [hudCensus, { name: 'Other', enabled: true, labels: [label('Msg', 'Hello', false)] }], widgets: widgets(true, true) }), { sessions: 1 });
  assert.equal(overlapEvidence(onButLabelHidden).length, 1);
  // A piece that no screen of the place explains, or that shares its name, is not evidence.
  const strangers = await judge(twoScreens({ census: [hudCensus], widgets: [{ gui: 'Elsewhere', name: 'Panel', visible: false }, { gui: 'Other', name: 'Nope', visible: false }] }), { sessions: 1 });
  assert.equal(overlapEvidence(strangers).length, 1);
});

test('screens a script draws while the game runs are named as not checked; if they are ALL there is, the question is not observed', async () => {
  const mixed = await judge(twoScreens({ second: { enabled: false }, census: [hudCensus, { name: 'Notifs', enabled: true, labels: [label('T', 'Welcome!')] }, { name: 'Freecam', enabled: true, labels: [label('X', 'cam')] }] }), { sessions: 1 });
  const c = crit(mixed, 'ui_coherence');
  assert.equal(c.measured, true);
  assert.ok(c.evidence.some((e) => /^Not checked: Notifs is built by a script while the game runs/.test(e)), c.evidence.join('|'));
  assert.ok(!c.evidence.some((e) => /Freecam/.test(e)), 'Studio\'s own free-camera screen is not the game');
  const f = fakeStudio({ workspace: ['Baseplate', 'SpawnLocation'], play: () => W.report({ screens: [{ name: 'Notifs', enabled: true, labels: [label('T', 'Welcome!')] }] }) });
  f.world.add('game.StarterGui.Off', { class: 'ScreenGui', props: { Enabled: { t: 'bool', v: false } } });
  const scripted = crit(await judge(f, { sessions: 1 }), 'ui_coherence');
  assert.deepEqual([scripted.measured, scripted.ok], [false, false]);
  assert.match(scripted.evidence[0], /NOT OBSERVED: the player's screen shows Notifs, but every one is built by a script/);
});

test('a game whose player meets a bare screen is not a pass: no HUD, no menu, nothing that says what to do', async () => {
  const f = fakeStudio({ workspace: ['Baseplate', 'SpawnLocation'], play: () => W.report({ screens: [] }) });
  const c = crit(await judge(f, { sessions: 1 }), 'ui_coherence');
  assert.deepEqual([c.ok, c.measured], [false, true]);
  assert.match(c.evidence[0], /^The player sees no screen at all at the start: no HUD, no counter, no menu/);
  assert.doesNotMatch(c.evidence[0], /no play session ran/, 'a session reached the player\'s screen and it was bare');
  assert.match(c.plain ?? c.fix, /HUD/);
  const unplayed = crit(await judge(f, { sessions: 0 }), 'ui_coherence');
  assert.equal(unplayed.ok, false);
  assert.match(unplayed.evidence[0], /no play session ran, so a screen a script draws while the game runs was not seen/);
});

test('a text a script replaces is not held against the game, and one it leaves is', async () => {
  const census = [{ name: 'HUD', enabled: true, labels: [label('Cash', '$0'), label('Sign', 'Loading...')] }];
  const f = fakeStudio({ workspace: ['Baseplate', 'SpawnLocation'], play: () => W.report({ screens: census }) });
  const hud = W.screen(f, 'HUD');
  hud.label('Cash', { text: '$299,999', pos: [0.02, 0, 0.02, 0], size: [0.18, 0, 0.06, 0] });
  hud.label('Sign', { text: 'Loading...', pos: [0.4, 0, 0.02, 0], size: [0.18, 0, 0.06, 0] });
  const text = crit(await judge(f, { sessions: 1 }), 'placeholders').evidence.join('\n');
  assert.doesNotMatch(text, /299,999/, 'the running game showed $0 there');
  assert.match(text, /stuck "loading": "Loading\.\.\." in HUD\.Sign/, 'and still said Loading... there');
});

test('a screen or piece named as a note to its author is a leftover even when its words are fine; a Delete button is not', async () => {
  const { f } = W.goodGarden({ studio: { play: W.gardenPlay() } });
  const junk = W.screen(f, 'DELETE ME');
  junk.frame('Box', { pos: [0.6, 0, 0.6, 0], size: [0.1, 0, 0.1, 0] });
  const hud = W.screen(f, 'Inventory');
  hud.button('DeleteItem', { text: 'Sell', pos: [0.8, 0, 0.9, 0], size: [0.1, 0, 0.05, 0] });
  hud.frame('BORRAR ESTO!!!', { pos: [0.7, 0, 0.7, 0], size: [0.05, 0, 0.05, 0] });
  const p = crit(await judge(f, { sessions: 0 }), 'placeholders');
  const text = p.evidence.join('\n');
  assert.match(text, /developer note: "DELETE ME" in DELETE ME/);
  assert.match(text, /BORRAR ESTO!!!/);
  assert.doesNotMatch(text, /DeleteItem|Delete Item/);
});

test('a website or a channel written on a screen is someone else\'s advert', async () => {
  const { f } = W.goodGarden({ studio: { play: W.gardenPlay() } });
  W.screen(f, 'Credits').label('Ad', { text: 'Visit www.venaprise.com', pos: [0.4, 0, 0.9, 0], size: [0.2, 0, 0.05, 0] });
  const fit = crit(await judge(f, { sessions: 0 }), 'fit_uniqueness');
  assert.match(fit.evidence.join('\n'), /"Visit www\.venaprise\.com" advertises someone else \(Credits\.Ad\)/);
});

test('a game that keeps its money on the HUD instead of in leaderstats can pass; one whose counter never moves names the counter it watched', async () => {
  const counter = (text) => [{ name: 'HUD.Cash', text }];
  const hudPlay = (moves) => (op, n) => {
    const presses = (op.press ?? []).map((p) => W.press(p, { changes: ['ShopGui.Panel became visible'] }));
    const hud = n === 2 && moves ? { first: counter('$0'), afterWait: counter('$30'), afterPresses: presses.length ? counter('$10') : null } : { first: counter('$0'), afterWait: counter('$0'), afterPresses: presses.length ? counter('$0') : null };
    return { ...W.report({ before: null, after: null, presses, touches: (op.touch ?? []).map((t) => ({ path: t, found: true, moved: true, stillInPlace: true })) }), hud };
  };
  const paid = crit(await judge(W.goodGarden({ studio: { play: hudPlay(true) } }).f), 'progression');
  assert.equal(paid.ok, true, paid.evidence.join(' | '));
  assert.match(paid.evidence.join('\n'), /Moved by walking onto Coin1.*HUD\.Cash 0 -> 30/);
  const frozen = crit(await judge(W.goodGarden({ studio: { play: hudPlay(false) } }).f), 'progression');
  assert.equal(frozen.ok, false);
  assert.match(frozen.evidence.join('\n'), /keeps its money outside leaderstats \(counters: HUD\.Cash\); none of them moved/);
});

test('when nothing was earned and the world earns through proximity prompts, the judge says it did not try them', async () => {
  const world = (prompt) => {
    const { f } = W.goodGarden({ studio: { play: W.gardenPlay({ noEarning: true }) } });
    if (prompt) f.world.add('game.Workspace.Stand.Prompt', { class: 'ProximityPrompt', props: { ActionText: W.str(prompt), ObjectText: W.str('Stand') } });
    f.world.add('game.Workspace.Door.Prompt', { class: 'ProximityPrompt', props: { ActionText: W.str('Enter') } });
    return f;
  };
  const withPrompt = await judge(world('Sell'));
  assert.match(crit(withPrompt, 'progression').evidence.join('\n'), /Not exercised: the world has 1 proximity prompt\(s\) \(Sell Stand\)/);
  assert.match(withPrompt.forUser, /I could not confirm that players can earn/);
  assert.doesNotMatch(crit(await judge(world(null)), 'progression').evidence.join('\n'), /Not exercised/, '"Enter" is not a step of the loop');
  assert.equal(crit(withPrompt, 'progression').ok, false, 'not tried is not a pass');
});

test('the plugin writes a name that is not an identifier as ["Shop Gui"]: those buttons are still found, pressed by that path, and named as a person reads them', async () => {
  const dead = (op) => W.report({ presses: (op.press ?? []).map((p) => W.press(p, { activated: false, changes: [] })) });
  const f = fakeStudio({ workspace: ['Baseplate', 'SpawnLocation'], play: dead });
  const screen = 'game.StarterGui["Shop Gui"]';
  f.world.add(screen, { name: 'Shop Gui', parent: 'game.StarterGui', class: 'ScreenGui', props: { Enabled: W.bool(true) } });
  const button = screen + '["Open/Close"]';
  f.world.add(button, { name: 'Open/Close', parent: screen, class: 'TextButton', props: { Text: W.str('Menu'), Visible: W.bool(true), Position: W.udim2(0.01, 0, 0.4, 0), Size: W.udim2(0.1, 0, 0.08, 0), BackgroundTransparency: W.num(0) } });
  f.world.add(screen + '.Sign', { name: 'Sign', parent: screen, class: 'TextLabel', props: { Text: W.str('Loading...'), Visible: W.bool(true) } });
  const res = await judge(f, { sessions: 1 });
  assert.equal(res.coverage.buttonsOnFirstScreen, 1, 'the button of a screen with a space in its name is on the first screen');
  assert.deepEqual(f.ops('play_check_ui')[0].press, [button], 'and is pressed by the path the plugin wrote');
  const b = crit(res, 'buttons_work');
  assert.match(b.evidence.join('\n'), /Does nothing: "Menu" \(Shop Gui\.Open\/Close\)/, 'named as a person reads it, not as game.StarterGui["Shop Gui"]["Open/Close"]');
  assert.match(crit(res, 'placeholders').evidence.join('\n'), /stuck "loading": "Loading\.\.\." in Shop Gui\.Sign/);
});

test('a feature of the library game the user named is not an extra, and the same feature of another game is', async () => {
  const world = (request) => {
    const f = fakeStudio({ workspace: ['Baseplate', 'SpawnLocation'], game: { name: 'Plants vs Brainrots (2)' }, play: W.gardenPlay() });
    f.world.add('game.Workspace.Garden', { class: 'Model', center: [0, 1, 40], size: [30, 2, 30] });
    const hud = W.screen(f, 'HUD', { tag: 'abcdef123456' });
    hud.label('Cash', { text: '$0', pos: [0.02, 0, 0.02, 0], size: [0.18, 0, 0.06, 0] });
    hud.frame('EggOpening', { visible: false, pos: [0.3, 0, 0.3, 0], size: [0.3, 0, 0.3, 0] });
    return judge(f, { sessions: 0, request });
  };
  const named = crit(await world('a plants vs brainrots game with a garden'), 'fit_uniqueness');
  assert.doesNotMatch(named.evidence.join('\n'), /pet and egg system/);
  const unnamed = crit(await world('a garden game'), 'fit_uniqueness');
  assert.match(unnamed.evidence.join('\n'), /a pet and egg system is in the game \(Egg Opening in screen HUD\)/);
});

test('code is read one service at a time, most telling first, so a big map cannot use up the read before the purchases are reached', async () => {
  // The plugin's own read stops at 240 scripts or 3,600 nodes; Workspace is its first stop.
  const cutWorkspace = (op) => (op.op === 'dump_scripts' && op.root === 'game.Workspace' ? { ok: true, data: { scripts: [], truncated: true } } : null);
  const { f } = W.goodGarden({ studio: { play: W.gardenPlay(), fail: cutWorkspace } });
  f.world.add('game.ServerScriptService.Vip', { class: 'Script', source: 'MarketplaceService:PromptGamePassPurchase(player, 424242)' });
  const res = await judge(f, { sessions: 0 });
  const roots = f.ops('dump_scripts').map((o) => o.root);
  assert.deepEqual(roots.slice(0, 2), ['game.ServerScriptService', 'game.ReplicatedStorage']);
  assert.equal(roots.at(-1), 'game.Workspace', 'the map comes last');
  const text = crit(res, 'placeholders').evidence.join('\n');
  assert.match(text, /Robux products that are not yours \(1\): 424242 in game\.ServerScriptService\.Vip:1/);
  assert.match(text, /script list was cut short/, 'and the cut is admitted');
});

test('the screens a player has on are read before the switched-off ones, so a place with many spare screens is not judged on its spares', async () => {
  const f = fakeStudio({ workspace: ['Baseplate', 'SpawnLocation'], play: () => W.report({ screens: [] }) });
  for (let i = 0; i < 45; i++) W.screen(f, 'Spare' + i, { enabled: false });
  W.screen(f, 'HUD').label('Sign', { text: 'nil', pos: [0.4, 0, 0.02, 0], size: [0.18, 0, 0.06, 0] });
  const res = await judge(f, { sessions: 0 });
  assert.equal(res.coverage.screens, 11, 'the one screen that is on, and ten of the spares');
  assert.match(crit(res, 'placeholders').evidence.join('\n'), /empty value \("nil"\): "nil" in HUD\.Sign/, 'the screen that is on was read although 45 spares come first');
  assert.ok(res.notVerified.some((x) => /^35 more screens beyond the 40 switched on and 10 switched off that were read$/.test(x)), res.notVerified.join('|'));
});

test('code loaded from a Roblox asset id fails the errors question even when nothing threw', async () => {
  const { f } = W.goodGarden({ studio: { play: W.gardenPlay() } });
  assert.equal(crit(await judge(f), 'errors').ok, true);
  f.world.add('game.ServerScriptService.Loader', { class: 'Script', source: 'require(123456789).init()' });
  const e = crit(await judge(f), 'errors');
  assert.equal(e.ok, false);
  assert.match(e.evidence.join('\n'), /require\(123456789\) in ServerScriptService\.Loader:1/);
});

test('when every button is dead and a full-screen piece that takes clicks is on, the judge names the piece', async () => {
  const { f } = W.goodGarden({ studio: { play: W.gardenPlay({ deadButtons: true }) } });
  f.world.add('game.StarterGui.HUD.Tutorial', { class: 'Frame', props: { Visible: W.bool(true), Active: W.bool(true), Position: W.udim2(0, 0, 0, 0), Size: W.udim2(1, 0, 1, 0), BackgroundTransparency: W.num(0.4) } });
  const b = crit(await judge(f), 'buttons_work');
  assert.match(b.evidence.join('\n'), /dead together, which points to one thing covering them or taking the clicks \(on the player's screen: HUD\.Tutorial\)/);
});

test('the plugin says where the test player stood: a fall out of the world is seen, not inferred', async () => {
  const at = (y) => ({ start: [0, 3, 0], afterWait: [0, y, 0], finish: [0, y, 0] });
  const world = (y) => W.goodGarden({ studio: { play: (op, n) => ({ ...W.gardenPlay()(op, n), characterAt: at(y) }) } }).f;
  const fine = await judge(world(3));
  assert.equal(crit(fine, 'construction').ok, true);
  assert.match(crit(fine, 'construction').evidence.at(-1), /height was read \d+ times during play/);
  assert.equal(fine.notVerified.some((x) => /where the player stands during play/.test(x)), false, 'it was observed now');
  const fell = await judge(world(-300));
  assert.equal(crit(fell, 'construction').ok, false);
  assert.match(crit(fell, 'construction').evidence.join('\n'), /The test player fell out of the world: after 15 s in session 1 it stood 301 studs below/);
  const old = await judge(W.goodGarden({ studio: { play: W.gardenPlay() } }).f);
  assert.ok(old.notVerified.some((x) => /where the player stands during play/.test(x)), 'a plugin that does not say leaves it inferred');
});

test('a session with nothing to do is skipped, not the ones after it: the shop flow still runs when the second has nothing', async () => {
  // Three buttons all fit in the first session, no coin to walk onto: the second has nothing, the third is the shop flow.
  const f = W.goodGarden({ studio: { play: W.gardenPlay() } }).f;
  for (const c of ['Coin1', 'Coin2']) f.world.nodes.delete('game.Workspace.' + c);
  f.world.nodes.delete('game.StarterGui.HUD.Collect');
  const res = await judge(f);
  const ran = f.log.filter((op) => op.op === 'play_check_ui');
  assert.deepEqual(res.sessions.map((s) => s.index), [1, 3], 'session 2 had nothing to press or walk onto');
  assert.deepEqual(ran[1].press.slice(-2), ['game.StarterGui.HUD.Menu.ShopButton', 'game.StarterGui.ShopGui.Panel.BuySeed']);
});

test('a screen too big for one answer is read window by window; a grid too big keeps its first cards and the judge says it was cut', async () => {
  const f = fakeStudio({ workspace: ['Baseplate', 'SpawnLocation'], play: () => W.report({ screens: [] }) });
  const shop = W.screen(f, 'BigShop');
  // Six windows of 100 cards each: 600 nodes, more than one answer holds, but each window fits.
  for (let w = 0; w < 6; w++) {
    const win = shop.frame('Window' + w, { size: [0.5, 0, 0.5, 0] });
    for (let i = 0; i < 100; i++) shop.put(win, 'Card' + i, 'TextLabel', { text: w === 5 && i === 99 ? 'nil' : 'Item ' + i, size: [0.1, 0, 0.1, 0] });
  }
  const res = await judge(f, { sessions: 0 });
  const reads = f.ops('get_tree').filter((op) => op.root.startsWith('game.StarterGui.BigShop'));
  assert.ok(reads.length >= 8, `the screen, its shell, then its six windows: ${reads.map((r) => r.root).join()}`);
  assert.ok(reads.every((r) => r.maxNodes <= 500), 'no answer asks for more than the plugin can send');
  assert.equal(res.coverage.screensCut, 0, 'every window was read whole');
  assert.ok(res.coverage.texts >= 600, `it read ${res.coverage.texts} texts`);
  assert.match(crit(res, 'placeholders').evidence.join('\n'), /Window5\.Card99|nil/, 'the last card of the last window was read');

  // One grid of 700 cards cannot be split into pieces worth reading: the first 499 are kept and the cut is admitted.
  const g = fakeStudio({ workspace: ['Baseplate', 'SpawnLocation'], play: () => W.report({ screens: [] }) });
  W.screen(g, 'Grid').frame('Cards', { size: [0.5, 0, 0.5, 0] });
  for (let i = 0; i < 700; i++) g.world.add(`game.StarterGui.Grid.Cards.C${i}`, { class: 'TextLabel', props: { Text: { t: 'string', v: 'x' + i } } });
  const cutRes = await judge(g, { sessions: 0 });
  assert.equal(cutRes.coverage.screensCut, 1);
  assert.ok(cutRes.coverage.texts >= 490 && cutRes.coverage.texts < 700, `read ${cutRes.coverage.texts} of 700`);
  assert.match(crit(cutRes, 'ui_coherence').evidence.join('\n'), /1 screen\(s\) were too big to read completely/);
});

test('ownProductIds are the owner\'s: a purchase call with one of them is fine, with any other it is reported', async () => {
  const world = () => {
    const { f } = W.goodGarden({ studio: { play: W.gardenPlay() } });
    f.world.add('game.ServerScriptService.Vip', { class: 'Script', source: 'MarketplaceService:PromptGamePassPurchase(player, 424242)' });
    return f;
  };
  const someoneElses = await judge(world());
  assert.equal(crit(someoneElses, 'placeholders').ok, false);
  assert.match(crit(someoneElses, 'placeholders').evidence.join('\n'), /Robux products that are not yours \(1\): 424242 in game\.ServerScriptService\.Vip:1/);
  assert.equal(crit(await judge(world(), { ownProductIds: [424242] }), 'placeholders').ok, true);
  assert.equal(crit(await judge(world(), { ownProductIds: [1] }), 'placeholders').ok, false);
});
