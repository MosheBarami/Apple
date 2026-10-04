// The names this package had before the rename, which must keep working for one release.
//
// @studpilot/sdk is PUBLISHED, so a consumer written against the former names upgrades without having
// been asked to. Each alias below is removed in the next major; this file is where that removal is
// made on purpose (delete the alias and its assertion together) rather than by accident.
//
// The Python (`apple_sdk`) and Luau (`AppleClient.luau`) halves are asserted in python/tests/test_client.py
// and tests/luau.test.mjs, where their interpreters are.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as sdk from '../src/index.mjs';

const PKG = join(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(readFileSync(join(PKG, 'package.json'), 'utf8'));

test('the former JavaScript class name is the same class, not a copy', () => {
  assert.equal(typeof sdk.StudPilotClient, 'function');
  assert.equal(sdk.AppleClient, sdk.StudPilotClient);
  const old = new sdk.AppleClient({ baseUrl: 'https://api.test', token: 'jwt' });
  assert.ok(old instanceof sdk.StudPilotClient, 'a client built through the former name is not a StudPilotClient');
  assert.equal(old.baseUrl, 'https://api.test');
});

test('the CLI installs under both bin names, and both run the one file', () => {
  assert.deepEqual(Object.keys(manifest.bin).sort(), ['apple', 'studpilot']);
  assert.equal(manifest.bin.studpilot, './bin/studpilot.mjs');
  assert.equal(manifest.bin.apple, manifest.bin.studpilot, 'the former bin name must run the same file');
  assert.ok(existsSync(join(PKG, manifest.bin.studpilot)), 'the bin file the manifest names does not exist');
});

test('the former Python and Luau entry points are shipped', () => {
  assert.ok(manifest.files.includes('python') && manifest.files.includes('luau'), 'python/ and luau/ are not in the published files');
  for (const rel of ['python/apple_sdk/__init__.py', 'luau/AppleClient.luau', 'python/studpilot_sdk/__init__.py', 'luau/StudPilotClient.luau']) {
    assert.ok(existsSync(join(PKG, rel)), `${rel} is missing`);
  }
});
