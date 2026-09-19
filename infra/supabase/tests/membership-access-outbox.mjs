#!/usr/bin/env node
/**
 * Execute the membership-access outbox on real PostgreSQL.
 *
 * The Worker tests prove transport failure and recovery. This proves the database half those tests
 * cannot emulate: a project_members mutation and its intent share one transaction, versions advance
 * monotonically, each Durable Object namespace gets its own row, claims are token/consumer scoped,
 * and a mutation rolls back when there is nowhere durable to deliver it.
 *
 * Run from the repository root:
 *
 *   node infra/supabase/tests/membership-access-outbox.mjs
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS = join(HERE, '..', 'migrations');
const NAME = `golem-membership-outbox-${process.pid}`;
const IMAGE = 'postgres:16-alpine';
const OWNER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const MEMBER = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const STRANGER = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const TOKENS = {
  golem: 'membership-outbox-golem-db-test-token-0123456789abcdef',
  apple: 'membership-outbox-apple-db-test-token-0123456789abcdef',
};
const TOKEN_HASHES = Object.fromEntries(
  Object.entries(TOKENS).map(([consumer, token]) => [consumer, createHash('sha256').update(token).digest('hex')]),
);

const failures = [];
const check = (ok, what) => {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${what}`);
  if (!ok) failures.push(what);
};
const docker = (args, opts = {}) => execFileSync('docker', args, { encoding: 'utf8', ...opts });

function psql(sql, { quiet = true } = {}) {
  return docker(
    ['exec', '-i', NAME, 'psql', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1', '-Atq'],
    { input: sql, stdio: ['pipe', 'pipe', quiet ? 'pipe' : 'inherit'] },
  );
}

function asRole(role, sql) {
  return psql(`begin;\nset local role ${role};\n${sql}\ncommit;`)
    .trim()
    .split('\n')
    .filter(Boolean);
}

function asTenant(uid, sql) {
  return psql(
    `begin;\nset local role authenticated;\nselect set_config('request.jwt.claim.sub','${uid}',true);\n${sql}\ncommit;`,
  )
    .trim()
    .split('\n')
    .filter((line) => line && line !== uid);
}

function throws(fn, pattern) {
  try {
    fn();
    return false;
  } catch (error) {
    return pattern.test(String(error?.stderr ?? error?.message ?? error));
  }
}

const PRELUDE = `
create extension if not exists pgcrypto;
create schema if not exists auth;
create table auth.users (
  id uuid primary key,
  email text,
  raw_user_meta_data jsonb not null default '{}'::jsonb
);
create role anon nologin;
create role authenticated nologin;
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
grant usage on schema public, auth to anon, authenticated;
`;

const APP_GRANTS = `
grant select, insert, update, delete on public.projects, public.project_members to authenticated;
grant select on public.profiles to authenticated;
grant usage, select on all sequences in schema public to authenticated;
`;

function main() {
  try {
    docker(['info'], { stdio: 'pipe' });
  } catch {
    console.error('MEMBERSHIP OUTBOX DB TEST UNRUN — the Docker daemon is not running.');
    process.exit(2);
  }

  console.log(`Starting ${IMAGE} as ${NAME} …`);
  docker(['run', '-d', '--rm', '--name', NAME, '-e', 'POSTGRES_PASSWORD=pw', IMAGE], { stdio: 'pipe' });
  try {
    for (let i = 0; i < 60; i += 1) {
      try {
        docker(['exec', NAME, 'pg_isready', '-U', 'postgres'], { stdio: 'pipe' });
        break;
      } catch {
        execFileSync('sleep', ['1']);
      }
    }

    psql(PRELUDE);
    for (const file of readdirSync(MIGRATIONS).filter((name) => name.endsWith('.sql')).sort()) {
      psql(readFileSync(join(MIGRATIONS, file), 'utf8'));
    }
    psql(APP_GRANTS);
    psql(`
      insert into auth.users(id,email,raw_user_meta_data) values
        ('${OWNER}','owner@example.test','{"display_name":"Owner"}'),
        ('${MEMBER}','member@example.test','{"display_name":"Member"}'),
        ('${STRANGER}','stranger@example.test','{"display_name":"Stranger"}');
      insert into public.projects(owner_id,name) values ('${OWNER}','Outbox Place');
      insert into public.membership_outbox_secret(consumer,token_hash) values
        ('golem','${TOKEN_HASHES.golem}'),
        ('apple','${TOKEN_HASHES.apple}');
    `);
    const project = psql(`select id from public.projects where owner_id = '${OWNER}';`).trim();
    check(/^[0-9a-f-]{36}$/.test(project), `fixture has a project id (${project})`);

    asTenant(OWNER, `
      insert into public.project_members(project_id,user_id,role,invited_by,expires_at)
      values ('${project}','${MEMBER}','editor','${OWNER}','2026-10-01T00:00:00Z');
    `);
    let state = psql(`
      select version||':'||access||':'||coalesce(role,'null')||':'||coalesce(extract(epoch from expires_at)::bigint::text,'null')
      from public.membership_access_state
      where project_id='${project}' and user_id='${MEMBER}';
    `).trim();
    check(state === '1:clear:editor:1790812800', `insert atomically writes state v1 with expiry (${state})`);
    check(
      Number(psql(`select count(*) from public.membership_access_outbox where project_id='${project}' and user_id='${MEMBER}' and version=1;`).trim()) === 2,
      'insert fans out one row to golem and one to apple',
    );

    asTenant(OWNER, `update public.project_members set role='viewer' where project_id='${project}' and user_id='${MEMBER}';`);
    asTenant(OWNER, `update public.project_members set expires_at='2026-11-01T00:00:00Z' where project_id='${project}' and user_id='${MEMBER}';`);
    asTenant(OWNER, `update public.project_members set revoked_at=now() where project_id='${project}' and user_id='${MEMBER}';`);
    asTenant(OWNER, `update public.project_members set revoked_at=null where project_id='${project}' and user_id='${MEMBER}';`);
    state = psql(`
      select version||':'||access||':'||coalesce(role,'null')||':'||coalesce(extract(epoch from expires_at)::bigint::text,'null')
      from public.membership_access_state
      where project_id='${project}' and user_id='${MEMBER}';
    `).trim();
    check(state === '5:clear:viewer:1793491200', `demote, expiry, revoke and regrant advance one monotonic sequence (${state})`);
    const history = psql(`
      select version||':'||consumer||':'||access||':'||coalesce(role,'null')||':'||coalesce(extract(epoch from expires_at)::bigint::text,'null')
      from public.membership_access_outbox
      where project_id='${project}' and user_id='${MEMBER}'
      order by version,consumer;
    `).trim().split('\n');
    check(history.length === 10, `five events have two consumer deliveries each (${history.length})`);
    check(
      history.includes('2:apple:demoted:viewer:1790812800')
      && history.includes('3:golem:clear:viewer:1793491200')
      && history.includes('4:golem:removed:null:1793491200')
      && history.includes('5:apple:clear:viewer:1793491200'),
      'the stored payload distinguishes demotion, expiry extension, removal and regrant',
    );

    const ownerSees = Number(asTenant(OWNER, `select count(*) from public.membership_access_state where project_id='${project}' and user_id='${MEMBER}';`).pop());
    const selfSees = Number(asTenant(MEMBER, `select count(*) from public.membership_access_state where project_id='${project}' and user_id='${MEMBER}';`).pop());
    const strangerSees = Number(asTenant(STRANGER, `select count(*) from public.membership_access_state where project_id='${project}' and user_id='${MEMBER}';`).pop());
    check(ownerSees === 1 && selfSees === 1 && strangerSees === 0,
      `state is tenant-scoped (owner=${ownerSees}, self=${selfSees}, stranger=${strangerSees})`);
    check(
      throws(() => asTenant(OWNER, `select count(*) from public.membership_access_outbox;`), /permission denied|row-level security/i),
      'even the project owner cannot read queue internals directly',
    );

    const ready = asRole('anon', `select public.membership_access_outbox_ready('${TOKENS.golem}','golem');`).pop();
    check(ready === 't', 'the purpose token and enrolled consumer pass readiness');
    check(
      throws(() => asRole('anon', `select * from public.claim_membership_access_outbox('wrong-membership-outbox-token-0123456789','golem',25);`), /credentials refused/i),
      'a wrong token cannot claim anything',
    );
    check(
      throws(() => asRole('anon', `select * from public.claim_membership_access_outbox('${TOKENS.golem}','other',25);`), /credentials refused/i),
      'an unenrolled consumer cannot claim anything',
    );
    check(
      throws(() => asRole('anon', `select * from public.claim_membership_access_outbox('${TOKENS.golem}','apple',25);`), /credentials refused/i),
      'a valid golem credential cannot claim apple by forging the consumer name',
    );

    const claimed = asRole('anon', `
      select version||':'||access||':'||coalesce(role,'null')||':'||coalesce(extract(epoch from expires_at)::bigint::text,'null')||':'||attempts
      from public.claim_membership_access_outbox('${TOKENS.golem}','golem',50)
      order by version;
    `);
    check(claimed.length === 5 && claimed[0] === '1:clear:editor:1790812800:1' && claimed[4] === '5:clear:viewer:1793491200:1',
      `golem claims its ordered bounded batch (${claimed.join(', ')})`);
    check(
      Number(psql(`select count(*) from public.membership_access_outbox where consumer='apple' and project_id='${project}' and user_id='${MEMBER}';`).trim()) === 5,
      'golem claim leaves every apple delivery untouched',
    );
    const ack1 = asRole('anon', `select public.ack_membership_access_outbox('${TOKENS.golem}','golem','${project}','${MEMBER}',1);`).pop();
    const ack2 = asRole('anon', `select public.ack_membership_access_outbox('${TOKENS.golem}','golem','${project}','${MEMBER}',1);`).pop();
    check(
      throws(() => asRole('anon', `select public.ack_membership_access_outbox('${TOKENS.golem}','apple','${project}','${MEMBER}',1);`), /credentials refused/i),
      'a valid golem credential cannot acknowledge apple by forging the consumer name',
    );
    check(ack1 === 't' && ack2 === 'f', `ack is exact and idempotent (first=${ack1}, retry=${ack2})`);
    check(
      Number(psql(`select count(*) from public.membership_access_outbox where consumer='apple' and project_id='${project}' and user_id='${MEMBER}' and version=1;`).trim()) === 1,
      'golem ack cannot consume apple version 1',
    );

    check(
      throws(
        () => asTenant(MEMBER, `select * from public.record_link_membership_access_change('${project}','${STRANGER}','editor','removed',null);`),
        /manage_members required/i,
      ),
      'an ordinary member cannot manufacture a link lifecycle event',
    );
    const linkEvent = asTenant(OWNER, `
      select version||':'||access||':'||coalesce(role,'null')
      from public.record_link_membership_access_change('${project}','${STRANGER}','editor','removed','2026-12-01T00:00:00Z');
    `).pop();
    check(linkEvent === '1:removed:null', `an owner can atomically record a KV-only removal (${linkEvent})`);
    const linkExpiry = psql(`select extract(epoch from expires_at)::bigint from public.membership_access_state where project_id='${project}' and user_id='${STRANGER}';`).trim();
    check(linkExpiry === '1796083200', `KV-only state carries the authoritative expiry (${linkExpiry})`);
    check(
      Number(psql(`select count(*) from public.membership_access_outbox where project_id='${project}' and user_id='${STRANGER}' and version=1;`).trim()) === 2,
      'KV-only removal is fanned out to both namespaces',
    );

    psql(`update public.membership_outbox_consumers set enabled=false;`);
    const rolledBack = throws(
      () => asTenant(OWNER, `update public.project_members set role='editor' where project_id='${project}' and user_id='${MEMBER}';`),
      /no enabled consumers/i,
    );
    const memberRole = psql(`select role from public.project_members where project_id='${project}' and user_id='${MEMBER}';`).trim();
    const stateVersion = Number(psql(`select version from public.membership_access_state where project_id='${project}' and user_id='${MEMBER}';`).trim());
    check(rolledBack && memberRole === 'viewer' && stateVersion === 5,
      `no consumer rolls back membership and state together (role=${memberRole}, version=${stateVersion})`);

    if (failures.length > 0) {
      console.error(`\nMEMBERSHIP OUTBOX DB TEST FAILED — ${failures.length} assertion(s)`);
      process.exitCode = 1;
    } else {
      console.log('\nMEMBERSHIP OUTBOX DB TEST HOLDS — atomic intent, ordering, tenant scope and per-consumer delivery');
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
