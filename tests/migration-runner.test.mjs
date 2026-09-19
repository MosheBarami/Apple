// The migration runner, executed against a database that can be told to misbehave — and its
// schema parser, executed against the migrations this repository actually ships.
//
// WHAT WAS HERE BEFORE. Five .sql files applied by hand in a dashboard, no record of which had
// run, and GATES.md's own sentence about it: nothing compares the deployed schema against the
// migrations. infra/supabase/tests/rls-isolation.mjs proves the POLICIES against a throwaway
// Postgres and says explicitly that it cannot prove the deployed database matches them.
//
// The runner takes `exec(sql)` as a parameter, so the interesting states — a migration edited
// after it was applied, a file inserted behind the head, a statement the database rejects half way
// through a set — are EXECUTED here rather than reasoned about. A fake database is the only way to
// reach them: a real one cannot be asked to fail on the third statement on demand.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile as execFileCb } from 'node:child_process';
import { promisify } from 'node:util';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { diffSchema, judgeApply, parseMigrationName, planMigrations, schemaFromSql } from '../scripts/lib/migration-rules.mjs';
import {
  LEDGER_DDL,
  LEDGER_TABLE,
  adoptMigrations,
  applyMigrations,
  readLedger,
  sha256,
  snapshotSchema,
} from '../scripts/lib/migration-runner.mjs';

const execFile = promisify(execFileCb);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MIGRATIONS = join(ROOT, 'infra', 'supabase', 'migrations');

/**
 * A Postgres that records every statement and can be told to reject one.
 *
 * It models only what the runner depends on: the ledger table, the insert that records a
 * migration, and the two catalogue queries. Anything else is accepted and remembered, which is
 * enough to assert WHAT WAS RUN and IN WHAT ORDER.
 */
function fakeDb({ failOn = null, ledger = [], columns = '', rls = '' } = {}) {
  const statements = [];
  const rows = new Map(ledger.map((r) => [r.name, r]));
  const exec = async (sql) => {
    statements.push(sql);
    if (sql.includes('from public.schema_migrations')) {
      return [...rows.values()].map((r) => `${r.name}|${r.sha256}|2026-01-01T00:00:00Z`).join('\n');
    }
    if (sql.startsWith('begin;') && sql.includes(`insert into ${LEDGER_TABLE}`)) {
      const m = /values \('([^']+)', '([^']+)'/.exec(sql);
      if (m === null) throw new Error('a transaction with no ledger row in it');
      if (failOn === m[1]) throw new Error(`syntax error at or near "oops" while applying ${m[1]}`);
      rows.set(m[1], { name: m[1], sha256: m[2] });
      return '';
    }
    if (sql.startsWith('insert into public.schema_migrations')) {
      const m = /values \('([^']+)', '([^']+)'/.exec(sql);
      rows.set(m[1], { name: m[1], sha256: m[2] });
      return '';
    }
    if (sql.includes('information_schema.columns')) return columns;
    if (sql.includes('pg_class')) return rls;
    return '';
  };
  return { exec, statements, rows };
}

const FILES = [
  { name: '0001_init.sql', sql: 'create table public.a (id uuid primary key);' },
  { name: '0002_more.sql', sql: 'create table public.b (id uuid primary key);' },
  { name: '0003_yet_more.sql', sql: 'create table public.c (id uuid primary key);' },
];
const recorded = (name) => ({ name, sha256: sha256(FILES.find((f) => f.name === name).sql) });

/* ------------------------------------------------------------------ the plan --- */

test('a file that is not a migration name is reported, never quietly skipped', () => {
  assert.deepEqual(parseMigrationName('0004_project_archive.sql'), { index: 4, slug: 'project_archive', name: '0004_project_archive.sql' });
  for (const bad of ['init.sql', '4_init.sql', '0004-init.sql', '0004_Init.sql', '0004_init.txt', null, 12]) {
    assert.equal(parseMigrationName(bad), null, `${JSON.stringify(bad)} is not a migration name`);
  }
  // Skipping it is how a migration sits in the directory for weeks looking applied.
  const plan = planMigrations([{ name: 'init.sql', sha256: 'a'.repeat(64) }], []);
  assert.match(plan.problems.join('\n'), /is not a migration name/);
});

test('CONTROL: a contiguous set against an empty ledger is entirely pending and problem-free', () => {
  const plan = planMigrations(FILES.map((f) => ({ name: f.name, sha256: sha256(f.sql) })), []);
  assert.deepEqual(plan.problems, []);
  assert.equal(plan.pending.length, FILES.length);
  // The relationship: pending is in numeric order, whatever order the directory produced.
  assert.deepEqual(plan.pending.map((p) => p.index), [1, 2, 3]);
});

test('THE CLASSIC: a migration edited after it was applied stops the run', () => {
  // The file describes one schema and the database holds another, and nothing will ever run the
  // difference. It is invisible without a checksum, which is why the ledger keeps one.
  const plan = planMigrations(
    FILES.map((f) => ({ name: f.name, sha256: sha256(f.sql) })),
    [{ name: '0001_init.sql', sha256: sha256('create table public.a (id uuid primary key, and_another_thing text);') }],
  );
  assert.match(plan.problems.join('\n'), /0001_init\.sql has been edited since it was applied/);
});

test('a migration the database has run and this tree does not contain stops the run', () => {
  const plan = planMigrations(FILES.map((f) => ({ name: f.name, sha256: sha256(f.sql) })), [recorded('0001_init.sql'), { name: '0009_ghost.sql', sha256: 'b'.repeat(64) }]);
  assert.match(plan.problems.join('\n'), /0009_ghost\.sql, which is not in this tree/);
});

test('a hole in the numbering is a missing file, not a style problem', () => {
  const plan = planMigrations([
    { name: '0001_init.sql', sha256: 'a'.repeat(64) },
    { name: '0003_third.sql', sha256: 'c'.repeat(64) },
  ], []);
  assert.match(plan.problems.join('\n'), /the numbering jumps: 0002 is missing/);
});

test('two migrations with the same number are refused', () => {
  const plan = planMigrations([
    { name: '0001_init.sql', sha256: 'a'.repeat(64) },
    { name: '0001_also_init.sql', sha256: 'b'.repeat(64) },
  ], []);
  assert.match(plan.problems.join('\n'), /share the number 1/);
});

test('a migration inserted BEHIND the head applies out of order and is refused', () => {
  // The resulting schema would depend on when each database happened to be migrated.
  const plan = planMigrations(FILES.map((f) => ({ name: f.name, sha256: sha256(f.sql) })), [recorded('0001_init.sql'), recorded('0003_yet_more.sql')]);
  assert.match(plan.problems.join('\n'), /0002_more\.sql is unapplied and numbered below 0003/);
});

test('an unreadable checksum, on disk or in the ledger, is a problem rather than a skipped comparison', () => {
  assert.match(planMigrations([{ name: '0001_init.sql', sha256: 'nope' }], []).problems.join('\n'), /no usable checksum/);
  assert.match(
    planMigrations([{ name: '0001_init.sql', sha256: 'a'.repeat(64) }], [{ name: '0001_init.sql', sha256: null }]).problems.join('\n'),
    /nothing can say whether the file has changed/,
  );
});

test('a missing ledger is not an empty one', () => {
  // "The database told me nothing" and "the database has applied nothing" are opposite facts and
  // produce opposite plans.
  assert.match(planMigrations(FILES, null).problems.join('\n'), /a missing ledger is not an empty one/);
  assert.match(planMigrations(null, []).problems.join('\n'), /no list of files/);
});

/* --------------------------------------------------------------- the verdict --- */

test('a run that applied NOTHING against a non-empty plan is not a success', () => {
  // The same shape as F-62's rollback: the cheapest possible green is `0 === 0`.
  const plan = { pending: [{ name: '0002_more.sql' }], problems: [] };
  assert.equal(judgeApply(plan, { applied: 0, failures: [] }).ok, false);
  assert.match(judgeApply(plan, { applied: 0, failures: [] }).problems.join('\n'), /changed nothing, which may not read as success/);
  for (const applied of [Number.NaN, '1', undefined, null, 1.5, -2]) {
    assert.equal(judgeApply(plan, { applied, failures: [] }).ok, false, `${JSON.stringify(applied)} is not a count`);
  }
  assert.equal(judgeApply(plan, { applied: 1, failures: [] }).ok, true);
  assert.equal(judgeApply(plan, { applied: 1 }).ok, false, 'a missing failures list is not an empty one');
});

/* ---------------------------------------------------------------- the runner --- */

test('every pending migration runs in its own transaction, with its ledger row inside it', async () => {
  const db = fakeDb();
  const r = await applyMigrations({ files: FILES, exec: db.exec });
  assert.equal(r.verdict.ok, true, r.verdict.problems.join('; '));
  assert.deepEqual(r.ran, FILES.map((f) => f.name));

  const applied = db.statements.filter((s) => s.startsWith('begin;') && s.includes(`insert into ${LEDGER_TABLE}`));
  assert.equal(applied.length, 3);
  for (const [i, sql] of applied.entries()) {
    assert.match(sql, /^begin;/);
    assert.match(sql, /commit;$/);
    assert.equal(sql.includes(FILES[i].sql), true, 'the migration body and its ledger row are one transaction');
    assert.equal(sql.includes(sha256(FILES[i].sql)), true, 'the checksum recorded is the checksum of what ran');
  }
});

test('the ledger DDL seals an existing or new table from Data API roles', async () => {
  const code = LEDGER_DDL.replace(/--[^\n]*/g, ' ');
  assert.match(code, /^begin;/, 'creation and hardening must be atomic');
  assert.match(code, /alter table public\.schema_migrations enable row level security;/i);
  assert.match(code, /revoke all privileges on table public\.schema_migrations from public;/i);
  for (const role of ['anon', 'authenticated']) {
    assert.match(code, new RegExp(`to_regrole\\('${role}'\\) is not null`, 'i'), `${role} must be handled on Supabase and tolerated elsewhere`);
    assert.match(code, new RegExp(`revoke all privileges on table public\\.schema_migrations from ${role}`, 'i'));
  }
  assert.match(code, /commit;$/, 'the sealed ledger transaction must commit as one unit');

  const db = fakeDb();
  assert.deepEqual(await readLedger(db.exec), []);
  assert.equal(db.statements[0], LEDGER_DDL, 'readLedger must run the hardening DDL, not a create-only copy');
});

test('a migration the database rejects STOPS the run — later files are never attempted', async () => {
  // Continuing past a failure applies later migrations against a schema that does not exist, and
  // the result matches no state any file describes.
  const db = fakeDb({ failOn: '0002_more.sql' });
  const r = await applyMigrations({ files: FILES, exec: db.exec });
  assert.equal(r.applied, 1);
  assert.equal(r.verdict.ok, false);
  assert.match(r.verdict.problems.join('\n'), /syntax error/);
  assert.match(r.verdict.problems.join('\n'), /1 of 3 pending migration\(s\) were applied/);
  assert.equal(db.statements.some((s) => s.includes(FILES[2].sql)), false, '0003 must never have been attempted');
  assert.equal(db.rows.has('0002_more.sql'), false, 'a failed migration may not be recorded as applied');
});

test('a plan with problems applies NOTHING — the refusal comes before the first statement', async () => {
  const db = fakeDb({ ledger: [{ name: '0001_init.sql', sha256: sha256('something else entirely') }] });
  const r = await applyMigrations({ files: FILES, exec: db.exec });
  assert.equal(r.applied, 0);
  assert.equal(r.verdict.ok, false);
  assert.match(r.verdict.problems.join('\n'), /has been edited since it was applied/);
  assert.equal(
    db.statements.some((s) => s.startsWith('begin;') && s.includes(`insert into ${LEDGER_TABLE}`)),
    false,
    'not one migration may run against a plan that refused',
  );
});

test('a second run applies nothing because the ledger says so, and the ledger is what it wrote', async () => {
  const db = fakeDb();
  await applyMigrations({ files: FILES, exec: db.exec });
  const again = await applyMigrations({ files: FILES, exec: db.exec });
  assert.equal(again.plan.pending.length, 0, 'the ledger written by the first run is what makes the second a no-op');
  assert.deepEqual(again.plan.problems, []);
});

test('a dry run plans and writes nothing', async () => {
  const db = fakeDb();
  const r = await applyMigrations({ files: FILES, exec: db.exec, dryRun: true });
  assert.equal(r.plan.pending.length, 3);
  assert.equal(
    db.statements.some((s) => s.startsWith('begin;') && s.includes(`insert into ${LEDGER_TABLE}`)),
    false,
    'the ledger may be sealed, but no migration transaction may run',
  );
});

test('adopting records a migration as applied WITHOUT running it, and refuses a name it does not have', async () => {
  // Every schema here was applied by hand before the runner existed; this is the honest
  // reconciliation, and it is a separate command because "mark as done without doing it" is
  // exactly the move that must never happen by accident.
  const db = fakeDb();
  const r = await adoptMigrations({ files: FILES, exec: db.exec, names: ['0001_init.sql'] });
  assert.equal(r.adopted, 1);
  assert.deepEqual(r.problems, []);
  assert.equal(db.statements.some((s) => s.includes(FILES[0].sql)), false, 'adopting must not run the migration');
  assert.equal(db.rows.get('0001_init.sql').sha256, sha256(FILES[0].sql));

  const missing = await adoptMigrations({ files: FILES, exec: db.exec, names: ['0099_nope.sql'] });
  assert.match(missing.problems.join('\n'), /is not in the migration directory/);
  assert.equal(missing.adopted, 0);
  assert.match((await adoptMigrations({ files: FILES, exec: db.exec, names: [] })).problems.join('\n'), /no migration was named/);
});

/* --------------------------------------------------------------- the schema --- */

test('the catalogue snapshot reads row level security as OFF unless the database says otherwise', async () => {
  const db = fakeDb({
    rls: 'projects|t\nleaked|f',
    columns: 'projects|id\nprojects|owner_id\nleaked|id',
  });
  const snap = await snapshotSchema(db.exec);
  assert.deepEqual(snap.tables.map((t) => `${t.name}:${t.rls}`), ['leaked:false', 'projects:true']);
  assert.deepEqual(snap.tables.find((t) => t.name === 'projects').columns, ['id', 'owner_id']);

  // An unrecognised value must not become `true`: reporting RLS as ON because a value could not be
  // read is the wrong direction to be wrong in.
  const weird = await snapshotSchema(fakeDb({ rls: 'projects|(null)', columns: 'projects|id' }).exec);
  assert.equal(weird.tables[0].rls, false);
});

test('SECURITY: row level security on in the migrations and off in the database is the first thing reported', () => {
  const expected = { tables: [{ name: 'projects', columns: ['id'], rls: true }] };
  const actual = { tables: [{ name: 'projects', columns: ['id'], rls: false }] };
  const problems = diffSchema(expected, actual);
  assert.match(problems.join('\n'), /SECURITY: projects has row level security in the migrations and NOT in the database/);
  // CONTROL: the same comparison with RLS on.
  assert.deepEqual(diffSchema(expected, { tables: [{ name: 'projects', columns: ['id'], rls: true }] }), []);
});

test('a missing table, a missing column and a table nothing created are all drift', () => {
  const expected = { tables: [{ name: 'projects', columns: ['id', 'archived_at'], rls: true }] };
  assert.match(diffSchema(expected, { tables: [] }).join('\n'), /projects is created by a migration and does not exist/);
  assert.match(
    diffSchema(expected, { tables: [{ name: 'projects', columns: ['id'], rls: true }] }).join('\n'),
    /projects\.archived_at is in the migrations and not in the database/,
  );
  assert.match(
    diffSchema(expected, { tables: [{ name: 'projects', columns: ['id', 'archived_at'], rls: true }, { name: 'made_in_the_dashboard', columns: [], rls: true }] }).join('\n'),
    /made_in_the_dashboard exists in the database and no migration creates it/,
  );
});

test('an absent snapshot is not an empty one, and a parse that found no tables is not a schema', () => {
  assert.match(diffSchema({ tables: [{ name: 'a', columns: [], rls: true }] }, {}).join('\n'), /is not a snapshot that is empty/);
  assert.match(diffSchema({ tables: [] }, { tables: [] }).join('\n'), /a parse that failed, not a schema/);
});

/* ------------------------------------------- against the migrations that ship --- */

const realFiles = readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort()
  .map((name) => ({ name, sql: readFileSync(join(MIGRATIONS, name), 'utf8') }));

test('the real migration set is contiguous, correctly named, and entirely pending against an empty ledger', () => {
  const plan = planMigrations(realFiles.map((f) => ({ name: f.name, sha256: sha256(f.sql) })), []);
  assert.deepEqual(plan.problems, [], 'the migrations this repository ships must satisfy the runner');
  assert.equal(plan.pending.length, realFiles.length);
  assert.equal(realFiles.length > 0, true, 'a directory with no migrations would pass every assertion above vacuously');
});

test('the schema parser reads the real migrations, and every table they create has row level security', () => {
  const schema = schemaFromSql(realFiles);
  assert.deepEqual(schema.unreadable, [], 'a statement the parser cannot read makes the expected schema incomplete');
  assert.equal(schema.tables.length >= 8, true, `only ${schema.tables.length} tables parsed out of the real migrations`);
  for (const t of schema.tables) {
    assert.equal(t.rls, true, `${t.name} is created by a migration that never enables row level security`);
    assert.equal(t.columns.length > 0, true, `${t.name} parsed with no columns`);
  }
  assert.equal(schema.policies.length > 10, true, 'the policies the migrations create are read too');
});

test('a column added by a LATER migration is in the parsed schema and not in the earlier set', () => {
  // The relationship across two files, anchored to the migration that carries the claim:
  // 0004_project_archive.sql is what adds projects.archived_at.
  const upTo3 = schemaFromSql(realFiles.filter((f) => f.name < '0004'));
  const all = schemaFromSql(realFiles);
  assert.equal(upTo3.tables.find((t) => t.name === 'projects').columns.includes('archived_at'), false);
  assert.equal(all.tables.find((t) => t.name === 'projects').columns.includes('archived_at'), true);
});

test('a commented-out CREATE TABLE is not part of the schema', () => {
  const schema = schemaFromSql('-- create table public.ghost (id uuid);\ncreate table public.real (id uuid);');
  assert.deepEqual(schema.tables.map((t) => t.name), ['real']);
});

/* -------------------------------------------------------------------- the CLI --- */

async function migrate(args) {
  try {
    const { stdout, stderr } = await execFile(process.execPath, [join(ROOT, 'infra', 'supabase', 'migrate.mjs'), ...args], { cwd: ROOT, encoding: 'utf8' });
    return { exit: 0, out: `${stdout}${stderr}` };
  } catch (e) {
    return { exit: typeof e.code === 'number' ? e.code : 1, out: `${e.stdout ?? ''}${e.stderr ?? ''}` };
  }
}

test('the runner will not guess which database it is migrating, and will not write without --yes', async () => {
  const noTarget = await migrate(['--status']);
  assert.equal(noTarget.exit, 2);
  assert.match(noTarget.out, /will not guess which database/);

  const noConsent = await migrate(['--apply', '--url', 'postgres://127.0.0.1:1/none']);
  assert.equal(noConsent.exit, 2);
  assert.match(noConsent.out, /rehearse with --dry-run or confirm with --yes/);

  const typo = await migrate(['--staus', '--url', 'postgres://127.0.0.1:1/none']);
  assert.equal(typo.exit, 2);
  assert.match(typo.out, /unrecognised flag --staus/);

  const both = await migrate(['--status', '--url', 'postgres://127.0.0.1:1/none', '--docker', 'x']);
  assert.equal(both.exit, 2);
  assert.match(both.out, /name two different databases/);
});
