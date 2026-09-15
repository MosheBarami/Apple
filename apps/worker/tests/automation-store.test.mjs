/**
 * THE STORE, AGAINST A DATABASE — because until this file existed no test imported it at all.
 *
 * `automations.test.mjs` bundles `src/automations.ts` alone, so everything `automation-store.ts`
 * claims about SQL was claimed in prose: the unique `fire_key` that is the whole duplicate-trigger
 * protection had never arbitrated anything, `transferAutomation`'s argument about history had never
 * been checked against a row, and `automationSpend`'s distinction between a run that cost nothing
 * and a run whose cost was never recorded had never been computed.
 *
 * Those are not properties of the TypeScript. They are properties of an `insert or ignore` against
 * a unique index, of a `where owner_id = ?` in an update, and of a `sum(case when credits is null
 * ...)`. So this runs the real statements against node:sqlite — the engine family D1 is built on —
 * through the same stub the collab and memory store tests use.
 *
 * WHAT EACH TEST IS FOR, stated because a test whose motivating failure is not named drifts into a
 * restatement of the code:
 *
 *   - THE LOSER OF A RACE TAKES AN ORDINARY BRANCH. `claimFire` reads its verdict from the write's
 *     `changes`, not from an exception, precisely so the second dispatcher is not on an error path.
 *     Nothing verified that the stub — or D1 — reports `changes = 0` rather than raising. If it
 *     raises, the dispatcher that loses a race dies mid-batch with some automations fired and no
 *     record of which.
 *   - A TRANSFER MOVES THE DEFINITION AND NOT THE BILL. Rewriting the history's `owner_id` would
 *     make last month's spending look like it belonged to somebody who did not authorise it.
 *   - A RUN WHOSE COST WAS NEVER RECORDED IS `unreadable`, NOT ZERO. Adding a zero to a spending
 *     total is how a cost report understates, and the automation path writes a null cost on
 *     purpose — the run is billed inside the session, after the fire returns.
 *
 * Run with:  node --test tests/automation-store.test.mjs      (from apps/worker)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { d1, countRows } from './stubs/d1.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const WORKER = join(HERE, '..');
const out = join(mkdtempSync(join(tmpdir(), 'autom-store-')), 'store.mjs');
execFileSync(join(WORKER, 'node_modules', '.bin', 'esbuild'),
  [join(WORKER, 'src', 'automation-store.ts'), '--bundle', '--format=esm', '--target=es2022', '--outfile=' + out],
  { cwd: WORKER, stdio: 'pipe' });
const S = await import(`file://${out}`);

const outA = join(mkdtempSync(join(tmpdir(), 'autom-policy-')), 'policy.mjs');
execFileSync(join(WORKER, 'node_modules', '.bin', 'esbuild'),
  [join(WORKER, 'src', 'automations.ts'), '--bundle', '--format=esm', '--target=es2022', '--outfile=' + outA],
  { cwd: WORKER, stdio: 'pipe' });
const A = await import(`file://${outA}`);

const ALICE = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const BOB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const PROJECT = '11111111-1111-4111-8111-111111111111';
const NOW = Date.parse('2026-06-15T12:00:00Z');

/**
 * A fresh database with the schema already built.
 *
 * `createAutomationTables` is called through `ensureAutomationTables`, whose memo is keyed on the
 * DATABASE (see schema-once.ts), so a per-test database gets its own schema rather than inheriting
 * a memo from the last one.
 */
async function fresh() {
  const db = d1();
  await S.ensureAutomationTables({ CORPUS: db.CORPUS });
  return db;
}

const env = (db) => ({ CORPUS: db.CORPUS });

/** A stored automation, written through the real save path. */
async function save(db, over = {}, ownerId = ALICE) {
  const r = A.normaliseAutomation(
    {
      name: 'Nightly polish',
      description: 'Tidy the lighting before I get up.',
      prompt: 'Tidy the lighting in the main map.',
      mode: 'stone',
      trigger: 'schedule',
      timezone: 'America/New_York',
      schedule: { every: 'day', hour: 9, minute: 0 },
      ...over,
    },
    { ownerId, projectId: PROJECT, now: NOW },
  );
  assert.equal(r.ok, true, `fixture refused: ${r.reason}`);
  const saved = await S.saveAutomation(env(db), r.automation, A.nextFireAfter(r.automation, NOW).at);
  assert.equal(saved.ok, true, `save refused: ${saved.reason}`);
  return saved.automation;
}

/* ------------------------------------------------- duplicate-trigger protection ---- */

test('two dispatchers claiming one fire: the second is told, not thrown at', async () => {
  const db = await fresh();
  const a = await save(db);
  const key = A.fireKey(a.id, a.nextFireAt);

  const first = await S.claimFire(env(db), a, key, { dueAt: a.nextFireAt, now: NOW });
  assert.equal(first.claimed, true);
  assert.ok(first.executionId, 'the winner needs an execution id to close');

  // THE POINT OF THE WHOLE DESIGN: the loser takes an ordinary branch. A unique-violation raised
  // as an exception would have to be recognised by message — which differs between D1 and this
  // engine — and a catch broad enough for both swallows the failures worth seeing.
  const second = await S.claimFire(env(db), a, key, { dueAt: a.nextFireAt, now: NOW + 40 });
  assert.equal(second.claimed, false);
  assert.equal(second.reason, 'already_fired');

  assert.equal(countRows(db.raw, 'select count(*) as n from automation_runs'), 1,
    'one due instant, one key, one build');
  db.close();
});

test('a DIFFERENT due instant is a different fire — the protection is not a mute button', async () => {
  const db = await fresh();
  const a = await save(db);
  const tomorrow = A.nextFireAfter(a, a.nextFireAt).at;
  assert.ok(tomorrow > a.nextFireAt, 'the next fire is strictly after, by construction');

  assert.equal((await S.claimFire(env(db), a, A.fireKey(a.id, a.nextFireAt), { dueAt: a.nextFireAt, now: NOW })).claimed, true);
  assert.equal((await S.claimFire(env(db), a, A.fireKey(a.id, tomorrow), { dueAt: tomorrow, now: NOW })).claimed, true);
  assert.equal(countRows(db.raw, 'select count(*) as n from automation_runs'), 2);
  db.close();
});

test('an event fire is keyed by its subject, so one build finishing starts it once', async () => {
  const db = await fresh();
  const a = await save(db, { trigger: 'event', event: 'build_failed', schedule: undefined });
  const runA = 'run-aaaa';
  const runB = 'run-bbbb';

  const k = (subject) => A.eventFireKey(a.id, 'build_failed', subject);
  assert.equal((await S.claimFire(env(db), a, k(runA), { dueAt: null, now: NOW })).claimed, true);
  // A RETRIED EMITTER. Same build, same event, same key — and no second build.
  assert.equal((await S.claimFire(env(db), a, k(runA), { dueAt: null, now: NOW + 1000 })).claimed, false);
  // A DIFFERENT build failing is genuinely a second reason to run.
  assert.equal((await S.claimFire(env(db), a, k(runB), { dueAt: null, now: NOW + 2000 })).claimed, true);
  assert.equal(countRows(db.raw, 'select count(*) as n from automation_runs'), 2);
  db.close();
});

/* ----------------------------------------------------------------- the history ---- */

test('finishFire closes the row it was given, and leaves the others open', async () => {
  const db = await fresh();
  const a = await save(db);
  const open = await S.claimFire(env(db), a, 'k-open', { dueAt: null, now: NOW });
  const closed = await S.claimFire(env(db), a, 'k-closed', { dueAt: null, now: NOW + 1 });

  await S.finishFire(env(db), closed.executionId, { outcome: 'failed', now: NOW + 500, error: 'the place was locked', fold: 'repeated' });

  const rows = await S.listExecutions(env(db), ALICE, a.id, 25);
  const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
  assert.equal(byId[closed.executionId].outcome, 'failed');
  assert.equal(byId[closed.executionId].finishedAt, NOW + 500);
  assert.equal(byId[closed.executionId].error, 'the place was locked');
  // The fold travels so "why did this run at 03:30" is answerable from the history.
  assert.equal(byId[closed.executionId].fold, 'repeated');
  assert.equal(byId[open.executionId].outcome, null, 'a fire still running must not read as finished');
  assert.equal(byId[open.executionId].finishedAt, null);
  db.close();
});

test("the history is owner-bound: another account's id does not read it", async () => {
  const db = await fresh();
  const a = await save(db);
  await S.claimFire(env(db), a, 'k1', { dueAt: null, now: NOW });
  assert.equal((await S.listExecutions(env(db), ALICE, a.id, 25)).length, 1);
  // A prompt is the person's own words and a history row carries what it cost them. The automation
  // id being specific is not the same as it being private.
  assert.equal((await S.listExecutions(env(db), BOB, a.id, 25)).length, 0);
  db.close();
});

test('a run whose cost was never recorded is unreadable, not zero', async () => {
  const db = await fresh();
  const a = await save(db);
  const billed = await S.claimFire(env(db), a, 'k-billed', { dueAt: null, now: NOW });
  const unknown = await S.claimFire(env(db), a, 'k-unknown', { dueAt: null, now: NOW + 1 });
  const failed = await S.claimFire(env(db), a, 'k-failed', { dueAt: null, now: NOW + 2 });

  await S.finishFire(env(db), billed.executionId, { outcome: 'ok', now: NOW + 10, credits: 42 });
  // The automation path writes this on purpose: the run is billed inside the session, after the
  // fire returns, and this layer never learns the number.
  await S.finishFire(env(db), unknown.executionId, { outcome: 'ok', now: NOW + 11, credits: null });
  await S.finishFire(env(db), failed.executionId, { outcome: 'failed', now: NOW + 12, error: 'nope' });

  const spend = await S.automationSpend(env(db), ALICE, a.id, NOW - 1);
  assert.equal(spend.runs, 3);
  assert.equal(spend.credits, 42, 'a null cost must not be added as a zero — that is how a report understates');
  assert.equal(spend.unreadable, 2, 'both the unbilled run and the failed one have no readable cost');
  assert.equal(spend.failures, 1);
  db.close();
});

test('firesSince counts from the instant given, which is what the daily cap is checked against', async () => {
  const db = await fresh();
  const a = await save(db);
  await S.claimFire(env(db), a, 'y1', { dueAt: null, now: NOW - 86_400_000 });
  await S.claimFire(env(db), a, 't1', { dueAt: null, now: NOW });
  await S.claimFire(env(db), a, 't2', { dueAt: null, now: NOW + 60_000 });
  assert.equal(await S.firesSince(env(db), a.id, NOW - 1), 2, "yesterday's fires must not spend today's allowance");
  assert.equal(await S.firesSince(env(db), a.id, NOW - 86_400_001), 3);
  db.close();
});

/* ------------------------------------------------------------------- transfer ---- */

test('a transfer moves the definition and leaves the bill with the owner it ran under', async () => {
  const db = await fresh();
  const a = await save(db);
  await S.claimFire(env(db), a, 'k1', { dueAt: null, now: NOW });

  const res = await S.transferAutomation(env(db), ALICE, a.id, BOB, { newOwnerHasAccess: true, now: NOW + 5 });
  assert.equal(res.ok, true);

  assert.equal(countRows(db.raw, 'select count(*) as n from automations where owner_id = ?', BOB), 1);
  assert.equal(countRows(db.raw, 'select count(*) as n from automations where owner_id = ?', ALICE), 0);
  assert.equal(countRows(db.raw, 'select count(*) as n from automation_runs where owner_id = ?', ALICE), 1,
    "rewriting the history would make last month's spending look like somebody else authorised it");
  // And the store's own owner-bound reads agree with the table.
  assert.equal(await S.getAutomation(env(db), ALICE, a.id), null);
  assert.ok(await S.getAutomation(env(db), BOB, a.id));
  db.close();
});

test('a transfer to somebody without project access is refused, not accepted and stranded', async () => {
  const db = await fresh();
  const a = await save(db);
  const res = await S.transferAutomation(env(db), ALICE, a.id, BOB, { newOwnerHasAccess: false, now: NOW + 5 });
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'no_access');
  // An automation whose owner cannot open the project can never fire. Accepting the transfer would
  // look like it worked and produce a standing actor that is permanently dead.
  assert.equal(countRows(db.raw, 'select count(*) as n from automations where owner_id = ?', ALICE), 1);
  db.close();
});

test('a transfer to the current owner is refused by name rather than silently doing nothing', async () => {
  const db = await fresh();
  const a = await save(db);
  const res = await S.transferAutomation(env(db), ALICE, a.id, ALICE, { newOwnerHasAccess: true, now: NOW + 5 });
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'same_owner');
  db.close();
});

test("a transfer of somebody else's automation is not found, and changes nothing", async () => {
  const db = await fresh();
  const a = await save(db);
  // Bob hands Alice's automation to Carol. The update binds `owner_id`, so it changes no rows and
  // `not_found` is the answer — the same answer a caller gets for an id that does not exist, which
  // is what stops the route confirming somebody else's standing actor to them.
  const CAROL = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  const res = await S.transferAutomation(env(db), BOB, a.id, CAROL, { newOwnerHasAccess: true, now: NOW + 5 });
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'not_found');
  assert.equal(countRows(db.raw, 'select count(*) as n from automations where owner_id = ?', ALICE), 1);
  db.close();
});

/* ------------------------------------------------- pause, and the dispatcher's reads ---- */

test('pausing is one column and leaves the next-fire pointer alone, so resuming keeps its place', async () => {
  const db = await fresh();
  const a = await save(db);
  const due = a.nextFireAt;
  assert.ok(due, 'a daily schedule has a next fire');

  assert.equal(await S.setAutomationEnabled(env(db), ALICE, a.id, false, NOW + 1), true);
  const paused = await S.getAutomation(env(db), ALICE, a.id);
  assert.equal(paused.enabled, false);
  assert.equal(paused.nextFireAt, due, 'resuming must not lose its place');
  // And the dispatcher's read excludes it, which is what makes the switch mean anything.
  assert.equal((await S.dueAutomations(env(db), due + 1, 25)).length, 0);

  assert.equal(await S.setAutomationEnabled(env(db), ALICE, a.id, true, NOW + 2), true);
  assert.equal((await S.dueAutomations(env(db), due + 1, 25)).length, 1);
  // Somebody else's id must not be able to stop it.
  assert.equal(await S.setAutomationEnabled(env(db), BOB, a.id, false, NOW + 3), false);
  db.close();
});

test('deleting the definition keeps the record of what it spent', async () => {
  const db = await fresh();
  const a = await save(db);
  await S.claimFire(env(db), a, 'k1', { dueAt: null, now: NOW });
  assert.equal(await S.deleteAutomation(env(db), ALICE, a.id), true);
  assert.equal(countRows(db.raw, 'select count(*) as n from automations'), 0);
  assert.equal(countRows(db.raw, 'select count(*) as n from automation_runs'), 1,
    'a spender who can erase the evidence by deleting the automation is a spender with no record');
  assert.equal(await S.deleteAutomation(env(db), ALICE, a.id), false, 'a second delete removed nothing and says so');
  db.close();
});

test('the per-owner cap is checked on create and not on edit', async () => {
  const db = await fresh();
  const first = await save(db);
  for (let i = 1; i < S.AUTOMATIONS_PER_OWNER_MAX; i += 1) await save(db, { name: `Polish ${i}` });

  const over = A.normaliseAutomation(
    { name: 'One too many', prompt: 'x', mode: 'stone', trigger: 'manual', timezone: 'UTC' },
    { ownerId: ALICE, projectId: PROJECT, now: NOW },
  );
  const refused = await S.saveAutomation(env(db), over.automation, null);
  assert.equal(refused.ok, false);
  assert.equal(refused.reason, 'too_many');

  // An edit refused because the account is at its limit is an edit refused for a reason that has
  // nothing to do with it — and would strand somebody at the cap unable to fix what they have.
  const edit = A.normaliseAutomation(
    { name: 'Renamed', prompt: first.prompt, mode: first.mode, trigger: 'manual', timezone: first.timezone },
    { ownerId: ALICE, projectId: PROJECT, now: NOW + 1, id: first.id, createdAt: first.createdAt },
  );
  const saved = await S.saveAutomation(env(db), edit.automation, null);
  assert.equal(saved.ok, true);
  assert.equal(saved.automation.name, 'Renamed');
  db.close();
});

test('dueAutomations is bounded and ordered by when the fire was due', async () => {
  const db = await fresh();
  const a = await save(db, { name: 'Later', schedule: { every: 'day', hour: 9, minute: 0 } });
  const b = await save(db, { name: 'Sooner', schedule: { every: 'hour', minute: 5 } });
  const horizon = Math.max(a.nextFireAt, b.nextFireAt) + 1;

  const due = await S.dueAutomations(env(db), horizon, 25);
  assert.deepEqual(due.map((r) => r.name), ['Sooner', 'Later'], 'the oldest due fire is taken first');
  assert.equal((await S.dueAutomations(env(db), horizon, 1)).length, 1, 'a cron invocation has a wall-clock limit');
  // Nothing is due before its instant, which is what stops a dispatcher firing on every tick.
  assert.equal((await S.dueAutomations(env(db), Math.min(a.nextFireAt, b.nextFireAt) - 1, 25)).length, 0);
  db.close();
});

test('automationsForEvent returns only enabled event automations in that project', async () => {
  const db = await fresh();
  const wanted = await save(db, { name: 'On failure', trigger: 'event', event: 'build_failed', schedule: undefined });
  await save(db, { name: 'On success', trigger: 'event', event: 'build_succeeded', schedule: undefined });
  const off = await save(db, { name: 'Paused', trigger: 'event', event: 'build_failed', schedule: undefined });
  await S.setAutomationEnabled(env(db), ALICE, off.id, false, NOW + 1);
  // A scheduled automation is not an event automation even if its row carries an event column.
  await save(db, { name: 'Scheduled' });

  const rows = await S.automationsForEvent(env(db), PROJECT, 'build_failed', 10);
  assert.deepEqual(rows.map((r) => r.id), [wanted.id]);
  assert.equal((await S.automationsForEvent(env(db), 'no-such-project', 'build_failed', 10)).length, 0);
  db.close();
});

test('pruneExecutions keeps a quarter of history and says how much it removed', async () => {
  const db = await fresh();
  const a = await save(db);
  await S.claimFire(env(db), a, 'old', { dueAt: null, now: NOW - S.RETAIN_RUNS_MS - 1 });
  await S.claimFire(env(db), a, 'recent', { dueAt: null, now: NOW - 1000 });
  assert.equal(await S.pruneExecutions(env(db), NOW), 1);
  assert.equal(countRows(db.raw, 'select count(*) as n from automation_runs'), 1);
  db.close();
});
