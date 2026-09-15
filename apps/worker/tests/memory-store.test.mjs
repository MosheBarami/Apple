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
  refusedDisclosure, personalDisclosures, escapeLike, searchTerm, moveMemoryEntry,
  createOrg, listOrgsFor, orgMembersOf, updateOrgMember, removeOrgMember, canAdministerOrg,
  normaliseOrgName, ORG_NAME_MAX,
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

// ==========================================================================================
// A CREDENTIAL IS NOT A MEMORY
//
// Every row here is loaded into the system prompt of every later run, in the highest-trust
// position, and then never read by a person again. A credential that lands in one is a credential
// re-sent to a model provider forever — by a product whose egress guard would have refused to send
// it anywhere else. Each fixture carries EXACTLY ONE credential inside an otherwise ordinary
// instruction, and each assertion pairs the refusal with a count of the rows actually in the table:
// "the read came back empty" is not evidence that a write was refused.
// ==========================================================================================

const A_JWT = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dBjftJeZ4CVPmB92K27uhbUJU1p1r_wW1gFWFOEjXk';
const A_KEY = 'sk-ant-api03-ZZZZZZZZZZZZZZZZZZZZ';

test('a value carrying a credential is refused, and nothing is written', async () => {
  const db = await fresh();
  for (const [label, value] of [
    ['a JWT', `always call the API with ${A_JWT}`],
    ['a provider key', `use ${A_KEY} for the art calls`],
    ['an authorization header', 'send authorization: Bearer abcdefghijklmnop on every request'],
    ['a payment card', 'bill the studio account 4111 1111 1111 1111 each month'],
    ['an SSN', 'the owner is 123-45-6789'],
  ]) {
    const r = await putMemoryEntry(db, accessFor(), { scope: 'project', scopeId: A, key: 'instruction.x', value }, { now: NOW });
    assert.equal(r.ok, false, label);
    assert.equal(r.reason, 'sensitive_value', label);
    assert.ok(typeof r.detail === 'string' && r.detail.length > 0, `${label}: the refusal says what it saw`);
    assert.equal(r.detail.includes(A_JWT) || r.detail.includes(A_KEY), false, `${label}: and never repeats the value`);
  }
  assert.equal(rowsIn(db, 'project', A), 0, 'a refused write leaves no row');
  db.close();
});

test('the refusal is narrow: ordinary Roblox prose with a hash in it still stores', async () => {
  // `long_hex` is a heuristic that matches a git SHA and a content hash. A store that refused those
  // would be one that rejects real memories to guard against a hypothetical one, and users would
  // learn that the instruction box randomly fails.
  const db = await fresh();
  const ok = await putMemoryEntry(
    db,
    accessFor(),
    { scope: 'project', scopeId: A, key: 'instruction.hash', kind: 'instruction', value: 'the baseplate mesh is 3f2a9c1b4d5e6f708192a3b4c5d6e7f8 — do not re-upload it' },
    { now: NOW },
  );
  assert.equal(ok.ok, true, ok.reason);
  assert.equal(rowsIn(db, 'project', A), 1);
  db.close();
});

test('an email is stored but marked as personal, so the viewer can mask it', async () => {
  const db = await fresh();
  const r = await putMemoryEntry(db, accessFor(), { scope: 'user', scopeId: USER, key: 'instruction.mail', kind: 'instruction', value: 'send builds to maya@example.com' }, { now: NOW });
  assert.equal(r.ok, true, 'a contact address is a legitimate thing to remember');
  const findings = personalDisclosures(r.entry.value);
  assert.deepEqual(findings.map((f) => f.kind), ['email']);
  // And the two lists do not overlap: a kind that is refused outright must not also be offered as
  // something to merely mask.
  assert.equal(personalDisclosures('4111 1111 1111 1111').length, 0);
  assert.ok(refusedDisclosure('4111 1111 1111 1111'));
  assert.equal(refusedDisclosure('maya@example.com'), null);
  db.close();
});

test('an import cannot carry in what the editor refuses', async () => {
  // The bundle is a request body with extra steps. A check on the entry route only would be a
  // check anyone could walk around by exporting, editing the file and importing it back.
  const db = await fresh();
  const bundle = {
    format: MEMORY_EXPORT_FORMAT,
    scope: 'project',
    scopeId: A,
    exportedAt: new Date(NOW).toISOString(),
    entries: [
      { scope: 'project', scopeId: A, key: 'instruction.ok', kind: 'instruction', value: 'use Rojo', source: 'user', createdAt: new Date(NOW).toISOString(), updatedAt: new Date(NOW).toISOString(), expiresAt: null, updatedBy: USER },
      { scope: 'project', scopeId: A, key: 'instruction.bad', kind: 'instruction', value: `token ${A_JWT}`, source: 'user', createdAt: new Date(NOW).toISOString(), updatedAt: new Date(NOW).toISOString(), expiresAt: null, updatedBy: USER },
    ],
  };
  const parsed = parseImport(bundle, { scope: 'project', scopeId: A }, { now: NOW, actorId: USER });
  assert.deepEqual(parsed.entries.map((e) => e.key), ['instruction.ok'], 'the clean row still imports');
  assert.deepEqual(parsed.rejected, [{ key: 'instruction.bad', reason: 'sensitive_value', detail: parsed.rejected[0]?.detail }]);
  assert.match(parsed.rejected[0].detail, /JWS|JWT/i, 'and the user is told which row and why');
  db.close();
});

// ==========================================================================================
// SEARCH
// ==========================================================================================

async function seeded() {
  const db = await fresh();
  const access = accessFor();
  await putMemoryEntry(db, access, { scope: 'project', scopeId: A, key: 'instruction.doors', kind: 'instruction', value: 'Doors use TweenService' }, { now: NOW });
  await putMemoryEntry(db, access, { scope: 'project', scopeId: A, key: 'instruction.lava', kind: 'instruction', value: 'lava kills instantly' }, { now: NOW });
  await putMemoryEntry(db, access, { scope: 'project', scopeId: A, key: 'instruction.percent', kind: 'instruction', value: 'keep the cost under 100% of budget' }, { now: NOW });
  return db;
}

test('a search returns the matching rows and leaves the others in the table', async () => {
  // The second half is the assertion that matters: an empty result from an empty scope is a
  // failure to observe wearing the costume of an observation.
  const db = await seeded();
  const hits = await listMemoryEntries(db, accessFor(), 'project', A, { now: NOW, query: 'tween' });
  assert.deepEqual(hits.map((e) => e.key), ['instruction.doors'], 'case-insensitive, matches the value');
  assert.equal(rowsIn(db, 'project', A), 3, 'the rows it did not return are still there');
  db.close();
});

test('a search matches the key as well as the value', async () => {
  const db = await seeded();
  const hits = await listMemoryEntries(db, accessFor(), 'project', A, { now: NOW, query: 'instruction.lava' });
  assert.deepEqual(hits.map((e) => e.key), ['instruction.lava']);
  db.close();
});

test('a wildcard in the query is a literal, not a query for everything', async () => {
  // Unescaped, `%` matches every row — a result that looks like a successful search and is the
  // absence of one.
  const db = await seeded();
  assert.equal(rowsIn(db, 'project', A), 3, 'three rows are there to be over-matched');
  const all = await listMemoryEntries(db, accessFor(), 'project', A, { now: NOW, query: '%' });
  assert.deepEqual(all.map((e) => e.key), ['instruction.percent'], 'a per-cent sign matches the row that HAS one, not all three');
  const real = await listMemoryEntries(db, accessFor(), 'project', A, { now: NOW, query: '100%' });
  assert.deepEqual(real.map((e) => e.key), ['instruction.percent']);
  const underscore = await listMemoryEntries(db, accessFor(), 'project', A, { now: NOW, query: 'lav_' });
  assert.deepEqual(underscore.map((e) => e.key), [], 'and `_` is not a single-character wildcard either');
  assert.equal(escapeLike('100%_\\'), '100\\%\\_\\\\');
  db.close();
});

test('an empty or whitespace query is not a filter, and is not a match-nothing either', async () => {
  const db = await seeded();
  for (const q of ['', '   ', null, undefined, 42, {}]) {
    const hits = await listMemoryEntries(db, accessFor(), 'project', A, { now: NOW, query: q });
    assert.equal(hits.length, 3, `query ${JSON.stringify(String(q))} returns the whole scope`);
  }
  assert.equal(searchTerm('  doors '), 'doors');
  assert.equal(searchTerm(''), null);
  db.close();
});

test('a search still cannot cross a scope, and an expired row still does not come back', async () => {
  const db = await seeded();
  // Project B holds a row that MATCHES the query, and the caller has not proven B.
  db.raw.prepare(
    `insert into memory_entries(scope, scope_id, key, kind, value, source, created_at, updated_at, expires_at, updated_by) values(?,?,?,?,?,?,?,?,?,?)`,
  ).run('project', B, 'instruction.doors', 'instruction', 'Doors use TweenService', 'user', new Date(NOW).toISOString(), new Date(NOW).toISOString(), null, OTHER);
  db.raw.prepare(
    `insert into memory_entries(scope, scope_id, key, kind, value, source, created_at, updated_at, expires_at, updated_by) values(?,?,?,?,?,?,?,?,?,?)`,
  ).run('project', A, 'instruction.old', 'instruction', 'Doors used to be manual', 'user', new Date(NOW).toISOString(), new Date(NOW).toISOString(), new Date(NOW - 1000).toISOString(), USER);
  assert.equal(rowsIn(db, 'project', B), 1, 'the other project does hold a matching row');
  const hits = await listMemoryEntries(db, accessFor(), 'project', A, { now: NOW, query: 'doors' });
  assert.deepEqual(hits.map((e) => e.key), ['instruction.doors'], 'one scope, and only what is still live');
  db.close();
});

// ==========================================================================================
// MOVING A ROW BETWEEN SCOPES
// ==========================================================================================

test('a move takes the row with it — gone from one scope, present in the other, once', async () => {
  const db = await fresh();
  const access = { userId: USER, projectIds: [A], orgs: [] };
  await putMemoryEntry(db, access, { scope: 'user', scopeId: USER, key: 'instruction.rojo', kind: 'instruction', value: 'use Rojo' }, { now: NOW });
  const moved = await moveMemoryEntry(db, access, { scope: 'user', scopeId: USER }, { scope: 'project', scopeId: A }, 'instruction.rojo', { now: NOW + 5000 });
  assert.equal(moved.ok, true, moved.reason);
  assert.equal(rowsIn(db, 'user', USER), 0, 'it left');
  assert.equal(rowsIn(db, 'project', A), 1, 'and arrived');
  assert.equal(moved.entry.scope, 'project');
  assert.equal(moved.entry.value, 'use Rojo');
  db.close();
});

test('a move keeps created_at and the original source — it is the same fact, relocated', async () => {
  const db = await fresh();
  const access = { userId: USER, projectIds: [A], orgs: [] };
  const before = await putMemoryEntry(db, access, { scope: 'user', scopeId: USER, key: 'instruction.a', kind: 'instruction', value: 'v', source: 'model' }, { now: NOW });
  const moved = await moveMemoryEntry(db, access, { scope: 'user', scopeId: USER }, { scope: 'project', scopeId: A }, 'instruction.a', { now: NOW + 60_000 });
  assert.equal(moved.entry.createdAt, before.entry.createdAt);
  assert.equal(moved.entry.source, 'model', 'who first said it does not change by moving it');
  assert.ok(Date.parse(moved.entry.updatedAt) > Date.parse(before.entry.updatedAt));
  db.close();
});

test('a move needs write access to BOTH ends', async () => {
  const db = await fresh();
  // The caller owns project A and is a mere MEMBER of the org: they may read the org's rows and
  // must not be able to push their own instruction into the team's prompt.
  const access = { userId: USER, projectIds: [A], orgs: [{ orgId: ORG, role: 'member' }] };
  await putMemoryEntry(db, access, { scope: 'project', scopeId: A, key: 'instruction.a', kind: 'instruction', value: 'mine' }, { now: NOW });
  const out = await moveMemoryEntry(db, access, { scope: 'project', scopeId: A }, { scope: 'org', scopeId: ORG }, 'instruction.a', { now: NOW });
  assert.equal(out.ok, false);
  assert.equal(out.reason, 'forbidden');
  assert.equal(rowsIn(db, 'project', A), 1, 'and the source row is untouched');
  assert.equal(rowsIn(db, 'org', ORG), 0);
  db.close();
});

test('a move never overwrites what is already at the destination', async () => {
  const db = await fresh();
  const access = { userId: USER, projectIds: [A], orgs: [] };
  await putMemoryEntry(db, access, { scope: 'user', scopeId: USER, key: 'instruction.k', kind: 'instruction', value: 'the personal one' }, { now: NOW });
  await putMemoryEntry(db, access, { scope: 'project', scopeId: A, key: 'instruction.k', kind: 'instruction', value: 'the project one' }, { now: NOW });
  const out = await moveMemoryEntry(db, access, { scope: 'user', scopeId: USER }, { scope: 'project', scopeId: A }, 'instruction.k', { now: NOW });
  assert.equal(out.ok, false);
  assert.equal(out.reason, 'target_exists');
  const target = await listMemoryEntries(db, access, 'project', A, { now: NOW });
  assert.equal(target[0].value, 'the project one', 'the destination still says what it said');
  assert.equal(rowsIn(db, 'user', USER), 1, 'and the source was not consumed');
  db.close();
});

test('the personal profile cannot be moved out of the personal scope', async () => {
  // profileFromEntries reads the user layer only, so a profile row in a project scope is a row
  // that exists, renders, and is read by nothing.
  const db = await fresh();
  const access = { userId: USER, projectIds: [A], orgs: [] };
  await putMemoryEntry(db, access, { scope: 'user', scopeId: USER, key: 'profile.about', kind: 'profile', value: 'builds obbies' }, { now: NOW });
  const out = await moveMemoryEntry(db, access, { scope: 'user', scopeId: USER }, { scope: 'project', scopeId: A }, 'profile.about', { now: NOW });
  assert.equal(out.ok, false);
  assert.equal(out.reason, 'wrong_scope');
  assert.equal(rowsIn(db, 'user', USER), 1);
  db.close();
});

test('a move of something that is not there is not_found, and moving to the same place is refused', async () => {
  const db = await fresh();
  const access = { userId: USER, projectIds: [A], orgs: [] };
  const missing = await moveMemoryEntry(db, access, { scope: 'user', scopeId: USER }, { scope: 'project', scopeId: A }, 'instruction.nope', { now: NOW });
  assert.equal(missing.ok, false);
  assert.equal(missing.reason, 'not_found');
  await putMemoryEntry(db, access, { scope: 'user', scopeId: USER, key: 'instruction.k', kind: 'instruction', value: 'v' }, { now: NOW });
  const same = await moveMemoryEntry(db, access, { scope: 'user', scopeId: USER }, { scope: 'user', scopeId: USER }, 'instruction.k', { now: NOW });
  assert.equal(same.ok, false);
  assert.equal(same.reason, 'same_scope');
  assert.equal(rowsIn(db, 'user', USER), 1, 'and the row survived being asked to move to itself');
  db.close();
});

test('both histories explain a move: where it went, and where it came from', async () => {
  const db = await fresh();
  const access = { userId: USER, projectIds: [A], orgs: [] };
  await putMemoryEntry(db, access, { scope: 'user', scopeId: USER, key: 'instruction.k', kind: 'instruction', value: 'use Rojo' }, { now: NOW });
  await moveMemoryEntry(db, access, { scope: 'user', scopeId: USER }, { scope: 'project', scopeId: A }, 'instruction.k', { now: NOW + 1000 });
  const source = await readMemoryAudit(db, access, 'user', USER, 10);
  const dest = await readMemoryAudit(db, access, 'project', A, 10);
  assert.equal(source[0].action, 'move', 'the scope it left says so');
  assert.equal(source[0].before, 'use Rojo', 'and still says what left');
  assert.equal(dest[0].action, 'move');
  assert.equal(dest[0].after, 'use Rojo');
  db.close();
});

// ==========================================================================================
// ORGANISATIONS: SOMETHING HAS TO CREATE A MEMBERSHIP
// ==========================================================================================

test('creating an organisation makes the creator an owner who can actually write team rules', async () => {
  // Before this existed there was no way to be in an org at all: `setOrgMember` had no caller, so
  // the whole org layer — team instructions, the org preference floor — was unreachable code.
  const db = await fresh();
  const created = await createOrg(db, USER, '  Lava   Studios ', { now: NOW });
  assert.equal(created.ok, true);
  assert.equal(created.org.name, 'Lava Studios', 'the name is collapsed, not stored as typed');
  const access = await memoryAccessFor(db, USER);
  assert.deepEqual(access.orgs, [{ orgId: created.org.id, role: 'owner' }]);
  assert.equal(canWriteScope(access, 'org', created.org.id), true);
  const wrote = await putMemoryEntry(db, access, { scope: 'org', scopeId: created.org.id, key: 'instruction.t', kind: 'instruction', value: 'ship on Fridays' }, { now: NOW });
  assert.equal(wrote.ok, true, wrote.reason);
  db.close();
});

test('an organisation with no name is refused rather than created nameless', async () => {
  const db = await fresh();
  for (const bad of ['', '   ', null, 42, {}]) {
    const r = await createOrg(db, USER, bad, { now: NOW });
    assert.equal(r.ok, false, JSON.stringify(String(bad)));
    assert.equal(r.reason, 'bad_name');
  }
  assert.equal(countRows(db.raw, 'select count(*) from memory_orgs'), 0);
  assert.equal(normaliseOrgName('x'.repeat(ORG_NAME_MAX + 20)).length, ORG_NAME_MAX);
  db.close();
});

test('an added member can read the team rules and cannot change them', async () => {
  const db = await fresh();
  const { org } = await createOrg(db, USER, 'Lava Studios', { now: NOW });
  const ownerAccess = await memoryAccessFor(db, USER);
  await putMemoryEntry(db, ownerAccess, { scope: 'org', scopeId: org.id, key: 'instruction.t', kind: 'instruction', value: 'ship on Fridays' }, { now: NOW });

  const added = await updateOrgMember(db, ownerAccess, org.id, OTHER, 'member', { now: NOW });
  assert.equal(added.ok, true, added.reason);
  const theirs = await memoryAccessFor(db, OTHER);
  assert.deepEqual(theirs.orgs, [{ orgId: org.id, role: 'member' }]);
  const read = await listMemoryEntries(db, theirs, 'org', org.id, { now: NOW });
  assert.deepEqual(read.map((e) => e.value), ['ship on Fridays'], 'rules you are held to are rules you can see');
  const write = await putMemoryEntry(db, theirs, { scope: 'org', scopeId: org.id, key: 'instruction.t', kind: 'instruction', value: 'never ship' }, { now: NOW });
  assert.equal(write.ok, false);
  assert.equal(write.reason, 'forbidden');
  const after = await listMemoryEntries(db, ownerAccess, 'org', org.id, { now: NOW });
  assert.equal(after[0].value, 'ship on Fridays', 'and the rule is unchanged');
  db.close();
});

test('a member cannot add members, and an admin cannot mint an owner', async () => {
  const db = await fresh();
  const { org } = await createOrg(db, USER, 'Lava Studios', { now: NOW });
  const owner = await memoryAccessFor(db, USER);
  await updateOrgMember(db, owner, org.id, OTHER, 'member', { now: NOW });
  const member = await memoryAccessFor(db, OTHER);
  assert.equal(canAdministerOrg(member, org.id), false);
  const byMember = await updateOrgMember(db, member, org.id, 'user-cccc', 'admin', { now: NOW });
  assert.equal(byMember.ok, false);
  assert.equal(byMember.reason, 'forbidden');

  await updateOrgMember(db, owner, org.id, OTHER, 'admin', { now: NOW });
  const admin = await memoryAccessFor(db, OTHER);
  assert.equal(canAdministerOrg(admin, org.id), true, 'an admin does administer');
  const promotion = await updateOrgMember(db, admin, org.id, 'user-cccc', 'owner', { now: NOW });
  assert.equal(promotion.ok, false, 'but cannot promote anyone to owner — including, next call, themselves');
  assert.equal(promotion.reason, 'forbidden');
  assert.equal(countRows(db.raw, `select count(*) from memory_org_members where org_id = ? and role = 'owner'`, org.id), 1);
  db.close();
});

test('the last owner cannot be demoted or removed, because the org would become unadministrable', async () => {
  const db = await fresh();
  const { org } = await createOrg(db, USER, 'Lava Studios', { now: NOW });
  const owner = await memoryAccessFor(db, USER);
  const demote = await updateOrgMember(db, owner, org.id, USER, 'member', { now: NOW });
  assert.equal(demote.ok, false);
  assert.equal(demote.reason, 'last_owner');
  const removed = await removeOrgMember(db, owner, org.id, USER);
  assert.equal(removed.ok, false);
  assert.equal(removed.reason, 'last_owner');
  assert.deepEqual((await memoryAccessFor(db, USER)).orgs, [{ orgId: org.id, role: 'owner' }], 'still the owner');

  // With a SECOND owner the same two operations are allowed — which is what shows the refusal
  // above was about the last owner and not about owners in general.
  await updateOrgMember(db, owner, org.id, OTHER, 'owner', { now: NOW });
  const now2 = await memoryAccessFor(db, USER);
  assert.equal((await updateOrgMember(db, now2, org.id, USER, 'member', { now: NOW })).ok, true);
  db.close();
});

test('removing a member takes their access with it', async () => {
  const db = await fresh();
  const { org } = await createOrg(db, USER, 'Lava Studios', { now: NOW });
  const owner = await memoryAccessFor(db, USER);
  await putMemoryEntry(db, owner, { scope: 'org', scopeId: org.id, key: 'instruction.t', kind: 'instruction', value: 'ship on Fridays' }, { now: NOW });
  await updateOrgMember(db, owner, org.id, OTHER, 'member', { now: NOW });
  assert.equal((await listMemoryEntries(db, await memoryAccessFor(db, OTHER), 'org', org.id, { now: NOW })).length, 1);

  const gone = await removeOrgMember(db, owner, org.id, OTHER);
  assert.equal(gone.ok, true, gone.reason);
  const after = await memoryAccessFor(db, OTHER);
  assert.deepEqual(after.orgs, []);
  assert.equal((await listMemoryEntries(db, after, 'org', org.id, { now: NOW })).length, 0, 'and the rules go with it');
  assert.equal(rowsIn(db, 'org', org.id), 1, 'though the rows themselves are still there for the team');
  db.close();
});

test('the roster lists who is in an organisation, to members only', async () => {
  const db = await fresh();
  const { org } = await createOrg(db, USER, 'Lava Studios', { now: NOW });
  const owner = await memoryAccessFor(db, USER);
  await updateOrgMember(db, owner, org.id, OTHER, 'admin', { now: NOW + 1000 });
  const roster = await orgMembersOf(db, owner, org.id);
  assert.deepEqual(roster.map((m) => [m.userId, m.role]), [[USER, 'owner'], [OTHER, 'admin']]);
  const stranger = await orgMembersOf(db, { userId: 'user-cccc', projectIds: [], orgs: [] }, org.id);
  assert.deepEqual(stranger, [], 'a non-member is told nothing, including who is in it');
  db.close();
});

test('the scope list carries the name, and a membership whose org row is missing still appears', async () => {
  // Membership rows and organisation rows are written by different statements. An inner join would
  // make a person's own org vanish from their switcher while its rules kept applying to them.
  const db = await fresh();
  const { org } = await createOrg(db, USER, 'Lava Studios', { now: NOW });
  await setOrgMember(db, 'org-orphaned', USER, 'member', NOW);
  const mine = await listOrgsFor(db, USER);
  assert.deepEqual(
    mine.map((o) => [o.id, o.name, o.role]).sort(),
    [[org.id, 'Lava Studios', 'owner'], ['org-orphaned', null, 'member']].sort(),
  );
  db.close();
});
