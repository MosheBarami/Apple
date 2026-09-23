// Storing a customer's own Roblox key, so Apple acts on THEIR account and not on one person's.
//
// WHY THIS MODULE EXISTS AT ALL is worth keeping in the test file and not only in the source:
// Apple uploaded 299 assets into the owner's personal Roblox account because the only write
// credential it had was a single shared one belonging to a real person. Roblox then refused to
// take them back — an Image is "not an archivable asset type" — so that account keeps them for
// good. A shared write credential means every customer's work lands in one identity.
//
// THE ASSERTIONS ARE ABOUT WHAT MUST NEVER COME BACK OUT. A credential store is easy to write and
// easy to get subtly wrong, and every way it goes wrong looks fine from outside: the key
// round-trips, the settings page renders, nothing errors. So the cases below spend most of their
// effort on the negative space — what is NOT in the row, what is NOT in the description, and what
// happens when the wrapping key is missing rather than present.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const WORKER = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(mkdtempSync(join(tmpdir(), 'usercred-')), 'c.mjs');
execFileSync(join(WORKER, 'node_modules', '.bin', 'esbuild'),
  [join(WORKER, 'src', 'user-credentials.ts'), '--bundle', '--format=esm', '--target=es2022', '--outfile=' + out],
  { cwd: WORKER, stdio: 'pipe' });
const C = await import(`file://${out}`);

/* ------------------------------------------------------------------------ a fake D1 --- */

/**
 * Enough of D1 to exercise the real SQL paths, and no more.
 *
 * It keeps every row it was given, which is what lets the cases below assert on what was WRITTEN
 * rather than only on what was read back — the difference between "the key round-trips" and "the
 * key is not sitting in a database column in cleartext".
 */
function fakeD1() {
  const rows = new Map();
  const key = (u) => `${u} roblox`;
  return {
    rows,
    prepare(sql) {
      return {
        bind(...args) {
          return {
            async run() {
              if (/^insert into user_credentials/i.test(sql)) {
                const [userId, sealed, creatorId, creatorType, scopes, fingerprint, hint, createdAt] = args;
                const existing = rows.get(key(userId));
                // THE UPSERT'S OWN CLAUSE DECIDES, not this stub. Hardcoding `last_used_at: null`
                // here made "replacing a key resets the use record" pass against a version of the
                // real SQL that inherits it — the assertion was about the fake. Measured: with the
                // hardcode, that mutant was the one break of six this file did not catch.
                const resets = /last_used_at\s*=\s*null/i.test(sql);
                rows.set(key(userId), {
                  user_id: userId, sealed, roblox_creator_id: creatorId, creator_type: creatorType,
                  scopes, fingerprint, hint, created_at: createdAt,
                  last_used_at: resets ? null : (existing?.last_used_at ?? null),
                });
                return { meta: { changes: 1 } };
              }
              if (/^delete from user_credentials/i.test(sql)) {
                return { meta: { changes: rows.delete(key(args[0])) ? 1 : 0 } };
              }
              if (/^update user_credentials/i.test(sql)) {
                const r = rows.get(key(args[1]));
                if (r) r.last_used_at = args[0];
                return { meta: { changes: r ? 1 : 0 } };
              }
              return { meta: { changes: 0 } };
            },
            async first() {
              return rows.get(key(args[0])) ?? null;
            },
          };
        },
        async run() { return { meta: { changes: 0 } }; },
      };
    },
  };
}

// 32 bytes, base64 — the shape the module demands.
const KEY32 = Buffer.alloc(32, 7).toString('base64');
const makeEnv = () => ({ CORPUS: fakeD1(), CREDENTIAL_KEY: KEY32 });

const GOOD = {
  userId: 'user-1',
  apiKey: 'OpenCloudKeyABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',
  robloxCreatorId: '11279664020',
  creatorType: 'user',
  scopes: ['asset:read', 'asset:write'],
};

/* -------------------------------------------------------------------------- sealing --- */

test('a sealed secret opens again, and is nothing like the plaintext on the way', async () => {
  const env = makeEnv();
  const sealed = await C.sealSecret(env, 'hunter2-but-longer');
  assert.equal(sealed.includes('hunter2'), false, 'the plaintext must not survive into the envelope');
  assert.equal(await C.openSecret(env, sealed), 'hunter2-but-longer');
});

test('THE SAME SECRET SEALS DIFFERENTLY EVERY TIME — a fresh IV, not a convenience', async () => {
  // Reusing an IV under AES-GCM is catastrophic rather than merely weak. It is also what would let
  // the table itself reveal that two customers pasted the same key, which is a fact about them a
  // credential store has no business publishing.
  const env = makeEnv();
  const a = await C.sealSecret(env, GOOD.apiKey);
  const b = await C.sealSecret(env, GOOD.apiKey);
  assert.notEqual(a, b);
  assert.notEqual(a.split('.')[0], b.split('.')[0], 'the IVs must differ');
  assert.equal(await C.openSecret(env, a), GOOD.apiKey);
  assert.equal(await C.openSecret(env, b), GOOD.apiKey);
});

test('NO WRAPPING KEY MEANS NO STORAGE — never a quiet downgrade to cleartext', async () => {
  // The failure this guards has no symptom: the save succeeds, the settings page renders, and the
  // key is sitting in a database column in plaintext.
  const env = { CORPUS: fakeD1() };
  const res = await C.putRobloxCredential(env, GOOD);
  assert.equal(res.ok, false);
  assert.match(res.error, /CREDENTIAL_KEY/);
  assert.match(res.error, /cleartext/, 'and the message must say what the refusal is protecting');
  assert.equal(env.CORPUS.rows.size, 0, 'and nothing may be written');
});

test('a wrapping key of the wrong length is refused rather than padded', async () => {
  const env = { CORPUS: fakeD1(), CREDENTIAL_KEY: Buffer.alloc(16, 1).toString('base64') };
  const res = await C.putRobloxCredential(env, GOOD);
  assert.equal(res.ok, false);
  assert.match(res.error, /32 bytes/);
});

test('a tampered or unreadable envelope reads as null, not as a throw and not as a secret', async () => {
  const env = makeEnv();
  const sealed = await C.sealSecret(env, GOOD.apiKey);
  const [iv, ct] = sealed.split('.');
  for (const bad of ['', 'nodot', `${iv}.`, `.${ct}`, `${iv}.AAAA${ct.slice(4)}`, 'x.y']) {
    assert.equal(await C.openSecret(env, bad), null, JSON.stringify(bad.slice(0, 12)));
  }
});

/* -------------------------------------------------------------------------- storing --- */

test('THE CLEARTEXT KEY NEVER APPEARS IN THE STORED ROW', async () => {
  const env = makeEnv();
  const res = await C.putRobloxCredential(env, GOOD);
  assert.equal(res.ok, true, res.error);
  const row = [...env.CORPUS.rows.values()][0];
  assert.equal(JSON.stringify(row).includes(GOOD.apiKey), false, 'the row must not contain the key');
  assert.equal(row.hint, GOOD.apiKey.slice(-4), 'only the last four, which is what a person recognises');
});

test('and it never appears in what the caller gets back either', async () => {
  const env = makeEnv();
  const res = await C.putRobloxCredential(env, GOOD);
  assert.equal(JSON.stringify(res).includes(GOOD.apiKey), false, 'the response must not echo the key');
  assert.equal(res.credential.fingerprint, await C.sha256hex(GOOD.apiKey));
  assert.equal(res.credential.hint, '6789');
});

test('describe() is what a settings page may render, and it carries no secret', async () => {
  const env = makeEnv();
  await C.putRobloxCredential(env, GOOD);
  const d = await C.describeRobloxCredential(env, 'user-1');
  assert.equal(JSON.stringify(d).includes(GOOD.apiKey), false);
  assert.equal(d.robloxCreatorId, '11279664020');
  assert.equal(d.creatorType, 'user');
  assert.deepEqual(d.scopes, ['asset:read', 'asset:write']);
  assert.equal(d.hint, '6789');
  assert.equal(d.lastUsedAt, null, 'a key just stored has not been used');
});

test('a malformed credential is refused with the reason, and stores nothing', async () => {
  const env = makeEnv();
  const cases = [
    [{ apiKey: '' }, /empty/],
    [{ apiKey: 'short' }, /too short/],
    [{ robloxCreatorId: 'Herobrine583522' }, /must be a number/],
    [{ creatorType: 'organisation' }, /"user" or "group"/],
    [{ scopes: ['asset:write', 'everything'] }, /scopes must be from/],
  ];
  for (const [over, re] of cases) {
    const res = await C.putRobloxCredential(env, { ...GOOD, ...over });
    assert.equal(res.ok, false, JSON.stringify(over));
    assert.match(res.error, re);
  }
  assert.equal(env.CORPUS.rows.size, 0, 'not one bad input may leave a row behind');
});

/* ---------------------------------------------------------------------------- using --- */

test('A STORED KEY IS NOT CONSENT FOR EVERY SCOPE — the lesson, one level down', async () => {
  // "They gave us a key" and "they agreed to this action" are different facts. That distinction is
  // what was missing when a creator id in a config file was enough to start uploading into a real
  // person's account, and it applies again here: a key connected so Apple could READ must not
  // quietly become a key Apple uploads with.
  const env = makeEnv();
  await C.putRobloxCredential(env, { ...GOOD, scopes: ['asset:read'] });
  const read = await C.useRobloxCredential(env, 'user-1', 'asset:read');
  assert.equal(read.ok, true);
  assert.equal(read.apiKey, GOOD.apiKey);

  const write = await C.useRobloxCredential(env, 'user-1', 'asset:write');
  assert.equal(write.ok, false);
  assert.match(write.error, /asset:write/);
  assert.equal(write.apiKey, undefined, 'and no key is handed back on a refusal');
});

test('another user cannot reach it — every query is keyed on the owner', async () => {
  const env = makeEnv();
  await C.putRobloxCredential(env, GOOD);
  const other = await C.useRobloxCredential(env, 'user-2', 'asset:read');
  assert.equal(other.ok, false);
  assert.match(other.error, /no Roblox key is connected/);
  assert.equal(await C.describeRobloxCredential(env, 'user-2'), null);
});

test('AN UNDECRYPTABLE ROW IS NOT "NO CREDENTIAL", and the message says which it is', async () => {
  // Telling somebody there is no key sends them to paste it again; the second paste fails the same
  // way, for the same unstated reason, because the real fault is a rotated wrapping key.
  const env = makeEnv();
  await C.putRobloxCredential(env, GOOD);
  const rotated = { CORPUS: env.CORPUS, CREDENTIAL_KEY: Buffer.alloc(32, 9).toString('base64') };
  const res = await C.useRobloxCredential(rotated, 'user-1', 'asset:read');
  assert.equal(res.ok, false);
  assert.match(res.error, /could not be decrypted/);
  assert.match(res.error, /rotated/, 'and it must point at the real cause');
  assert.equal(/no Roblox key is connected/.test(res.error), false, 'never the misleading one');
});

test('using it records WHEN, so an unexpected use is visible afterwards', async () => {
  const env = makeEnv();
  await C.putRobloxCredential(env, GOOD);
  assert.equal((await C.describeRobloxCredential(env, 'user-1')).lastUsedAt, null);
  await C.useRobloxCredential(env, 'user-1', 'asset:write');
  const after = await C.describeRobloxCredential(env, 'user-1');
  assert.ok(after.lastUsedAt, 'a use must leave a timestamp');
});

test('a refused use leaves no timestamp — only a real handover counts as a use', async () => {
  const env = makeEnv();
  await C.putRobloxCredential(env, { ...GOOD, scopes: ['asset:read'] });
  await C.useRobloxCredential(env, 'user-1', 'asset:write');
  assert.equal((await C.describeRobloxCredential(env, 'user-1')).lastUsedAt, null);
});

test('deleting removes it, and says whether there was anything to remove', async () => {
  const env = makeEnv();
  assert.equal(await C.deleteRobloxCredential(env, 'user-1'), false, 'nothing to delete is not a deletion');
  await C.putRobloxCredential(env, GOOD);
  assert.equal(await C.deleteRobloxCredential(env, 'user-1'), true);
  assert.equal(await C.describeRobloxCredential(env, 'user-1'), null);
  assert.equal((await C.useRobloxCredential(env, 'user-1', 'asset:read')).ok, false);
});

test('replacing a key resets the use record rather than inheriting it', async () => {
  // A last-used date carried over from a revoked key would say the NEW key had been used when it
  // had not — a provenance claim about a credential that did not exist yet.
  const env = makeEnv();
  await C.putRobloxCredential(env, GOOD);
  await C.useRobloxCredential(env, 'user-1', 'asset:write');
  assert.ok((await C.describeRobloxCredential(env, 'user-1')).lastUsedAt);
  await C.putRobloxCredential(env, { ...GOOD, apiKey: `${GOOD.apiKey}-second` });
  const after = await C.describeRobloxCredential(env, 'user-1');
  assert.equal(after.lastUsedAt, null);
  assert.notEqual(after.fingerprint, await C.sha256hex(GOOD.apiKey), 'and the fingerprint follows the new key');
});

/* ------------------------------------------------------------- the BYOK purge --- */

test('THE OPENROUTER KEYS ARE PURGED when the table is readied, and a Roblox key survives it (D-VISION-1)', async () => {
  // Rows as a real table holds them, one per (user, provider). This fake executes only the two
  // statement shapes that can remove a row, so a purge that names the wrong provider — or no purge
  // at all — leaves the OpenRouter rows standing and this goes red.
  const rows = [
    { user_id: 'u1', provider: 'openrouter' },
    { user_id: 'u2', provider: 'openrouter' },
    { user_id: 'u1', provider: 'roblox' },
  ];
  const apply = (sql, args = []) => {
    const m = /^delete from user_credentials where provider = '([a-z]+)'$/i.exec(sql.trim());
    if (m) { for (let i = rows.length - 1; i >= 0; i--) if (rows[i].provider === m[1]) rows.splice(i, 1); return; }
    if (/^delete from user_credentials/i.test(sql)) throw new Error(`unexpected delete: ${sql} ${args}`);
  };
  const CORPUS = {
    prepare(sql) {
      return { async run() { apply(sql); return { meta: {} }; }, bind: (...a) => ({ async run() { apply(sql, a); return { meta: {} }; } }) };
    },
  };
  await C.ensureCredentialTable({ CORPUS });
  assert.deepEqual(rows, [{ user_id: 'u1', provider: 'roblox' }], 'every OpenRouter key is gone and the Roblox key is kept');
});
