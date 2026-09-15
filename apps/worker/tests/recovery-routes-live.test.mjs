/**
 * THE RECOVERY ROUTES, EXECUTED — because a queue nobody can reach is not a queue.
 *
 * `recovery-requests.test.mjs` drives the store against a real database and proves what it refuses
 * to store and refuses to say. None of that reaches a locked-out person unless the route exists,
 * is exempt from the JWT check, and answers uniformly — and a route asserted by reading index.ts's
 * source text is satisfied by a comment. So this instantiates the real Hono app and issues real
 * requests, the way files-routes-live.test.mjs established.
 *
 * FOUR PROPERTIES, and the first is the one that makes the rest worth having:
 *
 *   IT IS REACHABLE WITHOUT A TOKEN. The entire premise is somebody who cannot sign in. A recovery
 *   route behind `Authorization: Bearer` is a locked door with a sign on it saying the key is
 *   inside. `AUTH_EXEMPT` is what makes it reachable, and this test fails if somebody later
 *   "tidies" the route back behind the middleware.
 *
 *   IT ANSWERS IDENTICALLY FOR EVERY ADDRESS. Byte for byte, registered or not — the same
 *   discipline `auth-flows.ts` keeps on the client, enforced here on the wire where it actually
 *   binds. This is the only assertion in the file that compares two whole response bodies, and
 *   that is deliberate.
 *
 *   A STORAGE FAILURE IS NOT A CALM CONFIRMATION. When D1 refuses the write the person must be
 *   told to try again, not thanked. The status differs (503) and the body says so. This is the one
 *   axis on which the route is permitted to vary, because it does not vary with the address.
 *
 *   THE OPERATOR'S SIDE IS BEHIND THE ADMIN KEY. The queue holds hashes rather than addresses, but
 *   it is still a list of accounts in trouble and their state; `/api/admin/*` is where that lives.
 *
 * Run with:  node --test tests/recovery-routes-live.test.mjs      (from apps/worker)
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
const OUT = join(tmpdir(), `golem-recovery-live-${process.pid}.mjs`);

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
process.on('exit', () => rmSync(OUT, { force: true }));

let deferred = [];
const ctx = { waitUntil: (p) => { deferred.push(Promise.resolve(p)); }, passThroughOnException() {} };
const hit = (url, init, env) => app.request(url, init, env, ctx);
async function settle() {
  while (deferred.length) { const b = deferred; deferred = []; await Promise.allSettled(b); }
}

const ADMIN_KEY = 'admin-key-for-the-test';

function envFor(db) {
  return {
    CORPUS: db.CORPUS,
    ADMIN_KEY,
    KV: { async get() { return null; }, async put() {}, async delete() {}, async list() { return { keys: [], list_complete: true }; } },
    ADMIN_DO: { idFromName: (n) => n, get: () => ({ async fetch() { return new Response('{}', { status: 200 }); } }) },
  };
}

//[[ EVERY TEST GETS ITS OWN CLIENT IP, AND THAT IS NOT TIDINESS.
//
//   `ipLimited`'s counters are module-global and survive between tests in one process. With every
//   request arriving from the same (absent, therefore 'unknown') address, the rate-limit test below
//   exhausted the bucket and the three tests after it received 429s — so their POSTs never ran, the
//   table was never created, and they failed with `no such table` from the assertion rather than
//   from the route. That looked like four broken routes and was one shared counter.
//
//   A fresh address per test makes each ceiling its own, which is also what makes the rate-limit
//   test measure a ceiling instead of the residue of everything before it. ]]
let nextIp = 0;
const freshIp = () => `203.0.113.${(nextIp += 1) % 250}`;

const json = (body, ip = freshIp()) => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': ip },
  body: JSON.stringify(body),
});
const admin = (init = {}) => ({ ...init, headers: { ...(init.headers ?? {}), 'X-Admin-Key': ADMIN_KEY } });

const URL_ = 'https://x/api/recovery-request';

/* ------------------------------------------------------------- reachable without a token --- */

test('THE ROUTE IS REACHABLE WITH NO AUTHORIZATION HEADER AT ALL', async () => {
  const db = d1();
  const res = await hit(URL_, json({ email: 'sam@example.com', note: 'lost my phone' }), envFor(db));
  assert.notEqual(res.status, 401, 'a recovery route behind the JWT check is a locked door with the key inside');
  assert.equal(res.status, 200);
  // And the row is really there — otherwise every assertion below is about an empty database.
  assert.equal(countRows(db.raw, 'select count(*) from recovery_requests'), 1);
  db.close();
});

/* ---------------------------------------------------------------------- no oracle on the wire --- */

test('THE BODY IS BYTE-FOR-BYTE IDENTICAL WHATEVER THE ADDRESS IS', async () => {
  const db = d1();
  const a = await hit(URL_, json({ email: 'known@example.com', note: 'help' }), envFor(db));
  const b = await hit(URL_, json({ email: 'nobody-at-all@example.com', note: 'help' }), envFor(db));
  // PINNED TO 200 FIRST. Two identical 401s satisfy "the bodies match" perfectly, and that is how
  // this assertion passes while the route does not exist — measured: it was the one green test in
  // the red run. An equality test whose inputs are both failures measures nothing.
  assert.equal(a.status, 200, 'both must be real answers before their equality means anything');
  assert.equal(a.status, b.status);
  assert.equal(await a.text(), await b.text(), 'any difference here is the enumeration oracle back again');
  db.close();
});

test('the reply never echoes an id — that would be a handle onto somebody else\'s request', async () => {
  const db = d1();
  const res = await hit(URL_, json({ email: 'sam@example.com', note: 'help' }), envFor(db));
  const body = await res.json();
  const row = db.raw.prepare('select id from recovery_requests').get();
  assert.ok(row?.id, 'fixture must have stored a row');
  assert.ok(!JSON.stringify(body).includes(row.id), 'the public reply must not carry the request id');
  db.close();
});

/* -------------------------------------------------------------- failures are not confirmations --- */

test('A WRITE THAT FAILED IS A 503 THAT SAYS TRY AGAIN, NOT A CALM THANK-YOU', async () => {
  const broken = {
    CORPUS: {
      prepare() {
        return { bind: () => ({
          async run() { throw new Error('D1 DB is overloaded'); },
          async first() { return null; },
          async all() { return { results: [] }; },
        }) };
      },
    },
    ADMIN_KEY,
    KV: { async get() { return null; }, async put() {}, async delete() {}, async list() { return { keys: [], list_complete: true }; } },
    ADMIN_DO: { idFromName: (n) => n, get: () => ({ async fetch() { return new Response('{}', { status: 200 }); } }) },
  };
  const res = await hit(URL_, json({ email: 'sam@example.com', note: 'help' }), broken);
  assert.equal(res.status, 503, 'telling somebody their plea is queued when it is not is the failure this repo keeps naming');
  const body = await res.json();
  assert.match(JSON.stringify(body), /again/i, 'and it must tell them what to do about it');
});

test('a malformed address is a 400 that names the problem — it is not about the account', async () => {
  const db = d1();
  const res = await hit(URL_, json({ email: 'not-an-address', note: 'help' }), envFor(db));
  assert.equal(res.status, 400);
  // REFUSED BEFORE THE DATABASE IS TOUCHED, so the table does not even exist — a stronger fact
  // than "no rows", and the reason this reads sqlite_master instead of counting.
  const built = db.raw.prepare("select count(*) from sqlite_master where name = 'recovery_requests'").get();
  assert.equal(Number(Object.values(built)[0]), 0, 'a value that cannot be an address must not reach D1');
  db.close();
});

test('a body that is not JSON is refused rather than crashing the route', async () => {
  const db = d1();
  const res = await hit(URL_, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: 'not json' }, envFor(db));
  assert.equal(res.status, 400);
  db.close();
});

/* ----------------------------------------------------------------------- the operator's side --- */

test('THE QUEUE IS BEHIND THE ADMIN KEY', async () => {
  const db = d1();
  await hit(URL_, json({ email: 'sam@example.com', note: 'help' }), envFor(db));
  const open = await hit('https://x/api/admin/recovery-requests', {}, envFor(db));
  // 403 is what the admin middleware answers a missing key with. Pinned to the real number rather
  // than "not 200": a route that 500s is also not 200, and that would pass while being broken.
  assert.equal(open.status, 403, 'a list of accounts in trouble is not public');
  const authed = await hit('https://x/api/admin/recovery-requests', admin(), envFor(db));
  assert.equal(authed.status, 200);
  const body = await authed.json();
  assert.equal(body.requests.length, 1);
  db.close();
});

test('the operator listing carries no address — it cannot leak what the table never held', async () => {
  const db = d1();
  await hit(URL_, json({ email: 'sam@example.com', note: 'lost my phone' }), envFor(db));
  const res = await hit('https://x/api/admin/recovery-requests', admin(), envFor(db));
  const text = await res.text();
  assert.ok(!text.includes('sam@example.com'), 'the queue must never render an address');
  assert.match(text, /lost my phone/, 'but the note is what makes the row actionable');
  db.close();
});

test('an operator finds a row by hashing an address the person gave them another way', async () => {
  const db = d1();
  await hit(URL_, json({ email: 'sam@example.com', note: 'lost my phone' }), envFor(db));
  const res = await hit('https://x/api/admin/recovery-requests?email=SAM%40example.com', admin(), envFor(db));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.requests.length, 1);
  assert.equal(body.requests[0].note, 'lost my phone');
  db.close();
});

test('an operator moves a request along, and the move is attributed', async () => {
  const db = d1();
  await hit(URL_, json({ email: 'sam@example.com', note: 'help' }), envFor(db));
  const id = db.raw.prepare('select id from recovery_requests').get().id;
  const res = await hit(
    `https://x/api/admin/recovery-requests/${id}`,
    admin({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ state: 'verifying', decidedBy: 'moshe' }) }),
    envFor(db),
  );
  assert.equal(res.status, 200);
  const row = db.raw.prepare('select * from recovery_requests').get();
  assert.equal(row.state, 'verifying');
  assert.equal(row.decided_by, 'moshe');
  db.close();
});

test('a decision that the state machine refuses comes back as a refusal, not a 200', async () => {
  const db = d1();
  await hit(URL_, json({ email: 'sam@example.com', note: 'help' }), envFor(db));
  const id = db.raw.prepare('select id from recovery_requests').get().id;
  const dec = (body) => hit(
    `https://x/api/admin/recovery-requests/${id}`,
    admin({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
    envFor(db),
  );
  assert.equal((await dec({ state: 'refused', decidedBy: 'moshe' })).status, 200);
  const again = await dec({ state: 'approved', decidedBy: 'moshe' });
  assert.equal(again.status, 409, 'reopening a refused request is how an impersonation succeeds');
  assert.equal(db.raw.prepare('select state from recovery_requests').get().state, 'refused');
  db.close();
});

/* ------------------------------------------------------------------------------ throttling --- */

test('the public route is rate limited — it is unauthenticated and writes rows', async () => {
  const db = d1();
  const env = envFor(db);
  const ip = freshIp();
  let sawLimit = false;
  for (let i = 0; i < 40; i += 1) {
    // ONE address for the whole loop: the ceiling under test is a single client's, and a loop that
    // varied the IP would prove only that 40 different clients are each allowed one request.
    const res = await hit(URL_, json({ email: `person${i}@example.com`, note: 'help' }, ip), env);
    if (res.status === 429) { sawLimit = true; break; }
  }
  await settle();
  assert.ok(sawLimit, 'an unauthenticated route that inserts rows needs a ceiling');
  db.close();
});
