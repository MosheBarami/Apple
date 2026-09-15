#!/usr/bin/env node
/**
 * Tenant isolation, EXECUTED against the real migrations on a real Postgres.
 *
 * WHY THIS EXISTS. Two backlog rows — Authorization (f-b795e053) and Tenant isolation
 * (f-4237b0a2) — were marked done citing prose: "row-level security is enforced in Postgres by
 * infra/supabase/migrations. Nothing in this repository exercises it." Tenant isolation is the
 * claim most expensive to be wrong about and it was the least covered. It was also recorded as
 * STRUCTURALLY UNPROVABLE, which was wrong: the CLI and docker are installed, and the only thing
 * standing in the way was a decision to start a database.
 *
 * WHAT IT DOES. Starts postgres:16-alpine, installs the pieces Supabase provides around these
 * migrations, applies infra/supabase/migrations/*.sql IN ORDER, creates two tenants, and asks —
 * as each of them, through the same mechanism production uses — whether either can see or touch
 * the other's rows.
 *
 * `auth.uid()` in Supabase reads the verified JWT's `sub` claim from a per-connection GUC. The
 * model below does exactly that, so `set_config('request.jwt.claim.sub', ...)` IS being signed in
 * as that user, in the same mechanism the policies consult in production. What is NOT modelled:
 * PostgREST, the service-role key, and anything configured in the Supabase dashboard rather than
 * in a migration. This proves the migrations' policies; it cannot prove the deployed database
 * matches them.
 *
 * IT FALSIFIES ITSELF. Step 6 disables RLS on one table and requires the leak to appear. A harness
 * that cannot see a violation cannot be trusted when it reports none, and every isolation check
 * here would pass against a database where the grants were simply missing — the reads would fail
 * for the wrong reason. The per-tenant "own" counts are the control for that.
 *
 * NO DOCKER IS A FAILURE, NOT A SKIP. A check that cannot run has not passed.
 *
 *   node infra/supabase/tests/rls-isolation.mjs
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, writeFileSync, mkdtempSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS = join(HERE, '..', 'migrations');
const NAME = `golem-rls-${process.pid}`;
const IMAGE = 'postgres:16-alpine';
const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

const failures = [];
const check = (ok, what) => { console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${what}`); if (!ok) failures.push(what); };
const docker = (args, opts = {}) => execFileSync('docker', args, { encoding: 'utf8', ...opts });

function psql(sql, { quiet = true } = {}) {
  return docker(['exec', '-i', NAME, 'psql', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1', '-Atq'],
    { input: sql, stdio: ['pipe', 'pipe', quiet ? 'pipe' : 'inherit'] });
}
const num = (sql) => Number(psql(sql).trim());
/** Run `sql` as an authenticated tenant, exactly as the policies see it. */
const asTenant = (uid, sql) =>
  psql(`begin;\nset local role authenticated;\nselect set_config('request.jwt.claim.sub','${uid}',true);\n${sql}\ncommit;`);
const numAs = (uid, expr) => Number(asTenant(uid, `select ${expr};`).trim().split('\n').pop());

/** Everything Supabase supplies around these migrations. */
const PRELUDE = `
create extension if not exists pgcrypto;
create schema if not exists auth;
-- Columns the migrations' own handle_new_user trigger reads. A thinner table makes that trigger
-- fail, which is how we learned it auto-creates the profile row.
create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb not null default '{}'::jsonb);
create role anon nologin;
create role authenticated nologin;
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema public, auth to anon, authenticated;
`;
// Without these a denied read is a PRIVILEGE failure, not an RLS filter, and every isolation
// assertion below would pass for the wrong reason. The "own" controls are what catch that.
const GRANTS = `
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
`;
const SEED = `
insert into auth.users(id,email,raw_user_meta_data) values
  ('${A}','alice@example.test','{"display_name":"Alice"}'),
  ('${B}','bob@example.test','{"display_name":"Bob"}');
-- profiles are created by the migrations' own trigger, not by hand.
-- project ids are ASSIGNED by force_project_id (clients must not choose a primary key), so they
-- are read back rather than specified.
insert into public.projects(owner_id,name) values ('${A}','Alice Place'),('${B}','Bob Place');
insert into public.messages(project_id,owner_id,role,content)
  select id, owner_id, 'user', 'secret-of-'||owner_id from public.projects;
insert into public.checkpoints(project_id,owner_id,label,kind,r2_key)
  select id, owner_id, 'cp', 'manual', 'r2/'||id from public.projects;
insert into public.usage_events(owner_id,kind,credits) values ('${A}','chat',5),('${B}','chat',7);
`;

const OWNER_SCOPED = [
  ['projects', 'owner_id'],
  ['messages', 'owner_id'],
  ['checkpoints', 'owner_id'],
  ['usage_events', 'owner_id'],
  ['profiles', 'id'],
];

function main() {
  try {
    docker(['info'], { stdio: 'pipe' });
  } catch {
    console.error('RLS ISOLATION UNRUN — the docker daemon is not running.');
    console.error('This is a FAILURE, not a skip: a check that cannot run has not passed.');
    console.error('Start Docker and re-run. The image is ~80MB and the container is removed afterwards.');
    process.exit(2);
  }

  console.log(`Starting ${IMAGE} as ${NAME} …`);
  docker(['run', '-d', '--rm', '--name', NAME, '-e', 'POSTGRES_PASSWORD=pw', IMAGE], { stdio: 'pipe' });
  try {
    for (let i = 0; i < 60; i++) {
      try { docker(['exec', NAME, 'pg_isready', '-U', 'postgres'], { stdio: 'pipe' }); break; }
      catch { execFileSync('sleep', ['1']); }
    }

    psql(PRELUDE);
    const files = readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort();
    if (files.length === 0) { console.error('no migrations found — nothing to prove'); process.exit(2); }
    for (const f of files) { psql(readFileSync(join(MIGRATIONS, f), 'utf8')); console.log(`  applied ${f}`); }
    psql(GRANTS);
    psql(SEED);
    console.log(`\nApplied ${files.length} migrations; seeded 2 tenants.\n`);

    // 1-2. Every owner-scoped table: each tenant sees exactly their own rows and none of the other's.
    for (const [table, col] of OWNER_SCOPED) {
      const total = num(`select count(*) from public.${table};`);
      check(total === 2, `${table}: the database really holds 2 rows (${total}) — the fixture is not empty`);
      for (const [me, them, who] of [[A, B, 'alice'], [B, A, 'bob']]) {
        const own = numAs(me, `(select count(*) from public.${table} where ${col}='${me}')`);
        const other = numAs(me, `(select count(*) from public.${table} where ${col}='${them}')`);
        const seen = numAs(me, `(select count(*) from public.${table})`);
        check(own === 1, `${table}: ${who} CAN see their own row (control — grants are present)`);
        check(other === 0, `${table}: ${who} cannot see the other tenant's row`);
        check(seen === 1, `${table}: ${who} sees exactly 1 row in total`);
      }
    }

    // 3. Content, not just counts.
    check(numAs(A, `(select count(*) from public.messages where content like '%${B}%')`) === 0,
      `messages: alice cannot read bob's message CONTENT`);
    check(numAs(B, `(select count(*) from public.messages where content like '%${A}%')`) === 0,
      `messages: bob cannot read alice's message CONTENT`);

    // 4. Writes against another tenant's row.
    const upd = asTenant(A, `with u as (update public.projects set name='HIJACKED' where owner_id='${B}' returning 1) select count(*) from u;`);
    check(Number(upd.trim().split('\n').pop()) === 0, 'projects: alice cannot UPDATE bob\'s project');
    const del = asTenant(A, `with d as (delete from public.projects where owner_id='${B}' returning 1) select count(*) from d;`);
    check(Number(del.trim().split('\n').pop()) === 0, 'projects: alice cannot DELETE bob\'s project');

    // 5. Planting a row owned by someone else. TWO mechanisms stop this and both are asserted,
    //    because either alone would make the other's removal invisible.
    asTenant(A, `insert into public.projects(owner_id,name) values ('${B}','planted');`);
    const plantedOwner = psql(`select owner_id from public.projects where name='planted';`).trim();
    check(plantedOwner === A,
      `projects: a row alice plants as bob is FORCED to her own ownership (force_project_id) — got ${plantedOwner || 'no row'}`);
    psql(`delete from public.projects where name='planted';`);

    psql(`alter table public.projects disable trigger force_project_id;`);
    let refused = false;
    try { asTenant(A, `insert into public.projects(owner_id,name) values ('${B}','planted2');`); }
    catch { refused = true; }
    check(refused, 'projects: with the trigger gone, the POLICY alone still refuses the cross-tenant insert');
    psql(`alter table public.projects enable trigger force_project_id;`);
    psql(`delete from public.projects where name='planted2';`);

    // 6. THE HARNESS FALSIFIES ITSELF. If turning a policy off does not produce a leak, this
    //    script cannot see a violation and its silence above means nothing.
    psql(`alter table public.messages disable row level security;`);
    const leaked = numAs(A, `(select count(*) from public.messages)`);
    psql(`alter table public.messages enable row level security;`);
    check(leaked === 2,
      `FALSIFICATION: with RLS off, alice sees both messages (${leaked}) — the harness can see a violation`);

    const restored = numAs(A, `(select count(*) from public.messages)`);
    check(restored === 1, 'FALSIFICATION restored: isolation is back on after the break');
  } finally {
    try { docker(['rm', '-f', NAME], { stdio: 'pipe' }); } catch { /* already gone */ }
  }

  console.log('');
  if (failures.length) {
    console.log(`RLS ISOLATION VIOLATED — ${failures.length} failing check(s)`);
    process.exit(1);
  }
  console.log('RLS ISOLATION HOLDS — two tenants, 5 owner-scoped tables, reads writes and plants, self-falsified');
  process.exit(0);
}
main();
