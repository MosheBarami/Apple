/**
 * BENCH-RESET ONLY RESETS A BENCHMARK PROJECT.
 *
 * `/bench-reset` (reached by the admin-key route `POST /api/admin/bench-reset/:id` and the owner's
 * `bench/reset`) deletes a project's conversation, memory, op log and every checkpoint but the
 * benchmark's baseline, and empties the place. It exists for the owner benchmark, whose protocol is
 * "reset, then restore `bench-baseline`". The admin key reaches ANY project by id, so without a scope
 * the route could wipe a customer's history (security.test.mjs A4, reviewed 2026-10-03). The scope is
 * the benchmark's own mark: a project with no `bench-baseline` checkpoint is not a benchmark project.
 *
 * Driven against the real SessionDO over a real SQLite.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { sessionHarness } from './session-harness.mjs';

function withHistory() {
  // Studio away: the reset would otherwise empty a place that never answers. The scope is the subject.
  const h = sessionHarness({ store: [['pluginLastSeen', 0]] });
  h.session.sql.exec(`insert into messages (id, role, content, created_at) values ('m1', 'user', 'make me a castle', 1)`);
  return h;
}
const count = (h) => h.session.sql.exec('select count(*) as n from messages').toArray()[0].n;
const reset = (h) => h.session.fetch(new Request('https://do/bench-reset', { method: 'POST' }));

test('a project with no bench-baseline checkpoint is refused, and its conversation survives', async () => {
  const h = withHistory();
  const res = await reset(h);
  assert.equal(res.status, 409);
  const body = await res.json();
  assert.equal(body.ok, false);
  assert.match(body.error, /bench-baseline/);
  assert.equal(count(h), 1, 'the conversation was not deleted');
});

test('CONTROL: a benchmark project (it has bench-baseline) is reset', async () => {
  // Without this the test above would hold on a handler that refused every reset.
  const h = withHistory();
  h.session.sql.exec(`insert into checkpoints (id, label, kind, created_at) values ('cp-base', 'bench-baseline', 'manual', 1)`);
  const res = await reset(h);
  const body = await res.json();
  assert.equal(body.reset, true);
  assert.equal(count(h), 0, 'the conversation was cleared');
  assert.equal(h.session.sql.exec(`select count(*) as n from checkpoints where label = 'bench-baseline'`).toArray()[0].n, 1, 'the baseline stays');
});
