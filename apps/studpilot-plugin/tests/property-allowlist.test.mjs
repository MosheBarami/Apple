import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { pluginPermissions } from '../scripts/api-dump.mjs';

// 2.0 (owner decision 2026-10-08, "i accept the reduced safety"): the hand-written class/property
// allowlists are gone. These tests hold the rule that replaced them: allow what Roblox's API dump
// allows a plugin, deny a short explicit list, and say why.
const source = readFileSync(new URL('../src/Commands.luau', import.meta.url), 'utf8')
  .replace(/--\[\[[\s\S]*?\]\]/g, '')
  .replace(/--[^\n]*/g, '');
const P = pluginPermissions();

test('the allowlists are gone: no class, property or enum table lists names any more', () => {
  for (const name of ['CREATE_CLASSES', 'PROPERTY_ALLOW', 'ENUM_ALLOW', 'CONTENT_PROPERTY', 'INSTANCE_REF_PROPERTY']) {
    const m = source.match(new RegExp(`local ${name} = ([^\\n]*)`));
    assert.ok(m, `${name} not found`);
    assert.match(m[1], /^setmetatable\(\{\}, \{ __index = function/, `${name} must be a lookup, not a list`);
  }
});

test('every deny-list entry carries a reason, and the deny list stays short', () => {
  for (const [name, reason] of [...P.denyProperty, ...P.denyClass]) {
    assert.ok(typeof reason === 'string' && reason.length > 20, `${name} has no reason`);
  }
  assert.ok(P.denyProperty.size + P.denyClass.size <= 24, 'the deny list is growing back into an allowlist');
  for (const p of ['Source', 'Parent']) assert.ok(P.denyProperty.has(p), `${p} must stay denied`);
  for (const c of ['CoreGui', 'CorePackages', 'RobloxPluginGuiService', 'HttpService']) assert.ok(P.denyClass.has(c), `${c} must stay denied`);
  assert.equal(P.propertyType('ServerScriptService', 'LoadStringEnabled'), null);
  assert.equal(P.propertyType('HttpService', 'HttpEnabled'), null);
});

test('anything else creatable works: 1.x refusals that blocked real places are now allowed', () => {
  for (const c of ['Part', 'MeshPart', 'Clouds', 'Tool', 'RemoteEvent', 'Configuration', 'SurfaceGui', 'BillboardGui', 'Humanoid']) {
    assert.ok(P.canCreate(c), `${c} must be creatable`);
  }
  for (const c of ['Script', 'LocalScript', 'ModuleScript']) assert.ok(!P.canCreate(c) && P.instantiable(c), `${c} is made by edit_script`);
  for (const c of ['BasePart', 'Workspace', 'Lighting']) assert.ok(!P.canCreate(c), `${c} is not creatable`);
  // Round 2 of the visual gauntlet: a sign could not be sized (SizingMode). Every one of these is writable now.
  for (const p of ['SizingMode', 'PixelsPerStud', 'Face', 'CanvasSize', 'LightInfluence', 'Brightness', 'AlwaysOnTop',
    'StudsOffset', 'StudsOffsetWorldSpace', 'ExtentsOffset', 'MaxDistance']) {
    assert.ok(P.propertyType('SurfaceGui', p) || P.propertyType('BillboardGui', p), `${p} is not writable`);
  }
  assert.equal(P.propertyType('Part', 'Mass'), null, 'read-only stays read-only');
  assert.equal(P.propertyType('MeshPart', 'MeshId'), null, 'what Roblox keeps from plugins stays refused');
});

test('a wrong enum item is answered with the valid items, so the model can correct itself', () => {
  const fn = source.match(/local function enumValue\([\s\S]*?\nend\n/);
  assert.ok(fn, 'enumValue not found');
  assert.match(fn[0], /GetEnumItems\(\)/, 'the refusal does not list the valid items');
  assert.doesNotMatch(fn[0], /"the requested enum item is unavailable/, 'the refusal names nothing the model can use');
});
