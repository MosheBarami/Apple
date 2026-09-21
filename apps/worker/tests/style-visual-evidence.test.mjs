import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const tmp = mkdtempSync(join(tmpdir(), 'apple-style-evidence-'));
const outfile = join(tmp, 'style-evidence.mjs');
buildSync({
  entryPoints: [join(ROOT, 'apps/worker/src/style-visual-evidence.ts')],
  outfile,
  bundle: true,
  platform: 'browser',
  format: 'esm',
  target: 'es2022',
});
const mod = await import(pathToFileURL(outfile));

test.after(() => rmSync(tmp, { recursive: true, force: true }));

test('fixed style families resolve bounded authored cues from the five-source ledger', () => {
  for (const family of ['tycoon', 'cartoon-simulator', 'pets-collection', 'studs-classic', 'rpg', 'minimalist', 'farming', 'obby']) {
    const cues = mod.visualCuesForStyleFamily(family, 99);
    assert.equal(cues.length, 3, family + ' must expose exactly the bounded three-cue prompt view');
    assert.equal(new Set(cues.map((c) => c.sourceId)).size, 3);
    assert.ok(cues.every((c) => c.observation.length >= 45));
    assert.ok(cues.every((c) => c.url.startsWith('https://devforum.roblox.com/t/')));
  }
});

test('unknown styles add no fake guidance', () => {
  assert.deepEqual(mod.visualCuesForStyleFamily('not-a-style'), []);
  assert.equal(mod.styleVisualCueBlock('not-a-style'), null);
});

test('prompt block identifies observations as non-copying reference guidance', () => {
  const block = mod.styleVisualCueBlock('pets-collection');
  assert.match(block, /observations only, never copy source media/);
  assert.match(block, /Pet|pet/);
  assert.ok(block.split('\n').length <= 4, 'the evidence block grew beyond its three-cue budget');
});
