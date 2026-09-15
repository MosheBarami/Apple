/**
 * THE OPT-OUT, THROUGH THE MIDDLEWARE THAT ACTUALLY WRITES THE EVENT.
 *
 * analytics-consent.test.mjs proves the decision. This proves it is CONSULTED: the request log is
 * written in a `finally` block in index.ts that nothing else touches, and a consent module with no
 * caller is the same defect as a retention sweep with no cron.
 *
 * The events are read back the way they really travel — buffered in the isolate, flushed to AdminDO
 * once enough have accumulated — rather than by reaching into the ring, so what these tests inspect
 * is the payload that would actually be stored.
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
const OUT = join(tmpdir(), `golem-consent-live-${process.pid}.mjs`);

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
const app = (await import(pathToFileURL(OUT).href)).default;
process.on('exit', () => rmSync(OUT, { force: true }));

const OPTED_OUT = '11111111-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const CONSENTING = '22222222-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

const DB = d1();
DB.raw.exec(`create table if not exists memory_entries(scope text not null, scope_id text not null, key text not null, kind text not null, value text not null, source text not null, created_at text not null, updated_at text not null, expires_at text, updated_by text not null, primary key(scope, scope_id, key))`);
DB.raw.prepare(`insert into memory_entries values (?,?,?,?,?,?,?,?,?,?)`)
  .run('user', OPTED_OUT, 'pref.analytics_opt_out', 'preference', 'true', 'user', 'x', 'x', null, OPTED_OUT);

const STORED = [];
const env = {
  CORPUS: DB.CORPUS,
  ADMIN_DO: {
    idFromName: (n) => n,
    get: () => ({
      async fetch(url, init) {
        const body = init?.body ? JSON.parse(init.body) : null;
        if (new URL(url).pathname === '/events' && body?.events) STORED.push(...body.events);
        return new Response(JSON.stringify({ stored: body?.events?.length ?? 0 }), { status: 200 });
      },
    }),
  },
  QUOTA_DO: { idFromName: (n) => n, get: () => ({ async fetch() { return new Response('{}', { status: 200 }); } }) },
  SESSION_DO: { idFromName: (n) => n, get: () => ({ async fetch() { return new Response('{}', { status: 200 }); } }) },
  KV: { async get() { return null; }, async put() {}, async delete() {}, async list() { return { keys: [], list_complete: true }; } },
};

const pending = [];
const ctx = { waitUntil: (p) => pending.push(p), passThroughOnException() {} };

/**
 * The two people use two different routes, and each test reads only its own.
 *
 * The event ring is per ISOLATE and flushes on a threshold, so a batch shipped during one test
 * routinely carries the tail of the previous one. Slicing `STORED` by position would therefore mix
 * them — measured: the opted-out run's first batch arrived carrying four of the consenting user's
 * events, and the test read them as a leak. The route label is what separates them honestly.
 */
const ROUTE = { [CONSENTING]: '/api/me/usage', [OPTED_OUT]: '/api/notifications' };

async function hit(user) {
  await app.request(`https://x${ROUTE[user]}`, { headers: { Authorization: `Bearer ${user}` } }, env, ctx);
  await Promise.all(pending.splice(0));
}

/** Enough requests to cross the flush threshold, so the events reach the sink the real way. */
async function hitMany(user, n = 24) {
  for (let i = 0; i < n; i += 1) await hit(user);
  return STORED.filter((e) => e.kind === 'request' && e.route === ROUTE[user]);
}

test('a person who has not opted out is attributed — once the answer is known', async () => {
  const events = await hitMany(CONSENTING);
  assert.ok(events.length >= 10, `only ${events.length} request events reached the sink`);
  // The FIRST one is unattributed: this isolate had not asked yet, and unknown is treated as a no.
  assert.equal(events[0].actorId, null, 'an event was attributed before consent had been looked up');
  // And by the end the answer is known and the events carry it. Without this the test above would
  // pass on a worker that never attributes anything at all.
  assert.equal(events[events.length - 1].actorId, CONSENTING);
  assert.ok(events.filter((e) => e.actorId === CONSENTING).length >= 5, 'the answer was never learned');
});

test('a person who opted out is never attributed, however warm the cache gets', async () => {
  const events = await hitMany(OPTED_OUT);
  assert.ok(events.length >= 10, `only ${events.length} request events reached the sink`);
  const attributed = events.filter((e) => e.actorId !== null);
  assert.deepEqual(attributed, [], `${attributed.length} events carried the id of somebody who opted out`);
  // The requests still happened and are still counted — an opt-out removes the name, not the row.
  for (const e of events) assert.equal(e.kind, 'request');
});

test('the route is labelled, not logged raw, for both of them', async () => {
  const events = STORED.filter((e) => e.kind === 'request');
  assert.ok(events.length > 0);
  for (const e of events) {
    assert.equal(e.route.includes(OPTED_OUT), false);
    assert.equal(e.route.includes(CONSENTING), false);
  }
});
