/**
 * D4 (t1 round 2): the in-product look and the blind critique must run after ANY visible change.
 *
 * The round-2 run changed the place with compose_game and never looked: 0 vision calls. The confirmed cause is in the run loop
 * (do/session.ts: an early "composed answer" ending and a self-check skipped for a composed or ready game; pinned in
 * composed-answer-gates.test.mjs), but the ledger had a second, latent hole this file closes: a change counted as visible only
 * for paths spelled `game.Workspace...`, and the composite tools report paths in other spellings, in other services, or none.
 *
 * What is pinned: path spellings are one spelling; a tool that builds in the world is in the picture whatever it reports; every
 * tool the registry marks as changing the place either says it touches the world or is on a reviewed list of path-addressed
 * tools; and judge_game (a read) never satisfies a look.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as esbuild from 'esbuild';
import { mkdtempSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { newLedger, recordToolCall, recordLook, lookNeeded } from '../src/evidence-ledger.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const WORKER = join(HERE, '..');
const TMP = mkdtempSync(join(tmpdir(), 'evidence-view-'));
test.after(() => rmSync(TMP, { recursive: true, force: true }));

const mutation = (tool, args = {}, result = {}, extra = {}) => ({ tool, kind: 'mutation', args, result, ok: true, ...extra });

test('path spellings are one spelling: Workspace.X, workspace.X and game.Workspace.X are the same place', () => {
  for (const spelled of ['Workspace.Model.Part', 'workspace.Model', 'game.Workspace.Model', 'Lighting.Bloom', 'Workspace["A Model"]']) {
    const l = newLedger();
    recordToolCall(l, mutation('set_properties', { props: {} }, { created: [spelled] }, {}));
    assert.equal(lookNeeded(l), true, `${spelled} is in the picture`);
  }
  const l = newLedger();
  recordToolCall(l, mutation('set_properties', { path: 'StarterGui.Hud.Title', props: {} }));
  assert.equal(lookNeeded(l), false, 'a screen is still not in the picture, however it is spelled');
});

test('a composite that reports a path outside the workspace AND one inside it is in view (the spelling no longer hides the second)', () => {
  const l = newLedger();
  // The old reader saw only `game.ReplicatedStorage` and called the change invisible.
  recordToolCall(l, mutation('insert_library_model', { parent: 'game.ReplicatedStorage' }, { inserted: ['Workspace.Crystals'] }));
  assert.equal(lookNeeded(l), true);
  assert.deepEqual(l.inserted, ['game.Workspace.Crystals'], 'and the placed model is remembered, rooted at game');
});

test('a tool that builds in the world is in view whatever paths it reports', () => {
  const composer = (world) => mutation('compose_game', { request: 'x' }, { built: { create: 3 }, path: 'game.ServerScriptService.AppleComponents' }, world ? { world: true } : {});
  const withFlag = newLedger();
  recordToolCall(withFlag, composer(true));
  assert.equal(lookNeeded(withFlag), true);
  assert.equal(withFlag.viewChangedSeq, 1);
  const without = newLedger();
  recordToolCall(without, composer(false));
  assert.equal(lookNeeded(without), false, 'control: the same report without the flag is a script change, which the viewport cannot show');
});

test('round 2 as the ledger saw it: compose_game reported no path at all, and the work is owed a look', () => {
  const l = newLedger();
  recordToolCall(l, mutation('compose_game', { request: 'mine crystals' }, { changed: true, built: { create: 6, script: 14 }, forUser: 'x' }, { world: true }));
  recordToolCall(l, { tool: 'judge_game', kind: 'read', args: { request: 'mine crystals' }, result: { verdict: 'not ready', score: 79 }, ok: true });
  assert.equal(l.viewChangedSeq, 1);
  assert.equal(lookNeeded(l), true, 'judge_game is a read: it is not a look at the place');
  recordLook(l, { ok: true, source: 'studio_viewport', views: ['front'], observations: [], answers: [], issues: [] });
  assert.equal(lookNeeded(l), false, 'only a look clears it');
});

test('a composite that failed after part of it landed still counts as a change in view', () => {
  const l = newLedger();
  recordToolCall(l, { tool: 'compose_game', kind: 'mutation', args: {}, result: { error: 'the game was not finished', projectMutated: true }, ok: false, partial: true, world: true });
  assert.equal(lookNeeded(l), true);
});

// ---- the registry: every tool that changes the place has to say whether it touches the world ----

/**
 * Tools addressed by a path, a script, a screen or a sound: where they changed things is in what they report, so they leave
 * `touchesWorld` off. REVIEWED 2026-10-04. A new tool that changes the place is not on this list until someone has decided.
 */
const PATH_ADDRESSED = new Set([
  'edit_script', 'format_script', 'set_properties', 'set_properties_bulk', 'delete_instances', 'move_instances', 'transform_instances', 'ungroup_instances',
  'rename_instance', 'set_locked', 'set_visible', 'run_luau', 'install_module', 'remove_effect', 'add_behaviour', 'collision_groups',
  'build_studded_ui', 'build_ui', 'insert_ui_component', 'insert_sound', 'design_sound', 'assign_sounds',
]);

test('every tool that changes the place either touches the world or is on the reviewed list of path-addressed tools', async () => {
  const out = join(TMP, 'tools.mjs');
  await esbuild.build({ entryPoints: [join(WORKER, 'src', 'tools.ts')], bundle: true, format: 'esm', target: 'es2022', outfile: out, logLevel: 'silent' });
  const { TOOLS } = await import(pathToFileURL(out).href);
  const undecided = [];
  for (const [name, impl] of Object.entries(TOOLS)) {
    if (impl.mutatesProject === undefined) continue;
    if (impl.touchesWorld === true) assert.equal(PATH_ADDRESSED.has(name), false, `${name} is on both lists`);
    else if (!PATH_ADDRESSED.has(name)) undecided.push(name);
  }
  assert.deepEqual(undecided, [], 'these tools change the place but neither say they touch the world nor are reviewed as path-addressed');
  for (const name of PATH_ADDRESSED) assert.ok(TOOLS[name]?.mutatesProject !== undefined, `${name} is on the reviewed list but is not a tool that changes the place`);
  for (const composer of ['compose_game', 'build_object', 'dress_object', 'insert_library_model', 'add_upgrades', 'build_scene']) {
    assert.equal(TOOLS[composer]?.touchesWorld, true, `${composer} builds in the world`);
  }
});
