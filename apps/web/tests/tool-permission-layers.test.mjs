// A BLOCK SOMEBODY ELSE SET, drawn as a block somebody else set.
//
// The control itself — which tools may be withheld, and how the choice is stored — is pinned by
// tool-permissions.test.mjs beside this file. This one is about the other half, which only shows
// up once more than one layer has an opinion: permissions merge org → you → this project towards
// the STRICTEST answer, so a project may tighten an account-level block and may never loosen one.
//
// The two ways that goes wrong are opposite, and both are silent:
//
//   1. A CHECKBOX THAT CLEARS AND COMES BACK. Untick a block the account imposed, the save
//      succeeds — the server stored your project's answer faithfully — and the merged value is
//      unchanged, because some other layer still denies it. The control moved and nothing did.
//   2. LOCKING SOMEBODY OUT OF THEIR OWN DECISION. The merged value ALREADY CONTAINS this layer,
//      so "the effective answer is deny" is not evidence that anyone else said so. Reading the
//      merged value alone would freeze the box the instant a person ticked it.
//
// `floorFrom` is the distinction: strictly-stricter-than-mine can only have come from elsewhere.
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

test('every governed tool says why withholding it matters, in words that are not the tool name', () => {
  // "set_properties" is a label. "Alters existing instances in place" is the thing somebody needs
  // in order to decide.
  assert.ok(T.GOVERNED_TOOLS.length >= 10, `only ${T.GOVERNED_TOOLS.length} tools governed`);
  for (const g of T.GOVERNED_TOOLS) {
    assert.ok(g.label.length > 3 && !g.label.includes('_'), `${g.name}: the label is the tool name`);
    assert.ok(g.why.length > 30, `${g.name}: must say why it would be withheld`);
    assert.ok(g.group === 'changes' || g.group === 'spends', `${g.name}: ungrouped`);
  }
});

test('the destructive ones are all governed — the list is not the easy half', () => {
  for (const name of ['delete_instances', 'run_luau', 'edit_script', 'set_properties', 'install_module']) {
    assert.ok(T.GOVERNED_TOOL_NAMES.includes(name), `${name} cannot be denied from the product`);
  }
});

/* ------------------------------------------------------------- reading the blob --- */

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
  // max(layers) > mine implies some other layer holds that value. Without this distinction the
  // panel locks the user out of the setting they themselves just made.
  assert.equal(T.floorFrom('allow', 'deny'), 'deny', 'someone above denied it');
  assert.equal(T.floorFrom('ask', 'deny'), 'deny');
  assert.equal(T.floorFrom('deny', 'deny'), undefined, 'that is my own denial — I may lift it');
  assert.equal(T.floorFrom('deny', 'allow'), undefined, 'cannot happen, and is not a lock');
  assert.equal(T.floorFrom('allow', 'allow'), undefined);
});

test('the lock names the layer, because an unexplained dead control reads as a broken one', () => {
  assert.match(T.floorNote('deny', 'org'), /organisation/i);
  assert.match(T.floorNote('deny', 'user'), /account/i);
  assert.match(T.floorNote('ask', undefined), /cannot/i);
  assert.ok(T.floorNote('deny', 'org').length > 20);
});

/* ---------------------------------------------------------------- it is wired in --- */

test('the panel draws the outer layer’s block as ticked AND disabled, not as clearable', () => {
  assert.match(PANEL, /floorFrom\(/, 'the panel never reads the layer already in force');
  assert.match(PANEL, /checked=\{blocked \|\| floor !== undefined\}/, 'an inherited block draws unticked');
  assert.match(PANEL, /disabled=\{!canWrite \|\| floor !== undefined\}/, 'an inherited block can be cleared to no effect');
  assert.match(PANEL, /floorNote\(floor,/, 'the dead control gives no reason for being dead');
});

test('the editor is NOT gated to one scope — a project policy is the same control', () => {
  // instructions-panel already has a scope tab, and savePreferences(scope, scopeId, prefs) writes
  // to whichever layer is selected. The failure to guard against is the profile block's shape,
  // `{scope === 'user' && ...}`, wrapped around the permission editor — which would leave a
  // project-scoped tool policy unreachable while looking done.
  const at = PANEL.indexOf('GOVERNABLE_TOOLS.filter');
  assert.ok(at > 0, 'no GOVERNABLE_TOOLS.filter in the panel');
  const before = PANEL.slice(0, at);
  const lastGate = before.lastIndexOf("scope === 'user' && (");
  const lastClose = before.lastIndexOf('</div>');
  assert.ok(lastGate < lastClose, 'the tool-permission editor sits inside the user-only block');
});
