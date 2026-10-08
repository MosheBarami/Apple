import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const sourceUrl = new URL('../src/init.server.luau', import.meta.url);
const source = existsSync(sourceUrl) ? readFileSync(sourceUrl, 'utf8').replace(/--\[\[[\s\S]*?\]\]/g, '').replace(/--[^\n]*/g, '') : '';

test('StudPilot has an independent entry point and no legacy session restore', () => {
  assert.ok(source.length > 100);
  assert.doesNotMatch(source, /apple_session|studpilot_session|apps\/plugin|loadstring|LoadAsset|require\s*\(\s*\d/);
  assert.match(source, /require\(script\.Bridge\)/);
  assert.match(source, /require\(script\.Commands\)/);
});

test('the only thing saved in plugin settings is the install identity, never a session token', () => {
  // Every settings call names the one identity key; the session token is never written anywhere.
  const calls = [...source.matchAll(/plugin:(GetSetting|SetSetting)\(([^,)]*)/g)];
  assert.ok(calls.length >= 2, 'the install identity is no longer persisted');
  for (const [, , key] of calls) assert.equal(key.trim(), 'INSTALL_SETTING');
  assert.match(source, /local INSTALL_SETTING = "StudPilotInstallV1"/);
  assert.doesNotMatch(source, /SetSetting\([^)]*token/i);
});

test('connecting is the permission: there is no separate edit-consent step', () => {
  assert.doesNotMatch(source, /allowEdits|confirmingEdits|Enable edits|Allow edits/);
  assert.match(source, /local authorized = if isRunMode then liveConnection\(\) else writeFence\(\)/,
    'Run-mode controls are fenced by the connection alone; every other write also by edit mode');
  assert.match(source, /return liveConnection\(\) and editModeActive\(\)/, 'writes still require Studio edit mode');
  assert.match(source, /commands:execute\(id, op, authorized, readFence\)/);
});

test('the dock is the three connection states and nothing else, in Studio colours', () => {
  assert.match(source, /"Waiting for StudPilot"/);
  assert.match(source, /"Open your project on studpilot\.app and press Connect\."/);
  assert.match(source, /"Connected to " \.\. projectName/);
  assert.match(source, /"Can’t reach StudPilot"/);
  assert.match(source, /"Retry"/);
  assert.match(source, /"Disconnect"/);
  assert.match(source, /Studio\.Theme:GetColor/);
  assert.match(source, /ThemeChanged/);
  assert.doesNotMatch(source, /PairingCode|pairing code|Six-character/i, 'the pairing-code flow is gone');
  assert.doesNotMatch(source, /workers\.dev/, 'the dock names a workers.dev host to a person');
});

test('unloading retires the bridge and disconnects event handlers', () => {
  assert.match(source, /plugin\.Unloading:Connect/);
  assert.match(source, /bridge:destroy\(\)/);
  assert.match(source, /commands:destroy\(\)/);
  assert.match(source, /connection:Disconnect\(\)/);
});
