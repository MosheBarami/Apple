/**
 * DELETING AN ACCOUNT NOW DELETES THE SIGN-IN, AND EVERY WAY THAT CAN GO WRONG IS SAID, NOT HIDDEN.
 *
 * Owner decision D-14 (2026-10-05): account deletion removes the Supabase sign-in identity and the Discord link
 * automatically. Until then the receipt said the sign-in survived "until an operator removes it" and the Discord link
 * survived too. This file drives the real route (the whole worker bundled, the real Discord Durable Object, a
 * Supabase Auth that records what it was asked) and holds the behaviour that makes the new receipt honest:
 *
 *   - THE ORDER. Discord is unlinked, every other store is swept, and the Auth DELETE is the LAST call, made only
 *     when nothing before it failed. A deletion that half-ran must leave the sign-in standing, because the sign-in
 *     is how the person gets back in to run it again.
 *   - A FAILURE IS NEVER A SUCCESS. A Discord object that errors, a link that is still there after the unlink, an
 *     Auth that is unreachable, answers 500, answers a bare 404 (a wrong URL, not "no such user"), has no key at all,
 *     or says it deleted a user it can still read: each is a failed step, the receipt is incomplete, the route
 *     answers 207, `accountRemoved` is false, and the summary says the sign-in is still there.
 *   - IT CAN BE RUN AGAIN. After a failure at any step the same request finishes the job; after a finished deletion
 *     the same request finds nothing to sweep, Auth answering "no such user", and reports that as done.
 *   - THE RECEIPT SAYS EXACTLY WHAT HAPPENED. `accountRemoved` is true only when Auth confirmed (or already had no such
 *     user), and what survives is `ACCOUNT_RESIDUE`, which no longer lists the sign-in or the Discord link.
 *   - THE LEDGER SURVIVES. Migration 0015 drops the foreign key that would cascade `usage_events` away with the user,
 *     and the migrations, read in order, leave every table that references a profile with a decided effect.
 *
 * Run with:  node --test tests/account-deletion-identity.test.mjs      (from apps/worker)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as esbuild from 'esbuild';
import { readFileSync, readdirSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';
import { d1, countRows } from './stubs/d1.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const WORKER = join(HERE, '..');
const ROOT = join(WORKER, '..', '..');
const OUT = join(tmpdir(), `studpilot-account-deletion-${process.pid}.mjs`);

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
const mod = await import(pathToFileURL(OUT).href);
const app = mod.default;
const { PROJECTS, ROWS, FAILING } = await import(pathToFileURL(join(HERE, 'stubs', 'supa.mjs')).href);
process.on('exit', () => rmSync(OUT, { force: true }));

const ALICE = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const BOB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const PROJECT = '11111111-1111-4111-8111-111111111111';
const SUPA = 'https://supa.test';
const SECRET = 'sb_secret_test_value';

// ---------------------------------------------------------------------------------------- the world ---

/** What happened, in order: the one record the ORDER test reads. */
let LOG = [];
/** What the Supabase Auth admin API does with a user, and what it answers. */
const AUTH = { users: new Set(), mode: 'ok', calls: [] };
/** What the Discord Durable Object does: 'ok' runs the real object, the others break it in the way named. */
let DISCORD_MODE = 'ok';
let DISCORD = null;
let DB = null;
const realFetch = globalThis.fetch;

function memoryStorage() {
  const map = new Map();
  return {
    map,
    async get(k) { return map.get(k); },
    async put(k, v) { map.set(k, v); },
    async delete(k) { return map.delete(k); },
    async list({ prefix } = {}) { const out = new Map(); for (const [k, v] of map) if (!prefix || k.startsWith(prefix)) out.set(k, v); return out; },
    async setAlarm() {},
    async deleteAlarm() {},
  };
}

function discordWorld() {
  const storage = memoryStorage();
  const object = new mod.DiscordDO({ storage }, {});
  const call = (path, method, body) => object.fetch(new Request(`https://do${path}`, method === 'GET' ? {} : { method, body: JSON.stringify(body ?? {}) }));
  const ns = {
    idFromName: (n) => n,
    get: () => ({
      async fetch(url, init) {
        const path = new URL(url).pathname;
        LOG.push(`discord ${init?.method ?? 'GET'} ${path}`);
        if (DISCORD_MODE === 'throws') throw new Error('the Discord object is unreachable');
        if (DISCORD_MODE === 'http500' && path === '/unlink') return new Response('boom', { status: 500 });
        if (DISCORD_MODE === 'junk' && path === '/unlink') return new Response('not json', { status: 200 });
        if (DISCORD_MODE === 'still-linked' && path === '/unlink') return Response.json({ removed: true, codesRemoved: 0 });
        if (DISCORD_MODE === 'still-linked' && path === '/link-for-owner') return Response.json({ link: { discordUserId: 'd-1' } });
        if (DISCORD_MODE === 'check-fails' && path === '/link-for-owner') return new Response('boom', { status: 500 });
        return object.fetch(new Request(url, init));
      },
    }),
  };
  return { storage, ns, call };
}

function authFetch() {
  globalThis.fetch = async (url, init) => {
    const u = new URL(String(url));
    if (!String(url).startsWith(`${SUPA}/auth/v1/admin`)) throw new Error(`unexpected outbound call to ${u.origin}${u.pathname}`);
    const method = init?.method ?? 'GET';
    const id = decodeURIComponent(u.pathname.split('/').pop());
    AUTH.calls.push({ method, id, headers: init?.headers ?? {} });
    LOG.push(`auth ${method} /users/${id === ALICE ? 'ALICE' : id}`);
    if (AUTH.mode === 'unreachable') throw new Error('network down');
    if (method === 'DELETE') {
      if (AUTH.mode === 'http500') return new Response(JSON.stringify({ msg: 'database error' }), { status: 500 });
      if (AUTH.mode === 'bare404') return new Response('<html>not found</html>', { status: 404 });
      if (!AUTH.users.has(id)) return Response.json({ error_code: 'user_not_found', msg: 'User not found' }, { status: 404 });
      if (AUTH.mode !== 'says-deleted-but-keeps') AUTH.users.delete(id);
      return Response.json({}, { status: 200 });
    }
    // GET: the post-condition read.
    if (AUTH.mode === 'read-unreachable') throw new Error('network down');
    if (!AUTH.users.has(id)) return Response.json({ error_code: 'user_not_found', msg: 'User not found' }, { status: 404 });
    return Response.json({ id, email: 'alice@example.com' }, { status: 200 });
  };
}

function reset(opts = {}) {
  LOG = [];
  AUTH.users = new Set([ALICE, BOB]);
  AUTH.mode = 'ok';
  AUTH.calls = [];
  DISCORD_MODE = 'ok';
  DISCORD = discordWorld();
  authFetch();
  PROJECTS.clear(); ROWS.clear(); FAILING.clear();
  PROJECTS.set(PROJECT, ALICE);
  ROWS.set('profiles', [{ id: ALICE, display_name: 'Alice', training_opt_in: true }]);
  ROWS.set('projects', [{ id: PROJECT, owner_id: ALICE, name: 'Tower Defence' }]);
  if (DB) DB.close();
  DB = d1();
  DB.raw.exec(`create table if not exists memory_entries(scope text not null, scope_id text not null, key text not null, kind text not null, value text not null, source text not null, created_at text not null, updated_at text not null, expires_at text, updated_by text not null, primary key(scope, scope_id, key))`);
  DB.raw.prepare(`insert into memory_entries values (?,?,?,?,?,?,?,?,?,?)`).run('user', ALICE, 'style', 'preference', 'terse', 'user', 'x', 'x', null, ALICE);
  return opts;
}

const env = (extra = {}) => ({
  CORPUS: DB.CORPUS,
  KV: { async get() { return null; }, async put() {}, async delete() {}, async list() { return { keys: [], list_complete: true }; } },
  SESSION_DO: { idFromName: (n) => n, get: (n) => ({ async fetch(url) { LOG.push(`session ${new URL(url).pathname} ${n === PROJECT ? 'PROJECT' : n}`); return new Response('{}', { status: 200 }); } }) },
  QUOTA_DO: { idFromName: (n) => n, get: () => ({ async fetch() { return new Response('{}'); } }) },
  ADMIN_DO: { idFromName: (n) => n, get: () => ({ async fetch() { return new Response('{}'); } }) },
  DISCORD_DO: DISCORD.ns,
  SUPABASE_URL: SUPA,
  SUPABASE_SECRET_KEY: SECRET,
  ...extra,
});

const remove = (user = ALICE, extra = {}) =>
  app.request('https://x/api/me/delete', { method: 'POST', headers: { Authorization: `Bearer ${user}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ confirm: 'DELETE MY ACCOUNT' }) }, env(extra));

const stepOf = (receipt, startsWith) => receipt.steps.find((s) => s.target.startsWith(startsWith));
const AUTH_STEP = 'auth.users';
const DISCORD_STEP = 'DiscordDO';

/** Link ALICE to a Discord account through the real object, and mint a code nobody has redeemed. */
async function linkAlice({ withPendingCode = false } = {}) {
  const minted = await (await DISCORD.call('/mint', 'POST', { appleUserId: ALICE, projectId: PROJECT, projectName: 'Tower Defence' })).json();
  const redeemed = await (await DISCORD.call('/redeem', 'POST', { discordUserId: 'd-1', code: minted.code })).json();
  assert.equal(redeemed.ok, true, 'the fixture could not link a Discord account');
  let pending = null;
  if (withPendingCode) pending = (await (await DISCORD.call('/mint', 'POST', { appleUserId: ALICE, projectId: PROJECT, projectName: 'Tower Defence' })).json()).code;
  return pending;
}

// ------------------------------------------------------------------------------- the whole deletion ---

test('POSITIVE CONTROL: with everything working, the deletion unlinks Discord, sweeps the stores, deletes the Supabase account, and the receipt says so', async () => {
  reset();
  await linkAlice();
  const res = await remove();
  assert.equal(res.status, 200);
  const receipt = await res.json();
  assert.equal(receipt.complete, true, JSON.stringify(receipt.steps.filter((s) => s.status === 'failed')));
  assert.equal(receipt.accountRemoved, true);
  assert.equal(AUTH.users.has(ALICE), false, 'the Supabase account is still there');
  assert.equal(AUTH.users.has(BOB), true, 'somebody else\'s account was deleted');
  assert.equal(countRows(DB.raw, `select count(*) from memory_entries where scope_id = ?`, ALICE), 0);
  const discord = stepOf(receipt, DISCORD_STEP);
  assert.equal(discord.status, 'erased');
  assert.match(discord.detail, /link to your Discord account was removed/);
  assert.equal((await (await DISCORD.call(`/link-for-owner?appleUserId=${ALICE}`, 'GET')).json()).link, null, 'the Discord link survived');
  const auth = stepOf(receipt, AUTH_STEP);
  assert.equal(auth.status, 'erased');
  assert.equal(auth.rows, 1);
  assert.match(auth.detail, /removed from Supabase, and your account row went with it/);
  assert.match(receipt.summary, /sign-in has been removed too, so this account cannot be used again/);
  // The key travels in `apikey`, and the request is for this person's id and nobody else's.
  const del = AUTH.calls.find((c) => c.method === 'DELETE');
  assert.equal(del.id, ALICE);
  assert.equal(new Headers(del.headers).get('apikey'), SECRET);
});

test('THE ORDER: Discord first, the other stores next, and the Auth DELETE is the LAST call (a read after it checks the result)', async () => {
  reset();
  await linkAlice();
  await remove();
  const at = (re) => LOG.findIndex((l) => re.test(l));
  const unlink = at(/^discord POST \/unlink$/);
  const purge = at(/^session \/purge PROJECT$/);
  const authDelete = at(/^auth DELETE/);
  assert.ok(unlink >= 0 && purge >= 0 && authDelete >= 0, `a call is missing: ${LOG.join(' | ')}`);
  assert.ok(purge < authDelete, 'the project object was purged AFTER the account was deleted');
  assert.ok(unlink < authDelete, 'Discord was unlinked AFTER the account was deleted');
  // Nothing at all is asked of Auth before the DELETE, and after it only the read that checks it.
  assert.equal(at(/^auth/), authDelete, 'Auth was called before the delete');
  assert.deepEqual(LOG.slice(authDelete), ['auth DELETE /users/ALICE', 'auth GET /users/ALICE'], 'something else happens after the account is deleted');
  // Unlink first, then the check that nothing is left.
  assert.deepEqual(LOG.filter((l) => l.startsWith('discord')), ['discord POST /unlink', 'discord GET /link-for-owner']);
});

test('the Discord unlink is the one Settings uses: the account id goes to /unlink, and unused link codes are withdrawn with the link', async () => {
  reset();
  const pending = await linkAlice({ withPendingCode: true });
  assert.ok(pending, 'the fixture minted no pending code');
  const receipt = await (await remove()).json();
  const discord = stepOf(receipt, DISCORD_STEP);
  assert.equal(discord.status, 'erased');
  assert.equal(discord.rows, 2, 'one link and one unused code');
  assert.match(discord.detail, /1 unused link code was withdrawn/);
  // A code minted before the deletion cannot be redeemed after it: the link it would make is for an account that is gone.
  const redeemed = await (await DISCORD.call('/redeem', 'POST', { discordUserId: 'd-2', code: pending })).json();
  assert.equal(redeemed.ok, false, 'a code minted before the deletion still redeems');
  assert.equal([...DISCORD.storage.map.keys()].filter((k) => k.startsWith('link:') || k.startsWith('owner:') || k.startsWith('code:')).length, 0, 'the Discord object still holds something for the deleted account');
});

test('an account with no Discord link is not told about one, and the unlink is still asked and checked', async () => {
  reset();
  const receipt = await (await remove()).json();
  const discord = stepOf(receipt, DISCORD_STEP);
  assert.equal(discord.status, 'erased');
  assert.equal(discord.rows, 0);
  assert.equal(discord.detail, 'No Discord account was linked.');
  assert.equal(receipt.complete, true);
});

// ------------------------------------------------------------------------- a failure is never a success ---

for (const [mode, why] of [
  ['http500', 'the object answers 500'],
  ['throws', 'the object cannot be reached'],
  ['junk', 'the object answers something that is not JSON'],
  ['still-linked', 'the link can still be read after the unlink'],
  ['check-fails', 'the check after the unlink cannot be made'],
]) {
  test(`DISCORD FAILS (${why}): the step is failed, the sign-in is NOT deleted, the receipt is incomplete, and the person can run it again`, async () => {
    reset();
    await linkAlice();
    DISCORD_MODE = mode;
    const res = await remove();
    assert.equal(res.status, 207);
    const receipt = await res.json();
    assert.equal(receipt.complete, false);
    assert.equal(receipt.accountRemoved, false, 'the receipt says the account is removed');
    assert.equal(stepOf(receipt, DISCORD_STEP).status, 'failed');
    assert.match(stepOf(receipt, DISCORD_STEP).detail, /Run the deletion again/);
    assert.equal(AUTH.calls.some((c) => c.method === 'DELETE'), false, 'the account was deleted although Discord failed: the person could not sign in to try again');
    assert.equal(AUTH.users.has(ALICE), true);
    const auth = stepOf(receipt, AUTH_STEP);
    assert.equal(auth.status, 'failed');
    assert.match(auth.detail, /Not removed yet, on purpose/);
    assert.match(receipt.summary, /Your sign-in is still there so that you can run the deletion again/);
    // And the other stores WERE swept: one failing step does not cancel the rest.
    assert.equal(countRows(DB.raw, `select count(*) from memory_entries where scope_id = ?`, ALICE), 0);

    // THE RE-RUN, with Discord working again, finishes the job.
    DISCORD_MODE = 'ok';
    const again = await remove();
    assert.equal(again.status, 200);
    const done = await again.json();
    assert.equal(done.complete, true);
    assert.equal(done.accountRemoved, true);
    assert.equal(AUTH.users.has(ALICE), false);
  });
}

for (const [mode, expect, why] of [
  ['http500', /Supabase answered 500/, 'Auth answers 500'],
  ['unreachable', /Supabase could not be reached/, 'Auth cannot be reached'],
  ['bare404', /Supabase answered 404/, 'Auth answers a bare 404 (a wrong URL or a proxy page is not "no such user")'],
  ['says-deleted-but-keeps', /can still be read/, 'Auth says it deleted the user and the user can still be read'],
]) {
  test(`AUTH FAILS (${why}): the step is failed, accountRemoved is false, the status is 207, and a re-run deletes the account`, async () => {
    reset();
    await linkAlice();
    AUTH.mode = mode;
    const res = await remove();
    assert.equal(res.status, 207);
    const receipt = await res.json();
    assert.equal(receipt.complete, false);
    assert.equal(receipt.accountRemoved, false);
    const auth = stepOf(receipt, AUTH_STEP);
    assert.equal(auth.status, 'failed');
    assert.match(auth.detail, expect);
    assert.match(receipt.summary, /Your sign-in is still there so that you can run the deletion again/);
    // The failure came AFTER the Discord link and the stores went, and those are reported as gone.
    assert.equal(stepOf(receipt, DISCORD_STEP).status, 'erased');
    assert.equal(countRows(DB.raw, `select count(*) from memory_entries where scope_id = ?`, ALICE), 0);
    // The recorded deletion says the account is NOT removed, so the status route cannot say otherwise.
    const status = await (await app.request('https://x/api/me/delete', { headers: { Authorization: `Bearer ${ALICE}` } }, env())).json();
    assert.equal(status.requested, true);
    assert.equal(status.accountRemoved, false);

    // RE-RUN once Auth answers: complete, and removed.
    AUTH.mode = 'ok';
    const again = await remove();
    assert.equal(again.status, 200);
    const done = await again.json();
    assert.equal(done.complete, true);
    assert.equal(done.accountRemoved, true);
    assert.equal(AUTH.users.has(ALICE), false);
    const after = await (await app.request('https://x/api/me/delete', { headers: { Authorization: `Bearer ${ALICE}` } }, env())).json();
    assert.equal(after.accountRemoved, true, 'the record of the deletion was not updated by the run that finished it');
  });
}

test('NO SECRET KEY on the deployment: the sign-in cannot be removed, the receipt says so in plain words, and nothing is claimed', async () => {
  reset();
  const res = await remove(ALICE, { SUPABASE_SECRET_KEY: undefined });
  assert.equal(res.status, 207);
  const receipt = await res.json();
  assert.equal(receipt.accountRemoved, false);
  assert.match(stepOf(receipt, AUTH_STEP).detail, /holds no Supabase secret key on this deployment/);
  assert.equal(AUTH.calls.length, 0, 'Auth was called without a key');
  const noUrl = await (await remove(ALICE, { SUPABASE_URL: undefined })).json();
  assert.equal(noUrl.accountRemoved, false);
});

test('A DELETE THAT SUCCEEDED but whose follow-up read cannot be made is reported as deleted, with the detail saying the read was not made', async () => {
  reset();
  AUTH.mode = 'read-unreachable';
  const receipt = await (await remove()).json();
  assert.equal(receipt.accountRemoved, true);
  assert.equal(stepOf(receipt, AUTH_STEP).status, 'erased');
  assert.match(stepOf(receipt, AUTH_STEP).detail, /follow-up read could not be made/);
  assert.equal(AUTH.users.has(ALICE), false);
});

// ------------------------------------------------------------------------------------------ run again ---

test('RUN AGAIN AFTER A FINISHED DELETION: nothing to sweep, Auth says no such user, and that is reported as done, not as a failure', async () => {
  reset();
  assert.equal((await (await remove()).json()).accountRemoved, true);
  LOG = [];
  const res = await remove();
  assert.equal(res.status, 200);
  const receipt = await res.json();
  assert.equal(receipt.complete, true);
  assert.equal(receipt.accountRemoved, true);
  const auth = stepOf(receipt, AUTH_STEP);
  assert.equal(auth.status, 'erased');
  assert.equal(auth.rows, 0);
  assert.equal(auth.detail, 'Your sign-in identity was already removed.');
  assert.match(receipt.summary, /sign-in had already been removed/);
  // Only the DELETE was asked of Auth (no follow-up read: there was nothing to confirm).
  assert.deepEqual(LOG.filter((l) => l.startsWith('auth')), ['auth DELETE /users/ALICE']);
});

test('one person cannot delete another person\'s account: the Auth call is for the verified id only', async () => {
  reset();
  await remove(BOB);
  assert.deepEqual([...new Set(AUTH.calls.map((c) => c.id))], [BOB]);
  assert.equal(AUTH.users.has(ALICE), true);
});

test('a refused or unconfirmed request deletes no account and asks Auth nothing', async () => {
  reset();
  const res = await app.request('https://x/api/me/delete', { method: 'POST', headers: { Authorization: `Bearer ${ALICE}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ confirm: 'nope' }) }, env());
  assert.equal(res.status, 400);
  assert.equal(AUTH.calls.length, 0);
  // A project list that cannot be read stops the deletion before any step, Auth included.
  FAILING.set('projects', 500);
  const blocked = await remove();
  assert.equal(blocked.status, 503);
  assert.equal(AUTH.calls.length, 0);
});

// ------------------------------------------------------------------------------------- what is left ---

test('the residue no longer lists the sign-in, the account row or the Discord link, and does list what the deletion keeps', async () => {
  const { ACCOUNT_RESIDUE } = await esbuildModule('erasure.ts');
  const targets = ACCOUNT_RESIDUE.map((r) => r.target);
  for (const gone of [/auth\.users/, /public\.profiles/, /DiscordDO/]) {
    assert.equal(targets.some((t) => gone.test(t)), false, `${gone} is deleted by this route and must not be listed as surviving it`);
  }
  for (const kept of [/usage_events/, /feedback/, /waitlist/, /QuotaDO/, /AI Gateway/, /AdminDO/, /account_deletions/, /SessionDO of projects other people own/, /share-link access/, /membership_events/]) {
    assert.ok(targets.some((t) => kept.test(t)), `${kept} is kept by this route and is no longer listed`);
  }
  for (const r of ACCOUNT_RESIDUE) assert.ok(r.why.length > 40, `${r.target}: a residue needs its reason`);
});

async function esbuildModule(rel) {
  const out = join(tmpdir(), `studpilot-deletion-${rel.replace(/\W/g, '_')}-${process.pid}.mjs`);
  await esbuild.build({ entryPoints: [join(WORKER, 'src', rel)], bundle: true, format: 'esm', platform: 'neutral', mainFields: ['main', 'module'], outfile: out, logLevel: 'silent' });
  process.on('exit', () => rmSync(out, { force: true }));
  return import(pathToFileURL(out).href);
}

// ----------------------------------------------------------------------- the schema decision, held ---

/**
 * What deleting an auth user does to every table that stores a person's id, as the migrations leave it. READ FROM THE LIVE SCHEMA on
 * 2026-10-05 (pg_constraint: every foreign key in `public`, SELECT only): it matched the migrations exactly. Every foreign key that
 * reaches a profile has to be in this table, with the decision, so a new table that stores a person's id cannot ship without
 * somebody deciding whether deleting the person cascades it, nulls it, or has to keep it.
 */
const DECIDED = {
  'profiles.id': 'cascade (the account row)',
  'projects.owner_id': 'cascade (their projects, and everything under them)',
  'messages.owner_id': 'cascade',
  'checkpoints.owner_id': 'cascade',
  'studio_pairings.owner_id': 'cascade',
  'project_members.user_id': 'cascade (their memberships on other projects)',
  'project_members.invited_by': 'set null',
  'project_members.suspended_by': 'set null',
  'membership_events.subject_id': 'cascade',
  'membership_events.actor_id': 'set null (the event stays, the person is cleared)',
  'membership_access_state.user_id': 'cascade',
  'feedback.owner_id': 'set null (support messages stay, detached)',
  'waitlist.owner_id': 'set null (the address stays: listed in the residue)',
  'usage_events.owner_id': 'KEPT: migration 0015 drops the foreign key, the ledger stays keyed by the id',
};

/** The foreign keys that reach `profiles` or `auth.users`, as the migrations in order leave them. */
function foreignKeysAfterMigrations() {
  const dir = join(ROOT, 'infra', 'supabase', 'migrations');
  const sql = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort().map((f) => readFileSync(join(dir, f), 'utf8').replace(/--.*$/gm, ' ')).join('\n');
  const fks = new Map(); // `${table}.${column}` -> { name, action }
  // Inline `column type ... references public.profiles(id) on delete <action>` inside a create table, and the `add column` form.
  for (const m of sql.matchAll(/create table (?:if not exists )?(?:public\.)?(\w+)\s*\(([\s\S]*?)\n\);/g)) {
    for (const col of m[2].matchAll(/^\s*(\w+)\s+[^,\n]*?references\s+(?:public\.profiles|auth\.users)\s*\(id\)(?:\s+on delete (cascade|set null))?/gm)) {
      fks.set(`${m[1]}.${col[1]}`, { name: `${m[1]}_${col[1]}_fkey`, action: col[2] ?? 'no action' });
    }
  }
  // `alter table t add column a ..., add column b ... references public.profiles(id) ...;` — one clause at a time.
  for (const alter of sql.matchAll(/alter table (?:public\.)?(\w+)\s+(add column [^;]*);/g)) {
    for (const clause of alter[2].split(/\badd column\b/).slice(1)) {
      const col = /^\s*(?:if not exists\s+)?(\w+)\s+[^,]*?references\s+public\.profiles\s*\(id\)(?:\s+on delete (cascade|set null))?/.exec(clause);
      if (col) fks.set(`${alter[1]}.${col[1]}`, { name: `${alter[1]}_${col[1]}_fkey`, action: col[2] ?? 'no action' });
    }
  }
  for (const m of sql.matchAll(/alter table (?:public\.)?(\w+)\s+drop constraint (?:if exists )?(\w+)/g)) {
    for (const [key, fk] of fks) if (key.startsWith(`${m[1]}.`) && fk.name === m[2]) fks.delete(key);
  }
  return fks;
}

test('SCHEMA: every foreign key that reaches a profile has a decided effect, and none is NO ACTION or RESTRICT (nothing can block the deletion)', () => {
  const fks = foreignKeysAfterMigrations();
  assert.ok(fks.size >= 12, `only ${fks.size} foreign keys were read out of the migrations: this test would check nothing`);
  const undecided = [...fks.keys()].filter((k) => !(k in DECIDED) && k !== 'usage_events.owner_id');
  assert.deepEqual(undecided, [], `a table now stores a person's id with no decision about what deleting the person does to it: ${undecided.join(', ')}`);
  for (const [key, fk] of fks) assert.notEqual(fk.action, 'no action', `${key} would BLOCK the deletion of an account`);
  const gone = Object.keys(DECIDED).filter((k) => !fks.has(k) && k !== 'usage_events.owner_id');
  assert.deepEqual(gone, [], `${gone.join(', ')} is decided here but no longer in the migrations`);
  const cascades = [...fks].filter(([, fk]) => fk.action === 'cascade').map(([k]) => k);
  assert.ok(cascades.includes('profiles.id'), 'the account row no longer cascades from auth.users: the pages say it goes with the sign-in');
});

test('SCHEMA: the usage ledger is NOT cascaded away with the user (migration 0015), and no other migration puts the key back', () => {
  const fks = foreignKeysAfterMigrations();
  assert.equal(fks.has('usage_events.owner_id'), false, 'usage_events.owner_id still has a foreign key to a profile: deleting the account would delete the ledger');
  const dir = join(ROOT, 'infra', 'supabase', 'migrations');
  const file = readdirSync(dir).find((f) => /^0015_/.test(f));
  assert.ok(file, 'migration 0015 is missing');
  const sql = readFileSync(join(dir, file), 'utf8').replace(/--.*$/gm, ' ');
  assert.match(sql, /alter table public\.usage_events drop constraint if exists usage_events_owner_id_fkey/);
  // It changes nothing else of the ledger: no column dropped, no data touched, no policy changed.
  assert.doesNotMatch(sql, /\b(drop (table|column|policy|index)|delete from|truncate|update public\.)/i);
  assert.doesNotMatch(sql, /alter column owner_id (drop not null|type)/i);
});
