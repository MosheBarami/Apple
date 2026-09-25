// F-059, 2026-09-24: a build that needed the Creator Store while nobody had answered the asset-source
// question was refused. The socket still understands the old signal, but the customer-facing
// chooser is retired and new projects use the internal product policy.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
const SOCKET = strip(readFileSync(join(ROOT, 'apps', 'web', 'src', 'lib', 'use-project-socket.ts'), 'utf8'));
const WS = strip(readFileSync(join(ROOT, 'apps', 'web', 'src', 'routes', 'workspace.tsx'), 'utf8'));

test('the socket keeps what the worker last said about the owed answer', () => {
  const at = SOCKET.indexOf("case 'asset_sources_owed':");
  assert.ok(at > 0, 'the socket drops asset_sources_owed');
  assert.match(SOCKET.slice(at, at + 200), /setAssetSourcesOwed\(msg\.owed\)/);
  const ret = SOCKET.slice(SOCKET.lastIndexOf('return {'));
  assert.match(ret, /assetSourcesOwed/, 'the hook does not hand the flag to the workspace');
});

test('a legacy owed signal does not open a customer source chooser', () => {
  assert.doesNotMatch(WS, /AssetSourceDialog|setSourceAsk|assetSourcesOwed/);
});
