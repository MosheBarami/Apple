/**
 * WHAT APPLE DID TO YOUR ROBLOX ACCOUNT, IN WORDS YOU CAN READ.
 *
 * The worker records every write to a customer's Roblox account in `creator_write_log`. A log
 * nobody can read is the same as no log: the 299 assets that went into the owner's personal account
 * were not invisible because nothing was written down, they were invisible because nothing showed
 * anybody what had been written down. This is the function that turns one row into one sentence.
 *
 * THE PROPERTY THAT MATTERS MOST IS THE UNKNOWN ACTION. The worker's `WriteRecord['action']` union
 * will grow — it has already gone from two members to three — and a renderer written as a lookup
 * with no fallback drops what it does not recognise. A row silently missing from somebody's trail
 * is a write to their real account that the product is not telling them about, which is this
 * repository's named failure shape wearing its worst hat: a failure to observe, rendered as an
 * observation, in the one surface that exists to say what happened.
 *
 * Run with:  node --test tests/roblox-write-trail.test.mjs      (from apps/web)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const WEB = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = mkdtempSync(join(tmpdir(), 'writetrail-'));
const out = join(dir, 'roblox-key.mjs');
execFileSync(join(WEB, '..', 'worker', 'node_modules', '.bin', 'esbuild'),
  [join(WEB, 'src', 'lib', 'roblox-key.ts'), '--bundle', '--format=esm', '--target=es2022',
   '--platform=neutral', '--main-fields=main,module', '--outfile=' + out],
  { cwd: WEB, stdio: 'pipe' });
const K = await import(`file://${out}`);

const row = (over = {}) => ({
  at: '2026-09-15T08:00:00.000Z',
  action: 'upload_asset',
  robloxCreatorId: '555000111',
  creatorType: 'user',
  target: 'assets/981234999',
  ok: true,
  httpStatus: 200,
  request: { displayName: 'Brick wall', assetType: 'Image', contentType: 'image/png', bytes: 2048 },
  ...over,
});

test('an upload reads as a thing that happened, naming what and where', () => {
  const s = K.describeWrite(row());
  assert.match(s, /Brick wall/);
  assert.match(s, /555000111/);
  assert.equal(/undefined|\[object Object\]|null/.test(s), false, s);
});

test('A FAILED WRITE STILL APPEARS, AND SAYS IT FAILED', () => {
  // An attempt on somebody's account is a fact about that account. A trail that showed only the
  // successes would be a trail that hides the interesting half.
  const s = K.describeWrite(row({ ok: false, httpStatus: 403 }));
  assert.match(s, /Brick wall/);
  assert.match(s, /403|refus|did not|could not|fail/i);
});

test('a game pass reads as a game pass, with its price', () => {
  const s = K.describeWrite(row({
    action: 'create_gamepass', target: 'universes/6543210',
    request: { name: 'Starter Pack', price: 100, isForSale: true, hasIcon: false },
  }));
  assert.match(s, /Starter Pack/);
  assert.match(s, /100/);
  assert.match(s, /6543210/);
});

test('a permission grant says who was given what', () => {
  const s = K.describeWrite(row({
    action: 'grant_asset_permission', target: 'assets/1,assets/2',
    request: { subjectType: 'Universe', subjectId: '6543210', action: 'Use', assetIds: [1, 2] },
  }));
  assert.match(s, /Universe/i);
  assert.match(s, /6543210/);
  assert.match(s, /2/);
});

test('AN ACTION THIS FILE HAS NEVER HEARD OF IS STILL SHOWN, not dropped and not guessed', () => {
  // The worker gains a write action; this file is not updated. The row must still reach the person
  // whose account was written to, saying honestly that the product cannot describe it yet.
  const s = K.describeWrite(row({ action: 'set_universe_visibility', request: { visibility: 'PRIVATE' } }));
  assert.ok(s.length > 0, 'an unknown action must not render as an empty string');
  assert.match(s, /555000111/, 'it must still name the account that was written to');
  assert.match(s, /set_universe_visibility|not recognise|unknown/i, 'and must not silently invent a description');
});

test('a row with a missing request body does not render as debris', () => {
  for (const req of [null, undefined, {}, 'not an object']) {
    const s = K.describeWrite(row({ request: req }));
    assert.equal(/undefined|\[object Object\]/.test(s), false, `${JSON.stringify(req)} -> ${s}`);
  }
});

test('EVERY WRITE THE WORKER CAN RECORD IS ONE THIS CANNOT UNDO, and says so', () => {
  // Roblox publishes no delete for a game pass, no revoke for an asset permission, and refuses to
  // archive an Image. There is no "you can take this back" case to get wrong, and the trail says
  // that once rather than implying reversibility by silence.
  for (const action of ['upload_asset', 'create_gamepass', 'grant_asset_permission']) {
    assert.equal(K.isPermanentWrite(row({ action })), true, action);
  }
  // A failed attempt created nothing, so there is nothing permanent about it.
  assert.equal(K.isPermanentWrite(row({ ok: false })), false);
});
