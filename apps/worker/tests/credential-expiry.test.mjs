/**
 * WHEN DOES THE CONNECTED ROBLOX KEY DIE? The store had nowhere to put the answer.
 *
 * `user_credentials` carried created_at and last_used_at and no expiry at all, and the connect
 * form never asked — while Roblox SHOWS the expiry date at the moment a key is created, and
 * expires it silently afterwards. So a key with 30 days left was stored and described exactly like
 * a permanent one, and the first symptom of its death was a build failing on an upstream 401.
 *
 * THREE PROPERTIES, AND THE THIRD IS THE ONE THAT BITES IN PRODUCTION:
 *
 *   1. THE DATE IS KEPT AND GIVEN BACK. Write it, read it, and it is on the description the
 *      settings page renders — not in a column nothing selects.
 *
 *   2. A DATE THAT IS NOT A DATE, OR HAS ALREADY PASSED, IS REFUSED AT THE DOOR. Storing an
 *      expired key produces a credential that fails on first use for a reason the row already
 *      knew, and "2026-13-45" reaching a formatter is how "Invalid Date" gets rendered to a
 *      customer.
 *
 *   3. THE COLUMN REACHES A DATABASE THAT ALREADY EXISTS. `create table if not exists` does
 *      nothing to a live table, so a new column added only there is a column production never
 *      gets — and every insert naming it fails. The migration is asserted against a database
 *      built WITHOUT the column, which is what the deployed one is.
 *
 * Run with:  node --test tests/credential-expiry.test.mjs      (from apps/worker)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { d1 } from './stubs/d1.mjs';

const WORKER = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(mkdtempSync(join(tmpdir(), 'credexpiry-')), 'c.mjs');
execFileSync(join(WORKER, 'node_modules', '.bin', 'esbuild'),
  [join(WORKER, 'src', 'user-credentials.ts'), '--bundle', '--format=esm', '--target=es2022', '--outfile=' + out],
  { cwd: WORKER, stdio: 'pipe' });
const C = await import(`file://${out}`);

const KEY32 = Buffer.alloc(32, 7).toString('base64');
const fresh = () => {
  const db = d1();
  return { db, env: { CORPUS: db.CORPUS, CREDENTIAL_KEY: KEY32 } };
};

const GOOD = {
  userId: 'user-1',
  apiKey: 'OpenCloudKeyABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',
  robloxCreatorId: '11279664020',
  creatorType: 'user',
  scopes: ['asset:write'],
};

const inDays = (n) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

test('THE EXPIRY IS STORED AND COMES BACK ON THE DESCRIPTION', async () => {
  const { env } = fresh();
  const res = await C.putRobloxCredential(env, { ...GOOD, expiresAt: inDays(30) });
  assert.equal(res.ok, true, res.error);
  assert.equal(res.credential.expiresAt.slice(0, 10), inDays(30));

  const described = await C.describeRobloxCredential(env, GOOD.userId);
  assert.equal(described.expiresAt.slice(0, 10), inDays(30), 'the settings page reads THIS, not the insert');
});

test('a key with no stated expiry is stored with none — absent is not "expired"', async () => {
  const { env } = fresh();
  const res = await C.putRobloxCredential(env, GOOD);
  assert.equal(res.ok, true, res.error);
  assert.equal(res.credential.expiresAt, null);
  assert.equal((await C.describeRobloxCredential(env, GOOD.userId)).expiresAt, null);
});

test('A DATE THAT HAS ALREADY PASSED IS REFUSED, not stored', async () => {
  const { env, db } = fresh();
  const res = await C.putRobloxCredential(env, { ...GOOD, expiresAt: inDays(-1) });
  assert.equal(res.ok, false);
  assert.match(res.error, /past|expired|already/i, `the reason must name the problem: ${res.error}`);
  // And nothing was written: a refusal that stores the row anyway is the worst of both.
  assert.equal(await C.describeRobloxCredential(env, GOOD.userId), null);
  assert.equal(db.raw.prepare('select count(*) c from user_credentials').get().c, 0);
});

test('and so is a string that is not a date at all', async () => {
  const { env } = fresh();
  for (const bad of ['tomorrow', '2026-13-45']) {
    const res = await C.putRobloxCredential(env, { ...GOOD, expiresAt: bad });
    assert.equal(res.ok, false, `"${bad}" must not be stored`);
    assert.match(res.error, /date/i);
  }
});

test('AN EMPTY FIELD IS AN ABSENT ANSWER, NOT A BAD ONE', () => {
  // Written as a refusal first, and the implementation was right and the test was wrong: a form
  // with the date box left blank submits '' or '   ', and that means "they did not say", which is
  // exactly what null records. Refusing it would make the optional field mandatory by accident.
  const { env } = fresh();
  return Promise.all(['', '   ', null, undefined].map(async (blank) => {
    const res = await C.putRobloxCredential(env, { ...GOOD, expiresAt: blank });
    assert.equal(res.ok, true, `${JSON.stringify(blank)} must be accepted as "not stated"`);
    assert.equal(res.credential.expiresAt, null);
  }));
});

test('replacing a key replaces its expiry, including back to none', async () => {
  // The upsert resets last_used_at deliberately; the expiry belongs to the NEW key for the same
  // reason. Inheriting the old date would describe a fresh key by a dead one's calendar.
  const { env } = fresh();
  await C.putRobloxCredential(env, { ...GOOD, expiresAt: inDays(30) });
  await C.putRobloxCredential(env, { ...GOOD, apiKey: `${GOOD.apiKey}XY` });
  assert.equal((await C.describeRobloxCredential(env, GOOD.userId)).expiresAt, null);
});

test('THE COLUMN IS ADDED TO A DATABASE THAT ALREADY EXISTS', async () => {
  // `create table if not exists` does nothing to a live table. A deployed D1 has the pre-expiry
  // shape, and without a migration every insert naming the new column fails there and only there.
  const { env, db } = fresh();
  db.raw.exec(
    `create table user_credentials (
       user_id text not null, provider text not null, sealed text not null,
       roblox_creator_id text not null, creator_type text not null, scopes text not null,
       fingerprint text not null, hint text not null, created_at text not null, last_used_at text,
       primary key (user_id, provider))`,
  );
  const res = await C.putRobloxCredential(env, { ...GOOD, expiresAt: inDays(10) });
  assert.equal(res.ok, true, `the migration must run against the old shape: ${res.error}`);
  assert.equal((await C.describeRobloxCredential(env, GOOD.userId)).expiresAt.slice(0, 10), inDays(10));
});
