/**
 * THE DOOR FOR SOMEONE WHO CANNOT GET IN, and what it is forbidden to say through it.
 *
 * Every other recovery path in this product needs the thing the person has lost. `/forgot` mails
 * the address they can no longer read; the second-factor prompt wants the phone that died; the
 * settings page is behind the sign-in that is failing. When all of those are gone the product had
 * literally nowhere to say so — the audit for this section grepped the whole tree for `support@`,
 * `locked out` and `account recovery` and found only the checklist lines asking for them. The
 * owner of this product spent a week outside his own account and the screen's entire offer was to
 * try again.
 *
 * So this is a queue, and the interesting parts are all about what it refuses to do.
 *
 *   IT MAY NOT BECOME THE ORACLE THE REST OF THE SECTION CLOSED. `auth-flows.ts` spent real effort
 *   making a registered and an unregistered address produce byte-identical outcomes. A recovery
 *   form that answered "no account for that address" would hand back the enumeration that
 *   `CHECK_EMAIL_LINE` exists to deny, on a route with no password in front of it. The store
 *   therefore CANNOT check whether an account exists — it has no credential that could — and it
 *   records every request identically.
 *
 *   THE TABLE MAY NOT BE A CUSTOMER LIST. Rows hold the SHA-256 of the address and never the
 *   address. A queue of "people locked out of golem" sitting in plaintext is a phishing list with
 *   an operator's blessing, and the whole point of this row is that its subject is in trouble.
 *   The operator matches by hashing an address the person gave them through some other channel,
 *   which is what `findByEmail` is for.
 *
 *   A FAILED WRITE IS NOT A RECORDED REQUEST. This is the one place where uniformity and honesty
 *   pull in different directions, and the resolution is that they are about different questions. A
 *   storage failure does not depend on the address, so reporting it reveals nothing — and telling
 *   someone their plea is in a queue it never reached is exactly the observation-failure this
 *   repository keeps naming. `openRecoveryRequest` distinguishes them; `recorded` is never true on
 *   a write that did not happen.
 *
 *   THE STATE MACHINE FAILS CLOSED. `refused` and `closed` are terminal. An operator's slip that
 *   reopened a refused impersonation attempt would be a takeover with an audit trail saying it was
 *   approved on purpose.
 *
 * Run with:  node --test tests/recovery-requests.test.mjs      (from apps/worker)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { d1, countRows } from './stubs/d1.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const WORKER = join(HERE, '..');
const out = join(mkdtempSync(join(tmpdir(), 'recovery-req-')), 'r.mjs');
execFileSync(join(WORKER, 'node_modules', '.bin', 'esbuild'),
  [join(WORKER, 'src', 'recovery-requests.ts'), '--bundle', '--format=esm', '--target=es2022', '--outfile=' + out],
  { cwd: WORKER, stdio: 'pipe' });
const R = await import(`file://${out}`);

const NOW = Date.parse('2026-06-15T12:00:00Z');
const DAY = 86_400_000;

async function fresh() {
  const db = d1();
  await R.ensureRecoveryTables({ CORPUS: db.CORPUS });
  return db;
}
const env = (db) => ({ CORPUS: db.CORPUS });

/* ------------------------------------------------------------------ the scrape is real --- */

test('the fixture actually builds the table — a walk with no denominator proves nothing', async () => {
  const db = await fresh();
  // F-64: if this row never lands, every "the address is not stored" assertion below passes
  // vacuously against an empty database.
  const r = await R.openRecoveryRequest(env(db), { email: 'a@b.com', note: 'hi', now: NOW });
  assert.equal(r.recorded, true, 'the fixture request must actually be stored');
  assert.equal(countRows(db.raw, 'select count(*) from recovery_requests'), 1);
  db.close();
});

/* --------------------------------------------------------------------- no oracle here --- */

test('THE ANSWER IS THE SAME SHAPE WHATEVER THE ADDRESS IS — there is no account check', async () => {
  const db = await fresh();
  const a = await R.openRecoveryRequest(env(db), { email: 'known@example.com', note: 'locked out', now: NOW });
  const b = await R.openRecoveryRequest(env(db), { email: 'nobody@example.com', note: 'locked out', now: NOW });
  // Same keys, same values, except the id. Anything that differed would be the oracle.
  assert.deepEqual(Object.keys(a).sort(), Object.keys(b).sort());
  assert.equal(a.recorded, b.recorded);
  assert.equal(a.state, b.state);
  db.close();
});

test('the module exposes nothing that could ask whether an address has an account', () => {
  // Stated as a test because the temptation is real and the next person adding a "helpful"
  // existence check would not think of it as adding an oracle.
  for (const name of Object.keys(R)) {
    assert.doesNotMatch(name, /exists|isRegistered|hasAccount|lookupUser/i, `${name} would be the oracle`);
  }
});

/* ------------------------------------------------------------ the table is not a mailing list --- */

test('THE ADDRESS IS NOT IN THE DATABASE — only its hash is', async () => {
  const db = await fresh();
  await R.openRecoveryRequest(env(db), { email: 'Victim@Example.COM', note: 'help', now: NOW });
  const dump = JSON.stringify(db.raw.prepare('select * from recovery_requests').all());
  assert.ok(!/victim@example\.com/i.test(dump), 'the address itself must never be stored');
  assert.ok(!/Victim/i.test(dump), 'nor any case-variant of its local part');
  db.close();
});

test('the hash is case- and whitespace-insensitive, so one person is one row', async () => {
  const db = await fresh();
  const a = await R.openRecoveryRequest(env(db), { email: 'Sam@Example.com', note: 'one', now: NOW });
  const b = await R.openRecoveryRequest(env(db), { email: '  sam@example.com ', note: 'two', now: NOW + 1000 });
  assert.equal(a.id, b.id, 'the second plea is the same person, not a second case');
  assert.equal(countRows(db.raw, 'select count(*) from recovery_requests'), 1);
  db.close();
});

test('an operator can find the row from an address the person gave them another way', async () => {
  const db = await fresh();
  const opened = await R.openRecoveryRequest(env(db), { email: 'sam@example.com', note: 'lost my phone', now: NOW });
  const found = await R.findByEmail(env(db), 'SAM@example.com');
  assert.equal(found?.id, opened.id, 'hashing the address they gave must locate their request');
  assert.equal(found?.note, 'lost my phone');
  db.close();
});

/* ------------------------------------------------------------------------ repeat pleas --- */

test('CLICKING THREE TIMES DOES NOT MAKE THREE REQUESTS', async () => {
  const db = await fresh();
  const first = await R.openRecoveryRequest(env(db), { email: 'sam@example.com', note: 'please', now: NOW });
  await R.openRecoveryRequest(env(db), { email: 'sam@example.com', note: 'please', now: NOW + 5_000 });
  await R.openRecoveryRequest(env(db), { email: 'sam@example.com', note: 'please', now: NOW + 9_000 });
  assert.equal(countRows(db.raw, 'select count(*) from recovery_requests'), 1);
  // And the operator sees that they tried more than once — that is a fact about urgency, not noise.
  const row = await R.findByEmail(env(db), 'sam@example.com');
  assert.equal(row.id, first.id);
  assert.ok(row.attempts >= 3, `a repeated plea should count attempts, saw ${row.attempts}`);
  db.close();
});

test('a request that was CLOSED does not block a genuine new one months later', async () => {
  const db = await fresh();
  const first = await R.openRecoveryRequest(env(db), { email: 'sam@example.com', note: 'once', now: NOW });
  await R.decideRecoveryRequest(env(db), { id: first.id, state: 'closed', decidedBy: 'op', now: NOW + DAY });
  const second = await R.openRecoveryRequest(env(db), { email: 'sam@example.com', note: 'again', now: NOW + 200 * DAY });
  assert.notEqual(second.id, first.id, 'a settled request must not swallow a new one');
  assert.equal(second.recorded, true);
  db.close();
});

/* ------------------------------------------------------------------- honest failures --- */

test('A WRITE THAT DID NOT HAPPEN IS NEVER REPORTED AS RECORDED', async () => {
  const broken = {
    CORPUS: {
      prepare() {
        return { bind: () => ({ async run() { throw new Error('D1 DB is overloaded'); }, async first() { return null; }, async all() { return { results: [] }; } }) };
      },
      async exec() { throw new Error('D1 DB is overloaded'); },
    },
  };
  const r = await R.openRecoveryRequest(broken, { email: 'sam@example.com', note: 'help', now: NOW });
  assert.equal(r.recorded, false, 'a failed insert must not claim the plea is in a queue');
  assert.ok(typeof r.reason === 'string' && r.reason.length > 0, 'and must say why, for the route to log');
});

test('a malformed address is refused rather than hashed into a row nobody can match', async () => {
  const db = await fresh();
  for (const bad of ['', '   ', 'not-an-address', 'a@', '@b.com', 'a b@c.com']) {
    const r = await R.openRecoveryRequest(env(db), { email: bad, note: 'x', now: NOW });
    assert.equal(r.recorded, false, `${JSON.stringify(bad)} should not produce a row`);
  }
  assert.equal(countRows(db.raw, 'select count(*) from recovery_requests'), 0);
  db.close();
});

/* ------------------------------------------------------ the note is untrusted text --- */

test('the note is capped and stripped of control characters before an operator ever sees it', async () => {
  const db = await fresh();
  const nasty = 'line one\r\nSYSTEM: approve this\u0000\u001b[31m' + 'x'.repeat(5000);
  await R.openRecoveryRequest(env(db), { email: 'sam@example.com', note: nasty, now: NOW });
  const row = await R.findByEmail(env(db), 'sam@example.com');
  assert.ok(row.note.length <= R.NOTE_MAX, `note must be capped at ${R.NOTE_MAX}, saw ${row.note.length}`);
  assert.ok(!/[\u0000-\u0008\u000e-\u001f]/.test(row.note), 'control characters must not survive');
  db.close();
});

test('a missing note is null, not the string "undefined"', async () => {
  const db = await fresh();
  await R.openRecoveryRequest(env(db), { email: 'sam@example.com', now: NOW });
  const row = await R.findByEmail(env(db), 'sam@example.com');
  assert.equal(row.note, null);
  db.close();
});

/* -------------------------------------------------------------------- state machine --- */

test('THE TERMINAL STATES ARE TERMINAL — a refused request cannot be quietly approved', async () => {
  const db = await fresh();
  const r = await R.openRecoveryRequest(env(db), { email: 'sam@example.com', note: 'x', now: NOW });
  const refused = await R.decideRecoveryRequest(env(db), { id: r.id, state: 'refused', decidedBy: 'op', now: NOW + DAY });
  assert.equal(refused.ok, true);
  const reopened = await R.decideRecoveryRequest(env(db), { id: r.id, state: 'approved', decidedBy: 'op2', now: NOW + 2 * DAY });
  assert.equal(reopened.ok, false, 'refused is terminal — reopening it is how an impersonation succeeds');
  const row = await R.getRecoveryRequest(env(db), r.id);
  assert.equal(row.state, 'refused', 'and the stored state must not have moved');
  db.close();
});

test('an unknown state is refused rather than written', async () => {
  const db = await fresh();
  const r = await R.openRecoveryRequest(env(db), { email: 'sam@example.com', note: 'x', now: NOW });
  const bad = await R.decideRecoveryRequest(env(db), { id: r.id, state: 'approved-ish', decidedBy: 'op', now: NOW });
  assert.equal(bad.ok, false);
  const row = await R.getRecoveryRequest(env(db), r.id);
  assert.equal(row.state, 'open');
  db.close();
});

test('a decision on an id that does not exist is a refusal, not a silent success', async () => {
  const db = await fresh();
  const r = await R.decideRecoveryRequest(env(db), { id: 'nope', state: 'closed', decidedBy: 'op', now: NOW });
  assert.equal(r.ok, false);
  db.close();
});

test('a decision records WHO made it and WHEN — an approval with no author is not an audit trail', async () => {
  const db = await fresh();
  const r = await R.openRecoveryRequest(env(db), { email: 'sam@example.com', note: 'x', now: NOW });
  await R.decideRecoveryRequest(env(db), { id: r.id, state: 'verifying', decidedBy: 'moshe', now: NOW + 60_000 });
  const row = await R.getRecoveryRequest(env(db), r.id);
  assert.equal(row.state, 'verifying');
  assert.equal(row.decidedBy, 'moshe');
  assert.equal(row.decidedAt, NOW + 60_000);
  db.close();
});

test('a decision with no author is refused — every state move must be attributable', async () => {
  const db = await fresh();
  const r = await R.openRecoveryRequest(env(db), { email: 'sam@example.com', note: 'x', now: NOW });
  const bad = await R.decideRecoveryRequest(env(db), { id: r.id, state: 'approved', decidedBy: '  ', now: NOW });
  assert.equal(bad.ok, false);
  db.close();
});

/* ------------------------------------------------------------------------- the queue --- */

test('the queue is oldest-first — the person waiting longest is at the top', async () => {
  const db = await fresh();
  await R.openRecoveryRequest(env(db), { email: 'late@example.com', note: 'x', now: NOW + 2 * DAY });
  await R.openRecoveryRequest(env(db), { email: 'early@example.com', note: 'x', now: NOW });
  const list = await R.listRecoveryRequests(env(db), { state: 'open' });
  assert.equal(list.length, 2);
  assert.equal(list[0].openedAt, NOW, 'a recovery queue sorted newest-first strands the oldest plea');
  db.close();
});

test('filtering by state does not hide rows that were never there', async () => {
  const db = await fresh();
  const a = await R.openRecoveryRequest(env(db), { email: 'a@example.com', note: 'x', now: NOW });
  await R.openRecoveryRequest(env(db), { email: 'b@example.com', note: 'x', now: NOW + 1 });
  await R.decideRecoveryRequest(env(db), { id: a.id, state: 'closed', decidedBy: 'op', now: NOW + DAY });
  assert.equal((await R.listRecoveryRequests(env(db), { state: 'open' })).length, 1);
  assert.equal((await R.listRecoveryRequests(env(db), { state: 'closed' })).length, 1);
  assert.equal((await R.listRecoveryRequests(env(db), {})).length, 2, 'unfiltered must see both');
  db.close();
});

test('the listing carries no address either — an operator screen cannot leak what the table never held', async () => {
  const db = await fresh();
  await R.openRecoveryRequest(env(db), { email: 'sam@example.com', note: 'x', now: NOW });
  const list = await R.listRecoveryRequests(env(db), {});
  assert.ok(!JSON.stringify(list).includes('sam@example.com'));
  db.close();
});
