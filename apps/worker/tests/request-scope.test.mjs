// F-036, 2026-09-23: "make the lighting warmer" also resized trees and added logs and boulders (132, then 206 Credits).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isLightingOnlyRequest, staysInLighting, isOwnerRecreateRequest, startsOwnerRecreate, isOwnerLibraryOnlyRequest, staysInOwnerLibrary } from '../src/request-scope.ts';

test('lighting-only requests are recognised, and anything that also asks for objects is not', () => {
  for (const t of ['make the lighting warmer, like the sun is going down', 'make it darker and moodier', 'too foggy, make it a clear golden hour', 'can you make it night time']) {
    assert.equal(isLightingOnlyRequest(t), true, t);
  }
  // Test 3 (2026-10-01): "make it 100x cooler" was fenced to Lighting; warm and cool need a word for light or colour.
  for (const t of ['make the colours cooler', 'make the light a bit warmer', 'cooler tones please']) assert.equal(isLightingOnlyRequest(t), true, t);
  for (const t of ['add a campfire with a warm glow', 'make a sunset island', 'make the trees brighter', 'build a dark castle', 'fix the coin script', 'make it 100x cooler', 'make it way cooler', 'make it cooler', 'that is cool, make it colder']) {
    assert.equal(isLightingOnlyRequest(t), false, t);
  }
});

test('only changes inside Lighting stay in scope', () => {
  const J = JSON.stringify;
  assert.equal(staysInLighting('set_mood', J({ mood: 'golden' })), true);
  assert.equal(staysInLighting('set_properties', J({ path: 'game.Lighting.Atmosphere', props: {} })), true);
  assert.equal(staysInLighting('set_properties', J({ path: 'Lighting', props: {} })), true);
  assert.equal(staysInLighting('set_properties', J({ path: 'game.Workspace.SkyIsland.Tree1', props: {} })), false);
  assert.equal(staysInLighting('transform_instances', J({ paths: ['game.Workspace.SkyIsland.Tree1'], scale: 1.2 })), false);
  assert.equal(staysInLighting('create_instances', J({ items: [{ className: 'Model', name: 'Log', parent: 'Workspace' }] })), false);
  assert.equal(staysInLighting('create_instances', J({ items: [{ className: 'BloomEffect', name: 'Bloom', parent: 'Lighting' }] })), true);
});

test('the session refuses out-of-scope changes on a lighting-only run', () => {
  const src = readFileSync(new URL('../src/do/session.ts', import.meta.url), 'utf8');
  assert.match(src, /isLightingOnlyRequest\(text\) \? \{ lightingOnly: true \}/, 'the run is never marked lighting-only');
  assert.match(src, /if \(agent\.lightingOnly && READ_ONLY_WITHHELD\.has\(call\.name\) && !staysInLighting\(call\.name, call\.arguments\)\) \{[\s\S]{0,1200}continue;/, 'out-of-scope changes still run');
});

const src0 = () => readFileSync(new URL('../src/do/session.ts', import.meta.url), 'utf8');

test('a request to recreate an uploaded owner game changes the place only by recreating it first', () => {
  // Live 2026-09-29: in a fresh place the model trusted an earlier "recreated" reply and planned a hand-built HUD.
  for (const t of ['Recreate my uploaded game grow_a_garden from my owner library: bring in its map, UI, scripts, sounds and lighting as they are in the original.', 'recreate steal a brainrot from my library']) {
    assert.equal(isOwnerRecreateRequest(t), true, t);
  }
  for (const t of ['make a garden game', 'recreate the lobby door', 'import the farm from my owner library']) {
    assert.equal(isOwnerRecreateRequest(t), false, t);
  }
  assert.equal(startsOwnerRecreate('recreate_owner_game'), true);
  assert.equal(startsOwnerRecreate('import_owner_library'), false, 'a plain slot import is not a recreate');
  assert.match(src0(), /out\.mutatedProject === true && call\.name === 'recreate_owner_game'\) agent\.keepOwnerOriginal = true/);
  // A built game is not a copy: it marks the run as built (no parts owed, models may be renamed to their new theme), not as an original.
  assert.match(src0(), /out\.mutatedProject === true && \(call\.name === 'build_game' \|\| call\.name === 'compose_game'\)\) \{\s*agent\.builtGame = true;/);
  assert.equal(startsOwnerRecreate('insert_ui_component'), false);
  const src = readFileSync(new URL('../src/do/session.ts', import.meta.url), 'utf8');
  assert.match(src, /isOwnerRecreateRequest\(text\) \? \{ ownerRecreate: true \}/);
  assert.match(src, /agent\.ownerRecreate && !agent\.keepOwnerOriginal && READ_ONLY_WITHHELD\.has\(call\.name\) && !startsOwnerRecreate\(call\.name\)/);
});

test('a game built only from owner library parts cannot generate or take Creator Store content', () => {
  // Live 2026-09-29: a pet obby "only from parts of my uploaded owner library games" hand-built coloured platforms.
  for (const t of ['This is a new empty place. Build a new pet obby game only from parts of my uploaded owner library games; do not generate parts, UI or effects yourself.', 'make a tycoon from my library, don\'t generate anything']) {
    assert.equal(isOwnerLibraryOnlyRequest(t), true, t);
  }
  for (const t of ['make a pet obby', 'import the farm from my owner library', 'only use neon parts']) {
    assert.equal(isOwnerLibraryOnlyRequest(t), false, t);
  }
  for (const t of ['create_instances', 'insert_asset', 'find_library_model', 'insert_library_model', 'build_ui', 'insert_vfx', 'run_luau']) assert.equal(staysInOwnerLibrary(t), false, t);
  for (const t of ['browse_owner_library', 'import_owner_library', 'recreate_owner_game', 'transform_instances', 'move_instances', 'clone_instances', 'edit_script', 'get_project_tree', 'plan_game', 'build_game', 'judge_game']) assert.equal(staysInOwnerLibrary(t), true, t);
  // Audio is the one exception: a saved game's sounds are private to their uploader, so licensed public audio replaces them.
  for (const t of ['insert_sound', 'design_sound', 'assign_sounds', 'find_sound']) assert.equal(staysInOwnerLibrary(t), true, t);
  const src = src0();
  assert.match(src, /isOwnerLibraryOnlyRequest\(text\) \? \{ ownerLibraryOnly: true \}/);
  assert.match(src, /if \(agent\.ownerLibraryOnly && !staysInOwnerLibrary\(call\.name\)\) \{[\s\S]{0,800}continue;/);
});
