/**
 * THE DATABASE SIDE OF THE REVOCATION OUTBOX.
 *
 * Transport tests cannot prove that an intent is committed with the membership mutation. This
 * file binds the SQL vocabulary to the worker's exported constants and checks the transaction
 * mechanism itself: a row trigger calls the sequencer, and that sequencer updates state and fans
 * out per-consumer outbox rows before it can return.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { GRANTABLE_ROLES, MEMBERSHIP_ACCESS_CHANGES } from '../src/collab.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const SQL = readFileSync(join(ROOT, 'infra', 'supabase', 'migrations', '0009_membership_access_outbox.sql'), 'utf8');
const CODE = SQL.split('\n').filter((line) => !line.trim().startsWith('--')).join('\n');

function quoted(list) {
  return [...list.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
}

test('state and outbox constrain roles and access kinds to the worker vocabulary', () => {
  const roleChecks = [...CODE.matchAll(/role text check \(role is null or role in \(([^)]+)\)\)/g)].map((m) => quoted(m[1]));
  assert.ok(roleChecks.length >= 2, 'both state and outbox must constrain role');
  for (const roles of roleChecks) assert.deepEqual(roles, [...GRANTABLE_ROLES]);

  const accessChecks = [...CODE.matchAll(/access text not null check \(access in \(([^)]+)\)\)/g)].map((m) => quoted(m[1]));
  assert.equal(accessChecks.length, 2, 'state and outbox each need an access constraint');
  for (const access of accessChecks) assert.deepEqual(access, [...MEMBERSHIP_ACCESS_CHANGES]);
});

test('the project_members write invokes state sequencing and outbox fanout in its transaction', () => {
  assert.match(CODE, /create trigger project_member_access_outbox\s+after insert or update of role, expires_at, revoked_at, suspended_at\s+on public\.project_members/);
  const [, triggerBody] = CODE.match(/create or replace function private\.project_member_access_outbox_trigger[\s\S]*?as \$fn\$([\s\S]*?)\$fn\$/) ?? [];
  assert.ok(triggerBody, 'the trigger function must exist');
  assert.match(triggerBody, /private\.enqueue_membership_access\(/, 'the row mutation must call the one sequencer');

  const [, enqueue] = CODE.match(/create or replace function private\.enqueue_membership_access[\s\S]*?as \$fn\$([\s\S]*?)\$fn\$/) ?? [];
  assert.ok(enqueue, 'the sequencer must exist');
  assert.match(enqueue, /insert into public\.membership_access_state as current/);
  assert.match(enqueue, /on conflict on constraint membership_access_state_pkey do update\s+set version = current\.version \+ 1/);
  assert.match(enqueue, /insert into public\.membership_access_outbox/);
  assert.match(enqueue, /from public\.membership_outbox_consumers c\s+where c\.enabled/);
  assert.match(enqueue, /if v_consumers = 0 then[\s\S]*raise exception/, 'no consumer must roll back the mutation');
});

test('KV-only lifecycle changes use an authenticated state+outbox RPC, not a second best-effort push', () => {
  const [, fn] = CODE.match(/create or replace function public\.record_link_membership_access_change[\s\S]*?as \$fn\$([\s\S]*?)\$fn\$/) ?? [];
  assert.ok(fn);
  assert.match(fn, /auth\.uid\(\) is null/);
  assert.match(fn, /public\.project_role\(p_project\)/);
  assert.match(fn, /private\.enqueue_membership_access\(/);
  assert.match(CODE, /grant execute on function public\.record_link_membership_access_change\(uuid,uuid,text,text,timestamptz\) to authenticated/);
  assert.match(CODE, /revoke all on function public\.record_link_membership_access_change\(uuid,uuid,text,text,timestamptz\) from public, anon/);
});

test('delivery is tenant-safe, per namespace, bounded and retryable', () => {
  assert.match(CODE, /values \('golem'\), \('apple'\)/, 'both live DO namespaces need their own row');
  assert.match(CODE, /primary key \(project_id, user_id, version, consumer\)/);
  assert.match(CODE, /private\.membership_outbox_authorized\(p_token, p_consumer\)/);
  assert.match(CODE, /join public\.membership_outbox_secret s on s\.consumer = c\.consumer[\s\S]*c\.consumer = p_consumer[\s\S]*s\.token_hash = pg_catalog\.encode\([\s\S]*pg_catalog\.sha256\([\s\S]*pg_catalog\.convert_to\(p_token, 'UTF8'\)/,
    'the stored digest is compared to a server-side hash of the raw token');
  assert.match(CODE, /create table if not exists public\.membership_outbox_secret \(\s*consumer text primary key references public\.membership_outbox_consumers\(consumer\)/,
    'each enabled consumer owns a distinct credential row');
  assert.match(CODE, /c\.consumer = p_consumer\s+and c\.enabled/);
  assert.match(CODE, /least\(greatest\(coalesce\(p_limit, 25\), 1\), 50\)/, 'claim size must be capped');
  assert.match(CODE, /for update skip locked/);
  assert.match(CODE, /least\(o\.attempts \+ 1, 1000000\)/, 'attempt bookkeeping cannot overflow forever');
  assert.match(CODE, /least\(300, \(1 << least\(o\.attempts, 8\)\)\)/, 'retry delay must be capped');
  assert.match(CODE, /where o\.consumer = p_consumer[\s\S]*o\.version = p_version/, 'ack is exact and consumer-scoped');
});

test('queue internals have RLS and no direct anon/authenticated table grants', () => {
  for (const table of ['membership_outbox_consumers', 'membership_outbox_secret', 'membership_access_state', 'membership_access_outbox']) {
    assert.match(CODE, new RegExp(`alter table public\\.${table} enable row level security`), `${table} has no RLS`);
  }
  for (const table of ['membership_outbox_consumers', 'membership_outbox_secret', 'membership_access_outbox']) {
    assert.match(CODE, new RegExp(`revoke all on table public\\.${table} from public, anon, authenticated`));
    assert.equal(
      new RegExp(`grant (?:select|insert|update|delete|all)[^;]*public\\.${table} to (?:anon|authenticated)`, 'i').test(CODE),
      false,
      `${table} is directly reachable instead of token-gated RPC only`,
    );
  }
  assert.match(CODE, /grant select on table public\.membership_access_state to authenticated/);
});

test('every SECURITY DEFINER function pins an empty search_path', () => {
  const functions = CODE.split(/create or replace function /).slice(1);
  assert.ok(functions.length >= 7);
  for (const fn of functions) {
    const name = fn.slice(0, fn.indexOf('(')).trim();
    if (!/security definer/i.test(fn)) continue;
    assert.match(fn, /set search_path = ''/, `${name} has a mutable SECURITY DEFINER search path`);
  }
});

test('both Worker configs schedule their own consumer and only golem retains the nightly sweep', () => {
  const parse = (name) => JSON.parse(readFileSync(join(ROOT, 'apps', 'worker', name), 'utf8').replace(/^\s*\/\/[^\n]*$/gm, ''));
  const golem = parse('wrangler.jsonc');
  const apple = parse('wrangler.apple.jsonc');
  assert.equal(golem.vars.MEMBERSHIP_OUTBOX_CONSUMER, 'golem');
  assert.equal(apple.vars.MEMBERSHIP_OUTBOX_CONSUMER, 'apple');
  assert.ok(golem.triggers.crons.includes('* * * * *'));
  assert.ok(apple.triggers.crons.includes('* * * * *'));
  assert.ok(golem.triggers.crons.includes('0 3 * * *'));
  assert.equal(apple.triggers.crons.includes('0 3 * * *'), false, 'two workers must not race the shared D1 retention sweep');
});
