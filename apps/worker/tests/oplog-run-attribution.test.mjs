/**
 * THE HISTORY ROW MUST NAME THE RUN THAT MADE THE CHANGE.
 *
 * Live ops are attributed and that attribution is load-bearing: `PendingOp.runId` is what
 * `partitionOpsByRun` uses to stop a cancelled run's queued mutations reaching the place. The
 * RECORD threw it away. The oplog insert wrote op_id, kind, ok, summary, created_at and failure,
 * so nothing in a project's history could say which run did the thing it describes.
 *
 * The user-visible consequence was written down in the product itself: the workspace's search
 * result handler said 'the oplog row carries no anchor to a message' and toasted "the result line
 * is the whole of it" instead of opening the run. A person who searches for "deleted the
 * spawn platform" and finds it could not get to the conversation that caused it.
 *
 * These drive the REAL SessionDO over a REAL SQLite. A fake `sql` that answers every read with an
 * empty array would pass every one of these with the column still missing.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { sessionHarness, runStudioOp, rows } from './session-harness.mjs';

test('the op log has a run_id column', () => {
  const h = sessionHarness();
  const cols = rows(h, `select name from pragma_table_info('oplog')`).map((r) => r.name);
  assert.ok(cols.includes('run_id'), `oplog columns are ${cols.join(', ')}`);
});

test('a project that predates the column gets it on the next boot', async () => {
  // `create table if not exists` does nothing at all to a table that already exists, so every
  // project created before this change would keep the old six columns forever without an
  // explicit alter. This is the migration, proven on a database that really has the old shape.
  const { makeSql } = await import('./session-harness.mjs');
  const sql = makeSql();
  sql.exec(`create table oplog(
      id integer primary key autoincrement, op_id text, kind text, ok integer,
      summary text, created_at integer not null)`);
  sql.exec(`insert into oplog(op_id, kind, ok, summary, created_at) values('old','edit_script',1,'before the migration',1)`);
  sessionHarness({ sql });
  const cols = sql.exec(`select name from pragma_table_info('oplog')`).toArray().map((r) => r.name);
  assert.ok(cols.includes('run_id'), 'the alter-table guard must add run_id to an existing table');
  // The rows that were already there survive, with no run to name.
  const old = sql.exec(`select op_id, run_id from oplog`).toArray();
  assert.equal(old.length, 1);
  assert.equal(old[0].op_id, 'old');
  assert.equal(old[0].run_id, null);
});

test('an op performed during a run is recorded against that run', async () => {
  const h = sessionHarness();
  h.session.currentMsgId = 'msg_abc';
  await runStudioOp(h, { op: 'edit_script', path: 'game.Workspace.Door' });
  const [row] = rows(h, `select op_id, kind, ok, run_id from oplog order by id desc limit 1`);
  assert.equal(row.kind, 'edit_script');
  assert.equal(row.ok, 1);
  assert.equal(row.run_id, 'msg_abc', 'the row must name the run that made the change');
});

test('an op performed outside a run records no run, rather than inheriting the last one', async () => {
  // This is the same distinction op-attribution.ts exists to keep: a checkpoint taken between
  // runs belongs to NO run, and claiming it belonged to the previous one would send a user who
  // clicks the history row into a conversation that did not cause it.
  const h = sessionHarness();
  h.session.currentMsgId = 'msg_abc';
  await runStudioOp(h, { op: 'edit_script', path: 'a' });
  h.session.currentMsgId = undefined;
  await runStudioOp(h, { op: 'snapshot', root: 'game' });
  const [latest] = rows(h, `select kind, run_id from oplog order by id desc limit 1`);
  assert.equal(latest.kind, 'snapshot');
  assert.equal(latest.run_id, null);
});

test('the diagnostics payload carries the run, so a history list can link to it', async () => {
  const h = sessionHarness();
  h.session.currentMsgId = 'msg_diag';
  await runStudioOp(h, { op: 'set_properties', path: 'game.Workspace.Part' });
  const res = await h.session.fetch(new Request('https://do/studio/diagnostics'));
  const body = await res.json();
  assert.equal(body.recentOps.length, 1);
  assert.equal(body.recentOps[0].runId, 'msg_diag', 'recentOps must expose the run id to the UI');
});

test('an activity search hit is anchored to the run that produced it', async () => {
  const h = sessionHarness();
  h.session.currentMsgId = 'msg_search';
  await runStudioOp(h, { op: 'edit_script', path: 'x' }, { ok: false, error: 'the portal script would not compile' });
  // Customer search uses the visible work label; raw failure text stays private.
  const res = await h.session.fetch(new Request('https://do/search?q=script'));
  const body = await res.json();
  const hit = body.results.find((r) => r.type === 'activity');
  assert.ok(hit, `no activity hit in ${JSON.stringify(body.results)}`);
  assert.equal(hit.messageId, 'msg_search', 'the activity record must carry the run as its messageId');
});

test('an activity record with no run carries no messageId, so the UI can still say so', async () => {
  // The "nowhere to go" branch in the workspace must keep meaning something. If every record
  // claimed an anchor, a click would scroll to a message that does not exist.
  const h = sessionHarness();
  h.session.currentMsgId = undefined;
  await runStudioOp(h, { op: 'snapshot', root: 'game' }, { ok: false, error: 'the portal is too large to snapshot' });
  const res = await h.session.fetch(new Request('https://do/search?q=game'));
  const body = await res.json();
  const hit = body.results.find((r) => r.type === 'activity');
  assert.ok(hit);
  assert.equal(hit.messageId, undefined);
});
