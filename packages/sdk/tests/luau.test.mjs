// The Luau client's own spec, driven from `node --test`.
//
// The mechanism is the one apps/plugin/tests/run.mjs already established, and reusing it
// is the point: the standalone Luau CLI is sandboxed and has no `io`, so it cannot read
// the module under test. Node reads the files and hands `luau` ONE chunk —
//
//     harness  ..  `local __MODULE = (function() <AppleClient.luau, verbatim> end)()`  ..  spec
//
// The module source is never edited, so what runs is what ships. The harness is the
// plugin's own (apps/plugin/tests/harness.luau) rather than a second assertion vocabulary.
//
// A MISSING `luau` SKIPS LOUDLY and never passes: a green line for a suite that did not
// run is the exact failure this repository is organised against.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const PKG = join(HERE, '..');
const ROOT = join(PKG, '..', '..');
const HARNESS = join(ROOT, 'apps/plugin/tests/harness.luau');

function haveLuau() {
  try {
    execFileSync('luau', ['--help'], { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

test('the Luau client spec passes', (t) => {
  if (!haveLuau()) {
    t.skip('no `luau` on this machine — the Luau client was NOT measured here');
    return;
  }
  // Read explicitly rather than guarded: the harness ships in this repository, so its
  // absence is a broken tree, not a machine without a toolchain.
  const harness = readFileSync(HARNESS, 'utf8');
  const module = readFileSync(join(PKG, 'luau/AppleClient.luau'), 'utf8');
  const spec = readFileSync(join(PKG, 'luau/tests/client.spec.luau'), 'utf8');

  const chunk = [
    '--!nocheck',
    `local __HARNESS = (function()\n${harness}\nend)()`,
    `local __MODULE = (function()\n${module}\nend)()`,
    spec,
  ].join('\n');

  const dir = mkdtempSync(join(tmpdir(), 'apple-sdk-luau-'));
  const file = join(dir, 'spec.luau');
  try {
    writeFileSync(file, chunk, 'utf8');
    const res = spawnSync('luau', [file], { encoding: 'utf8' });
    const output = `${res.stdout}\n${res.stderr}`;
    const ran = /AppleClient: (\d+) passed/.exec(output);

    // THE COUNT IS ASSERTED. A harness that reported "0 passed" would exit 0, and a spec
    // file that silently failed to load would produce exactly that.
    assert.ok(ran, `the Luau spec did not report a result:\n${output}`);
    assert.ok(Number(ran[1]) >= 15, `only ${ran[1]} Luau assertions ran — the spec is not loading`);
    assert.equal(res.status, 0, `luau failed:\n${output}`);
    assert.doesNotMatch(output, /FAILED/, output);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
