/**
 * QuotaDO AS THE BILLING ADDRESS BOOK — and the one value it has to hand back.
 *
 * The record itself is small. What makes it worth executing rather than reasoning about is the
 * RETURN value of a save: the route that follows has to tell Stripe the difference between "this
 * person never set a name" and "this person removed the name they set", and those two are the same
 * `null` unless the store says what it is replacing. So `/billing-details` returns the PREVIOUS
 * record alongside the new one, and that is the property under test here.
 *
 * The sql fake models the tables the DO actually queries, for the reason billing-persistence.test
 * gives: a fake answering a constant makes every assertion pass against any implementation.
 *
 * Run with:  node --test tests/billing-details-store.test.mjs      (from apps/worker)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const WORKER = join(dirname(fileURLToPath(import.meta.url)), '..');
const TMP = mkdtempSync(join(tmpdir(), 'billing-details-do-'));
const out = join(TMP, 'quota.mjs');
execFileSync(join(WORKER, 'node_modules', '.bin', 'esbuild'),
  [join(WORKER, 'src', 'do', 'quota.ts'), '--bundle', '--format=esm', '--target=es2022',
   '--alias:cloudflare:workers=' + join(WORKER, 'tests', 'stubs', 'cloudflare-workers.mjs'),
   '--outfile=' + out], { cwd: WORKER, stdio: 'pipe' });
const { QuotaDO } = await import(`file://${out}`);

const NONE = { email: null, name: null, poNumber: null };

function quota(seed = {}) {
  const store = new Map(Object.entries(seed));
  const empty = { toArray: () => [], one: () => null };
  const sql = {
    exec(q) {
      if (/^\s*create table/i.test(q)) return empty;
      if (/^\s*alter table/i.test(q)) return empty;
      if (/from billing_events/i.test(q)) return empty;
      return { toArray: () => [], one: () => ({ s: 0 }) };
    },
  };
  const storage = {
    async get(k) { const v = store.get(k); return v === undefined ? undefined : structuredClone(v); },
    async put(a, b) { if (typeof a === 'object' && a !== null) for (const [k, v] of Object.entries(a)) store.set(k, structuredClone(v)); else store.set(a, structuredClone(b)); },
    async delete(k) { store.delete(k); }, sql,
  };
  const o = new QuotaDO({ storage, blockConcurrencyWhile: (fn) => fn() }, {});
  const raw = async (p, body, method = 'POST') =>
    o.fetch(new Request('https://do' + p, { method, ...(method === 'POST' ? { body: JSON.stringify(body ?? {}) } : {}) }));
  const call = async (...a) => (await raw(...a)).json();
  return {
    store, raw, call,
    get: () => call('/billing-details', null, 'GET'),
    put: (details) => call('/billing-details', { details }),
    billing: () => call('/billing', null, 'GET'),
  };
}

test('CONTROL: an account nobody has configured reads back as three absences', async () => {
  // Without this the "it was stored" assertions below could pass against a store that answers the
  // same object no matter what went in.
  const q = quota();
  assert.deepEqual((await q.get()).details, NONE);
});

test('what is written is what comes back, and only the three keys we asked for', async () => {
  const q = quota();
  await q.put({ email: 'finance@acme.test', name: 'Acme Ltd', poNumber: 'PO-4417' });
  const { details } = await q.get();
  assert.deepEqual(details, { email: 'finance@acme.test', name: 'Acme Ltd', poNumber: 'PO-4417' });
});

test('A FIELD SMUGGLED ALONGSIDE THE THREE IS NOT STORED', async () => {
  // This record is echoed back to a browser and used to build a request to Stripe. An allowlist is
  // what stops a caller adding `source` or `tax_exempt` and having it ride into either.
  const q = quota();
  await q.put({ email: 'a@b.test', tax_exempt: 'exempt', balance: -5000, poNumber: 'PO-1' });
  const { details } = await q.get();
  assert.deepEqual(Object.keys(details).sort(), ['email', 'name', 'poNumber']);
  assert.equal('tax_exempt' in details, false);
  assert.equal('balance' in details, false);
});

test('THE SAVE HANDS BACK WHAT IT REPLACED, which is the only way a clear is distinguishable', async () => {
  // The defect this closes lives one layer up: the Stripe update must send `name=` to erase a name
  // this product set, and must NOT send it for an account that never set one — otherwise the first
  // save wipes the name Checkout collected at purchase. Those two cases are the same `null` unless
  // the store says which one it is.
  const q = quota();
  const first = await q.put({ email: 'finance@acme.test', name: 'Acme Ltd', poNumber: 'PO-1' });
  assert.deepEqual(first.previous, NONE, 'the first save replaced nothing');
  assert.deepEqual(first.details, { email: 'finance@acme.test', name: 'Acme Ltd', poNumber: 'PO-1' });

  const second = await q.put({ email: 'finance@acme.test', name: null, poNumber: null });
  assert.deepEqual(second.previous, { email: 'finance@acme.test', name: 'Acme Ltd', poNumber: 'PO-1' },
    'the second save must report the values it is removing');
  assert.deepEqual(second.details, { email: 'finance@acme.test', name: null, poNumber: null });
});

test('a record that is not a record is refused with 400, not stored as junk', async () => {
  const q = quota();
  const bad = await q.raw('/billing-details', { details: { email: 'not-an-address' } });
  assert.equal(bad.status, 400);
  assert.match((await bad.json()).error, /email/i);
  assert.deepEqual((await q.get()).details, NONE, 'and nothing was written on the way to refusing');
});

test('a refused save does not disturb the record already there', async () => {
  const q = quota();
  await q.put({ email: 'finance@acme.test', name: 'Acme Ltd', poNumber: null });
  const bad = await q.raw('/billing-details', { details: { name: 'Acme\nLtd' } });
  assert.equal(bad.status, 400);
  assert.deepEqual((await q.get()).details, { email: 'finance@acme.test', name: 'Acme Ltd', poNumber: null });
});

test('the billing read carries the details, so one page load is one round trip', async () => {
  const q = quota();
  await q.put({ email: 'finance@acme.test', name: null, poNumber: 'PO-9' });
  const b = await q.billing();
  assert.deepEqual(b.details, { email: 'finance@acme.test', name: null, poNumber: 'PO-9' });
  assert.equal(b.plan, 'free', 'and it is still the same response it always was');
});
