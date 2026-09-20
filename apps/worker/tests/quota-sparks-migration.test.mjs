/**
 * A USER WHOSE DO PREDATES THE RENAME COULD NOT SPEND A CREDIT.
 *
 * `ledger` shipped in fa9ee14 as `sparks integer not null`. The currency became Credits, the CREATE
 * in quota.ts was rewritten to say `credits`, and `create table if not exists` does nothing to a
 * table that already exists. So every QuotaDO created before that rename kept a `sparks` column and
 * had no `credits` one, and `state()` — which /state, the charge path and every refund call —
 * throws `no such column: credits` for that user.
 *
 * Found in production on 2026-09-20, on a real account, through Sentry APPLE-WORKER-6.
 *
 * THESE TESTS RUN REAL SQLITE. The other quota tests drive a hand-modelled SQL fake, which is right
 * for their questions and useless for this one: a fake that interprets the queries it is given
 * cannot reproduce "no such column", so it would report this defect as absent. node:sqlite executes
 * the same statements SQLite in a Durable Object does.
 *
 * The statements are READ OUT OF quota.ts rather than restated here. A migration test that carries
 * its own copy of the migration passes while the shipped one is wrong.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const WORKER = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = readFileSync(join(WORKER, 'src', 'do', 'quota.ts'), 'utf8');

/** The CREATE batch the constructor runs, taken from the source. */
function createBatch() {
  const m = SRC.match(/this\.sql\.exec\(`(create table if not exists ledger[\s\S]*?)`\)/);
  assert.ok(m, 'the CREATE batch could not be read out of quota.ts — this test knows no schema, so '
    + 'it has verified nothing. Do not read a pass here as a pass.');
  return m[1].replace(/\/\*[\s\S]*?\*\//g, ' ');
}

/** Every `alter table ...` the constructor attempts, in source order. */
function migrations() {
  const found = [...SRC.matchAll(/this\.sql\.exec\(`(alter table [^`]+)`\)/g)].map((m) => m[1]);
  assert.ok(found.length >= 2, `only ${found.length} migration(s) found in quota.ts; expected the `
    + 'billing_events add-column and the ledger rename');
  return found;
}

/** The legacy shape, verbatim from fa9ee14. */
const LEGACY = `create table if not exists ledger(
  id integer primary key autoincrement, day text not null, kind text not null,
  sparks integer not null, created_at integer not null);
  create index if not exists ledger_day on ledger(day);`;

function boot(db) {
  db.exec(createBatch());
  for (const m of migrations()) { try { db.exec(m); } catch { /* already applied */ } }
}

test('a legacy ledger is migrated and its history survives', () => {
  const db = new DatabaseSync(':memory:');
  db.exec(LEGACY);
  db.exec(`insert into ledger(day, kind, sparks, created_at) values('2026-09-01','build',40,1),('2026-09-01','ask',2,2)`);

  boot(db);

  // The query state() runs. Before the migration this threw `no such column: credits`.
  const row = db.prepare(`select coalesce(sum(credits),0) as s from ledger where day = ?`).get('2026-09-01');
  assert.equal(row.s, 42,
    `the legacy rows did not carry over: got ${row.s}, expected 42. An ADD COLUMN instead of a `
    + 'RENAME leaves every historical row at 0, which makes a spent account look brand new.');
});

test('a fresh ledger is untouched by the migration', () => {
  const db = new DatabaseSync(':memory:');
  boot(db);
  db.exec(`insert into ledger(day, kind, credits, created_at) values('2026-09-20','build',7,1)`);
  const row = db.prepare(`select coalesce(sum(credits),0) as s from ledger where day = ?`).get('2026-09-20');
  assert.equal(row.s, 7);
});

test('booting twice is a no-op, because the constructor runs on every start', () => {
  // The DO constructor re-runs these on every cold start. A migration that throws unhandled the
  // second time would take the whole object down instead of the one statement.
  const db = new DatabaseSync(':memory:');
  db.exec(LEGACY);
  db.exec(`insert into ledger(day, kind, sparks, created_at) values('2026-09-01','build',5,1)`);
  boot(db);
  boot(db);
  const row = db.prepare(`select coalesce(sum(credits),0) as s from ledger`).get();
  assert.equal(row.s, 5, 'a second boot changed the ledger');
});

test('the rename is a RENAME in the shipped source, not an ADD', () => {
  // The whole defect is that the two are indistinguishable until somebody looks at the data. An
  // `add column credits` passes the first test above only if no legacy rows exist.
  const ledgerMigrations = migrations().filter((m) => /\bledger\b/.test(m));
  assert.equal(ledgerMigrations.length, 1, `expected exactly one ledger migration, got ${ledgerMigrations.length}`);
  assert.match(ledgerMigrations[0], /rename column sparks to credits/,
    'the ledger migration is not a rename; historical spend would read as zero');
});
