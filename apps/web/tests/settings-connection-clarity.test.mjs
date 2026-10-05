import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const source = path => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const roblox = source('components/roblox-key-panel.tsx');
const settings = source('routes/settings.tsx');
const css = source('design/system.css');

test('Roblox credential fields are distinct from saved StudPilot login credentials', () => {
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
test('privacy copy states the improvement-data rule, with the opt-out switch beside it, and offers no training opt-IN', () => {
  // THIS TEST HAS NOW BEEN RE-AIMED TWICE, and both times it was right to be. It first asserted an optional contribution (copy that
  // distinguished "off by default" from "never"). The owner then ruled (2026-09-20) that "never trains" was the true promise and the
  // switch went, and this test pinned the wording of that sentence. The owner has since decided differently again (plan section 7):
  // anonymised improvement data is an OPT-OUT that is NOT collected yet, and never includes Roblox data. The sentence "StudPilot never
  // trains on your work" is no longer true to say, so it is pinned ABSENT, and what is pinned present is the rule, the not-active
  // statement and a switch that opts OUT. tests/promises-match-the-product.test.mjs holds this row to the published pages and the gate.
  assert.doesNotMatch(settings, /StudPilot never trains on your work/, 'the old promise is back on the settings page');
  assert.doesNotMatch(settings, /Training contribution is off by default/);
  assert.doesNotMatch(settings, /name="trainingOptIn"/, 'a training opt-IN is not what this row offers');
  assert.doesNotMatch(settings, /id="training-opt-in"/);
  const at = settings.indexOf('<Row id="improvement-opt-out"');
  assert.ok(at > 0, 'the improvement-data row is not on the page');
  const row = settings.slice(at, settings.indexOf('</Row>', at));
  assert.match(row, /anonymised/);
  assert.match(row, /opt-out/);
  assert.match(row, /never includes data from Roblox, an Open Cloud key, credentials or payment details/);
  assert.match(row, /Collection is not active yet/, 'the row must say plainly that nothing is collected');
  assert.match(row, /kept for when collection starts/, 'and that the choice is kept');
  assert.match(row, /<Switch[\s\S]*?name="improvementOptOut"/, 'the opt-out is a switch');
});

test('asset-source choices are absent from customer settings', () => {
  assert.doesNotMatch(settings, /AssetSourceSettings|Save asset sources|Where StudPilot gets assets/);
});
