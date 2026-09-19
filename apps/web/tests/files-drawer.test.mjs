/**
 * THE FILE HISTORY THAT NOBODY COULD OPEN.
 *
 * The workspace file store keeps real versions: workspace-files.ts historyOf and revertWorkspaceFile
 * (which writes FORWARD — "a history that can be rewritten by using it is not a history"), the
 * route at GET /api/projects/:id/files/history, the revert at POST .../files/op, and a live test
 * proving an earlier version can be read and reinstated. FilesPanel renders every bit of it,
 * including the per-version "Put back".
 *
 * A repo-wide grep for FilesPanel across apps/web returned its own definition and one comment.
 * Nothing rendered it. So the only selective reversal this product has — and the only revision
 * history it keeps for anything — had no entry point, and the panel was as good as absent.
 *
 * This is a mounting test. It asserts the entry point exists, is reachable by name, and survives a
 * reload; the panel's own behaviour is covered by the files-model tests and the live worker test.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const WEB = join(dirname(fileURLToPath(import.meta.url)), '..');
const WS = readFileSync(join(WEB, 'src', 'routes', 'workspace.tsx'), 'utf8');

test('the panel is actually rendered, not merely imported', () => {
  assert.match(WS, /<FilesPanel/, 'importing a component nothing renders is the same as no component');
  assert.match(WS, /drawer === 'files'/);
});

test('the drawer name round-trips through stored view state', () => {
  // readViewChoice validates the stored name against DRAWERS. A name in the union but not in that
  // list is a drawer that silently never reopens — only for the people who left it open.
  const list = WS.slice(WS.indexOf('const DRAWERS ='), WS.indexOf('const DRAWERS =') + 220);
  assert.match(list, /'files'/, 'DRAWERS must include every drawer the union has');
  const union = WS.slice(WS.indexOf('type Drawer ='), WS.indexOf('type Drawer =') + 220);
  assert.match(union, /'files'/);
});

test('it is reachable by name, the way every other drawer is', () => {
  assert.match(WS, /id: 'ws-files'/, 'the command palette must be able to open it');
});

test('the panel is told whether this person may change anything, from the server', () => {
  // `canEdit` drives the per-version "Put back" and the delete. Hard-coding it true would put a
  // button in front of a viewer that the worker will refuse — the exact shape of defect this
  // section exists to find.
  assert.match(WS, /canEdit=\{/, 'canEdit must be passed');
  assert.match(WS, /allows\(/, 'and derived from the resolved access, not assumed');
  assert.match(WS, /fetchProjectAccess/, 'which comes from /api/shared/:id');
});

test('access is not assumed while it is still being checked', () => {
  // `allows` returns false for both 'loading' and 'unavailable', which is the point: unknown is
  // never yes. This asserts the workspace uses that function rather than reading a role string.
  const caps = readFileSync(join(WEB, 'src', 'lib', 'capabilities.ts'), 'utf8');
  assert.match(caps, /access\.status === 'ready' && access\.capabilities\.includes\(action\)/);
});

test('the panel is mounted only while the drawer is open', () => {
  // A project's whole file listing is not worth a request on every workspace load for everyone who
  // never opens it — the same rule the memory and credits drawers already follow.
  assert.match(WS, /\{drawer === 'files' && <FilesPanel/);
  //[[ THE PROPERTY, NOT THE KEY'S NAME.
  //
  //   This pinned `queryKey: ['project-access'`. Two agents each wrote an access query, with two
  //   different key names, and when the two were merged into one the surviving name was the other
  //   one — so this failed with "the access query must exist" about a query sitting ten lines
  //   above, and members-panel.test.mjs passed on the same line by pinning the name that won.
  //   Two tests disagreeing about a string is not a finding about the code.
  //
  //   Access is now also the authority for chat/edit/retry/stop, so the answer must be known before
  //   the person presses those controls. The FILE LIST stays lazy; the small access check does not.
  const q = WS.search(/queryKey: \['[a-z-]*access[a-z-]*', projectId\]/);
  assert.ok(q > 0, 'no access query found under any key name');
  const accessQuery = WS.slice(q, q + 400);
  assert.match(accessQuery, /enabled:\s*projectId\.length > 0/,
    'the access check must be available to workspace chat controls, not delayed until a drawer opens');
  assert.doesNotMatch(accessQuery, /drawer === 'files'|drawer === 'members'/,
    'the shared access check regressed to drawer-only loading');
});
