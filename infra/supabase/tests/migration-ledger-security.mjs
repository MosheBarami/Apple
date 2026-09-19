#!/usr/bin/env node
/**
 * Execute the migration ledger boundary on real PostgreSQL.
 *
 * Supabase default privileges can grant newly-created public tables to anon/authenticated. This
 * fixture reproduces that condition, creates an already-exposed ledger, and then runs the exact
 * LEDGER_DDL used by status/apply/adopt. It proves the existing row survives, RLS is enabled, direct
 * grants are gone, unprivileged roles cannot read or mutate the table, and the privileged runner can
 * still record and re-read migrations.
 *
 * Run from the repository root:
 *
 *   node infra/supabase/tests/migration-ledger-security.mjs
 */
import { execFileSync } from 'node:child_process';

import {
  LEDGER_DDL,
  LEDGER_TABLE,
  applyMigrations,
  readLedger,
  sha256,
} from '../../../scripts/lib/migration-runner.mjs';

const NAME = `golem-migration-ledger-${process.pid}`;
const IMAGE = process.env.POSTGRES_IMAGE || 'postgres:16-alpine';

const failures = [];
const check = (ok, what) => {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${what}`);
  if (!ok) failures.push(what);
};
const docker = (args, opts = {}) => execFileSync('docker', args, { encoding: 'utf8', ...opts });
const psql = (sql) => docker(
  ['exec', '-i', NAME, 'psql', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1', '-Atq'],
  { input: sql, stdio: ['pipe', 'pipe', 'pipe'], maxBuffer: 8 * 1024 * 1024 },
);
const exec = async (sql) => psql(sql);

function refused(role, sql) {
  try {
    psql(`begin; set local role ${role}; ${sql}; rollback;`);
    return false;
  } catch (error) {
    return /permission denied|row-level security/i.test(String(error?.stderr ?? error?.message ?? error));
  }
}

function main() {
  try {
    docker(['info'], { stdio: 'pipe' });
  } catch {
    console.error('MIGRATION LEDGER SECURITY UNRUN — the Docker daemon is not running.');
    process.exit(2);
  }

  console.log(`Starting ${IMAGE} as ${NAME} …`);
  docker(['run', '-d', '--rm', '--name', NAME, '-e', 'POSTGRES_PASSWORD=pw', IMAGE], { stdio: 'pipe' });

  return (async () => {
    try {
      for (let i = 0; i < 60; i += 1) {
        try {
          docker(['exec', NAME, 'pg_isready', '-U', 'postgres'], { stdio: 'pipe' });
          break;
        } catch {
          execFileSync('sleep', ['1']);
        }
      }

      const plainLedger = await readLedger(exec);
      check(
        plainLedger.length === 0,
        'ledger hardening also runs on plain PostgreSQL where anon/authenticated roles do not exist',
      );
      psql(`drop table ${LEDGER_TABLE};`);

      psql(`
        create role anon nologin;
        create role authenticated nologin;
        grant usage on schema public to anon, authenticated;
        alter default privileges in schema public grant all privileges on tables to anon, authenticated;

        create table public.default_grant_control (id integer);
        create table ${LEDGER_TABLE} (
          name text primary key,
          sha256 text not null,
          applied_at timestamptz not null default now(),
          applied_by text
        );
        insert into ${LEDGER_TABLE} (name, sha256, applied_by)
        values ('0000_existing.sql', '${'a'.repeat(64)}', 'pre-hardening fixture');
      `);

      const exposedBefore = psql(`
        select
          has_table_privilege('anon','${LEDGER_TABLE}','SELECT,TRUNCATE')::int || ':' ||
          has_table_privilege('authenticated','${LEDGER_TABLE}','SELECT,TRUNCATE')::int || ':' ||
          has_table_privilege('anon','public.default_grant_control','SELECT,TRUNCATE')::int;
      `).trim();
      check(exposedBefore === '1:1:1', `fixture reproduces broad default table grants before hardening (${exposedBefore})`);

      const existing = await readLedger(exec);
      check(existing.length === 1 && existing[0]?.name === '0000_existing.sql', 'hardening preserves an existing ledger row');

      const rls = psql(`
        select c.relrowsecurity::int
        from pg_catalog.pg_class c
        join pg_catalog.pg_namespace n on n.oid = c.relnamespace
        where n.nspname='public' and c.relname='schema_migrations';
      `).trim();
      check(rls === '1', 'schema_migrations has row level security enabled');

      const grantsAfter = psql(`
        select grantee || ':' || privilege_type
        from information_schema.role_table_grants
        where table_schema='public'
          and table_name='schema_migrations'
          and grantee in ('PUBLIC','anon','authenticated')
        order by grantee, privilege_type;
      `).trim();
      check(grantsAfter === '', 'PUBLIC, anon and authenticated have no direct ledger table grants');

      for (const role of ['anon', 'authenticated']) {
        check(refused(role, `select * from ${LEDGER_TABLE}`), `${role} cannot read migration history`);
        check(
          refused(role, `insert into ${LEDGER_TABLE}(name,sha256) values ('evil.sql','${'b'.repeat(64)}')`),
          `${role} cannot forge a migration record`,
        );
        check(refused(role, `truncate table ${LEDGER_TABLE}`), `${role} cannot truncate migration history`);
      }

      const file = { name: '0001_probe.sql', sql: 'create table public.migration_ledger_probe (id integer primary key);' };
      // The fixture row predates the repository naming scheme. Remove only that fixture as the
      // privileged owner before exercising planMigrations; the preservation assertion above already
      // proved LEDGER_DDL itself did not remove it.
      psql(`delete from ${LEDGER_TABLE} where name='0000_existing.sql';`);
      const applied = await applyMigrations({ files: [file], exec, appliedBy: 'migration-ledger-security.mjs' });
      check(applied.verdict?.ok === true && applied.applied === 1, 'the privileged runner can still apply and record a migration');
      const recorded = await readLedger(exec);
      check(
        recorded.length === 1 && recorded[0]?.name === file.name && recorded[0]?.sha256 === sha256(file.sql),
        'the privileged runner can re-read the exact recorded checksum',
      );
      const second = await applyMigrations({ files: [file], exec, appliedBy: 'migration-ledger-security.mjs' });
      check(second.plan.pending.length === 0 && second.plan.problems.length === 0, 'a second run is a ledger-backed no-op');

      // Tripwire: a later table still receives the broad default grants. The ledger is sealed by its
      // own DDL, not because this fixture accidentally disabled the condition it meant to test.
      psql('create table public.default_grant_control_after (id integer);');
      const controlAfter = psql(`select has_table_privilege('anon','public.default_grant_control_after','SELECT,TRUNCATE')::int;`).trim();
      check(controlAfter === '1', 'control table created afterwards is still exposed by the fixture default privileges');
    } finally {
      try {
        docker(['rm', '-f', NAME], { stdio: 'pipe' });
      } catch {
        /* already removed */
      }
    }

    console.log('');
    if (failures.length > 0) {
      console.error(`MIGRATION LEDGER SECURITY FAILED — ${failures.length} assertion(s)`);
      process.exitCode = 1;
      return;
    }
    console.log('MIGRATION LEDGER SECURITY HOLDS — exposed legacy table repaired, RLS/grants sealed, owner runner operational');
  })();
}

await main();
