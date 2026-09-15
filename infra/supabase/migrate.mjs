#!/usr/bin/env node
// The migration runner these SQL files never had.
//
//   node infra/supabase/migrate.mjs --status  --docker golem-rls-123
//   node infra/supabase/migrate.mjs --status  --url postgres://…
//   node infra/supabase/migrate.mjs --apply   --url postgres://… --yes
//   node infra/supabase/migrate.mjs --adopt 0001_init.sql … --url postgres://… --yes
//   node infra/supabase/migrate.mjs --verify  --url postgres://…
//
// WHAT WAS HERE BEFORE. Five .sql files and a convention. They were applied by hand in the
// Supabase dashboard by whoever had credentials — WORKLIST w18 is the row where
// 0004_project_archive.sql waited because the session that wrote it had none — and nothing in the
// repository knew which of them had run. GATES.md states the consequence in one line: nothing
// compares the deployed schema against the migrations. infra/supabase/tests/rls-isolation.mjs
// applies all five to a throwaway Postgres and is explicit that it proves the FILES, not the
// deployed database.
//
// So this program answers the two questions that were unanswerable:
//
//   WHICH HAVE RUN — a ledger table with a checksum per migration, which is what makes "this file
//   was edited after it was applied" detectable. The plan refuses to run at all on that, on a hole
//   in the numbering, and on a file inserted behind the head; the rules are in
//   scripts/lib/migration-rules.mjs and their broken inputs come from a test, not from the tree.
//
//   IS THE SCHEMA THE ONE THE FILES DESCRIBE — `--verify` reads the live catalogue and diffs it
//   against the schema parsed out of the migrations. It is the only thing here that can see a
//   change made outside the files, and the first problem it reports is a table whose row level
//   security is on in the migrations and off in the database, because that one is not drift; it
//   is every tenant's data readable by every other.
//
// A CONNECTION IS NEVER IMPLIED. There is no fallback to DATABASE_URL and no default target: a
// program that applies DDL may not guess which database it is applying it to. `--apply` and
// `--adopt` additionally need `--yes`.
//
// `--status` IS NOT QUITE READ-ONLY, and this is the one place that is worth saying out loud: it
// creates the ledger table if it is missing, because a ledger that does not exist cannot be read.
// It records nothing and runs no migration. Against a database that was migrated by hand, the
// first `--status` therefore reports every file as pending — which is true OF THE LEDGER and
// false of the schema, and `--adopt` is the honest way to reconcile the two.
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { diffSchema, schemaFromSql } from '../../scripts/lib/migration-rules.mjs';
import { adoptMigrations, applyMigrations, readLedger, snapshotSchema } from '../../scripts/lib/migration-runner.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));

const argv = process.argv.slice(2);
let MODE = null;
let URL_ = null;
let DOCKER = null;
let DIR = join(HERE, 'migrations');
let YES = false;
let DRY = false;
const ADOPT = [];
for (let i = 0; i < argv.length; i += 1) {
  const a = argv[i];
  if (a === '--status' || a === '--apply' || a === '--verify') {
    if (MODE !== null && MODE !== a) { console.error(`migrate: ${MODE} and ${a} are different jobs — pick one`); process.exit(2); }
    MODE = a;
    continue;
  }
  if (a === '--adopt') {
    MODE = '--adopt';
    while (argv[i + 1] && !argv[i + 1].startsWith('--')) { ADOPT.push(argv[i + 1]); i += 1; }
    continue;
  }
  if (a === '--url') { URL_ = argv[i + 1] ?? null; i += 1; continue; }
  if (a === '--docker') { DOCKER = argv[i + 1] ?? null; i += 1; continue; }
  if (a === '--dir') { DIR = resolve(argv[i + 1] ?? '.'); i += 1; continue; }
  if (a === '--yes') { YES = true; continue; }
  if (a === '--dry-run') { DRY = true; continue; }
  // F-63 again: a flag that is silently ignored is indistinguishable from one that works.
  console.error(`migrate: unrecognised flag ${a} — use --status | --apply | --adopt <name…> | --verify, with --url <conn> or --docker <container>`);
  process.exit(2);
}
if (MODE === null) MODE = '--status';
if (URL_ === null && DOCKER === null) {
  console.error('migrate: a target is required — --url <conn> or --docker <container>. This program will not guess which database it is migrating.');
  process.exit(2);
}
if (URL_ !== null && DOCKER !== null) { console.error('migrate: --url and --docker name two different databases — pick one'); process.exit(2); }
if ((MODE === '--apply' || MODE === '--adopt') && !YES && !DRY) {
  console.error(`migrate: ${MODE} writes to the database; rehearse with --dry-run or confirm with --yes`);
  process.exit(2);
}

/* ------------------------------------------------------------------ the wire --- */

//[[ ARGUMENT ARRAYS, NEVER A SHELL STRING. The SQL goes in on STDIN and the connection string is
//   one argv element, so nothing in either is ever interpreted by a shell. `ON_ERROR_STOP=1` is
//   what makes a failed statement a non-zero exit instead of a warning psql prints and moves past
//   — without it a migration could half-apply and the runner would record it as done. ]]
const psqlArgs = URL_ !== null
  ? { cmd: 'psql', args: [URL_, '-v', 'ON_ERROR_STOP=1', '-At', '-q'] }
  : { cmd: 'docker', args: ['exec', '-i', DOCKER, 'psql', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1', '-At', '-q'] };

const exec = async (sql) => execFileSync(psqlArgs.cmd, psqlArgs.args, {
  input: sql, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024,
});

/* ------------------------------------------------------------------ the files --- */

let names;
try { names = readdirSync(DIR).filter((f) => f.endsWith('.sql')).sort(); } catch {
  console.error(`migrate: ${DIR} is not a directory`);
  process.exit(2);
}
if (names.length === 0) { console.error(`migrate: ${DIR} holds no .sql files — there is nothing to run`); process.exit(2); }
const files = names.map((name) => ({ name, sql: readFileSync(join(DIR, name), 'utf8') }));
console.log(`${files.length} migration file(s) in ${DIR}`);
console.log(`target: ${URL_ !== null ? URL_.replace(/:[^:@/]*@/, ':***@') : `docker container ${DOCKER}`}`);

/* ------------------------------------------------------------------- the run --- */

try {
  if (MODE === '--verify') {
    const expected = schemaFromSql(files);
    for (const u of expected.unreadable) console.log(`  ? ${u}`);
    if (expected.unreadable.length > 0) {
      // A statement the parser could not read means the "expected" schema is missing something.
      // Comparing against it would report a clean diff for a schema nobody has fully described.
      console.error('migrate: the migrations contain statements this parser cannot read — the expected schema is incomplete, so the comparison would be worth nothing');
      process.exit(2);
    }
    const actual = await snapshotSchema(exec);
    const problems = diffSchema(expected, actual);
    console.log(`${expected.tables.length} table(s) described by the migrations, ${actual.tables.length} in the database`);
    for (const p of problems) console.log(`  ! ${p}`);
    if (problems.length) {
      console.error(`SCHEMA DRIFT — ${problems.length} difference(s) between the migrations and the database`);
      process.exit(1);
    }
    console.log(`SCHEMA VERIFIED — ${expected.tables.length} table(s), ${expected.tables.filter((t) => t.rls).length} with row level security, match the migrations`);
    process.exit(0);
  }

  if (MODE === '--adopt') {
    const r = await adoptMigrations({ files, exec, names: ADOPT });
    for (const p of r.problems) console.error(`  ! ${p}`);
    if (r.problems.length || r.adopted === 0) {
      console.error(`ADOPT REFUSED — ${r.adopted} recorded, ${r.problems.length} problem(s)`);
      process.exit(1);
    }
    console.log(`ADOPTED — ${r.adopted} migration(s) recorded as already applied; none of them was run`);
    process.exit(0);
  }

  const result = await applyMigrations({ files, exec, dryRun: MODE === '--status' || DRY });
  const { plan } = result;
  console.log(`applied: ${plan.applied}, pending: ${plan.pending.length}`);
  for (const p of plan.pending) console.log(`  > ${p.name}`);
  for (const p of plan.problems) console.log(`  ! ${p}`);

  if (plan.problems.length) {
    console.error(`MIGRATION REFUSED — ${plan.problems.length} problem(s); nothing was applied`);
    process.exit(1);
  }
  if (MODE === '--status' || DRY) {
    console.log(`MIGRATION PLAN — ${plan.pending.length} pending; nothing was applied`);
    process.exit(0);
  }
  for (const f of result.failures) console.error(`  ! ${f.name} — ${f.why}`);
  if (!result.verdict.ok) {
    for (const p of result.verdict.problems) console.error(`  ! ${p}`);
    console.error(`MIGRATION INCOMPLETE — ${result.verdict.applied} of ${result.verdict.planned} applied; the database is part-way through a set`);
    process.exit(1);
  }
  if (result.verdict.planned === 0) {
    // "Nothing was pending" is a real state and it is not the same sentence as "everything ran".
    // Printing MIGRATED over a run that applied nothing is the shape this repository keeps
    // catching: a success token for work that did not happen.
    console.log(`ALREADY MIGRATED — nothing pending; ${plan.applied} migration(s) recorded as applied`);
  } else {
    console.log(`MIGRATED — ${result.verdict.applied} of ${result.verdict.planned} migration(s) applied and recorded`);
  }
} catch (e) {
  const detail = (e?.stderr ?? e?.message ?? String(e)).toString().trim();
  console.error(`migrate: the database rejected a statement or could not be reached —\n${detail}`);
  process.exit(2);
}
