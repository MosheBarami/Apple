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
  // And the access check it needs is asked on the same condition, for the same reason.
  const q = WS.indexOf("queryKey: ['project-access'");
  assert.ok(q > 0, 'the access query must exist');
  assert.match(WS.slice(q, q + 300), /enabled:[^\n]*drawer === 'files'/);
});
