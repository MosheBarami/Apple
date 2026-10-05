// The Luau client's own spec, driven from `node --test`.
//
// The mechanism is the one apps/plugin/tests/run.mjs already established, and reusing it
// is the point: the standalone Luau CLI is sandboxed and has no `io`, so it cannot read
// the module under test. Node reads the files and hands `luau` ONE chunk —
//
//     harness  ..  `local __MODULE = (function() <StudPilotClient.luau, verbatim> end)()`  ..  spec
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
const HARNESS = join(ROOT, 'apps/studpilot-plugin/tests/legacy-oracle/harness.luau');

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
  const module = readFileSync(join(PKG, 'luau/StudPilotClient.luau'), 'utf8');
  const spec = readFileSync(join(PKG, 'luau/tests/client.spec.luau'), 'utf8');

  const chunk = [
    '--!nocheck',
    `local __HARNESS = (function()\n${harness}\nend)()`,
    `local __MODULE = (function()\n${module}\nend)()`,
    spec,
  ].join('\n');

  const dir = mkdtempSync(join(tmpdir(), 'studpilot-sdk-luau-'));
  const file = join(dir, 'spec.luau');
  try {
    writeFileSync(file, chunk, 'utf8');
    const res = spawnSync('luau', [file], { encoding: 'utf8' });
    const output = `${res.stdout}\n${res.stderr}`;
    const ran = /StudPilotClient: (\d+) passed/.exec(output);

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

test('the former Luau module name still hands back the same client', (t) => {
  if (!haveLuau()) {
    t.skip('no `luau` on this machine — the Luau compatibility shim was NOT measured here');
    return;
  }
  // The shim `require`s a sibling, which the standalone CLI cannot do, so it is run as a function body
  // with `script` and `require` handed in: `require` returns what it is given, and `script.Parent` holds
  // exactly one sibling, named StudPilotClient. Naming any other sibling gives nil and fails.
  const module = readFileSync(join(PKG, 'luau/StudPilotClient.luau'), 'utf8');
  const shim = readFileSync(join(PKG, 'luau/AppleClient.luau'), 'utf8');
  const chunk = [
    '--!nocheck',
    `local __CLIENT = (function()\n${module}\nend)()`,
    `local __SHIM = (function(script, require)\n${shim}\nend)({ Parent = { StudPilotClient = __CLIENT } }, function(m) return m end)`,
    'assert(__SHIM ~= nil, "the shim did not require a sibling called StudPilotClient")',
    'assert(__SHIM == __CLIENT, "the shim returned something other than the StudPilotClient module")',
    'print("SHIM-OK")',
  ].join('\n');

  const dir = mkdtempSync(join(tmpdir(), 'studpilot-sdk-luau-'));
  const file = join(dir, 'shim.luau');
  try {
    writeFileSync(file, chunk, 'utf8');
    const res = spawnSync('luau', [file], { encoding: 'utf8' });
    const output = `${res.stdout}\n${res.stderr}`;
    assert.equal(res.status, 0, `luau failed:\n${output}`);
    assert.match(output, /SHIM-OK/, output);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
