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
});

test('a picked model is sized to about three player heights, by its height when it is tall', () => {
  assert.deepEqual(L.libraryFit([2, 1, 1]), { length: 15 });
  assert.deepEqual(L.libraryFit([2, 6, 2]), { height: 15 });
});

test('the play check is said the same way by the tool loop and the library step', () => {
  assert.deepEqual(L.playCheckReading({ verdict: 'observed', leaderstats: 'the player has no leaderstats folder', clientErrors: [], serverErrors: [] }), { seen: 'nothing errored' });
  assert.deepEqual(L.playCheckReading({ verdict: 'observed', leaderstats: 'Coins 0 at the start → Coins 70 at the end', clientErrors: ['x'] }), { seen: 'Coins went from 0 to 70 during the test, and 1 error came up' });
  assert.equal(L.playCheckReading({ verdict: 'no_screen_gui', playerSees: 'nothing on screen' }).problem, 'nothing on screen');
});

test('the session offers ready-made models before any model call, and places the pick with none', () => {
  const session = readFileSync(join(WORKER, 'src', 'do', 'session.ts'), 'utf8');
  const hook = session.indexOf('if (await this.libraryObjectStep(agent)) return;');
  assert.ok(hook > 0, 'the library step is not called');
  assert.ok(hook < session.indexOf('const AFTER_OBJECT'), 'it runs before the step prepares a model call');
  const step = session.slice(session.indexOf('private async libraryObjectStep'), session.indexOf('private async pauseForStudio'));
  assert.match(step, /offerLibraryObjects\(ctx, agent\.request/);
  assert.match(step, /storage\.put\('pendingObjectChoice'/);
  assert.match(step, /kind: 'asset_choices'/, 'the chat gets its card');
  assert.match(step, /placeChosenObject\(ctx, pick\.pending, pick\.index\)/);
  assert.match(step, /runTool\(ctx, 'play_check'/, 'played once by the harness');
  assert.match(step, /pick\.index === null\) \{ await clearLineup\(ctx\); return false; \}/, '"none of these" builds it');
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
