/**
 * ANALYTICS THAT CAN BE TURNED OFF — and a consent check that fails in the safe direction.
 *
 * The worker records an analytics event on EVERY /api/* request, and every one of them carried the
 * raw account id of whoever made it. There was no control anywhere: not in the settings page, not
 * in the preferences vocabulary, not in the middleware. Thirty days of "who did what, and when",
 * per person, with no way to say no.
 *
 * The obvious implementation is a preference read on the hot path, and it is not affordable: one
 * extra D1 round trip on every API call to answer a question whose answer changes about once in a
 * person's lifetime. So the answer is cached per isolate, and the interesting behaviour is what
 * happens BEFORE the answer is known.
 *
 * UNKNOWN IS TREATED AS OPTED OUT. A cache miss withholds the actor id and refreshes in the
 * background, so the cost of not knowing is one unattributed event per person per isolate rather
 * than one logged identity that nobody consented to. That is the direction a consent check has to
 * fail, and it is the property most of this file is about — including a test that the cache is
 * really a cache, because "it fails safe" is worthless if it fails safe on every request while
 * claiming to be cheap.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as esbuild from 'esbuild';
import { rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';
import { d1 } from './stubs/d1.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const WORKER = join(HERE, '..');
const OUT = join(tmpdir(), `golem-consent-${process.pid}.mjs`);

await esbuild.build({
  entryPoints: [join(WORKER, 'src', 'analytics-consent.ts')],
  bundle: true, format: 'esm', target: 'es2022', outfile: OUT,
});
const C = await import(pathToFileURL(OUT).href);
process.on('exit', () => rmSync(OUT, { force: true }));

const ALICE = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const BOB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

let reads = 0;
function db(rows = []) {
  const base = d1();
  base.raw.exec(`create table if not exists memory_entries(scope text not null, scope_id text not null, key text not null, kind text not null, value text not null, source text not null, created_at text not null, updated_at text not null, expires_at text, updated_by text not null, primary key(scope, scope_id, key))`);
  for (const [user, value] of rows) {
    base.raw.prepare(`insert into memory_entries values (?,?,?,?,?,?,?,?,?,?)`)
      .run('user', user, 'pref.analytics_opt_out', 'preference', value, 'user', 'x', 'x', null, user);
  }
  reads = 0;
  const CORPUS = {
    ...base.CORPUS,
    prepare(sql) {
      reads += 1;
      return base.CORPUS.prepare(sql);
    },
  };
  return { CORPUS, raw: base.raw, close: base.close };
}

const PREFS_OUT = join(tmpdir(), `golem-consent-prefs-${process.pid}.mjs`);
await esbuild.build({
  entryPoints: [join(WORKER, 'src', 'preferences.ts')],
  bundle: true, format: 'esm', target: 'es2022', outfile: PREFS_OUT,
});
const P = await import(pathToFileURL(PREFS_OUT).href);
process.on('exit', () => rmSync(PREFS_OUT, { force: true }));

// ------------------------------------------------------- it can actually be set ---

test('the opt-out is a preference, so it is set through the control that already exists', () => {
  assert.ok(P.PREFERENCE_KEYS.includes('analytics_opt_out'), 'there is no way to set it at all');
  assert.equal(P.normalisePreferences({ analytics_opt_out: true }).prefs.analytics_opt_out, true);
  assert.equal(P.normalisePreferences({ analytics_opt_out: false }).prefs.analytics_opt_out, false);
  const bad = P.normalisePreferences({ analytics_opt_out: 'yes' });
  assert.deepEqual(bad.rejected, [{ key: 'analytics_opt_out', reason: 'bad_value' }]);
  assert.equal('analytics_opt_out' in bad.prefs, false);
});

test('the reader and the writer agree on one key, or the setting is a control that does nothing', () => {
  const rows = P.preferencesToEntries({ analytics_opt_out: true }, 'user', 'u1');
  const row = rows.find((r) => r.key === C.ANALYTICS_CONSENT_ENTRY_KEY);
  assert.ok(row, `the writer stores ${rows.map((r) => r.key).join(', ')}, the reader looks for ${C.ANALYTICS_CONSENT_ENTRY_KEY}`);
  assert.equal(row.value, 'true');
  assert.equal(row.kind, 'preference');
});

test('opting out at any layer opts out — it narrows, like the other rules and unlike taste', () => {
  // An organisation that switched analytics off has made a decision about what may be recorded
  // about its people, and a rule a lower layer can switch back on is not a rule.
  const merged = P.mergePreferences({ org: { analytics_opt_out: true }, user: { analytics_opt_out: false } });
  assert.equal(merged.prefs.analytics_opt_out, true);
  assert.equal(merged.sources.analytics_opt_out, 'org');
  // The other direction works too: a person may opt out even where nobody above them did.
  const own = P.mergePreferences({ org: { analytics_opt_out: false }, user: { analytics_opt_out: true } });
  assert.equal(own.prefs.analytics_opt_out, true);
  assert.equal(own.sources.analytics_opt_out, 'user');
  // And the control for both: nobody opting out stays not opted out.
  assert.equal(P.mergePreferences({ org: { analytics_opt_out: false }, user: {} }).prefs.analytics_opt_out, false);
});

test('with nothing known yet, the actor id is withheld', () => {
  C.forgetAnalyticsConsent();
  assert.equal(C.analyticsActorId(ALICE, 1000), null);
  // And an anonymous request is null for the ordinary reason, not this one.
  assert.equal(C.analyticsActorId(null, 1000), null);
});

test('once the answer is known and it is yes, the event carries the actor', async () => {
  C.forgetAnalyticsConsent();
  const env = db();
  await C.refreshAnalyticsConsent(env, ALICE, 1000);
  assert.equal(C.analyticsActorId(ALICE, 1000), ALICE);
  env.close();
});

test('once the answer is known and it is no, the actor is withheld for good', async () => {
  C.forgetAnalyticsConsent();
  const env = db([[ALICE, 'true']]);
  await C.refreshAnalyticsConsent(env, ALICE, 1000);
  assert.equal(C.analyticsActorId(ALICE, 1000), null);
  // One person's choice is one person's: Bob is unaffected, and unknown until asked.
  assert.equal(C.analyticsActorId(BOB, 1000), null);
  await C.refreshAnalyticsConsent(env, BOB, 1000);
  assert.equal(C.analyticsActorId(BOB, 1000), BOB);
  env.close();
});

test('a stored value that is not a boolean does not silently mean consent', async () => {
  C.forgetAnalyticsConsent();
  const env = db([[ALICE, '"yes please"']]);
  await C.refreshAnalyticsConsent(env, ALICE, 1000);
  // Not opted out — the row is unreadable, and unreadable is not a withdrawal — but the value it
  // holds must not be coerced into `true` either. The stated rule is: only `true` opts out.
  assert.equal(C.analyticsActorId(ALICE, 1000), ALICE);
  env.close();
});

test('a store that cannot be read leaves the answer unknown rather than assuming consent', async () => {
  C.forgetAnalyticsConsent();
  const broken = { CORPUS: { prepare() { throw new Error('no such table: memory_entries'); } } };
  await C.refreshAnalyticsConsent(broken, ALICE, 1000);
  assert.equal(C.analyticsActorId(ALICE, 1000), null, 'a failed lookup must not become consent');
  // And it stays stale, so the next request tries again rather than caching the failure.
  assert.equal(C.consentIsStale(ALICE, 1000), true);
});

test('it is actually a cache — one read per person per window, not one per request', async () => {
  C.forgetAnalyticsConsent();
  const env = db();
  await C.refreshAnalyticsConsent(env, ALICE, 1000);
  const after = reads;
  assert.equal(after, 1, `the first lookup made ${after} reads`);
  for (let i = 0; i < 50; i += 1) {
    assert.equal(C.consentIsStale(ALICE, 1000 + i), false);
    assert.equal(C.analyticsActorId(ALICE, 1000 + i), ALICE);
  }
  assert.equal(reads, after, 'the cached answer went back to the database');
  env.close();
});

test('the answer goes stale, so opting out cannot be outlived by a warm isolate', async () => {
  C.forgetAnalyticsConsent();
  const env = db();
  await C.refreshAnalyticsConsent(env, ALICE, 1000);
  assert.equal(C.consentIsStale(ALICE, 1000 + C.CONSENT_CACHE_TTL_MS - 1), false);
  assert.equal(C.consentIsStale(ALICE, 1000 + C.CONSENT_CACHE_TTL_MS + 1), true);
  // A stale answer is not a WRONG answer while it lasts, but it must not last: the window is short
  // enough to state in the settings copy, and it is stated there.
  assert.ok(C.CONSENT_CACHE_TTL_MS <= 120_000, 'a consent cache measured in minutes is not a control');
  env.close();
});

test('withdrawing consent takes effect in this isolate at once, without waiting for the window', async () => {
  C.forgetAnalyticsConsent();
  const env = db();
  await C.refreshAnalyticsConsent(env, ALICE, 1000);
  assert.equal(C.analyticsActorId(ALICE, 1000), ALICE);
  // What the preferences route calls after a write lands.
  C.forgetAnalyticsConsent(ALICE);
  assert.equal(C.analyticsActorId(ALICE, 1000), null);
  assert.equal(C.consentIsStale(ALICE, 1000), true);
  env.close();
});

test('the cache is bounded, and eviction is by age rather than by wiping it', async () => {
  C.forgetAnalyticsConsent();
  const env = db();
  for (let i = 0; i < C.CONSENT_CACHE_MAX + 50; i += 1) {
    await C.refreshAnalyticsConsent(env, `user-${i}`, 1000 + i);
  }
  assert.ok(C.consentCacheSize() <= C.CONSENT_CACHE_MAX, `the cache grew to ${C.consentCacheSize()}`);
  // The newest entry survived the sweep — a cache that clears wholesale under pressure would drop
  // exactly the people currently making requests. (See the ipHits note in index.ts for the time
  // this pattern was a security defect rather than a performance one.)
  const newest = `user-${C.CONSENT_CACHE_MAX + 49}`;
  assert.equal(C.consentIsStale(newest, 1000 + C.CONSENT_CACHE_MAX + 49), false);
  env.close();
});
