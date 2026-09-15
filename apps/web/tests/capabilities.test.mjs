/**
 * THE MIRROR, HELD AGAINST THE THING IT MIRRORS.
 *
 * `apps/web/src/lib/capabilities.ts` says, in its own header, that "apps/web/tests/
 * capabilities.test.mjs imports both and holds them against each other. A mirror nobody checks is
 * a second source of truth that drifts." That file did not exist. The comment was the only thing
 * standing between this product and a client that greys out a control the server would have
 * allowed, or — the worse direction — leaves one lit that the server refuses.
 *
 * Both modules are imported DIRECTLY, not re-typed here. A test that restated the role list would
 * be a third copy, and three copies drift in three directions.
 *
 * THE LOAD-BEARING ASSERTION is the round trip: the exact payload `GET /api/shared/:id` puts on
 * the wire (`{ role, capabilities: capabilitiesFor(role) }`) is pushed through the client's
 * `normaliseAccess`, and `allows()` is then held against the worker's `can()` for every one of the
 * role x action pairs. That is not a tautology — `normaliseAccess` FILTERS the capability list
 * through the client's own `isAction` allowlist, so an action the worker grants and this build has
 * never heard of is dropped on arrival. Dropping it is the right behaviour; doing it without
 * anyone noticing is the drift. This test notices.
 *
 * MERGE NOTE. Two agents wrote this file at the same path, against the same missing guard. The
 * other copy also asserted the WIRING — that the workspace asks, that MembersPanel is mounted,
 * that the drawer is restorable and has a control that opens it. Those four are not lost: they
 * are what `members-panel-wiring.test.mjs` asserts, in more detail, and it is in this tree. What
 * only lives here is the vocabulary round trip below, so that is what this file keeps. The other
 * copy also bundled both modules through `apps/worker/node_modules/.bin/esbuild` into a temp dir;
 * the direct `.ts` imports below are what the rest of apps/web/tests already do and need no
 * node_modules layout to be true.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  COLLAB_ROLES as CLIENT_ROLES,
  COLLAB_ACTIONS as CLIENT_ACTIONS,
  GRANTABLE_ROLES as CLIENT_GRANTABLE,
  ROLE_LABELS,
  ROLE_BLURBS,
  ACCESS_LOADING,
  allows,
  isAction,
  isRole,
  normaliseAccess,
  roleLabel,
  whyNot,
} from '../src/lib/capabilities.ts';

import {
  COLLAB_ROLES as WORKER_ROLES,
  COLLAB_ACTIONS as WORKER_ACTIONS,
  GRANTABLE_ROLES as WORKER_GRANTABLE,
  can,
  capabilitiesFor,
} from '../../worker/src/collab.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const WEB = join(HERE, '..');

/** The payload `GET /api/shared/:id` actually sends, built the way index.ts builds it. */
const wireFor = (role) => ({ role, capabilities: capabilitiesFor(role) });

// ------------------------------------------------------------------ the two lists are one ---

test('the client knows exactly the roles the worker knows', () => {
  assert.deepEqual([...CLIENT_ROLES].sort(), [...WORKER_ROLES].sort());
});

test('the client knows exactly the actions the worker knows', () => {
  // A client action the worker does not have is a control for a permission that cannot be
  // granted; a worker action the client does not have is a permission normaliseAccess silently
  // throws away. Both are one assertion because both are the same defect.
  assert.deepEqual([...CLIENT_ACTIONS].sort(), [...WORKER_ACTIONS].sort());
});

test('the grantable roles agree, so the invite picker cannot offer a role the server refuses', () => {
  assert.deepEqual([...CLIENT_GRANTABLE].sort(), [...WORKER_GRANTABLE].sort());
});

test('owner is a role but never a grantable one, on both sides', () => {
  assert.ok(WORKER_ROLES.includes('owner'));
  assert.ok(CLIENT_ROLES.includes('owner'));
  assert.ok(!WORKER_GRANTABLE.includes('owner'));
  assert.ok(!CLIENT_GRANTABLE.includes('owner'));
});

// --------------------------------------------------------- allows() agrees with can() ---

test('CONTROL: for every role and every action, the client agrees with the server', () => {
  for (const role of WORKER_ROLES) {
    const access = normaliseAccess(wireFor(role));
    assert.equal(access.status, 'ready', `${role} did not survive normaliseAccess`);
    for (const action of WORKER_ACTIONS) {
      assert.equal(
        allows(access, action),
        can(role, action),
        `${role} / ${action}: client says ${allows(access, action)}, server says ${can(role, action)}`,
      );
    }
  }
});

test('the disagreement this test exists to catch is detectable', () => {
  // A capability the worker grants that this build has never heard of is dropped by isAction —
  // correctly, and invisibly. Proving the drop is observable is what makes the CONTROL above mean
  // something: if the filter were a no-op, the control would pass for the wrong reason.
  const fromNewerServer = normaliseAccess({ role: 'owner', capabilities: [...capabilitiesFor('owner'), 'publish_to_roblox'] });
  assert.equal(fromNewerServer.status, 'ready');
  assert.ok(!fromNewerServer.capabilities.includes('publish_to_roblox'));
  assert.equal(isAction('publish_to_roblox'), false);
});

// ------------------------------------------------------------------ nothing is undefined ---

test('every role has a label and a blurb, so no picker can render undefined', () => {
  for (const role of WORKER_ROLES) {
    assert.equal(typeof ROLE_LABELS[role], 'string', `${role} has no label`);
    assert.ok(ROLE_LABELS[role].length > 0, `${role} has an empty label`);
    assert.equal(typeof ROLE_BLURBS[role], 'string', `${role} has no blurb`);
    assert.ok(ROLE_BLURBS[role].length > 0, `${role} has an empty blurb`);
  }
});

test('every action has a sentence for why it is refused', () => {
  // whyNot builds its sentence from a Record keyed on CollabAction. A missing key renders
  // "which cannot undefined." on screen, which is how a type-level promise fails at runtime after
  // the worker gains an action.
  const viewer = normaliseAccess(wireFor('viewer'));
  for (const action of WORKER_ACTIONS) {
    if (can('viewer', action)) continue;
    const why = whyNot(viewer, action);
    assert.equal(typeof why, 'string', `${action} has no refusal sentence`);
    assert.ok(!why.includes('undefined'), `${action} refusal reads: ${why}`);
  }
});

// ---------------------------------------------------- the third state is not permission ---

test('an answer that has not arrived is not permission', () => {
  for (const action of WORKER_ACTIONS) assert.equal(allows(ACCESS_LOADING, action), false, action);
  assert.equal(roleLabel(ACCESS_LOADING), 'Checking…');
  assert.match(whyNot(ACCESS_LOADING, 'chat'), /Checking/);
});

test('a check that failed is not permission, and does not blame the user for it', () => {
  const broken = normaliseAccess({ role: 'not-a-role', capabilities: ['read'] });
  assert.equal(broken.status, 'unavailable');
  for (const action of WORKER_ACTIONS) assert.equal(allows(broken, action), false, action);
  // The three states must produce three different sentences; a single "no permission" would send
  // a user who should reload to go and ask an admin instead.
  const sentence = whyNot(broken, 'chat');
  assert.notEqual(sentence, whyNot(ACCESS_LOADING, 'chat'));
  assert.notEqual(sentence, whyNot(normaliseAccess(wireFor('viewer')), 'chat'));
  assert.match(sentence, /could not check/i);
});

test('a role the worker refuses is a role the client refuses', () => {
  for (const bad of ['', 'OWNER', 'superuser', 'admin ', null, 7, {}]) {
    assert.equal(isRole(bad), false, JSON.stringify(bad));
    assert.equal(normaliseAccess({ role: bad, capabilities: [] }).status, 'unavailable', JSON.stringify(bad));
  }
});

test('a payload with no capabilities array is an empty set, not an unreadable answer', () => {
  // The role is the readable part. A member with a role and no capability list is a member who
  // may do nothing — which is a different sentence from "we could not read the answer", and the
  // client must not collapse them.
  const state = normaliseAccess({ role: 'viewer' });
  assert.equal(state.status, 'ready');
  assert.deepEqual(state.capabilities, []);
});

// ------------------------------------------------------------------ the claim in the header ---

test('capabilities.ts still points at this file, and this file still imports collab.ts', () => {
  // The header's claim is the reason anyone believes the mirror is checked. If the path in the
  // comment ever stops naming a file that reads the worker's own module, the comment becomes the
  // lie it was written to prevent.
  const header = readFileSync(join(WEB, 'src', 'lib', 'capabilities.ts'), 'utf8');
  assert.ok(header.includes('apps/web/tests/capabilities.test.mjs'), 'capabilities.ts no longer names this test');
  const self = readFileSync(join(HERE, 'capabilities.test.mjs'), 'utf8');
  assert.ok(self.includes("'../../worker/src/collab.ts'"), 'this test no longer reads the worker module');
});
