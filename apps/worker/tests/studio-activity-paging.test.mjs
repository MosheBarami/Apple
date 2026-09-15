/**
 * THE OP LOG IS A HISTORY, SO IT HAS TO BE READABLE PAST THE FIRST SCREEN.
 *
 * Every Studio op is recorded, and `/studio/diagnostics` served exactly the last 25 with no way to
 * ask for more. Twenty-five ops is a few minutes of one build: a user looking for the change that
 * broke their place could not reach it, and nothing said the list had been cut — the payload
 * looked complete, which is the worse of the two failures.
 *
 * Real SessionDO, real SQLite, real inserts through execStudioOp.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { sessionHarness, runStudioOp } from './session-harness.mjs';

async function seedOps(h, n) {
  for (let i = 0; i < n; i++) {
    await runStudioOp(h, { op: 'edit_script', path: `game.Workspace.S${i}` }, { ok: true });
  }
}

const diagnostics = async (h, query = '') => await (await h.session.fetch(new Request(`https://do/studio/diagnostics${query}`))).json();

test('the default page is still the last 25, so nothing that reads it today changes', async () => {
  const h = sessionHarness();
  await seedOps(h, 30);
  const body = await diagnostics(h);
  assert.equal(body.recentOps.length, 25);
});

test('a caller can ask for more than the first screen', async () => {
  const h = sessionHarness();
  await seedOps(h, 60);
  const body = await diagnostics(h, '?limit=50');
  assert.equal(body.recentOps.length, 50, 'the page size must be askable — 25 was a hard ceiling');
});

test('a list that was cut says so, rather than looking complete', async () => {
  // The distinction the whole cursor exists to keep: "these are all the ops" and "these are the
  // ops that fitted" must not be the same payload.
  const h = sessionHarness();
  await seedOps(h, 30);
  const full = await diagnostics(h, '?limit=30');
  assert.equal(full.nextBefore, null, 'a complete list must not offer a next page');

  const cut = await diagnostics(h, '?limit=10');
  assert.ok(cut.nextBefore, 'a truncated list must carry the cursor that continues it');
});

test('the cursor continues where the page ended, with no row repeated or skipped', async () => {
  const h = sessionHarness();
  await seedOps(h, 12);

  const first = await diagnostics(h, '?limit=5');
  const second = await diagnostics(h, `?limit=5&before=${first.nextBefore}`);
  const third = await diagnostics(h, `?limit=5&before=${second.nextBefore}`);

  const ids = [...first.recentOps, ...second.recentOps, ...third.recentOps].map((o) => o.op_id);
  assert.equal(ids.length, 12, `paged through ${ids.length} rows, expected all 12`);
  assert.equal(new Set(ids).size, 12, 'a row must not appear on two pages');
  assert.equal(third.nextBefore, null, 'the last page must say it is the last page');
});

test('the page size is bounded, so one query cannot ask for the whole database', async () => {
  const h = sessionHarness();
  await seedOps(h, 3);
  const body = await diagnostics(h, '?limit=100000');
  assert.ok(body.limit <= 200, `limit came back as ${body.limit}`);
});

test('a nonsense cursor is refused rather than silently answered with the newest page', async () => {
  // Answering a bad cursor with page one makes an infinite scroll loop forever over the same rows.
  const h = sessionHarness();
  await seedOps(h, 3);
  const body = await diagnostics(h, '?before=not-a-number');
  assert.equal(body.error, 'bad cursor', JSON.stringify(body).slice(0, 200));
});
