#!/usr/bin/env node
/**
 * Every column this product stores about a person is either EXPORTED or EXPLICITLY WITHHELD.
 *
 * f-624a203a's real risk is not writing the export — it is the export going stale. A column added
 * six months from now is silently omitted (the person does not get everything) or silently included
 * (a secret escapes), and neither shows up in a test that only checks the rows it already knows.
 *
 * So this audits apps/worker/src/user-export.ts against the columns the tables ACTUALLY HAVE:
 * Postgres from a real database with infra/supabase/migrations applied in order, and D1's api_keys
 * from its own CREATE TABLE in api-keys.ts, which is that table's authority.
 *
 * A spec checked against itself is a tautology. This checks it against the schema.
 *
 * IT FALSIFIES ITSELF: step 4 adds a column to a live table and requires the audit to report it.
 * An auditor that cannot see an undeclared column cannot be trusted when it reports none.
 *
 * NO DOCKER IS A FAILURE, NOT A SKIP.
 *
 *   node infra/supabase/tests/export-completeness.mjs
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, mkdtempSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..', '..');
const MIGRATIONS = join(HERE, '..', 'migrations');
const NAME = `golem-export-${process.pid}`;
const docker = (args, opts = {}) => execFileSync('docker', args, { encoding: 'utf8', ...opts });
const psql = (sql) =>
  docker(['exec', '-i', NAME, 'psql', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1', '-Atq'], { input: sql, stdio: ['pipe', 'pipe', 'pipe'] });

const findings = [];
const check = (ok, what) => { console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${what}`); if (!ok) findings.push(what); };

const PRELUDE = `
create extension if not exists pgcrypto;
create schema if not exists auth;
create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb not null default '{}'::jsonb);
create role anon nologin; create role authenticated nologin;
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema public, auth to anon, authenticated;
`;

/** api_keys lives in D1; its CREATE TABLE in api-keys.ts is the authority for its columns. */
function d1ApiKeyColumns() {
  const src = readFileSync(join(ROOT, 'apps', 'worker', 'src', 'api-keys.ts'), 'utf8');
  const m = /create table if not exists api_keys\(([^)]*)\)/i.exec(src);
  if (!m) return null;
  return m[1].split(',').map((c) => c.trim().split(/\s+/)[0]).filter(Boolean);
}

function main() {
  try { docker(['info'], { stdio: 'pipe' }); }
  catch {
    console.error('EXPORT COMPLETENESS UNRUN — the docker daemon is not running.');
    console.error('This is a FAILURE, not a skip: a check that cannot run has not passed.');
    process.exit(2);
  }

  const out = join(mkdtempSync(join(tmpdir(), 'export-spec-')), 'spec.mjs');
  execFileSync(join(ROOT, 'apps', 'worker', 'node_modules', '.bin', 'esbuild'),
    [join(ROOT, 'apps', 'worker', 'src', 'user-export.ts'), '--bundle', '--format=esm', '--target=es2022', '--outfile=' + out],
    { stdio: 'pipe' });

  return import(pathToFileURL(out).href).then((SPEC) => {
    docker(['run', '-d', '--rm', '--name', NAME, '-e', 'POSTGRES_PASSWORD=pw', 'postgres:16-alpine'], { stdio: 'pipe' });
    try {
      for (let i = 0; i < 60; i++) {
        try { docker(['exec', NAME, 'pg_isready', '-U', 'postgres'], { stdio: 'pipe' }); break; }
        catch { execFileSync('sleep', ['1']); }
      }
      psql(PRELUDE);
      const files = readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort();
      for (const f of files) psql(readFileSync(join(MIGRATIONS, f), 'utf8'));
      console.log(`Applied ${files.length} migrations.\n`);

      // 1. every exported postgres table exists and every column is accounted for
      for (const spec of SPEC.USER_EXPORT.filter((t) => t.store === 'postgres')) {
        const cols = psql(`select column_name from information_schema.columns where table_schema='public' and table_name='${spec.table}';`)
          .trim().split('\n').filter(Boolean);
        check(cols.length > 0, `${spec.table}: exists in the schema (${cols.length} columns)`);
        const issues = SPEC.auditExportSpec(spec.table, cols);
        for (const i of issues) check(false, `${i.code}: ${i.why}`);
        if (!issues.length) check(true, `${spec.table}: every column is exported or explicitly withheld`);
      }

      // 2. the D1 table, from its own CREATE TABLE
      const keyCols = d1ApiKeyColumns();
      check(Array.isArray(keyCols) && keyCols.length > 5, `api_keys: columns read from its CREATE TABLE (${keyCols?.length})`);
      if (keyCols) {
        const issues = SPEC.auditExportSpec('api_keys', keyCols);
        for (const i of issues) check(false, `${i.code}: ${i.why}`);
        if (!issues.length) check(true, 'api_keys: every column is exported or explicitly withheld');
        check(!SPEC.exportSpecFor('api_keys').fields.includes('key_hash'), 'api_keys: the key hash is NOT exported');
      }

      // 3. no exported field anywhere looks like a secret
      for (const spec of SPEC.USER_EXPORT) {
        const leaked = spec.fields.filter((f) => SPEC.NEVER_EXPORT.some((s) => f === s || f.endsWith(`_${s}`)));
        check(leaked.length === 0, `${spec.table}: no exported field matches the never-export list${leaked.length ? ' — ' + leaked.join(', ') : ''}`);
      }

      // 4. THE AUDITOR FALSIFIES ITSELF. Add a column nobody declared; it must be reported.
      psql(`alter table public.profiles add column secret_diary text;`);
      const cols = psql(`select column_name from information_schema.columns where table_schema='public' and table_name='profiles';`)
        .trim().split('\n').filter(Boolean);
      const caught = SPEC.auditExportSpec('profiles', cols).some((i) => i.code === 'undeclared_column' && i.column === 'secret_diary');
      check(caught, 'FALSIFICATION: an undeclared column IS reported — the auditor can see a violation');
      psql(`alter table public.profiles drop column secret_diary;`);
      check(SPEC.auditExportSpec('profiles', psql(`select column_name from information_schema.columns where table_schema='public' and table_name='profiles';`).trim().split('\n').filter(Boolean)).length === 0,
        'FALSIFICATION restored: the spec is clean again');
    } finally {
      try { docker(['rm', '-f', NAME], { stdio: 'pipe' }); } catch { /* gone */ }
    }

    console.log('');
    if (findings.length) {
      console.log(`EXPORT SPEC INCOMPLETE — ${findings.length} finding(s)`);
      process.exit(1);
    }
    console.log('EXPORT SPEC COMPLETE — every stored column is exported or explicitly withheld, self-falsified');
    process.exit(0);
  });
}
main();
