/**
 * WHAT APPLE DID TO YOUR PLACE, WHERE A PERSON CAN READ IT.
 *
 * Every Studio op has been recorded since the oplog existed — op_id, kind, ok, summary, the typed
 * failure kind and now the run that asked for it — and `/api/projects/:id/studio/diagnostics`
 * served it. Nothing in the browser had ever called that route: a repo-wide grep for
 * 'studio/diagnostics' across apps/web returned nothing. The only path to an oplog row was a search
 * that needed you to guess a word from the error text of a failure.
 *
 * The vocabulary is cross-checked against the worker's own StudioOp union IN BOTH DIRECTIONS,
 * because the two ways this drifts are both silent: an op the table has never heard of renders as
 * a bare identifier, and an entry for an op that no longer exists reads as coverage while covering
 * nothing.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const WEB = join(dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = join(WEB, '..', '..');
const SHARED = readFileSync(join(ROOT, 'packages', 'shared', 'src', 'index.ts'), 'utf8');
const SESSION = readFileSync(join(ROOT, 'apps', 'worker', 'src', 'do', 'session.ts'), 'utf8');

const { OP_LABEL, NON_OP_KINDS, opSentence, activityRows } = await import('../src/components/ws/op-vocabulary.ts');

/** Every `op: 'name'` in the StudioOp union — the worker's list, not a copy of it. */
function studioOps() {
  const union = SHARED.slice(SHARED.indexOf('export type StudioOp'));
  const end = union.indexOf('undo_waypoint');
  return [...union.slice(0, end + 40).matchAll(/\bop: '([a-z_]+)'/g)].map((m) => m[1]);
}

test('the union still looks like a union, so the check below is checking something', () => {
  const ops = studioOps();
  assert.ok(ops.length > 20, `found only ${ops.length} ops — the scrape has stopped working`);
  assert.ok(ops.includes('edit_script') && ops.includes('restore'));
});

test('every op the worker can perform has a sentence', () => {
  const missing = studioOps().filter((op) => !(op in OP_LABEL));
  assert.deepEqual(missing, [], `these ops would render as bare identifiers: ${missing.join(', ')}`);
});

test('every sentence belongs to an op that still exists', () => {
  // Vocabulary for something that cannot happen reads like coverage and is worth less than nothing.
  const known = new Set([...studioOps(), ...Object.keys(NON_OP_KINDS)]);
  const orphans = Object.keys(OP_LABEL).filter((k) => !known.has(k));
  assert.deepEqual(orphans, [], `these entries name nothing the worker writes: ${orphans.join(', ')}`);
});

test('the non-op rows the worker really does write are covered too', () => {
  // The oplog is not only StudioOps: publishFrame writes a `frame_rejected` row. An oplog row the
  // vocabulary cannot name is exactly the row a user is most likely to be looking for.
  for (const kind of Object.keys(NON_OP_KINDS)) {
    assert.ok(SESSION.includes(`'${kind}'`), `session.ts no longer writes a ${kind} row`);
    assert.ok(kind in OP_LABEL, `${kind} rows would render as a bare identifier`);
  }
  assert.ok('frame_rejected' in NON_OP_KINDS, 'the frame refusal row must stay accounted for');
});

test('an op this build has never heard of is shown, not swallowed', () => {
  // A history that hides the row it cannot name is a history with a hole in it, and the hole is
  // invisible. The identifier is worse than a sentence and far better than nothing.
  assert.equal(opSentence('an_op_from_the_future'), 'an op from the future');
});

test('a failure reads as a failure and names its kind', () => {
  const [row] = activityRows([
    { op_id: 'op_1', kind: 'edit_script', ok: 0, summary: 'the portal script would not compile', created_at: 5, failure: 'refused', runId: 'msg_1' },
  ]);
  assert.equal(row.ok, false);
  assert.equal(row.failure, 'refused');
  assert.match(row.sentence, /script/i);
  assert.equal(row.detail, 'the portal script would not compile');
  assert.equal(row.runId, 'msg_1');
});

test('a successful op carries no detail, because the summary column only holds errors', () => {
  // session.ts writes `result.error ?? ''` into `summary`. Rendering that empty string as a detail
  // line would put a blank row under every successful op.
  const [row] = activityRows([{ op_id: 'op_2', kind: 'snapshot', ok: 1, summary: '', created_at: 5, failure: null, runId: null }]);
  assert.equal(row.ok, true);
  assert.equal(row.detail, null);
  assert.equal(row.runId, null);
});

test('the rows arrive newest first and are not re-sorted into a different order', () => {
  const rows = activityRows([
    { op_id: 'a', kind: 'snapshot', ok: 1, summary: '', created_at: 300, failure: null, runId: null },
    { op_id: 'b', kind: 'snapshot', ok: 1, summary: '', created_at: 100, failure: null, runId: null },
  ]);
  assert.deepEqual(rows.map((r) => r.id), ['a', 'b']);
});

test('the browser actually calls the route that has been serving this all along', () => {
  const api = readFileSync(join(WEB, 'src', 'lib', 'api.ts'), 'utf8');
  assert.match(api, /studio\/diagnostics/, 'nothing in apps/web had ever called it');
  assert.match(api, /fetchStudioDiagnostics/);
});

test('the panel is mounted in a drawer a user can open', () => {
  // The defect this whole section exists for: a built, tested, served capability with no entry
  // point. A component nothing renders is the same as no component.
  const ws = readFileSync(join(WEB, 'src', 'routes', 'workspace.tsx'), 'utf8');
  assert.match(ws, /<StudioActivity/, 'the panel must be rendered, not merely imported');
  assert.match(ws, /drawer === 'history'/);
  assert.match(ws, /'history'/);
  // And reachable by name, the way every other drawer is.
  assert.match(ws, /id: 'ws-history'/, 'the command palette must be able to open it');
});

test('the drawer name is one this build will accept back out of storage', () => {
  // readViewChoice validates against DRAWERS: a name added to the union and not to that list is
  // a drawer that never reopens, silently, only for people who had it open.
  const ws = readFileSync(join(WEB, 'src', 'routes', 'workspace.tsx'), 'utf8');
  const list = ws.slice(ws.indexOf('const DRAWERS ='), ws.indexOf('const DRAWERS =') + 200);
  assert.match(list, /'history'/, 'DRAWERS must include every drawer the union has');
});
