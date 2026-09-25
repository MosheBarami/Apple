import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

let rojoAvailable = true;
try { execFileSync('rojo', ['--version'], { stdio: 'pipe' }); } catch { rojoAvailable = false; }

test('a benchmark baseline is a new local place with only the playable Baseplate', { skip: !rojoAvailable }, () => {
  const generated = JSON.parse(execFileSync('node', [new URL('./make-baseplate.mjs', import.meta.url).pathname], { encoding: 'utf8' }));
  const bytes = readFileSync(generated.placePath);
  const xml = bytes.toString('utf8');
  assert.equal(createHash('sha256').update(bytes).digest('hex'), generated.sha256);
  assert.equal(bytes.length, generated.bytes);
  assert.deepEqual([...xml.matchAll(/<Item class="([^"]+)"/g)].map((m) => m[1]), ['Workspace', 'Part', 'SpawnLocation']);
  assert.match(xml, /<string name="Name">Baseplate<\/string>/);
  assert.doesNotMatch(xml, /class="(?:Script|LocalScript|ModuleScript|Model|ScreenGui)"/);
  assert.equal(generated.opened, false);
  assert.equal(generated.published, false);
});
