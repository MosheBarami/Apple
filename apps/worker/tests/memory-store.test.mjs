// Scoped memory: what Apple is allowed to remember, for whom, and for how long.
//
// THE CLAIM THIS FILE EXISTS TO FALSIFY: "one project cannot read another's memory."
//
// That claim lives in a WHERE clause and in two permission functions, so it is tested against a
// real SQLite database rather than a recording fake — a fake would answer "no rows" whether the
// query bound both scope columns or neither. And every isolation test asserts the row IS in the
// table while the read does NOT return it: an empty result from an empty database is a failure to
// observe wearing the costume of an observation.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { d1, countRows } from './stubs/d1.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const WORKER = join(HERE, '..');
const out = join(tmpdir(), `apple-memory-store-${process.pid}.mjs`);
execFileSync(join(WORKER, 'node_modules', '.bin', 'esbuild'), [
  join(WORKER, 'src', 'memory-store.ts'), '--bundle', '--format=esm', '--target=es2022', `--outfile=${out}`,
], { cwd: WORKER, stdio: 'pipe' });
const M = await import(`file://${out}`);
process.on('exit', () => rmSync(out, { force: true }));

const {
  ensureMemoryTables, putMemoryEntry, listMemoryEntries, deleteMemoryEntry, purgeExpired,
  readMemoryAudit, orgMembership, setOrgMember, memoryAccessFor, resolveForProject,
  canReadScope, canWriteScope, normaliseEntry, expiresAtFor, isExpired, resolveMemoryLayers,
  precedenceOf, buildExport, parseImport, isMemoryScope, isMemoryKind, isOrgRole,
  MEMORY_SCOPES, MEMORY_EXPORT_FORMAT, VALUE_MAX, MAX_TTL_DAYS, MEMORY_KEY_RE,
} = M;

const USER = 'user-aaaa';
const OTHER = 'user-bbbb';
const A = 'project-aaaa';
const B = 'project-bbbb';
const ORG = 'org-zzzz';
const NOW = Date.UTC(2026, 0, 1, 12, 0, 0);

const accessFor = (overrides = {}) => ({ userId: USER, projectIds: [A], orgs: [], ...overrides });

async function fresh() {
  const db = d1();
  await ensureMemoryTables(db);
  return db;
}

const rowsIn = (db, scope, scopeId) =>
  countRows(db.raw, `select count(*) from memory_entries where scope = ? and scope_id = ?`, scope, scopeId);

// ------------------------------------------------------------------ the vocabulary is real ---

test('scope, kind and role are checked against a list, not asserted by a cast', () => {
  // A `Record<Union, T>` and a `value as Scope` are compile-time promises. These values arrive from
  // a URL segment and from an imported file. `includes` over a literal array is what makes a
  // prototype-borne name answer false, where a bare object lookup would answer with a function.
  for (const bad of ['__proto__', 'constructor', 'toString', 'hasOwnProperty', 'Project', 'PROJECT', '', 0, null, undefined, {}]) {
    assert.equal(isMemoryScope(bad), false, `scope ${JSON.stringify(bad)}`);
    assert.equal(isMemoryKind(bad), false, `kind ${JSON.stringify(bad)}`);
    assert.equal(isOrgRole(bad), false, `role ${JSON.stringify(bad)}`);
  }
  // Each vocabulary refuses the OTHERS' members too — one shared allowlist would have let a scope
  // name through as a kind.
  assert.equal(isMemoryScope('admin'), false, 'an org role is not a scope');
  assert.equal(isMemoryKind('project'), false, 'a scope is not a kind');
  assert.equal(isOrgRole('project'), false, 'a scope is not a role');
  for (const good of MEMORY_SCOPES) assert.equal(isMemoryScope(good), true, good);
});

test('precedence is org < user < project, and an unknown scope throws rather than losing quietly', () => {
  // Asserting the RELATIONSHIP, not the numbers: what matters is the ordering, and a test that
  // pinned "project is 2" would survive the day someone inserts a fourth scope in the middle.
  assert.ok(precedenceOf('project') > precedenceOf('user'), 'a project overrides the person');
  assert.ok(precedenceOf('user') > precedenceOf('org'), 'a person overrides their organisation');
  assert.throws(() => precedenceOf('banana'), /unknown scope/);
});

test('a key is an address: the shapes that would be dangerous as one are refused', () => {
  const bad = ['__proto__', 'constructor', 'prototype', 'profile.__proto__', 'a.constructor.b', 'Doors', 'has space', '', '.leading', '-leading', '_leading', 'x'.repeat(65)];
  for (const k of bad) {
    const r = normaliseEntry({ scope: 'user', scopeId: USER, key: k, value: 'v' }, { now: NOW, actorId: USER });
    assert.equal(r.ok, false, `key ${JSON.stringify(k)} must be refused`);
    assert.equal(r.reason, 'bad_key');
  }
  assert.equal(MEMORY_KEY_RE.test('instruction.doors-1'), true);
});

// ------------------------------------------------------------------------------- expiry ---

test('a TTL that is not a finite number is refused, not silently treated as "never"', () => {
  // `ttlDays ?? null` defends undefined and null and NOTHING else. NaN sails past every `>`
  // comparison as false (stored with no expiry at all), Infinity passes them as true and then
  // throws inside toISOString, and "7" compares as a string that happens to work until "7 days".
  for (const bad of [NaN, Infinity, -Infinity, '7', '7 days', -1, 0, MAX_TTL_DAYS + 1, true, {}, []]) {
    const r = expiresAtFor(bad, NOW);
    assert.equal(r.ok, false, `ttlDays ${JSON.stringify(String(bad))} must be refused`);
    assert.equal(r.reason, 'bad_ttl');
  }
  assert.deepEqual(expiresAtFor(undefined, NOW), { ok: true, expiresAt: null });
  assert.deepEqual(expiresAtFor(null, NOW), { ok: true, expiresAt: null });
});

test('a good TTL lands where it should, expressed as a relationship rather than a literal', () => {
  const r = expiresAtFor(7, NOW);
  assert.equal(r.ok, true);
  const ms = Date.parse(r.expiresAt);
  assert.ok(ms > NOW, 'in the future');
  assert.ok(ms > NOW + 6 * 86_400_000 && ms < NOW + 8 * 86_400_000, 'about seven days out');
});

test('an unparseable expiry reads as EXPIRED, because an immortal corrupt row is the worse failure', () => {
  assert.equal(isExpired({ expiresAt: 'not a date' }, NOW), true);
  assert.equal(isExpired({ expiresAt: null }, NOW), false);
  assert.equal(isExpired({ expiresAt: new Date(NOW - 1).toISOString() }, NOW), true);
  assert.equal(isExpired({ expiresAt: new Date(NOW + 1000).toISOString() }, NOW), false);
});

test('a write with a bad TTL stores NOTHING — the refusal is not just a returned object', async () => {
  const db = await fresh();
  const r = await putMemoryEntry(db, accessFor(), { scope: 'project', scopeId: A, key: 'k', value: 'v', ttlDays: '7' }, { now: NOW });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'bad_ttl');
  assert.equal(rowsIn(db, 'project', A), 0, 'a refused write must not leave a row behind');
  db.close();
});

test('expiry is enforced at READ time, not by a sweeper that may not have run', async () => {
  const db = await fresh();
  await putMemoryEntry(db, accessFor(), { scope: 'project', scopeId: A, key: 'live', value: 'still true' }, { now: NOW });
  // Written directly, past-dated: this is the row a sweeper has not reached yet, which is the
  // normal state of a sweeper. If reads only excluded what the sweeper deleted, the stale
  // instruction would be in the next run's system prompt.
  db.raw.prepare(
    `insert into memory_entries(scope, scope_id, key, kind, value, source, created_at, updated_at, expires_at, updated_by) values(?,?,?,?,?,?,?,?,?,?)`,
  ).run('project', A, 'stale', 'instruction', 'the doors use DoorService', 'model',
    new Date(NOW - 99e7).toISOString(), new Date(NOW - 99e7).toISOString(), new Date(NOW - 1000).toISOString(), USER);

  assert.equal(rowsIn(db, 'project', A), 2, 'both rows ARE in the table');
  const live = await listMemoryEntries(db, accessFor(), 'project', A, { now: NOW });
  assert.deepEqual(live.map((e) => e.key), ['live'], 'the expired row is filtered by the read itself');
  const all = await listMemoryEntries(db, accessFor(), 'project', A, { now: NOW, includeExpired: true });
  assert.equal(all.length, 2, 'and it is still there to be shown to someone asking for history');
  db.close();
});

test('the sweeper removes only what has expired', async () => {
  const db = await fresh();
  await putMemoryEntry(db, accessFor(), { scope: 'project', scopeId: A, key: 'forever', value: 'v' }, { now: NOW });
  await putMemoryEntry(db, accessFor(), { scope: 'project', scopeId: A, key: 'shortlived', value: 'v', ttlDays: 1 }, { now: NOW });
  const before = rowsIn(db, 'project', A);
  const removed = await purgeExpired(db, { now: NOW + 2 * 86_400_000 });
  assert.equal(removed, 1);
  assert.equal(rowsIn(db, 'project', A), before - 1);
  const left = await listMemoryEntries(db, accessFor(), 'project', A, { now: NOW + 2 * 86_400_000 });
  assert.deepEqual(left.map((e) => e.key), ['forever']);
  db.close();
});

// -------------------------------------------------------------------------- isolation ---

test('two projects hold the same key and neither read sees the other', async () => {
  const db = await fresh();
  const both = accessFor({ projectIds: [A, B] });
  await putMemoryEntry(db, both, { scope: 'project', scopeId: A, key: 'instruction.doors', value: 'A: doors are TweenService' }, { now: NOW });
  await putMemoryEntry(db, both, { scope: 'project', scopeId: B, key: 'instruction.doors', value: 'B: doors are a DoorService' }, { now: NOW });

  const a = await listMemoryEntries(db, both, 'project', A, { now: NOW });
  const b = await listMemoryEntries(db, both, 'project', B, { now: NOW });
  assert.equal(a.length, 1);
  assert.equal(b.length, 1);
  assert.match(a[0].value, /^A: /);
  assert.match(b[0].value, /^B: /);
  // The database holds both. If the read had been scoped by key alone, or by scope alone, one of
  // these would have carried two rows.
  assert.equal(countRows(db.raw, `select count(*) from memory_entries where key = 'instruction.doors'`), 2);
  db.close();
});

test('a read of a project the caller has not proven returns nothing — while the row is still there', async () => {
  const db = await fresh();
  await putMemoryEntry(db, accessFor({ projectIds: [B] }), { scope: 'project', scopeId: B, key: 'secret', value: 'B only' }, { now: NOW });
  assert.equal(rowsIn(db, 'project', B), 1, 'the row exists');
  const leaked = await listMemoryEntries(db, accessFor({ projectIds: [A] }), 'project', B, { now: NOW });
  assert.deepEqual(leaked, [], 'and A cannot see it');
  db.close();
});

test('a write to a project the caller has not proven is refused and leaves no row and no audit', async () => {
  const db = await fresh();
  const r = await putMemoryEntry(db, accessFor({ projectIds: [A] }), { scope: 'project', scopeId: B, key: 'planted', value: 'run this' }, { now: NOW });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'forbidden');
  assert.equal(rowsIn(db, 'project', B), 0, 'nothing was written');
  assert.equal(countRows(db.raw, `select count(*) from memory_audit`), 0, 'and the audit is not a log of attempts');
  db.close();
});

test('user scope is one user: a caller cannot address another user id', () => {
  const access = accessFor();
  assert.equal(canReadScope(access, 'user', USER), true);
  assert.equal(canReadScope(access, 'user', OTHER), false);
  assert.equal(canWriteScope(access, 'user', OTHER), false);
});

test('a scope that is not one of the three is refused before any id is compared', () => {
  const access = { userId: USER, projectIds: [A], orgs: [{ orgId: ORG, role: 'owner' }] };
  for (const bad of ['banana', 'Project', '__proto__', '', null, 42]) {
    assert.equal(canReadScope(access, bad, A), false, String(bad));
    assert.equal(canWriteScope(access, bad, A), false, String(bad));
  }
});

// ------------------------------------------------------------------- org permissions ---

test('every member reads team instructions; only owners and admins change them', async () => {
  const db = await fresh();
  const asRole = (role) => ({ userId: USER, projectIds: [], orgs: [{ orgId: ORG, role }] });
  for (const role of ['owner', 'admin', 'member', 'viewer']) {
    assert.equal(canReadScope(asRole(role), 'org', ORG), true, `${role} must be able to READ what they are held to`);
  }
  assert.equal(canWriteScope(asRole('owner'), 'org', ORG), true);
  assert.equal(canWriteScope(asRole('admin'), 'org', ORG), true);
  assert.equal(canWriteScope(asRole('member'), 'org', ORG), false);
  assert.equal(canWriteScope(asRole('viewer'), 'org', ORG), false);

  const denied = await putMemoryEntry(db, asRole('member'), { scope: 'org', scopeId: ORG, key: 'instruction.house', value: 'all Luau is strict', kind: 'instruction' }, { now: NOW });
  assert.equal(denied.ok, false);
  assert.equal(denied.reason, 'forbidden');
  assert.equal(rowsIn(db, 'org', ORG), 0);

  const allowed = await putMemoryEntry(db, asRole('admin'), { scope: 'org', scopeId: ORG, key: 'instruction.house', value: 'all Luau is strict', kind: 'instruction' }, { now: NOW });
  assert.equal(allowed.ok, true);
  assert.equal(rowsIn(db, 'org', ORG), 1);
  db.close();
});

test('a membership row with a role nobody defined grants nothing', async () => {
  const db = await fresh();
  await setOrgMember(db, ORG, USER, 'admin', NOW);
  // The role column is text. A migration, a hand edit or a future version of this file can put
  // anything in it, and "not one of the four" must mean no access rather than whatever the
  // === 'owner' checks happen not to exclude.
  db.raw.prepare(`update memory_org_members set role = 'superadmin' where org_id = ? and user_id = ?`).run(ORG, USER);
  const orgs = await orgMembership(db, USER);
  assert.deepEqual(orgs, [], 'an unrecognised role is dropped, not trusted');

  const access = await memoryAccessFor(db, USER, [A]);
  assert.equal(canReadScope(access, 'org', ORG), false);
  assert.equal(canWriteScope(access, 'org', ORG), false);
  db.close();
});

test('setOrgMember refuses a role it does not recognise', async () => {
  const db = await fresh();
  await assert.rejects(() => setOrgMember(db, ORG, USER, 'superadmin', NOW), /unknown role/);
  assert.equal(countRows(db.raw, `select count(*) from memory_org_members`), 0);
  db.close();
});

// ------------------------------------------------------------- conflict resolution ---

const entry = (scope, scopeId, key, value, extra = {}) => ({
  scope, scopeId, key, value, kind: 'preference', source: 'user',
  createdAt: new Date(NOW).toISOString(), updatedAt: new Date(NOW).toISOString(),
  expiresAt: null, updatedBy: USER, ...extra,
});

test('the nearest layer wins, and the layers it beat are reported in precedence order', () => {
  const r = resolveMemoryLayers([
    entry('org', ORG, 'pref.language', '"en"'),
    entry('project', A, 'pref.language', '"he"'),
    entry('user', USER, 'pref.language', '"es"'),
  ], NOW);
  assert.equal(r.entries.length, 1);
  const [resolved] = r.entries;
  assert.equal(resolved.winner.scope, 'project');
  // The relationship, not the list: every shadowed row must be strictly lower than the winner, and
  // the shadow list must itself be ordered.
  for (const s of resolved.shadowed) assert.ok(precedenceOf(resolved.winner.scope) > precedenceOf(s.scope));
  assert.deepEqual(resolved.shadowed.map((s) => s.scope), ['user', 'org']);
});

test('with no project layer the person wins, not the organisation', () => {
  const r = resolveMemoryLayers([entry('org', ORG, 'pref.language', '"en"'), entry('user', USER, 'pref.language', '"he"')], NOW);
  assert.equal(r.entries[0].winner.scope, 'user');
  assert.equal(r.entries[0].shadowed[0].scope, 'org');
});

test('a row carrying a scope nobody defined is surfaced as invalid, never resolved and never thrown on', () => {
  const r = resolveMemoryLayers([entry('banana', 'x', 'pref.language', '"en"'), entry('user', USER, 'pref.language', '"he"')], NOW);
  assert.equal(r.invalid.length, 1);
  assert.equal(r.entries.length, 1);
  assert.equal(r.entries[0].winner.scope, 'user');
});

test('an expired row does not win a conflict it should not be in', () => {
  const r = resolveMemoryLayers([
    entry('project', A, 'pref.language', '"he"', { expiresAt: new Date(NOW - 1).toISOString() }),
    entry('user', USER, 'pref.language', '"en"'),
  ], NOW);
  assert.equal(r.entries[0].winner.scope, 'user', 'the project row has expired, so the user layer answers');
});

test('resolveForProject layers the three scopes it is allowed to read and no others', async () => {
  const db = await fresh();
  await setOrgMember(db, ORG, USER, 'admin', NOW);
  const access = await memoryAccessFor(db, USER, [A]);
  await putMemoryEntry(db, access, { scope: 'org', scopeId: ORG, key: 'pref.language', value: '"en"', kind: 'preference' }, { now: NOW });
  await putMemoryEntry(db, access, { scope: 'user', scopeId: USER, key: 'pref.language', value: '"he"', kind: 'preference' }, { now: NOW });
  // Another project's row, written by a caller who owns it. It must not appear in A's resolution.
  await putMemoryEntry(db, { userId: OTHER, projectIds: [B], orgs: [] }, { scope: 'project', scopeId: B, key: 'pref.language', value: '"ru"', kind: 'preference' }, { now: NOW });

  const r = await resolveForProject(db, access, { projectId: A, orgId: ORG }, { now: NOW });
  assert.equal(r.entries.length, 1);
  assert.equal(r.entries[0].winner.scope, 'user', 'no project layer here, so the person wins');
  assert.equal(r.layers.project.length, 0);
  assert.equal(JSON.stringify(r).includes('"ru"'), false, "project B's row is nowhere in the answer");
  db.close();
});

// ----------------------------------------------------------------- export / import ---

test('an export round-trips into the SAME scope', async () => {
  const db = await fresh();
  const access = accessFor();
  await putMemoryEntry(db, access, { scope: 'project', scopeId: A, key: 'instruction.doors', value: 'doors use TweenService', kind: 'instruction' }, { now: NOW });
  const bundle = buildExport('project', A, await listMemoryEntries(db, access, 'project', A, { now: NOW }), NOW);
  assert.equal(bundle.format, MEMORY_EXPORT_FORMAT);

  const parsed = parseImport(JSON.parse(JSON.stringify(bundle)), { scope: 'project', scopeId: A }, { now: NOW, actorId: USER });
  assert.equal(parsed.error, null);
  assert.deepEqual(parsed.rejected, []);
  assert.equal(parsed.entries.length, 1);
  assert.equal(parsed.entries[0].value, 'doors use TweenService');
  assert.equal(parsed.entries[0].source, 'import', 'an imported row says so, so it can be told from one the user typed');
});

test("another project's bundle cannot be imported into this one", async () => {
  // The bundle is the delivery mechanism: if import trusted the scope written INSIDE the file, then
  // posting B's export to A's import route would write rows addressed to B, from a caller who has
  // proven nothing about B, and B's next run would read them out of its own system prompt.
  const db = await fresh();
  const bOnly = accessFor({ projectIds: [B] });
  await putMemoryEntry(db, bOnly, { scope: 'project', scopeId: B, key: 'instruction.x', value: "B's rule", kind: 'instruction' }, { now: NOW });
  const bundle = buildExport('project', B, await listMemoryEntries(db, bOnly, 'project', B, { now: NOW }), NOW);

  const parsed = parseImport(bundle, { scope: 'project', scopeId: A }, { now: NOW, actorId: USER });
  assert.deepEqual(parsed.entries, [], 'nothing crosses');
  assert.deepEqual(parsed.rejected.map((r) => r.reason), ['wrong_scope']);

  // And the refusal is not cosmetic: writing what the parser returned puts nothing anywhere.
  for (const e of parsed.entries) await putMemoryEntry(db, accessFor(), e, { now: NOW });
  assert.equal(rowsIn(db, 'project', A), 0);
  assert.equal(rowsIn(db, 'project', B), 1);
  db.close();
});

test('an envelope that lies about its own scope cannot launder a row by agreeing with itself', () => {
  // scope/scopeId are compared against the TARGET, never against the envelope's own header.
  const forged = {
    format: MEMORY_EXPORT_FORMAT, scope: 'project', scopeId: A, exportedAt: new Date(NOW).toISOString(),
    entries: [entry('project', B, 'instruction.x', 'smuggled')],
  };
  const parsed = parseImport(forged, { scope: 'project', scopeId: A }, { now: NOW, actorId: USER });
  assert.deepEqual(parsed.entries, []);
  assert.equal(parsed.rejected[0].reason, 'wrong_scope');
});

test('a bundle that is not a bundle is refused with a reason, not a crash', () => {
  for (const bad of [null, undefined, 42, 'text', [], {}, { format: 'something.else', entries: [] }, { format: MEMORY_EXPORT_FORMAT }]) {
    const r = parseImport(bad, { scope: 'user', scopeId: USER }, { now: NOW, actorId: USER });
    assert.ok(r.error, `${JSON.stringify(bad)} must be refused`);
    assert.deepEqual(r.entries, []);
  }
});

test('an imported row cannot pollute Object.prototype through its key', () => {
  const parsed = parseImport({
    format: MEMORY_EXPORT_FORMAT, scope: 'user', scopeId: USER, exportedAt: new Date(NOW).toISOString(),
    entries: [entry('user', USER, '__proto__', 'polluted'), entry('user', USER, 'constructor', 'polluted')],
  }, { scope: 'user', scopeId: USER }, { now: NOW, actorId: USER });
  assert.deepEqual(parsed.entries, []);
  assert.deepEqual(parsed.rejected.map((r) => r.reason), ['bad_key', 'bad_key']);
  assert.equal({}.polluted, undefined);
});

test('an oversized value is refused, never truncated into a different instruction', () => {
  const r = normaliseEntry({ scope: 'user', scopeId: USER, key: 'k', value: 'x'.repeat(VALUE_MAX + 1) }, { now: NOW, actorId: USER });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'value_too_long');
  const ok = normaliseEntry({ scope: 'user', scopeId: USER, key: 'k', value: 'x'.repeat(VALUE_MAX) }, { now: NOW, actorId: USER });
  assert.equal(ok.ok, true);
});

test('an entry that is already expired on arrival is refused rather than written invisible', () => {
  const r = normaliseEntry({ scope: 'user', scopeId: USER, key: 'k', value: 'v', expiresAt: new Date(NOW - 1).toISOString() }, { now: NOW, actorId: USER });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'already_expired');
});

// ------------------------------------------------------------------------- the audit ---

test('every change is recorded, with what it was before', async () => {
  const db = await fresh();
  const access = accessFor();
  await putMemoryEntry(db, access, { scope: 'project', scopeId: A, key: 'instruction.doors', value: 'first', kind: 'instruction' }, { now: NOW });
  await putMemoryEntry(db, access, { scope: 'project', scopeId: A, key: 'instruction.doors', value: 'second', kind: 'instruction' }, { now: NOW + 1000 });
  const del = await deleteMemoryEntry(db, access, 'project', A, 'instruction.doors', { now: NOW + 2000 });
  assert.equal(del.deleted, true);

  const audit = await readMemoryAudit(db, access, 'project', A);
  assert.equal(audit.length, 3);
  assert.equal(audit[0].action, 'delete', 'newest first');
  assert.equal(audit[0].before, 'second', 'a delete records what was lost — that is what makes "why did this stop applying" answerable');
  assert.equal(audit[0].after, null);
  assert.equal(audit[1].before, 'first', 'and an overwrite records what it replaced');
  assert.equal(audit[1].after, 'second');
  // The row itself is gone. The audit line is deliberately what survives.
  assert.equal(rowsIn(db, 'project', A), 0);
  db.close();
});

test('the audit of a scope the caller cannot read is not readable either', async () => {
  const db = await fresh();
  await putMemoryEntry(db, accessFor({ projectIds: [B] }), { scope: 'project', scopeId: B, key: 'k', value: 'v' }, { now: NOW });
  assert.equal(countRows(db.raw, `select count(*) from memory_audit where scope_id = ?`, B), 1, 'the audit line exists');
  assert.deepEqual(await readMemoryAudit(db, accessFor({ projectIds: [A] }), 'project', B), [], 'and A cannot read it');
  db.close();
});

test('deleting something that is not there is not an error, and is not an audit line either', async () => {
  const db = await fresh();
  const r = await deleteMemoryEntry(db, accessFor(), 'project', A, 'never.existed', { now: NOW });
  assert.equal(r.ok, true);
  assert.equal(r.deleted, false);
  assert.equal(countRows(db.raw, `select count(*) from memory_audit`), 0);
  db.close();
});

test('a delete on a scope the caller cannot write is refused and removes nothing', async () => {
  const db = await fresh();
  await putMemoryEntry(db, accessFor({ projectIds: [B] }), { scope: 'project', scopeId: B, key: 'k', value: 'v' }, { now: NOW });
  const r = await deleteMemoryEntry(db, accessFor({ projectIds: [A] }), 'project', B, 'k', { now: NOW });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'forbidden');
  assert.equal(rowsIn(db, 'project', B), 1);
  db.close();
});

// -------------------------------------------------------------------- stored shape ---

test('a stored row whose kind is not one of the four is dropped on read, not returned as-is', async () => {
  const db = await fresh();
  await putMemoryEntry(db, accessFor(), { scope: 'project', scopeId: A, key: 'good', value: 'v' }, { now: NOW });
  db.raw.prepare(
    `insert into memory_entries(scope, scope_id, key, kind, value, source, created_at, updated_at, expires_at, updated_by) values(?,?,?,?,?,?,?,?,?,?)`,
  ).run('project', A, 'weird', 'banana', 'v', 'user', new Date(NOW).toISOString(), new Date(NOW).toISOString(), null, USER);
  assert.equal(rowsIn(db, 'project', A), 2);
  const read = await listMemoryEntries(db, accessFor(), 'project', A, { now: NOW });
  assert.deepEqual(read.map((e) => e.key), ['good'], 'one corrupt row is dropped; it does not take the read down with it');
  db.close();
});

test('an overwrite keeps created_at, because "since when" and "last touched" are different questions', async () => {
  const db = await fresh();
  const access = accessFor();
  const first = await putMemoryEntry(db, access, { scope: 'project', scopeId: A, key: 'k', value: 'one' }, { now: NOW });
  const second = await putMemoryEntry(db, access, { scope: 'project', scopeId: A, key: 'k', value: 'two' }, { now: NOW + 60_000 });
  assert.equal(second.entry.createdAt, first.entry.createdAt);
  assert.ok(Date.parse(second.entry.updatedAt) > Date.parse(first.entry.updatedAt));
  assert.equal(rowsIn(db, 'project', A), 1, 'an overwrite is one fact changing, not a second row');
  db.close();
});
