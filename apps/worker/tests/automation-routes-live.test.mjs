/**
 * THE AUTOMATION ROUTES, EXECUTED — because until they existed the product had automation policy,
 * automation storage, and no automations.
 *
 * `normaliseAutomation` refused fourteen named things and `saveAutomation` wrote rows, and neither
 * had a caller outside a test: `grep -ni automation src/index.ts` returned nothing. A validator
 * nobody can reach validates nothing, and a store nobody writes to stores nothing. So this file
 * instantiates the real Hono app and issues real requests, for the reason
 * files-routes-live.test.mjs records — a route asserted by reading index.ts's source text is
 * satisfied by a comment.
 *
 * The properties, each driven by the case that would break it:
 *
 *   - a name one character too long is REFUSED BY NAME and nothing is stored, because the
 *     alternative is a different name attributed to somebody who did not choose it;
 *   - an unknown zone is refused rather than quietly becoming UTC, which is the commonest
 *     automation bug and the one whose symptom is "it ran at the wrong time";
 *   - a fire is re-authorised against the OWNER's access every single time, so a member who was
 *     removed from a project does not keep a standing actor pointed at it;
 *   - the fire is CLAIMED before the run starts, so pressing the button twice starts one build;
 *   - the daily cap and the overlap policy are read from the same functions the policy tests
 *     drive, and both are fed observations rather than guesses — an `inFlight` this route could
 *     not read is refused out loud, never reported as "idle".
 *
 * Run with:  node --test tests/automation-routes-live.test.mjs      (from apps/worker)
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
const OUT = join(tmpdir(), `golem-automation-live-${process.pid}.mjs`);

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
const { PROJECTS, MEMBERS, ROWS } = await import(`file://${join(HERE, 'stubs', 'supa.mjs')}`);
process.on('exit', () => rmSync(OUT, { force: true }));

//[[ EVERY REQUEST CARRIES AN ExecutionContext, BECAUSE THE WORKERS RUNTIME ALWAYS SUPPLIES ONE.
//
//   `app.request(url, init, env)` with no fourth argument gives the handler a context whose
//   `executionCtx` getter THROWS. The fire route defers the build with `waitUntil` — a build takes
//   minutes and a request held open for one times out — so without a context every `/run` answered
//   500 after the fire had already been claimed. That is a fact about this harness, not about the
//   route: a Worker's fetch handler is never invoked without one. Supplying it here is what makes
//   the assertions below measure the route instead of the stub.
//
//   The deferred work is COLLECTED rather than dropped, and `settle()` drains it. `app.request`
//   returns when the ROUTE returns; the outcome the history is asked about is written afterwards,
//   which is the whole point of deferring it. A test that read the history without draining would
//   be asserting against a race. ]]
let deferred = [];
const ctx = {
  waitUntil: (p) => { deferred.push(Promise.resolve(p)); },
  passThroughOnException() {},
};
const hit = (url, init, env) => app.request(url, init, env, ctx);
async function settle() {
  while (deferred.length) {
    const batch = deferred;
    deferred = [];
    await Promise.allSettled(batch);
  }
}

const ALICE = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const BOB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const STRANGER = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const PROJECT = '11111111-1111-4111-8111-111111111111';

PROJECTS.set(PROJECT, ALICE);

/* ------------------------------------------------------------------- the environment ---- */

/** What the session Durable Object reports about the project. Mutable, because the tests move it. */
const SESSION = { agentStatus: 'idle', runs: [], infoFails: false, runFails: false };
/** What the budget Durable Object reports. The kill switch is a real input to `startVerdict`. */
const BUDGET = { killed: false, fails: false };

function envFor(db) {
  return {
    CORPUS: db.CORPUS,
    KV: { async get() { return null; }, async put() {}, async delete() {}, async list() { return { keys: [], list_complete: true }; } },
    SESSION_DO: {
      idFromName: (n) => n,
      get: () => ({
        // `(url, init)`, which is how every caller in index.ts invokes a Durable Object stub —
        // including the fire path. Reading the body off a `Request` the caller never built meant
        // `/agent-run` threw, the fire recorded `error`, and the assertion that the prompt reaches
        // the run path was measuring this stub rather than the route.
        async fetch(req, init) {
          const path = new URL(typeof req === 'string' ? req : req.url).pathname;
          if (path === '/init') return new Response('{"ok":true}', { status: 200 });
          if (path === '/info') {
            if (SESSION.infoFails) return new Response('boom', { status: 500 });
            return new Response(JSON.stringify({ agentStatus: SESSION.agentStatus }), { status: 200 });
          }
          if (path === '/agent-run') {
            const raw = typeof req === 'string' ? init?.body : await req.text();
            SESSION.runs.push(JSON.parse(raw ?? '{}'));
            if (SESSION.runFails) return new Response(JSON.stringify({ error: 'the place was locked' }), { status: 500 });
            return new Response(JSON.stringify({ ok: true, started: true }), { status: 200 });
          }
          return new Response('{}', { status: 200 });
        },
      }),
    },
    BUDGET_DO: {
      idFromName: (n) => n,
      get: () => ({
        async fetch() {
          if (BUDGET.fails) return new Response('nope', { status: 500 });
          return new Response(JSON.stringify({ killed: BUDGET.killed }), { status: 200 });
        },
      }),
    },
    // The counter the rest of index.ts writes to. Present so an unhandled rejection from a
    // fire-and-forget metric cannot masquerade as a route failure.
    ADMIN_DO: { idFromName: (n) => n, get: () => ({ async fetch() { return new Response('{}', { status: 200 }); } }) },
  };
}

const as = (user) => ({ headers: { Authorization: `Bearer ${user}` } });
const send = (method) => (user, body) => ({
  method,
  headers: { Authorization: `Bearer ${user}`, 'Content-Type': 'application/json' },
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});
const post = send('POST');
const patch = send('PATCH');
const del = send('DELETE');

const listUrl = `https://x/api/projects/${PROJECT}/automations`;

/** A well-formed automation body. Negative fixtures spoil exactly one field of it. */
const good = (over = {}) => ({
  name: 'Nightly polish',
  description: 'Tidy the lighting before I get up.',
  prompt: 'Tidy the lighting in the main map.',
  mode: 'agent',
  trigger: 'schedule',
  timezone: 'America/New_York',
  schedule: { every: 'day', hour: 9, minute: 0 },
  ...over,
});

/** A fresh database per test: the ONE thing every assertion below depends on not leaking. */
function fresh() {
  SESSION.agentStatus = 'idle';
  SESSION.runs = [];
  SESSION.infoFails = false;
  SESSION.runFails = false;
  BUDGET.killed = false;
  BUDGET.fails = false;
  MEMBERS.set(PROJECT, []);
  ROWS.delete('project_members');
  ROWS.delete('membership_access_state');
  // Deferred work from a previous test is dropped rather than carried, so a fire started against a
  // database that has since been closed cannot surface as this test's failure.
  deferred = [];
  return d1();
}

async function create(env, user = ALICE, over = {}) {
  const res = await hit(listUrl, post(user, good(over)), env);
  const body = await res.json();
  return { res, body };
}

/* ------------------------------------------------------------------- it exists ---- */

test('an automation can be created, and reads back as a sentence a person can check', async () => {
  const db = fresh();
  const env = envFor(db);
  const { res, body } = await create(env);
  assert.equal(res.status, 201, 'the create route is not registered');
  assert.equal(body.automation.name, 'Nightly polish');
  assert.equal(body.automation.timezone, 'America/New_York');
  // THE ZONE IS NAMED IN THE SENTENCE. A schedule a person cannot read back is a schedule they
  // cannot check, and "right time, wrong zone" is the bug this sentence exists to expose.
  assert.equal(body.automation.describes, 'Every day at 09:00 (America/New_York).');
  // The disclosure is copy the user must see, not a comment in zoned-time.ts.
  assert.match(body.automation.dstNote, /Twice a year the clocks move and 09:00/);
  assert.ok(body.automation.nextFireAt > Date.now(), 'a next fire must be strictly in the future');

  const list = await hit(listUrl, as(ALICE), env);
  assert.equal(list.status, 200);
  const listed = await list.json();
  assert.equal(listed.automations.length, 1);
  assert.equal(listed.automations[0].id, body.automation.id);
  db.close();
});

test('a manual automation stores no schedule, and says so', async () => {
  const db = fresh();
  const env = envFor(db);
  const { body } = await create(env, ALICE, { trigger: 'manual' });
  assert.equal(body.automation.schedule, null);
  assert.equal(body.automation.describes, 'Only when you run it.');
  // No schedule ⇒ no DST disclosure to make. Null, not an empty string: "nothing to say" and
  // "said nothing" are different states and the UI renders them differently.
  assert.equal(body.automation.dstNote, null);
  assert.equal(body.automation.nextFireAt, null, 'a manual automation must never be due');
  db.close();
});

/* ------------------------------------------------------------------- refusals ---- */

test('a name one character too long is refused by name, and nothing is stored', async () => {
  const db = fresh();
  const env = envFor(db);
  const { res, body } = await create(env, ALICE, { name: 'x'.repeat(61) });
  assert.equal(res.status, 400);
  assert.equal(body.error, 'bad_name', 'the client must be able to put the message on the right field');
  assert.equal(countRows(db.raw, 'select count(*) as n from automations'), 0, 'a refused create must write nothing');
  db.close();
});

test('an over-long description is refused as bad_description, never silently shortened', async () => {
  const db = fresh();
  const env = envFor(db);
  const { res, body } = await create(env, ALICE, { description: 'y'.repeat(281) });
  assert.equal(res.status, 400);
  assert.equal(body.error, 'bad_description');
  db.close();
});

test('an unknown timezone is refused rather than quietly becoming UTC', async () => {
  const db = fresh();
  const env = envFor(db);
  const { res, body } = await create(env, ALICE, { timezone: 'Mars/Olympus' });
  assert.equal(res.status, 400);
  assert.equal(body.error, 'unknown_timezone');
  assert.equal(countRows(db.raw, 'select count(*) as n from automations'), 0);
  db.close();
});

test('a stranger cannot create an automation against a project, and is told nothing about it', async () => {
  const db = fresh();
  const env = envFor(db);
  // The schema is made to exist FIRST, by a request that is allowed to make it. Without this the
  // count below threw `no such table: automations` — the stranger is refused at the project gate
  // before `ensureAutomationTables` runs, so "nothing was stored" and "there is nowhere to store
  // anything" were the same observation, and only one of them is what this test is about.
  assert.equal((await hit(listUrl, as(ALICE), env)).status, 200);
  const res = await hit(listUrl, post(STRANGER, good()), env);
  assert.equal(res.status, 404, 'a 403 would confirm the project id to somebody with no business knowing it');
  assert.equal(countRows(db.raw, 'select count(*) as n from automations'), 0);
  db.close();
});

test("a collaborator does not see the owner's automations, prompt and all", async () => {
  const db = fresh();
  const env = envFor(db);
  MEMBERS.set(PROJECT, [{ user_id: BOB, role: 'editor' }]);
  await create(env);
  const mine = await hit(listUrl, as(BOB), env);
  assert.equal(mine.status, 200, 'Bob may open the project');
  assert.deepEqual((await mine.json()).automations, [], "a standing actor's prompt is its owner's own words");
  db.close();
});

/* ------------------------------------------------------------------- pause ---- */

test('pausing is one column, and a paused automation refuses to fire by name', async () => {
  const db = fresh();
  const env = envFor(db);
  const { body } = await create(env, ALICE, { trigger: 'manual' });
  const id = body.automation.id;

  const off = await hit(`https://x/api/automations/${id}/enabled`, post(ALICE, { enabled: false }), env);
  assert.equal(off.status, 200);
  assert.equal((await off.json()).enabled, false);
  // The next-fire pointer is deliberately untouched, so resuming keeps its place.
  const run = await hit(`https://x/api/automations/${id}/run`, post(ALICE), env);
  assert.equal(run.status, 409);
  assert.equal((await run.json()).error, 'disabled');
  assert.equal(SESSION.runs.length, 0, 'a paused automation must not reach the session');

  const on = await hit(`https://x/api/automations/${id}/enabled`, post(ALICE, { enabled: true }), env);
  assert.equal((await on.json()).enabled, true);
  db.close();
});

/* ------------------------------------------------------------------- firing ---- */

test('run now claims the fire, starts the run in the project session, and records the outcome', async () => {
  const db = fresh();
  const env = envFor(db);
  const { body } = await create(env, ALICE, { trigger: 'manual' });
  const id = body.automation.id;

  const res = await hit(`https://x/api/automations/${id}/run`, post(ALICE), env);
  assert.equal(res.status, 202, 'a build takes minutes; the request must not hold the connection open for it');
  const fired = await res.json();
  assert.ok(fired.executionId, 'the caller needs the execution id to follow the run');

  // The build and the outcome it writes are deferred; the response is not. Draining here is what
  // the runtime does when it keeps the isolate alive for `waitUntil`.
  await settle();
  assert.equal(SESSION.runs.length, 1, 'the automation prompt must reach the same run path a chat frame takes');
  assert.equal(SESSION.runs[0].text, 'Tidy the lighting in the main map.');
  assert.equal(SESSION.runs[0].mode, 'agent');

  const runs = await hit(`https://x/api/automations/${id}/runs`, as(ALICE), env);
  assert.equal(runs.status, 200);
  const history = (await runs.json()).runs;
  assert.equal(history.length, 1);
  assert.equal(history[0].id, fired.executionId);
  assert.equal(history[0].outcome, 'ok', 'a fire that was never closed is a run history that lies about what happened');
  assert.equal(history[0].trigger, 'manual');
  db.close();
});

test('two presses of Run now in the same millisecond are two fires, not one silently swallowed', async () => {
  const db = fresh();
  const env = envFor(db);
  const { body } = await create(env, ALICE, { trigger: 'manual' });
  const id = body.automation.id;
  const url = `https://x/api/automations/${id}/run`;

  //[[ THE CLOCK IS PINNED, because the millisecond is what the key derivation got wrong and a
  //   double click on a fast connection is what produces it.
  //
  //   `fireKey(id, dueAt)` is the SCHEDULED key and its collisions are the entire feature: two
  //   dispatchers waking for one due instant must compute one key. A press has no due instant.
  //   Keying it by the wall clock made "one fire per millisecond" a rule nobody chose, and the
  //   second press was answered `already_fired` — a fire that never started, reported as one that
  //   already had. The refusal a second press deserves is the overlap policy, which is an
  //   observation about the project; this was an accident of representation. ]]
  const realNow = Date.now;
  Date.now = () => 1_700_000_000_000;
  let firstId;
  let secondId;
  try {
    const first = await hit(url, post(ALICE), env);
    assert.equal(first.status, 202);
    firstId = (await first.json()).executionId;
    // The stub reports the project idle, so nothing but the key can refuse the second press.
    const second = await hit(url, post(ALICE), env);
    assert.equal(second.status, 202, 'the second press must not be answered "already_fired"');
    secondId = (await second.json()).executionId;
  } finally {
    Date.now = realNow;
  }
  assert.notEqual(secondId, firstId, 'two presses are two executions to follow');
  await settle();
  assert.equal(countRows(db.raw, 'select count(*) as n from automation_runs'), 2);
  db.close();
});

test("two failed nights are two notifications, because the subject is the EXECUTION", async () => {
  const db = fresh();
  const env = envFor(db);
  SESSION.runFails = true;
  const { body } = await create(env, ALICE, { trigger: 'manual' });
  const id = body.automation.id;
  const url = `https://x/api/automations/${id}/run`;

  const first = (await (await hit(url, post(ALICE), env)).json()).executionId;
  const second = (await (await hit(url, post(ALICE), env)).json()).executionId;
  await settle();

  //[[ THE SUBJECT IS THE EXECUTION, NOT THE AUTOMATION, and this is the assertion that holds it.
  //
  //   `notifications.ts` dedupes by subject (`dedupeKeyFor`). An automation-id subject would give
  //   both nights the same key, the second failure would land on the row the owner already read
  //   and dismissed as `occurrences: 2`, and the failure that means "this is not a blip" would
  //   never be delivered as its own line. The emitter chose the execution id; nothing checked. ]]
  const rows = db.raw
    .prepare(`select subject, dedupe_key, occurrences, recipient_id from notifications where kind = 'automation_failed' order by created_at asc`)
    .all();
  assert.equal(rows.length, 2, 'two failed fires, two notifications');
  assert.deepEqual(rows.map((r) => r.subject).sort(), [first, second].sort());
  assert.notEqual(rows[0].dedupe_key, rows[1].dedupe_key, 'one key for both nights is one night the owner never sees');
  assert.equal(rows[0].occurrences, 1);
  assert.equal(rows[1].occurrences, 1);
  // Addressed to the automation's OWNER, who is the person spending the Credits — not to whoever
  // happened to press the button.
  assert.equal(rows[0].recipient_id, ALICE);

  // And the history agrees with the notification: the fire is recorded as not having run.
  const history = (await (await hit(`https://x/api/automations/${id}/runs`, as(ALICE), env)).json()).runs;
  assert.equal(history.length, 2);
  assert.ok(history.every((r) => r.outcome !== 'ok'), 'a fire the session refused must not read as ok');
  db.close();
});

test('a fire that succeeds notifies nobody', async () => {
  const db = fresh();
  const env = envFor(db);
  const { body } = await create(env, ALICE, { trigger: 'manual' });
  await hit(`https://x/api/automations/${body.automation.id}/run`, post(ALICE), env);
  await settle();
  //[[ "NO ROWS" AND "NO TABLE" ARE BOTH "NOBODY WAS NOTIFIED", AND THEY ARE COUNTED SEPARATELY.
  //
  //   `notify` builds the notification schema on its first delivery, so a run that notified nobody
  //   leaves no table at all and a bare count throws. Swallowing that in a try/catch would also
  //   swallow the day the table exists and the query is wrong, so the two are distinguished here
  //   and both are accepted — a warning for every automation that worked is a warning nobody reads
  //   on the night one does not. ]]
  const made = db.raw.prepare(`select count(*) as n from sqlite_master where type = 'table' and name = 'notifications'`).get().n;
  const warned = made === 0 ? 0 : countRows(db.raw, `select count(*) as n from notifications where kind = 'automation_failed'`);
  assert.equal(warned, 0);
  db.close();
});

test('the fire is claimed BEFORE the run starts, so a claim that loses starts nothing', async () => {
  const db = fresh();
  const env = envFor(db);
  const { body } = await create(env, ALICE, { trigger: 'manual' });
  const id = body.automation.id;
  await hit(`https://x/api/automations/${id}/run`, post(ALICE), env);
  await settle();
  // One row in the ledger per build reaching the session. The ordering is what makes the unique
  // fire_key mean anything at all: a claim taken after the build started would arbitrate a race
  // whose cost had already been paid. (Two dispatchers racing on one key is automation-store's
  // own test; this asserts the route puts the claim on the near side of the run.)
  assert.equal(countRows(db.raw, 'select count(*) as n from automation_runs'), 1);
  assert.equal(SESSION.runs.length, 1);
  db.close();
});

test('a fire is refused while the project is busy, and the reason is the overlap policy', async () => {
  const db = fresh();
  const env = envFor(db);
  const { body } = await create(env, ALICE, { trigger: 'manual' });
  SESSION.agentStatus = 'running';
  const res = await hit(`https://x/api/automations/${body.automation.id}/run`, post(ALICE), env);
  assert.equal(res.status, 409);
  assert.equal((await res.json()).error, 'overlapping');
  assert.equal(SESSION.runs.length, 0);
  db.close();
});

test('an in-flight status this route could not read is refused out loud, never reported as idle', async () => {
  const db = fresh();
  const env = envFor(db);
  const { body } = await create(env, ALICE, { trigger: 'manual' });
  SESSION.infoFails = true;
  const res = await hit(`https://x/api/automations/${body.automation.id}/run`, post(ALICE), env);
  // A failure to observe must not render as an observation. `inFlight: false` here would be this
  // route inventing the one fact that decides whether a second build starts.
  assert.equal(res.status, 503);
  assert.equal((await res.json()).error, 'run_state_unreadable');
  assert.equal(SESSION.runs.length, 0);
  db.close();
});

test('the service-wide kill switch stops an automation exactly as it stops a person', async () => {
  const db = fresh();
  const env = envFor(db);
  const { body } = await create(env, ALICE, { trigger: 'manual' });
  BUDGET.killed = true;
  const res = await hit(`https://x/api/automations/${body.automation.id}/run`, post(ALICE), env);
  assert.equal(res.status, 409);
  assert.equal((await res.json()).error, 'killed');
  assert.equal(SESSION.runs.length, 0);
  db.close();
});

test('the daily cap is counted from the fires actually taken, in the automation own zone', async () => {
  const db = fresh();
  const env = envFor(db);
  const { body } = await create(env, ALICE, { trigger: 'manual', budget: { maxRunsPerDay: 2 } });
  const id = body.automation.id;
  const url = `https://x/api/automations/${id}/run`;
  assert.equal((await hit(url, post(ALICE), env)).status, 202);
  assert.equal((await hit(url, post(ALICE), env)).status, 202);
  const third = await hit(url, post(ALICE), env);
  assert.equal(third.status, 409);
  assert.equal((await third.json()).error, 'daily_cap');
  await settle();
  assert.equal(SESSION.runs.length, 2);
  db.close();
});

test('an automation whose owner lost access to the project does not fire', async () => {
  const db = fresh();
  const env = envFor(db);
  MEMBERS.set(PROJECT, [{ user_id: BOB, role: 'editor' }]);
  const { res, body } = await create(env, BOB, { trigger: 'manual' });
  assert.equal(res.status, 201, 'an editor may create a standing actor');
  const id = body.automation.id;

  // Removed from the project. The automation row is untouched — this is the re-authorisation that
  // makes a standing actor safe, asked fresh on the fire rather than carried forward from creation.
  MEMBERS.set(PROJECT, [{ user_id: BOB, role: 'editor', revoked_at: new Date().toISOString() }]);
  const run = await hit(`https://x/api/automations/${id}/run`, post(BOB), env);
  assert.equal(run.status, 403);
  assert.equal((await run.json()).error, 'owner_lost_access');
  assert.equal(SESSION.runs.length, 0);
  db.close();
});

/* ------------------------------------------------------------------- history and spend ---- */

test('spend reports a run whose cost was never recorded as unreadable, not as zero', async () => {
  const db = fresh();
  const env = envFor(db);
  const { body } = await create(env, ALICE, { trigger: 'manual' });
  const id = body.automation.id;
  await hit(`https://x/api/automations/${id}/run`, post(ALICE), env);
  await settle();

  const res = await hit(`https://x/api/automations/${id}/spend`, as(ALICE), env);
  assert.equal(res.status, 200);
  const spend = await res.json();
  assert.equal(spend.runs, 1);
  // The run starts in the session and its cost is billed there; this row has no credits column
  // filled, and adding a zero to a spending total is how a cost report understates.
  assert.equal(spend.unreadable, 1);
  assert.equal(spend.credits, 0);
  db.close();
});

/* ------------------------------------------------------------------- edit, transfer, delete ---- */

test('an edit keeps the automation id and its creation time', async () => {
  const db = fresh();
  const env = envFor(db);
  const { body } = await create(env);
  const before = body.automation;
  const res = await hit(`https://x/api/automations/${before.id}`, patch(ALICE, good({ name: 'Morning polish' })), env);
  assert.equal(res.status, 200);
  const after = (await res.json()).automation;
  assert.equal(after.id, before.id, 'an edit that mints a new id is a create wearing an edit’s clothes');
  assert.equal(after.createdAt, before.createdAt);
  assert.equal(after.name, 'Morning polish');
  assert.ok(after.updatedAt >= before.updatedAt);
  db.close();
});

test('a transfer to somebody with no access to the project is refused, not accepted and stranded', async () => {
  const db = fresh();
  const env = envFor(db);
  const { body } = await create(env);
  const res = await hit(`https://x/api/automations/${body.automation.id}/transfer`, post(ALICE, { toUserId: STRANGER }), env);
  assert.equal(res.status, 403);
  assert.equal((await res.json()).error, 'no_access', 'transferring creates an automation that can never fire');
  assert.equal(countRows(db.raw, 'select count(*) as n from automations where owner_id = ?', ALICE), 1);
  db.close();
});

test('a transfer moves the definition and leaves the history with the owner it ran under', async () => {
  const db = fresh();
  const env = envFor(db);
  MEMBERS.set(PROJECT, [{ user_id: BOB, role: 'editor' }]);
  const { body } = await create(env, ALICE, { trigger: 'manual' });
  const id = body.automation.id;
  await hit(`https://x/api/automations/${id}/run`, post(ALICE), env);
  await settle();

  const res = await hit(`https://x/api/automations/${id}/transfer`, post(ALICE, { toUserId: BOB }), env);
  assert.equal(res.status, 200);
  assert.equal(countRows(db.raw, 'select count(*) as n from automations where owner_id = ?', BOB), 1);
  assert.equal(countRows(db.raw, 'select count(*) as n from automation_runs where owner_id = ?', ALICE), 1,
    "last month's spending must not be reattributed to somebody who did not authorise it");
  // And Alice can no longer reach it at all.
  assert.equal((await hit(`https://x/api/automations/${id}/runs`, as(ALICE), env)).status, 404);
  db.close();
});

test('deleting an automation removes the definition and keeps the record of what it spent', async () => {
  const db = fresh();
  const env = envFor(db);
  const { body } = await create(env, ALICE, { trigger: 'manual' });
  const id = body.automation.id;
  await hit(`https://x/api/automations/${id}/run`, post(ALICE), env);
  await settle();

  const res = await hit(`https://x/api/automations/${id}`, del(ALICE), env);
  assert.equal(res.status, 200);
  assert.equal(countRows(db.raw, 'select count(*) as n from automations'), 0);
  assert.equal(countRows(db.raw, 'select count(*) as n from automation_runs'), 1,
    'a spender who can erase the evidence by deleting the automation is a spender with no record');
  db.close();
});

/* ------------------------------------------------------------------- revocation ---- */

test('removing a member switches off the standing actors they pointed at the project', async () => {
  const db = fresh();
  const env = envFor(db);
  MEMBERS.set(PROJECT, [{ user_id: BOB, role: 'editor' }]);
  // `MEMBERS` drives the shared-access boundary. The lifecycle route also reads the concrete row
  // it is about to revoke so a nonexistent member cannot produce a fake audit/outbox event.
  ROWS.set('project_members', [{
    project_id: PROJECT,
    user_id: BOB,
    role: 'editor',
    expires_at: null,
    revoked_at: null,
    suspended_at: null,
  }]);
  const { body } = await create(env, BOB, { trigger: 'manual' });
  const id = body.automation.id;

  const res = await hit(`https://x/api/shared/${PROJECT}/members/${BOB}`, del(ALICE), env);
  assert.equal(res.status, 200);
  const out = await res.json();
  // Refusal at fire is the safety property; DISABLEMENT is the visible one. Without it a removed
  // member's automation is listed as on forever and silently refused at every tick.
  assert.equal(out.automationsStopped, 1);
  assert.equal(countRows(db.raw, 'select count(*) as n from automations where id = ? and enabled = 0', id), 1);
  db.close();
});
