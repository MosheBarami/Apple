/**
 * THE INBOX, EXECUTED - against a real SQL engine, not a fake that records strings.
 *
 * The properties here live in WHERE clauses, and a hand-written fake would pass whether a clause
 * bound one column or none. `tests/stubs/d1.mjs` runs node:sqlite, the same engine family D1 is
 * built on, for the same reason memory-store.test.mjs does.
 *
 * WHAT IS BEING PROTECTED:
 *
 *   1. ONE PERSON'S INBOX. Every read and every write binds `recipient_id`. An inbox is the
 *      densest concentration of "who did what with whom" this product has - a mention says who is
 *      on a project, a security event says when a key moved - so the negative case is checked by
 *      COUNTING ROWS IN THE RAW TABLE, not by trusting the function's own return value. A function
 *      that reported 0 while writing to somebody else's row would pass the weaker test.
 *   2. A REPEAT IS A COUNT, NOT A NEW LINE - but only while the line is unread. Bumping a counter
 *      on a row the person already dismissed is a delivery to a place nobody looks, and that is
 *      the case a naive `on conflict do update` gets wrong.
 *   3. A HELD NOTIFICATION IS HELD. Not listed, not counted in the badge, and not consumable by
 *      "mark all read" - otherwise quiet hours become a label rather than a behaviour, and the
 *      thing a person was not shown is marked as seen.
 *
 * Run with:  node --test           (from apps/worker)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { d1, countRows } from './stubs/d1.mjs';

const WORKER = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(mkdtempSync(join(tmpdir(), 'notifstore-')), 'store.mjs');
execFileSync(join(WORKER, 'node_modules', '.bin', 'esbuild'),
  [join(WORKER, 'src', 'notification-store.ts'), '--bundle', '--format=esm', '--target=es2022', '--outfile=' + out],
  { cwd: WORKER, stdio: 'pipe' });
const S = await import(`file://${out}`);

const planOut = join(mkdtempSync(join(tmpdir(), 'notifplan-')), 'plan.mjs');
execFileSync(join(WORKER, 'node_modules', '.bin', 'esbuild'),
  [join(WORKER, 'src', 'notifications.ts'), '--bundle', '--format=esm', '--target=es2022', '--outfile=' + planOut],
  { cwd: WORKER, stdio: 'pipe' });
const N = await import(`file://${planOut}`);

const T0 = Date.parse('2026-06-15T12:00:00Z');
const HOUR = 3_600_000;

async function store() {
  const db = d1();
  await S.ensureNotificationTables(db);
  return db;
}

/** A planned notification, built through the real policy so the store is fed what it is fed. */
function planned(over = {}) {
  const r = N.planNotification(
    {
      kind: 'run_failed',
      recipientId: 'user-a',
      actorId: 'someone-else',
      projectId: 'proj-1',
      projectName: 'Tower Defence',
      subject: 'run-1',
      title: 'Your build failed',
      body: 'The place was not changed.',
      at: T0,
      ...over,
    },
    over.prefs ?? {},
    { now: over.now ?? T0 },
  );
  assert.equal(r.ok, true, `the fixture itself was refused: ${r.reason}`);
  return r.notification;
}

// ---------------------------------------------------------------------------------------------
// 1. one person's inbox
// ---------------------------------------------------------------------------------------------

test('a listing returns only the rows addressed to the caller', async () => {
  const db = await store();
  await S.deliverNotification(db, planned({ recipientId: 'user-a', subject: 'run-a' }), { now: T0 });
  await S.deliverNotification(db, planned({ recipientId: 'user-b', subject: 'run-b' }), { now: T0 });

  const mine = await S.listNotifications(db, 'user-a', { now: T0 });
  assert.equal(mine.length, 1);
  assert.equal(mine[0].title, 'Your build failed');
  // Both rows really are in the table, so "1" is a filter having worked rather than a write having
  // failed - the distinction a count of the function's own output cannot make.
  assert.equal(countRows(db.raw, 'select count(*) from notifications'), 2);
  assert.equal(await S.unreadCount(db, 'user-a', { now: T0 }), 1);
  assert.equal(await S.unreadCount(db, 'user-b', { now: T0 }), 1);
  db.close();
});

test('marking another person row read changes nothing, and says so', async () => {
  const db = await store();
  const theirs = await S.deliverNotification(db, planned({ recipientId: 'user-b' }), { now: T0 });

  const moved = await S.markRead(db, 'user-a', { ids: [theirs.id], now: T0 + 60_000 });
  assert.equal(moved, 0, 'the count comes from the write, not from the length of the id list');
  // And the row is genuinely untouched in the table.
  assert.equal(countRows(db.raw, 'select count(*) from notifications where read_at is null'), 1);
  assert.equal(await S.unreadCount(db, 'user-b', { now: T0 + 60_000 }), 1);
  db.close();
});

test('an empty or absent recipient reads nothing and writes nothing', async () => {
  const db = await store();
  await S.deliverNotification(db, planned(), { now: T0 });
  assert.deepEqual(await S.listNotifications(db, '', { now: T0 }), []);
  assert.equal(await S.unreadCount(db, '   ', { now: T0 }), 0);
  assert.equal(await S.markRead(db, '', { all: true, now: T0 }), 0);
  assert.equal(countRows(db.raw, 'select count(*) from notifications where read_at is null'), 1);
  db.close();
});

// ---------------------------------------------------------------------------------------------
// 2. a repeat is a count
// ---------------------------------------------------------------------------------------------

test('the same thing reported twice is one row with a count, keeping its id and its place', async () => {
  const db = await store();
  const first = await S.deliverNotification(db, planned({ subject: 'run-1' }), { now: T0 });
  assert.equal(first.created, true);

  const again = await S.deliverNotification(db, planned({ subject: 'run-1', title: 'Your build failed again' }), { now: T0 + HOUR });
  assert.equal(again.created, false);
  assert.equal(again.id, first.id, 'the row keeps its identity');
  assert.equal(again.occurrences, 2);

  const rows = await S.listNotifications(db, 'user-a', { now: T0 + HOUR });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].occurrences, 2);
  assert.equal(rows[0].createdAt, T0, 'it keeps its place in the list rather than jumping to the top');
  assert.equal(rows[0].title, 'Your build failed again', 'the text is refreshed to the newest report');
  // The badge counts the ROW, not the occurrences: one thing is still one thing to look at.
  assert.equal(await S.unreadCount(db, 'user-a', { now: T0 + HOUR }), 1);
  db.close();
});

test('two different runs failing stay two rows', async () => {
  const db = await store();
  await S.deliverNotification(db, planned({ subject: 'run-1' }), { now: T0 });
  await S.deliverNotification(db, planned({ subject: 'run-2' }), { now: T0 + 1000 });
  assert.equal((await S.listNotifications(db, 'user-a', { now: T0 + 2000 })).length, 2);
  assert.equal(await S.unreadCount(db, 'user-a', { now: T0 + 2000 }), 2);
  db.close();
});

test('a row the person has already read does not absorb the next occurrence', async () => {
  const db = await store();
  const first = await S.deliverNotification(db, planned({ subject: 'run-1' }), { now: T0 });
  assert.equal(await S.markRead(db, 'user-a', { ids: [first.id], now: T0 + 60_000 }), 1);

  const next = await S.deliverNotification(db, planned({ subject: 'run-1' }), { now: T0 + 2 * HOUR });
  assert.equal(next.created, true, 'a dismissed row is not where the next failure should land');
  assert.notEqual(next.id, first.id);
  assert.equal(await S.unreadCount(db, 'user-a', { now: T0 + 2 * HOUR }), 1);
  assert.equal(countRows(db.raw, 'select count(*) from notifications'), 2);
  db.close();
});

test('coalescing is bounded: the same subject a week later is news again', async () => {
  const db = await store();
  const first = await S.deliverNotification(db, planned({ subject: 'run-1' }), { now: T0 });
  const later = await S.deliverNotification(db, planned({ subject: 'run-1' }), { now: T0 + S.DEDUPE_WINDOW_MS + 1000 });
  assert.equal(later.created, true);
  assert.notEqual(later.id, first.id);
  // And just inside the window it still coalesces, so the boundary is the boundary.
  const inside = await S.deliverNotification(db, planned({ subject: 'run-1' }), { now: T0 + S.DEDUPE_WINDOW_MS - 1000 });
  assert.equal(inside.created, false);
  assert.equal(inside.id, first.id);
  db.close();
});

// ---------------------------------------------------------------------------------------------
// 3. a held notification is held
// ---------------------------------------------------------------------------------------------

/** A notification arriving inside a 22:00-07:00 quiet window, so the store receives a future deliverAt. */
function heldPlan() {
  const prefs = { delivery: { timezone: 'UTC', quiet_hours: { start: '22:00', end: '07:00' }, digest: 'off', digest_hour: 9 } };
  const night = Date.parse('2026-06-15T23:30:00Z');
  const p = planned({ subject: 'run-held', at: night, now: night, prefs });
  assert.ok(p.deliverAt > night, 'the fixture is not actually held, so this test would prove nothing');
  return p;
}

test('a notification held by quiet hours is neither listed nor counted until it lands', async () => {
  const db = await store();
  const p = heldPlan();
  await S.deliverNotification(db, p, { now: p.createdAt });

  assert.deepEqual(await S.listNotifications(db, 'user-a', { now: p.createdAt }), []);
  assert.equal(await S.unreadCount(db, 'user-a', { now: p.createdAt }), 0);
  // The row exists - it was held, not discarded.
  assert.equal(countRows(db.raw, 'select count(*) from notifications'), 1);
  // Asking for it explicitly shows it, which is what a "scheduled" view would use.
  assert.equal((await S.listNotifications(db, 'user-a', { now: p.createdAt, includeHeld: true })).length, 1);

  // And when the window closes, it is there.
  assert.equal((await S.listNotifications(db, 'user-a', { now: p.deliverAt })).length, 1);
  assert.equal(await S.unreadCount(db, 'user-a', { now: p.deliverAt }), 1);
  db.close();
});

test('mark-all-read does not consume a notification the person was never shown', async () => {
  const db = await store();
  const p = heldPlan();
  await S.deliverNotification(db, p, { now: p.createdAt });
  await S.deliverNotification(db, planned({ subject: 'run-visible' }), { now: p.createdAt });

  const moved = await S.markRead(db, 'user-a', { all: true, now: p.createdAt });
  assert.equal(moved, 1, 'only the delivered one');
  assert.equal(await S.unreadCount(db, 'user-a', { now: p.deliverAt }), 1, 'the held one is still unread once it lands');
  db.close();
});

// ---------------------------------------------------------------------------------------------
// grouping, corruption, pruning
// ---------------------------------------------------------------------------------------------

test('grouping collapses by kind and project, and totals the occurrences', async () => {
  const db = await store();
  await S.deliverNotification(db, planned({ kind: 'mention', subject: 'c1' }), { now: T0 });
  await S.deliverNotification(db, planned({ kind: 'mention', subject: 'c2' }), { now: T0 + 1000 });
  await S.deliverNotification(db, planned({ kind: 'mention', subject: 'c2' }), { now: T0 + 2000 }); // a repeat
  await S.deliverNotification(db, planned({ kind: 'run_failed', subject: 'run-1' }), { now: T0 + 3000 });
  await S.deliverNotification(db, planned({ kind: 'mention', projectId: 'proj-2', subject: 'c3' }), { now: T0 + 4000 });

  const groups = await S.groupNotifications(db, 'user-a', { now: T0 + 5000 });
  const byKey = Object.fromEntries(groups.map((g) => [`${g.kind}:${g.projectId}`, g]));
  assert.equal(groups.length, 3);
  assert.equal(byKey['mention:proj-1'].total, 3, 'two rows, one of them seen twice');
  assert.equal(byKey['mention:proj-1'].unread, 2, 'unread counts ROWS');
  assert.equal(byKey['run_failed:proj-1'].total, 1);
  assert.equal(byKey['mention:proj-2'].total, 1);
  db.close();
});

test('a row whose kind nothing recognises is dropped, not thrown on', async () => {
  const db = await store();
  await S.deliverNotification(db, planned({ subject: 'good' }), { now: T0 });
  // The column is `text`. A row from a migration, a future version of this file, or a hand-edited
  // restore can hold anything, and one unreadable row must not take the whole inbox down.
  db.raw
    .prepare(
      `insert into notifications(id, recipient_id, kind, severity, title, body, project_id, project_name, subject, href, dedupe_key, group_key, created_at, updated_at, deliver_at, read_at, occurrences) values(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    )
    .run('corrupt', 'user-a', 'run_evaporated', 'info', 't', null, null, null, null, '/app', 'k', 'g', T0, T0, T0, null, 1);

  const rows = await S.listNotifications(db, 'user-a', { now: T0 });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].subject, 'good');
  assert.equal((await S.groupNotifications(db, 'user-a', { now: T0 })).length, 1);
  db.close();
});

test('the sweeper drops read rows sooner than unread ones, and never an unread one early', async () => {
  const db = await store();
  const read = await S.deliverNotification(db, planned({ subject: 'old-read' }), { now: T0 });
  await S.markRead(db, 'user-a', { ids: [read.id], now: T0 });
  await S.deliverNotification(db, planned({ subject: 'old-unread' }), { now: T0 });

  // A moment past the read horizon but well inside the unread one.
  const now = T0 + S.RETAIN_READ_MS + 1000;
  assert.ok(now < T0 + S.RETAIN_UNREAD_MS, 'the fixture must sit between the two horizons');
  assert.equal(await S.pruneNotifications(db, { now }), 1);
  assert.equal(countRows(db.raw, 'select count(*) from notifications'), 1);
  assert.equal(countRows(db.raw, "select count(*) from notifications where subject = 'old-unread'"), 1);
  db.close();
});

test('a listing is bounded, and an absurd limit does not become the limit', async () => {
  const db = await store();
  for (let i = 0; i < 5; i += 1) await S.deliverNotification(db, planned({ subject: `run-${i}` }), { now: T0 + i });
  assert.equal((await S.listNotifications(db, 'user-a', { now: T0 + 10, limit: 2 })).length, 2);
  assert.equal((await S.listNotifications(db, 'user-a', { now: T0 + 10, limit: 1e9 })).length, 5);
  assert.equal((await S.listNotifications(db, 'user-a', { now: T0 + 10, limit: Number.NaN })).length, 5);
  db.close();
});
