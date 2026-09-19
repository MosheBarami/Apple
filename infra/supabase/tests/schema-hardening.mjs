#!/usr/bin/env node
/**
 * Execute migration 0010 against the two schema lineages it supports.
 *
 * The clean fixture has usage_events.credits from 0001. The legacy fixture renames that column to
 * the production-observed usage_events.sparks spelling before 0010 runs. Both receive the broad
 * anon/authenticated grants observed in the live catalogue, so a green result proves the migration
 * actually removes them rather than starting from an already-restricted test database.
 *
 * Two refusal fixtures keep the compatibility branch honest: conflicting dual columns and an
 * unknown bigint legacy column must abort transactionally, preserving the input schema and rows.
 *
 * Run from the repository root:
 *
 *   node infra/supabase/tests/schema-hardening.mjs
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS = join(HERE, '..', 'migrations');
const HARDENING_NAME = '0010_schema_hardening.sql';
const HARDENING_SQL = readFileSync(join(MIGRATIONS, HARDENING_NAME), 'utf8');
const HARDENING_SHA256 = createHash('sha256').update(HARDENING_SQL).digest('hex');
const BASE_MIGRATIONS = readdirSync(MIGRATIONS)
  .filter((name) => name.endsWith('.sql') && name !== HARDENING_NAME)
  .sort();

assert.deepEqual(
  BASE_MIGRATIONS,
  [
    '0001_init.sql',
    '0002_waitlist_policy.sql',
    '0003_security_hardening.sql',
    '0004_project_archive.sql',
    '0005_collaboration.sql',
    '0006_membership_lifecycle.sql',
    '0007_project_pinning.sql',
    '0008_project_tags.sql',
    '0009_membership_access_outbox.sql',
  ],
  'the focused fixture must apply exactly 0001-0009 before 0010',
);

const NAME = `golem-schema-hardening-${process.pid}`;
const IMAGE = process.env.POSTGRES_IMAGE || 'postgres:16-alpine';
const DATABASES = ['clean_fixture', 'legacy_fixture', 'conflict_fixture', 'unknown_fixture'];
const OUT_OF_ORDER_DATABASE = 'out_of_order_fixture';
const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const C = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const D = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const CHOSEN_PROJECT = '11111111-1111-4111-8111-111111111111';

const failures = [];
let assertions = 0;
function check(ok, what) {
  assertions += 1;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${what}`);
  if (!ok) failures.push(what);
}

const docker = (args, opts = {}) =>
  execFileSync('docker', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, ...opts });

function psql(database, sql, { quiet = true } = {}) {
  return docker(
    ['exec', '-i', NAME, 'psql', '-U', 'postgres', '-d', database, '-v', 'ON_ERROR_STOP=1', '-Atq'],
    { input: sql, stdio: ['pipe', 'pipe', quiet ? 'pipe' : 'inherit'] },
  );
}

function lines(value) {
  return String(value).split('\n').map((line) => line.trim()).filter(Boolean);
}

function scalar(database, sql) {
  const out = lines(psql(database, sql));
  return out.at(-1) ?? '';
}

function count(database, sql) {
  return Number(scalar(database, sql));
}

function asTenant(database, userId, sql) {
  return lines(psql(database, `
    begin;
    set local role authenticated;
    select pg_catalog.set_config('request.jwt.claim.sub', '${userId}', true);
    select pg_catalog.set_config('request.jwt.claim.role', 'authenticated', true);
    ${sql}
    commit;
  `)).filter((line) => line !== userId && line !== 'authenticated');
}

function asRole(database, role, sql) {
  return lines(psql(database, `begin; set local role ${role}; ${sql} commit;`));
}

function refused(fn, pattern) {
  try {
    fn();
    return false;
  } catch (error) {
    return pattern.test(String(error?.stderr ?? error?.message ?? error));
  }
}

const PRELUDE = `
create extension if not exists pgcrypto;
create schema auth;
create table auth.users (
  id uuid primary key,
  email text,
  raw_user_meta_data jsonb not null default '{}'::jsonb
);
create function auth.uid() returns uuid language sql stable set search_path = '' as $$
  select nullif(pg_catalog.current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
create function auth.jwt() returns jsonb language sql stable set search_path = '' as $$
  select case
    when nullif(pg_catalog.current_setting('request.jwt.claim.role', true), '') is null then null
    else pg_catalog.jsonb_build_object('role', pg_catalog.current_setting('request.jwt.claim.role', true))
  end
$$;
grant usage on schema public, auth to anon, authenticated, service_role, supabase_auth_admin;
grant insert on table auth.users to supabase_auth_admin;
`;

const IDENTITIES = `
insert into auth.users(id,email,raw_user_meta_data) values
  ('${A}','alice@example.test','{"display_name":"Alice"}'),
  ('${B}','bob@example.test','{"display_name":"Bob"}'),
  ('${C}','carol@example.test','{"display_name":"Carol"}');
`;

const BROAD_LIVE_GRANTS = `
grant all privileges on all tables in schema public to anon, authenticated;
grant all privileges on all sequences in schema public to anon, authenticated;
grant execute on all functions in schema public to anon, authenticated;
`;

const TARGET_FUNCTIONS = [
  'public.force_project_id()',
  'public.handle_new_user()',
  'public.protect_profile_fields()',
  'public.project_role(uuid)',
];

const TABLES = [
  'checkpoints',
  'feedback',
  'membership_access_outbox',
  'membership_access_state',
  'membership_events',
  'membership_outbox_consumers',
  'membership_outbox_secret',
  'messages',
  'profiles',
  'project_members',
  'projects',
  'studio_pairings',
  'usage_events',
  'waitlist',
];

const EXPECTED_TABLE_GRANTS = [
  ['authenticated', 'feedback', 'INSERT'],
  ['authenticated', 'feedback', 'SELECT'],
  ['authenticated', 'membership_access_state', 'SELECT'],
  ['authenticated', 'membership_events', 'INSERT'],
  ['authenticated', 'membership_events', 'SELECT'],
  ['authenticated', 'profiles', 'SELECT'],
  ['authenticated', 'profiles', 'UPDATE'],
  ['authenticated', 'project_members', 'INSERT'],
  ['authenticated', 'project_members', 'SELECT'],
  ['authenticated', 'project_members', 'UPDATE'],
  ['authenticated', 'projects', 'DELETE'],
  ['authenticated', 'projects', 'INSERT'],
  ['authenticated', 'projects', 'SELECT'],
  ['authenticated', 'projects', 'UPDATE'],
  ['authenticated', 'checkpoints', 'SELECT'],
  ['authenticated', 'messages', 'SELECT'],
  ['authenticated', 'usage_events', 'SELECT'],
  ['authenticated', 'waitlist', 'INSERT'],
  ['authenticated', 'waitlist', 'SELECT'],
].map((row) => row.join('|')).sort();

function setupDatabase(database) {
  psql('postgres', `create database ${database};`);
  psql(database, PRELUDE);
  for (const name of BASE_MIGRATIONS) {
    const sql = readFileSync(join(MIGRATIONS, name), 'utf8');
    psql(database, `begin;\n${sql}\ncommit;`);
  }
  psql(database, IDENTITIES);
}

function setupOutOfOrderDatabase() {
  psql('postgres', `create database ${OUT_OF_ORDER_DATABASE};`);
  psql(OUT_OF_ORDER_DATABASE, PRELUDE);
  for (const name of BASE_MIGRATIONS.slice(0, -1)) {
    const sql = readFileSync(join(MIGRATIONS, name), 'utf8');
    psql(OUT_OF_ORDER_DATABASE, `begin;\n${sql}\ncommit;`);
  }
}

function applyHardening(database) {
  psql(database, `begin;\n${HARDENING_SQL}\ncommit;`);
}

function functionBodyFingerprint(database) {
  return lines(psql(database, `
    select p.oid::pg_catalog.regprocedure::text || '|' ||
      pg_catalog.encode(public.digest(pg_catalog.convert_to(p.prosrc, 'UTF8'), 'sha256'), 'hex')
    from pg_catalog.pg_proc p
    where p.oid = any (array[
      'public.force_project_id()'::pg_catalog.regprocedure,
      'public.handle_new_user()'::pg_catalog.regprocedure,
      'public.protect_profile_fields()'::pg_catalog.regprocedure,
      'public.project_role(uuid)'::pg_catalog.regprocedure
    ]::oid[])
    order by p.oid::pg_catalog.regprocedure::text;
  `)).join('\n');
}

function verifyCommon(database, beforeBodies, lineage) {
  console.log(`\n${lineage}: function configuration and grants`);
  check(
    functionBodyFingerprint(database) === beforeBodies,
    `${lineage}: ALTER FUNCTION preserved every installed trigger/RLS function body`,
  );
  check(
    count(database, `
      select count(*)
      from pg_catalog.pg_proc p
      where p.oid = any (array[
        'public.force_project_id()'::pg_catalog.regprocedure,
        'public.handle_new_user()'::pg_catalog.regprocedure,
        'public.protect_profile_fields()'::pg_catalog.regprocedure,
        'public.project_role(uuid)'::pg_catalog.regprocedure
      ]::oid[])
      and exists (
        select 1 from pg_catalog.unnest(p.proconfig) setting
        where setting = 'search_path=""'
      );
    `) === 4,
    `${lineage}: all four target functions pin an empty search_path`,
  );
  check(
    scalar(database, `
      select p.prosecdef::text
      from pg_catalog.pg_proc p
      where p.oid = 'public.force_project_id()'::pg_catalog.regprocedure;
    `) === 'false',
    `${lineage}: force_project_id remains invoker-rights`,
  );
  check(
    count(database, `
      select count(*)
      from pg_catalog.pg_proc p
      where p.oid = any (array[
        'public.handle_new_user()'::pg_catalog.regprocedure,
        'public.protect_profile_fields()'::pg_catalog.regprocedure,
        'public.project_role(uuid)'::pg_catalog.regprocedure
      ]::oid[])
      and p.prosecdef;
    `) === 3,
    `${lineage}: the three functions that need SECURITY DEFINER retain it`,
  );

  const functionAcl = lines(psql(database, `
    select (case when acl.grantee = 0 then 'PUBLIC' else pg_catalog.pg_get_userbyid(acl.grantee) end)
      || '|' || p.oid::pg_catalog.regprocedure::text || '|' || acl.privilege_type
    from pg_catalog.pg_proc p
    cross join lateral pg_catalog.aclexplode(
      coalesce(p.proacl, pg_catalog.acldefault('f', p.proowner))
    ) acl
    where p.oid = any (array[
      'public.force_project_id()'::pg_catalog.regprocedure,
      'public.handle_new_user()'::pg_catalog.regprocedure,
      'public.protect_profile_fields()'::pg_catalog.regprocedure,
      'public.project_role(uuid)'::pg_catalog.regprocedure,
      'public.sync_usage_event_credit_columns()'::pg_catalog.regprocedure
    ]::oid[])
      and (acl.grantee = 0 or pg_catalog.pg_get_userbyid(acl.grantee) in ('anon','authenticated'))
    order by 1;
  `));
  check(
    JSON.stringify(functionAcl) === JSON.stringify(['authenticated|project_role(uuid)|EXECUTE']),
    `${lineage}: PUBLIC/anon cannot execute target functions; authenticated retains project_role only`,
  );

  console.log(`\n${lineage}: trigger and policy behavior after EXECUTE revocation`);
  check(
    scalar(database, `select pg_catalog.has_function_privilege('supabase_auth_admin','public.handle_new_user()','EXECUTE')::text;`) === 'false',
    `${lineage}: auth bootstrap role has no direct handle_new_user EXECUTE capability`,
  );
  asRole(database, 'supabase_auth_admin', `
    insert into auth.users(id,email,raw_user_meta_data)
    values ('${D}','new-user@example.test','{"display_name":"New User"}');
  `);
  check(
    scalar(database, `select display_name from public.profiles where id='${D}';`) === 'New User',
    `${lineage}: the auth.users trigger still creates a profile`,
  );

  const protectedProfile = asTenant(database, A, `
    update public.profiles
    set display_name='Alice Updated', plan='pro', is_admin=true
    where id='${A}';
    select display_name || '|' || plan || '|' || is_admin::text
    from public.profiles where id='${A}';
  `).at(-1);
  check(
    protectedProfile === 'Alice Updated|free|false',
    `${lineage}: profile trigger allows user fields and still protects plan/admin`,
  );

  const planted = asTenant(database, A, `
    insert into public.projects(id,owner_id,name)
    values ('${CHOSEN_PROJECT}','${B}','Hardened Place')
    returning id || '|' || owner_id;
  `).at(-1) ?? '';
  const [projectId, plantedOwner] = planted.split('|');
  check(
    /^[0-9a-f-]{36}$/.test(projectId ?? '') && projectId !== CHOSEN_PROJECT && plantedOwner === A,
    `${lineage}: force_project_id still replaces client id and cross-tenant owner`,
  );

  asTenant(database, A, `
    insert into public.project_members(project_id,user_id,role,invited_by)
    values ('${projectId}','${B}','editor','${A}');
  `);
  check(
    asTenant(database, A, `select public.project_role('${projectId}');`).at(-1) === 'owner'
      && asTenant(database, B, `select public.project_role('${projectId}');`).at(-1) === 'editor'
      && (asTenant(database, C, `select coalesce(public.project_role('${projectId}'),'');`).at(-1) ?? '') === '',
    `${lineage}: project_role still resolves owner, member, and stranger`,
  );

  console.log(`\n${lineage}: RLS and table privilege boundary`);
  check(
    count(database, `
      select count(*)
      from pg_catalog.pg_class c
      join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      where n.nspname='public' and c.relkind='r'
        and c.relname = any (array[${TABLES.map((name) => `'${name}'`).join(',')}])
        and c.relrowsecurity;
    `) === TABLES.length,
    `${lineage}: RLS is enabled on all ${TABLES.length} application tables`,
  );

  const tableGrants = lines(psql(database, `
    select grantee || '|' || table_name || '|' || privilege_type
    from information_schema.table_privileges
    where table_schema='public'
      and grantee in ('PUBLIC','anon','authenticated')
      and table_name = any (array[${TABLES.map((name) => `'${name}'`).join(',')}])
    order by grantee, table_name, privilege_type;
  `));
  check(
    JSON.stringify(tableGrants) === JSON.stringify(EXPECTED_TABLE_GRANTS),
    `${lineage}: Data API table grants equal the caller-derived least-privilege map`,
  );
  check(
    count(database, `
      select count(*)
      from information_schema.table_privileges
      where table_schema='public'
        and grantee in ('PUBLIC','anon','authenticated')
        and privilege_type in ('TRUNCATE','TRIGGER','REFERENCES','MAINTAIN');
    `) === 0,
    `${lineage}: no PUBLIC/anon/authenticated dangerous table privileges remain`,
  );

  const memberCanReadProject = Number(asTenant(database, B, `select count(*) from public.projects where id='${projectId}';`).at(-1));
  const strangerCanReadProject = Number(asTenant(database, C, `select count(*) from public.projects where id='${projectId}';`).at(-1));
  const ownerUsage = Number(asTenant(database, A, `select count(*) from public.usage_events where owner_id='${A}';`).at(-1));
  const strangerUsage = Number(asTenant(database, C, `select count(*) from public.usage_events where owner_id='${A}';`).at(-1));
  check(
    memberCanReadProject === 1 && strangerCanReadProject === 0 && ownerUsage >= 1 && strangerUsage === 0,
    `${lineage}: SELECT grants remain policy-bound (member project=${memberCanReadProject}, stranger project=${strangerCanReadProject}, owner usage=${ownerUsage}, stranger usage=${strangerUsage})`,
  );
  check(
    refused(() => asTenant(database, A, 'truncate table public.usage_events;'), /permission denied/i),
    `${lineage}: authenticated cannot TRUNCATE an RLS table`,
  );
  check(
    refused(
      () => asTenant(database, A, `delete from public.project_members where project_id='${projectId}' and user_id='${B}';`),
      /permission denied/i,
    )
      && count(database, `select count(*) from public.project_members where project_id='${projectId}' and user_id='${B}';`) === 1,
    `${lineage}: membership history cannot be erased through direct DELETE`,
  );
  check(
    refused(() => asTenant(database, A, 'select count(*) from public.membership_access_outbox;'), /permission denied/i),
    `${lineage}: outbox internals remain inaccessible despite the broad-grant fixture`,
  );
}

function main() {
  try {
    docker(['info'], { stdio: 'pipe' });
  } catch {
    console.error('SCHEMA HARDENING DB TEST UNRUN — the Docker daemon is not running.');
    process.exit(2);
  }

  console.log(`Starting ${IMAGE} as ${NAME} …`);
  docker(['run', '-d', '--rm', '--name', NAME, '-e', 'POSTGRES_PASSWORD=pw', IMAGE], { stdio: 'pipe' });
  try {
    let ready = false;
    for (let i = 0; i < 60; i += 1) {
      try {
        docker(['exec', NAME, 'pg_isready', '-U', 'postgres'], { stdio: 'pipe' });
        ready = true;
        break;
      } catch {
        execFileSync('sleep', ['1']);
      }
    }
    if (!ready) throw new Error('PostgreSQL did not become ready');

    psql('postgres', `
      create role anon nologin;
      create role authenticated nologin;
      create role service_role nologin bypassrls;
      create role supabase_auth_admin nologin;
    `);
    for (const database of DATABASES) setupDatabase(database);
    setupOutOfOrderDatabase();

    console.log(`\nMigration: ${HARDENING_NAME}`);
    console.log(`SHA-256:  ${HARDENING_SHA256}`);
    console.log(`Postgres: ${scalar('postgres', 'show server_version;')}`);

    // Clean lineage: credits already exists and remains the only public contract column.
    psql('clean_fixture', `
      insert into public.usage_events(owner_id,kind,credits,input_tokens,output_tokens,model)
      values ('${A}','clean-before',5,10,20,'fixture');
      ${BROAD_LIVE_GRANTS}
    `);
    const cleanBodies = functionBodyFingerprint('clean_fixture');
    const cleanBefore = scalar('clean_fixture', `
      select id || '|' || owner_id || '|' || kind || '|' || credits
      from public.usage_events where kind='clean-before';
    `);
    check(
      count('clean_fixture', `
        select count(*) from information_schema.table_privileges
        where table_schema='public' and grantee in ('anon','authenticated') and privilege_type='TRUNCATE';
      `) > 0,
      'clean precondition: the fixture really has the broad TRUNCATE grants being removed',
    );
    applyHardening('clean_fixture');
    check(
      scalar('clean_fixture', `
        select pg_catalog.string_agg(column_name, ',' order by ordinal_position)
        from information_schema.columns
        where table_schema='public' and table_name='usage_events' and column_name in ('credits','sparks');
      `) === 'credits',
      'clean: credits remains the only accounting column',
    );
    check(
      scalar('clean_fixture', `
        select id || '|' || owner_id || '|' || kind || '|' || credits
        from public.usage_events where kind='clean-before';
      `) === cleanBefore,
      'clean: the pre-migration usage row is byte-for-byte equivalent at the selected boundary',
    );
    check(
      count('clean_fixture', `
        select count(*) from pg_catalog.pg_trigger
        where tgrelid='public.usage_events'::pg_catalog.regclass
          and tgname='sync_usage_event_credit_columns' and not tgisinternal;
      `) === 0,
      'clean: no legacy synchronization trigger is installed',
    );
    verifyCommon('clean_fixture', cleanBodies, 'clean');

    // Legacy lineage: preserve the live body of protect_profile_fields and the historical column.
    psql('legacy_fixture', `
      insert into public.usage_events(owner_id,kind,credits,input_tokens,output_tokens,model)
      values ('${A}','legacy-before',7,30,40,'legacy-fixture');
      alter table public.usage_events rename column credits to sparks;
      create or replace function public.protect_profile_fields()
      returns trigger language plpgsql security definer set search_path = public as $fn$
      begin
        if auth.jwt() is not null and coalesce(auth.jwt()->>'role','') not in ('service_role') then
          new.is_admin := old.is_admin;
          new.plan := old.plan;
        end if;
        return new;
      end
      $fn$;
      ${BROAD_LIVE_GRANTS}
    `);
    const legacyBodies = functionBodyFingerprint('legacy_fixture');
    const legacyBodyBefore = scalar('legacy_fixture', `
      select pg_catalog.encode(public.digest(pg_catalog.convert_to(prosrc,'UTF8'),'sha256'),'hex')
      from pg_catalog.pg_proc where oid='public.protect_profile_fields()'::pg_catalog.regprocedure;
    `);
    const legacyRowBefore = scalar('legacy_fixture', `
      select id || '|' || owner_id || '|' || kind || '|' || sparks
      from public.usage_events where kind='legacy-before';
    `);
    applyHardening('legacy_fixture');
    check(
      scalar('legacy_fixture', `
        select pg_catalog.string_agg(column_name, ',' order by column_name)
        from information_schema.columns
        where table_schema='public' and table_name='usage_events' and column_name in ('credits','sparks');
      `) === 'credits,sparks',
      'legacy: sparks is preserved and credits is added',
    );
    check(
      scalar('legacy_fixture', `
        select id || '|' || owner_id || '|' || kind || '|' || credits || '|' || sparks
        from public.usage_events where kind='legacy-before';
      `) === `${legacyRowBefore}|7`,
      'legacy: every selected historical field and value is preserved in both spellings',
    );
    check(
      scalar('legacy_fixture', `
        select pg_catalog.encode(public.digest(pg_catalog.convert_to(prosrc,'UTF8'),'sha256'),'hex')
        from pg_catalog.pg_proc where oid='public.protect_profile_fields()'::pg_catalog.regprocedure;
      `) === legacyBodyBefore,
      'legacy: the production-observed protect_profile_fields body is not replaced by old migration text',
    );
    check(
      count('legacy_fixture', `
        select count(*) from pg_catalog.pg_trigger
        where tgrelid='public.usage_events'::pg_catalog.regclass
          and tgname='sync_usage_event_credit_columns' and not tgisinternal;
      `) === 1,
      'legacy: exactly one synchronization trigger is installed',
    );
    psql('legacy_fixture', `
      insert into public.usage_events(owner_id,kind,credits) values ('${A}','new-writer',11);
      insert into public.usage_events(owner_id,kind,sparks) values ('${A}','old-writer',13);
      update public.usage_events set credits=17 where kind='old-writer';
      update public.usage_events set sparks=19 where kind='new-writer';
    `);
    check(
      scalar('legacy_fixture', `
        select pg_catalog.string_agg(kind || ':' || credits || ':' || sparks, ',' order by kind)
        from public.usage_events where kind in ('new-writer','old-writer');
      `) === 'new-writer:19:19,old-writer:17:17',
      'legacy: old and new insert/update writers remain synchronized',
    );
    check(
      refused(
        () => psql('legacy_fixture', `
          insert into public.usage_events(owner_id,kind,credits,sparks)
          values ('${A}','conflicting-writer',2,3);
        `),
        /credits and sparks disagree/i,
      ),
      'legacy: a conflicting dual write is refused instead of losing a value',
    );
    verifyCommon('legacy_fixture', legacyBodies, 'legacy');

    // Conflict fixture: the migration must fail before choosing a side, and its transaction rolls back.
    psql('conflict_fixture', `
      alter table public.usage_events add column sparks integer not null default 0;
      insert into public.usage_events(owner_id,kind,credits,sparks)
      values ('${A}','preexisting-conflict',7,9);
    `);
    check(
      refused(
        () => applyHardening('conflict_fixture'),
        /conflicting usage_events\.credits and usage_events\.sparks/i,
      ),
      'conflict: migration refuses unequal pre-existing dual columns',
    );
    check(
      scalar('conflict_fixture', `
        select credits || '|' || sparks from public.usage_events where kind='preexisting-conflict';
      `) === '7|9'
        && count('conflict_fixture', `select count(*) from pg_catalog.pg_proc where oid=pg_catalog.to_regprocedure('public.sync_usage_event_credit_columns()');`) === 0,
      'conflict: refusal is transactional and preserves the original row/schema state',
    );

    // Unknown fixture: only the actually observed integer legacy schema is eligible for reconciliation.
    psql('unknown_fixture', `
      alter table public.usage_events rename column credits to sparks;
      alter table public.usage_events alter column sparks type bigint;
    `);
    check(
      refused(
        () => applyHardening('unknown_fixture'),
        /requires usage_events\.sparks to be integer, found bigint/i,
      ),
      'unknown: migration refuses an unidentified legacy type',
    );
    check(
      scalar('unknown_fixture', `
        select pg_catalog.string_agg(column_name || ':' || data_type, ',' order by column_name)
        from information_schema.columns
        where table_schema='public' and table_name='usage_events' and column_name in ('credits','sparks');
      `) === 'sparks:bigint',
      'unknown: type refusal rolls back without inventing credits',
    );

    check(
      refused(
        () => applyHardening(OUT_OF_ORDER_DATABASE),
        /requires migrations 0001-0009; missing relation\(s\):/i,
      ),
      'ordering: 0010 refuses a database where 0009 has not run',
    );
    check(
      scalar(OUT_OF_ORDER_DATABASE, `
        select pg_catalog.string_agg(column_name, ',' order by column_name)
        from information_schema.columns
        where table_schema='public' and table_name='usage_events' and column_name in ('credits','sparks');
      `) === 'credits'
        && count(OUT_OF_ORDER_DATABASE, `select count(*) from pg_catalog.pg_proc where oid=pg_catalog.to_regprocedure('public.sync_usage_event_credit_columns()');`) === 0,
      'ordering: the precondition refusal is transactional and changes nothing',
    );

    console.log('');
    if (failures.length > 0) {
      console.error(`SCHEMA HARDENING DB TEST FAILED — ${failures.length} of ${assertions} assertion(s)`);
      process.exitCode = 1;
    } else {
      console.log(`SCHEMA HARDENING DB TEST HOLDS — ${assertions} assertions across clean/legacy compatibility, grants, RLS, triggers and refusal fixtures`);
    }
  } finally {
    try {
      docker(['rm', '-f', NAME], { stdio: 'pipe' });
    } catch {
      /* already removed */
    }
  }
}

main();
