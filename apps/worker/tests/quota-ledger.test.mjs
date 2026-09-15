/**
 * THE CREDIT LEDGER, AS A LIST OF TRANSACTIONS RATHER THAN A DAILY TOTAL.
 *
 * `GET /history` has always answered "how many credits on which day, and roughly what for". That is
 * the right shape for the user's own usage chart and the wrong shape for the only question an
 * operator is ever asked about credits: *what was this particular charge*. A customer writes in
 * saying they were billed twice for one build; a day total of 40 cannot tell you whether that was
 * one charge of 40, two of 20 a second apart, or forty of one across the afternoon. Those are three
 * different conversations and the product could not tell them apart from outside.
 *
 * So this is the row-level read, and the two properties that matter are not "it returns rows":
 *
 *   1. AN EMPTY LEDGER IS NOT A CLEAN ACCOUNT. The ledger is pruned at 35 days on every spend. A
 *      reader who gets `[]` back must be able to tell "this account has never spent" from "this
 *      account's spending is older than the window", and a route that answers both with an empty
 *      array is a failure to observe rendered as an observation. The response carries
 *      `retentionDays` and `truncated` so the caller can say which one it is looking at.
 *   2. A CAPPED READ SAYS IT WAS CAPPED. Asking for 2 rows of a 5-row ledger must not look like a
 *      2-row ledger.
 *
 * Run with:  node --test tests/quota-ledger.test.mjs      (from apps/worker)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const WORKER = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(mkdtempSync(join(tmpdir(), 'quota-ledger-')), 'quota.mjs');
execFileSync(join(WORKER, 'node_modules', '.bin', 'esbuild'),
  [join(WORKER, 'src', 'do', 'quota.ts'), '--bundle', '--format=esm', '--target=es2022',
   '--alias:cloudflare:workers=' + join(WORKER, 'tests', 'stubs', 'cloudflare-workers.mjs'),
   '--outfile=' + out], { cwd: WORKER, stdio: 'pipe' });
const { QuotaDO } = await import(`file://${out}`);

/**
 * The ledger table, modelled. Rows go in through the DO's own insert and come back out through the
 * DO's own selects — a fake that answered a constant would make every assertion below vacuous.
 */
function quota(seed = {}) {
  const store = new Map(Object.entries(seed));
  const rows = [];
  let nextId = 1;
  const sql = {
    exec(q, ...a) {
      const none = { toArray: () => [], one: () => null };
      if (/^\s*create table/i.test(q)) return none;
      if (/^\s*alter table/i.test(q)) return none;
      if (/insert into ledger/i.test(q)) {
        rows.push({ id: nextId++, day: a[0], kind: a[1], credits: a[2], created_at: a[3] });
        return none;
      }
      if (/delete from ledger where day </i.test(q)) {
        for (let i = rows.length - 1; i >= 0; i--) if (rows[i].day < a[0]) rows.splice(i, 1);
        return none;
      }
      if (/delete from ledger where day =/i.test(q)) {
        for (let i = rows.length - 1; i >= 0; i--) if (rows[i].day === a[0]) rows.splice(i, 1);
        return none;
      }
      if (/count\(\*\)\s+as n from ledger/i.test(q)) return { toArray: () => [{ n: rows.length }], one: () => ({ n: rows.length }) };
      if (/select id, day, kind, credits, created_at from ledger/i.test(q)) {
        const limit = Number(a[0]);
        const sorted = [...rows].sort((x, y) => y.created_at - x.created_at || y.id - x.id);
        return { toArray: () => sorted.slice(0, limit), one: () => sorted[0] ?? null };
      }
      if (/where day = \?/.test(q)) {
        return { one: () => ({ s: rows.filter((r) => r.day === a[0]).reduce((x, r) => x + r.credits, 0) }), toArray: () => [] };
      }
      if (/where day like \?/.test(q)) {
        const p = String(a[0]).replace('%', '');
        return { one: () => ({ s: rows.filter((r) => r.day.startsWith(p)).reduce((x, r) => x + r.credits, 0) }), toArray: () => [] };
      }
      if (/group by day/i.test(q)) return none;
      return { toArray: () => [], one: () => ({ s: 0 }) };
    },
  };
  const storage = {
    async get(k) { const v = store.get(k); return v === undefined ? undefined : structuredClone(v); },
    async put(a, b) {
      if (typeof a === 'object' && a !== null) for (const [k, v] of Object.entries(a)) store.set(k, structuredClone(v));
      else store.set(a, structuredClone(b));
    },
    async delete(k) { store.delete(k); },
    sql,
  };
  const o = new QuotaDO({ storage, blockConcurrencyWhile: (fn) => fn() }, {});
  const call = async (p, body, method = 'POST') =>
    (await o.fetch(new Request('https://do' + p, { method, ...(method === 'POST' ? { body: JSON.stringify(body ?? {}) } : {}) }))).json();
  return {
    call, rows,
    spend: (credits, kind = 'chat') => call('/spend', { credits, kind }),
    ledger: (qs = '') => call('/ledger' + qs, null, 'GET'),
  };
}

test('CONTROL: spending puts rows in the ledger table at all', async () => {
  // If this stops holding every assertion below passes over an empty table, which is the shape a
  // broken read has too.
  const q = quota();
  await q.spend(3, 'chat');
  await q.spend(4, 'build');
  assert.equal(q.rows.length, 2, 'the fixture must actually record spends');
});

test('THE LEDGER IS READABLE AS INDIVIDUAL CHARGES, not only as day totals', async () => {
  const q = quota();
  await q.spend(3, 'chat');
  await q.spend(4, 'build');
  const res = await q.ledger();
  assert.ok(Array.isArray(res.entries), 'the read must return a list of entries');
  assert.equal(res.entries.length, 2, 'one entry per charge');
  const kinds = res.entries.map((e) => e.kind).sort();
  assert.deepEqual(kinds, ['build', 'chat'], 'each entry names what it was spent on');
  for (const e of res.entries) {
    assert.equal(typeof e.credits, 'number', 'and how much');
    assert.equal(typeof e.at, 'number', 'and when, to the millisecond rather than to the day');
    assert.equal(typeof e.day, 'string', 'and which day it is billed under');
  }
});

test('the newest charge comes first — an investigation starts at the most recent one', async () => {
  const q = quota();
  await q.spend(1, 'first');
  await new Promise((r) => setTimeout(r, 2));
  await q.spend(1, 'second');
  const res = await q.ledger();
  assert.equal(res.entries[0].kind, 'second', 'newest first');
});

test('A CAPPED READ SAYS SO — 2 rows of 5 must not read as a 5-row account with 2 charges', async () => {
  const q = quota();
  for (let i = 0; i < 5; i++) await q.spend(1, `k${i}`);
  const res = await q.ledger('?limit=2');
  assert.equal(res.entries.length, 2, 'the cap is honoured');
  assert.equal(res.total, 5, 'and the true row count is reported beside it');
  assert.equal(res.truncated, true, 'a cut list must announce that it was cut');
});

test('an uncapped read over a short ledger is NOT marked truncated', async () => {
  const q = quota();
  await q.spend(1, 'chat');
  const res = await q.ledger();
  assert.equal(res.truncated, false, 'a complete list must not claim to be partial');
  assert.equal(res.total, 1);
});

test('AN EMPTY LEDGER STILL DECLARES ITS WINDOW — "no rows" is not "never spent"', async () => {
  // The discipline this repository is built on: a failure to observe must not render as an
  // observation. The ledger is pruned at 35 days, so an account that spent heavily in January and
  // nothing since answers this read exactly like an account that has never spent a credit. The
  // window has to travel with the answer or the reader cannot tell those apart.
  const q = quota();
  const res = await q.ledger();
  assert.deepEqual(res.entries, [], 'nothing spent, nothing listed');
  assert.equal(res.retentionDays, 35, 'and the age beyond which rows are deleted rides along');
});

test('an unreadable limit falls back to the default instead of returning everything', async () => {
  const q = quota();
  for (let i = 0; i < 3; i++) await q.spend(1, `k${i}`);
  const res = await q.ledger('?limit=not-a-number');
  assert.equal(res.entries.length, 3, 'a garbled limit must not lose rows');
  assert.equal(res.truncated, false);
});

test('the limit is bounded — a caller cannot ask for an unbounded read', async () => {
  const q = quota();
  await q.spend(1, 'chat');
  const res = await q.ledger('?limit=99999999');
  assert.ok(res.limit <= 500, `the cap must be bounded, got ${res.limit}`);
});
