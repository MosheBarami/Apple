import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const sourceUrl = new URL('../src/init.server.luau', import.meta.url);
const source = existsSync(sourceUrl) ? readFileSync(sourceUrl, 'utf8').replace(/--\[\[[\s\S]*?\]\]/g, '').replace(/--[^\n]*/g, '') : '';

test('Apple has an independent entry point and no legacy session restore', () => {
  assert.ok(source.length > 100);
  assert.doesNotMatch(source, /GetSetting|golem_session|apps\/plugin|loadstring|LoadAsset|require\s*\(\s*\d/);
  assert.match(source, /require\(script\.Bridge\)/);
  assert.match(source, /require\(script\.Commands\)/);
});

test('edit permission defaults off and is bound to this live connection', () => {
  assert.match(source, /local allowEdits = false/);
  assert.match(source, /local function consentStillCurrent\(\)/);
  assert.match(source, /sessionCurrent/);
  assert.match(source, /commands:execute\(id, op, consentStillCurrent\(\), consentStillCurrent\)/);
  assert.match(source, /allowEdits = false[\s\S]*bridge:connect/);
  assert.match(source, /not bridge:isConnected\(\)[\s\S]*allowEdits = false/);
  assert.match(source, /Allow edits for this connection/);
});

test('inspection disclosure names every pushed Studio data source', () => {
  assert.match(source, /objects and scripts/);
  assert.match(source, /current selection/);
  assert.match(source, /Studio Output messages/);
  assert.match(source, /While connected/);
});

test('unloading retires the bridge and disconnects event handlers', () => {
  assert.match(source, /plugin\.Unloading:Connect/);
  assert.match(source, /bridge:destroy\(\)/);
  assert.match(source, /commands:destroy\(\)/);
  assert.match(source, /connection:Disconnect\(\)/);
});
