/**
 * THE AI GATEWAY LOG IS KEPT 30 DAYS AND THEN DELETED, AND A NIGHT IT COULD NOT BE IS SAID, NOT HIDDEN.
 *
 * Owner decision D-14 (2026-10-05). Measured the same day: the account is on AI Gateway Legacy Logs, which keep logs until they are deleted and have no
 * time-based retention. The privacy pages say model calls and replies in the log are kept 30 days and then deleted, so something has to delete them: the
 * daily cron ("0 3 * * *") calls `pruneGatewayLogs`, which sends Cloudflare's own delete call with a created_at filter, using the optional secret
 * CF_WORKER_OPS_TOKEN (owner item N4). This file drives it with a mocked fetch, alone and through the Worker's real `scheduled` export:
 *
 *   - THE CALL. DELETE to the account's gateway logs, the filter [{"key":"created_at","operator":"lt","value":[<now - 30 days>]}] urlencoded, the token as a
 *     bearer, and nothing else sent: not the prompt, not an account id, not the token anywhere but the header.
 *   - THE CUTOFF. Exactly 30 days before the run, to the millisecond, from the one constant the pages are held to.
 *   - THE ABSENT SECRET. With CF_WORKER_OPS_TOKEN (or the gateway, or the account) missing nothing is sent at all, and the run says it did nothing, naming what
 *     is missing and never a value: in the result, in the admin log as an audit event, and on GET /api/admin/gateway-log-retention.
 *   - A FAILED CALL. A 403, a 200 whose envelope says success:false, a network error and a timeout are each `failed` with the status, an audit event that is
 *     not "allowed", and an error event; none is ever reported as a deletion, the token is in no sentence, and the OTHER sweeps of the same night still run.
 *   - IT RUNS ONCE A DAY, on the daily cron only (never on the minute cron), and a broken step cannot cancel the others.
 *
 * Run with:  node --test tests/gateway-log-retention.test.mjs      (from apps/worker)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as esbuild from 'esbuild';
import { readFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';
import { d1, countRows } from './stubs/d1.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const WORKER = join(HERE, '..');
const OUT = join(tmpdir(), `studpilot-gateway-retention-${process.pid}.mjs`);
const LIB = join(tmpdir(), `studpilot-gateway-retention-lib-${process.pid}.mjs`);

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
await esbuild.build({ entryPoints: [join(WORKER, 'src', 'gateway-log-retention.ts')], bundle: true, format: 'esm', target: 'es2022', outfile: LIB });
const worker = (await import(pathToFileURL(OUT).href)).default;
const G = await import(pathToFileURL(LIB).href);
process.on('exit', () => { rmSync(OUT, { force: true }); rmSync(LIB, { force: true }); });

const NOW = Date.UTC(2026, 9, 5, 3, 0, 0);
const DAY = 86_400_000;
const TOKEN = 'cfut_fixture_ops_token_' + 'x'.repeat(24);
const ACCOUNT = 'e9b8acf2e89a1de289a1ee4abb0f3f8d';
const GATEWAY = 'studpilot';
const FULL = { CF_WORKER_OPS_TOKEN: TOKEN, CF_ACCOUNT_ID: ACCOUNT, AI_GATEWAY_ID: GATEWAY };

/** A fetch that records what it was asked and answers with `answer(request)`. */
function recorder(answer) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url: String(url), method: init?.method, headers: init?.headers ?? {}, body: init?.body });
    return answer(calls.at(-1));
  };
  return { calls, fn };
}
const ok = () => Response.json({ success: true, errors: [], messages: [], result: {} });

// ------------------------------------------------------------------------------------------ the call ---

test('THE CALL: a DELETE to the account\'s gateway logs, filtered to created_at before the cutoff, with the token as a bearer and nothing else sent', async () => {
  const r = recorder(ok);
  const result = await G.pruneGatewayLogs(FULL, NOW, r.fn);
  assert.equal(result.status, 'requested');
  assert.equal(r.calls.length, 1, 'one call, not one per log');
  const [call] = r.calls;
  assert.equal(call.method, 'DELETE');
  const url = new URL(call.url);
  assert.equal(url.origin + url.pathname, `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/ai-gateway/gateways/${GATEWAY}/logs`);
  assert.deepEqual([...url.searchParams.keys()], ['filters'], 'the filter is the only query parameter');
  // The urlencoded form is on the wire, and it decodes to exactly the filter the owner measured on 2026-10-05.
  assert.match(call.url, /\?filters=%5B%7B%22key%22%3A%22created_at%22%2C%22operator%22%3A%22lt%22%2C%22value%22%3A%5B%22/);
  const filters = JSON.parse(url.searchParams.get('filters'));
  assert.deepEqual(filters, [{ key: 'created_at', operator: 'lt', value: [new Date(NOW - 30 * DAY).toISOString()] }]);
  assert.equal(new Headers(call.headers).get('authorization'), `Bearer ${TOKEN}`);
  assert.equal(call.body, undefined, 'nothing is sent in a body');
  assert.equal(call.url.includes(TOKEN), false, 'the token is in the URL');
  assert.equal(JSON.stringify(result).includes(TOKEN), false, 'the token is in the result');
});

test('THE CUTOFF is exactly the retention window before the run, to the millisecond, and the window is the one constant the pages are held to', async () => {
  assert.equal(G.GATEWAY_LOG_RETENTION_DAYS, 30);
  for (const now of [NOW, NOW + 7 * 3_600_000 + 123, Date.UTC(2027, 0, 31, 23, 59, 59, 999)]) {
    const r = recorder(ok);
    const result = await G.pruneGatewayLogs(FULL, now, r.fn);
    const sent = JSON.parse(new URL(r.calls[0].url).searchParams.get('filters'))[0].value[0];
    assert.equal(sent, new Date(now - 30 * DAY).toISOString());
    assert.equal(result.cutoff, sent, 'the result reports the cutoff that was sent');
    assert.ok(Date.parse(sent) < now, 'the cutoff is in the past');
  }
  // Nothing newer than 30 days is ever asked for: a cutoff later than that would delete logs the page says are kept.
  const r = recorder(ok);
  await G.pruneGatewayLogs(FULL, NOW, r.fn);
  assert.ok(Date.parse(JSON.parse(new URL(r.calls[0].url).searchParams.get('filters'))[0].value[0]) <= NOW - 30 * DAY);
});

test('the account and the gateway are put in the path encoded, so a setting cannot change which route is called', async () => {
  const r = recorder(ok);
  await G.pruneGatewayLogs({ ...FULL, CF_ACCOUNT_ID: 'a/../b', AI_GATEWAY_ID: 'g?x=1#' }, NOW, r.fn);
  const url = new URL(r.calls[0].url);
  assert.equal(url.pathname, '/client/v4/accounts/a%2F..%2Fb/ai-gateway/gateways/g%3Fx%3D1%23/logs');
});

// -------------------------------------------------------------------------------- the absent secret ---

for (const [missing, names] of [
  [{ CF_WORKER_OPS_TOKEN: undefined }, ['CF_WORKER_OPS_TOKEN']],
  [{ CF_WORKER_OPS_TOKEN: '   ' }, ['CF_WORKER_OPS_TOKEN']],
  [{ AI_GATEWAY_ID: undefined }, ['AI_GATEWAY_ID']],
  [{ CF_ACCOUNT_ID: '' }, ['CF_ACCOUNT_ID']],
  [{ CF_WORKER_OPS_TOKEN: undefined, AI_GATEWAY_ID: undefined, CF_ACCOUNT_ID: undefined }, ['CF_WORKER_OPS_TOKEN', 'AI_GATEWAY_ID', 'CF_ACCOUNT_ID']],
]) {
  test(`ABSENT SETTING (${names.join(', ')}): nothing is sent, and the result says it did nothing and what is missing`, async () => {
    const r = recorder(ok);
    const env = { ...FULL, ...missing };
    const result = await G.pruneGatewayLogs(env, NOW, r.fn);
    assert.equal(r.calls.length, 0, 'a call was made without everything it needs');
    assert.equal(result.status, 'skipped');
    assert.equal(result.cutoff, undefined, 'a cutoff is reported for a deletion that was never asked for');
    for (const name of names) assert.match(result.reason, new RegExp(name));
    assert.match(result.reason, /no log was deleted/);
    if (names.includes('CF_WORKER_OPS_TOKEN')) assert.match(result.reason, /N4/, 'the sentence does not point at the owner item that fixes it');
    assert.deepEqual(G.missingGatewayRetentionSettings(env), names);
    assert.equal(JSON.stringify(result).includes(TOKEN), false);
  });
}

// ------------------------------------------------------------------------------------- a failed call ---

for (const [name, answer, pattern] of [
  ['a 403', () => Response.json({ success: false, errors: [{ code: 10000, message: 'Authentication error' }] }, { status: 403 }), /Cloudflare answered 403 \(10000 Authentication error\)/],
  ['a 500 with no body', () => new Response('upstream broke', { status: 500 }), /Cloudflare answered 500, so no log was deleted/],
  ['a 200 whose envelope says success:false', () => Response.json({ success: false, errors: [{ code: 7003, message: 'no route' }] }, { status: 200 }), /Cloudflare answered 200 \(7003 no route\)/],
  ['a network error', () => { throw new TypeError('fetch failed'); }, /could not be reached \(TypeError\), so no log was deleted/],
  ['a timeout', () => { const e = new Error('timed out'); e.name = 'TimeoutError'; throw e; }, /could not be reached \(TimeoutError\)/],
]) {
  test(`A FAILED CALL (${name}): reported as failed, with the reason, and never as a deletion; the token is in no sentence`, async () => {
    const r = recorder(answer);
    const result = await G.pruneGatewayLogs(FULL, NOW, r.fn);
    assert.equal(r.calls.length, 1);
    assert.equal(result.status, 'failed');
    assert.match(result.reason, pattern);
    assert.equal(JSON.stringify(result).includes(TOKEN), false, 'the token is in the result');
    assert.equal(G.describeGatewayRetention(result).startsWith('failed:'), true);
  });
}

test('the function never throws, whatever the fetch does, so one broken step cannot cancel the cron', async () => {
  const result = await G.pruneGatewayLogs(FULL, NOW, () => { throw new Error('synchronous throw'); });
  assert.equal(result.status, 'failed');
  const jsonThrows = await G.pruneGatewayLogs(FULL, NOW, async () => ({ ok: true, status: 200, json: async () => { throw new Error('bad json'); } }));
  assert.equal(jsonThrows.status, 'requested', 'an accepted call with an unreadable body is accepted: the status said so');
});

// ------------------------------------------------------------------------- through the real cron ---

const ctx = () => ({ waitUntil() {}, passThroughOnException() {} });
const DAILY = { scheduledTime: NOW, cron: '0 3 * * *' };
const MINUTE = { scheduledTime: NOW, cron: '* * * * *' };

let DB = null;
let ADMIN = [];
let KV = new Map();
const realFetch = globalThis.fetch;

function world(extra = {}) {
  if (DB) DB.close();
  DB = d1();
  ADMIN = [];
  KV = new Map();
  DB.raw.exec(`create table if not exists memory_entries(scope text not null, scope_id text not null, key text not null, kind text not null, value text not null, source text not null, created_at text not null, updated_at text not null, expires_at text, updated_by text not null, primary key(scope, scope_id, key))`);
  // One expired memory entry: the OTHER sweep of the same night, which a broken gateway call must not stop.
  DB.raw.prepare(`insert into memory_entries values (?,?,?,?,?,?,?,?,?,?)`).run('user', 'u1', 'stale', 'fact', 'old', 'user', 'x', 'x', new Date(NOW - DAY).toISOString(), 'u1');
  return {
    CORPUS: DB.CORPUS,
    KV: { async get(k) { return KV.get(k) ?? null; }, async put(k, v) { KV.set(k, v); }, async delete(k) { KV.delete(k); }, async list() { return { keys: [], list_complete: true }; } },
    ADMIN_KEY: 'admin-key-for-the-test',
    ADMIN_DO: { idFromName: (n) => n, get: () => ({ async fetch(url, init) { ADMIN.push({ path: new URL(url).pathname, body: init?.body ? JSON.parse(init.body) : null }); return new Response(JSON.stringify({ stored: 1 }), { status: 200 }); } }) },
    SESSION_DO: { idFromName: (n) => n, get: () => ({ async fetch() { return new Response('{}'); } }) },
    ...extra,
  };
}
const eventsOf = () => ADMIN.filter((p) => p.path === '/events').flatMap((p) => p.body?.events ?? []);
const withFetch = async (answer, fn) => { const r = recorder(answer); globalThis.fetch = r.fn; try { await fn(r); } finally { globalThis.fetch = realFetch; } };

test('THE DAILY CRON deletes the old logs once, records it in the admin log and for the admin route, and runs the other sweeps too', async () => {
  const env = world(FULL);
  const before = Date.now();
  await withFetch(ok, async (r) => {
    await worker.scheduled(DAILY, env, ctx());
    const deletes = r.calls.filter((c) => c.method === 'DELETE');
    assert.equal(deletes.length, 1, 'the gateway delete is asked once a night');
    assert.match(deletes[0].url, new RegExp(`/accounts/${ACCOUNT}/ai-gateway/gateways/${GATEWAY}/logs\\?filters=`));
  });
  assert.equal(countRows(DB.raw, `select count(*) from memory_entries where key = 'stale'`), 0, 'the other retention sweep did not run');
  const audit = eventsOf().find((e) => e.kind === 'audit' && e.action === 'gateway_log_retention');
  assert.ok(audit, `no gateway_log_retention event: ${eventsOf().map((e) => e.action ?? e.kind).join(', ')}`);
  assert.equal(audit.allowed, true);
  assert.equal(audit.actorKind, 'system');
  // The cron's own clock is the time of the run (as the retention sweep's is), so the cutoff is read back and held to 30 days before it.
  const after = Date.now();
  const cutoff = /^requested: logs older than (\S+)$/.exec(audit.subject)?.[1];
  assert.ok(cutoff, `the audit subject does not carry the cutoff: ${audit.subject}`);
  assert.ok(Date.parse(cutoff) >= before - 30 * DAY && Date.parse(cutoff) <= after - 30 * DAY, `the cutoff ${cutoff} is not 30 days before the run`);
  const last = JSON.parse(KV.get('ops:gateway-log-retention'));
  assert.equal(last.status, 'requested');
  assert.equal(last.cutoff, cutoff);
});

test('THE ABSENT SECRET THROUGH THE CRON: nothing is sent to Cloudflare, and the admin log and the admin route both say it did nothing', async () => {
  const env = world({ CF_ACCOUNT_ID: ACCOUNT, AI_GATEWAY_ID: GATEWAY });
  await withFetch(ok, async (r) => {
    await worker.scheduled(DAILY, env, ctx());
    assert.equal(r.calls.length, 0, 'a call went out with no token');
  });
  assert.equal(countRows(DB.raw, `select count(*) from memory_entries where key = 'stale'`), 0, 'a missing token stopped the other sweeps');
  const audit = eventsOf().find((e) => e.action === 'gateway_log_retention');
  assert.ok(audit, 'the night it did nothing left no trace: it would look like a night with nothing to delete');
  assert.equal(audit.allowed, false);
  assert.match(audit.subject, /^skipped: CF_WORKER_OPS_TOKEN not set, so no log was deleted \(owner item N4 creates the token\)$/);
  assert.equal(eventsOf().some((e) => e.kind === 'error' && /gateway/.test(e.scope ?? '')), false, 'a missing token is not an error, it is a state');
  // And the admin route says the same, behind the admin key.
  const anon = await worker.request('https://x/api/admin/gateway-log-retention', {}, env, ctx());
  assert.ok([401, 403].includes(anon.status), `no admin key: ${anon.status}`);
  const res = await worker.request('https://x/api/admin/gateway-log-retention', { headers: { 'X-Admin-Key': 'admin-key-for-the-test' } }, env, ctx());
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.retentionDays, 30);
  assert.equal(body.configured, false);
  assert.deepEqual(body.missing, ['CF_WORKER_OPS_TOKEN']);
  assert.equal(body.last.status, 'skipped');
  assert.equal(JSON.stringify(body).includes('cfut_'), false);
});

test('THE ADMIN ROUTE before the cron has run says so (last is null), and once the token is set says configured', async () => {
  const env = world(FULL);
  const res = await worker.request('https://x/api/admin/gateway-log-retention', { headers: { 'X-Admin-Key': 'admin-key-for-the-test' } }, env, ctx());
  const body = await res.json();
  assert.equal(body.configured, true);
  assert.deepEqual(body.missing, []);
  assert.equal(body.last, null);
  assert.equal(JSON.stringify(body).includes(TOKEN), false, 'the token is on the admin route');
});

for (const [name, answer] of [
  ['Cloudflare refuses (403)', () => Response.json({ success: false, errors: [{ code: 10000, message: 'Authentication error' }] }, { status: 403 })],
  ['the network is down', () => { throw new TypeError('fetch failed'); }],
]) {
  test(`A FAILED CALL THROUGH THE CRON (${name}): an audit event that is not allowed and an error event are written, the last-run record says failed, and the other sweeps still ran`, async () => {
    const env = world(FULL);
    await withFetch(answer, async () => { await worker.scheduled(DAILY, env, ctx()); });
    assert.equal(countRows(DB.raw, `select count(*) from memory_entries where key = 'stale'`), 0, 'a broken gateway call cancelled the other sweeps');
    const audit = eventsOf().find((e) => e.action === 'gateway_log_retention');
    assert.equal(audit.allowed, false);
    assert.match(audit.subject, /^failed: /);
    const error = eventsOf().find((e) => e.kind === 'error' && e.scope === 'retention:gateway_logs');
    assert.ok(error, 'a failed deletion left no error event');
    assert.equal(error.fatal, false);
    assert.equal(JSON.stringify(eventsOf()).includes(TOKEN), false, 'the token reached the event log');
    assert.equal(JSON.parse(KV.get('ops:gateway-log-retention')).status, 'failed');
  });
}

test('THE MINUTE CRON does not touch the gateway: the deletion is a once-a-day step, and the minute run drains the outbox and stops', async () => {
  // The outbox is configured and answers "ready" with nothing to claim, so the minute run COMPLETES, which is the only way to see that it stops after the outbox and does
  // not fall through to the daily steps.
  const env = world({ ...FULL, SUPABASE_URL: 'https://supa.test', SUPABASE_ANON_KEY: 'anon', MEMBERSHIP_OUTBOX_TOKEN: 'm'.repeat(40), MEMBERSHIP_OUTBOX_CONSUMER: 'apple' });
  const answer = (call) => Response.json(/membership_access_outbox_ready/.test(call.url) ? true : /claim_membership_access_outbox/.test(call.url) ? [] : { success: true });
  await withFetch(answer, async (r) => {
    await worker.scheduled(MINUTE, env, ctx());
    assert.ok(r.calls.some((c) => /claim_membership_access_outbox/.test(c.url)), 'the minute run did not drain the outbox: this test would prove nothing');
    assert.equal(r.calls.filter((c) => c.method === 'DELETE').length, 0, 'the gateway was asked on the minute cron');
  });
  assert.equal(KV.has('ops:gateway-log-retention'), false, 'the minute run recorded a gateway result');
  assert.equal(countRows(DB.raw, `select count(*) from memory_entries where key = 'stale'`), 1, 'the minute run swept memory: it fell through to the daily steps');
});

test('WIRING: the daily schedule is declared, the secret is an optional Env field, and the privacy pages are held to the constant read from this module', () => {
  const wrangler = JSON.parse(readFileSync(join(WORKER, 'wrangler.studpilot.jsonc'), 'utf8').replace(/^\s*\/\/[^\n]*$/gm, ''));
  assert.ok(wrangler.triggers.crons.includes('0 3 * * *'), 'the daily cron is not declared: nothing would delete the logs');
  assert.equal(wrangler.vars.AI_GATEWAY_ID, 'studpilot', 'the gateway the step deletes from is the one the calls go through');
  assert.ok(/^[0-9a-f]{32}$/.test(wrangler.vars.CF_ACCOUNT_ID), 'the account id the step needs is a public var');
  const env = readFileSync(join(WORKER, 'src', 'env.ts'), 'utf8');
  assert.match(env, /CF_WORKER_OPS_TOKEN\?: string;/, 'CF_WORKER_OPS_TOKEN is not an optional Env field');
  assert.doesNotMatch(readFileSync(join(WORKER, 'wrangler.studpilot.jsonc'), 'utf8'), /CF_WORKER_OPS_TOKEN\s*"\s*:/, 'a secret was written into the config');
});
