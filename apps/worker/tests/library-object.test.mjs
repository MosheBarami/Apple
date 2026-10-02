/**
 * Library-first objects (owner, 2026-10-02): "FOR 3D MODELS ALWAYS ... SEARCH THE CREATOR STORE OR THE LIBRARY ... and
 * just rarely generate procedurally"; the user picks from three; keyboards from the library too; owner library plus
 * Roblox-owned Creator Store rows only.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const WORKER = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(mkdtempSync(join(tmpdir(), 'library-object-')), 'l.mjs');
execFileSync(join(WORKER, 'node_modules', '.bin', 'esbuild'), [join(WORKER, 'src', 'library-object.ts'), '--bundle', '--format=esm', '--target=es2022', '--platform=node', '--outfile=' + out, '--external:cloudflare:*'], { cwd: WORKER, stdio: 'pipe' });
const L = await import(`file://${out}`);

test('what to search for: the whole name, the substance of "a stick of", then the head noun', () => {
  assert.deepEqual(L.objectQueries('make me a stick of butter'), ['butter'], 'a stick is its shape, not the object');
  assert.deepEqual(L.objectQueries('make an asmr keyboard'), ['asmr keyboard', 'keyboard']);
  assert.deepEqual(L.objectQueries('a cup of hot coffee'), ['hot coffee', 'coffee']);
  assert.deepEqual(L.objectQueries('build me a giant donut'), ['donut']);
  assert.equal(L.objectNameOf('make me a stick of butter'), 'StickOfButter');
  assert.equal(L.objectNameOf('make an asmr keyboard'), 'AsmrKeyboard');
  assert.equal(L.singular('keyboards'), 'keyboard');
  assert.equal(L.singular('boxes'), 'box');
  assert.equal(L.singular('glass'), 'glass');
});

// The owner library catalog's real answer for "butter" (live gateway, 2026-10-02), cut down.
const item = (name, game, extra = {}) => ({ gameId: game.slice(0, 12).padEnd(12, 'x'), game, kind: 'model', name, className: 'Model', path: `/Workspace/${name}`, parts: 5, instances: 9, ...extra });
const BUTTER = [
  item('Butter', 'ASMR Pack', { className: 'MeshPart', parts: 1, contains: ['Decal', 'Script'] }),
  item('Butter fly', 'Boho', { parts: 44 }),
  item('Butterfly', 'Middle Ocean', { parts: 29 }),
  item('Buttermilk Skin', 'Expedition', { parts: 1 }),
  item('Butter', 'Bakery', { parts: 3 }),
  item('Butter', 'ASMR Pack', { parts: 2, path: '/Workspace/Butter#2' }),
  item('Butter Man', 'Food Fight', { contains: ['Humanoid', 'Head'] }),
  item('Butter Statue', 'Museum', { parts: 900 }),
];

test('only what IS the object: whole-word name, exact first, one per game, no characters, nothing too big to copy', () => {
  const picked = L.rankCatalog(BUTTER, 'butter', 3);
  assert.deepEqual(picked.map((c) => `${c.name}/${c.game}`), ['Butter/ASMR Pack', 'Butter/Bakery'], 'no Butter fly while there is butter');
  assert.ok(!picked.some((c) => /Butterfly|Buttermilk/.test(c.name)), 'a word inside another word is not the word');
  assert.ok(!L.rankCatalog(BUTTER, 'butter', 10).some((c) => c.name === 'Butter Man'), 'a character is not an object');
  assert.ok(!L.rankCatalog(BUTTER, 'butter', 10).some((c) => c.name === 'Butter Statue'), 'over 400 parts is not copied');
  assert.equal(L.rankCatalog(BUTTER, 'butter', 10).filter((c) => c.game === 'ASMR Pack').length, 1, 'one per game');
  assert.deepEqual(L.rankCatalog([item('Vanilla Donut', 'Candy Obby'), item('Donut Booth', 'Please Donate'), item('Donut', 'High School')], 'donut', 3).map((c) => c.name), ['Donut', 'Vanilla Donut']);
  assert.deepEqual(L.rankCatalog([item('Donut Booth', 'Please Donate')], 'donut', 3).map((c) => c.name), ['Donut Booth'], 'offered when nothing else is a donut');
  assert.deepEqual(L.rankCatalog(BUTTER, '', 3), []);
  // Test 4 (2026-10-02): the library's only rubber duck is "Rubber Ducky".
  assert.deepEqual(L.rankCatalog([item('Rubber Ducky', 'Tiny Town', { parts: 2 }), item('Duckling', 'Steal An Egg')], 'rubber duck', 3).map((c) => c.name), ['Rubber Ducky']);
  assert.deepEqual(L.rankCatalog([item('Doggie', 'Pets'), item('Hotdog', 'Food')], 'dog', 3).map((c) => c.name), ['Doggie']);
});

test('a picked model is sized to about three player heights, by its height when it is tall', () => {
  assert.deepEqual(L.libraryFit([2, 1, 1]), { length: 15 });
  assert.deepEqual(L.libraryFit([2, 6, 2]), { height: 15 });
  // Test 5, 2026-10-02: the size words in the request are honoured.
  assert.deepEqual(L.libraryFit([2, 1, 1], 'make me a giant pizza'), { length: 37.5 });
  assert.deepEqual(L.libraryFit([2, 6, 2], 'a tiny tower'), { height: 6 });
  assert.equal(L.sizeFactor('make me a rubber duck'), 1);
});

test('the play check is said the same way by the tool loop and the library step', () => {
  assert.deepEqual(L.playCheckReading({ verdict: 'observed', leaderstats: 'the player has no leaderstats folder', clientErrors: [], serverErrors: [] }), { seen: 'nothing errored' });
  assert.deepEqual(L.playCheckReading({ verdict: 'observed', leaderstats: 'Coins 0 at the start → Coins 70 at the end', clientErrors: ['x'] }), { seen: 'Coins went from 0 to 70 during the test, and 1 error came up' });
  assert.equal(L.playCheckReading({ verdict: 'no_screen_gui', playerSees: 'nothing on screen' }).problem, 'nothing on screen');
});

test('the session finds the best ready-made model and places it in the same run, before any model call', () => {
  const session = readFileSync(join(WORKER, 'src', 'do', 'session.ts'), 'utf8');
  const hook = session.indexOf('if (await this.libraryObjectStep(agent)) return;');
  assert.ok(hook > 0, 'the library step is not called');
  assert.ok(hook < session.indexOf('const AFTER_OBJECT'), 'it runs before the step prepares a model call');
  const step = session.slice(session.indexOf('private async libraryObjectStep'), session.indexOf('private async pauseForStudio'));
  // Owner, 2026-10-02: no three options; the best candidate is placed automatically, with no card and no wait.
  assert.match(step, /offerLibraryObjects\(ctx, agent\.request \?\? '', \{ auto: true \}\)/);
  assert.ok(!/storage\.put\('pendingObjectChoice'|kind: 'asset_choices'/.test(step), 'no choice is offered any more');
  assert.match(step, /placeChosenObject\(ctx, chosen\.pending, chosen\.index\)/);
  assert.match(step, /runTool\(ctx, 'play_check'/, 'played once by the harness');
  assert.match(step, /pick\.index === null\) \{ await clearLineup\(ctx\); await this\.ctx\.storage\.delete\('pendingObjectChoice'\); return false; \}/, '"none of these" builds it');
  // Review 2026-10-02: the user's permissions and a read-only request bind the harness; the offer is kept until settled.
  assert.match(step, /agent\.readOnly \|\| !allowed\.has\('find_library_model'\) \|\| !allowed\.has\('insert_library_model'\)/);
  assert.match(step, /row\('insert_library_model', ok/, 'a "3D model of X" run owes an insert_library_model row');
  assert.match(session, /&& !agent\.objectOffered\) reason = 'incomplete'/, 'an offer awaiting the pick is not a missing model');
  assert.ok(!/storage\.delete\('pendingObjectChoice'\);\n/.test(session.slice(session.indexOf("await this.ctx.storage.delete('pendingAssetChoice');"), session.indexOf("await this.ctx.storage.delete('pendingAssetChoice');") + 120)), 'not consumed at admission');
  assert.match(step, /coolLibraryObject\(ctx, spec\)/, 'a library object is made cooler around itself, never rebuilt');
  assert.ok(!/llmChat|this\.chat\(/.test(step), 'no model call in the library step');
  // Only the owner picks, and a pick names an option that was offered.
  assert.match(session, /mode === 'agent' && pendingObject && initiatedBy === bind\.ownerId \? ASSET_CHOICE_MESSAGE\.exec\(text\)/);
  assert.match(session, /pendingObject\.options\.some\(\(o\) => o\.index === Number\(objectPickIndex\)\)/);
});

test('every candidate is script-free: ServerStorage import, strip, copy; Creator Store rows through their own gate', () => {
  const src = readFileSync(join(WORKER, 'src', 'library-object.ts'), 'utf8');
  assert.match(src, /op: 'import_owner_library', gameId: c\.gameId!, path: c\.path!, mode: 'self', parent: into/);
  assert.match(src, /const PARTS_FOLDER = 'game\.ServerStorage\.AppleParts'/, 'imported where no script runs');
  assert.match(src, /op: 'strip_descendants', root: into, classes: \['LocalScript', 'Script', 'ModuleScript', 'Sound'\]/);
  assert.match(src, /op: 'place_copies'/);
  assert.match(src, /TOOLS\.insert_library_model!\.run\(ctx, \{ id: c\.id, parent: into \}\)/, 'store rows keep insertAndProveClean');
  assert.match(src, /creatorStoreOnly: true, includeThirdParty: false/, 'Roblox-owned rows only (owner, 2026-10-02)');
  assert.ok(!/libraryDependencies|importOwnerLibrary\(/.test(src), 'no dependency import: that brings live scripts into services');
});

// Review 2026-10-02: Model:GetBoundingBox is oriented to the pivot; the stage and the click body need the world box.
test('the world box of a turned part covers it on the world axes', () => {
  // A 10 x 2 x 2 bar turned 90 degrees about Y (its length now along Z), centred at (0, 1, 0).
  const turned = { props: { Size: { v: [10, 2, 2] }, CFrame: { v: [0, 1, 0, 0, 0, 1, 0, 1, 0, -1, 0, 0] } } };
  const b = L.worldBox({ children: [turned, { props: { Size: { v: [1, 1, 1] }, CFrame: { v: [0, 50, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1] }, Transparency: { v: 1 } } }] });
  assert.deepEqual(b.size.map((n) => Math.round(n * 1000) / 1000), [2, 2, 10], 'length on Z, and the invisible part left out');
  assert.equal(b.bottomY, 0);
  assert.equal(L.worldBox({}), null);
  const src = readFileSync(join(WORKER, 'src', 'library-object.ts'), 'utf8');
  assert.ok(!/paths: \[model, stageName\]|paths: \[LINEUP, /.test(src), 'no multi-path delete: delete_instances is all-or-nothing');
});

// Test 3 on the library flow (2026-10-02): "100x cooler" was only orbs and a glow; the library's GoldenCrown never
// matched "crown" because CamelCase names were one word.
test('CamelCase names are words, and the cool kit crowns a library object without breaking its rig', () => {
  assert.deepEqual(L.rankCatalog([item('GoldenCrown', 'Fighters', { parts: 24 }), item('Crownfire', 'Escape')], 'crown', 3).map((c) => c.name), ['GoldenCrown']);
  assert.deepEqual(L.rankCatalog([item('PurpleTopHat', 'Meepcity', { parts: 2 })], 'top hat', 3).map((c) => c.name), ['PurpleTopHat']);
  const src = readFileSync(join(WORKER, 'src', 'library-object.ts'), 'utf8');
  const kit = src.slice(src.indexOf('export async function coolLibraryObject'));
  assert.match(kit, /rig_model', root: `\$\{model\}\.Crown\.CrownRoot`, joint: 'weld'/, 'the crown is welded to its own root');
  assert.match(kit, /rig_model', root: `\$\{model\}\.AppleBody`, parts: \[`\$\{model\}\.Crown\.CrownRoot`\], joint: 'weld'/, 'its root to the body, listed');
  assert.ok(!/rig_model', root: `\$\{model\}\.AppleBody`, joint: 'weld'/.test(kit), 'never a second whole-model weld pass (it would join the motor root)');
  assert.match(kit, /path: `\$\{model\}\.AppleBody`, props: \{ Anchored: \{ t: 'bool', v: false \} \}/, 'the body is let go again');
  assert.match(kit, /strip_descendants', root: folderPath, classes: \['LocalScript', 'Script', 'ModuleScript', 'Sound'\]/, 'the crown is script-free too');
});

// Test 3, round 2 (2026-10-02): cooled twice, the new crown stood on the old one, 3 studs over the butter.
test('a second "cooler" clears the first one before measuring, and measures the body', () => {
  const src = readFileSync(join(WORKER, 'src', 'library-object.ts'), 'utf8');
  const kit = src.slice(src.indexOf('export async function coolLibraryObject'));
  const firstMeasure = kit.indexOf('await bounds(');
  const clearCrown = kit.indexOf('`${model}.Crown`');
  assert.ok(firstMeasure > 0 && clearCrown > 0, 'both found');
  assert.ok(clearCrown < firstMeasure, 'the old crown goes before the object is measured');
  assert.match(kit.slice(firstMeasure - 30, firstMeasure + 60), /bounds\(ctx\.execStudioOp, body\)/, 'measured by its own body');
  for (const stale of ['${body}.CrownRoot', '${body}.LevelUpAuraFX', '${model}.Glow', '${model}Cool']) {
    assert.ok(kit.indexOf(stale) < firstMeasure, `${stale} cleared first`);
  }
});

// Test 3, round 3 (2026-10-02): a few seconds into Play the cooled butter was a white blob (the level-up aura left on,
// sparkles at scale 2.5 and twice the rate, two lights). The model the user picked must stay visible.
test('the cool kit twinkles without hiding the model', () => {
  const src = readFileSync(join(WORKER, 'src', 'library-object.ts'), 'utf8').replace(/^\s*\/\/.*$/gm, '');
  const kit = src.slice(src.indexOf('export async function coolLibraryObject'));
  assert.ok(!/vfxPlan\('level_up_aura'/.test(kit), 'no level-up aura left on (a few-second burst for a player)');
  const m = kit.match(/vfxPlan\('sparkle_shimmer', [^)]*\{ scale: ([\d.]+), rate: ([\d.]+) \}/);
  assert.ok(m, 'sparkles found');
  assert.ok(Number(m[1]) <= 2 && Number(m[2]) <= 1, `sparkles stay small and few (scale ${m[1]}, rate ${m[2]})`);
  const bright = kit.match(/name: 'CoolLight'[^}]*Brightness: \{ t: 'number' as const, v: ([\d.]+) \}/);
  assert.ok(bright && Number(bright[1]) <= 1, 'a soft light');
});

// Test 4 (2026-10-02): "make me a rubber duck" with the butter already there stood candidate 2 inside the butter's
// stage, and the pick would have landed in it too.
test('a second object finds empty ground beside the first, never in it', () => {
  assert.equal(L.LANE_STEPS[0], 0, 'the middle first');
  assert.ok(L.LANE_STEPS.includes(32) && L.LANE_STEPS.includes(-32), 'both sides');
  assert.equal(L.blocksLane([], 0, []), false, 'empty ground');
  assert.equal(L.blocksLane(['game.Workspace.StickOfButterStage.Stage'], 1, []), true, 'the butter is in the way');
  assert.equal(L.blocksLane(['Workspace.ApplePicks.Pick1.Part'], 1, ['game.Workspace.ApplePicks']), false, 'the row itself is not');
  assert.equal(L.blocksLane(['game.Workspace.RubberDuck.Body'], 1, ['game.Workspace.RubberDuck']), false, 'nor the thing being remade');
  assert.equal(L.blocksLane(['game.Workspace.RubberDuckStage.Rim'], 1, ['game.Workspace.RubberDuck']), true, 'a longer name is another thing');
  assert.equal(L.blocksLane(Array(50).fill('game.Workspace.ApplePicks.P'), 51, ['game.Workspace.ApplePicks']), true, 'more than were listed');
  const src = readFileSync(join(WORKER, 'src', 'library-object.ts'), 'utf8').replace(/^\s*\/\/.*$/gm, '');
  const offer = src.slice(src.indexOf('export async function offerLibraryObjects'), src.indexOf('export interface PendingObjectChoice'));
  const place = src.slice(src.indexOf('export async function placeChosenObject'), src.indexOf('export function playCheckReading'));
  assert.ok(offer.indexOf('freeLaneX(') > 0 && offer.indexOf('freeLaneX(') < offer.indexOf("name: 'ApplePicks'"), 'the row looks for room before it stands up');
  assert.ok(!/SLOTS\[index - 1\]/.test(offer), 'slots are moved to the free lane');
  assert.ok(place.indexOf('freeLaneX(') > 0 && place.indexOf('freeLaneX(') < place.indexOf("op: 'place_copies'"), 'the pick looks for room before it moves');
  assert.ok(!/const at: V3 = \[0, 2, -26\]/.test(place), 'never the fixed middle');
});

// play_check cannot click (open since test 2). A library object's body is touchable, the check walks the player into
// it, and the counter on the screen it reads afterwards proves the press (2026-10-02).
test('the play check presses a picked object by walking into it and reads its counter', () => {
  const sees = 'The player\'s screen: ScreenGui "StickOfButterHUD" (enabled): visible text "0" [Value], "Presses" [Caption] | ScreenGui "RubberDuckHUD" (enabled): visible text "3" [Value], "Presses" [Caption], "Click it!" [Text].';
  assert.equal(L.pressesSeen({ playerSees: sees }, 'RubberDuck'), 3, 'its own screen, not the first object');
  assert.equal(L.pressesSeen({ playerSees: sees }, 'StickOfButter'), 0);
  assert.equal(L.pressesSeen({ playerSees: sees }, 'Pizza'), undefined, 'no screen, no reading');
  assert.equal(L.pressesSeen({}, 'RubberDuck'), undefined);
  const src = readFileSync(join(WORKER, 'src', 'library-object.ts'), 'utf8').replace(/^\s*\/\/.*$/gm, '');
  assert.match(src, /name: 'AppleBody', props: \{[^}]*CanTouch: true/, 'the body can be walked into');
  const session = readFileSync(join(WORKER, 'src', 'do', 'session.ts'), 'utf8');
  const pick = session.slice(session.indexOf('const placed = await placeChosenObject'), session.indexOf("await this.finishRun(agent, 'done');", session.indexOf('const placed = await placeChosenObject')));
  assert.match(pick, /runTool\(ctx, 'play_check', JSON\.stringify\(object \? \{ touch: \[`\$\{object\}\.AppleBody`\] \}/, 'the check walks into the body');
  assert.match(pick, /presses === 0\) reading\.problem =/, 'a counter left at 0 is said as a problem');
});

// Leftovers from a piece's own game (a price tag over the crown, a "Buy" prompt) go too, in their own call after the
// script strip, so an older plugin that refuses the new classes still takes every script out (2026-10-02).
test('library pieces lose their leftover tags and prompts, scripts first', () => {
  const src = readFileSync(join(WORKER, 'src', 'library-object.ts'), 'utf8').replace(/^\s*\/\/.*$/gm, '');
  assert.match(src, /classes: \['BillboardGui', 'ProximityPrompt', 'ClickDetector'\]/);
  for (const root of ['into', 'folderPath']) {
    const scripts = src.indexOf(`op: 'strip_descendants', root: ${root}, classes: ['LocalScript'`);
    const leftovers = src.indexOf(`await stripLeftovers(ctx, ${root})`);
    assert.ok(scripts > 0 && leftovers > scripts, `${root}: scripts out, then the leftovers`);
  }
  const plugin = readFileSync(join(WORKER, '..', 'apple-plugin', 'src', 'ops', 'Compose.luau'), 'utf8');
  assert.match(plugin, /local STRIPPABLE = \{[^}]*BillboardGui = true, ProximityPrompt = true, ClickDetector = true/, 'the plugin takes them');
});
