/**
 * THE DATABASE AND THE WORKER MUST AGREE ABOUT WHAT A MEMBERSHIP CAN BE.
 *
 * Migration 0005 already had this problem and solved it the same way: the SQL writes the role
 * allowlist a second time, so tests/collab-migration.test.mjs DERIVES its claims from the worker's
 * exported constants rather than checking that the SQL "looks right". Two authorities that
 * disagree are worse than one — F-57, in this repository's own words.
 *
 * 0006 adds two more shared vocabularies: the event kinds, and the fact that a SUSPENDED grant is
 * dead. Each is asserted against the module that enforces it.
 *
 * The file is read, not run: applying a migration needs a live Postgres, and a check that only
 * runs where there is one is a check that does not run.
 *
 * Run with:  node --test tests/membership-migration.test.mjs     (from apps/worker)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { GRANTABLE_ROLES, classifyGrant } from '../src/collab.ts';
import { MEMBERSHIP_EVENT_KINDS, EVENT_REASON_MAX } from '../src/membership.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const SQL = readFileSync(join(ROOT, 'infra', 'supabase', 'migrations', '0006_membership_lifecycle.sql'), 'utf8');
const SQL_0005 = readFileSync(join(ROOT, 'infra', 'supabase', 'migrations', '0005_collaboration.sql'), 'utf8');

/** The migration with comments stripped, so a claim can never be satisfied by prose about it. */
const CODE = SQL.split('\n')
  .filter((l) => !l.trim().startsWith('--'))
  .join('\n');

test('the fixture is honest: the prose and the SQL are told apart', () => {
  assert.ok(SQL.includes('APPEND-ONLY'), 'the header explains the append-only property');
  assert.equal(CODE.includes('APPEND-ONLY'), false, 'the stripped copy must contain no comments');
  assert.ok(CODE.includes('create table if not exists public.membership_events'), 'and must still contain the SQL');
});

test('the event kinds in the CHECK constraint are exactly the worker vocabulary', () => {
  const [, list] = CODE.match(/kind text not null check \(kind in \(([^)]+)\)\)/) ?? [];
  assert.ok(list, 'membership_events must constrain `kind`');
  const listed = [...list.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
  assert.deepEqual(
    listed.slice().sort(),
    [...MEMBERSHIP_EVENT_KINDS].sort(),
    'the database vocabulary and MEMBERSHIP_EVENT_KINDS have drifted — one of them is now wrong',
  );
});

test('an event may only name a role a membership row may carry', () => {
  for (const column of ['from_role', 'to_role']) {
    const re = new RegExp(`${column} text check \\(${column} is null or ${column} in \\(([^)]+)\\)\\)`);
    const [, list] = CODE.match(re) ?? [];
    assert.ok(list, `${column} must be constrained`);
    const listed = [...list.matchAll(/'([a-z]+)'/g)].map((m) => m[1]);
    assert.deepEqual(listed.slice().sort(), [...GRANTABLE_ROLES].sort(), `${column} does not match GRANTABLE_ROLES`);
    assert.equal(listed.includes('owner'), false, 'ownership is the projects.owner_id column; no event moves it');
  }
});

test('the reason is bounded in the database by the same number the worker bounds it by', () => {
  const caps = [...CODE.matchAll(/char_length\((?:reason|suspended_reason)\) <= (\d+)/g)].map((m) => Number(m[1]));
  assert.ok(caps.length >= 2, 'both the event reason and the suspension reason must be bounded');
  for (const cap of caps) assert.equal(cap, EVENT_REASON_MAX, 'the SQL bound and EVENT_REASON_MAX have drifted apart');
});

test('THE HISTORY CANNOT BE REWRITTEN: no update policy and no delete policy exist on it', () => {
  // The whole value of the table. RLS denies what no policy admits, so the absence IS the
  // mechanism — which means the absence has to be checked, not assumed.
  const policies = [...CODE.matchAll(/create policy "([^"]+)" on public\.membership_events\s+for (\w+)/g)].map((m) => ({
    name: m[1],
    verb: m[2].toLowerCase(),
  }));
  assert.ok(policies.length >= 3, 'the table must have its read and append policies');
  const verbs = new Set(policies.map((p) => p.verb));
  assert.equal(verbs.has('update'), false, 'an update policy makes the audit log editable by the people it records');
  assert.equal(verbs.has('delete'), false, 'a delete policy makes the audit log erasable by the people it records');
  assert.equal(verbs.has('all'), false, '`for all` grants update and delete through the back door');
  assert.ok(verbs.has('insert') && verbs.has('select'), 'it must still be writable and readable');
  assert.match(CODE, /alter table public\.membership_events enable row level security/, 'RLS must be on, or none of this applies');
});

test('an audit row can only be written by the person it says wrote it', () => {
  const [, check] = CODE.match(/for insert with check \(([\s\S]*?)\);/) ?? [];
  assert.ok(check, 'the insert policy must have a with-check');
  assert.match(check, /public\.project_role\(project_id\) in \('owner','admin'\)/, 'only an administrator may append');
  assert.match(check, /actor_id = auth\.uid\(\)/, 'an event attributed to somebody else is worse than no event');
});

test('SUSPENSION CLOSES THE DOOR IN SQL TOO, everywhere 0005 tested for a live grant', () => {
  // The worker refuses a suspended grant — proved directly, so this test cannot pass on a
  // classifyGrant that stopped caring.
  assert.equal(
    classifyGrant({ user_id: 'u', role: 'editor', suspended_at: '2026-09-01T00:00:00.000Z' }, Date.parse('2026-09-15T12:00:00.000Z')).status,
    'suspended',
  );

  // Every place 0006 asks whether a grant is live must ask about BOTH facts. Checked by proximity
  // rather than per line: the two conditions sit on adjacent lines of the same predicate, and a
  // line-by-line version of this assertion failed on correct SQL — which is a check measuring the
  // formatting instead of the property it names.
  const liveTests = [...CODE.matchAll(/revoked_at is null/g)].map((m) => m.index);
  assert.ok(liveTests.length >= 3, `0006 must restate the liveness test where it matters, found ${liveTests.length}`);
  for (const at of liveTests) {
    const predicate = CODE.slice(at, at + 200);
    assert.match(predicate, /suspended_at is null/, `a liveness test that ignores suspension: ${predicate.split('\n')[0]}`);
  }
  assert.equal(
    [...CODE.matchAll(/suspended_at is null/g)].length,
    liveTests.length,
    'every liveness test names both facts, and none names only suspension',
  );
  // THE CONTROL. Without it the loop above proves nothing: 0005's own predicates do NOT mention
  // suspension, so the matcher must be able to fail on the file this migration supersedes.
  const old = [...SQL_0005.matchAll(/revoked_at is null/g)].map((m) => m.index);
  assert.ok(old.length >= 3, 'fixture sanity: 0005 tests for liveness in several places');
  assert.equal(
    old.some((at) => /suspended_at is null/.test(SQL_0005.slice(at, at + 200))),
    false,
    'the check would pass on 0005 unchanged, so it is not checking anything',
  );

  // …including inside project_role, which every policy in 0005 calls.
  const [, fn] = CODE.match(/create or replace function public\.project_role[\s\S]*?\$\$([\s\S]*?)\$\$/) ?? [];
  assert.ok(fn, '0006 must republish project_role');
  assert.match(fn, /pm\.suspended_at is null/, 'the lookup every policy calls must refuse a suspended grant');
  // And it must still answer the questions 0005 gave it, or this migration breaks sharing.
  assert.match(fn, /pm\.revoked_at is null/);
  assert.match(fn, /pm\.expires_at is null or pm\.expires_at > now\(\)/);
  assert.ok(SQL_0005.includes('order by case pm.role when'), 'fixture sanity: 0005 is the file being superseded');
  assert.match(fn, /order by case pm\.role when 'admin' then 3 when 'editor' then 2 when 'commenter' then 1 else 0 end desc/,
    'the strength ordering must survive the rewrite — see tests/collab-migration.test.mjs');
});

test('the shared-project read policy is republished, because it cannot call project_role', () => {
  // It inlines the liveness test (a policy on `projects` calling a function that reads `projects`
  // recurses), so the suspension condition has to be repeated there by hand. If this policy is
  // left as 0005 wrote it, a suspended member still reads the project row.
  const [, policy] = CODE.match(/create policy "members read shared projects" on public\.projects\s+for select using \(([\s\S]*?)\n  \);/) ?? [];
  assert.ok(policy, '0006 must republish the projects read policy');
  assert.match(policy, /pm\.suspended_at is null/);
});
