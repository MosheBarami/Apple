/**
 * TAKE YOUR DATA WITH YOU, AND TAKE YOUR ACCOUNT AWAY — both routes, executed.
 *
 * Three published pages promised an account deletion this product did not have, and `user-export.ts`
 * — a column-by-column inventory of what is held about one person — was imported by nothing at all.
 * A spec with no caller is a document, not a feature: the person who asked for their data got the
 * transcript of one project, and the person who asked to be deleted got an email address.
 *
 * The app is instantiated and real requests are issued, for the reason every other *-routes-live
 * file in here records: a route asserted by reading index.ts's source is satisfied by a comment.
 *
 * WHAT THESE TESTS ARE ACTUALLY FOR — each one is a way the feature could be worse than nothing:
 *
 *   - AN EXPORT THAT LIES BY OMISSION. `studio_pairings` has no select policy, so a query with the
 *     caller's token returns `[]` however many rows exist. Printed as rows that is "you have no
 *     pairings", which is an observation nothing observed. It must read as unread.
 *   - AN EXPORT THAT LEAKS. The file travels — an inbox, a backup, a support ticket — and three of
 *     the columns near the ones it carries are live credentials: the API key hash, the pairing
 *     code, the share-link token.
 *   - A DELETION THAT LEAVES ROWS BEHIND while saying the account is gone. Every store the worker
 *     can reach is counted, and what it CANNOT reach is named rather than quietly omitted.
 *   - A DELETION SOMEBODY ELSE CAN FIRE. It takes a typed confirmation and it only ever acts on the
 *     id in the verified token.
 *
 * Run with:  node --test tests/account-data-routes-live.test.mjs      (from apps/worker)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as esbuild from 'esbuild';
import { rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';
import { d1, countRows } from './stubs/d1.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const WORKER = join(HERE, '..');
const OUT = join(tmpdir(), `golem-account-data-${process.pid}.mjs`);

await esbuild.build({
  entryPoints: [join(WORKER, 'src', 'index.ts')],
  bundle: true, format: 'esm', target: 'es2022', outfile: OUT,
  plugins: [{
    name: 'stub-boundaries',
    setup(b) {
      b.onResolve({ filter: /^\.\/auth$/ }, () => ({ path: pathToFileURL(join(HERE, 'stubs', 'auth.mjs')).href, external: true }));
      b.onResolve({ filter: /^\.\/supa$/ }, () => ({ path: pathToFileURL(join(HERE, 'stubs', 'supa.mjs')).href, external: true }));
      b.onResolve({ filter: /^cloudflare:workers$/ }, () => ({ path: join(HERE, 'stubs', 'cloudflare-workers.mjs') }));
    },
  }],
});
const app = (await import(`file://${OUT}`)).default;
const { PROJECTS, ROWS, FAILING } = await import(`file://${join(HERE, 'stubs', 'supa.mjs')}`);
process.on('exit', () => rmSync(OUT, { force: true }));

const ALICE = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const BOB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const PROJECT = '11111111-1111-4111-8111-111111111111';
const BOBS_PROJECT = '22222222-2222-4222-8222-222222222222';

PROJECTS.set(PROJECT, ALICE);
PROJECTS.set(BOBS_PROJECT, BOB);

const SECRET_CODE = 'PAIR-SECRET-9999';
const SECRET_TOKEN = 'sharetokenAAAAAAAAAAAAAAAAAAAAAA';

function seedPostgres() {
  ROWS.clear();
  FAILING.clear();
  ROWS.set('profiles', [
    { id: ALICE, display_name: 'Alice', plan: 'pro', training_opt_in: false, created_at: '2026-01-01T00:00:00Z', is_admin: true },
    { id: BOB, display_name: 'Bob', plan: 'free', training_opt_in: true, created_at: '2026-01-02T00:00:00Z', is_admin: false },
  ]);
  ROWS.set('projects', [
    { id: PROJECT, owner_id: ALICE, name: 'Tower Defence', description: null, place_name: null, place_id: null,
      memory_summary: null, memory_facts: [], created_at: '2026-01-03T00:00:00Z', updated_at: '2026-01-04T00:00:00Z',
      last_activity_at: null, archived_at: null, pinned_at: '2026-02-01T00:00:00Z', tags: ['obby'] },
    { id: BOBS_PROJECT, owner_id: BOB, name: "Bob's place", description: null, place_name: null, place_id: null,
      memory_summary: null, memory_facts: [], created_at: '2026-01-03T00:00:00Z', updated_at: '2026-01-04T00:00:00Z',
      last_activity_at: null, archived_at: null, pinned_at: null, tags: [] },
  ]);
  ROWS.set('messages', [
    { id: 'm1', project_id: PROJECT, owner_id: ALICE, role: 'user', mode: 'clay', content: 'build a lobby', tool_trace: null, created_at: '2026-01-05T00:00:00Z' },
    { id: 'm2', project_id: BOBS_PROJECT, owner_id: BOB, role: 'user', mode: 'clay', content: "bob's private message", tool_trace: null, created_at: '2026-01-05T00:00:00Z' },
  ]);
  ROWS.set('checkpoints', [
    { id: 'c1', project_id: PROJECT, owner_id: ALICE, label: 'before', kind: 'auto', r2_key: 'internal/path/secret', script_count: 3, instance_count: 9, size_bytes: 12, created_at: '2026-01-06T00:00:00Z' },
  ]);
  ROWS.set('usage_events', [
    { id: 1, owner_id: ALICE, project_id: PROJECT, kind: 'chat', credits: 4, input_tokens: 100, output_tokens: 50, model: 'glm', created_at: '2026-01-07T00:00:00Z' },
  ]);
  ROWS.set('feedback', [
    { id: 'f1', owner_id: ALICE, kind: 'bug', content: 'the lobby door sticks', page: '/ws', status: 'open', created_at: '2026-01-08T00:00:00Z' },
  ]);
  // Readable by nobody but the service role — the row exists and the caller's token cannot see it.
  ROWS.set('studio_pairings', [
    { code: SECRET_CODE, owner_id: ALICE, project_id: PROJECT, created_at: '2026-01-09T00:00:00Z', expires_at: '2026-01-09T01:00:00Z', claimed_at: null },
  ]);
  ROWS.set('waitlist', [{ id: 'w1', email: 'alice@example.com', owner_id: ALICE, created_at: '2025-12-01T00:00:00Z' }]);
  ROWS.set('project_members', [
    { project_id: BOBS_PROJECT, user_id: ALICE, role: 'editor', display_name: 'Alice', invited_by: BOB, created_at: '2026-02-02T00:00:00Z',
      expires_at: null, revoked_at: null, suspended_at: null, suspended_reason: null, suspended_by: null },
  ]);
  ROWS.set('membership_events', [
    { id: 'e1', project_id: BOBS_PROJECT, subject_id: ALICE, actor_id: BOB, kind: 'invited', from_role: null,
      to_role: 'editor', reason: null, via_token: SECRET_TOKEN, created_at: '2026-02-02T00:00:00Z' },
  ]);
}

/** A D1 with the worker's own tables and a row of Alice's in each one that matters. */
function seedD1() {
  const db = d1();
  const x = (sql, ...params) => db.raw.prepare(sql).run(...params);
  db.raw.exec(`create table if not exists api_keys(id text primary key, user_id text not null, mode text not null, name text not null, key_hash text not null unique, scopes text not null, projects text not null, created_at integer not null, expires_at integer, last_used_at integer, revoked_at integer)`);
  db.raw.exec(`create table if not exists memory_entries(scope text not null, scope_id text not null, key text not null, kind text not null, value text not null, source text not null, created_at text not null, updated_at text not null, expires_at text, updated_by text not null, primary key(scope, scope_id, key))`);
  db.raw.exec(`create table if not exists memory_audit(id text primary key, scope text not null, scope_id text not null, key text not null, action text not null, actor text not null, at text not null, before_value text, after_value text)`);
  db.raw.exec(`create table if not exists memory_org_members(org_id text not null, user_id text not null, role text not null, added_at text not null, primary key(org_id, user_id))`);
  db.raw.exec(`create table if not exists notifications(id text primary key, recipient_id text not null, kind text not null, severity text not null, title text not null, body text, project_id text, project_name text, subject text, href text not null, dedupe_key text not null, group_key text not null, created_at integer not null, updated_at integer not null, deliver_at integer not null, read_at integer, occurrences integer not null)`);
  db.raw.exec(`create table if not exists automations(id text primary key, owner_id text not null, project_id text not null, name text not null, description text, prompt text not null, mode text not null, trigger_kind text not null, schedule_json text, timezone text not null, event text, enabled integer not null, overlap text not null, missed_runs text not null, max_retries integer not null, max_credits_per_run integer not null, max_runs_per_day integer not null, created_at integer not null, updated_at integer not null, next_fire_at integer, last_fire_at integer)`);
  db.raw.exec(`create table if not exists automation_runs(id text primary key, automation_id text not null, owner_id text not null, project_id text not null, fire_key text not null unique, trigger_kind text not null, due_at integer, started_at integer not null, finished_at integer, outcome text, attempt integer not null, run_id text, credits integer, error text, fold text)`);
  db.raw.exec(`create table if not exists user_credentials(user_id text not null, provider text not null, sealed text not null, roblox_creator_id text not null, creator_type text not null, scopes text not null, fingerprint text not null, hint text not null, created_at text not null, last_used_at text, expires_at text, primary key(user_id, provider))`);
  db.raw.exec(`create table if not exists creator_write_log(id integer primary key autoincrement, user_id text not null, at text not null, action text not null, roblox_creator_id text not null, creator_type text not null, target text, ok integer not null, http_status integer, request text, response text)`);
  db.raw.exec(`create table if not exists project_asset_use(project_id text not null, asset_id text not null, first_used_at text not null, last_used_at text not null, uses integer not null default 1, via_live_api integer not null default 0, context text, primary key(project_id, asset_id))`);

  x(`insert into api_keys values (?,?,?,?,?,?,?,?,?,?,?)`, 'k1', ALICE, 'live', 'ci', 'HASH-OF-THE-KEY', '[]', '[]', 1, null, null, null);
  x(`insert into api_keys values (?,?,?,?,?,?,?,?,?,?,?)`, 'k2', BOB, 'live', 'bobs', 'BOB-HASH', '[]', '[]', 1, null, null, null);
  x(`insert into memory_entries values (?,?,?,?,?,?,?,?,?,?)`, 'user', ALICE, 'style', 'preference', 'terse', 'user', 'x', 'x', null, ALICE);
  x(`insert into memory_entries values (?,?,?,?,?,?,?,?,?,?)`, 'project', PROJECT, 'goal', 'fact', 'a lobby', 'model', 'x', 'x', null, ALICE);
  x(`insert into memory_entries values (?,?,?,?,?,?,?,?,?,?)`, 'project', BOBS_PROJECT, 'goal', 'fact', "bob's goal", 'model', 'x', 'x', null, BOB);
  x(`insert into memory_audit values (?,?,?,?,?,?,?,?,?)`, 'a1', 'user', ALICE, 'style', 'put', ALICE, 'x', null, 'terse');
  x(`insert into memory_audit values (?,?,?,?,?,?,?,?,?)`, 'a2', 'project', PROJECT, 'goal', 'put', ALICE, 'x', null, 'a lobby');
  x(`insert into memory_org_members values (?,?,?,?)`, 'org1', ALICE, 'member', 'x');
  x(`insert into notifications values (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, 'n1', ALICE, 'mention', 'info', 'hi', null, PROJECT, 'Tower Defence', null, '/x', 'd', 'g', 1, 1, 1, null, 1);
  x(`insert into notifications values (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, 'n2', BOB, 'mention', 'info', 'hi bob', null, BOBS_PROJECT, "Bob's place", null, '/x', 'd', 'g', 1, 1, 1, null, 1);
  x(`insert into automations values (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, 'au1', ALICE, PROJECT, 'nightly', null, 'do the thing', 'clay', 'schedule', null, 'UTC', null, 1, 'skip', 'skip', 0, 10, 5, 1, 1, null, null);
  x(`insert into automation_runs values (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, 'r1', 'au1', ALICE, PROJECT, 'fk1', 'schedule', 1, 1, 2, 'ok', 1, null, 3, null, null);
  x(`insert into user_credentials values (?,?,?,?,?,?,?,?,?,?,?)`, ALICE, 'roblox', 'SEALED-CREDENTIAL', '123', 'user', '[]', 'fp', '…1234', 'x', null, null);
  x(`insert into creator_write_log (user_id, at, action, roblox_creator_id, creator_type, target, ok, http_status, request, response) values (?,?,?,?,?,?,?,?,?,?)`, ALICE, 'x', 'upload', '123', 'user', 't', 1, 200, null, null);
  x(`insert into project_asset_use values (?,?,?,?,?,?,?)`, PROJECT, 'asset1', 'x', 'x', 1, 0, null);
  return db;
}

/** A KV that pages, so a prefix sweep has to page too rather than deleting the first twenty keys. */
const KV_ROWS = new Map();
const kv = {
  async get(key) { return KV_ROWS.get(key) ?? null; },
  async getWithMetadata(key) { return { value: KV_ROWS.get(key) ?? null, metadata: null }; },
  async put(key, value) { KV_ROWS.set(key, value); },
  async delete(key) { KV_ROWS.delete(key); },
  async list({ prefix = '', cursor } = {}) {
    const names = [...KV_ROWS.keys()].filter((k) => k.startsWith(prefix)).sort();
    const start = cursor ? Number(cursor) : 0;
    const page = names.slice(start, start + 2);
    const complete = start + 2 >= names.length;
    return { keys: page.map((name) => ({ name })), list_complete: complete, ...(complete ? {} : { cursor: String(start + 2) }) };
  },
};

function seedKv() {
  KV_ROWS.clear();
  for (const p of ['ws', 'wsv', 'wst']) {
    KV_ROWS.set(`${p}:${PROJECT}:notes/plan.md`, 'alice plan');
    KV_ROWS.set(`${p}:${PROJECT}:notes/two.md`, 'alice two');
    KV_ROWS.set(`${p}:${PROJECT}:notes/three.md`, 'alice three');
    KV_ROWS.set(`${p}:${BOBS_PROJECT}:notes/bob.md`, 'bob plan');
  }
  KV_ROWS.set(`image:${PROJECT}:i1`, 'png');
  KV_ROWS.set(`audio:${PROJECT}:a1`, 'wav');
  KV_ROWS.set(`image:${BOBS_PROJECT}:i9`, 'bob png');
  KV_ROWS.set(`share:grant:${PROJECT}:${BOB}`, '{}');
  KV_ROWS.set(`share:link:by-project:${PROJECT}:${SECRET_TOKEN}`, '');
  KV_ROWS.set(`share:link:${SECRET_TOKEN}`, JSON.stringify({ project_id: PROJECT, token: SECRET_TOKEN }));
  KV_ROWS.set('config:models', '{}');
}

let DB = null;
const PURGED = [];
const env = () => ({
  CORPUS: DB.CORPUS,
  KV: kv,
  SESSION_DO: {
    idFromName: (n) => n,
    get: (n) => ({
      async fetch(url, init) {
        if (new URL(url).pathname === '/purge' && init?.method === 'POST') PURGED.push(n);
        return new Response('{}', { status: 200 });
      },
    }),
  },
  QUOTA_DO: { idFromName: (n) => n, get: () => ({ async fetch() { return new Response('{}', { status: 200 }); } }) },
  ADMIN_DO: { idFromName: (n) => n, get: () => ({ async fetch() { return new Response('{}', { status: 200 }); } }) },
});

const as = (user) => ({ headers: { Authorization: `Bearer ${user}` } });
const post = (user, body) => ({
  method: 'POST',
  headers: { Authorization: `Bearer ${user}`, 'Content-Type': 'application/json' },
  body: JSON.stringify(body ?? {}),
});

function reset() {
  seedPostgres();
  seedKv();
  PURGED.length = 0;
  if (DB) DB.close();
  DB = seedD1();
}

// ------------------------------------------------------------------- the export ---

test('the account export needs a credential', async () => {
  reset();
  const res = await app.request('https://x/api/me/export', {}, env());
  assert.equal(res.status, 401);
});

test('the account export is a downloadable file that carries its own digest', async () => {
  reset();
  const res = await app.request('https://x/api/me/export', as(ALICE), env());
  assert.equal(res.status, 200);
  assert.match(res.headers.get('Content-Disposition') ?? '', /^attachment; filename="/);
  assert.match(res.headers.get('Content-Type') ?? '', /application\/json/);
  const body = await res.text();
  const doc = JSON.parse(body);
  assert.equal(doc.format, 'golem.account-export.v1');
  assert.equal(doc.user.id, ALICE);
  assert.ok(doc.exportedAt);
  // The digest is over the data, and it is in the file, because a header only exists during the
  // download and the file is the thing that gets kept.
  assert.match(doc.sha256, /^[0-9a-f]{64}$/);
});

test('every table the spec declares appears in the file, and the rows are the caller’s own', async () => {
  reset();
  const doc = await (await app.request('https://x/api/me/export', as(ALICE), env())).json();
  for (const table of ['profiles', 'projects', 'messages', 'checkpoints', 'usage_events', 'feedback', 'waitlist', 'project_members', 'membership_events', 'api_keys']) {
    assert.ok(doc.tables[table], `${table} is missing from the export entirely`);
    assert.equal(doc.tables[table].status, 'ok', `${table}: ${doc.tables[table].reason ?? ''}`);
  }
  assert.equal(doc.tables.profiles.rows.length, 1);
  assert.equal(doc.tables.profiles.rows[0].id, ALICE);
  assert.equal(doc.tables.projects.rows.length, 1);
  assert.equal(doc.tables.projects.rows[0].id, PROJECT);
  assert.equal(doc.tables.api_keys.rows.length, 1);
  assert.equal(doc.tables.api_keys.rows[0].id, 'k1');
  // Somebody else's rows are not in this person's export.
  const bytes = JSON.stringify(doc);
  assert.equal(bytes.includes("bob's private message"), false);
  assert.equal(bytes.includes('BOB-HASH'), false);
});

test('the columns a person’s own project gained in later migrations are in their export', async () => {
  reset();
  const doc = await (await app.request('https://x/api/me/export', as(ALICE), env())).json();
  const project = doc.tables.projects.rows[0];
  assert.equal(project.pinned_at, '2026-02-01T00:00:00Z');
  assert.deepEqual(project.tags, ['obby']);
});

test('a table nothing could read reads as unread, never as empty', async () => {
  reset();
  const doc = await (await app.request('https://x/api/me/export', as(ALICE), env())).json();
  const pairings = doc.tables.studio_pairings;
  assert.equal(pairings.status, 'unreadable');
  assert.ok((pairings.reason ?? '').length > 20, 'an unread table must say why it was not read');
  assert.equal('rows' in pairings, false, 'an unread table must not carry a rows array anybody could count');
  assert.equal(doc.complete, false, 'a file missing a store is not a complete export and must not say it is');
  assert.ok(doc.incomplete.includes('studio_pairings'));
});

test('a query that fails is reported as a failure, not as no rows', async () => {
  reset();
  FAILING.set('feedback', 503);
  const doc = await (await app.request('https://x/api/me/export', as(ALICE), env())).json();
  assert.equal(doc.tables.feedback.status, 'failed');
  assert.equal(doc.tables.feedback.httpStatus, 503);
  assert.equal('rows' in doc.tables.feedback, false);
  assert.equal(doc.complete, false);
  assert.ok(doc.incomplete.includes('feedback'));
});

test('a complete export says so — the positive control for the two tests above', async () => {
  reset();
  // With the one service-role table removed from the run, everything else is readable.
  ROWS.delete('studio_pairings');
  const doc = await (await app.request('https://x/api/me/export', as(ALICE), env())).json();
  // studio_pairings is still declared unreadable — its access is a property of the schema, not of
  // whether rows happen to exist — so completeness is asserted over the tables that CAN be read.
  const readable = Object.entries(doc.tables).filter(([, t]) => t.status !== 'unreadable');
  assert.ok(readable.length >= 9);
  assert.deepEqual(readable.filter(([, t]) => t.status !== 'ok').map(([n]) => n), []);
});

test('no credential leaves in the file, whichever table it sits next to', async () => {
  reset();
  const body = await (await app.request('https://x/api/me/export', as(ALICE), env())).text();
  assert.equal(body.includes('HASH-OF-THE-KEY'), false, 'the API key hash escaped in the export');
  assert.equal(body.includes(SECRET_CODE), false, 'a live Studio pairing code escaped in the export');
  assert.equal(body.includes(SECRET_TOKEN), false, 'a live share-link token escaped in the export');
  assert.equal(body.includes('internal/path/secret'), false, 'an internal object key escaped in the export');
  assert.equal(body.includes('SEALED-CREDENTIAL'), false, 'the sealed Roblox credential escaped in the export');
});

test('what is withheld is named, with the reason, beside the table it was withheld from', async () => {
  reset();
  const doc = await (await app.request('https://x/api/me/export', as(ALICE), env())).json();
  assert.ok(doc.tables.api_keys.withheld.key_hash.length > 20);
  assert.ok(doc.tables.membership_events.withheld.via_token.length > 20);
  assert.ok(doc.tables.studio_pairings.withheld.code.length > 20);
});

test('the file says where the parts it does not contain can be got', async () => {
  reset();
  const doc = await (await app.request('https://x/api/me/export', as(ALICE), env())).json();
  assert.ok(Array.isArray(doc.elsewhere) && doc.elsewhere.length >= 15, 'the rest of the stores are not named at all');
  for (const entry of doc.elsewhere) {
    assert.ok(entry.name && entry.holds && entry.where, `${entry.name}: an entry must say what it holds and where to get it`);
  }
  // The conversation is the biggest thing this product holds and it is not in this file.
  const messages = doc.elsewhere.find((e) => e.name === 'messages' && e.binding === 'SESSION_DO');
  assert.ok(messages, 'the conversation store is not named');
  assert.match(messages.where, /\/api\/projects\/.*\/export/);
});

// ----------------------------------------------------------------- the deletion ---

const kvKeys = (prefix) => [...KV_ROWS.keys()].filter((k) => k.startsWith(prefix));

test('deleting an account takes a typed confirmation, and refuses without one', async () => {
  reset();
  const res = await app.request('https://x/api/me/delete', post(ALICE, {}), env());
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.match(body.error ?? '', /confirm/i);
  // And nothing moved: a refusal that half-deleted would be the worst of both answers.
  assert.equal(countRows(DB.raw, `select count(*) from api_keys where user_id = ?`, ALICE), 1);
  assert.equal(countRows(DB.raw, `select count(*) from memory_entries where scope_id = ?`, ALICE), 1);
  assert.equal(kvKeys(`ws:${PROJECT}:`).length, 3);
  assert.deepEqual(PURGED, []);
});

test('a wrong confirmation phrase is refused too', async () => {
  reset();
  const res = await app.request('https://x/api/me/delete', post(ALICE, { confirm: 'delete it' }), env());
  assert.equal(res.status, 400);
  assert.equal(countRows(DB.raw, `select count(*) from api_keys where user_id = ?`, ALICE), 1);
});

test('the account deletion erases every store the worker can reach', async () => {
  reset();
  const res = await app.request('https://x/api/me/delete', post(ALICE, { confirm: 'DELETE MY ACCOUNT' }), env());
  assert.equal(res.status, 200);
  const receipt = await res.json();

  // D1: gone for Alice, untouched for Bob.
  assert.equal(countRows(DB.raw, `select count(*) from api_keys where user_id = ?`, ALICE), 0);
  assert.equal(countRows(DB.raw, `select count(*) from api_keys where user_id = ?`, BOB), 1);
  assert.equal(countRows(DB.raw, `select count(*) from memory_entries where scope = 'user' and scope_id = ?`, ALICE), 0);
  assert.equal(countRows(DB.raw, `select count(*) from memory_entries where scope = 'project' and scope_id = ?`, PROJECT), 0);
  assert.equal(countRows(DB.raw, `select count(*) from memory_entries where scope = 'project' and scope_id = ?`, BOBS_PROJECT), 1);
  assert.equal(countRows(DB.raw, `select count(*) from memory_audit where scope_id in (?, ?)`, ALICE, PROJECT), 0);
  assert.equal(countRows(DB.raw, `select count(*) from memory_org_members where user_id = ?`, ALICE), 0);
  assert.equal(countRows(DB.raw, `select count(*) from notifications where recipient_id = ?`, ALICE), 0);
  assert.equal(countRows(DB.raw, `select count(*) from notifications where recipient_id = ?`, BOB), 1);
  assert.equal(countRows(DB.raw, `select count(*) from automations where owner_id = ?`, ALICE), 0);
  assert.equal(countRows(DB.raw, `select count(*) from automation_runs where owner_id = ?`, ALICE), 0);
  assert.equal(countRows(DB.raw, `select count(*) from user_credentials where user_id = ?`, ALICE), 0);
  assert.equal(countRows(DB.raw, `select count(*) from creator_write_log where user_id = ?`, ALICE), 0);
  assert.equal(countRows(DB.raw, `select count(*) from project_asset_use where project_id = ?`, PROJECT), 0);

  // KV: every prefix of every owned project, paging past the first page.
  for (const p of ['ws', 'wsv', 'wst']) {
    assert.deepEqual(kvKeys(`${p}:${PROJECT}:`), [], `${p}: files survived the deletion`);
    assert.equal(kvKeys(`${p}:${BOBS_PROJECT}:`).length, 1, `${p}: somebody else's files were deleted`);
  }
  assert.deepEqual(kvKeys(`image:${PROJECT}:`), []);
  assert.deepEqual(kvKeys(`audio:${PROJECT}:`), []);
  assert.equal(kvKeys(`image:${BOBS_PROJECT}:`).length, 1);
  assert.deepEqual(kvKeys(`share:grant:${PROJECT}:`), []);
  // The link is keyed by its own secret, and the by-project index is how it is found at all. Both.
  assert.deepEqual(kvKeys(`share:link:by-project:${PROJECT}:`), []);
  assert.equal(KV_ROWS.has(`share:link:${SECRET_TOKEN}`), false, 'a share link outlived the project it opened');
  assert.equal(KV_ROWS.has('config:models'), true, 'service configuration is not one person’s data');

  // The conversation Durable Object was purged, for the owned project and not for anyone else's.
  assert.deepEqual(PURGED, [PROJECT]);

  // The receipt counts what it did, per store.
  assert.ok(receipt.steps.length >= 12, `only ${receipt.steps.length} stores were touched`);
  const failed = receipt.steps.filter((s) => s.status === 'failed');
  assert.deepEqual(failed, [], `some stores failed: ${JSON.stringify(failed)}`);
  const erased = receipt.steps.filter((s) => s.status === 'erased').reduce((n, s) => n + (s.rows ?? 0), 0);
  assert.ok(erased > 0, 'a deletion that reports erasing nothing has not been shown to erase anything');
});

test('the receipt says what is left, and does not claim the account is gone when it is not', async () => {
  reset();
  const receipt = await (await app.request('https://x/api/me/delete', post(ALICE, { confirm: 'DELETE MY ACCOUNT' }), env())).json();
  assert.equal(receipt.accountRemoved, false);
  assert.ok(Array.isArray(receipt.residue) && receipt.residue.length >= 3, 'what survives a deletion must be named');
  for (const r of receipt.residue) assert.ok(r.target && r.why.length > 25, `${r.target}: a residue needs a reason`);
  // The sign-in identity is the one that matters most to be honest about.
  assert.ok(receipt.residue.some((r) => /auth\.users|sign-in/i.test(`${r.target} ${r.why}`)), 'the login identity is not mentioned');
  assert.ok(receipt.summary.length > 40, 'the receipt must be readable by the person who asked');
});

test('the deletion is recorded, and the status route reads it back', async () => {
  reset();
  const before = await (await app.request('https://x/api/me/delete', as(ALICE), env())).json();
  assert.equal(before.requested, false);

  await app.request('https://x/api/me/delete', post(ALICE, { confirm: 'DELETE MY ACCOUNT' }), env());

  const after = await (await app.request('https://x/api/me/delete', as(ALICE), env())).json();
  assert.equal(after.requested, true);
  assert.ok(after.requestedAt, 'a recorded deletion must say when');
  assert.equal(after.accountRemoved, false);
  assert.ok(after.residue.length >= 3);
  // Somebody else's status is their own.
  const bobs = await (await app.request('https://x/api/me/delete', as(BOB), env())).json();
  assert.equal(bobs.requested, false);
});

test('one person cannot delete another', async () => {
  reset();
  await app.request('https://x/api/me/delete', post(BOB, { confirm: 'DELETE MY ACCOUNT' }), env());
  // Bob's deletion took Bob's rows and none of Alice's, even though Alice owns the project Bob is on.
  assert.equal(countRows(DB.raw, `select count(*) from api_keys where user_id = ?`, ALICE), 1);
  assert.equal(countRows(DB.raw, `select count(*) from notifications where recipient_id = ?`, ALICE), 1);
  assert.equal(kvKeys(`ws:${PROJECT}:`).length, 3);
  assert.deepEqual(PURGED, [BOBS_PROJECT]);
});

// --------------------------------------------------- deleting one project, not all ---

test('deleting a project fans out past the Durable Object it used to stop at', async () => {
  reset();
  const res = await app.request(`https://x/api/projects/${PROJECT}/purge`, post(ALICE), env());
  assert.equal(res.status, 200);
  const body = await res.json();

  assert.deepEqual(PURGED, [PROJECT], 'the conversation object must still be purged');
  assert.equal(countRows(DB.raw, `select count(*) from memory_entries where scope = 'project' and scope_id = ?`, PROJECT), 0);
  assert.equal(countRows(DB.raw, `select count(*) from memory_audit where scope_id = ?`, PROJECT), 0);
  assert.equal(countRows(DB.raw, `select count(*) from notifications where project_id = ?`, PROJECT), 0);
  assert.equal(countRows(DB.raw, `select count(*) from automations where project_id = ?`, PROJECT), 0);
  assert.equal(countRows(DB.raw, `select count(*) from automation_runs where project_id = ?`, PROJECT), 0);
  assert.equal(countRows(DB.raw, `select count(*) from project_asset_use where project_id = ?`, PROJECT), 0);
  assert.deepEqual(kvKeys(`ws:${PROJECT}:`), []);
  assert.deepEqual(kvKeys(`image:${PROJECT}:`), []);
  assert.equal(KV_ROWS.has(`share:link:${SECRET_TOKEN}`), false);

  // The user's OWN memory is not the project's memory, and deleting a project must not take it.
  assert.equal(countRows(DB.raw, `select count(*) from memory_entries where scope = 'user' and scope_id = ?`, ALICE), 1);
  // Nor anyone else's project.
  assert.equal(countRows(DB.raw, `select count(*) from memory_entries where scope_id = ?`, BOBS_PROJECT), 1);
  assert.equal(kvKeys(`ws:${BOBS_PROJECT}:`).length, 1);

  assert.ok(body.steps.length >= 6, 'the purge must report what it swept');
});

test('a stranger purging a project deletes nothing at all', async () => {
  reset();
  const res = await app.request(`https://x/api/projects/${PROJECT}/purge`, post(BOB), env());
  assert.equal(res.status, 404);
  assert.deepEqual(PURGED, []);
  assert.equal(countRows(DB.raw, `select count(*) from memory_entries where scope_id = ?`, PROJECT), 1);
  assert.equal(kvKeys(`ws:${PROJECT}:`).length, 3);
});
