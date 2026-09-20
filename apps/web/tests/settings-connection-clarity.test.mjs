import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const source = path => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const roblox = source('components/roblox-key-panel.tsx');
const settings = source('routes/settings.tsx');
const css = source('design/system.css');

test('Roblox credential fields are distinct from saved Apple login credentials', () => {
  const id = roblox.match(/<input\s+id="rk-id"[\s\S]*?\/>/)?.[0];
  const key = roblox.match(/<input\s+id="rk-key"[\s\S]*?\/>/)?.[0];
  assert.ok(id && key);
  assert.match(id, /name="robloxCreatorId"/);
  assert.match(id, /autoComplete="off"/);
  assert.match(id, /pattern="\[0-9\]\+"/);
  assert.match(key, /name="robloxOpenCloudKey"/);
  assert.match(key, /autoComplete="new-password"/);
});
test('permission labels separate the scope name from its explanation', () => {
  assert.match(roblox, /<\/span>\{' '\}\s*<span className="rk__scope-does"/);
  assert.match(css, /\.rk__scope-main,\.rk__scope-title,\.rk__scope-does,\.rk__scope-caution\s*\{\s*display:block/);
});
test('Discord unknown state is not presented as disconnected or allowed to mint a code', () => {
  assert.match(settings, /link\.isPending\s*\?\s*'Checking connection/);
  assert.match(settings, /link\.isError\s*\?\s*'Connection status unavailable/);
  assert.match(settings, /disabled=\{!projectId\s*\|\|\s*mint\.isPending\s*\|\|\s*link\.isPending\s*\|\|\s*link\.isError\}/);
  assert.match(settings, /Code pending — not connected yet/);
});
test('privacy copy states the promise outright, with no control beside it', () => {
  // THIS TEST USED TO ASSERT THE OPPOSITE, and it was right at the time: the page offered an
  // optional contribution, so the copy had to distinguish "off by default" from "never". The owner
  // ruled on 2026-09-20 that the never-train promise the published privacy pages make is the true
  // one, and the switch was removed — which left this guard pinning the wording of a decision the
  // product had reversed. That is the failure mode this repository keeps naming: a test that
  // outlives the choice it was written for stops protecting anything and starts blocking the fix.
  //
  // Re-aimed at what must now hold: the page STATES the promise, and offers no way to change it.
  assert.match(settings, /Apple never trains on your work/);
  assert.doesNotMatch(settings, /Training contribution is off by default/);
  assert.doesNotMatch(settings, /name="trainingOptIn"/, 'a control here would contradict the sentence above it');
});

test('asset preferences cannot render an empty answer before they have loaded', () => {
  const component = settings.slice(settings.indexOf('function AssetSourceSettings('), settings.indexOf('function NotificationSettings('));
  const guard = component.indexOf('if (!stored.data || stored.isError)');
  assert.ok(guard >= 0 && guard < component.indexOf('summarise(policy)'), 'unread preferences must exit before rendering the answer');
  assert.match(component, /Loading asset sources/);
  assert.match(component, /Could not load asset sources/);
  assert.match(component, /stored\.refetch\(/);
  assert.match(component, /checked=\{displayedChosen\.includes\(e.choice\)\}/);
  assert.match(component, /const displayedChosen = dirty \? chosen : policy\?\.allow \?\? \[\]/);
});
