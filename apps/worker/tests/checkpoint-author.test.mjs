/**
 * A CHECKPOINT MUST NAME WHO TOOK IT.
 *
 * The checkpoints table had no author column, so the product guessed from the KIND:
 * `r.kind === 'manual' ? 'you' : 'apple'`. On a shared project that is a false statement about a
 * real person's work — every teammate's manual checkpoint was labelled as yours, and the one
 * before a restore that discards someone's afternoon is exactly the row where "who did this" is
 * the question being asked.
 *
 * Real SessionDO, real SQLite: a fake `sql` that answers every read with an empty array cannot
 * tell a column that exists from one that does not, which is this entire class of defect.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { sessionHarness, makeSql, answerNextOp, rows } from './session-harness.mjs';

const SNAPSHOT = { scriptCount: 1, instanceCount: 4 };

async function take(h, label, kind = 'manual', authorId) {
  const pending = h.session.createCheckpoint(label, kind, authorId);
  await answerNextOp(h, { ok: true, data: SNAPSHOT });
  const cp = await pending;
  assert.ok(!('error' in cp), JSON.stringify(cp));
  return cp;
}

test('the checkpoints table has an author column', () => {
  const h = sessionHarness();
  const cols = rows(h, `select name from pragma_table_info('checkpoints')`).map((r) => r.name);
  assert.ok(cols.includes('author_id'), `checkpoint columns are ${cols.join(', ')}`);
});

test('a project that predates the column gets it on the next boot', () => {
  // `create table if not exists` does nothing at all to a table that already exists.
  const sql = makeSql();
  sql.exec(`create table checkpoints(
      id text primary key, label text not null, kind text not null,
      script_count integer default 0, instance_count integer default 0,
      size_bytes integer default 0, created_at integer not null)`);
  sql.exec(`insert into checkpoints(id, label, kind, created_at) values('old','before the migration','manual',1)`);
  sessionHarness({ sql });
  const cols = sql.exec(`select name from pragma_table_info('checkpoints')`).toArray().map((r) => r.name);
  assert.ok(cols.includes('author_id'), 'the alter-table guard must add author_id to an existing table');
  const [old] = sql.exec(`select id, author_id from checkpoints`).toArray();
  assert.equal(old.author_id, null, 'a row from before the column has no author, and must not be given one');
});

test('a checkpoint a person took records that person', async () => {
  const h = sessionHarness();
  const cp = await take(h, 'before the portal', 'manual', 'u-maya');
  const [row] = rows(h, `select author_id from checkpoints where id = ?`, cp.id);
  assert.equal(row.author_id, 'u-maya');
  assert.equal(cp.authorId, 'u-maya', 'and the meta the browser gets says so too');
});

test("Apple's own checkpoint has no human author, rather than being credited to one", async () => {
  // `pre_agent` is taken by the run, not by a person. Attributing it to whoever happened to be
  // connected would put a name on work they did not do.
  const h = sessionHarness();
  const cp = await take(h, 'before Apple changes', 'pre_agent');
  const [row] = rows(h, `select author_id from checkpoints where id = ?`, cp.id);
  assert.equal(row.author_id, null);
  assert.equal(cp.authorId, null);
});

test('the websocket path takes the author from the socket, not from the message', async () => {
  // The frame is written by the browser. Trusting an authorId off the wire would let any member
  // sign a checkpoint with someone else's name.
  const h = sessionHarness();
  const pending = h.session.webSocketMessage(
    h.ws,
    JSON.stringify({ type: 'checkpoint_create', label: 'mine', authorId: 'u-someone-else' }),
  );
  await answerNextOp(h, { ok: true, data: SNAPSHOT });
  await pending;
  const [row] = rows(h, `select label, author_id from checkpoints order by created_at desc limit 1`);
  assert.equal(row.label, 'mine');
  assert.equal(row.author_id, 'u-owner', 'the author is whoever holds the socket');
});

test('the list route carries the author back to the browser', async () => {
  const h = sessionHarness();
  await take(h, 'a', 'manual', 'u-maya');
  const body = await (await h.session.fetch(new Request('https://do/checkpoints'))).json();
  assert.equal(body.checkpoints[0].authorId, 'u-maya');
});

test('the HTTP path records the caller the worker resolved', async () => {
  const h = sessionHarness();
  const pending = h.session.fetch(
    new Request('https://do/checkpoint', { method: 'POST', body: JSON.stringify({ label: 'via http', authorId: 'u-owner' }) }),
  );
  await answerNextOp(h, { ok: true, data: SNAPSHOT });
  await pending;
  const [row] = rows(h, `select author_id from checkpoints order by created_at desc limit 1`);
  assert.equal(row.author_id, 'u-owner');
});

test('search no longer calls a teammate you', async () => {
  // THE LIE, stated exactly: with no author column, `kind === 'manual'` was read as "you took it".
  const h = sessionHarness();
  await take(h, 'the portal checkpoint', 'manual', 'u-maya');
  const res = await h.session.fetch(new Request('https://do/search?q=portal&viewer=u-owner'));
  const body = await res.json();
  const hit = body.results.find((r) => r.type === 'checkpoint');
  assert.ok(hit, JSON.stringify(body.results).slice(0, 300));
  assert.notEqual(hit.author, 'you', "another member's checkpoint must not be attributed to the reader");
  assert.equal(hit.author, 'teammate');
});

test('search still calls your own checkpoint yours', async () => {
  const h = sessionHarness();
  await take(h, 'the portal checkpoint', 'manual', 'u-owner');
  const body = await (await h.session.fetch(new Request('https://do/search?q=portal&viewer=u-owner'))).json();
  const hit = body.results.find((r) => r.type === 'checkpoint');
  assert.equal(hit.author, 'you');
});

test("Apple's checkpoint is still Apple's", async () => {
  const h = sessionHarness();
  await take(h, 'before Apple changes the portal', 'pre_agent');
  const body = await (await h.session.fetch(new Request('https://do/search?q=portal&viewer=u-owner'))).json();
  const hit = body.results.find((r) => r.type === 'checkpoint');
  assert.equal(hit.author, 'apple');
});

test('a checkpoint from before the column claims nobody', async () => {
  // An unattributed row must not be attributed to the reader by default — that is the original
  // defect in a different disguise.
  const h = sessionHarness();
  await take(h, 'the portal checkpoint', 'manual');
  const body = await (await h.session.fetch(new Request('https://do/search?q=portal&viewer=u-owner'))).json();
  const hit = body.results.find((r) => r.type === 'checkpoint');
  assert.notEqual(hit.author, 'you');
});

test('a search with no viewer does not guess one', async () => {
  // If the caller did not say who is reading, "you" cannot be true of anyone.
  const h = sessionHarness();
  await take(h, 'the portal checkpoint', 'manual', 'u-owner');
  const body = await (await h.session.fetch(new Request('https://do/search?q=portal'))).json();
  const hit = body.results.find((r) => r.type === 'checkpoint');
  assert.notEqual(hit.author, 'you');
});
