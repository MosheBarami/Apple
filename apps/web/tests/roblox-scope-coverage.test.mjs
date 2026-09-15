// EVERY SCOPE THE WORKER CAN REQUIRE MUST BE OFFERABLE, AND SAYABLE.
//
// The panel renders `SCOPE_EXPLANATIONS.filter(e => ROBLOX_SCOPES.includes(e.scope))`. Read that
// the other way round and the hole appears: a scope added to ROBLOX_SCOPES with no explanation is
// not rendered at all. Not broken, not blank — ABSENT. Nobody can tick it, so the worker feature
// that requires it can never be granted, and the only symptom is a permission error much later
// that names a scope the person was never offered.
//
// That is this repository's named failure shape in the UI: a control that cannot work, discovered
// by the person who needed it. The panel's own header promises it never describes a scope by its
// identifier; this is the test that makes the promise checkable.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const WEB = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = mkdtempSync(join(tmpdir(), 'scopecov-'));
// esbuild lives in the worker's node_modules, not the web app's — the same path every other web
// test that bundles TypeScript uses.
const bundle = (entry, name) => {
  const out = join(dir, name);
  execFileSync(join(WEB, '..', 'worker', 'node_modules', '.bin', 'esbuild'),
    [entry, '--bundle', '--format=esm', '--target=es2022', '--platform=neutral',
     '--main-fields=main,module', '--outfile=' + out],
    { cwd: WEB, stdio: 'pipe' });
  return out;
};

const K = await import(`file://${bundle(join(WEB, 'src', 'lib', 'roblox-key.ts'), 'roblox-key.mjs')}`);
// The vocabulary comes from the shared package the panel actually imports, bundled the same way,
// so this compares the two halves that must agree rather than a copy of one of them.
const { ROBLOX_SCOPES } = await import(
  `file://${bundle(join(WEB, '..', '..', 'packages', 'shared', 'src', 'index.ts'), 'shared.mjs')}`
);

test('every Open Cloud scope the product accepts is explained to the person ticking it', () => {
  const explained = new Set(K.SCOPE_EXPLANATIONS.map((e) => e.scope));
  const missing = ROBLOX_SCOPES.filter((s) => !explained.has(s));
  assert.deepEqual(
    missing,
    [],
    `these scopes would be silently absent from the settings panel: ${missing.join(', ')}`,
  );
});

test('no explanation describes a scope the worker would refuse', () => {
  // The other direction of the same vocabulary problem: an explanation for a scope that is not in
  // ROBLOX_SCOPES is a tick-box the worker rejects on submit.
  const orphans = K.SCOPE_EXPLANATIONS.map((e) => e.scope).filter((s) => !ROBLOX_SCOPES.includes(s));
  assert.deepEqual(orphans, [], `these are offered but not accepted: ${orphans.join(', ')}`);
});

test('every explanation says what happens, not what the scope is called', () => {
  for (const e of K.SCOPE_EXPLANATIONS) {
    assert.ok(e.title && !e.title.includes(':'), `${e.scope} has no human title`);
    assert.ok(e.does.length > 30, `${e.scope} is not explained as a consequence`);
    // The whole reason `undoable` exists: a permission whose effects cannot be reversed has to say
    // so at the moment it is offered, not in a support ticket afterwards.
    if (e.undoable === false) {
      assert.ok(e.caution && e.caution.length > 40, `${e.scope} cannot be undone and carries no warning`);
    }
  }
});
