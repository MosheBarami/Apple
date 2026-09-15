/**
 * A CHECKPOINT CAN SAY WHAT IT IS.
 *
 * There was no description anywhere on any snapshot: CheckpointMeta was {id, label, createdAt,
 * kind, scriptCount, instanceCount, sizeBytes} and the label was capped at 60 characters. What the
 * drawer showed under each name was auto-derived metadata — a timestamp and two counts — not one
 * word about what the snapshot contains or why it was taken.
 *
 * The automatic ones were the worse half. Every pre-run checkpoint a project has is called "before
 * Apple changes", so a list of them is twenty identical rows, and the user restoring one is picking
 * by timestamp alone. The request that prompted it was in scope on that very line and thrown away.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sessionHarness, makeSql, answerNextOp, rows } from './session-harness.mjs';

const SESSION = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'do', 'session.ts'), 'utf8');

const SNAPSHOT = { scriptCount: 1, instanceCount: 4 };

async function take(h, label, kind = 'manual', meta = {}) {
  const pending = h.session.createCheckpoint(label, kind, meta);
  await answerNextOp(h, { ok: true, data: SNAPSHOT });
  const cp = await pending;
  assert.ok(!('error' in cp), JSON.stringify(cp));
  return cp;
}

test('the checkpoints table has a description column', () => {
  const h = sessionHarness();
  const cols = rows(h, `select name from pragma_table_info('checkpoints')`).map((r) => r.name);
  assert.ok(cols.includes('description'), `checkpoint columns are ${cols.join(', ')}`);
});

test('a project that predates the column gets it on the next boot', () => {
  const sql = makeSql();
  sql.exec(`create table checkpoints(
      id text primary key, label text not null, kind text not null,
      script_count integer default 0, instance_count integer default 0,
      size_bytes integer default 0, created_at integer not null)`);
  sessionHarness({ sql });
  const cols = sql.exec(`select name from pragma_table_info('checkpoints')`).toArray().map((r) => r.name);
  assert.ok(cols.includes('description'));
});

test('a description a person wrote is stored and comes back', async () => {
  const h = sessionHarness();
  const cp = await take(h, 'before the portal', 'manual', {
    description: 'The lobby is finished and the arena is empty. Taking this before I try the teleport.',
  });
  const [row] = rows(h, `select description from checkpoints where id = ?`, cp.id);
  assert.match(row.description, /before I try the teleport/);
  assert.equal(cp.description, row.description, 'the meta the browser gets must carry it too');
  const body = await (await h.session.fetch(new Request('https://do/checkpoints'))).json();
  assert.equal(body.checkpoints[0].description, row.description);
});

test('no description is null, not an empty string', async () => {
  // "" and "nobody wrote one" would render the same and mean different things.
  const h = sessionHarness();
  const cp = await take(h, 'quick save', 'manual', { description: '   ' });
  const [row] = rows(h, `select description from checkpoints where id = ?`, cp.id);
  assert.equal(row.description, null);
  assert.equal(cp.description, null);
});

test('a description is capped rather than rejected', async () => {
  const h = sessionHarness();
  const cp = await take(h, 'long one', 'manual', { description: 'x'.repeat(5000) });
  assert.ok(cp.description.length <= 500, `kept ${cp.description.length} characters`);
});

test('the websocket frame carries a description the user typed', async () => {
  const h = sessionHarness();
  const pending = h.session.webSocketMessage(
    h.ws,
    JSON.stringify({ type: 'checkpoint_create', label: 'mine', description: 'right before the doors went in' }),
  );
  await answerNextOp(h, { ok: true, data: SNAPSHOT });
  await pending;
  const [row] = rows(h, `select label, description from checkpoints order by created_at desc limit 1`);
  assert.equal(row.label, 'mine');
  assert.equal(row.description, 'right before the doors went in');
});

test('the HTTP route carries one too', async () => {
  const h = sessionHarness();
  const pending = h.session.fetch(
    new Request('https://do/checkpoint', { method: 'POST', body: JSON.stringify({ label: 'via http', description: 'the state before the refactor' }) }),
  );
  await answerNextOp(h, { ok: true, data: SNAPSHOT });
  await pending;
  const [row] = rows(h, `select description from checkpoints order by created_at desc limit 1`);
  assert.equal(row.description, 'the state before the refactor');
});

test('an automatic checkpoint says what the run was about to do', () => {
  // Every pre-run checkpoint is labelled "before Apple changes". Without a description a list of
  // them is twenty identical rows and restoring one is picking by timestamp alone. The sentence
  // comes from the user's own request, which is already in scope on that line — not a model call.
  const at = SESSION.indexOf("'before Apple changes'");
  assert.ok(at > 0, 'the pre-run checkpoint is gone — this test is measuring nothing');
  const call = SESSION.slice(at, at + 400);
  assert.match(call, /description:/, 'the pre-run checkpoint must carry a description');
  assert.match(call, /intent|request|text/, 'and it must come from what the user actually asked for');
});
