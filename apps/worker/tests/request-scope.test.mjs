// F-036, 2026-09-23: "make the lighting warmer" also resized trees and added logs and boulders (132, then 206 Credits).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isLightingOnlyRequest, staysInLighting } from '../src/request-scope.ts';

test('lighting-only requests are recognised, and anything that also asks for objects is not', () => {
  for (const t of ['make the lighting warmer, like the sun is going down', 'make it darker and moodier', 'too foggy, make it a clear golden hour', 'can you make it night time']) {
    assert.equal(isLightingOnlyRequest(t), true, t);
  }
  for (const t of ['add a campfire with a warm glow', 'make a sunset island', 'make the trees brighter', 'build a dark castle', 'fix the coin script']) {
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
