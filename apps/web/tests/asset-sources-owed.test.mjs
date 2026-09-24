// F-059, 2026-09-24: a build that needed the Creator Store while nobody had answered the asset-source
// question was refused, and nothing showed the question to anybody. The worker now says so on the
// socket (`asset_sources_owed`) and the workspace opens the same dialog it asks before a build.
// Opening it holds no message (held: null) — nothing is resent on the person's behalf — and an
// answer given in Studio is picked up and closes it.
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

test('the workspace opens the question when a build is waiting on it, holding no message', () => {
  assert.match(WS, /assetSourcesOwed,?\s[\s\S]{0,400}useProjectSocket\(/, 'the workspace never reads the flag');
  const effect = WS.slice(WS.indexOf('if (assetSourcesOwed'), WS.indexOf('if (assetSourcesOwed') + 700);
  assert.ok(effect.length > 50, 'no effect reacts to the flag');
  assert.match(effect, /owesAnswer\(sourcePolicy\)/, 'a settled policy would be asked again');
  assert.match(effect, /setSourceAsk\(\(cur\) => cur \?\? \{ held: null \}\)/, 'the question is not opened, or it would replace a held message');
  // Answered elsewhere: the stored policy is read again and an unheld dialog closes.
  assert.match(effect, /invalidateQueries\(\{ queryKey: \['personalisation', projectId\] \}\)/);
  assert.match(effect, /cur && cur\.held === null \? null : cur/, 'an answer from Studio leaves the dialog open, or closes one holding a message');
});
