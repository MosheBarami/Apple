// What Apple is allowed to DO, as a control a person can actually reach.
//
// The worker half of this has been complete and tested for a while: preferences.ts validates a
// tool permission against the real registry, merges org → user → project towards the STRICTEST
// answer, and narrows the run's toolset with it. None of that was reachable from the product —
// savePreferences could carry `tool_permissions` and no screen ever set it.
//
// The failures this file is written against are the ones a permissions UI always has:
//
//   1. A SWITCH THE SERVER WILL REFUSE. The worker checks each tool name against `toolNames()`.
//      A panel with its own hand-typed list offers a control that is rejected on save, and the
//      person who flicked it leaves believing they denied something. (The name check itself lives
//      in apps/worker/tests/tool-permissions.test.mjs, where the real registry is.)
//   2. A SWITCH THAT CANNOT DO WHAT IT APPEARS TO DO. Layers narrow: a project may tighten an
//      account denial and may never loosen it. A dropdown offering "allow" under an account-level
//      deny is a control wired to nothing.
//   3. A STORED BLOB THAT GROWS FOREVER. `allow` is the absence of a restriction, not a
//      restriction. Writing it down makes a row, an audit line, and a merge input that says
//      nothing.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const WEB = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(mkdtempSync(join(tmpdir(), 'toolperm-')), 'a.mjs');
// esbuild lives in the worker's node_modules, not the web app's — the same path every other web
// test that bundles TypeScript uses. The bundle is what pulls in @golem/shared.
execFileSync(join(WEB, '..', 'worker', 'node_modules', '.bin', 'esbuild'),
  [join(WEB, 'src', 'lib', 'tool-permissions.ts'), '--bundle', '--format=esm', '--target=es2022',
   '--platform=neutral', '--main-fields=main,module', '--outfile=' + out],
  { cwd: WEB, stdio: 'pipe' });
const T = await import(`file://${out}`);

const PANEL = readFileSync(join(WEB, 'src', 'components', 'ws', 'instructions-panel.tsx'), 'utf8');

/* ------------------------------------------------------- what the control says --- */

test('every governed tool says what denying it STOPS, not what it is called', () => {
  // "set_properties" is a label. "Apple can no longer recolour, move or resize anything already in
  // your place" is the thing somebody needs in order to decide.
  assert.ok(T.GOVERNED_TOOLS.length >= 10, `only ${T.GOVERNED_TOOLS.length} tools governed`);
  for (const g of T.GOVERNED_TOOLS) {
    assert.ok(g.label.length > 3 && !g.label.includes('_'), `${g.name}: the label is the tool name`);
    assert.ok(g.stops.length > 30, `${g.name}: must say what denying it stops`);
    assert.match(g.stops, /Apple/, `${g.name}: say who stops doing it`);
  }
});

test('the destructive ones are all governed — the list is not the easy half', () => {
  for (const name of ['delete_instances', 'run_luau', 'edit_script', 'set_properties', 'install_module']) {
    assert.ok(T.GOVERNED_TOOL_NAMES.includes(name), `${name} cannot be denied from the product`);
  }
});

/* -------------------------------------------------------------- the stored blob --- */

test('allow is not written down — it is the absence of a restriction', () => {
  // A stored `allow` is a memory row, an audit line and a merge input that all say nothing. Worse,
  // it survives: deleting the restriction later leaves the row behind saying "allowed", which reads
  // in the history as a decision somebody made.
  assert.deepEqual(T.withPermission({}, 'run_luau', 'allow'), {});
  assert.deepEqual(T.withPermission({ run_luau: 'deny' }, 'run_luau', 'allow'), {});
  assert.deepEqual(T.withPermission({ run_luau: 'deny', edit_script: 'ask' }, 'run_luau', 'allow'), { edit_script: 'ask' });
});

test('deny and ask are written down, and nothing else is touched', () => {
  assert.deepEqual(T.withPermission({ edit_script: 'ask' }, 'run_luau', 'deny'), { edit_script: 'ask', run_luau: 'deny' });
  assert.deepEqual(T.withPermission({ run_luau: 'deny' }, 'run_luau', 'ask'), { run_luau: 'ask' });
});

test('a missing entry reads as allow, and junk in the blob does not', () => {
  assert.equal(T.permissionOf(undefined, 'run_luau'), 'allow');
  assert.equal(T.permissionOf({}, 'run_luau'), 'allow');
  assert.equal(T.permissionOf({ run_luau: 'deny' }, 'run_luau'), 'deny');
  // Everything in storage arrives as unknown. A value that is not one of the three is not a
  // permission, and guessing "deny" would silently disable a tool nobody disabled.
  assert.equal(T.permissionOf({ run_luau: 'DENY' }, 'run_luau'), 'allow');
  assert.equal(T.permissionOf({ run_luau: 42 }, 'run_luau'), 'allow');
});

/* ------------------------------------------------------------------- the layers --- */

test('a denial from ANOTHER layer is detected, and this layer’s own is not', () => {
  // The merged value already contains this layer's contribution, so "effective is stricter than
  // mine" is the only honest evidence that somebody else set it — max(layers) > mine implies some
  // other layer holds that value. Without this distinction the panel locks the user out of the
  // setting they themselves just made.
  assert.equal(T.floorFrom('allow', 'deny'), 'deny', 'someone above denied it');
  assert.equal(T.floorFrom('ask', 'deny'), 'deny');
  assert.equal(T.floorFrom('deny', 'deny'), undefined, 'that is my own denial — I may lift it');
  assert.equal(T.floorFrom('deny', 'allow'), undefined, 'cannot happen, and is not a lock');
  assert.equal(T.floorFrom('allow', 'allow'), undefined);
});

test('a floor removes only the choices that are LOOSER than it', () => {
  // The rule the server enforces: a lower layer may tighten and may never widen. A dropdown that
  // still offered "allow" under an account-level deny would be a control wired to nothing.
  assert.equal(T.choiceDisabled('allow', 'deny'), true);
  assert.equal(T.choiceDisabled('ask', 'deny'), true);
  assert.equal(T.choiceDisabled('deny', 'deny'), false);
  assert.equal(T.choiceDisabled('allow', 'ask'), true);
  assert.equal(T.choiceDisabled('deny', 'ask'), false, 'tightening further is always allowed');
  // No floor at all disables nothing.
  for (const p of T.TOOL_PERMISSIONS) assert.equal(T.choiceDisabled(p, undefined), false, p);
});

test('the lock names the layer, because an unexplained dead control reads as a broken one', () => {
  assert.match(T.floorNote('deny', 'org'), /organisation/i);
  assert.match(T.floorNote('deny', 'user'), /account/i);
  assert.match(T.floorNote('ask', undefined), /cannot/i);
  assert.ok(T.floorNote('deny', 'org').length > 20);
});

/* ---------------------------------------------------------------- it is wired in --- */

test('the panel renders the editor and saves it through the preferences mutation', () => {
  assert.match(PANEL, /GOVERNED_TOOLS/, 'the panel does not render the governed list');
  assert.match(PANEL, /withPermission\(/, 'the panel does not write through the blob helper');
  assert.match(PANEL, /setPref\('tool_permissions'/, 'the edit never reaches the save mutation');
  assert.match(PANEL, /floorFrom\(/, 'the panel does not read the layer already in force');
});

test('the editor is NOT gated to one scope — a project policy is the same control', () => {
  // instructions-panel already has a scope tab, and savePreferences(scope, scopeId, prefs) writes
  // to whichever layer is selected. The failure to guard against is the profile block's shape,
  // `{scope === 'user' && ...}`, wrapped around the permission editor — which would leave a
  // project-scoped tool policy unreachable while looking done.
  const block = PANEL.slice(PANEL.indexOf('GOVERNED_TOOLS.map'));
  assert.ok(block.length > 0, 'no GOVERNED_TOOLS.map in the panel');
  const before = PANEL.slice(0, PANEL.indexOf('GOVERNED_TOOLS.map'));
  const lastGate = before.lastIndexOf("scope === 'user' && (");
  const lastClose = before.lastIndexOf('</div>');
  assert.ok(lastGate < lastClose, 'the tool-permission editor sits inside the user-only block');
});
