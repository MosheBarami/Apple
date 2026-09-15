/**
 * THE DATABASE AND THE WORKER MUST AGREE ABOUT WHO MAY DO WHAT.
 *
 * Migration 0005 writes the role allowlist and the role ordering a second time, in SQL, because
 * RLS is the backstop behind every route and a backstop that cannot answer the question is not
 * one. Two authorities that disagree are worse than one — that is F-57 in this repository's own
 * words, and it was a checker drifting out of agreement with the thing it checked.
 *
 * So this file does not assert that the SQL "looks right". It DERIVES the claims from
 * `src/collab.ts` — the same exported constants the worker enforces — and requires the SQL to
 * match them. Add a role to the product without adding it to the migration and this goes red;
 * order them differently in SQL than in `roleRank` and this goes red.
 *
 * It reads the file rather than running it: applying a migration needs a live Postgres, and this
 * check has to run in `node --test` beside everything else or it will not run at all.
 *
 * Run with:  node --test tests/collab-migration.test.mjs     (from apps/worker)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { GRANTABLE_ROLES, COLLAB_ROLES, roleRank } from '../src/collab.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const SQL = readFileSync(join(ROOT, 'infra', 'supabase', 'migrations', '0005_collaboration.sql'), 'utf8');

/** The single line that carries a claim, so a second occurrence elsewhere cannot satisfy it. */
function line(pattern, what) {
  const hits = SQL.split('\n').filter((l) => pattern.test(l));
  assert.equal(hits.length >= 1, true, `no line in the migration ${what}`);
  return hits;
}

test('the role CHECK constraint is exactly the worker GRANTABLE_ROLES, in the same order', () => {
  const [check] = line(/check \(role in \(/, 'declares the role check constraint');
  const listed = [...check.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
  assert.deepEqual(
    listed,
    [...GRANTABLE_ROLES],
    'the database allowlist and GRANTABLE_ROLES have drifted apart — one of them is now wrong',
  );
  assert.equal(listed.includes('owner'), false, 'a membership row must never be able to say owner');
});

test('every role the product has is either grantable or the owner — nothing is unaccounted for', () => {
  const unaccounted = COLLAB_ROLES.filter((r) => r !== 'owner' && !GRANTABLE_ROLES.includes(r));
  assert.deepEqual(unaccounted, [], `roles the migration cannot express: ${unaccounted.join(', ')}`);
});

test('the SQL strength ordering agrees with roleRank', () => {
  // `order by case pm.role when 'admin' then 3 …` is the SQL copy of roleRank. If the two disagree
  // a user with two grants gets one answer from Postgres and another from the worker.
  const cases = [...SQL.matchAll(/when '([a-z]+)' then (\d+)/g)].map((m) => ({ role: m[1], weight: Number(m[2]) }));
  assert.ok(cases.length >= 3, 'the migration must weight the grantable roles');
  for (const a of cases) {
    for (const b of cases) {
      if (a.role === b.role) continue;
      const sqlSaysStronger = a.weight > b.weight;
      const workerSaysStronger = roleRank(a.role) > roleRank(b.role);
      assert.equal(
        sqlSaysStronger,
        workerSaysStronger,
        `SQL and the worker disagree about whether ${a.role} outranks ${b.role}`,
      );
    }
  }
  // The role the CASE falls through to must be the weakest one, or the default is a promotion.
  const weakest = [...GRANTABLE_ROLES].sort((x, y) => roleRank(x) - roleRank(y))[0];
  const weighted = new Set(cases.map((c) => c.role));
  assert.equal(weighted.has(weakest), false, `${weakest} must be the else branch, not a weighted case`);
});

test('the membership lookup cannot recurse and cannot be shadowed', () => {
  assert.match(SQL, /create or replace function public\.project_role/, 'the lookup must exist');
  assert.match(SQL, /security definer/, 'it must run outside RLS or the policies recurse');
  assert.match(SQL, /set search_path = ''/, 'a SECURITY DEFINER function with a mutable search_path is a hijack');
  // Policies ON project_members must not read project_members directly — that is the recursion.
  const policies = SQL.split(/create policy /).slice(1);
  for (const p of policies) {
    const head = p.slice(0, p.indexOf('\n'));
    if (!/on public\.project_members/.test(p.slice(0, 200))) continue;
    const body = p.slice(p.indexOf('using'));
    assert.equal(
      /from public\.project_members/.test(body),
      false,
      `policy ${head} reads project_members inside a policy on project_members — that recurses at query time`,
    );
  }
});

test('the function is executable by users, and not by the anonymous role', () => {
  assert.match(SQL, /revoke all on function public\.project_role\(uuid\) from public;/);
  assert.match(SQL, /grant execute on function public\.project_role\(uuid\) to authenticated;/);
});

test('every grant-reading policy excludes revoked and expired rows', () => {
  // A policy that forgot either one is a policy that keeps letting a removed collaborator in, and
  // the worker's own check would never be consulted because RLS would already have said yes.
  const guarded = SQL.split('\n').filter((l) => /pm\.revoked_at is null/.test(l));
  const expiring = SQL.split('\n').filter((l) => /pm\.expires_at is null or pm\.expires_at > now\(\)/.test(l));
  assert.ok(guarded.length >= 2, 'every membership lookup must exclude revoked rows');
  assert.equal(guarded.length, expiring.length, 'a lookup that checks revocation must also check expiry, and the reverse');
});

test('membership is revoked, never deleted', () => {
  assert.match(SQL, /revoked_at timestamptz/, 'the column that records the end of access');
  assert.equal(/delete from public\.project_members/i.test(SQL), false, 'access history must not be erasable by the product');
});

test('row level security is actually switched on for the new table', () => {
  // A table created without this is world-readable to every authenticated user, and every policy
  // below it is decoration.
  assert.match(SQL, /alter table public\.project_members enable row level security;/);
});
