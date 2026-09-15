/**
 * The migration loop, with the database handed in.
 *
 * `exec(sql) -> Promise<string>` is every bit of I/O this file does, and it is a parameter. That
 * is what makes the loop testable: tests/migration-runner.test.mjs drives the whole thing against
 * a fake Postgres that records statements and can be told to fail on the third one, so the
 * properties that matter — the ledger is written only after the migration it describes succeeds,
 * a failure stops the run rather than skipping past it, a run that applied nothing cannot report
 * success — are EXECUTED rather than reasoned about.
 *
 * infra/supabase/migrate.mjs supplies the real `exec`: psql against DATABASE_URL, or docker exec
 * against the same throwaway image infra/supabase/tests/rls-isolation.mjs already uses, so the
 * runner can be rehearsed on a disposable database before it is ever pointed at a real one.
 */
import { createHash } from 'node:crypto';
import { judgeApply, planMigrations } from './migration-rules.mjs';

export const LEDGER_TABLE = 'public.schema_migrations';

/**
 * The ledger the runner keeps.
 *
 * `applied_at` and `by` are recorded because "which migrations have run" is an incident question,
 * and the answer is worth having with a time and an author attached. The checksum is the load
 * bearing column: it is what makes an edit to an already-applied file detectable at all.
 */
export const LEDGER_DDL = `create table if not exists ${LEDGER_TABLE} (
  name text primary key,
  sha256 text not null,
  applied_at timestamptz not null default now(),
  applied_by text
);`;

export const sha256 = (text) => createHash('sha256').update(text).digest('hex');

/** One row per line, `|`-separated — the shape `psql -Atq` returns with an explicit separator. */
const rows = (out) => String(out).split('\n').map((l) => l.trim()).filter((l) => l !== '');

/**
 * What the database says has already run.
 *
 * The ledger table is created if it is missing, which is how an existing database adopts the
 * runner: the first `--status` against a schema that was applied by hand reports every file as
 * pending, which is TRUE of the ledger and false of the schema. `--adopt` is how that is
 * reconciled, and it exists so nobody is tempted to fix it by editing the table by hand.
 */
export async function readLedger(exec) {
  await exec(LEDGER_DDL);
  const out = await exec(`select name || '|' || sha256 || '|' || coalesce(applied_at::text,'') from ${LEDGER_TABLE} order by name;`);
  return rows(out).map((line) => {
    const [name, sha, at] = line.split('|');
    return { name, sha256: sha, appliedAt: at === '' ? null : at };
  });
}

/**
 * Apply everything pending, in order, each one inside its own transaction with its ledger row.
 *
 * ONE TRANSACTION PER MIGRATION, ledger row included. The alternative — apply, then record — has
 * a window in which a migration has run and nothing knows, and the next run applies it again. The
 * alternative in the other direction, one transaction around the whole set, sounds safer and is
 * worse in practice: a failure half way leaves nothing applied and no record of how far it got,
 * on a database where some statements (an index built concurrently, for one) cannot be
 * transactional at all.
 *
 * A FAILURE STOPS THE RUN. Continuing past a failed migration applies later files against a
 * schema that does not exist, and the resulting database matches no state any file describes.
 */
export async function applyMigrations({ files, exec, dryRun = false, appliedBy = 'migrate.mjs' }) {
  if (typeof exec !== 'function') throw new TypeError('applyMigrations needs an exec(sql) function');
  const ledger = await readLedger(exec);
  const plan = planMigrations(files.map((f) => ({ name: f.name, sha256: sha256(f.sql) })), ledger);

  // REFUSALS COME FIRST AND NOTHING RUNS. An edited migration, a hole in the numbering or a file
  // inserted behind the head all mean the pending set is not what it appears to be.
  if (plan.problems.length > 0) {
    return { plan, applied: 0, failures: [], ran: [], verdict: judgeApply(plan, { applied: 0, failures: [] }) };
  }
  if (dryRun) {
    return { plan, applied: 0, failures: [], ran: [], dryRun: true, verdict: null };
  }

  const failures = [];
  const ran = [];
  let applied = 0;
  for (const p of plan.pending) {
    const file = files.find((f) => f.name === p.name);
    const statement = [
      'begin;',
      file.sql,
      `insert into ${LEDGER_TABLE} (name, sha256, applied_by) values (${quote(p.name)}, ${quote(p.sha256)}, ${quote(appliedBy)});`,
      'commit;',
    ].join('\n');
    try {
      await exec(statement);
      applied += 1;
      ran.push(p.name);
    } catch (e) {
      failures.push({ name: p.name, why: String(e?.message ?? e).split('\n')[0] });
      break;   // stop; every later migration expects this one's schema
    }
  }
  return { plan, applied, failures, ran, verdict: judgeApply(plan, { applied, failures }) };
}

/** Single-quoted for SQL. The inputs are file names and checksums, and it is still escaped. */
const quote = (s) => `'${String(s).split("'").join("''")}'`;

/**
 * Record already-run migrations WITHOUT running them, for a database that predates the runner.
 *
 * Every schema here was applied by hand in a dashboard before this file existed, so the first run
 * of `--status` against production will call all five pending — which is true of the ledger and
 * false of the database. Adopting is the honest reconciliation, and it is a separate, explicit
 * command rather than a flag on apply, because "mark as done without doing it" is exactly the
 * move that must never happen by accident.
 */
export async function adoptMigrations({ files, exec, names, appliedBy = 'migrate.mjs --adopt' }) {
  if (typeof exec !== 'function') throw new TypeError('adoptMigrations needs an exec(sql) function');
  if (!Array.isArray(names) || names.length === 0) return { adopted: 0, problems: ['no migration was named to adopt'] };
  await exec(LEDGER_DDL);
  const problems = [];
  let adopted = 0;
  for (const name of names) {
    const file = files.find((f) => f.name === name);
    if (file === undefined) { problems.push(`${name} is not in the migration directory`); continue; }
    await exec(
      `insert into ${LEDGER_TABLE} (name, sha256, applied_by) values (${quote(name)}, ${quote(sha256(file.sql))}, ${quote(appliedBy)}) `
      + 'on conflict (name) do nothing;',
    );
    adopted += 1;
  }
  return { adopted, problems };
}

/* ------------------------------------------------------------ the catalogue --- */

const COLUMNS_SQL = `select table_name || '|' || column_name from information_schema.columns
  where table_schema = 'public' order by table_name, ordinal_position;`;
const RLS_SQL = `select c.relname || '|' || c.relrowsecurity from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' order by c.relname;`;

/**
 * The schema that is actually there, in the shape `diffSchema` compares against.
 *
 * READ FROM THE CATALOGUE, never from the migrations. The entire value of this function is that
 * it can see a change nobody wrote down — a column added in a dashboard, row level security
 * switched off during an incident and never switched back — and a snapshot derived from the files
 * would agree with the files by construction and see nothing.
 */
export async function snapshotSchema(exec) {
  if (typeof exec !== 'function') throw new TypeError('snapshotSchema needs an exec(sql) function');
  const byName = new Map();
  for (const line of rows(await exec(RLS_SQL))) {
    const [name, rls] = line.split('|');
    // `t`/`f` from psql, `true`/`false` from a driver. Anything else is left false rather than
    // guessed: reporting RLS as ON because a value was unrecognised is the wrong direction to be
    // wrong in.
    byName.set(name, { name, columns: [], rls: rls === 't' || rls === 'true' });
  }
  for (const line of rows(await exec(COLUMNS_SQL))) {
    const [table, column] = line.split('|');
    if (!byName.has(table)) byName.set(table, { name: table, columns: [], rls: false });
    byName.get(table).columns.push(column);
  }
  return { tables: [...byName.values()].sort((a, b) => a.name.localeCompare(b.name)) };
}
