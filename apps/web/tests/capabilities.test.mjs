/**
 * THE CLIENT'S MIRROR OF THE SERVER'S PERMISSION VOCABULARY, AND THE ONE PLACE THE APP ASKS.
 *
 * `apps/web/src/lib/capabilities.ts` has said since the day it was written that "this module is a
 * MIRROR of the worker's allowlists, and apps/web/tests/capabilities.test.mjs imports both and
 * holds them against each other". That file did not exist. So the mirror was a copied list with
 * nothing checking it, which is the second source of truth its own header warns about — and the
 * drift would be silent in the direction that matters: a role or an action the server gained would
 * be DROPPED by `normaliseAccess`, and dropped reads as "you may not", which is a refusal nobody
 * wrote.
 *
 * The second half is worse and is also checked here. `fetchProjectAccess` existed with no call
 * site, and `MembersPanel` was exported with no importer: a repo-wide grep found exactly one hit
 * for each — its own definition. The signed-in app therefore never asked what role you hold, and
 * the panel that renders the answer could not be opened by any person using the product. This
 * pins the wiring that ends that: the workspace asks, maps the answer through `normaliseAccess`,
 * and mounts the panel behind a drawer with a control that opens it.
 *
 * WHAT THIS IS NOT: apps/web has no DOM renderer, so nothing here mounts a component. The
 * vocabulary halves are REAL imports of both modules, bundled from TypeScript; the wiring half
 * reads the route's source. Both would have failed before this change.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const WEB = join(dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = join(WEB, '..', '..');
const ESBUILD = join(WEB, '..', 'worker', 'node_modules', '.bin', 'esbuild');
const TMP = mkdtempSync(join(tmpdir(), 'caps-'));

const bundle = async (entry, name) => {
  const out = join(TMP, `${name}.mjs`);
  execFileSync(ESBUILD, [entry, '--bundle', '--format=esm', '--platform=neutral', '--main-fields=main,module', `--outfile=${out}`], {
    stdio: 'pipe',
  });
  return import(`file://${out}`);
};

const client = await bundle(join(WEB, 'src', 'lib', 'capabilities.ts'), 'client');
const server = await bundle(join(ROOT, 'apps', 'worker', 'src', 'collab.ts'), 'server');

const workspace = readFileSync(join(WEB, 'src', 'routes', 'workspace.tsx'), 'utf8');
/** Source with comments stripped, so a name discussed in prose is not mistaken for one in use. */
const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const wsCode = code(workspace);

// ============================================================== the vocabulary, held against itself

test('the role list is the SERVER’S role list, not a copy that drifted', () => {
  assert.deepEqual([...client.COLLAB_ROLES], [...server.COLLAB_ROLES]);
});

test('the action list is the server’s action list', () => {
  // Order matters as much as membership: both are `as const` tuples the types are derived from,
  // and a reordering that kept the set would still mean the two files were edited apart.
  assert.deepEqual([...client.COLLAB_ACTIONS], [...server.COLLAB_ACTIONS]);
});

test('the roles a membership row may confer are the same on both sides', () => {
  assert.deepEqual([...client.GRANTABLE_ROLES], [...server.GRANTABLE_ROLES]);
  assert.equal(client.GRANTABLE_ROLES.includes('owner'), false, 'a row must never confer ownership');
});

test('isRole and isAction admit exactly what the server admits, and nothing else', () => {
  for (const r of server.COLLAB_ROLES) {
    assert.equal(client.isRole(r), true, `${r} is a role the server has and the client rejects`);
    assert.equal(server.asCollabRole(r) !== null, true);
  }
  for (const a of server.COLLAB_ACTIONS) {
    assert.equal(client.isAction(a), true, `${a} is an action the server has and the client drops`);
  }
  for (const junk of ['superuser', 'OWNER', '', null, 7, {}, undefined]) {
    assert.equal(client.isRole(junk), false, `${JSON.stringify(junk)} must not be a role`);
    assert.equal(server.asCollabRole(junk), null);
    assert.equal(client.isAction(junk), false, `${JSON.stringify(junk)} must not be an action`);
  }
});

test('every role and every action has words to render it with — an omission reads as a refusal', () => {
  for (const r of server.COLLAB_ROLES) {
    assert.equal(typeof client.ROLE_LABELS[r], 'string', `${r} has no label`);
    assert.ok(client.ROLE_BLURBS[r]?.length > 0, `${r} has no blurb, so the invite form offers a role it cannot describe`);
  }
  // `whyNot` reaches a private ACTION_NEEDS map. A missing entry renders "cannot undefined".
  const viewer = { status: 'ready', role: 'viewer', capabilities: ['read'] };
  for (const a of server.COLLAB_ACTIONS) {
    if (a === 'read') continue;
    const why = client.whyNot(viewer, a);
    assert.ok(typeof why === 'string' && !why.includes('undefined'), `whyNot has no sentence for ${a}: ${why}`);
  }
});

test('what the client believes a role may do is what the server would actually allow', () => {
  // normaliseAccess reads the server's own answer, so feed it exactly what /api/shared/:id returns
  // and check `allows` agrees with `can` on every (role, action) pair. This is the pair that
  // matters: a client that greys out a control the server would have allowed teaches the user the
  // product cannot do it, and one that enables a control the server refuses is a broken promise.
  for (const role of server.COLLAB_ROLES) {
    const access = client.normaliseAccess({ role, capabilities: server.capabilitiesFor(role) });
    assert.equal(access.status, 'ready', `${role} did not survive normaliseAccess`);
    for (const action of server.COLLAB_ACTIONS) {
      assert.equal(client.allows(access, action), server.can(role, action), `${role} / ${action} disagrees`);
    }
  }
});

test('a failure to read the answer is never rendered as a set of permissions', () => {
  for (const bad of [null, undefined, 'nope', {}, { role: 'superuser' }, { role: null, capabilities: ['read'] }]) {
    const a = client.normaliseAccess(bad);
    assert.equal(a.status, 'unavailable', `${JSON.stringify(bad)} must be unavailable, not an empty allowlist`);
    assert.equal(client.allows(a, 'read'), false);
  }
  // …and loading is not permission either.
  assert.equal(client.allows(client.ACCESS_LOADING, 'read'), false);
  assert.match(client.whyNot(client.ACCESS_LOADING, 'chat'), /Checking/);
});

// =================================================================== the wiring, which did not exist

test('THE WORKSPACE ACTUALLY ASKS what this person may do here', () => {
  assert.match(wsCode, /fetchProjectAccess/, 'fetchProjectAccess had no call site anywhere in the app');
  assert.match(wsCode, /normaliseAccess/, 'the payload must go through normaliseAccess, not be read field by field');
  assert.match(wsCode, /ACCESS_LOADING/, 'until the answer is in hand the state is loading, not an empty permission set');
  assert.match(wsCode, /status:\s*'unavailable'/, 'a failed check must be unavailable — a failure to observe is not an observation');
});

test('THE MEMBERS PANEL IS MOUNTED — it was exported and imported by nothing', () => {
  assert.match(wsCode, /import \{ MembersPanel \}/, 'the workspace must import it');
  assert.match(wsCode, /<MembersPanel\b/, 'and render it');
  assert.match(wsCode, /access=\{access\}/, 'and feed it the access state it takes');
});

test('the members drawer is a drawer this build can actually open and restore', () => {
  // The stored drawer name is validated against DRAWERS on load: a name missing from that tuple
  // cannot be restored, so adding the panel without adding the name would make the drawer forget
  // itself on every navigation.
  const drawers = /const DRAWERS = \[([^\]]+)\]/.exec(wsCode)?.[1] ?? '';
  assert.match(drawers, /'members'/, "'members' is missing from DRAWERS, so the open drawer is not remembered");
  assert.match(wsCode, /type Drawer = [^\n]*'members'/, "'members' is not in the Drawer union");
  assert.match(wsCode, /type DrawerName = [^\n]*'members'/, "'members' is not in the DrawerName union");
  assert.match(wsCode, /drawer === 'members'/, 'nothing renders when the members drawer is open');
});

test('and something on screen opens it — a drawer with no control is still unreachable', () => {
  assert.match(wsCode, /setDrawer\('members'\)/, 'no control opens the members drawer');
});
